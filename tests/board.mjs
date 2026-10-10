// Kiểm thử trình duyệt cho public/board/ ("Bảng nhiều người viết").
// Chạy: npm run test:board   (lọc: node tests/board.mjs P3 P4)   Ảnh: SHOT_DIR=... node tests/board.mjs
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

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
async function launch() {
  try { return await chromium.launch(); } catch (e) { return await chromium.launch({ channel: 'chrome' }); }
}

const results = [];
const tests = [];
const t = (id, fn) => tests.push({ id, fn });
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || 'eq'}: nhận ${JSON.stringify(a)}, cần ${JSON.stringify(b)}`); };
const ok = (c, msg) => { if (!c) throw new Error(msg || 'ok'); };

async function open({ zones = 2, w = 1280, h = 720, dpr = 1, query = '', init, touch = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, deviceScaleFactor: dpr });
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
const MOCK_NO_BLUR = 'CSS.supports = () => false;';
const MOCK_REDUCED = `{ const o = window.matchMedia.bind(window);
  window.matchMedia = (q) => (q.includes('prefers-reduced-transparency')
    ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null }
    : o(q)); }`;
const paneInfo = (b) => b.page.evaluate(() => {
  const bar = document.getElementById('topbar');
  const dock = document.querySelector('[data-testid="z1-dock"]');
  const cs = (e) => getComputedStyle(e);
  const bf = (e) => cs(e).backdropFilter || cs(e).webkitBackdropFilter || 'none';
  return {
    barBf: bf(bar), dockBf: bf(dock), barBgImg: cs(bar).backgroundImage, dockBgImg: cs(dock).backgroundImage,
    inkBf: bf(document.getElementById('ink')), liveBf: bf(document.getElementById('live')),
  };
});
// phần tử kính nào phủ quá 15% một vùng?
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
  let b = await open({ zones: 2, touch: false });
  let s = await b.state();
  eq(s.glass, 'on'); eq(s.glassReason, 'default');
  let p = await paneInfo(b);
  ok(p.barBf !== 'none' && p.dockBf !== 'none', 'mặc định có backdrop-filter: ' + JSON.stringify(p));
  eq(p.inkBf, 'none'); eq(p.liveBf, 'none');
  await b.id('z1-pen').click(); await b.page.waitForTimeout(300);
  const cover = await maxPaneCover(b);
  ok(cover <= 0.15, 'kính phủ ' + cover);
  await b.close();
  const cases = [['?glass=0', 'glass=0', null, 'param'], ['CSS.supports giả', '', MOCK_NO_BLUR, 'unsupported'], ['reduced-transparency giả', '', MOCK_REDUCED, 'transparency']];
  for (const [name, q, init, reason] of cases) {
    b = await open({ zones: 2, touch: false, query: q, init: init || undefined });
    s = await b.state();
    eq(s.glass, 'lite', name); eq(s.glassReason, reason, name + ' lý do');
    p = await paneInfo(b);
    eq(p.barBf, 'none', name + ' bar'); eq(p.dockBf, 'none', name + ' dock');
    ok(p.dockBgImg.includes('linear-gradient'), name + ' nền đặc: ' + p.dockBgImg);
    eq(p.inkBf, 'none'); eq(p.liveBf, 'none');
    await b.close();
  }
});

t('P26', async () => {
  let b = await open({ zones: 4, query: 'debug=1' });
  let s = await b.state();
  eq(s.glass, 'on');
  await b.page.evaluate(() => window.__board.forceSlowFrames(30));
  await b.multiTouch([1, 2, 3, 4].map((i) => zoneLine(s, i)), 110, 50);
  s = await b.state();
  eq(s.glass, 'lite', 'tự hạ'); eq(s.glassReason, 'auto');
  ok((await b.id('hud').innerText()).includes('nhẹ (tự hạ)'), 'HUD ghi tự hạ');
  eq(await b.page.evaluate(() => document.documentElement.classList.contains('glass-lite')), true);
  await b.close();
  b = await open({ zones: 4, query: 'glass=1' });
  s = await b.state();
  await b.page.evaluate(() => window.__board.forceSlowFrames(30));
  await b.multiTouch([1, 2, 3, 4].map((i) => zoneLine(s, i)), 110, 50);
  s = await b.state();
  eq(s.glass, 'on', 'glass=1 không tự hạ');
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
  for (const [q, mode] of [['', 'on'], ['glass=0', 'lite']]) {
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

// Ảnh: kính bật/tắt × 2 và 4 vùng × 1280/1920
t('SHOT4', async () => {
  for (const [w, h] of [[1280, 720], [1920, 1080]]) {
    for (const glass of ['1', '0']) {
      for (const n of [2, 4]) {
        const b = await open({ zones: n, w, h, touch: false, query: 'glass=' + glass });
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
        await b.shot(`step4-${glass === '1' ? 'kinh-bat' : 'kinh-tat'}-${n}vung-${w}x${h}`);
        await b.close();
      }
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
  for (const [name, q] of [['glass=on', 'glass=1'], ['glass=lite', 'glass=0']]) {
    const p = await perfRun(q, 4);
    console.log(`  P21 ${name}: avg ${p.avgMs.toFixed(2)} ms, p95 ${p.p95Ms.toFixed(2)} ms, fps ${p.fps}, khung ${p.frames}, p95 khoảng khung ${p.intervalP95.toFixed(1)}`);
    ok(p.avgMs < 8, `avg ${p.avgMs}`); ok(p.p95Ms < 16, `p95 ${p.p95Ms}`);
  }
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
  await b.multiTouch([1, 2, 3, 4].map((i) => zoneLine(s, i, 230)));
  await b.page.waitForTimeout(400);
  const txt = await b.id('hud').innerText();
  ok(txt.includes('Nhiều nhất cùng lúc: 4'), 'HUD: ' + txt.slice(0, 300));
  ok(/pointercancel: \d+/.test(txt), 'pointercancel');
  ok(/touch [1-9]/.test(txt), 'loại pointer');
  ok(txt.includes('FPS') && txt.includes('DPR') && txt.includes('Kính:') && txt.includes('nhật ký'), 'đủ dòng');
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

// ================= chạy =================
async function main() {
  await waitPort(PORT);
  browser = await launch();
  const run = tests.filter((x) => !ONLY.length || ONLY.includes(x.id));
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
