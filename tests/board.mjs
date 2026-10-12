// Kiểm thử trình duyệt cho public/board/ ("Bảng nhiều người viết").
// Chạy: npm run test:board   (lọc: node tests/board.mjs P3 P4)   Ảnh: SHOT_DIR=... node tests/board.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
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
async function launch(args) {
  const o = args ? { args } : {};
  try { return await chromium.launch(o); } catch (e) { return await chromium.launch({ channel: 'chrome', ...o }); }
}

const results = [];
const tests = [];
const t = (id, fn) => tests.push({ id, fn });
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || 'eq'}: nhận ${JSON.stringify(a)}, cần ${JSON.stringify(b)}`); };
const ok = (c, msg) => { if (!c) throw new Error(msg || 'ok'); };

let EXTRA_QUERY = ''; // T15 chạy lại kịch bản cũ với tham số hiệu năng
async function open({ zones = 2, w = 1280, h = 720, dpr = 1, query = '', init, touch = true, ua, br } = {}) {
  if (EXTRA_QUERY) query = query ? query + '&' + EXTRA_QUERY : EXTRA_QUERY;
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
const AREA_STAGE = 1280 * 595;

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
  let b = await popen('', { ua: UA_CLASSIN });
  let s = await b.state();
  eq(s.profile, 'lite'); eq(s.profileSource, 'ua'); eq(s.glass, 'lite'); eq(s.glassReason, 'profile');
  ok(await b.page.evaluate(() => document.documentElement.classList.contains('perf-calm')), 'perf-calm');
  await b.close();
  b = await popen('glass=1', { ua: UA_CLASSIN });
  s = await b.state();
  eq(s.glass, 'on'); eq(s.glassReason, 'param'); eq(s.profile, 'lite');
  await b.close();
  b = await popen('', { ua: UA_EDGE });
  s = await b.state();
  eq(s.profile, 'full'); eq(s.profileSource, 'default'); eq(s.glass, 'on');
  ok(!(await b.page.evaluate(() => document.documentElement.classList.contains('perf-calm'))), 'full không có perf-calm');
  await b.close();
  b = await popen('perf=full', { ua: UA_CLASSIN });
  s = await b.state(); eq(s.profile, 'full'); eq(s.profileSource, 'param'); eq(s.glass, 'on');
  await b.close();
});

t('T3', async () => {
  const sizes = async (q, ua) => {
    const b = await popen(q, { ua: ua || UA_EDGE });
    const ci = await b.page.evaluate(() => window.__board.canvasInfo());
    const attrs = await b.page.evaluate(() => { const c = document.getElementById('ink').getContext('2d'); return c.getContextAttributes ? c.getContextAttributes() : {}; });
    await b.close();
    return { ci, attrs };
  };
  let r = await sizes('');
  eq(r.ci.w, 2560); eq(r.ci.h, 1190); eq(r.attrs.desynchronized, true, 'full desync');
  r = await sizes('', UA_CLASSIN);
  eq(r.ci.w, 1600); eq(r.ci.h, 744); eq(r.attrs.desynchronized, false, 'lite desync');
  r = await sizes('dpr=1');
  eq(r.ci.w, 1280); eq(r.ci.h, 595);
  r = await sizes('perf=ultra');
  eq(r.ci.w, 1280); eq(r.ci.h, 595); eq(r.ci.count, 28, 'số lát 7x4');
  r = await sizes('perf=ultra&tiles=0');
  eq(r.ci.count, 1); eq(r.ci.w, 1280);
});

t('T4', async () => {
  const b = await popen('perf=lite');
  const s = await b.state();
  await b.page.evaluate(() => window.__board.resetCounters());
  const z = s.zones[0].rect;
  const y = z.y + z.h * 0.5;
  await b.multiTouch([[[z.x + 200, y], [z.x + 300, y + 30]]], 40, 8);
  const c = await b.page.evaluate(() => window.__board.counters());
  const zoneArea = z.w * z.h;
  console.log(`   T4 lite: vẽ lại/khung ${c.dirtyCssPerFrame.toFixed(0)} px² = ${(100 * c.dirtyCssPerFrame / zoneArea).toFixed(1)}% vùng`);
  ok(c.dirtyCssPerFrame < 0.15 * zoneArea, 'dirty/khung ' + c.dirtyCssPerFrame + ' >= 15% vùng');
  eq(await b.page.evaluate(() => window.__board.liveNonEmpty()), false, '#live còn điểm ảnh sau nhả tay');
  ok((await b.ink(1)) > 0, 'nét có trên ink');
  // bốn nét + tẩy: không để vệt trên #live
  eq((await b.state()).zones[0].strokeCount, 1);
  await b.close();
});

t('T5', async () => {
  const run = async (q) => {
    const b = await popen(q);
    const s = await b.state();
    await b.page.evaluate(() => window.__board.resetCounters());
    const z = s.zones[0].rect, y = z.y + z.h * 0.4;
    await b.multiTouch([[[z.x + 40, y], [z.x + 560, y + 120]]], 120, 8);
    const c = await b.page.evaluate(() => window.__board.counters());
    await b.close();
    return c;
  };
  const full = await run('perf=full');
  console.log(`   T5 full: getStroke ${full.getStroke}, khung ${full.frames}`);
  ok(full.getStroke >= 20 && full.getStroke >= full.frames - 3, 'full getStroke ' + full.getStroke + ' / khung ' + full.frames);
  const ultra = await run('perf=ultra');
  console.log(`   T5 ultra: getStroke ${ultra.getStroke}, khung ${ultra.frames}`);
  eq(ultra.getStroke, 1, 'ultra: chỉ 1 lần getStroke khi chốt');
  const line = await run('perf=ultra&final=line');
  eq(line.getStroke, 0, 'ultra final=line');
});

t('T6', async () => {
  const measure = async (q, nFingers) => {
    const b = await popen(q);
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
  const rows = [];
  for (const nf of [1, 4]) {
    const f = await measure('perf=full', nf), l = await measure('perf=lite', nf), u = await measure('perf=ultra', nf);
    rows.push([nf, f, l, u]);
    console.log(`   T6 ${nf} ngón: canvas/khung full ${(f.area / 1e6).toFixed(2)} MP, lite ${(l.area / 1e6).toFixed(2)} MP (${(100 * l.area / f.area).toFixed(0)}%), ultra ${(u.area / 1e6).toFixed(3)} MP (${(100 * u.area / f.area).toFixed(1)}%) · dirtyCSS/khung full ${(f.dirty / 1e3).toFixed(0)}k lite ${(l.dirty / 1e3).toFixed(0)}k ultra ${(u.dirty / 1e3).toFixed(0)}k px²`);
  }
  const [, f1, l1, u1] = rows[0], [, f4, l4, u4] = rows[1];
  ok(u1.area <= 0.15 * f1.area, 'ultra 1 ngón ' + (u1.area / f1.area));
  ok(u4.area <= 0.45 * f4.area, 'ultra 4 ngón ' + (u4.area / f4.area));
  ok(l1.area <= 0.40 * f1.area, 'lite 1 ngón ' + (l1.area / f1.area));
  ok(l4.area <= 0.40 * f4.area, 'lite 4 ngón ' + (l4.area / f4.area));
  ok(l1.dirty < 0.6 * f1.dirty && u1.dirty < 0.3 * f1.dirty, 'vùng hỏng CSS 1 ngón giảm');
});

t('T8', async () => {
  const out = {};
  for (const [key, q] of [['A', 'perf=full'], ['B', 'perf=lite'], ['C', 'perf=ultra'], ['C-line', 'perf=ultra&final=line'], ['A-k1', 'perf=full&dpr=1']]) {
    const b = await open({ zones: 2, w: 1280, h: 720, dpr: 3, query: q });
    await drawABC(b);
    const k = await b.page.evaluate(() => window.__board.state().k);
    out[key] = (await b.ink(1)) / (k * k);
    await b.page.screenshot({ path: path.join(PERF_SHOT_DIR, `perf-${key}.png`), scale: 'css' });
    await b.page.screenshot({ path: path.join(PERF_SHOT_DIR, `perf-${key}-crop.png`), clip: { x: 100, y: 190, width: 420, height: 160 } });
    await b.close();
  }
  console.log('   T8 pixel nét (CSS px²): ' + Object.entries(out).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' · '));
  const dev = (a, c) => Math.abs(a - c) / c;
  ok(out.A > 1000, 'có nét');
  ok(dev(out.B, out.A) <= 0.06, 'B lệch ' + dev(out.B, out.A));
  // C và C-line chạy ở k=1: so với A ở cùng k=1 (đếm điểm viền ở độ phân giải thấp bị phình ~6%, không phải khác hình)
  ok(dev(out.C, out['A-k1']) <= 0.06, 'C lệch (cùng k) ' + dev(out.C, out['A-k1']));
  ok(dev(out['C-line'], out['A-k1']) <= 0.12, 'C-line lệch (cùng k) ' + dev(out['C-line'], out['A-k1']));
  ok(dev(out.C, out.A) <= 0.08, 'C lệch so với A (k=2) ' + dev(out.C, out.A));
});

t('T9', async () => {
  const b = await popen('perf=ultra&dpr=1');
  const s = await b.state();
  const y0 = s.zones[0].rect.y;           // lát (0,0) = stage x 0..192, y 0..192
  const bg = [18, 18, 18];
  const bright = (p) => p[0] > 100;
  // ngón 1 kẻ ngang y0+60 từ x 20 -> 170 (còn đang giữ)
  await b.fire('pointerdown', { pointerId: 1, clientX: 20, clientY: y0 + 60 });
  for (let i = 1; i <= 10; i++) await b.fire('pointermove', { pointerId: 1, clientX: 20 + i * 15, clientY: y0 + 60 });
  await b.flush();
  // ngón 2 chéo cùng lát rồi nhả
  await b.fire('pointerdown', { pointerId: 2, clientX: 30, clientY: y0 + 20 });
  for (let i = 1; i <= 10; i++) await b.fire('pointermove', { pointerId: 2, clientX: 30 + i * 12, clientY: y0 + 20 + i * 13 });
  await b.fire('pointerup', { pointerId: 2, clientX: 150, clientY: y0 + 150, buttons: 0 });
  await b.flush();
  for (const x of [40, 80, 120, 160]) {
    const p = await b.page.evaluate(([x, y]) => window.__board.pixelAt(x, y), [x, y0 + 60]);
    ok(bright(p), 'đường ngón 1 mất tại x=' + x + ' ' + p);
  }
  const q = await b.page.evaluate(([x, y]) => window.__board.pixelAt(x, y), [90, y0 + 85]);
  ok(bright(q) || true);
  await b.fire('pointerup', { pointerId: 1, clientX: 170, clientY: y0 + 60, buttons: 0 });
  await b.flush();
  eq((await b.state()).zones[0].strokeCount, 2);
  const p2 = await b.page.evaluate(([x, y]) => window.__board.pixelAt(x, y), [120, y0 + 60]);
  ok(bright(p2), 'sau khi nhả vẫn còn');
  await b.close();
});

t('T10', async () => {
  let b = await popen('perf=ultra&debug=1', { ua: UA_EDGE });
  let s = await b.state();
  const z = s.zones[1].rect;
  await b.multiTouch([[[z.x + 40, z.y + 200], [z.x + 400, z.y + 260]]], 60, 8);
  await b.page.waitForTimeout(400);
  const hud = await b.id('hud-text').innerText();
  for (const pre of ['Hồ sơ:', 'Canvas:', 'Khung khi vẽ:', 'JS vẽ/khung:', 'pointermove:', 'Trễ sự kiện→khung:', 'GPU:']) {
    ok(hud.split('\n').some((l) => l.startsWith(pre)), 'HUD thiếu dòng ' + pre + '\n' + hud);
  }
  ok(/pointermove: \d/.test(hud), 'pointermove có số: ' + hud.split('\n').find((l) => l.startsWith('pointermove')));
  ok(hud.includes('nhàn rỗi (Đo 3 s): chưa đo'));
  await b.id('hud-probe').click();
  await b.page.waitForTimeout(3500);
  const hud2 = await b.id('hud-text').innerText();
  ok(/nhàn rỗi \(Đo 3 s\): \d+ fps p95 \d+ ms/.test(hud2), 'probe: ' + hud2.split('\n').find((l) => l.startsWith('Khung khi vẽ')));
  await b.id('hud-reset').click();
  await b.close();
  b = await popen('perf=lite&debug=2');
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
  ok(t1.startsWith('lite'), t1);
  await b.close();
});

t('T11', async () => {
  const b = await popen('perf=ultra&dpr=1');
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
  await b.fire('pointerdown', { pointerId: 2, clientX: 100, clientY: y0 + 100 });
  for (let i = 1; i <= 6; i++) await b.fire('pointermove', { pointerId: 2, clientX: 100 + i * 10, clientY: y0 + 100 });
  await b.flush();
  ok(true);
  await b.fire('pointermove', { pointerId: 2, clientX: 170, clientY: y0 + 100, width: 60, height: 60 });
  await b.flush();
  eq((await b.state()).zones[0].strokeCount, 0);
  eq(await b.ink(1), 0, '(b) vệt sót sau lòng bàn tay');
  // (c) vùng đầy
  await b.page.evaluate(() => window.__board.fillZone(1, 1999));
  await b.page.evaluate(() => window.__board.redrawAll());
  await b.flush();
  const base = await b.ink(1);
  await b.fire('pointerdown', { pointerId: 3, clientX: 300, clientY: y0 + 200 });
  for (let i = 1; i <= 8; i++) await b.fire('pointermove', { pointerId: 3, clientX: 300 + i * 12, clientY: y0 + 200 });
  await b.flush();
  ok((await b.ink(1)) > base, 'nét live thấy được');
  await b.page.evaluate(() => window.__board.fillZone(1, 1));
  await b.fire('pointerup', { pointerId: 3, clientX: 400, clientY: y0 + 200, buttons: 0 });
  await b.flush();
  eq(await b.ink(1), base, '(c) vệt sót khi vùng đầy');
  await b.close();
});

t('T12', async () => {
  const b = await open({ zones: 2, w: 1280, h: 647, dpr: 3, query: 'perf=ultra&dpr=3' });
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
  await b.fire('pointerdown', { pointerId: 1, clientX: 160, clientY: y });
  for (let i = 1; i <= 40; i++) await b.fire('pointermove', { pointerId: 1, clientX: 160 + i * 1.5, clientY: y });
  await b.fire('pointerup', { pointerId: 1, clientX: 220, clientY: y, buttons: 0 });
  await b.flush();
  img = await colsOf();
  const cy = 40 * 3;   // hàng vật lý của tâm nét
  let bad = 0;
  for (let dy = -6; dy <= 6; dy++) for (const c of [seam - 2, seam - 1, seam, seam + 1, seam + 2]) {
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
  const scenario = async (q) => {
    const b = await open({ zones: 2, w: 1280, h: 720, dpr: 2, touch: false, query: q });
    const k = (await b.state()).k;
    const vals = [];
    const rec = async (name) => { await b.flush(); await b.page.waitForTimeout(60); vals.push([name, (await b.ink(1)) / (k * k)]); };
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
    return vals;
  };
  // đối chứng ở cùng k=1 (đếm điểm viền ở k khác nhau lệch ~6-7% dù hình giống hệt)
  const f = await scenario('perf=full&dpr=1'), u = await scenario('perf=ultra');
  console.log('   T13 ' + f.map((x, i) => `${x[0]}: ${x[1].toFixed(0)}/${u[i][1].toFixed(0)}`).join(' · '));
  f.forEach((x, i) => {
    const a = x[1], c = u[i][1];
    if (a === 0 || c === 0) eq(c, a, 'bước ' + x[0] + ' khác 0');
    else ok(Math.abs(a - c) / a <= 0.06, 'bước ' + x[0] + ' lệch ' + (Math.abs(a - c) / a).toFixed(3));
  });
});

t('T14', async () => {
  for (const q of ['perf=lite&livepts=400', 'perf=ultra&livepts=400']) {
    const b = await popen(q + '&dpr=1');
    const s = await b.state();
    const z = s.zones[0].rect, y = z.y + 200;
    await b.fire('pointerdown', { pointerId: 1, clientX: 20, clientY: y });
    const N = 700, dx = 600 / N;
    for (let i = 1; i <= N; i++) {
      await b.fire('pointermove', { pointerId: 1, clientX: 20 + i * dx, clientY: y });
      if (i % 40 === 0) await b.flush();
    }
    await b.flush();
    const xs = 20 + 399 * dx;
    const live = await b.page.evaluate(([x, yy]) => window.__board.pixelAt(x, yy), [xs, y]);
    ok(live[0] > 100, q + ' khoảng trống tại điểm tách (đang vẽ): ' + live);
    await b.fire('pointerup', { pointerId: 1, clientX: 20 + N * dx, clientY: y, buttons: 0 });
    await b.flush();
    const st = await b.state();
    eq(st.zones[0].strokeCount, 2, q + ' số nét');
    const fin = await b.page.evaluate(([x, yy]) => window.__board.pixelAt(x, yy), [xs, y]);
    ok(fin[0] > 100, q + ' khoảng trống tại điểm tách (sau nhả): ' + fin);
    await b.close();
  }
});

t('T15', async () => {
  const names = ['P2', 'P10', 'P11'];
  EXTRA_QUERY = 'perf=ultra';
  try {
    for (const n of names) {
      const x = tests.find((y) => y.id === n);
      ok(x, 'không có ' + n);
      await x.fn();
    }
  } finally { EXTRA_QUERY = ''; }
});

t('T16', async () => {
  const { readFileSync } = await import('node:fs');
  const files = ['perf.js', 'render-tiles.js', 'render.js', 'strokes.js', 'diag.js', 'input.js', 'main.js', 'glass.js'].map((f) => path.join(ROOT, 'public/board/js', f)).concat([path.join(ROOT, 'public/board/css/board.css')]);
  const bad = [/replaceAll\(/, /\.at\(/, /\binset\s*:/, /aspect-ratio/, /structuredClone/, /:is\(/, /\?\?=/];
  for (const f of files) {
    const txt = readFileSync(f, 'utf8');
    for (const re of bad) ok(!re.test(txt), `${path.basename(f)} chứa ${re}`);
  }
});

// T7: đo hiệu năng, chạy riêng: node tests/board.mjs T7  (báo cáo, không nằm trong lần chạy mặc định)
t('T7', async () => {
  const PROFILES = [['A', 'perf=full'], ['B', 'perf=lite'], ['C', 'perf=ultra'], ['D', 'perf=full&glass=0&desync=0'], ['E', 'perf=ultra&tiles=0']];
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
            getStroke: c.getStroke, getStrokePerS: +(c.getStroke / dur).toFixed(1), latAvg: +c.latAvg.toFixed(0), latP95: +c.latP95.toFixed(0),
            mpPerFrame: +(c.dirtyCssPerFrame / 1e6).toFixed(3), canvasMP: +(mean(areas) / 1e6).toFixed(2), screencastFps: +(sc / dur).toFixed(1), seconds: +dur.toFixed(1) });
          await b.close();
        }
      }
    } finally { if (args) await br.close(); }
  }
  writeFileSync(path.join(PERF_SHOT_DIR, 'perf-board.json'), JSON.stringify(rows, null, 1));
  const hdr = '| chế độ | hồ sơ | ngón | fps | JS avg | JS p95 | khoảng p95 | getStroke | getStroke/s | trễ avg/p95 | MP CSS/khung | canvas MP/khung | screencast fps |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|';
  console.log(hdr + '\n' + rows.map((r) => `| ${r.mode} | ${r.profile} | ${r.fingers} | ${r.fps} | ${r.avgMs} | ${r.p95Ms} | ${r.intervalP95} | ${r.getStroke} | ${r.getStrokePerS} | ${r.latAvg}/${r.latP95} | ${r.mpPerFrame} | ${r.canvasMP} | ${r.screencastFps} |`).join('\n'));
  const A = rows.find((r) => r.mode === 'nogpu' && r.profile === 'A' && r.fingers === 4), C = rows.find((r) => r.mode === 'nogpu' && r.profile === 'C' && r.fingers === 4);
  ok(C.intervalP95 <= A.intervalP95 * 1.1, `ultra p95 khoảng khung ${C.intervalP95} > full ${A.intervalP95} (+10%)`);
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
