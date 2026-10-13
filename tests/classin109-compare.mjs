// So bố cục giữa Chromium 109 (lõi ClassIn X) và Chrome mới. Chạy 2 lần rồi so:
//   node tests/classin109-compare.mjs new
//   node --import ~/.cache/esl-chromium109/hook.mjs tests/classin109-compare.mjs 109
//   node tests/classin109-compare.mjs diff
// Ghi ảnh + toạ độ khung các phần tử vào screenshots/classin109/compare/<new|109>/. Math.random cố định để câu hỏi giống nhau.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const MODE = process.argv[2] || 'new';
const ROOT = resolve('screenshots/classin109/compare');
const UA = 'Mozilla/5.0 (Windows NT 6.2; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.5414.120 ClassIn X/6.0.9.1813 Safari/537.36';
const VIEW = { width: 1280, height: 647 };

if (MODE === 'diff') {
  const a = JSON.parse(readFileSync(`${ROOT}/new/boxes.json`, 'utf8'));
  const b = JSON.parse(readFileSync(`${ROOT}/109/boxes.json`, 'utf8'));
  let bad = 0;
  for (const name of Object.keys(a)) {
    if (!b[name]) { console.log('THIẾU trên 109:', name); bad++; continue; }
    const worst = [];
    for (const [k, v] of Object.entries(a[name])) {
      const w = b[name][k];
      if (!w) { worst.push([99999, `${k} chỉ có ở Chrome mới`]); continue; }
      const d = Math.max(Math.abs(v[0] - w[0]), Math.abs(v[1] - w[1]), Math.abs(v[2] - w[2]), Math.abs(v[3] - w[3]));
      if (d > 2) worst.push([d, `${k} new=${v.map(Math.round)} 109=${w.map(Math.round)}`]);
    }
    for (const k of Object.keys(b[name])) if (!a[name][k]) worst.push([99999, `${k} chỉ có ở 109`]);
    worst.sort((x, y) => y[0] - x[0]);
    console.log(worst.length ? `LỆCH ${name}: ${worst.length} phần tử` : `OK    ${name}`);
    worst.slice(0, 6).forEach((x) => console.log('    ', x[1]));
    if (worst.length) bad++;
  }
  process.exit(0);
}

const OUT = `${ROOT}/${MODE}`; mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5195, strictPort: true }, logLevel: 'error' });
await server.listen();
const BASE = 'http://localhost:5195/';
const LA = { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] };
const browser = await chromium.launch(LA).catch(() => chromium.launch({ ...LA, channel: 'chrome' }));
const boxes = existsSync(`${OUT}/boxes.json`) ? JSON.parse(readFileSync(`${OUT}/boxes.json`, 'utf8')) : {}; // ghi chồng lên kết quả cũ
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const SEED = () => { let s = 12345; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const COLLECT = () => {
  const out = {};
  const walk = (el, path, depth) => {
    if (depth > 7) return;
    [...el.children].forEach((c, i) => {
      if (['SCRIPT', 'STYLE', 'CANVAS', 'VIDEO'].includes(c.tagName) && depth > 0) { /* vẫn đo */ }
      const r = c.getBoundingClientRect();
      const key = `${path}/${c.tagName.toLowerCase()}${c.className && typeof c.className === 'string' ? '.' + c.className.trim().split(/\s+/)[0] : ''}[${i}]`;
      if (r.width > 0 || r.height > 0) out[key] = [r.x, r.y, r.width, r.height];
      walk(c, key, depth + 1);
    });
  };
  walk(document.body, '', 0);
  return out;
};

async function snap(name, url, steps) {
  if (ONLY && !ONLY.some((o) => name.startsWith(o))) return;
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 3, userAgent: UA, hasTouch: true, permissions: ['camera'] });
  await ctx.addInitScript(SEED);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  try {
    await page.goto(BASE + url, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    if (steps) await steps(page);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    boxes[name] = await page.evaluate(COLLECT);
    console.log('shot', name, errs.length ? 'LỖI JS: ' + errs.slice(0, 2).join(' | ') : '');
  } catch (e) { console.log('FAIL', name, e.message.split('\n')[0]); }
  await ctx.close();
}

const GAMES = ['gold-heist', 'impostor', 'tug-of-war', 'whack-word', 'balloon-pop', 'memory-match', 'tic-tac-toe', 'sentence-race', 'simon-pose', 'statue-freeze', 'word-ninja'];
await snap('hub-menu', '#/');
await snap('editor', '#/editor');
await snap('chooser', 'start/index.html');
await snap('board', 'board/index.html?zones=3');
const CAM = ['simon-pose', 'statue-freeze'];
for (const g of GAMES) {
  if (g === 'tic-tac-toe') {
    await snap('tic-tac-toe-setup', `#/game/${g}`, (p) => p.waitForSelector('.ttt-cell'));
    await snap('tic-tac-toe-play', `#/game/${g}`, async (p) => { await p.click('.ttt-cell >> nth=4'); await p.waitForSelector('.ttt-answers'); await p.waitForTimeout(600); });
    continue;
  }
  if (CAM.includes(g)) {
    await snap(`${g}-setup`, `#/game/${g}`, (p) => p.waitForSelector('[data-testid=cam-start]:not([disabled])', { timeout: 10000 }));
    await snap(`${g}-play`, `#/game/${g}`, async (p) => { await p.waitForSelector('[data-testid=cam-start]:not([disabled])', { timeout: 10000 }); await p.click('[data-testid=cam-start]'); await p.waitForTimeout(7000); });
    continue;
  }
  await snap(`${g}-setup`, `#/game/${g}`, (p) => p.waitForSelector(`[data-testid="${g}-start"]`, { timeout: 8000 }));
  await snap(`${g}-play`, `#/game/${g}`, async (p) => {
    await p.click(`[data-testid="${g}-start"]`);
    await p.waitForTimeout(1500);
  });
}
writeFileSync(`${OUT}/boxes.json`, JSON.stringify(boxes));
await browser.close(); await server.close();
