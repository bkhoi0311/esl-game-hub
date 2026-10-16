// Kiểm thử trình duyệt cho public/board/ ("Bảng nhiều người viết").
// Chạy: npm run test:board   (lọc: node tests/board.mjs P3 P4)   Ảnh: SHOT_DIR=... node tests/board.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { genSamples, CLIPS, alphaFromRGBA, lineMetrics, arcMetrics, changedFraction } from './ink-metrics.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5196;
const BASE = `http://127.0.0.1:${PORT}/board/`;
const SHOT_DIR = process.env.SHOT_DIR || path.join(ROOT, 'screenshots');
mkdirSync(SHOT_DIR, { recursive: true });
const ONLY = process.argv.slice(2);
const DISCLAIMER = 'Công cụ bổ trợ, không phải tính năng chính thức của ClassIn';

// ---------- hạ tầng ----------
function waitPort(port, tries = 60) {
  return new Promise((resolve, reject) => {
    const tryOnce = (n) => {
      const s = net.connect(port, '127.0.0.1');
      s.on('connect', () => { s.destroy(); resolve(); });
      s.on('error', () => { s.destroy(); n <= 0 ? reject(new Error('server không mở')) : setTimeout(() => tryOnce(n - 1), 100); });
    };
    tryOnce(tries);
  });
}
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', path.join(ROOT, 'public')], { stdio: 'ignore' });
let browser;
async function launch(args) {
  const o = args ? { args } : {};
  try { return await chromium.launch(o); } catch (e) { return await chromium.launch({ channel: 'chrome', ...o }); }
}

const results = [];
const tests = [];
const t = (id, fn) => tests.push({ id, fn });
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || 'eq'}: nhận ${JSON.stringify(a)}, cần ${JSON.stringify(b)}`); };
const ok = (c, msg) => { if (!c) throw new Error(msg || 'ok'); };

async function open({ zones = 2, w = 1280, h = 720, dpr = 1, query = '', init, touch = true, ua, br } = {}) {
  const ctx = await (br || browser).newContext({ viewport: { width: w, height: h }, hasTouch: touch, deviceScaleFactor: dpr, ...(ua ? { userAgent: ua } : {}) });
  const page = await ctx.newPage();
  const log = { errors: [], requests: [], dialogs: [], responses: [] };
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push('console: ' + m.text()); });
  page.on('request', (r) => log.requests.push(r.url()));
  page.on('response', (r) => log.responses.push(r.headers()['content-security-policy'] || ''));
  page.on('dialog', async (d) => { log.dialogs.push(d.type()); await d.dismiss(); });
  if (init) await page.addInitScript(init);
  // python http.server đôi khi reset kết nối khi nhiều module nạp cùng lúc: thử lại tới 3 lần
  for (let i = 0; i < 3; i++) {
    await page.goto(`${BASE}?test=1&zones=${zones}${query ? '&' + query : ''}`);
    try { await page.waitForFunction(() => window.__board, null, { timeout: 4000 }); break; }
    catch (e) { if (i === 2) throw e; log.errors.length = 0; log.requests.length = 0; }
  }
  await page.evaluate(() => window.__board.ready);
  const cdp = await ctx.newCDPSession(page);
  const api = {
    ctx, page, cdp, log,
    state: () => page.evaluate(() => window.__board.state()),
    flush: () => page.evaluate(() => window.__board.flush()),
    ink: (id) => page.evaluate((i) => window.__board.inkPixels(i), id),
    shot: (name) => page.screenshot({ path: path.join(SHOT_DIR, `board-${name}.png`) }),
    close: () => ctx.close(),
    id: (testid) => page.locator(`[data-testid="${testid}"]`),
    // chạm nhiều ngón bằng CDP. fingers: [[ [x,y], [x,y] ], ...] (điểm đầu và điểm cuối mỗi ngón)
    async multiTouch(fingers, steps = 30, pause = 6) {
      const pts = (f) => fingers.map((p, i) => ({ x: p[0][0] + (p[1][0] - p[0][0]) * f, y: p[0][1] + (p[1][1] - p[0][1]) * f, id: i + 1 }));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(0) });
      for (let i = 1; i <= steps; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(i / steps) });
        if (pause) await page.waitForTimeout(pause);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await api.flush();
    },
    // pointer giả
    async fire(type, o) {
      await page.evaluate(([type, o]) => {
        const el = document.getElementById('input-layer');
        el.dispatchEvent(new PointerEvent(type, Object.assign({ pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 200, pressure: 0.5, width: 1, height: 1, buttons: 1, bubbles: true, cancelable: true, isPrimary: true }, o)));
      }, [type, o]);
    },
    // vẽ một nét bằng pointer giả: từ [x0,y0] tới [x1,y1]
    async drawFake(id, type, from, to, extra = {}, steps = 12) {
      await api.fire('pointerdown', { pointerId: id, pointerType: type, clientX: from[0], clientY: from[1], ...extra });
      for (let i = 1; i <= steps; i++) {
        await api.fire('pointermove', { pointerId: id, pointerType: type, clientX: from[0] + (to[0] - from[0]) * i / steps, clientY: from[1] + (to[1] - from[1]) * i / steps, ...extra });
      }
      await api.fire('pointerup', { pointerId: id, pointerType: type, clientX: to[0], clientY: to[1], buttons: 0, ...extra, });
      await api.flush();
    },
    async mouseStroke(from, to, steps = 15) {
      await page.mouse.move(from[0], from[1]);
      await page.mouse.down();
      for (let i = 1; i <= steps; i++) await page.mouse.move(from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps);
      await page.mouse.up();
      await api.flush();
    },
  };
  return api;
}
const zoneCenter = (s, id) => { const r = s.zones[id - 1].rect; return [r.x + r.w / 2, r.y + r.h / 2]; };
// đoạn nét ngang trong vùng, ở giữa chiều cao, độ dài ~40% bề rộng vùng
const zoneLine = (s, id, dy = 0) => { const r = s.zones[id - 1].rect; const y = r.y + r.h * 0.4 + dy; return [[r.x + r.w * 0.2, y], [r.x + r.w * 0.6, y + 30]]; };

export { t, eq, ok, open, zoneCenter, zoneLine, DISCLAIMER, BASE };

// ================= STEP 1 =================
t('P1', async () => {
  const b = await open({ zones: 2 });
  await b.page.waitForTimeout(300);
  eq(b.log.errors.length, 0, 'lỗi console: ' + b.log.errors.join(' | '));
  eq(b.log.dialogs.length, 0, 'có dialog');
  ok(b.log.requests.every((u) => u.startsWith('http://127.0.0.1:' + PORT)), 'có request ra ngoài: ' + b.log.requests.join(','));
  const csp = await b.page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
  ok(csp && csp.includes("connect-src 'none'"), 'thiếu CSP');
  await b.close();
});

t('P3', async () => {
  const b = await open({ zones: 4 });
  const s = await b.state();
  const fingers = [1, 2, 3, 4].map((i) => zoneLine(s, i));
  await b.multiTouch(fingers);
  const s2 = await b.state();
  for (let i = 1; i <= 4; i++) { eq(s2.zones[i - 1].strokeCount, 1, 'vùng ' + i + ' số nét'); ok((await b.ink(i)) > 0, 'vùng ' + i + ' inkPixels'); }
  eq(s2.maxSimul, 4, 'maxSimul');
  // HUD sau P3 (P17)
  await b.page.evaluate(() => document.querySelector('[data-testid="brand-label"]'));
  await b.close();
});

t('P4', async () => {
  const b = await open({ zones: 2 });
  const s = await b.state();
  const l1 = zoneLine(s, 1), l2 = zoneLine(s, 1, 120);
  await b.multiTouch([l1, l2]);
  eq((await b.state()).zones[0].strokeCount, 2, 'hai ngón cùng vùng');
  await b.close();
});

t('P5', async () => {
  const b = await open({ zones: 2 });
  const s = await b.state();
  const r1 = s.zones[0].rect, r2 = s.zones[1].rect;
  const y = r1.y + r1.h / 2;
  await b.multiTouch([[[r1.x + r1.w - 80, y], [r2.x + 200, y + 20]]]);
  const s2 = await b.state();
  eq(s2.zones[0].strokeCount, 1, 'vùng 1 có nét');
  eq(s2.zones[1].strokeCount, 0, 'vùng 2 không có nét');
  eq(await b.ink(2), 0, 'vùng 2 inkPixels');
  ok((await b.ink(1)) > 0, 'vùng 1 inkPixels');
  await b.close();
});

t('P16', async () => {
  let b = await open({ zones: 2 });
  const label = b.id('brand-label');
  for (let i = 0; i < 4; i++) await label.click();
  eq((await b.state()).hudOpen, false, '4 lần không mở');
  await label.click();
  eq((await b.state()).hudOpen, true, '5 lần mở');
  await b.close();
  b = await open({ zones: 2, query: 'debug=1' });
  eq((await b.state()).hudOpen, true, 'debug=1');
  await b.close();
});

// ================= STEP 2 =================
const inside = (bb, r, tol = 1) => bb.x >= r.x - tol && bb.y >= r.y - tol && bb.x + bb.width <= r.x + r.w + tol && bb.y + bb.height <= r.y + r.h + tol;

t('P9', async () => {
  const b = await open({ zones: 2 });
  let s = await b.state();
  await b.mouseStroke(...zoneLine(s, 1));
  await b.mouseStroke(...zoneLine(s, 2));
  s = await b.state();
  eq(s.zones[0].strokeCount, 1); eq(s.zones[1].strokeCount, 1);
  await b.id('z1-undo').click();
  await b.flush();
  s = await b.state();
  eq(s.zones[0].strokeCount, 0, 'vùng 1 sau hoàn tác');
  eq(s.zones[1].strokeCount, 1, 'vùng 2 giữ nguyên');
  eq(await b.ink(1), 0, 'vùng 1 sạch');
  ok((await b.ink(2)) > 0, 'vùng 2 còn nét');
  await b.close();
});

t('P15', async () => {
  const b = await open({ zones: 4 });
  let s = await b.state();
  await b.multiTouch([1, 2, 3, 4].map((i) => zoneLine(s, i)));
  for (const [w, h] of [[1920, 1080], [960, 540], [720, 1280], [1280, 720]]) {
    await b.page.setViewportSize({ width: w, height: h });
    await b.page.waitForTimeout(150);
    await b.flush();
    s = await b.state();
    eq(s.zones.reduce((a, z) => a + z.strokeCount, 0), 4, `số nét ở ${w}x${h}`);
    for (const z of s.zones) {
      ok((await b.ink(z.id)) > 0, `inkPixels vùng ${z.id} ở ${w}x${h}`);
      const bb = await b.id(`z${z.id}-dock`).boundingBox();
      ok(inside(bb, z.rect), `dock vùng ${z.id} trong vùng ở ${w}x${h}: ${JSON.stringify(bb)} / ${JSON.stringify(z.rect)}`);
    }
    const sc = await b.page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth, document.documentElement.scrollHeight, document.documentElement.clientHeight]);
    eq(sc[0], sc[1], `thanh cuộn ngang ${w}x${h}`); eq(sc[2], sc[3], `thanh cuộn dọc ${w}x${h}`);
  }
  await b.close();
});

t('P24', async () => {
  const b = await open({ zones: 4 });
  let s = await b.state();
  await b.mouseStroke(...zoneLine(s, 3));
  await b.mouseStroke(...zoneLine(s, 1));
  await b.mouseStroke(...zoneLine(s, 3, 60));
  s = await b.state();
  eq(s.zones[2].strokeCount, 2);
  await b.page.keyboard.press('Control+z');
  await b.flush();
  s = await b.state();
  eq(s.zones[2].strokeCount, 1, 'vùng 3 giảm 1 nét');
  eq(s.zones[0].strokeCount, 1, 'vùng 1 giữ');
  await b.close();
});

// Ảnh nét mượt ở 1280x720 và 1920x1080
t('SHOT2', async () => {
  for (const [w, h, dpr] of [[1280, 720, 2], [1920, 1080, 1]]) {
    const b = await open({ zones: 2, w, h, dpr });
    const s = await b.state();
    for (const id of [1, 2]) {
      const r = s.zones[id - 1].rect;
      await b.page.mouse.move(r.x + r.w * 0.15, r.y + r.h * 0.5);
      await b.page.mouse.down();
      for (let i = 0; i <= 80; i++) {
        const a = i / 80;
        await b.page.mouse.move(r.x + r.w * (0.15 + 0.7 * a), r.y + r.h * (0.5 + 0.25 * Math.sin(a * 6.28 + id)));
      }
      await b.page.mouse.up();
    }
    await b.flush();
    await b.shot(`step2-${w}x${h}`);
    await b.close();
  }
});

// ================= STEP 3 =================
const bg = (b, tid) => b.id(tid).evaluate((e) => getComputedStyle(e).backgroundColor);

t('P2', async () => {
  for (const n of [1, 2, 3, 4]) {
    const b = await open({ zones: n, touch: false });
    const s = await b.state();
    eq(s.zones.length, n, 'số vùng');
    for (const z of s.zones) {
      const dock = await b.id(`z${z.id}-dock`).boundingBox();
      ok(inside(dock, z.rect), `dock vùng ${z.id}/${n} trong vùng`);
      for (const k of ['pen', 'eraser', 'undo', 'clear']) {
        const bb = await b.id(`z${z.id}-${k}`).boundingBox();
        ok(bb.width >= 44 && bb.height >= 44, `nút ${k} vùng ${z.id}: ${bb.width}x${bb.height}`);
      }
    }
    await b.shot(`step3-${n}vung-1280x720`);
    await b.close();
  }
  let b = await open({ zones: 4, w: 960, h: 540, touch: false });
  let s = await b.state();
  for (const z of s.zones) {
    ok(inside(await b.id(`z${z.id}-dock`).boundingBox(), z.rect), 'dock 960 vùng ' + z.id);
    for (const k of ['pen', 'eraser', 'undo', 'clear']) { const bb = await b.id(`z${z.id}-${k}`).boundingBox(); ok(bb.width >= 44 && bb.height >= 44, 'nút 960'); }
  }
  await b.shot('step3-4vung-960x540'); await b.close();
  b = await open({ zones: 4, w: 720, h: 1280, touch: false });
  s = await b.state();
  for (const z of s.zones) ok(inside(await b.id(`z${z.id}-dock`).boundingBox(), z.rect), 'dock dọc vùng ' + z.id);
  await b.shot('step3-4vung-720x1280'); await b.close();
  // dạng rộng: 1 vùng
  b = await open({ zones: 1, w: 1920, h: 1080, touch: false });
  s = await b.state();
  ok(await b.id('z1-color-red').isVisible(), 'dock rộng có chấm màu');
  ok(inside(await b.id('z1-dock').boundingBox(), s.zones[0].rect), 'dock rộng trong vùng');
  await b.shot('step3-1vung-1920x1080'); await b.close();
});

t('P10', async () => {
  const b = await open({ zones: 2, touch: false });
  let s = await b.state();
  const [a, c] = zoneLine(s, 1);
  await b.mouseStroke(a, c);
  eq((await b.state()).zones[0].strokeCount, 1);
  await b.id('z1-eraser').click();
  const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
  await b.mouseStroke([mx, my - 60], [mx, my + 60]);
  s = await b.state();
  eq(s.zones[0].strokeCount, 0, 'tẩy xoá nét');
  eq(await b.ink(1), 0, 'ink sạch');
  await b.id('z1-undo').click(); await b.flush();
  eq((await b.state()).zones[0].strokeCount, 1, 'hoàn tác tẩy');
  ok((await b.ink(1)) > 0);
  await b.close();
});

t('P11', async () => {
  const b = await open({ zones: 2, touch: false });
  const s = await b.state();
  await b.mouseStroke(...zoneLine(s, 2));
  await b.id('z2-clear').click(); await b.flush();
  eq((await b.state()).zones[1].strokeCount, 0);
  const tx = await b.id('toast').innerText();
  ok(tx.includes('Đã xoá vùng 2. Bấm Hoàn tác để lấy lại.'), 'toast: ' + tx);
  await b.id('z2-undo').click(); await b.flush();
  eq((await b.state()).zones[1].strokeCount, 1);
  // hoàn tác khi rỗng
  await b.id('z1-undo').click({ force: true });
  ok((await b.id('toast').innerText()).includes('Vùng 1 không còn gì để hoàn tác.'));
  await b.close();
});

t('P12', async () => {
  const b = await open({ zones: 2, touch: false });
  const s = await b.state();
  await b.mouseStroke(...zoneLine(s, 1)); await b.mouseStroke(...zoneLine(s, 2));
  await b.id('clear-all').click();
  ok(await b.id('dialog').isVisible(), 'hộp thoại hiện');
  ok((await b.id('dialog').innerText()).includes('Xoá hết bảng?'));
  await b.id('dialog-cancel').click();
  eq(await b.id('dialog').count(), 0, 'hộp thoại đóng');
  let st = await b.state();
  eq(st.zones[0].strokeCount + st.zones[1].strokeCount, 2, 'huỷ giữ nét');
  await b.id('clear-all').click();
  await b.id('dialog-ok').click(); await b.flush();
  st = await b.state();
  eq(st.zones[0].strokeCount + st.zones[1].strokeCount, 0, 'xoá hết');
  await b.id('z1-undo').click(); await b.flush();
  eq((await b.state()).zones[0].strokeCount, 1, 'hoàn tác từng vùng');
  eq(b.log.dialogs.length, 0, 'không dùng dialog hệ thống');
  await b.close();
});

t('P13', async () => {
  const b = await open({ zones: 2, touch: false, query: 'foo=bar' });
  const s = await b.state();
  await b.mouseStroke(...zoneLine(s, 1));
  await b.id('zones-4').click();
  ok(await b.id('dialog').isVisible());
  await b.id('dialog-cancel').click();
  eq((await b.state()).zones.length, 2, 'huỷ giữ 2 vùng');
  eq((await b.state()).zones[0].strokeCount, 1);
  await b.id('zones-4').click();
  await b.id('dialog-ok').click(); await b.flush();
  const st = await b.state();
  eq(st.zones.length, 4);
  ok(st.zones.every((z) => z.strokeCount === 0), 'trống');
  const url = b.page.url();
  ok(url.includes('zones=4') && url.includes('foo=bar') && url.includes('test=1'), 'URL: ' + url);
  // đổi khi trống: không hỏi
  await b.id('zones-3').click();
  eq(await b.id('dialog').count(), 0, 'không hỏi khi trống');
  eq((await b.state()).zones.length, 3);
  await b.close();
});

t('P14', async () => {
  const b = await open({ zones: 2, touch: false });
  await b.id('z1-pen').click();
  ok(await b.id('z1-tray').isVisible(), 'khay mở');
  await b.page.waitForTimeout(260);
  await b.shot('step3-tray-open');
  await b.id('z1-color-red').click();
  eq(await b.id('z1-tray').isVisible(), false, 'khay đóng sau chọn màu');
  await b.id('z1-pen').click();
  await b.id('z1-size-20').click();
  const st = await b.state();
  eq(st.zones[0].color, '#FF4D4F'); eq(st.zones[0].size, 20); eq(st.zones[0].tool, 'pen');
  // chạm vùng khi khay mở: không vẽ, khay đóng
  await b.id('z1-pen').click();
  ok(await b.id('z1-tray').isVisible());
  await b.mouseStroke(...zoneLine(st, 1));
  eq((await b.state()).zones[0].strokeCount, 0, 'chạm đóng khay không vẽ');
  eq(await b.id('z1-tray').isVisible(), false);
  await b.mouseStroke(...zoneLine(st, 1));
  const last = await b.page.evaluate(() => window.__board.lastStroke(1));
  eq(last.color, '#FF4D4F'); eq(last.size, 20);
  // Esc đóng khay
  await b.id('z2-pen').click();
  await b.page.keyboard.press('Escape');
  eq(await b.id('z2-tray').isVisible(), false, 'Esc đóng khay');
  // bấm Tẩy rồi Bút trở lại
  await b.id('z2-eraser').click();
  eq((await b.state()).zones[1].tool, 'eraser');
  await b.id('z2-pen').click();
  eq((await b.state()).zones[1].tool, 'pen');
  eq(await b.id('z2-tray').isVisible(), false, 'bấm Bút khi đang Tẩy không mở khay');
  await b.close();
});

t('P23', async () => {
  const b = await open({ zones: 2, touch: false });
  const fs = b.id('fullscreen');
  if (await fs.isVisible()) {
    await fs.click();
    await b.page.waitForTimeout(400);
    const inFs = await b.page.evaluate(() => !!document.fullscreenElement);
    if (!inFs) ok((await b.id('toast').innerText()).includes('Cửa sổ này không cho toàn màn hình.'), 'toast từ chối');
  }
  eq(b.log.errors.length, 0, b.log.errors.join('|'));
  await b.close();
});

t('P27', async () => {
  const combos = [[1280, 720], [960, 540], [720, 1280]];
  for (const q of ['', 'brand=text', 'brand=neutral']) {
    for (const [w, h] of combos) {
      const b = await open({ zones: 2, w, h, query: q, touch: false });
      const r = await b.id('brand-disclaimer').evaluate((e) => { const bb = e.getBoundingClientRect(); return { text: e.textContent, sw: e.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight, x: bb.x, y: bb.y, r: bb.right, b: bb.bottom, vis: bb.width > 0 && getComputedStyle(e).visibility !== 'hidden' }; });
      const tag = `${q || 'mặc định'} ${w}x${h}`;
      ok(r.vis, 'hiển thị ' + tag); eq(r.text, DISCLAIMER, 'chữ ' + tag);
      ok(r.sw <= r.cw && r.sh <= r.ch, 'bị cắt ' + tag + JSON.stringify(r));
      ok(r.x >= 0 && r.y >= 0 && r.r <= w && r.b <= h, 'ngoài khung nhìn ' + tag);
      // thanh trên không tràn
      const ov = await b.id('info').evaluate((e) => e.getBoundingClientRect().right);
      ok(ov <= w, 'nút Thông tin tràn ' + tag);
      if (w === 1280) await b.shot('step3-bar-' + (q.replace('brand=', '') || 'mac-dinh'));
      if (w === 720) await b.shot('step3-bar-720-' + (q.replace('brand=', '') || 'mac-dinh'));
      await b.close();
    }
  }
});

t('P28', async () => {
  let b = await open({ zones: 2, touch: false });
  let r = await b.id('brand-logo').evaluate((e) => ({ nw: e.naturalWidth, h: e.getBoundingClientRect().height, f: getComputedStyle(e).filter, alt: e.alt }));
  const s = (await b.state()).s;
  eq(r.nw, 887, 'naturalWidth'); ok(Math.abs(r.h - 22 * s) <= 1, 'cao ' + r.h + ' vs ' + 22 * s);
  ok(r.f.includes('invert(1)'), 'filter ' + r.f); eq(r.alt, 'ClassIn');
  await b.close();
  b = await open({ zones: 2, touch: false, query: 'brand=text' });
  eq(await b.id('brand-logo').count(), 0, 'không có <img>');
  eq(await b.id('brand-wordmark').innerText(), 'ClassIn');
  eq(await b.page.locator('#topbar img').count(), 0);
  await b.close();
});

t('P30', async () => {
  const b = await open({ zones: 2, touch: false });
  eq(await bg(b, 'z1-pen'), 'rgb(4, 188, 9)', 'nút Bút đang chọn');
  eq(await bg(b, 'zones-2'), 'rgb(4, 188, 9)', 'số vùng đang chọn');
  await b.id('z1-pen').hover();
  await b.page.waitForTimeout(300);
  eq(await bg(b, 'z1-pen'), 'rgb(14, 229, 22)', 'hover Bút');
  await b.id('zones-2').hover();
  await b.page.waitForTimeout(300);
  eq(await bg(b, 'zones-2'), 'rgb(14, 229, 22)', 'hover số vùng');
  await b.close();
});

// ================= STEP 4 =================
// Một giao diện duy nhất, không kính (PLAN-INK 1.1): thanh trên / dock nền đặc, không backdrop-filter, không #ink/#live.
const paneInfo = (b) => b.page.evaluate(() => {
  const bar = document.getElementById('topbar');
  const dock = document.querySelector('[data-testid="z1-dock"]');
  const cs = (e) => getComputedStyle(e);
  const bf = (e) => cs(e).backdropFilter || cs(e).webkitBackdropFilter || 'none';
  return { barBf: bf(bar), dockBf: bf(dock), barBgImg: cs(bar).backgroundImage, dockBgImg: cs(dock).backgroundImage };
});
// phần tử .pane nào phủ quá 15% một vùng?
const maxPaneCover = (b) => b.page.evaluate(() => {
  const st = window.__board.state();
  let worst = 0;
  for (const p of document.querySelectorAll('.pane')) {
    if (p.id === 'topbar' || p.hidden || p.offsetParent === null && getComputedStyle(p).position !== 'fixed') continue;
    const r = p.getBoundingClientRect();
    if (r.width === 0) continue;
    for (const z of st.zones) {
      const w = Math.max(0, Math.min(r.right, z.rect.x + z.rect.w) - Math.max(r.left, z.rect.x));
      const h = Math.max(0, Math.min(r.bottom, z.rect.y + z.rect.h) - Math.max(r.top, z.rect.y));
      worst = Math.max(worst, (w * h) / (z.rect.w * z.rect.h));
    }
  }
  return worst;
});

t('P25', async () => {
  const b = await open({ zones: 2, touch: false });
  const p = await paneInfo(b);
  eq(p.barBf, 'none', 'thanh trên không backdrop-filter'); eq(p.dockBf, 'none', 'dock không backdrop-filter');
  ok(p.dockBgImg.includes('linear-gradient'), 'nền dock đặc: ' + p.dockBgImg);
  eq(await b.page.evaluate(() => document.querySelectorAll('canvas#ink, canvas#live').length), 0, 'không còn #ink/#live');
  await b.id('z1-pen').click(); await b.page.waitForTimeout(300);
  const cover = await maxPaneCover(b);
  ok(cover <= 0.15, 'bảng phủ ' + cover);
  await b.close();
});

const lum = ([r, g, bl]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

async function contrastReport(b, mode) {
  return b.page.evaluate((mode) => {
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const over = (top, base) => ({ r: top.r * top.a + base.r * (1 - top.a), g: top.g * top.a + base.g * (1 - top.a), b: top.b * top.a + base.b * (1 - top.a), a: 1 });
    const paneBase = mode === 'on' ? { r: 30, g: 30, b: 34, a: 1 } : { r: 28, g: 28, b: 31, a: 1 };
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (el.closest('[hidden]') || el.closest('canvas')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const fg = parse(getComputedStyle(el).color);
      // gom các lớp nền từ phần tử lên tới .pane / body
      const layers = [];
      let e = el, base = null;
      while (e) {
        const cs = getComputedStyle(e);
        const bgc = parse(cs.backgroundColor);
        if (bgc && bgc.a > 0 && !e.classList.contains('pane')) layers.push(bgc);
        if (e.classList.contains('pane') || e.id === 'topbar') { base = paneBase; break; }
        if (e.classList.contains('dim')) { base = { r: 0, g: 0, b: 0, a: 1 }; break; }
        e = e.parentElement;
      }
      if (!base) base = el.closest('#overlay') ? { r: 18, g: 18, b: 18, a: 1 } : { r: 11, g: 11, b: 11, a: 1 };
      let bg = base;
      for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
      const fgc = fg.a < 1 ? over(fg, bg) : fg;
      out.push({ text: n.textContent.trim().slice(0, 40), fg: [fgc.r, fgc.g, fgc.b], bg: [bg.r, bg.g, bg.b] });
    }
    return out;
  }, mode);
}

t('P29', async () => {
  for (const [q, mode] of [['', 'lite']]) {
    const b = await open({ zones: 2, touch: false, query: q + (q ? '&' : '') + 'debug=1' });
    const checkAll = async (label) => {
      const rep = await contrastReport(b, mode);
      ok(rep.length > 0, 'không có chữ ' + label);
      for (const r of rep) ok(ratio(r.fg, r.bg) >= 4.5, `${mode}/${label}: "${r.text}" ${ratio(r.fg, r.bg).toFixed(2)}`);
    };
    await b.id('z1-pen').click(); await b.page.waitForTimeout(250);
    await checkAll('nền');
    await b.id('info').click();
    await checkAll('thông tin');
    await b.page.keyboard.press('Escape');
    await b.id('clear-all').click();
    await checkAll('hộp thoại');
    await b.id('dialog-cancel').click();
    // chữ trên nút xanh là #0B0B0B
    eq(await b.id('zones-2').evaluate((e) => getComputedStyle(e).color), 'rgb(11, 11, 11)', 'chữ nút xanh');
    await b.close();
  }
});

// Ảnh: 2 và 4 vùng × 1280/1920
t('SHOT4', async () => {
  for (const [w, h] of [[1280, 720], [1920, 1080]]) {
    for (const n of [2, 4]) {
      const b = await open({ zones: n, w, h, touch: false });
      const s = await b.state();
      const cols = ['white', 'red', 'yellow', 'green'];
      for (const z of s.zones) {
        if (z.id > 1) { await b.id(`z${z.id}-pen`).click(); await b.id(`z${z.id}-color-${cols[(z.id - 1) % 4]}`).click(); }
        const r = z.rect;
        await b.page.mouse.move(r.x + r.w * 0.15, r.y + r.h * 0.45);
        await b.page.mouse.down();
        for (let i = 0; i <= 60; i++) { const a = i / 60; await b.page.mouse.move(r.x + r.w * (0.15 + 0.7 * a), r.y + r.h * (0.45 + 0.15 * Math.sin(a * 6.28 + z.id))); }
        await b.page.mouse.up();
      }
      await b.flush();
      await b.shot(`step4-${n}vung-${w}x${h}`);
      await b.close();
    }
  }
});

const perfRun = async (query, fingersN) => {
  const b = await open({ zones: 4, w: 1920, h: 1080, dpr: 2, query });
  const s = await b.state();
  await b.page.evaluate(() => window.__board.resetPerf());
  await b.multiTouch([1, 2, 3, 4].slice(0, fingersN).map((i) => zoneLine(s, i)), 300, 3);
  const p = await b.page.evaluate(() => window.__board.perf());
  await b.close();
  return p;
};
t('P21', async () => {
  const p = await perfRun('', 4);
  console.log(`  P21: avg ${p.avgMs.toFixed(2)} ms, p95 ${p.p95Ms.toFixed(2)} ms, fps ${p.fps}, khung ${p.frames}, p95 khoảng khung ${p.intervalP95.toFixed(1)}`);
  ok(p.avgMs < 8, `avg ${p.avgMs}`); ok(p.p95Ms < 16, `p95 ${p.p95Ms}`);
});

// ================= STEP 5 =================
const MT = (n) => `Object.defineProperty(navigator, 'maxTouchPoints', { get: () => ${n} });`;

t('P6', async () => {
  const b = await open({ zones: 2, init: MT(5) });
  const s = await b.state();
  const [a, c] = zoneLine(s, 1);
  await b.drawFake(1, 'touch', a, c, { width: 80, height: 80 });
  eq((await b.state()).zones[0].strokeCount, 0, 'lòng bàn tay bị bỏ qua');
  await b.drawFake(2, 'touch', a, c, { width: 20, height: 20 });
  eq((await b.state()).zones[0].strokeCount, 1, 'ngón thường vẽ được');
  // vẽ rồi vượt ngưỡng giữa chừng: huỷ nét
  await b.fire('pointerdown', { pointerId: 3, clientX: a[0], clientY: a[1] + 100 });
  await b.fire('pointermove', { pointerId: 3, clientX: a[0] + 20, clientY: a[1] + 100 });
  await b.fire('pointermove', { pointerId: 3, clientX: a[0] + 40, clientY: a[1] + 100, width: 90, height: 90 });
  await b.fire('pointerup', { pointerId: 3, clientX: a[0] + 40, clientY: a[1] + 100 });
  eq((await b.state()).zones[0].strokeCount, 1, 'nét bị huỷ không lưu');
  await b.close();
});

t('P7', async () => {
  const b = await open({ zones: 2, touch: false });
  const s = await b.state();
  const [a, c] = zoneLine(s, 1);
  await b.fire('pointerdown', { pointerId: 1, pointerType: 'pen', clientX: a[0], clientY: a[1], pressure: 0.2 });
  for (let i = 1; i <= 20; i++) await b.fire('pointermove', { pointerId: 1, pointerType: 'pen', clientX: a[0] + (c[0] - a[0]) * i / 20, clientY: a[1] + (c[1] - a[1]) * i / 20, pressure: 0.2 + 0.7 * i / 20 });
  await b.fire('pointerup', { pointerId: 1, pointerType: 'pen', clientX: c[0], clientY: c[1], pressure: 0, buttons: 0 });
  await b.flush();
  let l = await b.page.evaluate(() => window.__board.lastStroke(1));
  eq(l.realPressure, true, 'áp lực thật');
  await b.drawFake(2, 'pen', zoneLine(s, 2)[0], zoneLine(s, 2)[1], { pressure: 0.5 });
  l = await b.page.evaluate(() => window.__board.lastStroke(2));
  eq(l.realPressure, false, 'áp lực giả 0.5');
  await b.drawFake(3, 'touch', zoneLine(s, 1, 100)[0], zoneLine(s, 1, 100)[1], { pressure: 0.37 });
  l = await b.page.evaluate(() => window.__board.lastStroke(1));
  eq(l.realPressure, false, 'touch không có áp lực thật');
  await b.close();
});

t('P8', async () => {
  const b = await open({ zones: 2, touch: false });
  const s = await b.state();
  const [a, c] = zoneLine(s, 1);
  await b.mouseStroke(a, c);
  eq((await b.state()).zones[0].strokeCount, 1);
  const my = (a[1] + c[1]) / 2, mx = (a[0] + c[0]) / 2;
  await b.drawFake(5, 'pen', [mx, my - 60], [mx, my + 60], { buttons: 32 });
  eq((await b.state()).zones[0].tool, 'pen', 'công cụ vẫn là Bút');
  eq((await b.state()).zones[0].strokeCount, 0, 'đầu tẩy xoá nét');
  await b.close();
});

t('P17', async () => {
  const b = await open({ zones: 4, query: 'debug=1' });
  const s = await b.state();
  // HUD che góc trên-trái nên vẽ ở nửa dưới
  await b.multiTouch([1, 2, 3, 4].map((i) => zoneLine(s, i, 260)));
  await b.page.waitForTimeout(400);
  const txt = await b.id('hud').innerText();
  ok(txt.includes('Nhiều nhất cùng lúc: 4'), 'HUD: ' + txt.slice(0, 300));
  ok(/pointercancel: \d+/.test(txt), 'pointercancel');
  ok(/touch [1-9]/.test(txt), 'loại pointer');
  ok(txt.includes('FPS') && txt.includes('DPR') && txt.includes('Nét:') && txt.includes('nhật ký'), 'đủ dòng');
  ok(txt.includes('down touch#'), 'ring log có sự kiện');
  await b.id('hud-copy').click();
  await b.page.waitForTimeout(200);
  await b.close();
});

t('P18', async () => {
  const b = await open({ zones: 2, touch: false, init: MT(1) });
  eq((await b.state()).warning, true, 'cảnh báo hiện');
  ok((await b.id('banner').innerText()).includes('Cửa sổ này có thể chỉ nhận 1 điểm chạm'));
  const s = await b.state();
  await b.mouseStroke(...zoneLine(s, 1));
  eq((await b.state()).zones[0].strokeCount, 1, 'vẫn vẽ được');
  await b.id('banner-close').click();
  eq((await b.state()).warning, false, 'đóng được');
  await b.close();
  const c = await open({ zones: 2, touch: false, init: MT(0) });
  eq((await c.state()).warning, false, 'máy chuột không cảnh báo');
  await c.close();
});

t('P19', async () => {
  const b = await open({ zones: 2, init: MT(5) });
  const s = await b.state();
  const [a1] = zoneLine(s, 1), [a2] = zoneLine(s, 2);
  eq((await b.state()).warning, false);
  await b.fire('pointerdown', { pointerId: 11, clientX: a1[0], clientY: a1[1] });
  await b.fire('pointerdown', { pointerId: 12, clientX: a2[0], clientY: a2[1] });
  await b.fire('pointercancel', { pointerId: 12, clientX: a2[0], clientY: a2[1] });
  eq((await b.state()).warning, false, 'mới 1 lần huỷ');
  await b.fire('pointerdown', { pointerId: 13, clientX: a2[0], clientY: a2[1] });
  await b.fire('pointercancel', { pointerId: 13, clientX: a2[0], clientY: a2[1] });
  eq((await b.state()).warning, true, 'đủ 2 lần huỷ -> cảnh báo');
  await b.page.waitForTimeout(2600);
  const s2 = await b.state();
  await b.multiTouch([zoneLine(s2, 1), zoneLine(s2, 2)]);
  eq((await b.state()).warning, false, 'có 2 ngón thật -> ẩn');
  await b.close();
});

t('P20', async () => {
  const b = await open({ zones: 2, touch: false });
  const s = await b.state();
  const [a] = zoneLine(s, 1);
  await b.fire('pointerdown', { pointerId: 21, clientX: a[0], clientY: a[1] });
  await b.fire('pointermove', { pointerId: 21, clientX: a[0] + 30, clientY: a[1] + 10 });
  eq((await b.state()).active, 1);
  await b.page.waitForTimeout(2800);
  const st = await b.state();
  eq(st.active, 0, 'bộ canh gỡ pointer treo');
  eq(st.zones[0].strokeCount, 1, 'nét được lưu');
  await b.close();
});

t('P22', async () => {
  const b = await open({ zones: 2, query: 'debug=1&uid=123&nickname=An&identity=teacher&classId=9&lang=en&deviceType=pc' });
  const s = await b.state();
  await b.multiTouch([zoneLine(s, 1)]);
  const store = await b.page.evaluate(async () => ({ ls: localStorage.length, ss: sessionStorage.length, ck: document.cookie, idb: indexedDB.databases ? (await indexedDB.databases()).length : 0 }));
  eq(store.ls, 0); eq(store.ss, 0); eq(store.ck, ''); eq(store.idb, 0);
  await b.page.waitForTimeout(350);
  const hud = await b.id('hud').innerText();
  ok(!hud.includes('123'), 'HUD lộ uid'); ok(!/\bAn\b/.test(hud), 'HUD lộ nickname');
  ok(hud.includes('deviceType=pc') && hud.includes('lang=en') && hud.includes('identity=teacher'), 'HUD thiếu tham số hiển thị');
  ok(hud.includes('uid có') && hud.includes('classId có'), 'HUD che giá trị');
  await b.id('hud-copy').click();
  const t2 = await b.id('hud-text').innerText();
  ok(!t2.includes('123') && !/\bAn\b/.test(t2), 'chuỗi copy lộ');
  await b.close();
});

t('SHOT6', async () => {
  let b = await open({ zones: 2, query: 'debug=1' }); // cảm ứng: có dải cảnh báo + HUD
  await b.shot('step6-hud-canh-bao-1280x720'); await b.close();
  b = await open({ zones: 2, touch: false });
  await b.id('info').click(); await b.shot('step6-thong-tin-1280x720'); await b.page.keyboard.press('Escape');
  const s = await b.state();
  await b.mouseStroke(...zoneLine(s, 1));
  await b.id('clear-all').click(); await b.shot('step6-hop-thoai-1280x720'); await b.close();
  b = await open({ zones: 2, touch: false, query: 'brand=neutral' });
  await b.shot('step6-trung-tinh-1280x720'); await b.close();
});

// ================= PLAN-PERF: hiệu năng OSR (T2-T16) =================
const UA_CLASSIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ClassIn X/6.0.9.1813 Chrome/109.0.5414.120 Safari/537.36';
const UA_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';
const PERF_SHOT_DIR = process.env.PERF_SHOT_DIR || '/Users/haku/Desktop/BAO KHOI/CLAUDE/PROJECTS/bang-nhieu-nguoi-viet/screens';
mkdirSync(PERF_SHOT_DIR, { recursive: true });

// Đếm diện tích canvas bị vẽ mỗi khung rAF, độc lập với renderer (chỉ dùng trong test).
function areaInit() {
  const P = CanvasRenderingContext2D.prototype, touched = new Set(); const areas = [];
  for (const m of ['fill', 'stroke', 'clearRect', 'fillRect', 'drawImage', 'putImageData']) {
    const o = P[m]; P[m] = function () { touched.add(this.canvas); return o.apply(this, arguments); };
  }
  const tick = () => { if (touched.size) { let a = 0; touched.forEach((c) => { a += c.width * c.height; }); areas.push(a); touched.clear(); } requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  window.__canvasArea = { get: () => areas.slice(), reset: () => { areas.length = 0; } };
}
const popen = (query, o = {}) => open({ zones: 2, w: 1280, h: 647, dpr: 3, init: areaInit, query, ...o });
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (a, q) => { if (!a.length) return 0; const x = a.slice().sort((m, n) => m - n); return x[Math.min(x.length - 1, Math.floor(x.length * q))]; };
const AREA_STAGE = 1280 * 588;   // v2.1: tắt Đề, thanh gộp 59 => sân khấu 647 - 59 = 588

// vẽ chữ "a b c" (6 nét) bằng pointer giả, có nghỉ giữa các khung để renderer vẽ gia tăng
async function drawABC(b, ox = 120, oy = 230) {
  await b.page.evaluate(async ([ox, oy]) => {
    const el = document.getElementById('input-layer');
    const fire = (type, id, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, pressure: 0.5, width: 1, height: 1, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true, isPrimary: true }));
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    const arc = (cx, cy, rx, ry, a0, a1, n) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } return o; };
    const seg = (x0, y0, x1, y1, n) => { const o = []; for (let i = 0; i <= n; i++) o.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]); return o; };
    const strokes = [
      arc(ox + 40, oy + 60, 36, 40, 0, Math.PI * 2, 70),        // a: vòng
      seg(ox + 76, oy + 25, ox + 76, oy + 100, 30),             // a: cọng
      seg(ox + 130, oy - 10, ox + 130, oy + 100, 40),           // b: cọng
      arc(ox + 166, oy + 60, 36, 40, 0, Math.PI * 2, 70),       // b: vòng
      arc(ox + 270, oy + 60, 36, 40, -0.6, -0.6 + Math.PI * 1.7, 60), // c
      seg(ox + 330, oy + 20, ox + 380, oy + 95, 40),            // nét chéo
    ];
    let id = 50;
    for (const pts of strokes) {
      id++;
      fire('pointerdown', id, pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) { fire('pointermove', id, pts[i][0], pts[i][1]); if (i % 2 === 0) await raf(); }
      fire('pointerup', id, pts[pts.length - 1][0], pts[pts.length - 1][1]);
      await raf();
    }
  }, [ox, oy]);
  await b.flush();
}
// đọc ảnh PNG (buffer) thành mảng điểm ảnh bằng trang trống
async function decodePng(b, buf) {
  const pg = await b.ctx.newPage();
  const r = await pg.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    return { w: img.width, h: img.height, d: Array.from(x.getImageData(0, 0, img.width, img.height).data) };
  }, buf.toString('base64'));
  await pg.close();
  return r;
}

t('T2', async () => {
  // một bản cho mọi UA: không hồ sơ, không kính, luôn lát k 3 + lọc One Euro
  const info = async (query, ua) => {
    const b = await popen(query, { ua });
    const r = await b.page.evaluate(() => {
      const c = document.documentElement.classList;
      let bf = 0;
      for (const e of document.querySelectorAll('*')) { const cs = getComputedStyle(e); if ((cs.backdropFilter || cs.webkitBackdropFilter || 'none') !== 'none') bf++; }
      return { glassLite: c.contains('glass-lite'), calm: c.contains('perf-calm'), glassOn: c.contains('glass-on'), ci: window.__board.canvasInfo(), st: window.__board.state().ink, bf };
    });
    await b.close();
    return r;
  };
  let first = null;
  for (const ua of [UA_EDGE, UA_CLASSIN]) {
    const r = await info('', ua);
    ok(r.glassLite && r.calm && !r.glassOn, 'class html: ' + JSON.stringify(r));
    eq(r.st.filter, true, 'lọc bật'); eq(r.st.raw, false); eq(r.st.k, 3); eq(r.st.tile, 192);
    eq(r.ci.count, 28, 'số lát (7 cột x 4 hàng; v2.1: sân khấu cao 588)'); eq(r.bf, 0, 'có backdrop-filter');
    if (!first) first = r.ci;
  }
  // URL cũ bị bỏ qua hoàn toàn
  const old = await info('perf=full&glass=1&tiles=0&dpr=1&final=pf&desync=1&inc=0&calm=0&predict=1&coal=0&step=3', UA_EDGE);
  eq(JSON.stringify(old.ci), JSON.stringify(first), 'URL cũ cho canvasInfo y hệt URL trống');
  eq(old.st.k, 3, 'dpr=1 bị bỏ qua'); eq(old.bf, 0);
  // khoá thử nghiệm KHÔNG có hiệu lực nếu không test=1: chạy thẳng không qua open() (open luôn thêm test=1)
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 647 }, deviceScaleFactor: 3 });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  for (let i = 0; i < 5; i++) {   // python http.server đôi khi reset kết nối khi nạp nhiều module: thử lại
    if (i === 0) await pg.goto(`${BASE}?zones=2&ink=raw&k=1&livepts=100`); else await pg.reload();
    try { await pg.waitForSelector('#tiles canvas', { timeout: 4000 }); break; } catch (e) { if (i === 4) throw e; }
  }
  const cnt = await pg.evaluate(() => document.querySelectorAll('#tiles canvas').length);
  eq(cnt, 28, 'không test=1 thì ink=raw&k=1 bị bỏ qua'); eq(errs.length, 0, errs.join('|'));
  await ctx.close();
});

t('INK-K', async () => {
  let b = await popen('');
  let s = await b.state();
  eq(s.ink.k, 3, 'k ở DPR 3');
  let ci = await b.page.evaluate(() => window.__board.canvasInfo());
  eq(ci.count, 28); eq(ci.w, 3840); eq(ci.h, 1764);   // v2.1: 588 x 3 (s = 0,92: thanh gộp 59)
  await b.close();
  for (const [dpr, k, w] of [[1, 1, 1280], [2, 2, 2560]]) {
    b = await open({ zones: 2, w: 1280, h: 647, dpr });
    s = await b.state(); ci = await b.page.evaluate(() => window.__board.canvasInfo());
    eq(s.ink.k, k, 'k ở DPR ' + dpr); eq(ci.w, w, 'w ở DPR ' + dpr);
    await b.close();
  }
  b = await open({ zones: 2, w: 2560, h: 1440, dpr: 3 });
  ci = await b.page.evaluate(() => window.__board.canvasInfo());
  ok(ci.w * ci.h <= 3840 * 2160, 'trần backing: ' + ci.w * ci.h);
  const bad = await b.page.evaluate(() => {
    const k = window.__board.state().ink.k; let n = 0;
    for (const c of document.querySelectorAll('#tiles canvas')) if (!Number.isInteger(c.width) || c.width !== Math.round(parseFloat(c.style.width) * k)) n++;
    return n;
  });
  eq(bad, 0, 'lát có bw nguyên khớp CSS x k');
  console.log(`   INK-K 2560x1440 DPR3: k ${(await b.state()).ink.k.toFixed(3)}, ${ci.w}x${ci.h}, ${ci.count} lát`);
  await b.close();
});

t('T5', async () => {
  const b = await popen('');
  const s = await b.state();
  await b.page.evaluate(() => window.__board.resetCounters());
  const z = s.zones[0].rect, y = z.y + z.h * 0.4;
  await b.multiTouch([[[z.x + 40, y], [z.x + 560, y + 120]]], 120, 8);
  const c = await b.page.evaluate(() => window.__board.counters());
  ok(!('getStroke' in c) && !('pfPts' in c), 'counters còn khoá PF: ' + Object.keys(c).join(','));
  ok('finalTiles' in c && c.frames > 10, 'finalTiles/frames: ' + JSON.stringify(c));
  console.log(`   T5: khung ${c.frames}, lát vẽ lại do chốt ${c.finalTiles}`);
  await b.close();
});

t('INK-F', async () => {
  const b = await popen('');
  const s = await b.state();
  const z = s.zones[0].rect, y = z.y + 100;
  await b.page.evaluate(() => window.__board.resetCounters());
  await b.multiTouch([[[z.x + 30, y], [z.x + 550, y + 20]]], 120, 8);   // 520 px, qua >= 3 lát
  const c = await b.page.evaluate(() => window.__board.counters());
  eq((await b.state()).zones[0].strokeCount, 1);
  ok(c.finalTiles >= 1 && c.finalTiles <= 4, 'lát vẽ lại do chốt: ' + c.finalTiles);
  ok((await b.ink(1)) > 0);
  await b.close();
});

t('INK-P', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(path.join(ROOT, 'public/board/js/ui.js'), 'utf8');
  const hex = [...src.matchAll(/hex:\s*'([^']*)'/g)].map((m) => m[1]);
  ok(hex.length >= 6, 'số màu: ' + hex.length);
  for (const h of hex) ok(/^#[0-9A-F]{6}$/i.test(h), 'màu không đục: ' + h);
});

t('T6', async () => {
  const measure = async (nFingers) => {
    const b = await popen('');
    const s = await b.state();
    const z = s.zones[0].rect;
    const fingers = [];
    for (let i = 0; i < nFingers; i++) { const y = z.y + z.h * 0.25 + i * 60; fingers.push([[z.x + 40, y], [z.x + 560, y + 120]]); }
    await b.page.evaluate(() => { window.__canvasArea.reset(); window.__board.resetCounters(); });
    await b.multiTouch(fingers, 120, 8);
    const areas = await b.page.evaluate(() => window.__canvasArea.get());
    const c = await b.page.evaluate(() => window.__board.counters());
    await b.close();
    return { area: mean(areas), dirty: c.dirtyCssPerFrame, n: areas.length };
  };
  const full = 3840 * 1764;
  const a1 = await measure(1), a4 = await measure(4);
  console.log(`   T6 k=3: 1 ngón ${(a1.area / 1e6).toFixed(3)} MP/khung (${(100 * a1.area / full).toFixed(1)}%), 4 ngón ${(a4.area / 1e6).toFixed(3)} MP/khung (${(100 * a4.area / full).toFixed(1)}%) · vùng hỏng CSS ${(a1.dirty / 1e3).toFixed(0)}k/${(a4.dirty / 1e3).toFixed(0)}k px²`);
  ok(a1.area <= 0.10 * full, '1 ngón ' + (a1.area / full));
  ok(a4.area <= 0.25 * full, '4 ngón ' + (a4.area / full));
});

t('T8', async () => {
  const out = {};
  for (const [key, q] of [['ink', ''], ['raw', 'ink=raw&k=3']]) {
    const b = await open({ zones: 2, w: 1280, h: 720, dpr: 3, query: q });
    await drawABC(b);
    const k = await b.page.evaluate(() => window.__board.state().ink.k);
    out[key] = (await b.ink(1)) / (k * k);
    await b.page.screenshot({ path: path.join(PERF_SHOT_DIR, `perf-${key}.png`), scale: 'css' });
    await b.page.screenshot({ path: path.join(PERF_SHOT_DIR, `perf-${key}-crop.png`), clip: { x: 100, y: 190, width: 420, height: 160 } });
    await b.close();
  }
  console.log('   T8 pixel nét (CSS px²): ' + Object.entries(out).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' · ') + ` · tỉ lệ ${(out.ink / out.raw).toFixed(3)}`);
  ok(out.raw > 1000, 'có nét');
  ok(out.ink >= 0.80 * out.raw && out.ink <= 1.05 * out.raw, 'diện tích mực/raw ' + (out.ink / out.raw).toFixed(3));
});

// Một nét lia nhanh nhưng có pacing thật (khoảng 8 ms/điểm) để bộ lọc One Euro chạy ở tốc độ thực.
async function paced(b, id, pts, o = {}) {
  const ms = o.ms == null ? 8 : o.ms;
  await b.fire('pointerdown', { pointerId: id, clientX: pts[0][0], clientY: pts[0][1], ...(o.extra || {}) });
  for (let i = 1; i < pts.length; i++) {
    await b.fire('pointermove', { pointerId: id, clientX: pts[i][0], clientY: pts[i][1], ...(o.extra || {}) });
    if (ms) await b.page.waitForTimeout(ms);
  }
  if (o.up !== false) await b.fire('pointerup', { pointerId: id, clientX: pts[pts.length - 1][0], clientY: pts[pts.length - 1][1], buttons: 0, ...(o.extra || {}) });
}
const lineN = (x0, y0, x1, y1, n) => { const o = []; for (let i = 0; i <= n; i++) o.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]); return o; };

t('T9', async () => {
  const b = await popen('');
  const s = await b.state();
  const y0 = s.zones[0].rect.y;           // lát (0,0) = stage x 0..192, y 0..192
  const bright = (p) => p[0] > 100;
  // ngón 1 kẻ ngang y0+60 từ x 20 -> 170 (còn đang giữ)
  await paced(b, 1, lineN(20, y0 + 60, 170, y0 + 60, 30), { up: false, ms: 10 });
  await b.page.waitForTimeout(400);       // bộ lọc đuổi kịp
  await b.flush();
  // ngón 2 chéo cùng lát rồi nhả
  await paced(b, 2, lineN(30, y0 + 20, 150, y0 + 150, 24), { ms: 10 });
  await b.flush();
  for (const x of [40, 80, 120, 150]) {
    const p = await b.page.evaluate(([x, y]) => window.__board.pixelAt(x, y), [x, y0 + 60]);
    ok(bright(p), 'đường ngón 1 mất tại x=' + x + ' ' + p);
  }
  await b.fire('pointerup', { pointerId: 1, clientX: 170, clientY: y0 + 60, buttons: 0 });
  await b.flush();
  eq((await b.state()).zones[0].strokeCount, 2);
  const p2 = await b.page.evaluate(([x, y]) => window.__board.pixelAt(x, y), [120, y0 + 60]);
  ok(bright(p2), 'sau khi nhả vẫn còn');
  const p3 = await b.page.evaluate(([x, y]) => window.__board.pixelAt(x, y), [168, y0 + 60]);
  ok(bright(p3), 'đuôi chạm điểm nhả: ' + p3);
  await b.close();
});

t('T10', async () => {
  let b = await popen('debug=1', { ua: UA_EDGE });
  let s = await b.state();
  const z = s.zones[1].rect;
  await b.multiTouch([[[z.x + 40, z.y + 200], [z.x + 400, z.y + 260]]], 60, 8);
  await b.page.waitForTimeout(1200);
  const hud = await b.id('hud-text').innerText();
  for (const pre of ['Nét:', 'Canvas:', 'Khung khi vẽ:', 'JS vẽ/khung:', 'pointermove:', 'Trễ sự kiện→khung:', 'GPU:']) {
    ok(hud.split('\n').some((l) => l.startsWith(pre)), 'HUD thiếu dòng ' + pre + '\n' + hud);
  }
  ok(!hud.split('\n').some((l) => l.startsWith('Hồ sơ:') || l.startsWith('Kính:')), 'HUD còn dòng cũ');
  ok(hud.includes('lọc One Euro') && hud.includes('k 3'), 'dòng Nét: ' + hud.split('\n').find((l) => l.startsWith('Nét:')));
  ok(/pointermove: \d/.test(hud), 'pointermove có số: ' + hud.split('\n').find((l) => l.startsWith('pointermove')));
  ok(hud.includes('nhàn rỗi (Đo 3 s): chưa đo'));
  await b.id('hud-probe').click();
  await b.page.waitForTimeout(3500);
  const hud2 = await b.id('hud-text').innerText();
  ok(/nhàn rỗi \(Đo 3 s\): \d+ fps p95 \d+ ms/.test(hud2), 'probe: ' + hud2.split('\n').find((l) => l.startsWith('Khung khi vẽ')));
  await b.id('hud-reset').click();
  await b.close();
  // HUD ẩn mặc định
  b = await popen('');
  eq((await b.state()).hudOpen, false, 'HUD ẩn mặc định'); eq(await b.id('hud-mini').count(), 0, 'không có mini mặc định');
  await b.close();
  b = await popen('debug=2');
  ok((await b.id('hud-mini').count()) === 1, 'có hud-mini');
  eq(await b.page.evaluate(() => document.querySelector('[data-testid="hud-mini"]').classList.contains('pane')), false);
  eq(await b.id('hud').isHidden(), true, 'HUD đầy đủ ẩn');
  s = await b.state();
  const z2 = s.zones[0].rect;
  const t0 = await b.id('hud-mini').innerText();
  const drawing = b.multiTouch([[[z2.x + 40, z2.y + 200], [z2.x + 500, z2.y + 300]]], 150, 8);
  await b.page.waitForTimeout(1500);
  const t1 = await b.id('hud-mini').innerText();
  await drawing;
  ok(t0 !== t1, 'mini đổi chữ: ' + t0 + ' -> ' + t1);
  ok(t1.startsWith('k'), t1);
  await b.close();
});

t('T11', async () => {
  const b = await popen('');
  const s = await b.state();
  const y0 = s.zones[0].rect.y;
  eq(await b.ink(1), 0);
  // (a) huỷ khi mới 1 điểm
  await b.fire('pointerdown', { pointerId: 1, clientX: 100, clientY: y0 + 100 });
  await b.flush();
  await b.fire('pointercancel', { pointerId: 1, clientX: 100, clientY: y0 + 100, buttons: 0 });
  await b.flush();
  eq(await b.ink(1), 0, '(a) vệt sót sau pointercancel');
  // (b) lòng bàn tay giữa nét
  await paced(b, 2, lineN(100, y0 + 100, 160, y0 + 100, 6), { up: false, ms: 10 });
  await b.flush();
  await b.fire('pointermove', { pointerId: 2, clientX: 170, clientY: y0 + 100, width: 60, height: 60 });
  await b.flush();
  eq((await b.state()).zones[0].strokeCount, 0);
  eq(await b.ink(1), 0, '(b) vệt sót sau lòng bàn tay');
  // (c) vùng đầy
  await b.page.evaluate(() => window.__board.fillZone(1, 1999));
  await b.page.evaluate(() => window.__board.redrawAll());
  await b.flush();
  const base = await b.ink(1);
  await paced(b, 3, lineN(300, y0 + 200, 400, y0 + 200, 12), { up: false, ms: 10 });
  await b.page.waitForTimeout(300);
  await b.flush();
  ok((await b.ink(1)) > base, 'nét live thấy được');
  await b.page.evaluate(() => window.__board.fillZone(1, 1));
  await b.fire('pointerup', { pointerId: 3, clientX: 400, clientY: y0 + 200, buttons: 0 });
  await b.flush();
  eq(await b.ink(1), base, '(c) vệt sót khi vùng đầy');
  await b.close();
});

t('T12', async () => {
  const b = await popen('');
  const s = await b.state();
  const y = s.zones[0].rect.y + 250;
  const clip = { x: 150, y: y - 40, width: 90, height: 80 };
  const colsOf = async () => { const png = await b.page.screenshot({ clip }); return decodePng(b, png); };
  const sample = (img, x, yy) => { const i = (yy * img.w + x) * 4; return [img.d[i], img.d[i + 1], img.d[i + 2]]; };
  const seam = (192 - clip.x) * 3;  // cột vật lý của biên lát
  let img = await colsOf();
  for (let yy = 0; yy < img.h; yy += 7) for (const c of [seam - 1, seam, seam + 1]) {
    const p = sample(img, c, yy);
    ok(p.every((v) => Math.abs(v - 18) <= 3), 'nền trống lệch tại cột ' + c + ' hàng ' + yy + ': ' + p);
  }
  await paced(b, 1, lineN(160, y, 232, y, 36), { ms: 8 });
  await b.flush();
  img = await colsOf();
  const cy = 40 * 3;   // hàng vật lý của tâm nét
  let bad = 0;
  for (let dy = -4; dy <= 4; dy++) for (const c of [seam - 2, seam - 1, seam, seam + 1, seam + 2]) {
    const p = sample(img, c, cy + dy);
    if (p[0] < 200) bad++;
  }
  eq(bad, 0, 'khe hở ở biên lát (điểm không sáng): ' + bad);
  // các điểm ngoài nét không tối hơn nền
  for (let yy = 0; yy < img.h; yy += 5) for (const c of [seam - 1, seam, seam + 1]) {
    if (Math.abs(yy - cy) < 40) continue;
    const p = sample(img, c, yy);
    ok(p.every((v) => v >= 15), 'điểm tối hơn nền tại ' + c + ',' + yy + ': ' + p);
  }
  await b.close();
});

t('T13', async () => {
  const b = await open({ zones: 2, w: 1280, h: 720, dpr: 3, touch: false });
  const k = (await b.state()).ink.k;
  const vals = {};
  const rec = async (name) => { await b.flush(); await b.page.waitForTimeout(60); vals[name] = (await b.ink(1)) / (k * k); };
  let s = await b.state();
  const [a, c] = zoneLine(s, 1);
  await b.mouseStroke(a, c); await b.mouseStroke([a[0], a[1] + 90], [c[0], c[1] + 120]); await b.mouseStroke([a[0] + 20, a[1] - 100], [c[0] - 30, c[1] - 60]);
  await rec('3 nét');
  await b.id('z1-eraser').click();
  const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
  await b.mouseStroke([mx, my - 40], [mx, my + 40]);
  await rec('tẩy');
  await b.id('z1-undo').click(); await rec('hoàn tác tẩy');
  await b.id('z1-pen').click();
  await b.id('z1-clear').click(); await rec('xoá vùng');
  await b.id('z1-undo').click(); await rec('hoàn tác xoá');
  await b.page.setViewportSize({ width: 1000, height: 640 }); await b.page.waitForTimeout(250); await rec('đổi cỡ cửa sổ');
  await b.id('zones-3').click(); await b.page.waitForTimeout(100);
  if (await b.id('dialog-ok').count()) await b.id('dialog-ok').click();
  await b.page.waitForTimeout(200);
  s = await b.state();
  eq(s.zones.length, 3, 'đổi 3 vùng');
  await b.mouseStroke(...zoneLine(s, 1)); await rec('vẽ sau đổi vùng');
  eq(b.log.errors.length, 0, 'lỗi console: ' + b.log.errors.join('|'));
  await b.close();
  console.log('   T13 ' + Object.entries(vals).map(([n, v]) => `${n}: ${v.toFixed(0)}`).join(' · '));
  ok(vals['3 nét'] > 300, 'có nét');
  ok(vals['tẩy'] < vals['3 nét'], 'tẩy bớt nét');
  ok(Math.abs(vals['hoàn tác tẩy'] - vals['3 nét']) / vals['3 nét'] <= 0.01, 'hoàn tác tẩy = 3 nét (±1%)');
  eq(vals['xoá vùng'], 0, 'xoá vùng = 0');
  ok(Math.abs(vals['hoàn tác xoá'] - vals['3 nét']) / vals['3 nét'] <= 0.01, 'hoàn tác xoá = 3 nét (±1%)');
  ok(vals['đổi cỡ cửa sổ'] > 0, 'đổi cỡ cửa sổ còn nét');
  ok(vals['vẽ sau đổi vùng'] > 0, 'vẽ sau đổi vùng');
});

t('T14', async () => {
  const b = await popen('test=1&livepts=400');
  const s = await b.state();
  const z = s.zones[0].rect, y = z.y + 200;
  // độ dày (CSS px) đo theo cột điểm ảnh vật lý, cả dải x để chắc chắn gồm chỗ tách
  const thick = (xa, xb) => b.page.evaluate(([xa, xb, y]) => {
    let mn = Infinity;
    for (let x = xa; x <= xb; x += 2) {
      let n = 0;
      for (let dy = -10; dy < 10; dy += 1 / 3) if (window.__board.pixelAt(x, y + dy + 1 / 6)[0] > 128) n++;
      mn = Math.min(mn, n / 3);
    }
    return mn;
  }, [xa, xb, y]);
  await b.fire('pointerdown', { pointerId: 1, clientX: 20, clientY: y });
  const N = 450, dx = 600 / N;
  for (let i = 1; i <= N; i++) {
    await b.fire('pointermove', { pointerId: 1, clientX: 20 + i * dx, clientY: y });
    await b.page.waitForTimeout(8);
    if (i % 60 === 0) await b.flush();
  }
  await b.page.waitForTimeout(150);
  await b.flush();
  const xs = 20 + 399 * dx;
  const live = await b.page.evaluate(([x, yy]) => window.__board.pixelAt(x, yy), [xs, y]);
  ok(live[0] > 100, 'khoảng trống tại điểm tách (đang vẽ): ' + live);
  const tLive = await thick(xs - 6, xs + 16), tRef = await thick(xs - 80, xs - 60);
  await b.fire('pointerup', { pointerId: 1, clientX: 20 + N * dx, clientY: y, buttons: 0 });
  await b.flush();
  const st = await b.state();
  eq(st.zones[0].strokeCount, 2, 'số nét');
  const fin = await b.page.evaluate(([x, yy]) => window.__board.pixelAt(x, yy), [xs, y]);
  ok(fin[0] > 100, 'khoảng trống tại điểm tách (sau nhả): ' + fin);
  const tFin = await thick(xs - 6, xs + 16);
  console.log(`   T14 độ dày tối thiểu quanh chỗ tách: đang vẽ ${tLive.toFixed(2)}, sau nhả ${tFin.toFixed(2)}, cách 60-80 px ${tRef.toFixed(2)} (CSS px)`);
  ok(tLive >= 0.9 * tRef && tFin >= 0.9 * tRef, 'chỗ nối bị thon: ' + tLive + '/' + tFin + ' so với ' + tRef);
  await b.close();
});

t('T16', async () => {
  const { readFileSync } = await import('node:fs');
  const { existsSync: exists0 } = await import('node:fs');
  const files0 = ['ink.js', 'render-tiles.js', 'strokes.js', 'diag.js', 'input.js', 'main.js', 'palm.js', 'layout.js', 'ui.js', 'v2.js', 'cards.js', 'classbar.js', 'classroom.js', 'tasks.js', 'timer.js', 'dom.js', 'sheets.js', 'deck-dialog.js', 'paper.js', 'features.js', 'tools.js', 'theme.js', 'clockui.js', 'timeup.js', 'snip.js', 'deck-sheets.js', 'snip-test.js', 'math/render.js', 'math/gen.js', 'math/expr.js', 'math/rational.js'].map((f) => path.join(ROOT, 'public/board/js', f)).concat([path.join(ROOT, 'public/board/css/board.css'), path.join(ROOT, 'public/board/snip-test.html')]);
  const files = files0.filter((f) => exists0(f));
  const bad = [/replaceAll\(/, /\.at\(/, /\binset\s*:/, /aspect-ratio/, /structuredClone/, /:is\(/, /\?\?=/, /findLast/, /:has\(/, /^await /m,
    /color-mix\(/, /\.toSorted\(|\.toReversed\(|\.toSpliced\(/, /Object\.groupBy|Promise\.withResolvers/, /text-wrap\s*:/, /@container/, /^\s*&[\s:.]/m];   // v2: findLast, :has, await mức tệp; v2.1: color-mix, toSorted..., groupBy, text-wrap, @container, CSS lồng
  for (const f of files) {
    const txt = readFileSync(f, 'utf8');
    for (const re of bad) ok(!re.test(txt), `${path.basename(f)} chứa ${re}`);
  }
  // đã gỡ hẳn: không còn tệp / tham chiếu cũ
  const { existsSync, readdirSync } = await import('node:fs');
  for (const f of ['js/render.js', 'js/perf.js', 'js/glass.js', 'vendor/perfect-freehand.mjs', 'vendor']) ok(!existsSync(path.join(ROOT, 'public/board', f)), 'còn ' + f);
  const jsFiles = [];
  const walk = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) { if (f.isDirectory()) walk(path.join(d, f.name)); else if (f.name.endsWith('.js')) jsFiles.push(path.join(d, f.name)); } };
  walk(path.join(ROOT, 'public/board/js'));   // v2: có thêm thư mục js/math
  for (const fp of jsFiles) {
    const f = path.relative(path.join(ROOT, 'public/board/js'), fp);
    const txt = readFileSync(fp, 'utf8');
    ok(!/perfect-freehand|from '\.\/(render|perf|glass)\.js'/.test(txt), f + ' còn import cũ');
  }
});

// T7: đo hiệu năng, chạy riêng: node tests/board.mjs T7  (báo cáo, không nằm trong lần chạy mặc định)
t('T7', async () => {
  const PROFILES = [['ink', ''], ['raw-k1', 'ink=raw&k=1']];
  const MODES = [['gpu', null], ['nogpu', ['--disable-gpu', '--disable-gpu-compositing']]];
  const rows = [];
  for (const [mname, args] of MODES) {
    const br = args ? await launch(args) : browser;
    try {
      for (const [pname, q] of PROFILES) {
        for (const nf of [4, 10]) {
          const b = await open({ zones: 2, w: 1280, h: 647, dpr: 3, query: q, init: areaInit, br });
          const s = await b.state();
          await b.cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
          let sc = 0;
          b.cdp.on('Page.screencastFrame', (f) => { sc++; b.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
          await b.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 40, maxWidth: 3840, maxHeight: 1941 });
          const fingers = [];
          for (let i = 0; i < nf; i++) {
            const z = s.zones[i % 2].rect;
            const y = z.y + z.h * 0.2 + Math.floor(i / 2) * 55;
            fingers.push([[z.x + 40, y], [z.x + z.w - 60, y + 90]]);
          }
          await b.page.evaluate(() => { window.__board.resetPerf(); window.__canvasArea.reset(); });
          const t0 = Date.now();
          await b.multiTouch(fingers, 100, 8);
          const dur = (Date.now() - t0) / 1000;
          const pf = await b.page.evaluate(() => window.__board.perf());
          const c = await b.page.evaluate(() => window.__board.counters());
          const areas = await b.page.evaluate(() => window.__canvasArea.get());
          await b.cdp.send('Page.stopScreencast').catch(() => {});
          rows.push({ mode: mname, profile: pname, fingers: nf, fps: pf.fps, avgMs: +pf.avgMs.toFixed(2), p95Ms: +pf.p95Ms.toFixed(2), intervalP95: +pf.intervalP95.toFixed(1),
            finalTiles: c.finalTiles, latAvg: +c.latAvg.toFixed(0), latP95: +c.latP95.toFixed(0),
            mpPerFrame: +(c.dirtyCssPerFrame / 1e6).toFixed(3), canvasMP: +(mean(areas) / 1e6).toFixed(2), screencastFps: +(sc / dur).toFixed(1), seconds: +dur.toFixed(1) });
          await b.close();
        }
      }
    } finally { if (args) await br.close(); }
  }
  writeFileSync(path.join(PERF_SHOT_DIR, 'perf-board.json'), JSON.stringify(rows, null, 1));
  const hdr = '| chế độ | cấu hình | ngón | fps | JS avg | JS p95 | khoảng p95 | lát chốt | trễ avg/p95 | MP CSS/khung | canvas MP/khung | screencast fps |\n|---|---|---|---|---|---|---|---|---|---|---|---|';
  console.log(hdr + '\n' + rows.map((r) => `| ${r.mode} | ${r.profile} | ${r.fingers} | ${r.fps} | ${r.avgMs} | ${r.p95Ms} | ${r.intervalP95} | ${r.finalTiles} | ${r.latAvg}/${r.latP95} | ${r.mpPerFrame} | ${r.canvasMP} | ${r.screencastFps} |`).join('\n'));
  for (const r of rows) ok(r.intervalP95 <= 60, `khoảng khung p95 ${r.intervalP95} (${r.mode}/${r.profile}/${r.fingers})`);
});


// ================= Sửa lọc lòng bàn tay (ClassIn X báo width=height=50 cho mọi chạm) =================
const UA_CLASSIN_PALM = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ClassIn X/6.0.9.1813 Safari/537.36';
async function tapBtn(b, testid, extra = {}, pid = 77) {
  await b.page.evaluate(([tid, pid, extra]) => {
    const el = document.querySelector(`[data-testid="${tid}"]`);
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const o = (type) => new PointerEvent(type, Object.assign({ pointerId: pid, pointerType: 'touch', clientX: x, clientY: y, pressure: 0, width: 50, height: 50, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true, isPrimary: true }, extra));
    el.dispatchEvent(o('pointerdown')); el.dispatchEvent(o('pointerup'));
  }, [testid, pid, extra]);
}
const W50 = { width: 50, height: 50, pressure: 0 };
{
  t('P-classin', async () => {
    const b = await open({ zones: 4, w: 1280, h: 720, ua: UA_CLASSIN_PALM });
    let s = await b.state();
    eq(s.palm.enabled, false, 'lọc tắt do UA ClassIn'); eq(s.palm.reason, 'ua');
    // vẽ 1 ngón width 50 ở vùng 1 và 4
    await b.drawFake(1, 'touch', ...zoneLine(s, 1), W50);
    await b.drawFake(2, 'touch', ...zoneLine(s, 4), W50);
    s = await b.state();
    eq(s.zones[0].strokeCount, 1, 'vẽ được vùng 1 (width 50)'); eq(s.zones[3].strokeCount, 1, 'vẽ được vùng 4');
    // nút Hoàn tác / Xoá vùng
    await tapBtn(b, 'z1-undo'); await b.flush();
    eq((await b.state()).zones[0].strokeCount, 0, 'Hoàn tác bấm được');
    await b.drawFake(3, 'touch', ...zoneLine(s, 2), W50);
    await tapBtn(b, 'z2-clear'); await b.flush();
    eq((await b.state()).zones[1].strokeCount, 0, 'Xoá vùng bấm được');
    // Tẩy / Bút
    await tapBtn(b, 'z3-eraser');
    eq((await b.state()).zones[2].tool, 'eraser', 'Tẩy bấm được');
    await tapBtn(b, 'z3-pen');
    eq((await b.state()).zones[2].tool, 'pen', 'Bút bấm được');
    // Xoá hết + hộp thoại xác nhận bằng chạm width 50
    await tapBtn(b, 'clear-all'); await tapBtn(b, 'dialog-ok'); await b.flush();
    ok((await b.state()).zones.every((z) => z.strokeCount === 0), 'Xoá hết bấm được');
    // 1-2-3-4 vùng
    for (const n of [2, 3, 1, 4]) { await tapBtn(b, 'zones-' + n); await b.page.waitForFunction((k) => window.__board.state().zones.length === k, n, { timeout: 3000 }).catch(() => {}); eq((await b.state()).zones.length, n, 'chia ' + n + ' vùng'); }
    // 4 ngón width 50 vẽ đồng thời
    s = await b.state();
    await b.page.evaluate(async (zs) => {
      const el = document.getElementById('input-layer');
      const fire = (type, id, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, pressure: 0, width: 50, height: 50, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true, isPrimary: id === 11 }));
      const P = zs.map((r, i) => [r.x + r.w * 0.3, r.y + r.h * 0.4, 11 + i]);
      for (const [x, y, id] of P) fire('pointerdown', id, x, y);
      for (let k = 1; k <= 10; k++) for (const [x, y, id] of P) fire('pointermove', id, x + k * 8, y + k * 4);
      for (const [x, y, id] of P) fire('pointerup', id, x + 80, y + 40);
    }, s.zones.map((z) => z.rect));
    await b.flush();
    s = await b.state();
    ok(s.zones.every((z) => z.strokeCount === 1), 'mỗi vùng 1 nét: ' + s.zones.map((z) => z.strokeCount));
    eq(b.log.errors.length, 0, b.log.errors.join('|'));
    await b.close();
  });
}
t('P-auto', async () => {
  const b = await open({ zones: 2, w: 1280, h: 720 }); // UA thường
  let s = await b.state();
  eq(s.palm.enabled, true); eq(s.palm.reason, 'default');
  for (let i = 0; i < 4; i++) await b.drawFake(10 + i, 'touch', ...zoneLine(s, 1, i * 20), W50);
  s = await b.state();
  eq(s.palm.enabled, false, 'tự tắt sau 3 chạm w cố định'); eq(s.palm.reason, 'auto');
  ok(s.zones[0].strokeCount >= 2, 'chạm thứ 3-4 vẽ được: ' + s.zones[0].strokeCount);
  eq(s.zones[0].strokeCount, 2);
  // nút vẫn bấm được ngay cả khi lọc còn bật (palm=1)
  const b2 = await open({ zones: 2, query: 'palm=1', ua: UA_CLASSIN_PALM });
  s = await b2.state(); eq(s.palm.enabled, true); eq(s.palm.reason, 'forced');
  await b2.drawFake(1, 'touch', ...zoneLine(s, 1), W50);
  eq((await b2.state()).zones[0].strokeCount, 0, 'palm=1 vẫn lọc');
  await tapBtn(b2, 'zones-3'); await b2.page.waitForFunction(() => window.__board.state().zones.length === 3, null, { timeout: 3000 }).catch(() => {});
  eq((await b2.state()).zones.length, 3, 'nút bấm được khi palm=1');
  const b3 = await open({ zones: 2, query: 'palm=0' });
  s = await b3.state(); eq(s.palm.enabled, false); eq(s.palm.reason, 'param');
  await b3.drawFake(1, 'touch', ...zoneLine(s, 1), { width: 80, height: 80 });
  eq((await b3.state()).zones[0].strokeCount, 1, 'palm=0 vẽ cả khi w 80');
  // HUD có dòng mới
  const b4 = await open({ zones: 2, query: 'debug=1', ua: UA_CLASSIN_PALM });
  const txt = await b4.id('hud-text').textContent();
  ok(/Lọc lòng bàn tay: tắt \(lý do: UA ClassIn\)/.test(txt), txt.slice(0, 400));
  for (const x of [b, b2, b3, b4]) await x.close();
});

// ================= PLAN-INK: chất lượng nét (INK-B, INK-N0, INK-J, INK-E, INK-T) =================
// Pointer giả touch width=height=50, pressure 0, nhịp 120 Hz theo thời gian thật, UA ClassIn (lọc lòng bàn tay tắt), DPR 3.
async function inkRun(query, noiseKey, shapes) {
  const b = await open({ zones: 2, w: 1280, h: 647, dpr: 3, ua: UA_CLASSIN_PALM, query });
  const out = {};
  let pid = 10;
  for (const sh of shapes) {
    const smp = genSamples(sh, noiseKey);
    pid++;
    await b.page.evaluate(async ([smp, pid]) => {
      const el = document.getElementById('input-layer');
      const fire = (type, x, y, extra) => el.dispatchEvent(new PointerEvent(type, Object.assign({ pointerId: pid, pointerType: 'touch', clientX: x, clientY: y, pressure: 0, width: 50, height: 50, buttons: 1, bubbles: true, cancelable: true, isPrimary: true }, extra || {})));
      const t0 = performance.now();
      fire('pointerdown', smp[0][1], smp[0][2]);
      for (let i = 1; i < smp.length; i++) {
        const wait = t0 + smp[i][0] - performance.now();
        if (wait > 1) await new Promise((r) => setTimeout(r, wait));
        fire('pointermove', smp[i][1], smp[i][2]);
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, [smp, pid]);
    const livePng = await b.page.screenshot({ clip: CLIPS[sh], scale: 'device' });
    const last = smp[smp.length - 1];
    await b.page.evaluate(async ([x, y, pid]) => {
      const el = document.getElementById('input-layer');
      el.dispatchEvent(new PointerEvent('pointerup', { pointerId: pid, pointerType: 'touch', clientX: x, clientY: y, pressure: 0, width: 50, height: 50, buttons: 0, bubbles: true, cancelable: true, isPrimary: true }));
      await window.__board.flush();
    }, [last[1], last[2], pid]);
    const finPng = await b.page.screenshot({ clip: CLIPS[sh], scale: 'device' });
    out[sh] = { livePng, finPng, live: await decodePng(b, livePng), fin: await decodePng(b, finPng) };
  }
  eq(b.log.errors.length, 0, 'lỗi console: ' + b.log.errors.join('|'));
  await b.close();
  return out;
}
const inkCache = {};
const INK_CFG = {
  truoc: ['ink=raw&k=1', 'N1', ['H', 'V', 'C', 'W']],
  sau: ['', 'N1', ['H', 'V', 'C', 'W']],
  n0: ['', 'N0', ['H', 'V', 'C']],
};
async function inkGet(key) { if (!inkCache[key]) inkCache[key] = await inkRun(...INK_CFG[key]); return inkCache[key]; }
function inkMeasure(sh, img) {
  const A = alphaFromRGBA(img);
  if (sh === 'H') return lineMetrics(A, img.w, img.h, 120, false, 3);
  if (sh === 'V') return lineMetrics(A, img.w, img.h, 120, true, 3);
  if (sh === 'C') return arcMetrics(A, img.w, img.h, 390, 390, 330, 15);
  return null;
}
// ảnh ghép phóng to (NEAREST), nhãn bên trên mỗi dải. rows: [{label, png}], box {x,y,w,h} điểm ảnh vật lý
async function montage(rows, box, scale, outFile) {
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  const b64 = await pg.evaluate(async ([rows, box, scale]) => {
    const LAB = 22, W = box.w * scale, H = rows.length * (box.h * scale + LAB);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
    x.fillStyle = '#3a0000'; x.fillRect(0, 0, W, H);
    let y = 0;
    for (const r of rows) {
      const img = new Image(); img.src = 'data:image/png;base64,' + r.b64; await img.decode();
      x.fillStyle = '#ffd43b'; x.font = '14px sans-serif'; x.fillText(r.label, 6, y + 16);
      y += LAB;
      x.drawImage(img, box.x, box.y, box.w, box.h, 0, y, box.w * scale, box.h * scale);
      y += box.h * scale;
    }
    return cv.toDataURL('image/png').split(',')[1];
  }, [rows.map((r) => ({ label: r.label, b64: r.png.toString('base64') })), box, scale]);
  await ctx.close();
  writeFileSync(outFile, Buffer.from(b64, 'base64'));
}
const METRICS_JSON = path.join(PERF_SHOT_DIR, 'ink-metrics.json');
const inkMetricsOut = {};
const saveMetrics = () => writeFileSync(METRICS_JSON, JSON.stringify(inkMetricsOut, null, 1));

t('INK-B', async () => {
  const before = await inkGet('truoc'), after = await inkGet('sau');
  const rows = [];
  for (const sh of ['H', 'V', 'C']) {
    const mb = inkMeasure(sh, before[sh].fin), ma = inkMeasure(sh, after[sh].fin);
    inkMetricsOut['N1-' + sh] = { truoc: mb, sau: ma };
    console.log(`   INK-B ${sh}: hf ${mb.hf} -> ${ma.hf} · wcv ${mb.wcv} -> ${ma.wcv}` + (mb.beads100 != null ? ` · hạt/100px ${mb.beads100} -> ${ma.beads100}` : '') + ` · wob ${mb.wob} -> ${ma.wob}`);
    rows.push([sh, mb, ma]);
    writeFileSync(path.join(PERF_SHOT_DIR, `ink-B-${sh}-truoc.png`), before[sh].finPng);
    writeFileSync(path.join(PERF_SHOT_DIR, `ink-B-${sh}-sau.png`), after[sh].finPng);
  }
  await montage([{ label: 'trước (ink=raw, k=1)', png: before.H.finPng }, { label: 'sau (mặc định, k=3)', png: after.H.finPng }], { x: 600, y: 50, w: 400, h: 120 }, 3, path.join(PERF_SHOT_DIR, 'ink-B-H-3x.png'));
  // ảnh ink2-* (so sánh với ink-truoc-sau-*.png)
  await montage([{ label: 'ink2 trước (raw k1)', png: before.H.finPng }, { label: 'ink2 sau (mặc định k3)', png: after.H.finPng }], { x: 600, y: 50, w: 400, h: 120 }, 3, path.join(PERF_SHOT_DIR, 'ink2-truoc-sau-ngang-3x.png'));
  await montage([{ label: 'ink2 trước (raw k1)', png: before.W.finPng }, { label: 'ink2 sau (mặc định k3)', png: after.W.finPng }], { x: 200, y: 100, w: 400, h: 200 }, 2, path.join(PERF_SHOT_DIR, 'ink2-truoc-sau-song.png'));
  await montage([{ label: 'ink2 trước (raw k1)', png: before.C.finPng }, { label: 'ink2 sau (mặc định k3)', png: after.C.finPng }], { x: 200, y: 20, w: 300, h: 130 }, 3, path.join(PERF_SHOT_DIR, 'ink2-truoc-sau-cung.png'));
  await montage([{ label: 'ink2 trước (raw k1)', png: before.V.finPng }, { label: 'ink2 sau (mặc định k3)', png: after.V.finPng }], { x: 0, y: 150, w: 240, h: 120 }, 3, path.join(PERF_SHOT_DIR, 'ink2-truoc-sau-doc-3x.png'));
  saveMetrics();
  for (const [sh, mb, ma] of rows) {
    ok(ma.hf <= 0.42 && ma.hf <= 0.65 * mb.hf, `${sh}: hf ${ma.hf} (trước ${mb.hf}) cần ≤ 0,42 và ≤ 0,65×trước`);
    ok(ma.wcv <= 0.04 && ma.wcv <= 0.5 * mb.wcv, `${sh}: wcv ${ma.wcv} (trước ${mb.wcv}) cần ≤ 0,04 và ≤ 0,5×trước`);
    if (sh !== 'C') ok(ma.beads100 <= 8 && ma.beads100 <= 0.6 * mb.beads100, `${sh}: hạt ${ma.beads100} (trước ${mb.beads100}) cần ≤ 8 và ≤ 0,6×trước`);
    ok(ma.wob <= 0.9 * mb.wob, `${sh}: wob ${ma.wob} (trước ${mb.wob}) cần ≤ 0,9×trước`);
  }
});

t('INK-N0', async () => {
  const r = await inkGet('n0');
  for (const sh of ['H', 'V', 'C']) {
    const m = inkMeasure(sh, r[sh].fin);
    inkMetricsOut['N0-' + sh] = { sau: m };
    console.log(`   INK-N0 ${sh}: hf ${m.hf}` + (m.beads100 != null ? ` · hạt ${m.beads100}` : ''));
    ok(m.hf <= 0.16, `${sh}: hf ${m.hf} > 0,16`);
    if (sh !== 'C') ok(m.beads100 <= 1, `${sh}: hạt ${m.beads100} > 1`);
  }
  saveMetrics();
});

t('INK-J', async () => {
  const r = await inkGet('sau');
  const o = {};
  for (const sh of ['H', 'V', 'C', 'W']) {
    o[sh] = changedFraction(r[sh].live, r[sh].fin);
    console.log(`   INK-J ${sh}: ${(100 * o[sh]).toFixed(2)} % điểm ảnh đổi khi nhả tay`);
  }
  inkMetricsOut['N1-jump'] = o; saveMetrics();
  for (const sh of ['H', 'V', 'C', 'W']) ok(o[sh] <= 0.05, `${sh}: nhảy hình ${(100 * o[sh]).toFixed(2)} % > 5 %`);
});

t('INK-E', async () => {
  const b = await open({ zones: 2, w: 1280, h: 647, dpr: 3, ua: UA_CLASSIN_PALM });
  const s = await b.state();
  const y = s.zones[0].rect.y + 200, x0 = 100, x1 = 400;
  await b.page.evaluate(async ([x0, x1, y]) => {
    const el = document.getElementById('input-layer');
    const fire = (type, x) => el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, pressure: 0, width: 50, height: 50, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true, isPrimary: true }));
    const t0 = performance.now(), n = Math.round((x1 - x0) / 600 * 120);
    fire('pointerdown', x0);
    for (let i = 1; i <= n; i++) {
      const wait = t0 + i * 1000 / 120 - performance.now();
      if (wait > 1) await new Promise((r) => setTimeout(r, wait));
      fire('pointermove', x0 + (x1 - x0) * i / n);
    }
    fire('pointerup', x1);
    await window.__board.flush();
  }, [x0, x1, y]);
  const px = await b.page.evaluate(([x, yy]) => window.__board.pixelAt(x, yy), [x1 - 1, y]);
  const px2 = await b.page.evaluate(([x, yy]) => window.__board.pixelAt(x, yy), [x1 + 4, y]);
  ok(px[0] > 100, 'đuôi không chạm tới chỗ nhả tay: ' + px);
  ok(px2[0] < 60, 'nét vượt quá chỗ nhả: ' + px2);
  eq((await b.state()).zones[0].strokeCount, 1);
  await b.close();
});

// Kích thước và thời gian vẽ lại ô ở k=3
t('INK-T', async () => {
  const b = await open({ zones: 2, w: 1280, h: 647, dpr: 3, ua: UA_CLASSIN_PALM });
  await drawABC(b);
  for (let i = 0; i < 24; i++) {
    const y0 = 90 + (i % 8) * 60, x0 = 50 + Math.floor(i / 8) * 190;
    await b.fire('pointerdown', { pointerId: 20 + i, clientX: x0, clientY: y0, pressure: 0, width: 50, height: 50 });
    for (let j = 1; j <= 8; j++) await b.fire('pointermove', { pointerId: 20 + i, clientX: x0 + j * 15, clientY: y0 + Math.sin(j) * 12, pressure: 0, width: 50, height: 50 });
    await b.fire('pointerup', { pointerId: 20 + i, clientX: x0 + 120, clientY: y0, buttons: 0, pressure: 0, width: 50, height: 50 });
  }
  await b.flush();
  const info = await b.page.evaluate(() => window.__board.canvasInfo());
  const tile = await b.page.evaluate(() => { const c = document.querySelector('#tiles canvas'); return [c.width, c.height]; });
  const ms = [];
  for (let r = 0; r < 5; r++) {
    // JS vẽ (avg ms của khung) + thời gian chờ raster xong (đọc lại 1 điểm ảnh ở mỗi lát ép trình duyệt hoàn tất)
    const m = await b.page.evaluate(async () => {
      window.__board.resetPerf(); window.__board.resetCounters();
      window.__board.redrawAll();
      await new Promise((res) => requestAnimationFrame(res));   // khung của renderer đăng ký trước nên chạy trước hàm này
      const t1 = performance.now();
      const ci = window.__board.canvasInfo();
      for (let y = 0; y < 4; y++) for (let x = 0; x < 7; x++) window.__board.pixelAt(x * 192 + 5, y * 192 + 5 + 52);
      const t2 = performance.now();
      return { js: window.__board.perf().avgMs, tiles: window.__board.counters().tilesPerFrame, raster: t2 - t1, n: ci.count };
    });
    ms.push(m);
  }
  const avg = (k) => ms.reduce((a, x) => a + x[k], 0) / ms.length;
  const tilesN = ms[0].tiles, jsMs = avg('js'), rasterMs = avg('raster');
  const o = { tilePx: tile, tileMB: +(tile[0] * tile[1] * 4 / 1048576).toFixed(2), totalTiles: info.count, totalMB: +(info.mp * 4 / 1.048576).toFixed(1), jsRedrawAllMs: +jsMs.toFixed(1), rasterWaitMs: +rasterMs.toFixed(1), tilesRedrawn: tilesN, msPerTile: +((jsMs + rasterMs) / Math.max(1, tilesN)).toFixed(2), strokes: (await b.state()).zones[0].strokeCount };
  inkMetricsOut['k3-tiles'] = o; saveMetrics();
  console.log('   INK-T k=3: ' + JSON.stringify(o));
  ok(tile[0] === 576 && tile[1] === 576, 'lát 192 x 3 = 576: ' + tile);
  ok(jsMs + rasterMs < 250, 'vẽ lại cả bảng quá lâu: ' + (jsMs + rasterMs) + ' ms');
  await b.close();
});

// ================= chạy =================
async function main() {
  await waitPort(PORT);
  browser = await launch();
  const OPT_IN = ['T7']; // đo hiệu năng: chỉ chạy khi gọi tên
  const run = tests.filter((x) => (!ONLY.length && !OPT_IN.includes(x.id)) || ONLY.includes(x.id));
  for (const x of run) {
    const t0 = Date.now();
    try { await x.fn(); results.push([x.id, true]); console.log(`PASS ${x.id} (${Date.now() - t0} ms)`); }
    catch (e) { results.push([x.id, false, e.message]); console.log(`FAIL ${x.id}: ${e.message}`); }
  }
  await browser.close();
  const pass = results.filter((r) => r[1]).length;
  console.log(`\n${pass}/${results.length} đạt`);
  server.kill();
  process.exit(pass === results.length ? 0 : 1);
}
main().catch((e) => { console.error(e); server.kill(); process.exit(2); });
