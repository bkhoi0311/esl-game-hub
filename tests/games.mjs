// Test game trong trình duyệt (Playwright, Chromium). Chạy: npm run test:games [tên-game ...]
// Chụp ảnh từng game vào screenshots/games/.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const OUT = resolve('screenshots/games');
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

const server = await createServer({ server: { port: 5198, strictPort: true }, logLevel: 'error' });
await server.listen();
const BASE = 'http://localhost:5198/';
const browser = await chromium.launch();
const results = [];
const pageErrors = [];

const BIG = { width: 1920, height: 1080 };
const LAPTOP = { width: 1366, height: 768 };
const PHONE = { width: 390, height: 844 };

async function open(hash, viewport = BIG, extra = {}) {
  const context = await browser.newContext({ viewport, ...extra });
  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${hash}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && pageErrors.push(`${hash}: ${m.text()}`));
  await page.goto(BASE + hash);
  return { context, page };
}

const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });

const TESTS = {};

// ---------- Gold Heist ----------
TESTS['gold-heist'] = async () => {
  const { context, page } = await open('#/game/gold-heist');
  await page.waitForSelector('[data-testid=gold-heist-start]');
  await shot(page, 'gold-heist-1-setup');
  await page.click('[data-testid=gh-teams] [data-value="3"]');
  await page.click('[data-testid=gold-heist-start]');

  let chestShot = false;
  for (let q = 0; q < 10; q++) {
    await page.waitForSelector('[data-testid=gh-question]');
    if (q === 0) await shot(page, 'gold-heist-2-question');
    const correct = await page.getAttribute('.gh-answers', 'data-correct');
    // Câu chẵn trả lời đúng, câu lẻ trả lời sai.
    const pick = q % 2 === 0 ? Number(correct) : (Number(correct) + 1) % 3;
    await page.click(`.gh-answers .answer-btn[data-index="${pick}"]`);
    if (q % 2 === 0) {
      await page.waitForSelector('[data-testid=gh-chests]');
      await page.waitForTimeout(600);
      if (!chestShot) await shot(page, 'gold-heist-3-chests');
      await page.click('.gh-chest >> nth=1');
      if (!chestShot) {
        await page.waitForTimeout(1000);
        await shot(page, 'gold-heist-4-open');
        chestShot = true;
      }
      await page.waitForSelector('[data-testid=gh-targets], [data-testid=gh-outcome]', { timeout: 5000 });
      if (await page.$('[data-testid=gh-targets]')) {
        await page.click('.gh-target >> nth=0');
      }
    }
    await page.waitForSelector('[data-testid=gh-outcome]');
    const scores = await page.$$eval('.gh-scores .score-value', (els) => els.map((e) => Number(e.textContent)));
    assert.ok(scores.every((s) => s >= 0), `vàng âm: ${scores}`);
    await page.click('[data-testid=gh-next]');
  }
  await page.waitForSelector('[data-testid=results]');
  const rows = await page.$$eval('.rank-list li', (els) => els.length);
  assert.equal(rows, 3, 'bảng xếp hạng phải có 3 đội');
  const ranked = await page.$$eval('.rank-list li span:last-child', (els) => els.map((e) => parseInt(e.textContent, 10)));
  assert.deepEqual([...ranked].sort((a, b) => b - a), ranked, 'bảng xếp hạng chưa sắp xếp');
  await shot(page, 'gold-heist-5-results');
  await context.close();
};

// ---------- Vào/ra game 5 lần (kiểm tra dọn dẹp) ----------
async function enterExit(id) {
  const { context, page } = await open('#/');
  for (let i = 0; i < 5; i++) {
    await page.evaluate((gid) => (location.hash = `#/game/${gid}`), id);
    await page.waitForSelector('.game-frame');
    await page.evaluate(() => (location.hash = '#/'));
    await page.waitForSelector('.menu');
  }
  const frames = await page.$$eval('.game-frame', (els) => els.length);
  assert.equal(frames, 0, 'còn sót khung game sau khi thoát');
  await context.close();
}

try {
  for (const [name, fn] of Object.entries(TESTS)) {
    if (only.length && !only.includes(name)) continue;
    for (const [label, run] of [[name, fn], [`${name} vào/ra 5 lần`, () => enterExit(name)]]) {
      try {
        await run();
        results.push(`PASS ${label}`);
      } catch (err) {
        results.push(`FAIL ${label}: ${err.message}`);
        process.exitCode = 1;
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
}

if (pageErrors.length) {
  results.push('LỖI TRÌNH DUYỆT:\n  ' + [...new Set(pageErrors)].join('\n  '));
  process.exitCode = 1;
}
console.log(results.join('\n'));

