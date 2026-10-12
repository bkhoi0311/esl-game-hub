// Kiểm thử hiệu năng Hub (PLAN-HUB-PERF): hồ sơ lite, kính, đứng yên khi nhàn rỗi, mở menu, Phaser theo DPR, chạm đúng, HUD.
// Chạy: npm run build && node tests/hub-perf.mjs                  -> HP-T1..T9 trên dist/ (cổng 5197) + số đo + ảnh (nhãn after)
//       node tests/hub-perf.mjs --label before --dist <thư mục dist cũ> --port 5199   -> chỉ đo + chụp (bản trước khi sửa)
// Kết quả: <SCREENS>/hubperf-measure-<nhãn>.json, ảnh hubperf-<nhãn>-*.png.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { CPU_ARGS, GPU_ARGS, UA_CLASSIN, UA_EDGE, launch, measure, openPage, serve, waitServer } from './hub-perf-lib.mjs';

const argv = (name, d) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : d;
};
const LABEL = argv('--label', 'after');
const DIST = resolve(argv('--dist', 'dist'));
const PORT = Number(argv('--port', 5197));
const SCREENS = process.env.SCREENS || '/Users/haku/Desktop/BAO KHOI/CLAUDE/PROJECTS/bang-nhieu-nguoi-viet/screens';
mkdirSync(SCREENS, { recursive: true });
const ASSERT = LABEL === 'after';
const BASE = `http://127.0.0.1:${PORT}/index.html`;

const server = serve(DIST, PORT);
await waitServer(`http://127.0.0.1:${PORT}/`);

const results = [];
const failures = [];
const check = (id, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'} ${id}${detail ? ': ' + detail : ''}`;
  results.push(line);
  console.log(line);
  if (!ok) failures.push(id);
};
const out = {};

const url = (query, hash) => `${BASE}${query ? '?' + query : ''}#${hash}`;
async function menu(browser, query = '', opts = {}) {
  const r = await openPage(browser, url(query, '/'), opts);
  await r.page.waitForSelector('.game-card');
  return r;
}
// Tổng diện tích (CSS px²) các phần tử có animation đang chạy mãi (bỏ trùng phần tử).
const animArea = (page) => page.evaluate(() => {
  const els = new Set();
  let n = 0;
  for (const a of document.getAnimations()) {
    if (a.playState !== 'running') continue;
    const t = a.effect && a.effect.target;
    if (!t) continue;
    n++;
    els.add(t);
  }
  let area = 0;
  els.forEach((e) => {
    const r = e.getBoundingClientRect();
    area += Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
  });
  return { running: n, targets: els.size, cssPx2: Math.round(area) };
});
async function startDuel(page, id) {
  await page.evaluate((h) => { location.hash = h; }, `#/game/${id}`);
  await page.click(`[data-testid=${id}-start]`, { timeout: 30000 });
  await page.waitForFunction(() => window.__duelScene && window.__duelScene.targets, null, { timeout: 60000 });
}

// ---------- Số đo (cả before lẫn after) ----------
async function scenarios(browser, tag, query) {
  const res = {};
  {
    const { ctx, page } = await menu(browser, query);
    await page.waitForTimeout(4500); // lite: 2 bé Lumi vẫy lần lượt ở 0,6 s và 2,2 s (mỗi lần ~1,2 s) rồi mới đứng yên
    res.menuIdle = { ...(await measure(ctx, page, 4000)), anim: await animArea(page) };
    // Mở lại menu từ game HTML (hash đổi), đo 1,5 s đầu.
    await page.evaluate(() => { location.hash = '#/game/memory-match'; });
    await page.waitForSelector('[data-testid=memory-match-start]');
    await page.waitForTimeout(2500);
    res.htmlGameIdle = await measure(ctx, page, 4000);
    res.menuReopen = await measure(ctx, page, 1500, { during: () => page.evaluate(() => { location.hash = '#/'; }) });
    await ctx.close();
  }
  for (const id of ['balloon-pop', 'whack-word']) {
    const { ctx, page } = await openPage(browser, url(query, '/'));
    await page.waitForSelector('.game-card');
    await startDuel(page, id);
    await page.waitForTimeout(2000);
    res[id] = await measure(ctx, page, 4000);
    res[id].phaser = await page.evaluate(() => {
      const c = document.querySelector('.pd-host canvas');
      const r = c.getBoundingClientRect();
      return { k: +(c.width / 1440).toFixed(2), backing: `${c.width}x${c.height}`, cssW: Math.round(r.width), imageRendering: getComputedStyle(c).imageRendering };
    });
    await ctx.close();
  }
  console.log(tag, JSON.stringify(res));
  return res;
}

// ---------- Độ nét chữ (HP-T6) ----------
const ramp = (page, png) => page.evaluate(async (b64) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  const lum = new Float32Array(c.width * c.height);
  for (let i = 0; i < lum.length; i++) lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  let edge = 0; let mid = 0;
  for (let y = 1; y < c.height - 1; y++) {
    for (let xx = 1; xx < c.width - 1; xx++) {
      let mn = 255; let mx = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = lum[(y + dy) * c.width + xx + dx]; if (v < mn) mn = v; if (v > mx) mx = v; }
      if (mx - mn >= 60) {
        edge++;
        const v = lum[y * c.width + xx];
        if (v - mn >= 25 && mx - v >= 25) mid++;
      }
    }
  }
  return { edge, mid, ratio: edge ? +(mid / edge).toFixed(3) : 0, w: c.width, h: c.height };
}, png.toString('base64'));

async function textCrop(browser, query, file) {
  const { ctx, page } = await openPage(browser, url(query, '/'), { viewport: { width: 1280, height: 720 } });
  await page.waitForSelector('.game-card');
  await startDuel(page, 'balloon-pop');
  await page.evaluate(() => { window.__duelScene.nextSpawn = [0, 0]; });
  let pt = null;
  for (let i = 0; i < 60 && !pt; i++) {
    await page.waitForTimeout(150);
    const t = await page.evaluate(() => window.__duelScene.targets(0).filter((b) => b.y > 250 && b.y < 450)[0] || null);
    if (t) pt = t;
  }
  const clip = { x: Math.max(0, Math.round(pt.x - 90)), y: Math.max(0, Math.round(pt.y - 60)), width: 180, height: 90 };
  const png = await page.screenshot({ clip });
  writeFileSync(`${SCREENS}/${file}`, png);
  const m = await ramp(page, png);
  await ctx.close();
  return { ...m, word: pt.word };
}

// ---------- Ảnh toàn khung ----------
async function shots(browser, tag, query) {
  const vp = { width: 1280, height: 720 };
  {
    const { ctx, page } = await openPage(browser, url(query, '/'), { viewport: vp });
    await page.waitForSelector('.game-card');
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${SCREENS}/hubperf-${tag}-menu.png` });
    await ctx.close();
  }
  for (const id of ['memory-match', 'gold-heist']) {
    const { ctx, page } = await openPage(browser, url(query, `/game/${id}`), { viewport: vp });
    await page.waitForSelector(`[data-testid=${id}-start]`);
    await page.click(`[data-testid=${id}-start]`);
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${SCREENS}/hubperf-${tag}-${id}.png` });
    await ctx.close();
  }
  {
    const { ctx, page } = await openPage(browser, url(query, '/'), { viewport: vp });
    await page.waitForSelector('.game-card');
    await startDuel(page, 'whack-word');
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${SCREENS}/hubperf-${tag}-whack-word.png` });
    await ctx.close();
  }
}

const gpu = await launch(GPU_ARGS);

if (!ASSERT) {
  // Bản cũ: chỉ đo + chụp.
  out.gpu = await scenarios(gpu, 'before/gpu', '');
  out.text = await textCrop(gpu, '', `hubperf-text-${LABEL}.png`);
  await shots(gpu, LABEL, '');
  await gpu.close();
  const cpu = await launch(CPU_ARGS);
  out.cpu = await scenarios(cpu, 'before/cpu', '');
  await cpu.close();
  writeFileSync(`${SCREENS}/hubperf-measure-${LABEL}.json`, JSON.stringify(out, null, 1));
  server.stop();
  process.exit(0);
}

// ---------- HP-T1: hồ sơ ----------
for (const [name, query, ua, want] of [
  ['ClassIn => lite/ua', '', UA_CLASSIN, { name: 'lite', source: 'ua' }],
  ['Edge => full/default', '', UA_EDGE, { name: 'full', source: 'default' }],
  ['?perf=full + ClassIn => full/param', 'perf=full', UA_CLASSIN, { name: 'full', source: 'param' }],
  ['?gk=1.5&gfps=60', 'gk=1.5&gfps=60', UA_CLASSIN, { gk: 1.5, gfps: 60 }],
  ['?glass=1&idle=1 trên lite', 'glass=1&idle=1', UA_CLASSIN, { name: 'lite', glass: true, idle: true }],
]) {
  const { ctx, page } = await openPage(gpu, url(query, '/'), { ua });
  await page.waitForSelector('.game-card');
  const p = await page.evaluate(() => window.__perf);
  check(`HP-T1 ${name}`, Object.entries(want).every(([k, v]) => p[k] === v), JSON.stringify(p));
  await ctx.close();
}

// ---------- HP-T2: backdrop-filter ----------
const blurs = (page) => page.evaluate(() => [...document.querySelectorAll('body *')]
  .filter((e) => { const s = getComputedStyle(e); return (s.backdropFilter && s.backdropFilter !== 'none') || (s.webkitBackdropFilter && s.webkitBackdropFilter !== 'none'); })
  .map((e) => e.className));
{
  const { ctx, page } = await menu(gpu);
  check('HP-T2 lite menu không backdrop-filter', (await blurs(page)).length === 0, JSON.stringify(await blurs(page)));
  await page.click('[data-testid=open-settings]');
  await page.waitForTimeout(400);
  check('HP-T2 lite modal Cài đặt', (await blurs(page)).length === 0, JSON.stringify(await blurs(page)));
  await page.keyboard.press('Escape');
  await page.evaluate(() => { location.hash = '#/game/memory-match'; });
  await page.waitForSelector('[data-testid=memory-match-start]');
  check('HP-T2 lite game HTML', (await blurs(page)).length === 0, JSON.stringify(await blurs(page)));
  await ctx.close();
  const f = await menu(gpu, 'perf=full');
  await f.page.waitForTimeout(800);
  const fb = await blurs(f.page);
  check('HP-T2 full: app-header có blur', fb.some((c) => String(c).includes('app-header')), JSON.stringify(fb));
  await f.ctx.close();
}

// ---------- Số đo ----------
out.gpu = await scenarios(gpu, 'after/gpu', '');
out.gpuFull = await scenarios(gpu, 'after/gpu-full', 'perf=full');
const before = existsSync(`${SCREENS}/hubperf-measure-before.json`) ? JSON.parse(readFileSync(`${SCREENS}/hubperf-measure-before.json`, 'utf8')) : null;

// HP-T3
check('HP-T3 lite menu nhàn rỗi: screencast <= 3 khung/s', out.gpu.menuIdle.screencastFps <= 3, `${out.gpu.menuIdle.screencastFps} (full ${out.gpuFull.menuIdle.screencastFps})`);
check('HP-T3 lite menu nhàn rỗi: Paint/s <= 5', out.gpu.menuIdle.paintsPerSec <= 5, String(out.gpu.menuIdle.paintsPerSec));
check('HP-T3 lite game HTML nhàn rỗi: screencast <= 3', out.gpu.htmlGameIdle.screencastFps <= 3, String(out.gpu.htmlGameIdle.screencastFps));
check('HP-T3 full vẫn chuyển động (>= 30 khung/s)', out.gpuFull.menuIdle.screencastFps >= 30, String(out.gpuFull.menuIdle.screencastFps));
// HP-T4
if (before) {
  const b = before.gpu.menuReopen;
  const a = out.gpu.menuReopen;
  // damageMp = bbox vùng đổi giữa các khung compositor (screencast) quy ra MP vật lý/s ~ khối lượng OSR phải chép.
  check('HP-T4 mở lại menu: vùng thay đổi (MP vật lý/s) giảm >= 70%', a.damageMpPerSec <= b.damageMpPerSec * 0.3,
    `vùng đổi ${a.damageMpPerSec} vs trước ${b.damageMpPerSec} MP/s; điểm đổi ${a.changedMpPerSec} vs ${b.changedMpPerSec}; paint-clip ${a.mpPerSec} vs ${b.mpPerSec}; khung ${a.screencastFps} vs ${b.screencastFps}`);
}
check('HP-T4 mở lại menu: không long task > 50 ms', out.gpu.menuReopen.longTasks === 0, String(out.gpu.menuReopen.longTasks));

// ---------- HP-T5: Phaser theo DPR ----------
async function phaserInfo(browser, id, query) {
  const { ctx, page } = await openPage(browser, url(query, '/'));
  await page.waitForSelector('.game-card');
  await page.evaluate((h) => { location.hash = h; }, `#/game/${id}`);
  if (id === 'word-ninja') await page.click('[data-testid=wn-mode] [data-value=touch]');
  await page.click(`[data-testid=${id}-start]`, { timeout: 30000 });
  await page.waitForFunction(() => window.__phaser && window.__phaser.canvas && window.__phaser.canvas.isConnected, null, { timeout: 30000 });
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => {
    const g = window.__phaser;
    const rc = g.canvas.getBoundingClientRect();
    return { w: g.canvas.width, h: g.canvas.height, cssW: rc.width, ir: getComputedStyle(g.canvas).imageRendering, k: g.__k || 1 };
  });
  await ctx.close();
  return r;
}
for (const id of ['balloon-pop', 'whack-word', 'tug-of-war', 'word-ninja']) {
  const a = await phaserInfo(gpu, id, '');
  check(`HP-T5 ${id} GPU: canvas/(css x dpr) >= 0.95, image-rendering auto`, a.w / (a.cssW * 3) >= 0.95 && a.ir === 'auto', JSON.stringify(a));
  const b = await phaserInfo(gpu, id, 'gk=1');
  check(`HP-T5 ${id} ?gk=1 => 1440`, b.w === 1440 && b.ir === 'auto', JSON.stringify(b));
}

// ---------- HP-T6: độ nét chữ ----------
out.textAfter = await textCrop(gpu, '', 'hubperf-text-after.png');
out.textGk1 = await textCrop(gpu, 'gk=1', 'hubperf-text-after-gk1.png');
if (before && before.text) {
  check('HP-T6 viền chữ có nhiều mức xám trung gian hơn >= 30% (so với trước)', out.textAfter.ratio >= before.text.ratio * 1.3,
    `trước ${before.text.ratio} (${before.text.mid}/${before.text.edge}), sau ${out.textAfter.ratio} (${out.textAfter.mid}/${out.textAfter.edge}), k=1 ${out.textGk1.ratio}`);
}

// ---------- HP-T7: chạm đúng ở 3 mức k ----------
async function touchTest(browser, id, query) {
  const { ctx, page } = await openPage(browser, url(query, '/'));
  await page.waitForSelector('.game-card');
  await startDuel(page, id);
  await page.waitForTimeout(1200);
  const cdp = await ctx.newCDPSession(page);
  const rect = await page.evaluate(() => { const r = window.__phaser.canvas.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, k: window.__phaser.__k || 1 }; });
  let tries = 0; let hits = 0; let maxErr = 0;
  for (let i = 0; i < 20; i++) {
    const side = i % 2;
    let pt = null;
    for (let j = 0; j < 40 && !pt; j++) {
      const ts = await page.evaluate((s) => window.__duelScene.targets(s), side);
      pt = ts[0] || null;
      if (!pt) await page.waitForTimeout(120);
    }
    if (!pt) continue;
    tries++;
    const before = await page.evaluate(() => {
      const sc = window.__duelScene;
      if (sc.pop && !sc.__spy) { sc.__spy = true; sc.__pops = 0; const o = sc.pop.bind(sc); sc.pop = (b) => { sc.__pops++; return o(b); }; }
      return sc.__pops ?? -1;
    });
    // Chạm kiểu ClassIn: bán kính 25 CSS px (w = h = 50).
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y, id: i + 1, radiusX: 25, radiusY: 25, force: 1 }] });
    const wp = await page.evaluate(() => { const p = window.__duelScene.input.activePointer; return { x: p.worldX, y: p.worldY }; });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(60);
    // Sai số toạ độ thế giới so với điểm chạm (đơn vị thiết kế 1440x800).
    const ex = ((pt.x - rect.l) / rect.w) * 1440;
    const ey = ((pt.y - rect.t) / rect.h) * (id === 'tug-of-war' ? 230 : 800);
    maxErr = Math.max(maxErr, Math.hypot(wp.x - ex, wp.y - ey));
    const after = await page.evaluate(() => window.__duelScene.__pops ?? -1);
    if (after < 0 || after > before) hits++;
    if (tries >= 10 * 2) break;
  }
  await ctx.close();
  return { k: rect.k, tries, hits, maxErr: +maxErr.toFixed(1) };
}
for (const [label, q] of [['gk=1', 'gk=1'], ['gk=1.5', 'gk=1.5'], ['k mặc định', '']]) {
  const bp = await touchTest(gpu, 'balloon-pop', q);
  check(`HP-T7 balloon-pop chạm trúng bóng (${label})`, bp.tries >= 10 && bp.hits === bp.tries && bp.maxErr <= 3, JSON.stringify(bp));
  const ww = await touchTest(gpu, 'whack-word', q);
  check(`HP-T7 whack-word toạ độ chạm đúng (${label})`, ww.tries >= 10 && ww.maxErr <= 3, JSON.stringify(ww));
}

// ---------- HP-T8: giới hạn 30 khung/s ----------
{
  const { ctx, page } = await openPage(gpu, url('gfps=30', '/'));
  await page.waitForSelector('.game-card');
  await startDuel(page, 'balloon-pop');
  await page.waitForTimeout(1500);
  const fps = await page.evaluate(() => new Promise((res) => {
    const g = window.__phaser;
    let n = 0;
    const f = () => { n++; };
    g.events.on('postrender', f);
    setTimeout(() => { g.events.off('postrender', f); res(n / 4); }, 4000);
  }));
  check('HP-T8 ?gfps=30: khung Phaser/s trong 28-32', fps >= 28 && fps <= 32, String(fps));
  const dur = await page.evaluate(() => new Promise((res) => {
    const sc = window.__duelScene;
    let t0 = 0; let b0 = null; let y0 = 0;
    const iv = setInterval(() => {
      if (!b0) {
        b0 = sc.balloons.find((b) => !b.done && b.c.y > 880 && b.c.y < 960) || null;
        if (b0) { t0 = performance.now(); y0 = b0.c.y; }
      } else if (b0.done || b0.c.y < -150 || !b0.c.active) {
        clearInterval(iv);
        const sec = (performance.now() - t0) / 1000;
        res({ sec, expect: (y0 + 150) / b0.speed, speed: b0.speed });
      }
    }, 16);
    setTimeout(() => { clearInterval(iv); res({ sec: -1, expect: 0, speed: 0 }); }, 12000);
  }));
  // Bóng đi theo thời gian thật (không theo số khung): thời gian đo ≈ quãng đường / tốc độ; ~4,8 s ở đầu ván (tốc độ ≈ 230 px/s).
  check('HP-T8 bóng bay hết màn đúng thời gian (không chậm đi vì 30 khung/s)', dur.sec > 0 && Math.abs(dur.sec - dur.expect) <= 0.3 && dur.sec >= 3.2 && dur.sec <= 5.3, JSON.stringify(dur));
  out.hp8 = { fps, dur };
}

// ---------- HP-T9: HUD ----------
{
  const { ctx, page } = await menu(gpu, 'diag=2');
  await page.waitForTimeout(1500);
  const t = await page.textContent('[data-testid=hud-perf]');
  check('HP-T9 HUD ?diag=2 có Hồ sơ/rAF/Phaser/GL', ['Hồ sơ:', 'rAF:', 'Phaser:', 'GL:'].every((s) => t.includes(s)), t.replace(/\n/g, ' | '));
  await ctx.close();
}

// ---------- Ảnh + chế độ phần mềm ----------
await shots(gpu, LABEL, '');
{
  // Ảnh menu bản đầy đủ (Edge/Chrome thường) để chắc kính vẫn còn ngoài ClassIn.
  const { ctx, page } = await openPage(gpu, url('', '/'), { ua: UA_EDGE, viewport: { width: 1280, height: 720 } });
  await page.waitForSelector('.game-card');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${SCREENS}/hubperf-${LABEL}-menu-full.png` });
  await ctx.close();
}
await gpu.close();
const cpu = await launch(CPU_ARGS);
out.cpu = await scenarios(cpu, 'after/cpu', '');
{
  const info = await phaserInfo(cpu, 'balloon-pop', '');
  check('HP-T5 phần mềm: k = 1 (1440 backing)', info.w === 1440, JSON.stringify(info));
}
await cpu.close();
writeFileSync(`${SCREENS}/hubperf-measure-${LABEL}.json`, JSON.stringify(out, null, 1));
server.stop();
console.log(`\n${results.length - failures.length}/${results.length} đạt`);
if (failures.length) console.log('RỚT: ' + failures.join('; '));
process.exit(failures.length ? 1 : 0);
