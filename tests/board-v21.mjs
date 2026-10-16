// Kiểm thử trình duyệt cho Bảng v2.1 (PLAN-BOARD-V21): cờ Đề, thanh gộp, nền Trắng/Đen, đồng hồ, Hết giờ, Cắt màn hình.
// Chạy: node tests/board-v21.mjs [W1 W-BG1 ...]   Chromium 109 thật: C109=1 node tests/board-v21.mjs
// Môi trường: Chrome (channel 'chrome'), UA giả ClassIn X, chạm CDP radius 25 (w = h = 50), máy chủ python3 http.server trên public/.
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOT_DIR = process.env.SHOT_DIR || '/Users/haku/Desktop/BAO KHOI/CLAUDE/PROJECTS/bang-nhieu-nguoi-viet/screens';
mkdirSync(SHOT_DIR, { recursive: true });
const ONLY = process.argv.slice(2);
const C109 = process.env.C109 === '1';
const DIR109 = process.env.CHROMIUM109_DIR || `${os.homedir()}/.cache/esl-chromium109`;
const EXE109 = `${DIR109}/browsers/chromium-1041/chrome-mac/Chromium.app/Contents/MacOS/Chromium`;
let chromium;
if (C109) {
  if (!existsSync(EXE109)) { console.log('SKIP: chưa có Chromium 109 ở', DIR109); process.exit(0); }
  ({ chromium } = await import(`${DIR109}/node_modules/playwright-core/index.mjs`));
} else ({ chromium } = await import('playwright'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ClassIn X/6.0.9.1813 Safari/537.36';
const SIZES = [[1280, 720], [1920, 1080]];

function portFree(p) { return new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(p, '127.0.0.1'); }); }
function waitPort(port, tries = 60) {
  return new Promise((resolve, reject) => {
    const once = (n) => { const s = net.connect(port, '127.0.0.1'); s.on('connect', () => { s.destroy(); resolve(); }); s.on('error', () => { s.destroy(); n <= 0 ? reject(new Error('server không mở')) : setTimeout(() => once(n - 1), 100); }); };
    once(tries);
  });
}
let PORT = 5196, BASE = '', server, browser;
const tests = [], results = [];
const t = (id, fn) => tests.push({ id, fn });
const tSH = (id, fn) => tests.push({ id, fn: async () => { if (!C109) await fn(); } });   // ảnh chụp: chỉ trên Chrome
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'eq'}: nhận ${JSON.stringify(a)}, cần ${JSON.stringify(b)}`); };
const ok = (c, m) => { if (!c) throw new Error(m || 'ok'); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const px = (a, b, tol = 8) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

// deck: true thêm deck=1 (bố cục cũ + thanh lớp). Mặc định Đề tắt.
async function pollPage(page, fn, arg, timeout) { const t0 = Date.now(); for (;;) { if (await page.evaluate(fn, arg)) return; if (Date.now() - t0 > timeout) throw new Error('hết giờ chờ'); await sleep(100); } }
async function open({ zones = 3, w = 1280, h = 720, dpr = 1, query = '', hash = '', ua = UA, deck = false, perms = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, deviceScaleFactor: dpr, userAgent: ua });
  if (perms) await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  const log = { errors: [], requests: [] };
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push('console: ' + m.text()); });
  page.on('request', (r) => log.requests.push(r.url()));
  page.on('dialog', async (d) => { await d.dismiss(); });
  await page.addInitScript(() => { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 10 }); });
  const q = `test=1&zones=${zones}${deck ? '&deck=1' : ''}${query ? '&' + query : ''}`;
  const needV2 = deck || /(^|&)(src|deck)=1?/.test(query) && /(^|&)deck=1|(^|&)src=/.test(query);
  for (let i = 0; i < 6; i++) {
    if (i === 0) await page.goto(`${BASE}?${q}${hash}`); else await page.reload();
    try { await pollPage(page, (v2) => window.__board && (!v2 || window.__v2), needV2, 3000); break; }
    catch (e) { if (i === 5) throw e; log.errors.length = 0; log.requests.length = 0; }
  }
  await page.evaluate(() => window.__board.ready);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 25, radiusY: 25, force: 0.5 })) });
  const api = {
    ctx, page, cdp, log, w, h,
    state: () => page.evaluate(() => window.__board.state()),
    flush: () => page.evaluate(() => window.__board.flush()),
    ink: (id) => page.evaluate((i) => window.__board.inkPixels(i), id),
    px: (x, y) => page.evaluate(([a, c]) => window.__board.pixelAt(a, c), [x, y]),
    // Playwright 1.29 (Chromium 109) đo bằng eval nên bị CSP chặn: tự thăm dò bằng evaluate thường
    async waitFn(fn, arg, timeout = 8000) { const t0 = Date.now(); for (;;) { if (await page.evaluate(fn, arg)) return; if (Date.now() - t0 > timeout) throw new Error('hết giờ chờ điều kiện'); await sleep(100); } },
    async waitVis(testid, timeout = 8000) { const t0 = Date.now(); for (;;) { if (await api.vis(testid)) return; if (Date.now() - t0 > timeout) throw new Error('không thấy ' + testid); await sleep(100); } },
    id: (testid) => page.locator(`[data-testid="${testid}"]`),
    vis: async (testid) => (await page.locator(`[data-testid="${testid}"]`).count()) > 0 && (await page.locator(`[data-testid="${testid}"]`).first().isVisible()),
    async box(testid) { const b = await page.locator(`[data-testid="${testid}"]`).first().boundingBox(); if (!b) throw new Error('không thấy ' + testid); return b; },
    async tap(x, y, hold = 40) { await touch('touchStart', [[x, y, 1]]); await sleep(hold); await touch('touchEnd', []); await sleep(60); },
    async tap2(p1, p2, hold = 40) { await touch('touchStart', [[p1[0], p1[1], 1], [p2[0], p2[1], 2]]); await sleep(hold); await touch('touchEnd', []); await sleep(60); },
    async tapId(testid) { const b = await api.box(testid); await api.tap(b.x + b.width / 2, b.y + b.height / 2); },
    async draw(strokes, steps = 24) {
      const pts = (f) => strokes.map((p, i) => [p[0][0] + (p[1][0] - p[0][0]) * f, p[0][1] + (p[1][1] - p[0][1]) * f, i + 1]);
      await touch('touchStart', pts(0));
      for (let i = 1; i <= steps; i++) { await touch('touchMove', pts(i / steps)); await sleep(8); }
      await touch('touchEnd', []);
      await sleep(80);
      await api.flush();
    },
    async shot(name) { if (C109) return; await page.screenshot({ path: path.join(SHOT_DIR, `v21-${name}.png`) }); },
    async close() { await ctx.close(); },
  };
  return api;
}
const zoneLine = (s, id, dy = 0) => { const r = s.zones[id - 1].rect; const y = r.y + r.h * 0.5 + dy; return [[r.x + r.w * 0.2, y], [r.x + r.w * 0.6, y + 30]]; };
const strokesOf = async (b) => (await b.state()).zones.map((z) => z.strokeCount).join();
const NODECK_RE = /\/(v2|classbar|cards|deck-dialog|tasks|classroom)\.js|\/math\/|\/packs\//;
const noErr = (b) => eq(b.log.errors.length, 0, b.log.errors.join(' | '));
export { t, eq, ok, open, sleep, zoneLine, strokesOf, noErr, px, SIZES };

// ================= BƯỚC 1: cờ Đề =================
t('W1', async () => {   // Đề tắt: không tải mã Đề, không thanh lớp, không ghi storage
  const b = await open({ zones: 3 });
  const bad = b.log.requests.filter((u) => NODECK_RE.test(u));
  eq(bad.length, 0, 'đã tải mã Đề: ' + bad.join(' '));
  ok(!(await b.vis('classbar')), 'còn thanh lớp');
  eq(await b.id('z1-card').count(), 0, 'còn thẻ đề');
  const st = await b.state();
  await b.draw([zoneLine(st, 1), zoneLine(st, 2)]);
  eq(await strokesOf(b), '1,1,0');
  await sleep(700);
  eq(await b.page.evaluate(() => sessionStorage.length + localStorage.length), 0, 'có ghi storage');
  noErr(b);
  await b.close();
});
t('W2', async () => {   // ?deck=1 bật lại
  const b = await open({ zones: 3, deck: true });
  ok(await b.vis('classbar'), 'thiếu classbar');
  ok(await b.vis('deck-open'), 'thiếu Chọn đề');
  noErr(b);
  await b.close();
});
t('W3', async () => {   // link từ Hub (src=) tự bật Đề
  const b = await open({ zones: 3, query: 'src=lib:food-and-drink&kind=write' });
  await b.waitVis('z1-card');
  ok(await b.vis('classbar'));
  noErr(b);
  await b.close();
});
// ================= BƯỚC 2: thanh gộp =================
const rectsOf = (b, sel) => b.page.evaluate((q) => [...document.querySelectorAll(q)].filter((e) => e.offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return { id: e.dataset.testid || e.className, x: r.x, y: r.y, w: r.width, h: r.height }; }), sel);
const noOverlap = (boxes, label) => {
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], c = boxes[j];
    ok(a.x + a.w <= c.x + 0.5 || c.x + c.w <= a.x + 0.5 || a.y + a.h <= c.y + 0.5 || c.y + c.h <= a.y + 0.5, `${label}: chồng nhau ${a.id} / ${c.id}`);
  }
};
t('W-LAY1', async () => {   // thanh gộp: nút ≥ 56·s, không chồng, không tràn, nhãn đủ chữ
  for (const [w, h] of [[1280, 720], [1366, 768], [1920, 1080]]) {
    const b = await open({ zones: 3, w, h });
    const s = (await b.state()).s;
    const bar = await b.box('tb-mid').catch(() => null);
    ok(bar, 'thiếu tb-mid');
    const tb = await b.page.evaluate(() => { const e = document.getElementById('topbar'); const r = e.getBoundingClientRect(); return { h: r.height, sw: e.scrollWidth, cw: e.clientWidth, cls: document.documentElement.className }; });
    eq(tb.h, Math.round(64 * s), `${w}x${h}: thanh cao ${tb.h}`);
    ok(tb.sw <= tb.cw + 1, `${w}x${h}: thanh tràn ${tb.sw} > ${tb.cw}`);
    ok(tb.cls.indexOf('bar-merged') >= 0 && !(await b.vis('toolrow')), `${w}x${h}: phải là thanh gộp`);
    const mid = await rectsOf(b, '[data-testid="tb-mid"] button');
    ok(mid.length >= 3, 'ít nút trong tb-mid: ' + mid.length);
    for (const x of mid) ok(x.w >= 56 * s - 0.6 && x.h >= 56 * s - 0.6, `${w}x${h}: nút ${x.id} nhỏ ${x.w}x${x.h}`);
    const all = await rectsOf(b, '#topbar button');
    noOverlap(all, `${w}x${h}`);
    const dis = await b.page.evaluate(() => { const e = document.querySelector('[data-testid="brand-disclaimer"]'); const r = e.getBoundingClientRect(); const g = document.querySelector('[data-testid="tools-grp"]').getBoundingClientRect(); return { right: r.right, w: r.width, sw: e.scrollWidth, cw: e.clientWidth, text: e.textContent, gx: g.x, vis: getComputedStyle(e).visibility }; });
    ok(dis.text.indexOf('Công cụ bổ trợ, không phải tính năng chính thức của ClassIn') === 0 && dis.sw <= dis.cw + 1 && dis.vis === 'visible', `${w}x${h}: nhãn bị cắt ${JSON.stringify(dis)}`);
    ok(dis.right <= dis.gx + 0.5, `${w}x${h}: nhãn chồng cụm công cụ`);
    await b.shot(`bar-${w}`);
    noErr(b);
    await b.close();
  }
});
t('W-LAY1b', async () => {   // hai hàng ở cửa sổ hẹp
  const b = await open({ zones: 3, w: 960, h: 540 });
  ok(await b.vis('toolrow'), 'thiếu toolrow');
  const s = (await b.state()).s;
  const tr = await b.box('toolrow');
  eq(Math.round(tr.height), Math.round(64 * s), 'toolrow cao');
  const boxes = await rectsOf(b, '#toolrow button');
  ok(boxes.length >= 3);
  for (const x of boxes) ok(x.w >= 56 * s - 0.6 && x.h >= 56 * s - 0.6, `nút ${x.id} nhỏ`);
  noOverlap(boxes, '960x540');
  ok(!(await b.vis('tb-mid')) || (await b.box('tb-mid')).width < 2, 'tb-mid phải rỗng khi hai hàng');
  await b.shot('bar-960');
  noErr(b);
  await b.close();
});
t('W-LAY2', async () => {   // vùng viết cao thêm 56·s: 1280x720 một vùng cao 656
  const b = await open({ zones: 1 });
  const st = await b.state();
  eq(st.zones[0].rect.h, 656, 'vùng viết cao');
  eq(st.zones[0].rect.y, 64);
  const b2 = await open({ zones: 3, deck: true });
  eq((await b2.state()).zones[0].rect.y, 120, 'Đề bật giữ bố cục cũ 56 + 64');
  await b2.close(); await b.close();
});

// ================= BƯỚC 3: màu nền Trắng / Đen =================
const lum = ([r, g, bl]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const lastColor = (b, z = 1) => b.page.evaluate((i) => { const s = window.__board.lastStroke(i); return s && s.color; }, z);
const strokeColors = (b, z = 1) => b.page.evaluate((i) => window.__board.state().zones[i - 1].color, z);
const openLight = async (b) => { await b.tapId('paper-open'); await b.waitVis('paper-sheet'); await b.tapId('board-light'); };
const openDark = async (b) => { await b.tapId('board-dark'); };

t('W-BG1', async () => {   // nền Trắng
  const b = await open({ zones: 2, query: 'bg=light' });
  eq(await b.page.evaluate(() => document.documentElement.getAttribute('data-board')), 'light');
  const st = await b.state();
  const r = st.zones[0].rect;
  ok(px(await b.px(r.x + 50, r.y + 50), [255, 255, 255], 0), 'chỗ trống phải trắng: ' + (await b.px(r.x + 50, r.y + 50)));
  await b.draw([zoneLine(st, 1)]);
  eq(await lastColor(b), '#1C1C1E', 'mực chính nền Trắng là Đen');
  ok((await b.ink(1)) > 0, 'inkPixels > 0');
  eq(await strokeColors(b), '#1C1C1E');
  noErr(b);
  await b.close();
});
t('W-BG2', async () => {   // đổi nền: màu nét đổi theo cặp, song ánh, vẽ lại 1 lượt
  const b = await open({ zones: 1 });
  const st = await b.state();
  await b.draw([zoneLine(st, 1, -80)]);                      // trắng
  await b.tapId('z1-color-yellow');
  await b.draw([zoneLine(st, 1, 20)]);                       // vàng
  const colors = () => b.page.evaluate(() => { const z = window.__board.state().zones[0]; return z.color; });
  eq(await colors(), '#FFD43B');
  await b.page.evaluate(() => window.__board.resetCounters());
  await openLight(b);
  await b.flush(); await sleep(150);
  const c = await b.page.evaluate(() => window.__board.counters());
  ok(c.frames >= 1 && c.frames <= 2, 'đổi nền vẽ lại 1 lượt (≤ 2 khung): ' + c.frames);
  eq(await colors(), '#E67700', 'bút vàng -> vàng đậm');
  eq(await lastColor(b), '#E67700');
  await b.tapId('paper-done');
  await b.page.evaluate(() => window.__board.resetCounters());
  await b.draw([zoneLine(st, 1, 100)]);
  const c2 = await b.page.evaluate(() => window.__board.counters());
  ok(c2.finalTiles <= 4, 'một nét sau đổi nền chỉ chạm ≤ 4 lát: ' + c2.finalTiles);
  // trở lại Đen
  await b.tapId('paper-open'); await b.waitVis('paper-sheet'); await openDark(b); await b.tapId('paper-done');
  eq(await colors(), '#FFD43B', 'đổi lại về Vàng');
  eq(await lastColor(b), '#FFD43B');
  await b.tapId('z1-color-white');
  await b.draw([zoneLine(st, 1, 140)]);
  eq(await lastColor(b), '#FFFFFF', 'mực trắng nền Đen');
  noErr(b);
  await b.close();
});
t('W-BG3', async () => {   // hoàn tác sau đổi nền; tẩy trên nền Trắng
  const b = await open({ zones: 1 });
  const st = await b.state();
  await b.draw([zoneLine(st, 1, -60)]);
  await b.tapId('z1-clear');
  eq(await strokesOf(b), '0');
  await openLight(b); await b.tapId('paper-done');
  await b.tapId('z1-undo');
  eq(await strokesOf(b), '1', 'hoàn tác trả nét');
  eq(await lastColor(b), '#1C1C1E', 'nét được hoàn tác mang màu mới');
  await b.flush();
  const before = await b.ink(1);
  ok(before > 0);
  // tẩy dọc theo đường vừa vẽ
  const [[x0, y0], [x1, y1]] = zoneLine(st, 1, -60);
  await b.tapId('z1-eraser');
  await b.draw([[[x0 - 10, y0 - 4], [x1 + 10, y1 + 4]]]);
  await b.flush();
  eq(await strokesOf(b), '0', 'tẩy xoá nét');
  ok((await b.ink(1)) < before, 'inkPixels giảm');
  ok(px(await b.px((x0 + x1) / 2, (y0 + y1) / 2), [255, 255, 255], 0), 'chỗ tẩy về trắng');
  noErr(b);
  await b.close();
});
t('W-BG4', async () => {   // lớp kẻ theo nền; thuộc tính data-board
  const b = await open({ zones: 2 });
  await b.tapId('paper-open'); await b.waitVis('paper-sheet');
  await b.tapId('paper-target-all'); await b.tapId('paper-grid');
  await openDark(b); await b.tapId('board-light');
  eq(await b.page.evaluate(() => document.documentElement.getAttribute('data-board')), 'light');
  const bg = await b.page.evaluate(() => decodeURIComponent(getComputedStyle(document.querySelector('[data-testid="z1-paper"]')).backgroundImage));
  ok(bg.indexOf('rgba(28,28,30') >= 0, 'lớp kẻ nền Trắng phải dùng mực đen: ' + bg.slice(0, 160));
  await b.tapId('board-dark');
  const bg2 = await b.page.evaluate(() => decodeURIComponent(getComputedStyle(document.querySelector('[data-testid="z1-paper"]')).backgroundImage));
  ok(bg2.indexOf('rgba(255,255,255') >= 0 && bg2.indexOf('rgba(28,28,30') < 0, 'về nền Đen');
  eq(await b.page.evaluate(() => document.documentElement.getAttribute('data-board')), 'dark');
  noErr(b);
  await b.close();
});
t('W-BG5', async () => {   // tương phản của huy hiệu vùng trên nền Trắng và Đen
  for (const q of ['bg=light', '']) {
    const b = await open({ zones: 2, query: q });
    const r = await b.page.evaluate(() => {
      const e = document.querySelector('.zone-badge'); const cs = getComputedStyle(e);
      const bd = getComputedStyle(document.documentElement).getPropertyValue('--board').trim();
      return { color: cs.color, bg: cs.backgroundColor, board: bd };
    });
    const num = (x) => x.match(/[\d.]+/g).map(Number);
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const board = hex(r.board);
    const bgc = num(r.bg), a = bgc[3] === undefined ? 1 : bgc[3];
    const eff = [0, 1, 2].map((i) => bgc[i] * a + board[i] * (1 - a));
    const cr = contrast(num(r.color).slice(0, 3), eff);
    ok(cr >= 4.5, `${q || 'dark'}: tương phản huy hiệu ${cr.toFixed(2)} < 4,5 (${JSON.stringify(r)})`);
    await b.close();
  }
});
t('W-BG6', async () => {   // ?bg=light mở thẳng; đổi nền cập nhật URL; không storage
  const b = await open({ zones: 2, query: 'bg=light' });
  eq(await b.page.evaluate(() => window.__board.theme()), 'light');
  await b.tapId('paper-open'); await b.waitVis('paper-sheet'); await b.tapId('board-dark');
  ok((await b.page.evaluate(() => location.search)).indexOf('bg=light') < 0, 'bỏ bg=light khi về Đen');
  await b.tapId('board-light');
  ok((await b.page.evaluate(() => location.search)).indexOf('bg=light') >= 0, 'thêm bg=light');
  eq(await b.page.evaluate(() => sessionStorage.length + localStorage.length), 0, 'không storage');
  noErr(b);
  await b.close();
});

// ================= BƯỚC 4: đồng hồ có biểu tượng =================
const clk = (b) => b.page.evaluate(() => window.__board.clock());
const disp = async (b) => (await b.id('timer-display').textContent()).trim();
t('W-CLK1', async () => {   // một chạm bật, khay, đặt giờ, chạy; không đánh thức renderer
  const b = await open({ zones: 2 });
  eq(await b.id('timer-toggle').getAttribute('aria-pressed'), 'false');
  ok(!(await b.vis('timer-display')), 'tắt thì ẩn số giờ');
  await b.tapId('timer-toggle');
  eq(await disp(b), '01:00'); ok(await b.vis('timer-pop'), 'bật thì mở khay');
  eq(await b.id('timer-toggle').getAttribute('aria-pressed'), 'true');
  await b.tapId('timer-set-30');
  eq(await disp(b), '00:30'); ok(!(await b.vis('timer-pop')), 'chọn giờ thì đóng khay');
  await b.page.evaluate(() => window.__board.resetCounters());
  await b.tapId('timer-start');
  ok((await clk(b)).running, 'đang chạy');
  eq(await b.id('timer-start').getAttribute('aria-label'), 'Tạm dừng');
  await sleep(1500);
  const c = await b.page.evaluate(() => window.__board.counters());
  eq(c.frames, 0, 'đồng hồ không đánh thức renderer'); eq(c.dirtyCssTotal, 0);
  const left = (await clk(b)).left;
  ok(left <= 29 && left >= 27, 'trôi 1,5 giây: ' + left);
  noErr(b);
  await b.close();
});
t('W-CLK2', async () => {   // tạm dừng, đặt lại từ khay, bấm giờ xuôi, tắt bằng ⏱
  const b = await open({ zones: 2 });
  await b.tapId('timer-toggle'); await b.tapId('timer-set-30'); await b.tapId('timer-start');
  await sleep(1200);
  await b.tapId('timer-start');
  const l1 = (await clk(b)).left; ok(l1 < 30);
  await sleep(700);
  eq((await clk(b)).left, l1, 'tạm dừng không trôi');
  eq((await clk(b)).running, false);
  ok(!(await b.vis('timer-reset')), 'thanh thu gọn: Đặt lại chỉ có trong khay');
  await b.tapId('timer-display'); ok(await b.vis('timer-pop'));
  await b.tapId('timer-pop-reset');
  eq(await disp(b), '00:30', 'Đặt lại về giờ đã chọn'); ok(!(await b.vis('timer-pop')));
  await b.tapId('timer-display'); await b.tapId('timer-set-up');
  eq(await disp(b), '00:00');
  await b.tapId('timer-start'); await sleep(1300);
  ok((await clk(b)).left >= 1, 'đếm xuôi');
  await b.tapId('timer-toggle');
  eq(await b.id('timer-toggle').getAttribute('aria-pressed'), 'false', 'chạm ⏱ lần nữa thì tắt');
  ok(!(await b.vis('timer-display')) && !(await b.vis('timer-start')));
  eq((await clk(b)).mode, 'off');
  noErr(b);
  await b.close();
});
t('W-CLK3', async () => {   // ≤ 10 giây: đổi màu và nhấp nháy bằng đổi class
  const b = await open({ zones: 2, query: 'timerSpeed=4' });
  await b.tapId('timer-toggle'); await b.tapId('timer-set-30'); await b.tapId('timer-start');
  await b.waitFn(() => window.__board.clock().left <= 10, null, 8000);
  const seen = new Set();
  for (let i = 0; i < 9; i++) {
    const r = await b.page.evaluate(() => { const e = document.querySelector('[data-testid="timer-display"]'); return [e.classList.contains('is-warn'), e.classList.contains('is-blink'), getComputedStyle(e).color]; });
    ok(r[0], 'phải có is-warn');
    seen.add(r[1]);
    await sleep(100);
  }
  ok(seen.has(true) && seen.has(false), 'is-blink phải đổi qua lại: ' + [...seen]);
  const col = await b.page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="timer-display"]')).color);
  ok(col === 'rgb(255, 179, 64)', 'màu cảnh báo: ' + col);
  await b.shot('clock-warn-' + b.w);
  noErr(b);
  await b.close();
});
t('W-CLK4', async () => {   // nút cụm + khay ≥ 56·s, không chồng, không tràn, không chồng nhãn
  for (const [w, h] of [[1280, 720], [1366, 768], [1920, 1080], [960, 540]]) {
    const b = await open({ zones: 3, w, h });
    const s = (await b.state()).s;
    await b.tapId('timer-toggle');
    ok(await b.vis('timer-pop'), 'khay mở');
    const boxes = await rectsOf(b, '[data-testid="tools-grp"] button');
    ok(boxes.length >= 8, 'ít nút: ' + boxes.map((x) => x.id));
    for (const x of boxes) ok(x.w >= 56 * s - 0.6 && x.h >= 56 * s - 0.6, `${w}x${h}: nút ${x.id} nhỏ ${x.w}x${x.h}`);
    noOverlap(boxes, `${w}x${h}`);
    const tray = await b.box('timer-pop');
    ok(tray.x >= 0 && tray.x + tray.width <= w + 0.5 && tray.y + tray.height <= h, `${w}x${h}: khay tràn ${JSON.stringify(tray)}`);
    const dis = await b.page.evaluate(() => { const r = document.querySelector('[data-testid="brand-disclaimer"]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    ok(tray.y >= dis.y + dis.h - 0.5, `${w}x${h}: khay chồng nhãn`);
    await b.shot(`clock-tray-${w}`);
    noErr(b);
    await b.close();
  }
});

// ================= BƯỚC 5: chạm để bỏ màn Hết giờ =================
const startTimeup = async (b, set = '30') => {
  await b.tapId('timer-toggle'); await b.tapId('timer-set-' + set); await b.tapId('timer-start');
  await b.waitFn(() => { const e = document.querySelector('[data-testid="z1-lock"]'); return !!(e && !e.hidden); }, null, 9000);
};
t('W-TU1', async () => {
  const b = await open({ zones: 3, query: 'timerSpeed=30' });
  const st = await b.state();
  await b.draw([zoneLine(st, 1)]);
  eq(await strokesOf(b), '1,0,0', 'viết bình thường khi đồng hồ chưa chạy');
  await startTimeup(b);
  for (let z = 1; z <= 3; z++) ok(await b.vis(`z${z}-lock`), 'lớp khoá vùng ' + z);
  ok((await b.id('z1-lock').textContent()).indexOf('Time’s up!') === 0);
  ok((await b.id('z1-lock').textContent()).indexOf('Chạm để viết tiếp') > 0);
  await b.shot('timeup-3z-dark-' + b.w);
  await b.draw([zoneLine(st, 1, 40)]);     // trong ân hạn: không ra nét, lớp vẫn hiện
  eq(await strokesOf(b), '1,0,0', 'trong ân hạn không ra nét');
  ok(await b.vis('z1-lock'), 'lớp vẫn hiện trong ân hạn');
  await sleep(700);
  await b.tap(st.zones[1].rect.x + 120, st.zones[1].rect.y + 200);
  for (let z = 1; z <= 3; z++) ok(!(await b.vis(`z${z}-lock`)), 'chạm bỏ lớp vùng ' + z);
  eq(await strokesOf(b), '1,0,0', 'cú chạm bỏ lớp không ra nét');
  await sleep(350);
  await b.draw([zoneLine(st, 2, 40)]);
  eq(await strokesOf(b), '1,1,0', 'viết tiếp được');
  eq((await clk(b)).left, 0); eq((await disp(b)), '00:00');
  const col = await b.page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="timer-display"]')).color);
  eq(col, 'rgb(255, 105, 97)', 'đồng hồ vẫn đỏ');
  noErr(b);
  await b.close();
});
t('W-TU2', async () => {   // hai ngón chạm cùng lúc để bỏ lớp: không ra nét
  const b = await open({ zones: 3, query: 'timerSpeed=30' });
  const st = await b.state();
  await startTimeup(b);
  await sleep(750);
  const r1 = st.zones[0].rect, r2 = st.zones[1].rect;
  await b.tap2([r1.x + 100, r1.y + 200], [r2.x + 100, r2.y + 200]);
  for (let z = 1; z <= 3; z++) ok(!(await b.vis(`z${z}-lock`)), 'lớp phải ẩn');
  eq(await strokesOf(b), '0,0,0', 'hai ngón cùng chạm không ra nét');
  noErr(b);
  await b.close();
});
t('W-TU3', async () => {   // chạm Bắt đầu lúc lớp hiện: bỏ lớp và chạy lại từ đầu
  const b = await open({ zones: 3, query: 'timerSpeed=30' });
  await startTimeup(b, '120');
  await sleep(700);
  await b.tapId('timer-start');
  ok(!(await b.vis('z1-lock')), 'lớp ẩn');
  const c = await clk(b);
  ok(c.running && c.left >= 100, 'chạy lại từ đầu: ' + JSON.stringify(c));
  noErr(b);
  await b.close();
});
tSH('SH-TU', async () => {   // ảnh Hết giờ
  for (const [w, h] of SIZES) for (const bg of ['dark', 'light']) for (const n of [1, 3]) {
    const b = await open({ zones: n, w, h, query: 'timerSpeed=30' + (bg === 'light' ? '&bg=light' : '') });
    await startTimeup(b);
    await b.page.waitForTimeout(200);
    await b.shot(`timeup-${n}z-${bg}-${w}`);
    noErr(b);
    await b.close();
  }
});

// ================= ảnh chụp (xem lại bằng mắt) =================
async function pen(b, z, key) {
  if (!(await b.vis(`z${z}-color-${key}`))) await b.tapId(`z${z}-pen`);
  await b.tapId(`z${z}-color-${key}`);
}
async function scribble(b, st) {   // vài nét nhiều màu trong mỗi vùng
  const keys = (await b.page.evaluate(() => document.documentElement.getAttribute('data-board'))) === 'light'
    ? ['black', 'red', 'yellow', 'green', 'blue', 'orange'] : ['white', 'red', 'yellow', 'green', 'blue', 'orange'];
  for (const z of st.zones) {
    for (let i = 0; i < 4; i++) {
      await pen(b, z.id, keys[(i + z.id) % 6]);
      const r = z.rect, y = r.y + 80 + i * 70;
      await b.draw([[[r.x + r.w * 0.15, y], [r.x + r.w * 0.8, y + 40 * (i % 2 ? -1 : 1)]]], 14);
    }
  }
}
tSH('SH-BOARD', async () => {   // nền Đen và Trắng, 1–4 vùng
  for (const [w, h] of SIZES) for (const bg of ['dark', 'light']) for (const n of [1, 2, 3, 4]) {
    const b = await open({ zones: n, w, h, query: bg === 'light' ? 'bg=light' : '' });
    await b.tapId('paper-open'); await b.waitVis('paper-sheet');
    await b.tapId('paper-target-all'); await b.tapId(['lines4', 'oli', 'grid', 'axes'][n - 1] === 'x' ? 'paper-grid' : 'paper-' + ['lines4', 'oli', 'grid', 'axes'][n - 1]);
    await b.tapId('paper-done');
    await scribble(b, await b.state());
    await b.shot(`${n}z-${bg}-${w}`);
    noErr(b);
    await b.close();
  }
});
tSH('SH-SHEET', async () => {   // tấm Nền có hàng Màu bảng; trục toạ độ nền Trắng
  for (const [w, h] of SIZES) {
    const b = await open({ zones: 2, w, h });
    await b.tapId('paper-open'); await b.waitVis('paper-sheet');
    await b.shot(`paper-sheet-${w}`);
    if (w === 1280) {
      await b.tapId('board-light'); await b.tapId('paper-target-all'); await b.tapId('paper-axes'); await b.tapId('paper-done');
      await scribble(b, await b.state());
      await b.shot('light-axes-1280');
    }
    noErr(b);
    await b.close();
  }
});
tSH('SH-CLOCK', async () => {   // đồng hồ tắt / khay / chạy / sắp hết, hai nền
  for (const [w, h] of SIZES) {
    let b = await open({ zones: 3, w, h, query: 'timerSpeed=3' });
    await b.shot(`clock-off-${w}`);
    await b.tapId('timer-toggle'); await b.tapId('timer-set-30');
    await b.tapId('timer-display');
    await b.shot(`clock-tray-${w}`);
    await b.tapId('timer-pop-start'); await sleep(2200);
    await b.shot(`clock-run-${w}`);
    await b.waitFn(() => window.__board.clock().left <= 8, null, 15000);
    await b.shot(`clock-warn-${w}`);
    noErr(b); await b.close();
    b = await open({ zones: 3, w, h, query: 'bg=light' });
    await b.tapId('timer-toggle'); await b.shot(`clock-tray-light-${w}`);
    await b.close();
  }
});
tSH('SH-DECK', async () => {   // ?deck=1: thanh lớp cũ + đồng hồ mới + nút Cắt
  for (const [w, h] of SIZES) {
    const b = await open({ zones: 3, w, h, deck: true });
    await b.page.evaluate((c) => window.__v2.load(c), { source: { type: 'lib', id: 'food-and-drink', title: 'Food and Drink' }, kind: 'write', mode: 'common', order: 'seq', count: 10, timer: { mode: 'down', total: 60 } });
    await b.page.waitForTimeout(300);
    await b.shot(`deck-3z-${w}`);
    await b.tapId('timer-display');
    await b.shot(`deck-tray-${w}`);
    noErr(b);
    await b.close();
  }
});

// ================= BƯỚC 7: trang thử cắt màn hình =================
t('W-ST1', async () => {   // snip-test.html: mở không lỗi, mọi nút cho kết quả bằng chữ
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true, userAgent: UA });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  let downloads = 0; page.on('download', () => { downloads++; });
  const url = new URL('snip-test.html', BASE).href;
  for (let i = 0; i < 5; i++) { try { if (i === 0) await page.goto(url); else await page.reload(); await pollPage(page, () => (document.querySelector('[data-testid="st-info"]') || { textContent: '' }).textContent.length > 20, null, 3000); break; } catch (e) { if (i === 4) throw e; errs.length = 0; } }
  const info = await page.locator('[data-testid="st-info"]').textContent();
  ok(info.indexOf('isSecureContext: true') >= 0 && info.indexOf('ClipboardItem: true') >= 0, 'thông tin: ' + info);
  await page.bringToFront();
  for (const id of ['st-copy-text', 'st-copy-img', 'st-dl-blob', 'st-dl-data', 'st-perf']) await page.locator(`[data-testid="${id}"]`).click();
  await sleep(800);
  for (const id of ['st-r-text', 'st-r-img', 'st-r-dl', 'st-r-perf']) {
    const txt = await page.locator(`[data-testid="${id}"]`).textContent();
    ok(/^(Được|Không được):/.test(txt), id + ' chưa có kết quả: ' + txt);
    ok(txt.indexOf('Được:') === 0, id + ' không đạt trên Chrome: ' + txt);
  }
  ok(downloads >= 1, 'chưa thấy sự kiện tải: ' + downloads);
  ok((await page.locator('[data-testid="st-r-all"]').textContent()).indexOf('Sao chép ảnh') >= 0, 'kết quả gộp');
  const over = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1);
  ok(!over, 'trang thử phải vừa 1280x720 không cuộn');
  await page.screenshot({ path: path.join(SHOT_DIR, 'v21-snip-test-1280.png') });
  eq(errs.length, 0, errs.join(' | '));
  await ctx.close();
});

// ================= BƯỚC 8: cắt màn hình =================
const SNIP_URL_RE = /\/js\/snip\.js/;
const startSel = async (b) => { await b.tapId('snip-open'); await b.waitVis('snip-layer'); };
const dragSel = async (b, x0, y0, x1, y1) => { await b.draw([[[x0, y0], [x1, y1]]], 12); await b.waitVis('snip-ok'); };
const imgSize = (b) => b.page.evaluate(() => { const i = document.querySelector('[data-testid="snip-img"]'); return [i.naturalWidth, i.naturalHeight]; });
t('W-SNIP1', async () => {   // chọn vùng 300x200 qua 2 vùng; trong lúc chọn không ra nét
  const b = await open({ zones: 3 });
  const st = await b.state();
  await b.draw([zoneLine(st, 1)]);
  await startSel(b);
  await b.draw([zoneLine(st, 1, 120)]);
  eq(await strokesOf(b), '1,0,0', 'đang chọn vùng cắt: bảng không nhận nét');
  await dragSel(b, 330, 200, 630, 400);
  const bx = await b.box('snip-box');
  ok(Math.abs(bx.width - 300) <= 8 && Math.abs(bx.height - 200) <= 8, 'khung ' + bx.width + 'x' + bx.height);
  await b.shot('snip-confirm-' + b.w);
  await b.tapId('snip-ok');
  await b.waitVis('snip-result');
  const sz = await imgSize(b);
  ok(Math.abs(sz[0] - 300) <= 8 && Math.abs(sz[1] - 200) <= 8, 'ảnh ' + sz);
  const q = await b.page.evaluate(() => window.__snip.q);
  eq(sz[0], await b.page.evaluate(() => window.__snip.w));
  eq(q, 1, 'q ở DPR 1');
  ok(await b.vis('snip-copy') && await b.vis('snip-save') && await b.vis('snip-full'), 'thiếu nút kết quả');
  await b.tapId('snip-close');
  ok(!(await b.vis('snip-result')) && !(await b.vis('snip-layer')), 'đóng hết');
  await b.draw([zoneLine(st, 2)]);
  eq(await strokesOf(b), '1,1,0', 'sau Đóng vẽ lại được');
  noErr(b);
  await b.close();
});
t('W-SNIP1b', async () => {   // vùng quá nhỏ = chạm nhầm; Cả bảng; Huỷ; Chọn lại; DPR 3 -> q = 2
  const b = await open({ zones: 2, dpr: 3 });
  await startSel(b);
  await b.draw([[[400, 300], [410, 305]]], 4);
  ok(!(await b.vis('snip-confirm')), 'vùng nhỏ bị bỏ');
  ok(await b.vis('snip-layer'), 'vẫn ở chế độ chọn');
  await b.draw([[[100, 150], [500, 450]]], 6);
  await b.waitVis('snip-ok');
  await b.tapId('snip-redo');
  ok(!(await b.vis('snip-confirm')), 'Chọn lại');
  await b.tapId('snip-all');
  await b.waitVis('snip-result');
  const r = await b.page.evaluate(() => window.__snip);
  eq(r.q, 2, 'q = min(k, 2)');
  const st = await b.state();
  eq(r.w, 2 * 1280); eq(r.h, 2 * (720 - 64));
  await b.tapId('snip-close');
  await startSel(b); await b.tapId('snip-cancel');
  ok(!(await b.vis('snip-layer')), 'Huỷ');
  noErr(b);
  await b.close();
});
const decodeShot = (b, buf) => b.page.evaluate(async (b64) => {
  const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
  const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  return { w: c.width, h: c.height, d: Array.from(g.getImageData(0, 0, c.width, c.height).data) };
}, buf.toString('base64'));
t('W-SNIP2', async () => {   // điểm ảnh của ảnh cắt khớp màn hình ở nền, mực, đường kẻ; cả hai nền
  for (const bg of ['dark', 'light']) {
    const b = await open({ zones: 2, query: bg === 'light' ? 'bg=light' : '' });
    await b.tapId('paper-open'); await b.waitVis('paper-sheet');
    await b.tapId('paper-target-all'); await b.tapId('paper-grid'); await b.tapId('paper-done');
    const st = await b.state();
    await b.draw([zoneLine(st, 1)]);
    const crop = { x: 60, y: 150, width: 400, height: 300 };
    const shot = await b.page.screenshot({ clip: crop });
    const ref = await decodeShot(b, shot);
    await startSel(b);
    await dragSel(b, crop.x, crop.y, crop.x + crop.width, crop.y + crop.height);
    await b.tapId('snip-ok');
    await b.waitVis('snip-result');
    const sn = await b.page.evaluate(async () => {
      const i = document.querySelector('[data-testid="snip-img"]'); await i.decode();
      const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight;
      const g = c.getContext('2d'); g.drawImage(i, 0, 0);
      return { w: c.width, h: c.height, d: Array.from(g.getImageData(0, 0, c.width, c.height).data) };
    });
    ok(Math.abs(sn.w - ref.w) <= 8 && Math.abs(sn.h - ref.h) <= 8, `${bg}: kích thước ${sn.w}x${sn.h} vs ${ref.w}x${ref.h}`);
    const r = st.zones[0].rect, cell = r.h / 16;
    const mid = [r.x + r.w * 0.4, r.y + r.h * 0.5 + 15];
    const pts = { 'nền': [r.x + cell * 6 + cell / 2, r.y + cell * 2 + cell / 2], 'mực': mid, 'đường kẻ': [r.x + cell * 5, r.y + cell * 2 + cell / 2] };
    for (const k in pts) {
      const x = Math.round(pts[k][0] - crop.x), y = Math.round(pts[k][1] - crop.y);
      const a = [0, 1, 2].map((c) => sn.d[(y * sn.w + x) * 4 + c]), c2 = [0, 1, 2].map((c) => ref.d[(y * ref.w + x) * 4 + c]);
      ok(px(a, c2, k === 'nền' ? 6 : 14), `${bg} ${k} (${x},${y}): ảnh cắt ${a} vs màn hình ${c2}`);
    }
    // toàn ảnh: tỉ lệ điểm lệch > 24 phải nhỏ
    let bad = 0; const n = Math.min(sn.d.length, ref.d.length);
    for (let i = 0; i < n; i += 4) if (Math.abs(sn.d[i] - ref.d[i]) > 24 || Math.abs(sn.d[i + 1] - ref.d[i + 1]) > 24 || Math.abs(sn.d[i + 2] - ref.d[i + 2]) > 24) bad++;
    ok(bad / (n / 4) < 0.03, `${bg}: ${(100 * bad / (n / 4)).toFixed(2)} % điểm ảnh lệch`);
    noErr(b);
    await b.close();
  }
});
t('W-SNIP3', async () => {   // Sao chép: thành công khi cấp quyền; báo đúng câu khi bị từ chối
  let b = await open({ zones: 2, perms: true });
  await b.page.bringToFront();
  await startSel(b); await b.tapId('snip-all'); await b.waitVis('snip-result');
  await b.tapId('snip-copy'); await sleep(500);
  const okMsg = (await b.id('snip-status').textContent()).trim();
  eq(okMsg, 'Đã sao chép ảnh. Bấm Ctrl+V để dán vào bảng ClassIn hoặc ứng dụng khác.');
  const clip = await b.page.evaluate(async () => { const it = await navigator.clipboard.read(); return it[0].types.join(); });
  ok(clip.indexOf('image/png') >= 0, 'clipboard không có ảnh: ' + clip);
  await b.close();
  b = await open({ zones: 2 });
  await b.page.evaluate(() => { navigator.clipboard.write = () => Promise.reject(new DOMException('chặn', 'NotAllowedError')); });
  await startSel(b); await b.tapId('snip-all'); await b.waitVis('snip-result');
  await b.tapId('snip-copy'); await sleep(300);
  eq((await b.id('snip-status').textContent()).trim(), 'Cửa sổ này không cho sao chép ảnh. Bấm Xem to, rồi dùng nút Chụp màn hình (biểu tượng chiếc kéo) trên thanh công cụ của ClassIn.');
  await b.tapId('snip-save'); await sleep(200);
  ok((await b.id('snip-status').textContent()).indexOf('Nếu không thấy tệp trong thư mục Tải về') === 0, 'câu sau Lưu tệp');
  await b.tapId('snip-full');
  ok(await b.vis('snip-fullview'), 'Xem to');
  await b.tapId('snip-fullview');
  ok(!(await b.vis('snip-fullview')), 'chạm để thoát Xem to');
  noErr(b);
  await b.close();
});
t('W-SNIP4', async () => {   // snip.js chỉ tải khi bấm Cắt
  const b = await open({ zones: 2 });
  const st = await b.state();
  await b.draw([zoneLine(st, 1)]);
  eq(b.log.requests.filter((u) => SNIP_URL_RE.test(u)).length, 0, 'tải snip.js khi chưa bấm Cắt');
  await startSel(b);
  ok(b.log.requests.some((u) => SNIP_URL_RE.test(u)), 'phải tải snip.js sau khi bấm Cắt');
  noErr(b);
  await b.close();
});
t('W-SNIP5', async () => {   // hiệu năng vẽ 4 ngón không đổi sau một lần cắt
  const b = await open({ zones: 2 });
  const st = await b.state();
  const four = (dy) => [zoneLine(st, 1, dy), zoneLine(st, 1, dy + 50), zoneLine(st, 2, dy), zoneLine(st, 2, dy + 50)];
  const measure = async (dy0) => {
    await b.page.evaluate(() => window.__board.resetPerf());
    for (let i = 0; i < 3; i++) await b.draw(four(dy0 + i * 110 - 200), 30);
    return (await b.page.evaluate(() => window.__board.perf())).avgMs;
  };
  const before = await measure(0);
  await startSel(b); await b.tapId('snip-all'); await b.waitVis('snip-result'); await b.tapId('snip-close');
  const after = await measure(60);
  ok(after <= before * 1.1 + 0.04, `avgMs trước ${before.toFixed(3)} sau ${after.toFixed(3)}`);
  noErr(b);
  await b.close();
});
tSH('SH-SNIP', async () => {   // ảnh các màn Cắt
  for (const [w, h] of SIZES) {
    for (const bg of ['dark', 'light']) {
      const b = await open({ zones: 3, w, h, query: bg === 'light' ? 'bg=light' : '' });
      await b.tapId('paper-open'); await b.waitVis('paper-sheet');
      await b.tapId('paper-target-all'); await b.tapId('paper-oli'); await b.tapId('paper-done');
      await scribble(b, await b.state());
      await startSel(b);
      if (bg === 'dark') await b.shot('snip-select-' + w);
      await dragSel(b, w * 0.2, h * 0.25, w * 0.62, h * 0.7);
      if (bg === 'dark' && w === 1280) await b.shot('snip-confirm-1280');
      await b.tapId('snip-ok'); await b.waitVis('snip-result');
      await b.shot(`snip-result-${bg}-${w}`);
      if (bg === 'dark' && w === 1280) { await b.tapId('snip-full'); await b.shot('snip-full-1280'); }
      noErr(b);
      await b.close();
    }
  }
});

// ================= chạy =================
async function main() {
  for (const p of [5196, 5197, 5198, 5199]) { if (await portFree(p)) { PORT = p; break; } }
  BASE = `http://127.0.0.1:${PORT}/board/`;
  server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', path.join(ROOT, process.env.DIST ? 'dist' : 'public')], { stdio: 'ignore' });
  const killServer = () => { try { server.kill(); } catch (e) { /* đã tắt */ } };
  process.on('exit', killServer);
  await waitPort(PORT);
  browser = C109 ? await chromium.launch({ executablePath: EXE109 }) : await chromium.launch({ channel: 'chrome' });
  const run = tests.filter((x) => !ONLY.length || ONLY.includes(x.id));
  for (const x of run) {
    const t0 = Date.now();
    try { await x.fn(); results.push([x.id, true]); console.log(`PASS ${x.id} (${Date.now() - t0} ms)`); }
    catch (e) { results.push([x.id, false, e.message]); console.log(`FAIL ${x.id}: ${e.message}`); }
  }
  await browser.close();
  const pass = results.filter((r) => r[1]).length;
  console.log(`\n${pass}/${results.length} đạt${C109 ? ' (Chromium 109)' : ''}`);
  killServer();
  process.exit(pass === results.length ? 0 : 1);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); try { server && server.kill(); } catch (_) { /* */ } process.exit(2); });
