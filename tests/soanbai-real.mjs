// Kịch bản bằng dữ liệu THẬT (kho 1150 từ + thư viện 31 gói) và ảnh chụp soanbai-real-*.png ở 1280x720 và 1920x1080.
// Chạy: node tests/soanbai-real.mjs   (Vite dev cổng 5197)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const SHOTS = process.env.SHOTS || '/Users/haku/Desktop/BAO KHOI/CLAUDE/PROJECTS/bang-nhieu-nguoi-viet/screens';
const FIX = resolve('tests/fixtures/soanbai');
mkdirSync(SHOTS, { recursive: true });
const TID = (id) => `[data-testid="${id}"]`;
const SIZES = [{ name: '1280x720', width: 1280, height: 720 }, { name: '1920x1080', width: 1920, height: 1080 }];

const server = await createServer({ server: { port: 5197, strictPort: true }, logLevel: 'error' });
await server.listen();
const BASE = 'http://localhost:5197/';
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
const errors = [];

async function open(size) {
  const context = await browser.newContext({ viewport: size, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(BASE + '#/editor');
  await page.waitForSelector(TID('quick-tools'));
  return { context, page };
}
const shot = async (page, name, size) => { await page.waitForTimeout(700); await page.screenshot({ path: `${SHOTS}/soanbai-real-${name}-${size.name}.png` }); };
const check = async (name, fn) => { try { await fn(); results.push('PASS ' + name); } catch (e) { results.push(`FAIL ${name}: ${e.message}`); process.exitCode = 1; } };
const rows = (page) => page.locator('.vocab-table tbody tr');

try {
  await check('R1. Dán "apple, banana, dog, cat, zebra, qwertyuiop" -> 5/6, từ lạ viền cam', async () => {
    const { context, page } = await open(SIZES[0]);
    await page.click(TID('qt-fill'));
    await page.fill(TID('fill-text'), 'apple, banana, dog, cat, zebra, qwertyuiop');
    await page.selectOption(TID('fill-mode'), 'replace');
    await page.click(TID('fill-run'));
    await page.waitForFunction(() => document.querySelector('[data-testid="fill-result"]')?.textContent.includes('Đã điền'));
    const res = await page.textContent(TID('fill-result'));
    assert.match(res, /5\/6 từ/);
    assert.match(res, /chưa có trong kho: qwertyuiop/);
    await page.click(TID('fill-done'));
    await page.waitForTimeout(300);
    assert.equal(await rows(page).count(), 6);
    for (let i = 0; i < 5; i++) {
      assert.ok((await rows(page).nth(i).locator('input[aria-label=meaning]').inputValue()).length > 1, 'dòng ' + i + ' thiếu nghĩa');
      assert.ok((await rows(page).nth(i).locator('input[aria-label=example]').inputValue()).length > 3);
    }
    const zebra = await rows(page).nth(4).locator('input[aria-label=meaning]').inputValue();
    assert.equal(zebra, 'con ngựa vằn');
    assert.ok((await rows(page).nth(5).getAttribute('class')).includes('row-missing'), 'qwertyuiop phải viền cam');
    await context.close();
  });

  await check('R2. 10 câu hỏi tự động từ bài mẫu Food', async () => {
    const { context, page } = await open(SIZES[0]);
    const nVocab = await rows(page).count();
    assert.ok(nVocab >= 6, 'bài mẫu Food phải có từ: ' + nVocab);
    await page.click(TID('qt-questions'));
    await page.waitForSelector(TID('q-count'));
    await page.click(`${TID('q-count')} [data-value="10"]`);
    await page.selectOption(TID('q-mode'), 'replace');
    await page.click(TID('q-run'));
    await page.waitForFunction(() => document.querySelector('[data-testid="q-result"]')?.textContent.includes('Đã tạo'));
    assert.match(await page.textContent(TID('q-result')), /Đã tạo 10 câu/);
    await page.click(TID('q-done'));
    await page.waitForTimeout(600);
    const info = await page.evaluate(async () => {
      const c = await import('/src/core/content.js');
      const pack = c.normalizePack(c.getPack());
      return { errors: c.validatePack(pack).errors, n: pack.questions.length, qs: pack.questions.map((q) => q.prompt + ' | ' + q.options.join(' / ') + ' | ' + q.options[q.answer]) };
    });
    assert.deepEqual(info.errors, []);
    assert.equal(info.n, 10);
    console.log(info.qs.join('\n'));
    await context.close();
  });

  await check('R3. Chọn gói thư viện -> getQuestions / game Gold Heist', async () => {
    const { context, page } = await open(SIZES[0]);
    await page.click(TID('qt-library'));
    await page.waitForSelector(TID('lib-card'));
    const n = await page.locator(TID('lib-card')).count();
    assert.ok(n >= 24, 'chỉ ' + n + ' thẻ');
    await page.locator(`${TID('lib-card')}[data-id="food-and-drink"]`).click();
    await page.click(TID('lib-replace'));
    await page.waitForTimeout(600);
    assert.equal(await page.inputValue(TID('pack-title')), 'Food and Drink');
    const info = await page.evaluate(async () => {
      const c = await import('/src/core/content.js');
      const pack = c.getPack();
      return { qs: c.getQuestions(pack).length, v: pack.vocab.length, ac: pack.actionCommands.length };
    });
    assert.ok(info.qs >= 12 && info.v >= 12 && info.ac >= 4, JSON.stringify(info));
    await page.goto(BASE + '#/game/gold-heist');
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.notice').count(), 0, 'Gold Heist không được báo thiếu nội dung');
    await context.close();
  });

  for (const size of SIZES) {
    await check('S. Ảnh ' + size.name, async () => {
      // Soạn nhanh
      let { context, page } = await open(size);
      await shot(page, 'soan-nhanh', size);
      // Điền từ
      await page.click(TID('qt-fill'));
      await page.fill(TID('fill-text'), 'apple, banana, dog, cat, zebra, qwertyuiop');
      await page.selectOption(TID('fill-mode'), 'replace');
      await page.click(TID('fill-run'));
      await page.waitForFunction(() => document.querySelector('[data-testid="fill-result"]')?.textContent.includes('Đã điền'));
      await shot(page, 'dien-tu', size);
      await page.click(TID('fill-done'));
      await page.waitForTimeout(400);
      await shot(page, 'bang-sau-khi-dien', size);
      // Câu hỏi tự động
      await page.click(TID('qt-questions'));
      await page.waitForSelector(TID('q-count'));
      await page.click(`${TID('q-count')} [data-value="10"]`);
      await page.selectOption(TID('q-mode'), 'replace');
      await page.click(TID('q-run'));
      await page.waitForFunction(() => document.querySelector('[data-testid="q-result"]')?.textContent.includes('Đã tạo'));
      await shot(page, 'cau-hoi', size);
      await context.close();
      // Thư viện
      ({ context, page } = await open(size));
      await page.click(TID('qt-library'));
      await page.waitForSelector(TID('lib-card'));
      await shot(page, 'thu-vien', size);
      await context.close();
      // Nhập file xem trước
      ({ context, page } = await open(size));
      await page.click(TID('qt-import'));
      await page.waitForSelector(TID('import-file'), { state: 'attached' });
      await page.setInputFiles(TID('import-file'), `${FIX}/vocab-semicolon-bom.csv`);
      await page.waitForSelector(TID('import-summary'));
      await shot(page, 'nhap-file', size);
      await context.close();
    });
  }
  await check('R4. Không lỗi trang', async () => assert.deepEqual(errors, []));
} finally {
  console.log(results.join('\n'));
  await browser.close();
  await server.close();
}
