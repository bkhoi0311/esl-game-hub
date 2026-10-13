// Kiểm thử trình duyệt song ngữ Việt / English (PLAN-I18N mục E.2): màn chọn, Bảng nhiều người viết.
// Chạy: node tests/i18n.mjs [S1 B2 ...]   Chromium 109 thật: C109=1 node tests/i18n.mjs   Bản dựng: DIST=1 node tests/i18n.mjs
// Môi trường: Chrome (channel 'chrome'), UA giả ClassIn X, chạm CDP radius 25 (w = h = 50), python3 http.server trên public/ (hoặc dist/).
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
const SIZES = [[1280, 720], [1920, 1080], [960, 540]];
const LANGS = ['vi', 'en'];

function portFree(p) { return new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(p, '127.0.0.1'); }); }
function waitPort(port, tries = 60) {
  return new Promise((resolve, reject) => {
    const once = (n) => { const s = net.connect(port, '127.0.0.1'); s.on('connect', () => { s.destroy(); resolve(); }); s.on('error', () => { s.destroy(); n <= 0 ? reject(new Error('server không mở')) : setTimeout(() => once(n - 1), 100); }); };
    once(tries);
  });
}
let PORT = 5196, HOST = '', server, browser;
const tests = [], results = [];
const t = (id, fn) => tests.push({ id, fn });
const tSH = (id, fn) => tests.push({ id, fn: async () => { if (!C109) await fn(); } });   // chỉ Chrome mới (ảnh chụp)
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'eq'}: nhận ${JSON.stringify(a)}, cần ${JSON.stringify(b)}`); };
const ok = (c, m) => { if (!c) throw new Error(m || 'ok'); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VN = /[à-ỹÀ-Ỹđ]/;

/* ---------- trợ giúp chung ---------- */
async function pollPage(page, fn, arg, timeout) { const t0 = Date.now(); for (;;) { if (await page.evaluate(fn, arg)) return; if (Date.now() - t0 > timeout) throw new Error('hết giờ chờ'); await sleep(100); } }
async function gotoRetry(page, url, readyFn, readyArg) {
  for (let i = 0; i < 6; i++) {
    try {
      if (i === 0) await page.goto(url); else await page.reload();
      await pollPage(page, readyFn, readyArg, 4000);
      return;
    } catch (e) { if (i === 5) throw e; }
  }
}
async function ctxFor({ w = 1280, h = 720, dpr = 1, ua = UA, touch = true, storage = null, perms = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, deviceScaleFactor: dpr, userAgent: ua });
  if (perms) await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  return ctx;
}
function wire(page) {
  const log = { errors: [], requests: [] };
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE|ERR_SOCKET_NOT_CONNECTED/.test(m.text())) log.errors.push('console: ' + m.text()); });
  page.on('request', (r) => log.requests.push(r.url()));
  page.on('dialog', async (d) => { await d.dismiss(); });
  return log;
}
const noErr = (b) => eq(b.log.errors.length, 0, b.log.errors.join(' | '));
const shotName = (name) => path.join(SHOT_DIR, `i18n-${name}.png`);

/* ---------- màn chọn ---------- */
async function openStart({ w = 1280, h = 720, query = '?lang=en&uid=1&classId=9', ctx = null, dpr = 1 } = {}) {
  ctx = ctx || (await ctxFor({ w, h, dpr }));
  const page = await ctx.newPage();
  const log = wire(page);
  await gotoRetry(page, `${HOST}start/index.html${query}`, () => !!document.querySelector('[data-testid=lang-en]') && !document.documentElement.classList.contains('i18n-wait'));
  const api = {
    ctx, page, log, w, h,
    text: (sel) => page.evaluate((s) => document.querySelector(s).textContent.trim(), sel),
    lang: () => page.evaluate(() => document.documentElement.lang),
    async shot(name) { if (!C109) await page.screenshot({ path: shotName(name) }); },
    async tapEl(sel) { const b = await page.locator(sel).first().boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await sleep(120); },
    async close() { await ctx.close(); },
  };
  return api;
}

t('S1', async () => {   // ClassIn gắn lang=en: vẫn tiếng Việt
  const s = await openStart({ query: '?lang=en&uid=1&classId=9' });
  eq(await s.lang(), 'vi');
  eq(await s.text('[data-testid=start-heading]'), 'Hôm nay lớp mình dùng gì?');
  eq(await s.page.getAttribute('[data-testid=lang-vi]', 'aria-pressed'), 'true');
  eq(await s.page.getAttribute('[data-testid=lang-en]', 'aria-pressed'), 'false');
  eq(await s.page.evaluate(() => document.title), 'Công cụ lớp học – ClassIn');
  eq(await s.text('[data-testid=disclaimer]'), 'Công cụ bổ trợ, không phải tính năng chính thức của ClassIn');
  eq(await s.page.evaluate(() => [...document.querySelectorAll('.part-card')].map((a) => a.getAttribute('href')).join()), '../#/,../board/index.html?from=hub', 'liên kết tiếng Việt giữ nguyên');
  eq(await s.page.evaluate(() => localStorage.getItem('eslhub.ui')), null, 'không được ghi ngôn ngữ khi chỉ có lang=en');
  noErr(s);
  await s.close();
});

t('S2', async () => {   // bấm EN: đổi chữ tại chỗ, không tải lại, ghi nhớ, liên kết mang ui=en; bấm VI quay lại
  const s = await openStart({});
  await s.page.evaluate(() => { window.__mark = 123; });
  await s.tapEl('[data-testid=lang-en]');
  eq(await s.lang(), 'en');
  eq(await s.text('[data-testid=start-heading]'), 'What’s the class using today?');
  eq(await s.page.evaluate(() => document.title), 'Classroom Tools – ClassIn');
  eq(await s.text('.part-card[data-part=board] .part-name'), 'Multi-Writer Board');
  eq(await s.page.getAttribute('[data-testid=part-board]', 'aria-label'), 'Open Multi-Writer Board');
  eq(await s.page.getAttribute('[data-testid=lang-en]', 'aria-pressed'), 'true');
  eq(await s.page.evaluate(() => localStorage.getItem('eslhub.ui')), 'en');
  ok(/[?&]ui=en/.test(await s.page.evaluate(() => location.search)), 'URL thiếu ui=en');
  eq(await s.page.evaluate(() => [...document.querySelectorAll('.part-card')].map((a) => a.getAttribute('href')).join()), '../?ui=en#/,../board/index.html?from=hub&ui=en');
  eq(await s.page.evaluate(() => window.__mark), 123, 'trang bị tải lại');
  const txt = await s.page.evaluate(() => document.body.innerText);
  ok(!/[à-ỹ]/.test(txt.replace(/Tiếng Việt/g, '')), 'còn chữ Việt ở bản EN: ' + txt.match(/.{0,20}[à-ỹ].{0,20}/));
  await s.shot('start-en-1280');
  await s.tapEl('[data-testid=lang-vi]');
  eq(await s.lang(), 'vi');
  eq(await s.text('[data-testid=start-heading]'), 'Hôm nay lớp mình dùng gì?');
  eq(await s.page.evaluate(() => [...document.querySelectorAll('.part-card')].map((a) => a.getAttribute('href')).join()), '../#/,../board/index.html?from=hub');
  noErr(s);
  await s.close();
});

t('S3', async () => {   // tải lại giữ EN; context mới chỉ có storage en -> EN; context trống -> VI; storage hỏng -> không lỗi
  const s = await openStart({});
  await s.tapEl('[data-testid=lang-en]');
  await s.page.reload(); await sleep(300);
  eq(await s.lang(), 'en', 'tải lại');
  const state = await s.ctx.storageState();
  await s.close();
  const c2 = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true, userAgent: UA, storageState: state });
  const s2 = await openStart({ ctx: c2, query: '?lang=en&uid=1' });
  eq(await s2.lang(), 'en', 'storage en');
  await s2.close();
  const s3 = await openStart({ query: '?lang=en&uid=1' });
  eq(await s3.lang(), 'vi', 'context trống');
  await s3.close();
  // cửa sổ không cho localStorage: ?ui=en vẫn đúng, không lỗi
  const c4 = await ctxFor({});
  await c4.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError'); } }); });
  const s4 = await openStart({ ctx: c4, query: '?lang=en&ui=en' });
  eq(await s4.lang(), 'en', 'localStorage hỏng + ui=en');
  await s4.tapEl('[data-testid=lang-vi]');
  eq(await s4.lang(), 'vi');
  noErr(s4);
  await s4.close();
});

t('S4', async () => {   // mở bảng từ màn chọn giữ EN; nút về màn chọn của bảng giữ EN
  const s = await openStart({});
  await s.tapEl('[data-testid=lang-en]');
  await s.tapEl('[data-testid=part-board]');
  await s.page.waitForURL(/board\/index\.html/);
  ok(/[?&]ui=en/.test(s.page.url()), 'URL bảng: ' + s.page.url());
  await pollPage(s.page, () => !!document.querySelector('[data-testid=back-hub]'), null, 5000);
  eq(await s.page.evaluate(() => document.documentElement.lang), 'en');
  eq(await s.page.evaluate(() => document.querySelector('.tb-name').textContent), 'Multi-Writer Board');
  eq(await s.page.evaluate(() => document.title), 'Multi-Writer Board');
  eq(await s.page.getAttribute('[data-testid=lang-en]', 'aria-pressed'), 'true');
  await s.tapEl('[data-testid=back-hub]');   // chưa có nét: về thẳng
  await s.page.waitForURL(/start\/index\.html/);
  await pollPage(s.page, () => !!document.querySelector('[data-testid=lang-en]'), null, 5000);
  eq(await s.lang(), 'en', 'về màn chọn');
  noErr(s);
  await s.close();
});

t('S5', async () => {   // cờ hiển thị đúng (lấy mẫu điểm ảnh), cỡ cờ, vùng chạm nút >= 56 px, elementFromPoint
  for (const [w, h] of [[1280, 720], [960, 540], [390, 844]]) {
    const s = await openStart({ w, h });
    const pix = await s.page.evaluate(async () => {
      const draw = (code) => new Promise((res) => {
        const svg = window.I18N.flag(code).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
        const img = new Image();
        img.onload = () => { const c = document.createElement('canvas'); c.width = 120; c.height = 80; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 120, 80); res((x, y) => Array.from(g.getImageData(x, y, 1, 1).data)); };
        img.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
      });
      const vn = await draw('vi'), us = await draw('en');
      return { vnC: vn(60, 41), vnCorner: vn(4, 4), usBlue: us(44, 40), usEdgeA: us(110, 3), usEdgeB: us(110, 15), usEdgeC: us(110, 24) };
    });
    ok(pix.vnC[0] > 200 && pix.vnC[1] > 200 && pix.vnC[2] < 80, 'tâm sao VN ' + pix.vnC);
    ok(pix.vnCorner[0] > 180 && pix.vnCorner[1] < 80, 'nền đỏ VN ' + pix.vnCorner);
    ok(pix.usBlue[2] > pix.usBlue[0] + 40, 'ô xanh Mỹ ' + pix.usBlue);
    const reds = [pix.usEdgeA, pix.usEdgeB, pix.usEdgeC].map((p) => p[0] > 150 && p[1] < 100);
    ok(reds.some((x) => x) && reds.some((x) => !x), 'mép Mỹ phải xen kẽ đỏ / trắng ' + JSON.stringify([pix.usEdgeA, pix.usEdgeB, pix.usEdgeC]));
    const m = await s.page.evaluate(() => {
      const q = (c) => document.querySelector(`[data-testid=lang-${c}]`);
      const out = {};
      for (const c of ['vi', 'en']) {
        const b = q(c).getBoundingClientRect(), f = q(c).querySelector('.flag').getBoundingClientRect();
        out[c] = { w: b.width, h: b.height, fw: f.width, fh: f.height, cx: b.x + b.width / 2, cy: b.y + b.height / 2, hit: [[-24, -24], [24, -24], [-24, 24], [24, 24]].map(([dx, dy]) => { const e = document.elementFromPoint(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy); return !!e && !!e.closest(`[data-testid=lang-${c}]`); }) };
      }
      out.sw = document.documentElement.scrollWidth <= document.documentElement.clientWidth;
      return out;
    });
    for (const c of ['vi', 'en']) {
      ok(m[c].h >= 55.5 && m[c].w >= 55.5, `${w}: nút ${c} ${m[c].w}x${m[c].h}`);
      eq(Math.round(m[c].fw), 36); eq(Math.round(m[c].fh), 24);
      ok(m[c].hit.every(Boolean), `${w}: elementFromPoint ngoài nút ${c} ${m[c].hit}`);
    }
    ok(m.sw, `${w}: cuộn ngang`);
    if (w === 390) await s.shot('start-en-390x844');
    noErr(s);
    await s.close();
  }
});

/* ---------- bảng ---------- */
async function openBoard({ zones = 3, w = 1280, h = 720, dpr = 1, query = '', hash = '', ua = UA, deck = false, ui = null, ctx = null, touchPoints = 10, from = true } = {}) {
  ctx = ctx || (await ctxFor({ w, h, dpr, ua }));
  const page = await ctx.newPage();
  const log = wire(page);
  await page.addInitScript((n) => { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => n }); }, touchPoints);
  const q = `test=1&zones=${zones}${from ? '&from=hub' : ''}${deck ? '&deck=1' : ''}${ui ? '&ui=' + ui : ''}${query ? '&' + query : ''}`;
  const needV2 = deck || /(^|&)src=/.test(query) || hash.indexOf('#L=') === 0;
  await gotoRetry(page, `${HOST}board/index.html?${q}${hash}`, (v2) => window.__board && (!v2 || window.__v2), needV2);
  await page.evaluate(() => window.__board.ready);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 25, radiusY: 25, force: 0.5 })) });
  const api = {
    ctx, page, cdp, log, w, h,
    state: () => page.evaluate(() => window.__board.state()),
    flush: () => page.evaluate(() => window.__board.flush()),
    ink: (id) => page.evaluate((i) => window.__board.inkPixels(i), id),
    lang: () => page.evaluate(() => window.I18N.lang()),
    id: (testid) => page.locator(`[data-testid="${testid}"]`),
    vis: async (testid) => (await page.locator(`[data-testid="${testid}"]`).count()) > 0 && (await page.locator(`[data-testid="${testid}"]`).first().isVisible()),
    async waitVis(testid, timeout = 8000) { const t0 = Date.now(); for (;;) { if (await api.vis(testid)) return; if (Date.now() - t0 > timeout) throw new Error('không thấy ' + testid); await sleep(100); } },
    async waitGone(testid, timeout = 8000) { const t0 = Date.now(); for (;;) { if (!(await api.vis(testid))) return; if (Date.now() - t0 > timeout) throw new Error('còn thấy ' + testid); await sleep(100); } },
    async box(testid) { const b = await page.locator(`[data-testid="${testid}"]`).first().boundingBox(); if (!b) throw new Error('không thấy ' + testid); return b; },
    async tap(x, y, hold = 40) { await touch('touchStart', [[x, y, 1]]); await sleep(hold); await touch('touchEnd', []); await sleep(60); },
    async tapId(testid) { const b = await api.box(testid); await api.tap(b.x + b.width / 2, b.y + b.height / 2); },
    text: (testid) => page.evaluate((i) => { const e = document.querySelector(`[data-testid="${i}"]`); return e ? e.textContent.trim() : null; }, testid),
    aria: (testid) => page.evaluate((i) => { const e = document.querySelector(`[data-testid="${i}"]`); return e ? e.getAttribute('aria-label') : null; }, testid),
    async draw(strokes, steps = 24) {
      const pts = (f) => strokes.map((p, i) => [p[0][0] + (p[1][0] - p[0][0]) * f, p[0][1] + (p[1][1] - p[0][1]) * f, i + 1]);
      await touch('touchStart', pts(0));
      for (let i = 1; i <= steps; i++) { await touch('touchMove', pts(i / steps)); await sleep(8); }
      await touch('touchEnd', []);
      await sleep(80);
      await api.flush();
    },
    async setLang(l) { return page.evaluate((x) => { const t0 = performance.now(); window.I18N.setLang(x); return performance.now() - t0; }, l); },
    async shot(name) { if (C109) return; await page.screenshot({ path: shotName(name) }); },
    async close() { await ctx.close(); },
  };
  return api;
}
const zoneLine = (s, id, dy = 0) => { const r = s.zones[id - 1].rect; const y = r.y + r.h * 0.5 + dy; return [[r.x + r.w * 0.2, y], [r.x + r.w * 0.6, y + 30]]; };

// Đo tràn (PLAN-I18N E.2 ca 6). Trả danh sách phần tử tràn ngang / tràn dọc / ra ngoài khung nhìn.
const MEASURE = '.tbtn,.segbtn,.cbtn,.dopt,.dcard,.dcard b,.sbtn,.chip,.tb-name,.tb-disc,.tb-pill,.dlabel,.score-row,.toast,.banner-text,#classbar,#toolrow,#topbar,.tb-left,.tb-mid,.tb-right,.lang-seg,.lang-btn,.dnote,.dhint,.zl-s,.zl-t,.snip-msg,.snip-status,.sheet-title,.dpager-l,.cb-q,.band-q,.band-prompt,.sheet-body';
const ALLOW = '.chip-name,.dcard-vi,.dcard b,.band-ans,.band-opts .opt,.band-prompt';   // .dcard b: tên gói (dữ liệu tiếng Anh) cắt bằng dấu … có chủ ý
async function overflow(page) {
  return page.evaluate(([sel, allow]) => {
    const out = [];
    const vw = innerWidth, vh = innerHeight;
    const desc = (e) => (e.getAttribute('data-testid') || e.className || e.tagName) + ' "' + (e.textContent || '').trim().slice(0, 28) + '"';
    for (const e of document.querySelectorAll(sel)) {
      if (e.matches(allow) || e.closest('.chip-name,.dcard-vi')) continue;
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(e).display === 'inline') continue;
      if (e.scrollWidth > e.clientWidth + 1) out.push('ngang ' + desc(e) + ' ' + e.scrollWidth + '>' + e.clientWidth);
      if (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1) out.push('ngoài khung ' + desc(e) + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
    }
    for (const e of document.querySelectorAll('.sheet,.snip-card')) {
      const r = e.getBoundingClientRect();
      if (r.width === 0) continue;
      if (e.scrollHeight > e.clientHeight + 1) out.push('dọc ' + desc(e) + ' ' + e.scrollHeight + '>' + e.clientHeight);
      if (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1) out.push('ngoài khung ' + desc(e));
    }
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth) out.push('trang cuộn ngang');
    return out;
  }, [MEASURE, ALLOW]);
}
async function chk(b, name, shot) {
  if (shot) await b.shot(shot);
  const o = await overflow(b.page);
  if (o.length) throw new Error(`${name} [${await b.lang()} ${b.w}x${b.h}]: ${o.join(' | ')}`);
}

t('B1', async () => {   // ClassIn gắn lang=en: bảng vẫn tiếng Việt; có ui=en thì EN; thanh trên không đè nhau
  const b = await openBoard({ query: 'lang=en&uid=1&classId=9' });
  eq(await b.lang(), 'vi');
  eq(await b.page.evaluate(() => document.querySelector('.tb-name').textContent), 'Bảng nhiều người viết');
  eq(await b.text('brand-disclaimer'), 'Công cụ bổ trợ, không phải tính năng chính thức của ClassIn');
  eq(await b.aria('zones-2'), 'Chia 2 vùng');
  eq(await b.aria('clear-all'), 'Xoá hết');
  eq(await b.page.evaluate(() => document.title), 'Bảng nhiều người viết');
  eq(await b.page.evaluate(() => localStorage.length), 0, 'không được ghi storage ở chế độ mặc định');
  noErr(b);
  await b.close();
  const e = await openBoard({ ui: 'en', query: 'lang=en' });
  eq(await e.lang(), 'en');
  eq(await e.page.evaluate(() => document.querySelector('.tb-name').textContent), 'Multi-Writer Board');
  eq(await e.text('brand-disclaimer'), 'Add-on tool, not an official ClassIn feature');
  eq(await e.aria('zones-1'), 'Use 1 zone');
  eq(await e.aria('zones-3'), 'Split into 3 zones');
  eq(await e.aria('clear-all'), 'Clear all');
  eq(await e.aria('back-hub'), 'Back to tool picker');
  eq(await e.aria('info'), 'Info');
  eq(await e.aria('z1-pen'), 'Pen');
  eq(await e.aria('z2-clear'), 'Clear zone 2');
  eq(await e.text('brand-pill'), 'For ClassIn X');
  noErr(e);
  await e.close();
});

t('B2', async () => {   // công tắc ở thanh trên: bấm đổi tại chỗ; ghi nhớ; nét giữ nguyên; setLang < 5 ms
  const b = await openBoard({ zones: 3 });
  const st = await b.state();
  await b.draw([zoneLine(st, 1), zoneLine(st, 2)]);
  await b.draw([zoneLine(st, 3)]);
  const before = { strokes: (await b.state()).zones.map((z) => z.strokeCount).join(), ink: [await b.ink(1), await b.ink(2), await b.ink(3)] };
  ok(before.ink.every((v) => v > 0), 'chưa có mực');
  await b.page.evaluate(() => { window.__mark = 77; window.__board.resetCounters(); });
  await b.tapId('lang-en');
  eq(await b.lang(), 'en');
  eq(await b.aria('zones-2'), 'Split into 2 zones');
  eq(await b.page.evaluate(() => localStorage.getItem('eslhub.ui')), 'en');
  ok(/[?&]ui=en/.test(await b.page.evaluate(() => location.search)), 'URL thiếu ui=en');
  eq(await b.page.getAttribute('[data-testid=lang-en]', 'aria-pressed'), 'true');
  await b.tapId('lang-vi');
  eq(await b.lang(), 'vi');
  await b.tapId('lang-en');
  const times = [];
  for (let i = 0; i < 6; i++) times.push(await b.setLang(i % 2 ? 'vi' : 'en'));
  await b.setLang('en');
  const med = [...times].sort((x, y) => x - y)[3];
  ok(med < 5, 'setLang trung vị ' + med.toFixed(2) + ' ms: ' + times.map((x) => x.toFixed(1)));
  const c = await b.page.evaluate(() => window.__board.counters());
  eq(await b.page.evaluate(() => window.__mark), 77, 'trang bị tải lại');
  const after = { strokes: (await b.state()).zones.map((z) => z.strokeCount).join(), ink: [await b.ink(1), await b.ink(2), await b.ink(3)] };
  eq(after.strokes, before.strokes, 'số nét đổi');
  eq(after.ink.join(), before.ink.join(), 'mực đổi');
  eq(c.finalTiles, 0, 'đổi ngôn ngữ làm vẽ lại lát canvas (finalTiles ' + c.finalTiles + ')');
  eq(c.frames, 0, 'đổi ngôn ngữ làm vẽ lại khung (frames ' + c.frames + ')');
  const rects = (await b.state()).zones.map((z) => JSON.stringify(z.rect)).join();
  eq(rects, st.zones.map((z) => JSON.stringify(z.rect)).join(), 'bố cục vùng đổi');
  // vẫn vẽ được sau khi đổi
  await b.draw([zoneLine(st, 1, 60)]);
  eq((await b.state()).zones[0].strokeCount, 2);
  noErr(b);
  await b.close();
});

t('B3', async () => {   // đổi số vùng giữ ui=en; hộp thoại đang mở dịch lại khi đổi ngôn ngữ
  const b = await openBoard({ zones: 2, ui: 'en' });
  const st = await b.state();
  await b.draw([zoneLine(st, 1)]);
  await b.tapId('zones-3');
  await b.waitVis('dialog');
  eq(await b.text('dialog-ok'), 'Change');
  eq(await b.page.evaluate(() => document.querySelector('[data-testid=dialog] .sheet-title').textContent), 'Switch to 3 zones?');
  await b.page.evaluate(() => window.I18N.setLang('vi'));
  eq(await b.text('dialog-ok'), 'Đổi', 'hộp đang mở phải dịch lại');
  eq(await b.page.evaluate(() => document.querySelector('[data-testid=dialog] .sheet-title').textContent), 'Chia 3 vùng?');
  await b.page.evaluate(() => window.I18N.setLang('en'));
  await b.tapId('dialog-ok');
  await b.waitGone('dialog');
  eq((await b.state()).zones.length, 3);
  ok(/[?&]ui=en/.test(await b.page.evaluate(() => location.search)), 'ui=en mất khi đổi số vùng: ' + (await b.page.evaluate(() => location.search)));
  ok(/zones=3/.test(await b.page.evaluate(() => location.search)));
  noErr(b);
  await b.close();
});

t('B4', async () => {   // nút về màn chọn (có nét): hộp xác nhận EN, rời bảng -> màn chọn EN
  const b = await openBoard({ zones: 2, ui: 'en' });
  const st = await b.state();
  await b.draw([zoneLine(st, 1)]);
  await b.tapId('back-hub');
  await b.waitVis('dialog');
  eq(await b.page.evaluate(() => document.querySelector('[data-testid=dialog] .sheet-title').textContent), 'Leave the board?');
  eq(await b.text('dialog-ok'), 'Leave'); eq(await b.text('dialog-cancel'), 'Stay');
  await b.tapId('dialog-ok');
  await b.page.waitForURL(/start\/index\.html/);
  await pollPage(b.page, () => !!document.querySelector('[data-testid=lang-en]'), null, 5000);
  ok(/[?&]ui=en/.test(b.page.url()), 'URL ' + b.page.url());
  eq(await b.page.evaluate(() => document.documentElement.lang), 'en');
  await b.close();
});

t('B5', async () => {   // bảng Thông tin, toast, dải cảnh báo, xoá hết: chữ EN, không còn chữ Việt
  const b = await openBoard({ zones: 3, ui: 'en', touchPoints: 1 });
  await b.waitVis('banner');
  eq(await b.page.evaluate(() => document.querySelector('.banner-text').textContent), 'This window may accept only one touch at a time, so only one person can write. See Info for a workaround.');
  eq(await b.aria('banner-close'), 'Close');
  await b.tapId('z2-undo');
  await b.waitVis('toast');
  eq(await b.page.evaluate(() => document.querySelector('[data-testid=toast]').dataset.key), 'board.toast.nothingToUndo');
  eq(await b.text('toast'), 'Nothing left to undo in zone 2.');
  await b.tapId('info'); await b.waitVis('info-panel');
  const txt = await b.page.evaluate(() => document.querySelector('[data-testid=info-panel]').innerText);
  ok(!/[à-ỹ]/.test(txt.replace(/Lưu \.edu cho Bảng nhiều người viết/g, '')), 'bảng Thông tin EN còn chữ Việt: ' + txt.match(/.{0,20}[à-ỹ].{0,20}/));
  ok(/Multi-Writer Board/.test(txt) && /Privacy/.test(txt), 'thiếu nội dung EN');
  await b.page.evaluate(() => window.I18N.setLang('vi'));
  ok(/Quyền riêng tư/.test(await b.page.evaluate(() => document.querySelector('[data-testid=info-panel]').innerText)), 'Thông tin đang mở phải dịch lại');
  await b.page.evaluate(() => window.I18N.setLang('en'));
  await b.tapId('info-close'); await b.waitGone('info-panel');
  await b.tapId('clear-all'); await b.waitVis('dialog');
  eq(await b.text('dialog-ok'), 'Clear all');
  await b.tapId('dialog-cancel'); await b.waitGone('dialog');
  noErr(b);
  await b.close();
});

t('B6', async () => {   // cờ trên thanh trên: vùng chạm 56 px, trúng ở 4 góc, cỡ cờ; không đè nút khác ở 1280 và 960
  for (const [w, h] of SIZES) for (const ui of LANGS) {
    const b = await openBoard({ w, h, ui });
    const m = await b.page.evaluate(() => {
      const out = {};
      const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1;
      out.s = s;
      const bar = document.getElementById('topbar').getBoundingClientRect();
      for (const c of ['vi', 'en']) {
        const el = document.querySelector(`[data-testid=lang-${c}]`);
        const r = el.getBoundingClientRect(), f = el.querySelector('.flag').getBoundingClientRect();
        const hs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => { const px = r.x + r.width / 2 + sx * 25, py = Math.min(bar.height - 1, Math.max(1, bar.height / 2 + sy * 25)); const e = document.elementFromPoint(px, py); return !!e && !!e.closest(`[data-testid=lang-${c}]`); });
        out[c] = { w: r.width, h: r.height, fw: f.width, fh: f.height, hit: hs, l: r.left, r: r.right };
      }
      // không đè: hộp của mọi nút / nhóm trên thanh không chồng nhau
      const boxes = [...document.querySelectorAll('#topbar .tbtn, #topbar .segbtn, #topbar .lang-btn, #topbar .tools-grp, #topbar .tb-title')].map((e) => ({ n: e.getAttribute('data-testid') || e.className, r: e.getBoundingClientRect() })).filter((x) => x.r.width > 0);
      const clash = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r, c = boxes[j].r;
        if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) clash.push(boxes[i].n + '/' + boxes[j].n);
      }
      out.clash = clash;
      out.barOver = document.getElementById('topbar').scrollWidth > document.getElementById('topbar').clientWidth + 1;
      return out;
    });
    for (const c of ['vi', 'en']) {
      ok(m[c].h >= 43 * m.s && m[c].w >= 51 * m.s, `${w}/${ui}: nút ${c} ${m[c].w}x${m[c].h}`);
      ok(Math.round(m[c].fw) >= 28 && Math.round(m[c].fh) >= 18.5, `${w}/${ui}: cờ ${m[c].fw}x${m[c].fh}`);
      ok(m[c].hit.every(Boolean), `${w}/${ui}: chạm 50x50 ngoài nút ${c}`);
    }
    eq(m.clash.length, 0, `${w}/${ui}: chồng nút ${m.clash}`);
    ok(!m.barOver, `${w}/${ui}: thanh trên tràn`);
    await chk(b, 'topbar', `board-top-${ui}-${w}`);
    noErr(b);
    await b.close();
  }
});

t('B7', async () => {   // chạm thật (CDP 50x50) vào cờ: đổi ngôn ngữ ở mọi kích thước
  for (const [w, h] of SIZES) {
    const b = await openBoard({ w, h });
    await b.tapId('lang-en'); eq(await b.lang(), 'en', `${w} chạm EN`);
    await b.tapId('lang-vi'); eq(await b.lang(), 'vi', `${w} chạm VI`);
    // chạm sát mép trên / dưới của vùng chạm 56 px (cao hơn phần nhìn thấy 44 px)
    const r = await b.box('lang-en');
    const cy = r.y + r.height / 2;
    await b.tap(r.x + r.width / 2, cy - 26); eq(await b.lang(), 'en', `${w} chạm mép trên`);
    await b.tapId('lang-vi');
    await b.tap(r.x + r.width / 2, cy + 26); eq(await b.lang(), 'en', `${w} chạm mép dưới`);
    noErr(b);
    await b.close();
  }
});

/* ---- các màn chính, Đề tắt (mặc định) ---- */
async function scribbleAll(b) { const s = await b.state(); for (const z of s.zones) await b.draw([zoneLine(s, z.id)]); }

for (const lang of LANGS) {
  t(`M-${lang}`, async () => {   // màn Đề tắt: thanh gộp / hai hàng, tấm Nền, Thông tin, hộp thoại, đồng hồ + khay + Hết giờ, Cắt màn hình
    for (const [w, h] of SIZES) {
      const b = await openBoard({ zones: 3, w, h, ui: lang, query: 'timerSpeed=30', perms: true });
      await chk(b, 'thanh', `board-bar-${lang}-${w}`);
      await b.tapId('paper-open'); await b.waitVis('paper-sheet');
      await chk(b, 'tấm Nền', `board-paper-${lang}-${w}`);
      await b.tapId('paper-done'); await b.waitGone('paper-sheet');
      await b.tapId('info'); await b.waitVis('info-panel');
      await chk(b, 'Thông tin', `board-info-${lang}-${w}`);
      await b.tapId('info-close'); await b.waitGone('info-panel');
      await b.tapId('clear-all'); await b.waitVis('dialog');
      await chk(b, 'Xoá hết', `board-clear-${lang}-${w}`);
      await b.tapId('dialog-cancel'); await b.waitGone('dialog');
      await b.tapId('z1-undo'); await b.waitVis('toast');
      await chk(b, 'toast');
      await scribbleAll(b);
      await b.tapId('zones-2'); await b.waitVis('dialog');
      await chk(b, 'Đổi số vùng', `board-zones-${lang}-${w}`);
      await b.tapId('dialog-cancel'); await b.waitGone('dialog');
      await b.tapId('timer-toggle'); await b.waitVis('timer-pop');
      await chk(b, 'khay đồng hồ', `board-tray-${lang}-${w}`);
      await b.tapId('timer-set-30');
      await b.waitVis('timer-display');
      await chk(b, 'đồng hồ');
      await b.tapId('timer-start');
      await b.waitVis('z1-lock', 15000);
      await chk(b, 'Hết giờ', `board-timeup-${lang}-${w}`);
      ok(/^Time’s up!/.test(await b.text('z1-lock')), 'lời nhắc học sinh luôn tiếng Anh khi chưa có đề: ' + (await b.text('z1-lock')));
      ok(lang === 'vi' ? /Chạm để viết tiếp/.test(await b.text('z1-lock')) : /Tap to keep writing/.test(await b.text('z1-lock')), 'dòng chỉ dẫn theo giao diện');
      await b.tap(w / 2, h / 2); await sleep(800); await b.tap(w / 2, h / 2);
      await b.tapId('snip-open'); await b.waitVis('snip-hint');
      await chk(b, 'Cắt: gợi ý', `board-snip1-${lang}-${w}`);
      noErr(b);
      await b.close();
    }
  });
}

t('M-snip', async () => {   // Cắt màn hình: chọn -> xác nhận -> kết quả, cả hai ngôn ngữ ở 1280
  for (const lang of LANGS) {
    const b = await openBoard({ zones: 3, ui: lang, perms: true });
    await scribbleAll(b);
    await b.tapId('snip-open'); await b.waitVis('snip-hint');
    const cdpDrag = async (x0, y0, x1, y1) => { await b.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1, radiusX: 25, radiusY: 25, force: 0.5 }] }); for (let i = 1; i <= 10; i++) { await b.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 10, y: y0 + (y1 - y0) * i / 10, id: 1, radiusX: 25, radiusY: 25, force: 0.5 }] }); await sleep(10); } await b.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(80); };
    await cdpDrag(250, 200, 800, 560);
    await b.waitVis('snip-confirm');
    await chk(b, 'Cắt: xác nhận', `board-snip2-${lang}`);
    eq(await b.text('snip-ok'), lang === 'vi' ? 'Cắt vùng này' : 'Snip this area');
    await b.tapId('snip-ok'); await b.waitVis('snip-result');
    await chk(b, 'Cắt: kết quả', `board-snip3-${lang}`);
    const st = await b.text('snip-status');
    ok(lang === 'vi' ? /^Ảnh đã cắt \d+x\d+/.test(st) : /^Image snipped, \d+x\d+/.test(st), 'status: ' + st);
    await b.tapId('snip-close');
    noErr(b);
    await b.close();
  }
});

/* ---- Đề bật (?deck=1): thanh lớp, hộp Chọn đề, đội, nền, điểm ---- */
for (const lang of LANGS) {
  t(`D-${lang}`, async () => {
    for (const [w, h] of SIZES.filter((x) => x[0] >= 1280)) {   // 960x540: hộp Chọn đề (Toán) vốn cao hơn khung (cuộn), ngoài phạm vi ca này
      const b = await openBoard({ zones: 3, w, h, ui: lang, deck: true });
      await chk(b, 'thanh lớp chưa đề', `deck-bar0-${lang}-${w}`);
      await b.tapId('deck-open'); await b.waitVis('deck-dialog');
      await chk(b, 'hộp Chọn đề (Tiếng Anh)', `deck-en-${lang}-${w}`);
      // mọi trang gói
      const pages = await b.page.evaluate(() => { const l = document.querySelector('[data-testid=deck-page-label]'); return l ? Number(l.textContent.split('/')[1]) : 1; });
      for (let p = 1; p < Math.min(pages, w === 1280 ? 40 : 6); p++) { await b.tapId('deck-page-next'); await chk(b, 'trang gói ' + (p + 1)); }
      await b.tapId('deck-kind-mc'); await chk(b, 'loại câu');
      // Toán: lớp 1, 6, 12 và mọi trang dạng
      await b.tapId('deck-subject-math'); await sleep(300);
      for (const g of [1, 6, 12]) {
        await b.tapId('deck-grade-' + g); await sleep(80);
        await chk(b, 'Toán lớp ' + g, g === 12 ? `deck-math-${lang}-${w}` : null);
        const tp = await b.page.evaluate(() => { const l = document.querySelector('[data-testid=deck-tpage-label]'); return l && !l.closest('[hidden]') ? Number(l.textContent.split('/')[1]) : 1; });
        for (let p = 1; p < tp; p++) { await b.tapId('deck-tpage-next'); await chk(b, `Toán lớp ${g} trang ${p + 1}`); }
      }
      // thẻ dạng Toán: không bị cắt chữ (tối đa 2 dòng)
      const cut = await b.page.evaluate(() => [...document.querySelectorAll('.dcard--type')].filter((e) => e.getBoundingClientRect().width && e.scrollHeight > e.clientHeight + 1).map((e) => e.textContent));
      eq(cut.length, 0, 'thẻ dạng Toán bị cắt: ' + cut.join(' | '));
      await b.tapId('deck-grade-3'); await b.tapId('deck-type-add');
      await b.tapId('deck-mode-common');
      await b.tapId('deck-ok'); await b.waitGone('deck-dialog');
      await sleep(300);
      await chk(b, 'thanh lớp có đề', `deck-bar1-${lang}-${w}`);
      eq(await b.text('z1-prompt'), lang === 'vi' ? 'Chuẩn bị…' : 'Get ready…', 'cue.ready theo ngôn ngữ của đề (Toán: mặc định = giao diện)');
      await b.tapId('timer-start'); await sleep(400);   // đề ẩn tới khi bấm Bắt đầu
      // dải đề: nhãn câu theo ngôn ngữ của ĐỀ (lời đề Toán mặc định = ngôn ngữ giao diện)
      const q = await b.text('z1-q');
      eq(q, lang === 'vi' ? 'Câu 1/10' : 'Q 1/10', 'cue.q theo ngôn ngữ đề');
      eq(await b.text('shared-label'), lang === 'vi' ? 'Câu 1/10' : 'Q 1/10');
      await b.tapId('answers-toggle'); await sleep(200);
      await chk(b, 'đáp án', `deck-ans-${lang}-${w}`);
      eq((await b.text('z1-ans')).split(' ')[0], lang === 'vi' ? 'Đáp' : 'Answer:');
      await b.tapId('score-open'); await b.waitVis('score-sheet');
      await chk(b, 'bảng điểm', `deck-score-${lang}-${w}`);
      await b.tapId('score-reset'); await b.waitVis('dialog');
      await chk(b, 'đặt lại điểm');
      await b.tapId('dialog-cancel'); await b.waitGone('dialog');
      await b.tapId('score-close'); await b.waitGone('score-sheet');
      await b.tapId('z1-team'); await b.waitVis('team-sheet');
      await chk(b, 'tấm Đội', `deck-team-${lang}-${w}`);
      await b.tapId('team-done'); await b.waitGone('team-sheet');
      await b.tapId('paper-open'); await b.waitVis('paper-sheet');
      await chk(b, 'tấm Nền (Đề bật)');
      await b.tapId('paper-done'); await b.waitGone('paper-sheet');
      await b.tapId('timer-display'); await b.waitVis('timer-pop');
      await chk(b, 'khay đồng hồ (Đề bật)', `deck-tray-${lang}-${w}`);
      await b.tapId('timer-set-off').catch(() => {});
      await b.tapId('z1-zoom').catch(() => {});
      noErr(b);
      await b.close();
    }
  });
}

t('D-split', async () => {   // Chia câu + chấm: nhãn nút ‹ › ✓ ✗ theo ngôn ngữ; chip điểm 1 vùng
  for (const lang of LANGS) {
    const b = await openBoard({ zones: 1, ui: lang, deck: true });
    await b.tapId('deck-open'); await b.waitVis('deck-dialog');
    await b.tapId('deck-subject-math'); await sleep(300);
    await b.tapId('deck-type-add'); await b.tapId('deck-mode-split'); await b.tapId('deck-ok'); await b.waitGone('deck-dialog');
    await sleep(300);
    eq(await b.aria('z1-next'), lang === 'vi' ? 'Câu tiếp vùng 1' : 'Zone 1: next question');
    await b.tapId('z1-next'); await sleep(200);
    await b.tapId('answers-toggle').catch(() => {});
    await sleep(200);
    await chk(b, 'chia câu 1 vùng');
    noErr(b);
    await b.close();
  }
});

t('D-switch', async () => {   // đổi ngôn ngữ khi đang có đề / điểm / đồng hồ chạy: đề, điểm, đồng hồ, nét giữ nguyên
  const b = await openBoard({ zones: 3, deck: true, ui: 'vi', query: 'timerSpeed=1' });
  await b.tapId('deck-open'); await b.waitVis('deck-dialog');
  await b.tapId('deck-subject-math'); await sleep(300);
  await b.tapId('deck-type-add'); await b.tapId('deck-ok'); await b.waitGone('deck-dialog');
  await sleep(300);
  const st = await b.state();
  await b.draw([zoneLine(st, 1, 40)]);
  await b.tapId('timer-start'); await sleep(400);   // đề ẩn tới khi bấm Bắt đầu
  await b.tapId('answers-toggle'); await sleep(150);
  await b.tapId('z1-ok'); await sleep(150);
  const snap = async () => ({ v2: await b.page.evaluate(() => JSON.stringify({ d: window.__v2.cls().deck.tasks.length, s: window.__v2.cls().zones.map((z) => [z.task, z.score, z.judged, z.verdict]), r: window.__v2.cls().revealed, seq: window.__v2.cls().deckSeq })), strokes: (await b.state()).zones.map((z) => z.strokeCount).join(), ink: await b.ink(1), t: (await b.page.evaluate(() => window.__v2.timer())) });
  const a = await snap();
  await b.page.evaluate(() => window.__board.resetCounters());
  await b.tapId('lang-en'); await sleep(200);
  const c = await snap();
  eq(c.v2, a.v2, 'đề / điểm đổi'); eq(c.strokes, a.strokes); eq(c.ink, a.ink);
  ok(c.t.running && c.t.left <= a.t.left && a.t.left - c.t.left <= 2, `đồng hồ ${a.t.left} -> ${c.t.left}`);
  eq(await b.text('shared-label'), 'Q 1/10', 'nhãn câu của thanh theo giao diện (EN)');
  eq(await b.text('z1-q'), 'Câu 1/10', 'dải đề giữ lời đề Toán tiếng Việt (đề đã nạp không sinh lại)');
  eq(await b.text('answers-toggle'), 'Answers');
  eq(await b.text('score-open'), 'Scores');
  eq((await b.page.evaluate(() => window.__board.counters())).finalTiles, 0, 'đổi ngôn ngữ vẽ lại canvas');
  await b.tapId('lang-vi'); await sleep(200);
  eq((await snap()).v2, a.v2);
  eq(await b.text('answers-toggle'), 'Đáp án');
  noErr(b);
  await b.close();
});

t('D-math', async () => {   // lời đề Toán: mặc định theo giao diện, mlang ghi đè, lang=en (ClassIn) KHÔNG ảnh hưởng, đổi riêng được
  const promptOf = async (b) => { await sleep(300); return b.text('z1-prompt'); };
  let b = await openBoard({ zones: 1, ui: 'en', query: 'timer=0&src=math&grade=3&type=add&n=3&seed=5' });
  ok(/^Calculate/.test(await promptOf(b)), 'ui=en -> lời đề tiếng Anh: ' + (await b.text('z1-prompt')));
  eq(await b.text('z1-q'), 'Q 1/3');
  await b.close();
  b = await openBoard({ zones: 1, ui: 'vi', query: 'timer=0&src=math&grade=3&type=add&n=3&seed=5' });
  ok(/^Tính/.test(await promptOf(b)), 'ui=vi -> lời đề tiếng Việt: ' + (await b.text('z1-prompt')));
  eq(await b.text('z1-q'), 'Câu 1/3');
  await b.close();
  b = await openBoard({ zones: 1, ui: 'en', query: 'timer=0&src=math&grade=3&type=add&n=3&seed=5&mlang=vi' });
  ok(/^Tính/.test(await promptOf(b)), 'mlang=vi ghi đè giao diện EN');
  await b.close();
  b = await openBoard({ zones: 1, query: 'timer=0&src=math&grade=3&type=add&n=3&seed=5&lang=en&uid=7&classId=9' });   // ClassIn gắn lang=en
  ok(/^Tính/.test(await promptOf(b)), 'lang=en của ClassIn phải bị bỏ qua: ' + (await b.text('z1-prompt')));
  await b.close();
  // đổi riêng trong hộp Chọn đề: giáo viên chọn lời đề rồi đổi giao diện thì lựa chọn được giữ
  b = await openBoard({ zones: 1, deck: true, ui: 'vi' });
  await b.tapId('deck-open'); await b.waitVis('deck-dialog');
  await b.tapId('deck-subject-math'); await sleep(300);
  eq(await b.page.getAttribute('[data-testid=deck-lang-vi]', 'aria-pressed'), 'true', 'mặc định lời đề = giao diện VI');
  await b.page.evaluate(() => window.I18N.setLang('en'));
  eq(await b.text('deck-lang-vi'), 'Tiếng Việt', 'tên tự gọi giữ nguyên');
  eq(await b.text('deck-lang-en'), 'English');
  await b.tapId('deck-lang-vi');   // giáo viên chủ động chọn
  await b.tapId('deck-type-add'); await b.tapId('deck-timer-0'); await b.tapId('deck-ok'); await b.waitGone('deck-dialog'); await sleep(300);
  ok(/^Tính/.test(await b.text('z1-prompt')), 'lời đề đã chọn riêng là tiếng Việt dù giao diện EN');
  eq(await b.text('z1-q'), 'Câu 1/10');
  await b.tapId('deck-open'); await b.waitVis('deck-dialog');
  eq(await b.page.getAttribute('[data-testid=deck-lang-vi]', 'aria-pressed'), 'true', 'lựa chọn riêng được giữ ở lần mở sau');
  await b.tapId('deck-cancel');
  noErr(b);
  await b.close();
});

t('D-cue', async () => {   // gói Anh: lời nhắc học sinh luôn tiếng Anh (Get ready…, Q n/N, Answer:) ở cả hai giao diện
  for (const lang of LANGS) {
    const b = await openBoard({ zones: 2, ui: lang, deck: true });
    await b.tapId('deck-open'); await b.waitVis('deck-dialog');
    await b.tapId('deck-ok'); await b.waitGone('deck-dialog'); await sleep(400);
    eq(await b.text('z1-q'), 'Q 1/10'.replace('10', String(await b.page.evaluate(() => window.__v2.cls().deck.tasks.length))), 'cue.q ở giao diện ' + lang);
    noErr(b);
    await b.close();
  }
});

t('P1', async () => {   // không ảnh hưởng thời gian vẽ: p95 mỗi khung EN ~ VI
  const res = {};
  for (const lang of LANGS) {
    const b = await openBoard({ zones: 3, ui: lang, w: 1280, h: 720 });
    await b.page.evaluate(() => window.__board.resetPerf());
    const s = await b.state();
    for (let i = 0; i < 6; i++) await b.draw([zoneLine(s, 1, i * 20 - 60), zoneLine(s, 2, i * 20 - 60), zoneLine(s, 3, i * 20 - 60)].map((x) => x), 30);
    res[lang] = await b.page.evaluate(() => window.__board.perf());
    noErr(b);
    await b.close();
  }
  const a = res.vi.p95Ms, c = res.en.p95Ms;
  ok(Math.abs(c - a) <= Math.max(1.5, a * 0.10), `p95 vẽ vi ${a} ms, en ${c} ms`);
});

// ================= chạy =================
async function main() {
  for (const p of [5196, 5197, 5198, 5199]) { if (await portFree(p)) { PORT = p; break; } }
  HOST = `http://127.0.0.1:${PORT}/`;
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
main().catch((e) => { console.error(e); try { server && server.kill(); } catch (_) { /* */ } process.exit(2); });
