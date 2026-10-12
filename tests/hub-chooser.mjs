// Kiểm thử màn chọn 2 phần (public/start/) + chuyển hướng gốc + nút "Màn chọn" / "Về màn chọn".
// Chạy: node tests/hub-chooser.mjs [C3 C15 ...]   Ảnh: SHOT_DIR=... node tests/hub-chooser.mjs
// Pha A: python http.server cổng 5197 trên public/ (chỉ start/ và board/).
// Pha B: Vite dev cổng 5198 (hoặc PREVIEW=1: vite preview trên dist/).
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PA = 5197;
const PB = 5198;
const A = `http://127.0.0.1:${PA}/`;
const B = `http://127.0.0.1:${PB}/`;
const SHOT_DIR = process.env.SHOT_DIR || path.join(ROOT, 'screenshots', 'hub');
mkdirSync(SHOT_DIR, { recursive: true });
const ONLY = process.argv.slice(2);
const DISCLAIMER = 'Công cụ bổ trợ, không phải tính năng chính thức của ClassIn';

function waitPort(port, tries = 100) {
  return new Promise((resolve, reject) => {
    const once = (n) => {
      const s = net.connect(port, '127.0.0.1');
      s.on('connect', () => { s.destroy(); resolve(); });
      s.on('error', () => { s.destroy(); n <= 0 ? reject(new Error('server không mở: ' + port)) : setTimeout(() => once(n - 1), 150); });
    };
    once(tries);
  });
}
const results = [];
const tests = [];
const t = (id, phase, fn) => tests.push({ id, phase, fn });
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || 'eq'}: nhận ${JSON.stringify(a)}, cần ${JSON.stringify(b)}`); };
const ok = (c, msg) => { if (!c) throw new Error(msg || 'ok'); };

let browser;
const LAUNCH = { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] };
async function launch() {
  try { return await chromium.launch(LAUNCH); } catch (e) { return await chromium.launch({ ...LAUNCH, channel: 'chrome' }); }
}
const shotPath = (name) => path.join(SHOT_DIR, `hub-${name}.png`);

// mở trang, có log lỗi; thử lại tới 3 lần (http.server đôi khi reset kết nối)
async function open(url, { w = 1280, h = 720, touch = false, perms, args } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, deviceScaleFactor: 1, permissions: perms });
  const page = await ctx.newPage();
  const log = { errors: [], requests: [], bytes: 0 };
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push('console: ' + m.text()); });
  page.on('request', (r) => log.requests.push(r.url()));
  page.on('response', async (r) => { try { log.bytes += (await r.body()).length; } catch (e) {} });
  for (let i = 0; i < 3; i++) {
    try { await page.goto(url, { waitUntil: 'load' }); } catch (e) { if (i === 2) throw e; await page.waitForTimeout(300); continue; }
    await page.waitForTimeout(150);
    // http.server đôi khi reset kết nối: nếu có lỗi mạng ERR_* thì nạp lại
    if (!log.errors.some((x) => /ERR_/.test(x)) || i === 2) break;
    log.errors.length = 0; log.requests.length = 0; log.bytes = 0;
  }
  return { ctx, page, log };
}
const noErr = (log) => eq(log.errors.length, 0, 'lỗi console: ' + log.errors.join(' | '));
const tid = (page, id) => page.locator(`[data-testid="${id}"]`);

// ===================== PHA A =====================
t('C3', 'A', async () => {
  const { ctx, page, log } = await open(A + 'start/index.html');
  await page.waitForSelector('[data-testid=part-games]');
  await page.waitForTimeout(300);
  for (const u of log.requests) {
    ok(u.startsWith(A + 'start/'), 'request ngoài /start/: ' + u);
    ok(!/phaser|main\.js|assets\/index-|model-viewer/.test(u), 'request cấm: ' + u);
  }
  ok(log.requests.some((u) => u.endsWith('start.css')) && log.requests.some((u) => u.endsWith('start.js')) && log.requests.some((u) => u.endsWith('.woff2')), 'thiếu css/js/font');
  ok(log.bytes < 250 * 1024, 'tổng byte ' + log.bytes);
  const dcl = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return n.domContentLoadedEventEnd; });
  ok(dcl < 1000, 'DOMContentLoaded ' + dcl);
  noErr(log);
  await page.close(); await ctx.close();
});

t('C15', 'A', async () => {
  const { ctx, page, log } = await open(A + 'start/index.html');
  await page.keyboard.press('Tab');
  eq(await page.evaluate(() => document.activeElement.getAttribute('data-testid')), 'part-games', 'Tab 1');
  const ow = await page.evaluate(() => getComputedStyle(document.activeElement).outlineWidth);
  ok(parseFloat(ow) >= 3, 'viền focus ' + ow);
  await page.screenshot({ path: shotPath('chooser-focus-1280') });
  await page.keyboard.press('Tab');
  eq(await page.evaluate(() => document.activeElement.getAttribute('data-testid')), 'part-board', 'Tab 2');
  ok(parseFloat(await page.evaluate(() => getComputedStyle(document.activeElement).outlineWidth)) >= 3, 'viền thẻ 2');
  await page.keyboard.press('Enter');
  await page.waitForURL(/board\/index\.html\?from=hub/);
  noErr(log);
  await ctx.close();
});

const SIZES = [[1280, 720], [1920, 1080], [960, 540], [3840, 2160], [390, 844]];
t('C16', 'A', async () => {
  for (const [w, h] of SIZES) {
    const { ctx, page, log } = await open(A + 'start/index.html', { w, h });
    await page.waitForSelector('[data-testid=part-board]');
    await page.evaluate(() => document.fonts && document.fonts.ready);
    const m = await page.evaluate(() => {
      const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, b: b.bottom, r: b.right }; };
      const d = document.querySelector('.disclaimer');
      return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, c1: r('[data-testid=part-games]'), c2: r('[data-testid=part-board]'), dis: d.scrollWidth <= d.clientWidth + 1, dtext: d.textContent };
    });
    ok(m.sw <= m.cw, `${w}x${h} cuộn ngang ${m.sw}>${m.cw}`);
    ok(m.c1.w >= 64 && m.c1.h >= 64 && m.c2.w >= 64 && m.c2.h >= 64, `${w}x${h} thẻ quá nhỏ`);
    ok(m.dis, 'dòng tuyên bố bị cắt'); eq(m.dtext, DISCLAIMER, 'nguyên văn tuyên bố');
    if (w > h) {
      ok(m.c1.x >= 0 && m.c2.r <= w && m.c1.y >= 0 && m.c1.b <= h && m.c2.b <= h, `${w}x${h} thẻ ngoài khung`);
      ok(Math.abs(m.c1.y - m.c2.y) < 2, 'hai thẻ lệch hàng');
      if (w === 1280) ok(h - m.c1.b >= 48, 'đáy thẻ cách đáy ' + (h - m.c1.b));
      ok(Math.abs((m.c1.x + m.c2.r) / 2 - w / 2) < 3, 'thẻ không cân giữa');
    } else {
      ok(m.c2.y > m.c1.b - 1, 'màn dọc phải xếp dọc');
    }
    await page.screenshot({ path: shotPath(`chooser-${w}x${h}`) });
    if (w === 1280) {
      await page.hover('[data-testid=part-board]'); await page.waitForTimeout(250);
      await page.screenshot({ path: shotPath('chooser-hover-1280') });
    }
    noErr(log);
    await ctx.close();
  }
});

t('C18', 'A', async () => {
  const js = readFileSync(path.join(ROOT, 'public/start/start.js'), 'utf8');
  const css = readFileSync(path.join(ROOT, 'public/start/start.css'), 'utf8');
  const idx = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = idx.match(/<!--chooser-redirect:start-->([\s\S]*?)<!--chooser-redirect:end-->/);
  ok(m, 'index.html thiếu khối chooser-redirect');
  const bad = /\|\|=|&&=|\?\?=|replaceAll|\.at\(|structuredClone|\bimport\s|\bexport\s|=>|\blet\s|\bconst\s/;
  ok(!bad.test(js), 'start.js cú pháp mới: ' + (js.match(bad) || [''])[0]);
  ok(!bad.test(m[1]), 'redirect cú pháp mới');
  ok(!/(^|[\s;{])aspect-ratio\s*:|(^|[\s;{])inset\s*:|:is\(|:where\(/.test(css), 'start.css có CSS mới');
});

t('C14', 'A', async () => {
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = path.join(d, n); statSync(p).isDirectory() ? walk(p) : p.endsWith('.edu') && files.push(p); } };
  walk(path.join(ROOT, 'public'));
  ok(files.length >= 4, 'số file .edu: ' + files.length);
  const J = {};
  for (const f of files) J[path.basename(f)] = JSON.parse(readFileSync(f, 'utf8'));
  eq(JSON.stringify(J['ESL-Game-Hub-2-phan.edu']), JSON.stringify({ url: 'https://bkhoi0311.github.io/esl-game-hub/', uid: false, nickname: false, identity: false, title: 'ESL Game Hub va Bang viet', size: '1280x720,960x540', classin_authority: false }), 'edu mới');
  const board = (z) => ({ url: `https://bkhoi0311.github.io/esl-game-hub/board/?zones=${z}`, uid: false, nickname: false, identity: false, title: 'Bang nhieu nguoi viet', size: '1280x720,960x540', classin_authority: false });
  // PLAN-INK 1.4: đúng MỘT file .edu cho bảng (số vùng đổi ngay trong trang), không còn file perf/2-vung/4-vung
  eq(JSON.stringify(J['Bang-nhieu-nguoi-viet.edu']), JSON.stringify(board(2)), 'edu bảng');
  eq(Object.keys(J).filter((n) => /^Bang-/.test(n)).join(','), 'Bang-nhieu-nguoi-viet.edu', 'chỉ một file .edu của bảng');
  ok(J['Test-da-diem-cham.edu'] && J['Kiem-tra-camera.edu'], 'thiếu edu touch/camera');
});

// ===================== PHA B =====================
const END_START = /\/start\/index\.html$/;
t('C1', 'B', async () => {
  const { ctx, page, log } = await open(B);
  await page.waitForURL(END_START);
  await page.waitForSelector('[data-testid=part-games]');
  ok(await tid(page, 'part-board').isVisible(), 'thiếu thẻ 2');
  const d = await page.evaluate(() => { const e = document.querySelector('.disclaimer'); return { text: e.textContent, ok: e.scrollWidth <= e.clientWidth + 1, vis: e.offsetParent !== null }; });
  eq(d.text, DISCLAIMER); ok(d.ok && d.vis, 'tuyên bố bị cắt/ẩn');
  noErr(log); await ctx.close();
});
t('C2', 'B', async () => {
  const { ctx, page, log } = await open(B + '?uid=1&identity=student&v=2');
  await page.waitForURL(/\/start\/index\.html\?uid=1&identity=student&v=2$/);
  await page.waitForSelector('[data-testid=part-games]');
  noErr(log); await ctx.close();
});
t('C4', 'B', async () => {
  const { ctx, page, log } = await open(B + 'start/index.html', { touch: true });
  await tid(page, 'part-games').tap();
  await page.waitForSelector('.game-card');
  eq(new URL(page.url()).hash, '#/'); ok(!/start\//.test(page.url()), 'url ' + page.url());
  ok(await page.locator('.app-header').isVisible(), 'header');
  ok(await tid(page, 'to-chooser').isVisible(), 'to-chooser');
  noErr(log); await ctx.close();
});
t('C5', 'B', async () => {
  const { ctx, page, log } = await open(B + 'start/index.html');
  await tid(page, 'part-games').click();
  await page.waitForSelector('.game-card');
  await tid(page, 'to-chooser').click();
  await page.waitForURL(END_START);
  await page.waitForSelector('[data-testid=part-games] .part-badge:not([hidden])');
  ok(await page.locator('[data-testid=part-board] .part-badge').isHidden(), 'badge thẻ 2 không được hiện');
  ok(await page.evaluate(() => document.activeElement.getAttribute('data-testid') === 'part-games'), 'focus sẵn thẻ 1');
  noErr(log); await ctx.close();
});
t('C6', 'B', async () => {
  const { ctx, page, log } = await open(B + 'start/index.html');
  await tid(page, 'part-board').click();
  await page.waitForURL(/\/board\/index\.html\?from=hub$/);
  await page.waitForSelector('[data-testid=back-hub]');
  eq(await page.locator('[data-testid^=badge-]').count(), 2, 'bảng phải có 2 vùng');
  await tid(page, 'back-hub').click();
  await page.waitForURL(END_START);
  await page.waitForSelector('[data-testid=part-board] .part-badge:not([hidden])');
  noErr(log); await ctx.close();
});
t('C7', 'B', async () => {
  const { ctx, page, log } = await open(B + 'board/index.html?from=hub');
  await page.waitForSelector('[data-testid=back-hub]');
  await tid(page, 'back-hub').click();
  await page.waitForURL(END_START);
  noErr(log); await ctx.close();
});
t('C8', 'B', async () => {
  const { ctx, page, log } = await open(B + 'board/index.html?from=hub&test=1');
  await page.waitForFunction(() => window.__board); await page.evaluate(() => window.__board.ready);
  const st = () => page.evaluate(() => window.__board.state());
  const s0 = await st();
  const r = s0.zones[0].rect;
  const x0 = r.x + r.w * 0.2, y0 = r.y + r.h * 0.4;
  await page.mouse.move(x0, y0); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(x0 + i * 15, y0 + i * 3);
  await page.mouse.up();
  await page.evaluate(() => window.__board.flush());
  eq((await st()).zones[0].strokeCount, 1, 'nét đã vẽ');
  await tid(page, 'back-hub').click();
  await page.waitForSelector('[data-testid=dialog]');
  await tid(page, 'dialog-cancel').click();
  await page.waitForSelector('[data-testid=dialog]', { state: 'detached' });
  ok(!END_START.test(page.url()), 'phải ở lại bảng');
  eq((await st()).zones[0].strokeCount, 1, 'nét còn sau khi Ở lại');
  await tid(page, 'back-hub').click();
  await tid(page, 'dialog-ok').click();
  await page.waitForURL(END_START);
  noErr(log); await ctx.close();
});
t('C9', 'B', async () => {
  const { ctx, page, log } = await open(B + 'board/index.html?from=hub');
  await page.waitForSelector('[data-testid=back-hub]');
  await tid(page, 'zones-4').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid^=badge-]').length === 4);
  ok(/from=hub/.test(page.url()), 'url mất from=hub: ' + page.url());
  ok(await tid(page, 'back-hub').isVisible(), 'back-hub mất');
  noErr(log); await ctx.close();
});
t('C10', 'B', async () => {
  const cases = [['#/', 'menu'], ['#/editor', 'editor'], ['#/game/memory-match', 'game'], ['#/camcheck', 'camcheck'], ['#L=1bad!!', 'menu']];
  for (const [hash, view] of cases) {
    const { ctx, page, log } = await open(B + hash, { perms: ['camera'] });
    await page.waitForFunction((v) => document.body.dataset.view === v, view, { timeout: 15000 });
    ok(!/start\//.test(page.url()), hash + ' bị chuyển sang start: ' + page.url());
    if (hash.startsWith('#L=')) await page.waitForSelector('.game-card');
    noErr({ errors: log.errors.filter((e) => !/Link bài học hỏng/.test(e)) });
    await ctx.close();
  }
});
t('C11', 'B', async () => {
  const teacher = await open(B + '#/editor');
  await teacher.page.waitForSelector('[data-testid=make-link]');
  await tid(teacher.page, 'make-link').click();
  const link = await tid(teacher.page, 'lesson-link').inputValue();
  ok(/#L=1/.test(link), 'link bài: ' + link);
  const url = link.replace(/^https?:\/\/[^/]+\//, B);
  for (const u of [url, url.replace('#', '?uid=123&identity=student#')]) {
    const { ctx, page, log } = await open(u);
    await page.waitForSelector('.game-card');
    ok(!/start\//.test(page.url()), 'qua màn chọn: ' + page.url());
    ok(await page.evaluate(() => document.body.classList.contains('present')), 'phải ở chế độ trình chiếu');
    ok(!(await tid(page, 'to-chooser').isVisible()), 'to-chooser phải ẩn');
    noErr(log); await ctx.close();
  }
  await teacher.ctx.close();
});
// Chạy trên server tĩnh (như GitHub Pages): Vite dev trả SPA fallback (index.html của Hub) cho thư mục /board/ không kèm index.html.
t('C12', 'A', async () => {
  for (const z of [2, 4]) {
    const { ctx, page, log } = await open(A + `board/?zones=${z}`);
    await page.waitForSelector('[data-testid=badge-1]');
    eq(await page.locator('[data-testid^=badge-]').count(), z, 'số vùng');
    eq(await tid(page, 'back-hub').count(), 0, 'không được có back-hub');
    noErr(log); await ctx.close();
  }
});
t('C13', 'B', async () => {
  const c = await browser.newContext();
  for (const u of ['touch-test/', 'flashcard/index.html', 'guide/huong-dan-luu-edu.jpg', 'camera-share/Kiem-tra-camera.edu', 'start/edu/ESL-Game-Hub-2-phan.edu', 'start/index.html', 'board/index.html']) {
    let st = 0;
    for (let i = 0; i < 3 && st !== 200; i++) st = (await c.request.get(B + u)).status();
    eq(st, 200, u);
  }
  await c.close();
});
t('C17', 'B', async () => {
  for (const [w, h] of [[1920, 1080], [1366, 768], [390, 844]]) {
    const { ctx, page, log } = await open(B + '#/', { w, h });
    await page.waitForSelector('.game-card');
    await page.waitForTimeout(1500);
    ok(await tid(page, 'to-chooser').isVisible(), `${w}: to-chooser ẩn`);
    const m = await page.evaluate(() => { const hd = document.querySelector('.app-header'); const b = document.querySelector('[data-testid=to-chooser]').getBoundingClientRect(); return { sw: hd.scrollWidth, cw: hd.clientWidth, l: b.left, r: b.right, vw: innerWidth }; });
    ok(m.sw <= m.cw + 1, `${w}: header tràn ${m.sw}>${m.cw}`);
    ok(m.l >= 0 && m.r <= m.vw, `${w}: nút ngoài khung`);
    if (w === 1920) await page.screenshot({ path: shotPath('menu-1920x1080') });
    if (w === 1366) await page.screenshot({ path: shotPath('menu-1366x768') });
    if (w === 390) await page.screenshot({ path: shotPath('menu-390x844') });
    noErr(log); await ctx.close();
  }
});
t('S1', 'B', async () => {
  // ảnh bảng từ màn chọn
  for (const [w, h] of [[1280, 720], [960, 540]]) {
    const { ctx, page, log } = await open(B + 'board/index.html?from=hub&test=1', { w, h });
    await page.waitForFunction(() => window.__board); await page.evaluate(() => window.__board.ready);
    await page.screenshot({ path: shotPath(`board-fromhub-${w}x${h}`) });
    ok(await tid(page, 'brand-disclaimer').isVisible(), 'tuyên bố bảng');
    noErr(log); await ctx.close();
  }
});

// ===================== chạy =====================
const procs = [];
let viteServer;
const want = (id) => !ONLY.length || ONLY.includes(id);
const phases = new Set(tests.filter((x) => want(x.id)).map((x) => x.phase));
try {
  if (phases.has('A')) {
    procs.push(spawn('python3', ['-m', 'http.server', String(PA), '--bind', '127.0.0.1', '--directory', path.join(ROOT, 'public')], { stdio: 'ignore' }));
    await waitPort(PA);
  }
  if (phases.has('B')) {
    if (process.env.PREVIEW) {
      procs.push(spawn('npx', ['vite', 'preview', '--port', String(PB), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' }));
    } else {
      const { createServer } = await import('vite');
      viteServer = await createServer({ root: ROOT, server: { port: PB, strictPort: true, host: '127.0.0.1' }, logLevel: 'error' });
      await viteServer.listen();
    }
    await waitPort(PB);
  }
  browser = await launch();
  for (const x of tests) {
    if (!want(x.id)) continue;
    try { await x.fn(); results.push([x.id, true]); console.log('PASS', x.id); }
    catch (e) { results.push([x.id, false, e.message]); console.log('FAIL', x.id, '-', e.message); }
  }
} finally {
  if (browser) await browser.close();
  if (viteServer) await viteServer.close();
  for (const p of procs) p.kill();
}
const pass = results.filter((r) => r[1]).length;
console.log(`\n${pass}/${results.length} đạt`);
process.exit(pass === results.length ? 0 : 1);
