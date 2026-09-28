// Kiểm tra Giai đoạn 1 bằng Playwright (Chromium):
// 1. Chụp menu chính và tab Soạn bài ở 3 kích thước -> screenshots/
// 2. Tab Soạn bài: dán 3 dòng từ vựng, xuất JSON, nhập lại JSON -> dữ liệu phải giữ nguyên.
// 3. Bản 1-file (dist/index.html, cần chạy build:offline trước nếu có): mở bằng file://,
//    "Lưu thành file mới" -> file tải về phải chứa nội dung bài và mở được.
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
      assert.equal(await page.locator('.game-card').count(), 11, 'menu phải có 11 thẻ');
      assert.equal(await page.locator('.menu-group').count(), 2, 'menu phải có 2 nhóm');
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
  await check('Soạn bài: dán 3 dòng, xuất JSON, nhập lại giữ nguyên', async () => {
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

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=export-json]')]);
    const exportedPath = `${TMP}/exported.json`;
    await download.saveAs(exportedPath);
    const exported = JSON.parse(readFileSync(exportedPath, 'utf8'));
    assert.deepEqual(exported, before, 'file JSON xuất ra khác dữ liệu đang có');

    // Đổi nội dung (khôi phục mẫu) rồi nhập lại file đã xuất.
    await page.click('[data-testid=reset-sample]');
    await page.click('.modal .btn-danger');
    await page.waitForTimeout(200);
    assert.equal(await page.locator('[data-testid=vocab-table] tbody tr').count(), 24, 'khôi phục mẫu phải có 24 từ');

    await page.setInputFiles('[data-testid=import-input]', exportedPath);
    await page.click('.modal .btn-primary');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('eslhub.pack.default')));
    assert.deepEqual(after, exported, 'dữ liệu sau khi nhập lại JSON bị thay đổi');
    const firstRow = await page.locator('[data-testid=vocab-table] tbody tr').first().locator('input').evaluateAll((els) => els.map((e) => e.value));
    assert.deepEqual(firstRow, ['apple', 'quả táo', 'fruit', 'An apple a day keeps the doctor away.']);
    await page.screenshot({ path: `${OUT}/editor-after-import-1366x768.png` });

    // Dán nhiều ô trực tiếp vào bảng (Ctrl+V vào 1 ô).
    await page.locator('[data-testid=vocab-table] tbody tr').nth(2).locator('input').first().evaluate((input) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'rice\tcơm\tmeal\tI eat rice.\nsoup\tsúp\tmeal\tHot soup.');
      input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(600);
    const pasted = await page.evaluate(() => JSON.parse(localStorage.getItem('eslhub.pack.default')).vocab.map((v) => v.word));
    assert.deepEqual(pasted, ['apple', 'milk tea', 'rice', 'soup'], 'dán thẳng vào ô không đúng');
    await context.close();
  });

  // ---------- 3. Bản 1-file + Lưu thành file mới ----------
  const offline = resolve('dist/index.html');
  if (existsSync(offline) && readFileSync(offline, 'utf8').includes('<style')) {
    await check('Bản offline: mở file://, Lưu thành file mới có nội dung nhúng', async () => {
      const { context, page } = await newPage(SIZES[1]);
      await page.goto('file://' + offline + '#/editor');
      await page.waitForSelector('[data-testid=vocab-table]');
      await page.fill('[data-testid=pack-title]', 'Unit 9 - Test <Pack>');
      await page.waitForTimeout(600);
      const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=save-html]')]);
      const saved = `${TMP}/${download.suggestedFilename()}`;
      await download.saveAs(saved);
      const html = readFileSync(saved, 'utf8');
      assert.ok(html.includes('Unit 9 - Test \\u003cPack>'), 'file mới không chứa nội dung bài');

      const p2 = await context.newPage();
      p2.on('pageerror', (e) => errors.push(`saved file: ${e.message}`));
      await p2.goto('file://' + saved);
      await p2.waitForSelector('.game-card');
      const chip = await p2.textContent('[data-testid=pack-chip]');
      assert.ok(chip.includes('Unit 9 - Test <Pack>'), `file mới mở ra sai tên bài: ${chip}`);
      await context.close();
    });
  } else {
    results.push('SKIP bản offline (chạy npm run build:offline trước)');
  }
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
