// Kiểm thử trình duyệt cho "Bảng thi đua có đề" (PLAN-V2 mục F.2). Chạy: node tests/board-v2.mjs [V1 V2 ...]
// Môi trường: Chrome, UA giả ClassIn X, chạm CDP radius 25 (w = h = 50), server python3 -m http.server trên public/.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadContent } from '../tools/library/content-node.mjs';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOT_DIR = process.env.SHOT_DIR || '/Users/haku/Desktop/BAO KHOI/CLAUDE/PROJECTS/bang-nhieu-nguoi-viet/screens';
mkdirSync(SHOT_DIR, { recursive: true });
const ONLY = process.argv.slice(2);
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
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'eq'}: nhận ${JSON.stringify(a)}, cần ${JSON.stringify(b)}`); };
const ok = (c, m) => { if (!c) throw new Error(m || 'ok'); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open({ zones = 3, w = 1280, h = 720, dpr = 1, query = '', hash = '', ua = UA, flags = [] } = {}) {
  const br = flags.length ? await chromium.launch({ channel: 'chrome', args: flags }) : browser;
  const ctx = await br.newContext({ viewport: { width: w, height: h }, hasTouch: true, deviceScaleFactor: dpr, userAgent: ua });
  const page = await ctx.newPage();
  const log = { errors: [], requests: [] };
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push('console: ' + m.text()); });
  page.on('request', (r) => log.requests.push(r.url()));
  page.on('dialog', async (d) => { await d.dismiss(); });
  await page.addInitScript(() => { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 10 }); });   // ClassIn X báo nhiều điểm chạm: tránh dải cảnh báo "chỉ 1 điểm"
  for (let i = 0; i < 6; i++) {   // python http.server đôi khi reset kết nối: thử lại
    if (i === 0) await page.goto(`${BASE}?test=1&deck=1&zones=${zones}${query ? '&' + query : ''}${hash}`); else await page.reload();   // goto cùng URL có hash không tải lại trang
    try { await page.waitForFunction(() => window.__board && window.__v2, null, { timeout: 3000 }); break; }
    catch (e) { if (i === 5) throw e; log.errors.length = 0; }
  }
  await page.evaluate(() => window.__board.ready);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 25, radiusY: 25, force: 0.5 })) });
  const api = {
    ctx, page, cdp, log, w, h,
    state: () => page.evaluate(() => window.__board.state()),
    v2: () => page.evaluate(() => window.__v2.state()),
    timer: () => page.evaluate(() => window.__v2.timer()),
    chip: async (z) => ((await page.locator(`[data-testid="z${z}-team"] .chip-name`).textContent()) + ' ' + (await page.locator(`[data-testid="z${z}-team"] .chip-score`).textContent())).trim(),
    flush: () => page.evaluate(() => window.__board.flush()),
    ink: (id) => page.evaluate((i) => window.__board.inkPixels(i), id),
    id: (testid) => page.locator(`[data-testid="${testid}"]`),
    async box(testid) { const b = await page.locator(`[data-testid="${testid}"]`).first().boundingBox(); if (!b) throw new Error('không thấy ' + testid); return b; },
    async tap(x, y, hold = 40) { await touch('touchStart', [[x, y, 1]]); await sleep(hold); await touch('touchEnd', []); await sleep(60); },
    async tapId(testid) { const b = await api.box(testid); await api.tap(b.x + b.width / 2, b.y + b.height / 2); },
    // vẽ nhiều ngón cùng lúc: strokes = [[[x0,y0],[x1,y1]], ...]
    async draw(strokes, steps = 24) {
      const pts = (f) => strokes.map((p, i) => [p[0][0] + (p[1][0] - p[0][0]) * f, p[0][1] + (p[1][1] - p[0][1]) * f, i + 1]);
      await touch('touchStart', pts(0));
      for (let i = 1; i <= steps; i++) { await touch('touchMove', pts(i / steps)); await sleep(8); }
      await touch('touchEnd', []);
      await sleep(80);
      await api.flush();
    },
    async shot(name) { await page.screenshot({ path: path.join(SHOT_DIR, `v2-${name}.png`) }); },
    async close() { await ctx.close(); if (flags.length) await br.close(); },
  };
  return api;
}
// bấm nút trong hộp thoại; nếu nút đang ở trang khác thì lật trang trước (pagerTid = 'deck-page' | 'deck-tpage')
async function pickPaged(b, testid, pagerTid) {
  for (let i = 0; i < 40; i++) {   // thư viện có hơn 250 gói (~33 trang): 6 trang không đủ
    if (await b.id(testid).first().isVisible()) { await b.tapId(testid); return; }
    await b.tapId(pagerTid + '-next');
  }
  throw new Error('không thấy ' + testid);
}
const dismissBanner = (b) => b.page.evaluate(() => { const x = document.querySelector('[data-testid="banner-close"]'); if (x && x.offsetParent) x.click(); });
const zoneLine = (s, id, dy = 0) => { const r = s.zones[id - 1].rect; const y = r.y + r.h * 0.5 + dy; return [[r.x + r.w * 0.2, y], [r.x + r.w * 0.6, y + 30]]; };
const FOOD = { source: { type: 'lib', id: 'food-and-drink', title: 'Food and Drink' }, kind: 'write', mode: 'common', order: 'seq', count: 10, timer: { mode: 'off', total: 60 } };
export { t, eq, ok, open, sleep, zoneLine, FOOD, SIZES };

// ================= STEP 1 =================
t('V1', async () => {
  for (const [w, h] of SIZES) {
    const b = await open({ zones: 3, w, h });
    const s = (await b.state()).s;
    // thanh lớp hiện; nhãn "Công cụ bổ trợ" hiện
    ok(await b.id('classbar').isVisible(), 'thanh lớp ẩn');
    const disc = b.id('brand-disclaimer');
    ok(await disc.isVisible(), 'nhãn công cụ bổ trợ ẩn');
    ok((await disc.textContent()).indexOf('Công cụ bổ trợ') === 0, 'nhãn sai');
    // mọi nút thanh lớp ≥ 56·s và không chồng nhau
    const boxes = await b.page.evaluate(() => [...document.querySelectorAll('#classbar button')].filter((e) => e.offsetParent && !e.closest('.cb-pop')).map((e) => { const r = e.getBoundingClientRect(); return { id: e.dataset.testid, x: r.x, y: r.y, w: r.width, h: r.height }; }));
    ok(boxes.length >= 3, 'ít nút: ' + boxes.length);
    for (const need of ['snip-open', 'paper-open', 'timer-toggle', 'deck-open']) ok(boxes.some((x) => x.id === need), 'thanh lớp thiếu nút ' + need);   // v2.1: có nút Cắt và biểu tượng đồng hồ
    for (const x of boxes) ok(x.w >= 56 * s - 0.6 && x.h >= 56 * s - 0.6, `nút ${x.id} nhỏ ${x.w}x${x.h} (s ${s})`);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], c = boxes[j];
      ok(a.x + a.w <= c.x + 0.5 || c.x + c.w <= a.x + 0.5 || a.y + a.h <= c.y + 0.5 || c.y + c.h <= a.y + 0.5, `nút chồng nhau: ${a.id} / ${c.id}`);
    }
    await b.shot(`V1-${w}`);
    eq(b.log.errors.length, 0, b.log.errors.join(' | '));
    await b.close();
  }
});

t('V2', async () => {
  for (const [w, h] of SIZES) {
    const b = await open({ zones: 3, w, h });
    await b.tapId('deck-open');
    await b.id('deck-dialog').waitFor({ state: 'visible' });
    await b.shot(`V2-dialog-en-${w}`);
    await pickPaged(b, 'deck-pack-food-and-drink', 'deck-page');
    await b.tapId('deck-kind-write'); await b.tapId('deck-mode-common'); await b.tapId('deck-timer-60');
    await b.tapId('deck-ok');
    await b.id('z1-card').waitFor({ state: 'visible' });
    await b.page.waitForTimeout(300);
    let v = await b.v2();
    eq(v.deck.source.id, 'food-and-drink'); eq(v.deck.mode, 'common'); eq(v.timer.mode, 'down'); eq(v.timer.total, 60);
    eq(v.deck.tasks.length, 10, 'số câu');
    // đề ẩn tới khi Bắt đầu
    for (let z = 1; z <= 3; z++) eq((await b.id(`z${z}-prompt`).textContent()).trim(), 'Get ready…', 'đề ẩn z' + z);
    await b.shot(`V2-ready-${w}`);
    await b.tapId('timer-start');
    await b.page.waitForTimeout(250);
    v = await b.v2();
    eq(v.deck.tasks.length, 10, 'số câu');
    const prompts = [];
    for (let z = 1; z <= 3; z++) prompts.push((await b.id(`z${z}-prompt`).textContent()).trim());
    ok(prompts[0] && prompts[0] === prompts[1] && prompts[1] === prompts[2], 'Đề chung phải giống nhau: ' + prompts.join(' | '));
    ok(prompts[0].indexOf('Write the word:') === 0, 'lời đề: ' + prompts[0]);
    // bố cục theo bảng C.8
    const st = await b.state();
    const s = st.s, bandH = Math.round(Math.min(160 * s, Math.max(96 * s, 0.2 * (h - 120 * s))));
    const cb = await b.box('z1-card');
    ok(Math.abs(cb.height - bandH) <= 1, `dải cao ${cb.height}, cần ${bandH}`);
    const wr = st.zones[0].rect;
    ok(Math.abs(wr.h - (h - 120 * s - bandH)) <= 1.5, `vùng viết cao ${wr.h}`);
    // dải không nhận nét: vẽ trong dải thì không ra nét
    const bb = await b.box('z1-card');
    await b.draw([[[bb.x + 40, bb.y + 60], [bb.x + 120, bb.y + 80]]]);
    eq((await b.state()).zones[0].strokeCount, 0, 'vẽ lên dải đề không được ra nét');
    // vẽ ở vùng viết thì có nét
    await b.draw([zoneLine(st, 1), zoneLine(st, 2), zoneLine(st, 3)]);
    const st2 = await b.state();
    for (let z = 0; z < 3; z++) eq(st2.zones[z].strokeCount, 1, 'nét vùng ' + (z + 1));
    await b.shot(`V2-3vung-${w}`);
    eq(b.log.errors.length, 0, b.log.errors.join(' | '));
    await b.close();
  }
});

// ================= STEP 2 =================
t('V6', async () => {
  for (const [w, h] of SIZES) {
    const b = await open({ zones: 4, w, h });
    await dismissBanner(b);
    await b.tapId('deck-open');
    await pickPaged(b, 'deck-pack-food-and-drink', 'deck-page');
    await b.tapId('deck-kind-write'); await b.tapId('deck-mode-split');
    await b.tapId('deck-ok');
    await b.id('z4-card').waitFor({ state: 'visible' });
    await b.page.waitForTimeout(250);
    eq((await b.v2()).timer.mode, 'off', 'Chia câu: đồng hồ tự về Tắt');
    const q = async () => { const o = []; for (let z = 1; z <= 4; z++) o.push((await b.id(`z${z}-q`).textContent()).trim()); return o; };
    eq((await q()).join(), 'Q 1/10,Q 2/10,Q 3/10,Q 4/10');
    const prompts = [];
    for (let z = 1; z <= 4; z++) prompts.push((await b.id(`z${z}-prompt`).textContent()).trim());
    eq(new Set(prompts).size, 4, '4 câu khác nhau: ' + prompts.join(' | '));
    const st = await b.state();
    await b.draw([1, 2, 3, 4].map((i) => zoneLine(st, i)));
    for (let z = 0; z < 4; z++) eq((await b.state()).zones[z].strokeCount, 1);
    await b.tapId('z2-next');
    await b.page.waitForTimeout(150);
    eq((await q()).join(), 'Q 1/10,Q 5/10,Q 3/10,Q 4/10', '› vùng 2 sang câu 5');
    const s2 = await b.state();
    eq(s2.zones[1].strokeCount, 0, 'xoá nét vùng 2'); eq(s2.zones[0].strokeCount, 1); eq(s2.zones[2].strokeCount, 1); eq(s2.zones[3].strokeCount, 1);
    await b.tapId('z2-prev');
    eq((await q()).join(), 'Q 1/10,Q 2/10,Q 3/10,Q 4/10', '‹ quay lại câu 2');
    await b.shot(`V6-4vung-${w}`);
    eq(b.log.errors.length, 0, b.log.errors.join(' | '));
    await b.close();
  }
});

t('V12', async () => {   // mô phỏng lỗi nhãn của Chromium 109: bấm nút nào thì nút đó được chọn, không nhảy về nút đầu
  const b = await open({ zones: 2, flags: ['--disable-blink-features=LabelInteractiveContentCheckBeforeHandler'] });
  await dismissBanner(b);
  await b.tapId('deck-open');
  await b.id('deck-dialog').waitFor({ state: 'visible' });
  const groups = await b.page.evaluate(() => [...document.querySelectorAll('[data-testid="deck-dialog"] .dgroup')].filter((g) => g.offsetParent).map((g) => [...g.querySelectorAll('button')].filter((x) => x.offsetParent).map((x) => x.dataset.testid)));
  ok(groups.length >= 5, 'số nhóm: ' + groups.length);
  for (const ids of groups) {
    for (const id of [...ids].reverse()) {       // bấm từ cuối về đầu: nếu "nhảy về nút đầu" sẽ lộ ra
      await b.tapId(id);
      const sel = await b.page.evaluate((grpIds) => grpIds.filter((x) => document.querySelector(`[data-testid="${x}"]`).classList.contains('is-selected')), ids);
      if (!/^deck-(pack|page|tpage)/.test(ids[0])) eq(sel.join(), id, 'nhóm ' + ids[0] + ': bấm ' + id);
    }
  }
  // thẻ gói: bấm thẻ nào thì thẻ đó được chọn (không nhảy về thẻ đầu)
  const cardsSel = async (sel) => {
    const ids = await b.page.evaluate((q) => [...document.querySelectorAll(q)].filter((x) => x.offsetParent).map((x) => x.dataset.testid), sel);
    for (const id of [...ids].reverse()) {
      await b.tapId(id);
      const on = await b.page.evaluate((q) => [...document.querySelectorAll(q)].filter((x) => x.classList.contains('is-selected')).map((x) => x.dataset.testid), sel);
      eq(on.join(), id, 'thẻ ' + id);
    }
    return ids.length;
  };
  ok((await cardsSel('.dcard:not(.dcard--type)')) >= 6, 'có thẻ gói');
  await b.tapId('deck-subject-math');
  await b.id('deck-grade-1').waitFor({ state: 'visible' });
  await b.page.waitForTimeout(200);
  const mg = await b.page.evaluate(() => [...document.querySelectorAll('[data-testid="deck-dialog"] .dgroup')].filter((g) => g.offsetParent).map((g) => [...g.querySelectorAll('button')].filter((x) => x.offsetParent).map((x) => x.dataset.testid)));
  ok(mg.length >= 6, 'số nhóm Toán: ' + mg.length);
  for (const ids of mg.filter((g) => !/^deck-subject/.test(g[0]))) for (const id of [...ids].reverse()) {
    await b.tapId(id);
    const sel = await b.page.evaluate((grpIds) => grpIds.filter((x) => document.querySelector(`[data-testid="${x}"]`).classList.contains('is-selected')), ids);
    eq(sel.join(), id, 'nhóm Toán ' + ids[0] + ': bấm ' + id);
  }
  ok((await cardsSel('.dcard--type')) >= 3, 'có thẻ dạng bài');
  await b.shot('V12-dialog');
  await b.close();
});

t('V-mc-zoom', async () => {   // trắc nghiệm đảo A/B/C theo vùng; phóng to đề chặn nét của đúng vùng đó
  const b = await open({ zones: 3 });
  await b.page.evaluate((c) => window.__v2.load(c), Object.assign({}, FOOD, { kind: 'mc' }));
  await b.page.waitForTimeout(250);
  const opts = [];
  for (let z = 1; z <= 3; z++) opts.push((await b.id(`z${z}-opts`).textContent()).replace(/\s+/g, ' ').trim());
  eq(new Set(opts).size, 3, 'thứ tự phương án khác nhau theo vùng: ' + opts.join(' | '));
  // cùng tập phương án
  const norm = opts.map((o) => o.replace(/[ABC]\. ?/g, '').split(' ').sort().join(' '));
  ok(norm.every((x) => x.length > 0), 'có phương án');
  await b.tapId('z1-zoom');
  ok(await b.id('z1-zoomlayer').isVisible(), 'lớp phóng to hiện');
  ok(!(await b.id('z2-zoomlayer').isVisible()), 'chỉ vùng 1');
  const st = await b.state();
  await b.draw([zoneLine(st, 1), zoneLine(st, 2)]);
  const st2 = await b.state();
  eq(st2.zones[0].strokeCount, 0, 'lớp phóng to chặn nét vùng 1'); eq(st2.zones[1].strokeCount, 1, 'vùng 2 vẫn viết được');
  if (!(await b.id('z1-zoomlayer').isVisible())) await b.tapId('z1-zoom');   // vuốt qua lớp phóng to cũng được tính là chạm đóng
  const zb = await b.box('z1-zoomlayer');
  await b.tap(zb.x + zb.width / 2, zb.y + zb.height / 2);
  ok(!(await b.id('z1-zoomlayer').isVisible()), 'chạm đóng lớp phóng to');
  await b.draw([zoneLine(st, 1)]);
  eq((await b.state()).zones[0].strokeCount, 1);
  // Đáp án: tô xanh phương án đúng ở mọi vùng
  await b.tapId('answers-toggle');
  for (let z = 1; z <= 3; z++) eq(await b.page.locator(`[data-testid="z${z}-opts"] .opt.ok`).count(), 1, 'phương án đúng vùng ' + z);
  await b.close();
});

// ================= STEP 3 =================
t('V4', async () => {
  for (const [w, h] of SIZES) {
    const b = await open({ zones: 3, w, h });
    await b.page.evaluate((c) => window.__v2.load(c), FOOD);
    await b.page.waitForTimeout(250);
    ok(!(await b.id('z1-ok').isVisible()), '✓ chỉ hiện sau khi bấm Đáp án');
    await b.tapId('answers-toggle');
    for (let z = 1; z <= 3; z++) { ok((await b.id(`z${z}-ans`).textContent()).indexOf('Answer: ') === 0, 'đáp án vùng ' + z); ok(await b.id(`z${z}-ok`).isVisible() && await b.id(`z${z}-no`).isVisible(), '✓ ✗ vùng ' + z); }
    const sc = async () => (await b.v2()).zones.map((z) => z.score).join();
    await b.tapId('z1-ok'); await b.tapId('z2-no'); await b.tapId('z3-ok');
    eq(await sc(), '1,0,1');
    eq(await b.chip(1), 'Red 1', 'chip đội hiện điểm');
    await b.tapId('z1-ok');
    eq(await sc(), '0,0,1', 'bấm ✓ lần hai thì bỏ chấm');
    await b.tapId('z1-ok'); await b.tapId('z3-no');
    eq(await sc(), '1,0,0', 'đổi ý ✓ -> ✗');
    await b.tapId('score-open');
    await b.id('score-sheet').waitFor({ state: 'visible' });
    eq(await b.id('score-row-1').locator('.score-flag').count(), 1, 'cờ Dẫn đầu');
    eq((await b.page.locator('[data-testid="score-list"] .score-row').first().getAttribute('data-testid')), 'score-row-1');
    await b.shot(`V4-score-${w}`);
    await b.tapId('score-reset');
    await b.id('dialog').waitFor({ state: 'visible' });
    await b.tapId('dialog-ok');
    eq(await sc(), '0,0,0', 'đặt lại điểm');
    ok(!(await b.id('score-sheet').isVisible().catch(() => false)), 'tấm điểm đã đóng');
    // Lượt mới: sang câu 2, giữ điểm, tắt đáp án
    await b.tapId('z2-ok');
    await b.tapId('new-round');
    const v = await b.v2();
    eq(v.shared, 1); eq(v.revealed, false); eq(v.zones[1].score, 1, 'giữ điểm'); eq(v.round, 2);
    ok(!(await b.id('z1-ok').isVisible()), '✓ ẩn sau Lượt mới');
    eq(b.log.errors.length, 0, b.log.errors.join(' | '));
    await b.close();
  }
  // một vùng: chip ghi "x/y đúng"
  const b1 = await open({ zones: 1 });
  await b1.page.evaluate((c) => window.__v2.load(c), FOOD);
  await b1.tapId('answers-toggle'); await b1.tapId('z1-ok'); await b1.tapId('new-round'); await b1.tapId('answers-toggle'); await b1.tapId('z1-no');
  eq((await b1.id('z1-team').textContent()).replace(/\s+/g, ' ').trim(), '1/2 đúng');
  await b1.close();
});

t('V-team', async () => {
  const b = await open({ zones: 3 });
  await b.page.evaluate((c) => window.__v2.load(c), FOOD);
  await b.page.waitForTimeout(200);
  await b.tapId('z2-team');
  await b.id('team-sheet').waitFor({ state: 'visible' });
  await b.tapId('team-set-animals');
  await b.tapId('team-color-yellow');
  await b.tapId('team-done');
  const v = await b.v2();
  eq(v.zones.map((z) => z.team).join(), 'Tigers,Pandas,Eagles');
  eq(v.zones[1].color, '#FFD43B'); ok(v.zones[0].color !== '#FFD43B', 'màu chỉ đổi vùng 2');
  eq(await b.chip(2), 'Pandas 0');
  const bar = await b.page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="z2-card"] .band-bar')).backgroundColor);
  eq(bar, 'rgb(255, 212, 59)');
  // màu đội không đổi màu bút
  eq((await b.state()).zones[1].color, '#FFFFFF');
  await b.shot('team-sheet');
  await b.close();
});

t('V-session', async () => {   // sessionStorage: đề, điểm, đội còn sau khi tải lại; nét thì không
  const b = await open({ zones: 2 });
  await b.page.evaluate((c) => window.__v2.load(c), FOOD);
  await b.tapId('answers-toggle'); await b.tapId('z1-ok');
  await b.page.waitForTimeout(800);
  const st = await b.state();
  await b.draw([zoneLine(st, 1)]);
  await b.page.reload();
  await b.page.waitForFunction(() => window.__v2);
  await b.page.waitForTimeout(300);
  const v = await b.v2();
  eq(v.deck.tasks.length, 10); eq(v.zones[0].score, 1); eq(v.zones[0].team, 'Red');
  ok(await b.id('z1-card').isVisible(), 'dải đề còn sau khi tải lại');
  eq((await b.state()).zones[0].strokeCount, 0, 'không lưu nét');
  await b.close();
});

t('V-timer', async () => {   // đồng hồ: chọn nhanh, đếm ngược, tạm dừng, đặt lại; không vẽ lại canvas
  const b = await open({ zones: 2, query: 'timerSpeed=10' });
  await b.page.evaluate((c) => window.__v2.load(c), Object.assign({}, FOOD, { timer: { mode: 'down', total: 30 } }));
  await b.page.waitForTimeout(200);
  eq((await b.id('timer-display').textContent()).trim(), '00:30');
  await b.tapId('timer-display');
  await b.tapId('timer-set-90');
  eq((await b.id('timer-display').textContent()).trim(), '01:30');
  eq((await b.v2()).timer.total, 90);
  await b.tapId('timer-start');
  await b.page.evaluate(() => window.__board.resetCounters());
  await b.page.waitForTimeout(1500);   // 15 giây mô phỏng
  const left = (await b.timer()).left;
  ok(left <= 76 && left >= 70, 'trôi 15 giây: ' + left);
  const c = await b.page.evaluate(() => window.__board.counters());
  eq(c.dirtyCssTotal, 0, 'đồng hồ không gây vùng hỏng'); eq(c.frames, 0, 'đồng hồ không đánh thức renderer');
  eq((await b.id('timer-start').getAttribute('aria-label')), 'Tạm dừng');
  await b.tapId('timer-start');
  const l1 = (await b.timer()).left;
  await b.page.waitForTimeout(600);
  eq((await b.timer()).left, l1, 'tạm dừng không trôi');
  await b.tapId('timer-reset');
  eq((await b.id('timer-display').textContent()).trim(), '01:30');
  // bấm giờ xuôi
  await b.tapId('timer-display'); await b.tapId('timer-set-up');
  eq((await b.id('timer-display').textContent()).trim(), '00:00');
  await b.tapId('timer-start'); await b.page.waitForTimeout(1300);
  ok((await b.timer()).left >= 10, 'đếm xuôi');
  await b.tapId('timer-display'); await b.tapId('timer-set-off');
  eq(await b.id('timer-toggle').getAttribute('aria-pressed'), 'false', 'v2.1: Tắt thì biểu tượng đồng hồ không được chọn');
  ok(!(await b.id('timer-display').isVisible()), 'Tắt thì ẩn số giờ');
  ok(!(await b.id('timer-start').isVisible()), 'Tắt thì ẩn Bắt đầu');
  await b.tapId('timer-toggle');   // v2.1: một chạm bật lại (giờ dùng gần nhất), mở khay
  eq(await b.id('timer-toggle').getAttribute('aria-pressed'), 'true');
  ok(await b.id('timer-pop').isVisible(), 'bật thì mở khay');
  eq((await b.id('timer-display').textContent()).trim(), '00:00', 'bật lại bằng giờ dùng gần nhất (Bấm giờ)');
  eq(b.log.errors.length, 0, b.log.errors.join(' | '));
  await b.close();
});

// ================= STEP 4 =================
t('V5', async () => {
  for (const [w, h] of SIZES) {
    const b = await open({ zones: 3, w, h, query: 'timerSpeed=30' });
    await b.page.evaluate((c) => window.__v2.load(c), Object.assign({}, FOOD, { timer: { mode: 'down', total: 60 } }));
    await b.page.waitForTimeout(250);
    const st = await b.state();
    const strokes = async () => (await b.state()).zones.map((z) => z.strokeCount).join();
    await b.draw([zoneLine(st, 1)]);
    eq(await strokes(), '0,0,0', 'chờ Bắt đầu: vùng khoá');
    await b.tapId('timer-start');
    await b.draw([zoneLine(st, 1), zoneLine(st, 2), zoneLine(st, 3)]);
    eq(await strokes(), '1,1,1', 'sau Bắt đầu viết được');
    await b.page.waitForFunction(() => window.__v2.cls().zones[0].locked, null, { timeout: 5000 });   // 60 giây / 30 = 2 giây
    await b.page.waitForTimeout(150);
    for (let z = 1; z <= 3; z++) ok(await b.id(`z${z}-lock`).isVisible(), 'lớp khoá vùng ' + z);
    ok((await b.id('z1-lock').textContent()).indexOf('Time’s up!') === 0, 'lớp Hết giờ: ' + (await b.id('z1-lock').textContent()));
    await b.shot(`V5-timeup-${w}`);
    await b.draw([zoneLine(st, 1, 60), zoneLine(st, 2, 60), zoneLine(st, 3, 60)]);
    eq(await strokes(), '1,1,1', 'hết giờ: chạm không ra nét');
    // v2.1: sau ân hạn, chạm vào vùng viết bỏ lớp phủ và mở khoá; cú chạm đó không ra nét
    await b.page.waitForTimeout(700);
    await b.tap(st.zones[0].rect.x + 100, st.zones[0].rect.y + 200);
    for (let z = 1; z <= 3; z++) ok(!(await b.id(`z${z}-lock`).isVisible()), 'chạm bỏ lớp khoá vùng ' + z);
    eq(await strokes(), '1,1,1', 'cú chạm bỏ lớp không ra nét');
    ok((await b.v2()).zones.every((z) => !z.locked), 'chạm mở khoá');
    await b.page.waitForTimeout(350);
    await b.draw([zoneLine(st, 1, 90)]);
    eq(await strokes(), '2,1,1', 'sau khi chạm bỏ lớp viết tiếp được');
    await b.draw([zoneLine(st, 2, 90), zoneLine(st, 3, 90)]);
    eq(await strokes(), '2,2,2');
    eq((await b.id('timer-display').textContent()).trim(), '00:00', 'đồng hồ vẫn 00:00');
    eq((await b.id('timer-display').textContent()).trim(), '00:00');
    await b.tapId('new-round');
    await b.page.waitForTimeout(200);
    eq(await strokes(), '0,0,0', 'Lượt mới xoá nét');
    const v = await b.v2();
    eq(v.shared, 1, 'sang câu 2'); ok(v.zones.every((z) => !z.locked), 'mở khoá');
    eq((await b.id('z1-prompt').textContent()).trim(), 'Get ready…', 'Lượt mới: đề ẩn lại, chờ Bắt đầu');
    await b.tapId('timer-start');
    await b.draw([zoneLine(st, 2)]);
    eq(await strokes(), '0,1,0', 'viết lại được sau khi mở khoá');
    eq(b.log.errors.length, 0, b.log.errors.join(' | '));
    await b.close();
  }
});

t('V3', async () => {   // 3 em viết cùng lúc trong khi giáo viên chạm ✓ ở vùng 1
  for (const [w, h] of SIZES) {
    const b = await open({ zones: 3, w, h });
    await b.page.evaluate((c) => window.__v2.load(c), FOOD);
    await b.page.waitForTimeout(200);
    await b.tapId('answers-toggle');
    const st = await b.state();
    const okBox = await b.box('z1-ok');
    const lines = [1, 2, 3].map((i) => zoneLine(st, i));
    const T = (type, pts) => b.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 25, radiusY: 25, force: 0.5 })) });
    const at = (f) => lines.map((l, i) => [l[0][0] + (l[1][0] - l[0][0]) * f, l[0][1] + (l[1][1] - l[0][1]) * f, i + 1]);
    const tapPt = [okBox.x + okBox.width / 2, okBox.y + okBox.height / 2, 4];
    await T('touchStart', at(0).concat([tapPt]));      // 3 em đặt tay + ngón thứ 4 (giáo viên) đặt lên ✓
    for (let i = 1; i <= 12; i++) { await T('touchMove', at(i / 12).concat([tapPt])); await sleep(8); }
    await T('touchEnd', [tapPt]);                       // nhả ngón 4 (touchEnd: danh sách = các điểm được nhả) khi 3 nét còn đang vẽ
    await sleep(50);
    for (let i = 7; i <= 12; i++) { await T('touchMove', at(i / 12)); await sleep(8); }
    await T('touchEnd', at(1));
    await sleep(80); await b.flush();
    const s2 = await b.state();
    for (let z = 0; z < 3; z++) eq(s2.zones[z].strokeCount, 1, 'nét vùng ' + (z + 1));
    const v = await b.v2();
    eq(v.zones[0].verdict, true, '✓ ở vùng 1 được nhận');
    for (let z = 1; z <= 3; z++) ok((await b.ink(z)) > 0, 'mực vùng ' + z);
    await b.close();
  }
});

t('V8', async () => {   // 5 loại nền: lớp tĩnh, đổi nền không vẽ lại lát
  for (const [w, h] of SIZES) {
    const b = await open({ zones: 3, w, h });
    await b.page.evaluate((c) => window.__v2.load(c), FOOD);
    await b.page.waitForTimeout(250);
    eq(await b.id('z1-paper').getAttribute('data-paper'), 'lines4', 'Anh starters: nền tự là 4 dòng');
    const st = await b.state();
    await b.page.evaluate(() => window.__board.resetCounters());
    await b.tapId('paper-open');
    await b.id('paper-sheet').waitFor({ state: 'visible' });
    await b.tapId('paper-target-2'); await b.tapId('paper-oli');
    eq(await b.id('z2-paper').getAttribute('data-paper'), 'oli');
    eq(await b.id('z1-paper').getAttribute('data-paper'), 'lines4', 'chỉ đổi vùng 2');
    await b.tapId('paper-target-3'); await b.tapId('paper-axes');
    await b.tapId('paper-target-all'); await b.tapId('paper-grid');
    const kinds = [];
    await b.tapId('paper-done');
    await b.draw([zoneLine(st, 1), zoneLine(st, 2), zoneLine(st, 3)]);
    await b.tapId('paper-open'); await b.id('paper-sheet').waitFor({ state: 'visible' });
    for (const k of ['blank', 'lines4', 'oli', 'grid', 'axes']) {
      await b.tapId('paper-target-all'); await b.tapId('paper-' + k);
      for (let z = 1; z <= 3; z++) {
        const bg = await b.page.evaluate((id) => getComputedStyle(document.querySelector(`[data-testid="z${id}-paper"]`)).backgroundImage, z);
        ok(k === 'blank' ? bg === 'none' : bg.indexOf('data:image/svg+xml') >= 0, `nền ${k} vùng ${z}: ${bg.slice(0, 40)}`);
      }
      kinds.push(k);
      await b.tapId('paper-done');
      await b.shot(`paper-${k}-${w}`);
      await b.tapId('paper-open'); await b.id('paper-sheet').waitFor({ state: 'visible' });
    }
    await b.tapId('paper-done');
    const c = await b.page.evaluate(() => window.__board.counters());
    // thêm kiểm: đổi nền riêng không đánh thức renderer
    await b.page.evaluate(() => window.__board.resetCounters());
    await b.tapId('paper-open'); await b.tapId('paper-target-all'); await b.tapId('paper-lines4'); await b.tapId('paper-done');
    await b.page.waitForTimeout(200);
    const c2 = await b.page.evaluate(() => window.__board.counters());
    eq(c2.dirtyCssTotal, 0, 'đổi nền không làm hỏng lát'); eq(c2.frames, 0, 'đổi nền không vẽ lại lát');
    // nền không nằm trong ngăn hoàn tác; Xoá vùng không xoá nền
    await b.tapId('z1-clear');
    ok((await b.id('z1-paper').getAttribute('data-paper')) === 'lines4', 'xoá vùng giữ nền');
    // nền nằm dưới lớp nhập, trên lớp lát
    const z = await b.page.evaluate(() => { const p = getComputedStyle(document.querySelector('[data-testid="z1-paper"]')).zIndex, i = getComputedStyle(document.getElementById('input-layer')).zIndex, t = getComputedStyle(document.getElementById('tiles')).zIndex; return [p, i, t].join(); });
    eq(z, '2,3,0');
    eq(b.log.errors.length, 0, b.log.errors.join(' | '));
    await b.close();
  }
});

t('V11', async () => {   // hiệu năng: 4 ngón vẽ trong khi đồng hồ chạy không chậm hơn
  const run = async (withDeck) => {
    const b = await open({ zones: 4, w: 1280, h: 720, dpr: 2 });
    if (withDeck) {
      await b.page.evaluate((c) => window.__v2.load(c), Object.assign({}, FOOD, { timer: { mode: 'down', total: 120 } }));
      await b.page.waitForTimeout(200);
      await b.tapId('timer-start');
    }
    const st = await b.state();
    const fingers = [1, 2, 3, 4].map((i) => { const r = st.zones[i - 1].rect; return [[r.x + 20, r.y + r.h * 0.3], [r.x + r.w - 20, r.y + r.h * 0.6]]; });
    await b.page.evaluate(() => window.__board.resetPerf());
    await b.draw(fingers, 160);
    await b.draw(fingers.map((f) => [f[1], f[0]]), 160);
    const p = await b.page.evaluate(() => window.__board.perf());
    const c = await b.page.evaluate(() => window.__board.counters());
    await b.close();
    return { avg: p.avgMs, p95: p.p95Ms, dirty: c.dirtyCssPerFrame };
  };
  const base = await run(false), deck = await run(true), base2 = await run(false);
  console.log('   V11 avgMs không đề ' + base.avg.toFixed(3) + ' / ' + base2.avg.toFixed(3) + ', có đề + đồng hồ ' + deck.avg.toFixed(3) + ' · p95 ' + base.p95.toFixed(2) + ' / ' + deck.p95.toFixed(2));
  const ref = Math.max(base.avg, base2.avg);
  ok(deck.avg <= ref * 1.10 + 0.05, `avgMs có đề ${deck.avg} > 110% của ${ref}`);
});

// ================= STEP 5 =================
// chọn Toán trong hộp thoại: lớp, dạng, độ khó, rồi Dùng đề này
async function pickMath(b, { grade, type, diff = 2, mode = 'common', timer = '0', count = 10, lang = 'vi' }) {
  await b.tapId('deck-open');
  await b.id('deck-dialog').waitFor({ state: 'visible' });
  await b.tapId('deck-subject-math');
  await b.id('deck-grade-1').waitFor({ state: 'visible' });
  await b.tapId('deck-grade-' + grade);
  await b.page.waitForTimeout(100);
  await pickPaged(b, 'deck-type-' + type, 'deck-tpage');
  await b.tapId('deck-diff-' + diff); await b.tapId('deck-lang-' + lang);
  await b.tapId('deck-mode-' + mode); await b.tapId('deck-timer-' + timer); await b.tapId('deck-count-' + count);
}
const checkDeck = (b) => b.page.evaluate(async () => {
  const m = await import('/board/js/math/gen.js');
  const d = window.__v2.cls().deck;
  return d.tasks.map((t) => m.checkAnswer(t));
});

t('V7', async () => {
  for (const [w, h] of SIZES) {
    const b = await open({ zones: 3, w, h });
    // lớp 5: cộng phân số -> phân số dựng bằng .mf, nền Lưới
    await pickMath(b, { grade: 5, type: 'frac-add' });
    await b.shot(`V7-dialog-math-${w}`);
    await b.tapId('deck-ok');
    await b.id('z1-card').waitFor({ state: 'visible' }); await b.page.waitForTimeout(250);
    eq(await b.page.locator('[data-testid="z1-prompt"] .mf').count(), 2, 'hai phân số ở đề');
    ok((await b.page.locator('[data-testid="z1-prompt"] .mf .mf-d').first().evaluate((e) => getComputedStyle(e).borderTopWidth)) !== '0px', 'gạch phân số');
    eq(await b.id('z1-paper').getAttribute('data-paper'), 'grid', 'Toán lớp 4-12: nền Lưới');
    ok((await checkDeck(b)).every(Boolean), 'mọi câu qua checkAnswer');
    await b.tapId('answers-toggle');
    ok((await b.id('z1-ans').textContent()).indexOf('Đáp án:') === 0, 'nhãn đáp án tiếng Việt: ' + (await b.id('z1-ans').textContent()));
    await b.shot(`V7-frac-${w}`);
    // lớp 9: phương trình bậc hai
    await pickMath(b, { grade: 9, type: 'quadratic' });
    await b.tapId('deck-ok'); await b.page.waitForTimeout(300);
    const dlg = b.id('dialog');
    if (await dlg.isVisible().catch(() => false)) await b.tapId('dialog-ok');
    await b.page.waitForTimeout(300);
    ok((await b.id('z1-prompt').textContent()).indexOf('Giải phương trình') === 0, 'đề bậc hai: ' + (await b.id('z1-prompt').textContent()));
    ok(await b.page.locator('[data-testid="z1-prompt"] sup').count() >= 1, 'mũ dùng <sup>');
    ok((await checkDeck(b)).every(Boolean));
    await b.shot(`V7-quad-${w}`);
    // lớp 12: tích phân, nền tự đổi
    await pickMath(b, { grade: 12, type: 'integral-poly' });
    await b.tapId('deck-ok'); await b.page.waitForTimeout(300);
    ok(await b.page.locator('[data-testid="z1-prompt"] .mi').count() === 1, 'dấu tích phân: ' + (await b.id('z1-prompt').textContent()) + ' | ' + b.log.errors.join(' | ') + ' | toast: ' + (await b.id('toast').textContent().catch(() => '-')) + ' | dialog: ' + (await b.id('deck-dialog').isVisible().catch(() => false)) + ' | ' + (await b.id('dialog').isVisible().catch(() => false)));
    ok((await checkDeck(b)).every(Boolean));
    await b.shot(`V7-integral-${w}`);
    // vẽ đồ thị: nền Trục toạ độ
    await pickMath(b, { grade: 7, type: 'graph-point', diff: 2 });
    await b.tapId('deck-ok'); await b.page.waitForTimeout(300);
    eq(await b.id('z1-paper').getAttribute('data-paper'), 'axes', 'graph-point: nền Trục');
    // lớp 2: nền Ô li
    await pickMath(b, { grade: 2, type: 'add' });
    await b.tapId('deck-ok'); await b.page.waitForTimeout(300);
    eq(await b.id('z1-paper').getAttribute('data-paper'), 'oli', 'Toán lớp 1-3: Ô li');
    eq(b.log.errors.length, 0, b.log.errors.join(' | '));
    await b.close();
  }
});

t('V10', async () => {
  let b = await open({ zones: 3, query: 'src=math&grade=3&type=mul&d=2&n=8&mode=common&timer=0&seed=5' });
  await b.id('z1-card').waitFor({ state: 'visible' });
  let v = await b.v2();
  eq(v.deck.source.type, 'math'); eq(v.deck.tasks.length, 8); eq(v.timer.mode, 'off'); eq(v.deck.mode, 'common');
  ok((await b.id('z1-prompt').textContent()).indexOf('Tính:') === 0);
  ok((await checkDeck(b)).every(Boolean));
  await b.close();
  // thư viện + timer: chờ Bắt đầu
  b = await open({ zones: 2, query: 'src=lib:food-and-drink&kind=missing&n=5&timer=90&mode=common&order=rand&paper=oli' });
  await b.id('z1-card').waitFor({ state: 'visible' }); await b.page.waitForTimeout(200);
  v = await b.v2();
  eq(v.deck.kind, 'missing'); eq(v.deck.tasks.length, 5); eq(v.deck.order, 'rand'); eq(v.timer.total, 90);
  eq((await b.id('timer-display').textContent()).trim(), '01:30');
  eq((await b.id('z1-prompt').textContent()).trim(), 'Get ready…', 'chờ Bắt đầu');
  eq(await b.id('z1-paper').getAttribute('data-paper'), 'oli', 'paper= theo URL');
  await b.tapId('timer-start');
  ok((await b.id('z1-prompt').textContent()).indexOf('Write the whole word:') === 0);
  await b.close();
  // giá trị sai bị bỏ qua, không lỗi
  b = await open({ zones: 2, query: 'src=math&grade=99&type=zzz&d=9&n=999&mode=weird&timer=77&paper=nope&order=x' });
  await b.id('z1-card').waitFor({ state: 'visible' });
  v = await b.v2();
  eq(v.deck.tasks.length, 10, 'n sai -> 10'); eq(v.deck.mode, 'common'); eq(v.timer.mode, 'down'); eq(v.timer.total, 60);
  eq(b.log.errors.length, 0, b.log.errors.join(' | '));
  await b.close();
  // src sai: không nạp gì
  b = await open({ zones: 2, query: 'src=hack&kind=zzz' });
  await b.page.waitForTimeout(300);
  ok(!(await b.id('z1-card').isVisible().catch(() => false)));
  await b.close();
});

// ================= STEP 6 =================
const LESSON = { title: 'Unit 7 – Pets', level: 'A1', vocab: ['cat:con mèo', 'dog:con chó', 'rabbit:con thỏ', 'hamster:chuột hamster', 'goldfish:cá vàng', 'parrot:con vẹt', 'turtle:con rùa'].map((x) => ({ word: x.split(':')[0], meaning: x.split(':')[1], category: 'animal' })),
  questions: [{ prompt: 'A ___ says meow.', options: ['dog', 'cat', 'fish'], answer: 1, type: 'vocab' }, { prompt: 'Which is a bird?', options: ['parrot', 'turtle', 'rabbit'], answer: 0, type: 'vocab' }, { prompt: 'A ___ lives in water.', options: ['cat', 'goldfish', 'dog'], answer: 1, type: 'vocab' }], teams: ['Lions', 'Bears'] };
async function lessonCode(pack) { const c = await loadContent(); return c.encodeLesson(c.normalizePack(pack)); }

t('V9', async () => {
  const code = await lessonCode(LESSON);
  const b = await open({ zones: 3, query: 'src=lesson', hash: '#L=' + code });
  await b.id('deck-dialog').waitFor({ state: 'visible', timeout: 5000 });
  ok(await b.id('deck-pack-lesson').isVisible(), 'ô "Bài đang mở"');
  ok((await b.id('deck-pack-lesson').textContent()).indexOf('Bài đang mở') === 0);
  ok((await b.id('deck-pack-lesson').textContent()).indexOf('Unit 7') > 0, 'tên bài');
  eq(await b.id('deck-pack-lesson').getAttribute('aria-pressed'), 'true', 'nguồn bài đang mở chọn sẵn');
  await b.shot('V9-dialog');
  await b.tapId('deck-kind-missing'); await b.tapId('deck-timer-0'); await b.tapId('deck-count-5');
  await b.tapId('deck-ok');
  await b.id('z1-card').waitFor({ state: 'visible' });
  const v = await b.v2();
  eq(v.deck.source.type, 'lesson'); eq(v.deck.kind, 'missing'); ok(v.deck.tasks.every((t) => t.id.indexOf('lesson:missing:') === 0));
  eq(v.zones.map((z) => z.team).join(), 'Lions,Bears,Team 3', 'tên đội từ bài');
  ok((await b.id('z1-prompt').textContent()).indexOf('Write the whole word:') === 0);
  // Trắc nghiệm từ câu của bài
  await b.tapId('deck-open'); await b.tapId('deck-kind-mc'); await b.tapId('deck-ok');
  await b.page.waitForTimeout(300);
  eq((await b.v2()).deck.tasks.length, 3, 'bài có 3 câu hỏi');
  // giữ nguyên hash, không ghi vào storage
  await b.page.waitForTimeout(800);
  eq(await b.page.evaluate(() => location.hash.slice(0, 3)), '#L=');
  eq(await b.page.evaluate(() => sessionStorage.getItem('board.v2')), null, 'không lưu đề của bài vào storage');
  eq(await b.page.evaluate(() => localStorage.length), 0);
  // tải lại vẫn còn bài
  await b.page.reload(); await b.page.waitForFunction(() => window.__v2, null, { timeout: 20000 });
  await b.id('deck-dialog').waitFor({ state: 'visible', timeout: 5000 });
  ok(await b.id('deck-pack-lesson').isVisible(), 'tải lại vẫn còn bài');
  eq(b.log.errors.length, 0, b.log.errors.join(' | '));
  await b.close();
  // không có src=lesson: bảng mở bình thường, hộp Chọn đề có ô bài đang mở
  const b2 = await open({ zones: 2, hash: '#L=' + code });
  await b2.page.waitForTimeout(300);
  ok(!(await b2.id('deck-dialog').isVisible().catch(() => false)), 'không tự mở hộp thoại');
  await b2.tapId('deck-open');
  ok(await b2.id('deck-pack-lesson').isVisible(), 'ô Bài đang mở là ô đầu tiên');
  eq(await b2.page.evaluate(() => document.querySelector('.dgrid--packs button:not([hidden])').dataset.testid), 'deck-pack-lesson');
  await b2.close();
  // mã hỏng: toast, bảng trống, không lỗi
  const b3 = await open({ zones: 2, query: 'src=lesson', hash: '#L=1AAAA_broken' });
  await b3.page.waitForTimeout(500);
  ok((await b3.id('toast').textContent()).indexOf('Link bài hỏng hoặc bị cắt') === 0, 'toast báo link hỏng');
  ok(!(await b3.id('z1-card').isVisible().catch(() => false)), 'bảng trống');
  await b3.close();
});

t('V13', async () => {   // Hub: Soạn bài > Lưu .edu > "Lưu .edu cho Bảng nhiều người viết" > "Mở thử trên Bảng"
  const srv = await createServer({ root: ROOT, server: { port: 5231, strictPort: false }, logLevel: 'error' });
  await srv.listen();
  const base = `http://localhost:${srv.config.server.port}/`;
  const br = await chromium.launch({ channel: 'chrome' });
  try {
    const ctx = await br.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(base + '#/editor');
    const title = p.locator('[data-testid=pack-title]');
    await title.fill('Unit 9 - Animals'); await title.blur();
    await p.click('[data-testid=make-link]');
    await p.locator('[data-testid=save-edu-board]').waitFor({ state: 'visible' });
    await p.selectOption('[data-testid=edu-who]', 'true');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-testid=save-edu-board]')]);
    eq(dl.suggestedFilename(), 'unit-9-animals-bang.edu');
    const edu = JSON.parse(readFileSync(await dl.path(), 'utf8'));
    ok(/\/board\/\?zones=3&src=lesson#L=1[A-Za-z0-9_-]+$/.test(edu.url), 'url .edu: ' + edu.url.slice(0, 80));
    eq(edu.title, 'Unit 9 - Animals – Bảng'); eq(edu.size, '1280x720,960x540');
    ok(edu.uid === false && edu.identity === false && edu.nickname === false, 'tắt uid/identity/nickname');
    eq(edu.classin_authority, true);
    // "Mở thử trên Bảng" mở đúng link
    const [pop] = await Promise.all([ctx.waitForEvent('page'), p.click('[data-testid=open-board]')]);
    await pop.waitForLoadState();
    eq(pop.url(), edu.url, 'mở thử đúng link');
    // Vite dev có thể trả index.html của Hub cho /board/: mở lại cùng đường dẫn + hash trên máy chủ tĩnh của bảng
    const tail = edu.url.slice(edu.url.indexOf('/board/') + '/board/'.length);
    await pop.goto(BASE + tail);
    await pop.waitForSelector('[data-testid="deck-dialog"]', { timeout: 8000 });
    ok((await pop.locator('[data-testid="deck-pack-lesson"]').textContent()).indexOf('Unit 9 - Animals') > 0, 'bảng nhận bài từ Hub');
    await pop.screenshot({ path: path.join(SHOT_DIR, 'v2-V13-board-from-hub.png') });
    await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(SHOT_DIR, 'v2-V13-hub-modal.png') });
    eq(errs.length, 0, errs.join(' | '));
  } finally { await br.close(); await srv.close(); }
});

// ================= STEP 7 =================
t('V-label', async () => {   // nhãn "Công cụ bổ trợ..." luôn hiện: mọi kích thước, mọi hộp thoại, đủ chữ, không bị cắt
  for (const [w, h] of [[960, 540], [1280, 720], [1920, 1080], [720, 1280], [1100, 700]]) {
    const b = await open({ zones: 2, w, h });
    await b.page.evaluate((c) => window.__v2.load(c), FOOD);
    const probe = () => b.page.evaluate(() => {
      const e = document.querySelector('[data-testid="brand-disclaimer"]'); const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { w: r.width, h: r.height, x: r.x, right: r.right, vis: cs.visibility, disp: cs.display, op: cs.opacity, sw: e.scrollWidth, cw: e.clientWidth, text: e.textContent, covered: !!(top && top.closest('.dim:not(.dim--below)') && !top.closest('#topbar')), onTop: !!(top && (top.closest('#topbar') || top.closest('.dim'))) };
    });
    const check = async (state) => {
      const p = await probe();
      ok(p.disp !== 'none' && p.vis === 'visible' && p.op === '1' && p.w > 100 && p.h > 8, `${w}x${h} ${state}: nhãn ẩn ${JSON.stringify(p)}`);
      ok(p.right <= w + 0.5 && p.x >= 0, `${w}x${h} ${state}: nhãn tràn ra ngoài cửa sổ ${p.x}..${p.right}`);
      ok(p.text.indexOf('Công cụ bổ trợ') === 0, 'nội dung nhãn');
    };
    await check('mặc định');
    await b.tapId('deck-open'); await b.id('deck-dialog').waitFor({ state: 'visible' }); await check('hộp Chọn đề');
    await b.page.keyboard.press('Escape'); await b.page.waitForTimeout(100);
    await b.tapId('score-open'); await b.id('score-sheet').waitFor({ state: 'visible' }); await check('bảng điểm');
    await b.tapId('score-close');
    await b.page.evaluate(() => document.querySelector('[data-testid="info"]').click()); await b.id('info-panel').waitFor({ state: 'visible' });
    await check('Thông tin');
    const ib = await b.box('info-panel');
    ok(ib.y >= 0 && ib.y + ib.height <= h + 0.5, `${w}x${h}: bảng Thông tin cao ${ib.height} tràn cửa sổ`);
    if (w >= 1280) { const cut = await b.page.evaluate(() => { const e = document.querySelector('[data-testid="info-panel"]'); return e.scrollHeight - e.clientHeight; }); ok(cut <= 1, `Thông tin phải vừa màn hình không cuộn: lệch ${cut}`); }
    await b.page.keyboard.press('Escape');
    await b.page.evaluate(() => document.querySelector('[data-testid="clear-all"]').click()); await b.id('dialog').waitFor({ state: 'visible' }); await check('hộp xác nhận');
    await b.close();
  }
});

t('V-zones', async () => {   // đổi số vùng khi có đề: hỏi lại, đặt lại điểm, chia lại câu; bố cục không vỡ
  const b = await open({ zones: 2 });
  await b.page.evaluate((c) => window.__v2.load(c), Object.assign({}, FOOD, { mode: 'split' }));
  await b.page.waitForTimeout(200);
  await b.tapId('answers-toggle'); await b.tapId('z1-ok');
  eq((await b.v2()).zones[0].score, 1);
  await b.tapId('zones-4');
  await b.id('dialog').waitFor({ state: 'visible' });
  ok((await b.id('dialog').textContent()).indexOf('đặt lại điểm') > 0, 'có cảnh báo điểm');
  await b.tapId('dialog-cancel');
  eq((await b.state()).zones.length, 2, 'Huỷ thì giữ nguyên');
  await b.tapId('zones-4'); await b.tapId('dialog-ok');
  await b.page.waitForTimeout(300);
  const v = await b.v2();
  eq(v.zones.length, 4); ok(v.zones.every((z) => z.score === 0), 'điểm về 0'); eq(v.zones.map((z) => z.task).join(), '0,1,2,3', 'chia lại câu');
  eq(await b.page.locator('.band').count(), 4, '4 dải đề');
  eq((await b.state()).zones.length, 4);
  await b.shot('V-zones-4');
  await b.tapId('zones-1'); await b.tapId('dialog-ok'); await b.page.waitForTimeout(300);
  eq(await b.page.locator('.band').count(), 1); eq((await b.v2()).zones.length, 1);
  eq(b.log.errors.length, 0, b.log.errors.join(' | '));
  await b.close();
});

t('V-shots', async () => {   // ảnh các màn mới (đồng hồ, thông tin, phóng to, toán nhiều vùng)
  for (const [w, h] of SIZES) {
    let b = await open({ zones: 3, w, h, query: 'timerSpeed=6' });
    await b.page.evaluate((c) => window.__v2.load(c), Object.assign({}, FOOD, { timer: { mode: 'down', total: 30 } }));
    await b.page.waitForTimeout(200);
    await b.tapId('timer-start');
    await b.page.waitForFunction(() => window.__v2.timer().left <= 8, null, { timeout: 8000 });
    const st = await b.state();
    await b.draw([zoneLine(st, 1), zoneLine(st, 2), zoneLine(st, 3)]);
    await b.shot(`clock-warn-${w}`);
    await b.tapId('timer-display');
    await b.shot(`clock-pop-${w}`);
    await b.tapId('timer-set-up');
    await b.page.evaluate(() => document.querySelector('[data-testid="info"]').click()); await b.id('info-panel').waitFor({ state: 'visible' });
    await b.shot(`info-${w}`);
    await b.close();
    b = await open({ zones: 2, w, h });
    await b.page.evaluate((c) => window.__v2.load(c), Object.assign({}, FOOD, { kind: 'mc' }));
    await b.page.waitForTimeout(200);
    await b.tapId('answers-toggle'); await b.tapId('z1-ok'); await b.tapId('z2-no');
    await b.shot(`mc-answer-2z-${w}`);
    await b.tapId('z1-zoom'); await b.shot(`zoom-${w}`);
    await b.close();
    b = await open({ zones: 4, w, h });
    await b.page.evaluate((c) => window.__v2.load(c), { subject: 'math', source: { type: 'math', id: 'math-6', title: 'Toán lớp 6' }, kind: 'math', grade: 6, mathType: 'frac-mul-div', difficulty: 2, lang: 'vi', mode: 'split', order: 'seq', count: 10, timer: { mode: 'off', total: 60 }, seed: 3 });
    await b.page.waitForTimeout(200);
    await b.tapId('answers-toggle');
    await b.shot(`math-split-4z-${w}`);
    await b.close();
  }
});

t('V-cards', async () => {   // ảnh thẻ đề ở 1, 2, 3, 4 vùng
  for (const [w, h] of SIZES) for (const n of [1, 2, 3, 4]) {
    const b = await open({ zones: n, w, h });
    await b.page.evaluate((c) => window.__v2.load(c), Object.assign({}, FOOD, { kind: n % 2 ? 'write' : 'mc' }));
    await b.page.waitForTimeout(250);
    await b.shot(`cards-${n}z-${w}`);
    eq(b.log.errors.length, 0, b.log.errors.join(' | '));
    await b.close();
  }
});

// ================= chạy =================
async function main() {
  for (const p of [5196, 5197, 5198, 5199]) { if (await portFree(p)) { PORT = p; break; } }
  BASE = `http://127.0.0.1:${PORT}/board/`;
  server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', path.join(ROOT, process.env.DIST ? 'dist' : 'public')], { stdio: 'ignore' });   // DIST=1: thử trên bản build
  await waitPort(PORT);
  browser = await chromium.launch({ channel: 'chrome' });
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
main().catch((e) => { console.error(e); server && server.kill(); process.exit(2); });
