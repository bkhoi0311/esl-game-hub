// Kiểm tra Giai đoạn 1 bằng Playwright (Chromium):
// 1. Chụp menu chính và tab Soạn bài ở 3 kích thước -> screenshots/
// 2. Tab Soạn bài: dán từ vựng, dán thẳng vào ô, mở video hướng dẫn, khôi phục nội dung mẫu.
// Chạy: npm run shots
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const OUT = resolve('screenshots');
const TMP = resolve('test-results');
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const SIZES = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '390x844', width: 390, height: 844 },
];

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const BASE = 'http://localhost:5199/';
const browser = await chromium.launch();
const results = [];
const errors = [];

function check(name, fn) {
  return fn().then(
    () => results.push(`PASS ${name}`),
    (err) => {
      results.push(`FAIL ${name}: ${err.message}`);
      process.exitCode = 1;
    },
  );
}

async function newPage(size) {
  const context = await browser.newContext({ viewport: size, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${size.name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${size.name}: ${m.text()}`));
  return { context, page };
}

try {
  // ---------- 1. Ảnh chụp ----------
  await check('Chụp menu + Soạn bài ở 3 kích thước', async () => {
    for (const size of SIZES) {
      const { context, page } = await newPage(size);
      await page.goto(BASE);
      await page.waitForSelector('.game-card');
      await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 10000 });
      assert.equal(await page.locator('.game-card').count(), 11, 'menu phải có 11 thẻ');
      assert.equal(await page.locator('.group-tab').count(), 2, 'menu phải có 2 nhóm');
      await page.waitForTimeout(1400); // chờ hiệu ứng thẻ bay vào
      await page.screenshot({ path: `${OUT}/menu-${size.name}.png`, fullPage: true });

      await page.click('a[href="#/editor"]');
      await page.waitForSelector('[data-testid=vocab-table]');
      await page.screenshot({ path: `${OUT}/editor-${size.name}.png`, fullPage: false });
      await page.screenshot({ path: `${OUT}/editor-${size.name}-full.png`, fullPage: true });

      // Không được cuộn ngang cả trang.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 1, `trang Soạn bài bị tràn ngang ${overflow}px ở ${size.name}`);
      await context.close();
    }
  });

  // ---------- 2. Dán -> xuất -> nhập ----------
  await check('Soạn bài: dán từ vựng, hướng dẫn, khôi phục mẫu', async () => {
    const { context, page } = await newPage(SIZES[1]);
    await page.goto(BASE + '#/editor');
    await page.waitForSelector('[data-testid=vocab-table]');

    const rows = [
      ['apple', 'quả táo', 'Fruit', 'An apple a day keeps the doctor away.'],
      ['milk tea', 'trà sữa', 'drink', 'I "love" milk tea, it\'s sweet.'],
      ['phở', 'phở bò', 'meal', 'We eat phở for breakfast.'],
    ];
    const tsv = rows.map((r) => r.join('\t')).join('\n');

    await page.locator('.paste-panel').first().locator('summary').click();
    await page.fill('[data-testid=paste-vocab]', tsv);
    await page.selectOption('[data-testid=paste-vocab-mode]', 'replace');
    await page.click('[data-testid=paste-vocab-apply]');
    await page.waitForTimeout(200);
    assert.equal(await page.locator('[data-testid=vocab-table] tbody tr').count(), 3, 'bảng phải còn đúng 3 dòng');

    // Dán trực tiếp vào ô: thêm 1 dòng dán vào ô "word" của dòng thứ 4 (sự kiện paste thật).
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('eslhub.pack.default')));
    assert.deepEqual(
      before.vocab.map((v) => [v.word, v.meaning, v.category, v.example]),
      rows.map((r) => [r[0], r[1], r[2].toLowerCase(), r[3]]),
      'dữ liệu sau khi dán sai',
    );

    // Dán nhiều ô trực tiếp vào bảng (Ctrl+V vào 1 ô).
    await page.locator('[data-testid=vocab-table] tbody tr').nth(2).locator('input').first().evaluate((input) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'rice\tcơm\tmeal\tI eat rice.\nsoup\tsúp\tmeal\tHot soup.');
      input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(600);
    const pasted = await page.evaluate(() => JSON.parse(localStorage.getItem('eslhub.pack.default')).vocab.map((v) => v.word));
    assert.deepEqual(pasted.slice(0, 2).concat(pasted.slice(-2)), [rows[0][0], rows[1][0], 'rice', 'soup'], 'dán thẳng vào ô không đúng');

    // Nút hướng dẫn: mở video + các bước
    await page.click('[data-testid=open-guide]');
    await page.waitForSelector('.gs-pic img');
    assert.equal(await page.locator('.gs-dot').count(), 6, 'hướng dẫn phải có 6 bước');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/editor-guide-1366x768.png` });
    for (let i = 0; i < 3; i++) await page.click('[data-testid=guide-next]');
    await page.waitForTimeout(2200);
    assert.ok(await page.locator('.gs-warn').isVisible(), 'bước đăng nhập phải nhắc cùng tài khoản');
    await page.screenshot({ path: `${OUT}/editor-guide-step4-1366x768.png` });
    await page.click('[data-testid=guide-tab-video]');
    assert.ok(await page.locator('[data-testid=guide-video]').isVisible(), 'tab video');
    await page.keyboard.press('Escape');

    // Khôi phục nội dung mẫu
    await page.click('[data-testid=reset-sample]');
    await page.click('.modal .btn-danger');
    await page.waitForTimeout(200);
    assert.equal(await page.locator('[data-testid=vocab-table] tbody tr').count(), 24, 'khôi phục mẫu phải có 24 từ');
    await context.close();
  });

} finally {
  await browser.close();
  await server.close();
}

if (errors.length) {
  results.push('LỖI TRÌNH DUYỆT:\n  ' + errors.join('\n  '));
  process.exitCode = 1;
}
writeFileSync(`${TMP}/summary.txt`, results.join('\n') + '\n');
console.log(results.join('\n'));
