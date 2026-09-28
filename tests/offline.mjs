// Kiểm tra bản 1-file (dist/index.html) mở trực tiếp bằng file:// — không server, không mạng.
// Chạy sau `npm run build:offline`: npm run test:offline
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const FILE = resolve('dist/index.html');
if (!existsSync(FILE)) {
  console.error('Chưa có dist/index.html. Chạy npm run build:offline trước.');
  process.exit(1);
}
const OUT = resolve('screenshots/offline');
mkdirSync(OUT, { recursive: true });

// Mỗi game: nút bắt đầu + phần tử phải xuất hiện khi đang chơi.
const GAMES = [
  { id: 'gold-heist', ready: '[data-testid=gh-question]' },
  { id: 'impostor', ready: '[data-testid=imp-card]' },
  { id: 'wordle', ready: '[data-testid=wd-keyboard]' },
  { id: 'tug-of-war', ready: '[data-testid=tw-half-1] .answer-btn' },
  { id: 'draw-guess', ready: '.dg-canvas' },
];
const SIZES = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '390x844', width: 390, height: 844 },
];

const browser = await chromium.launch();
const results = [];
const errors = [];

try {
  for (const size of SIZES) {
    const context = await browser.newContext({ viewport: size, offline: true });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${size.name}: ${e.message}`));
    page.on('requestfailed', (r) => errors.push(`${size.name}: tải thất bại ${r.url()}`));
    await page.goto('file://' + FILE);
    await page.waitForSelector('.game-card');
    await page.screenshot({ path: `${OUT}/menu-${size.name}.png`, fullPage: size.width < 700 });
    if (size.width >= 700) {
      const scroll = await page.evaluate(() => [document.documentElement.scrollHeight - innerHeight, document.documentElement.scrollWidth - innerWidth]);
      assert.deepEqual(scroll, [0, 0], `menu bị cuộn ở ${size.name}: ${scroll}`);
    }

    for (const g of GAMES) {
      const label = `${g.id} @ ${size.name}`;
      try {
        await page.evaluate((id) => (location.hash = `#/game/${id}`), g.id);
        if (g.id === 'tug-of-war' && size.width < 700) {
          await page.waitForSelector('[data-testid=tw-big-screen]');
        } else {
          await page.click(`[data-testid=${g.id}-start]`);
          if (g.id === 'draw-guess') await page.click('[data-testid=dg-begin]');
          await page.waitForSelector(g.ready, { timeout: 5000 });
        }
        await page.waitForTimeout(700);
        await page.screenshot({ path: `${OUT}/${g.id}-${size.name}.png` });
        if (size.width >= 700) {
          const overflow = await page.evaluate(() => {
            const st = document.querySelector('.game-stage');
            return [st.scrollHeight - st.clientHeight, st.scrollWidth - st.clientWidth];
          });
          assert.ok(overflow[0] <= 2 && overflow[1] <= 2, `game tràn khung ${overflow}`);
        }
        results.push(`PASS ${label}`);
      } catch (err) {
        results.push(`FAIL ${label}: ${err.message.split('\n')[0]}`);
        process.exitCode = 1;
      }
      await page.evaluate(() => (location.hash = '#/'));
      await page.waitForSelector('.menu');
    }
    await context.close();
  }
} catch (err) {
  results.push(`FAIL: ${err.message.split('\n')[0]}`);
  process.exitCode = 1;
}

// Statue Freeze (không dùng AI) phải chạy ở bản 1-file: dùng camera giả.
try {
  const context = await browser.newContext({ viewport: SIZES[0], offline: true });
  await context.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 360;
      const ctx = c.getContext('2d');
      setInterval(() => {
        ctx.fillStyle = '#8fa3b8';
        ctx.fillRect(0, 0, 640, 360);
        ctx.fillStyle = '#e0664f';
        ctx.fillRect(200, 100, 80, 200);
      }, 33);
      return c.captureStream(30);
    };
    navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'videoinput', deviceId: 'fake', label: 'Fake cam', groupId: 'g' }];
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`statue offline: ${e.message}`));
  await page.goto('file://' + FILE + '#/game/statue-freeze');
  await page.click('[data-testid=cam-start]:not([disabled])');
  await page.waitForFunction(() => window.__statueFreeze && window.__statueFreeze.debug().phase === 'green', null, { timeout: 15000 });
  await page.screenshot({ path: `${OUT}/statue-freeze-offline.png` });
  results.push('PASS statue-freeze @ bản offline (camera giả)');
  await context.close();
} catch (err) {
  results.push(`FAIL statue-freeze @ bản offline: ${err.message.split('\n')[0]}`);
  process.exitCode = 1;
}

await browser.close();
if (errors.length) {
  results.push('LỖI:\n  ' + [...new Set(errors)].join('\n  '));
  process.exitCode = 1;
}
console.log(results.join('\n'));
