// Kiểm tra giao diện công cụ "Soạn nhanh" của tab Soạn bài (PLAN-SOANBAI mục F2, F3).
// Chạy:  node tests/soanbai.mjs            (Vite dev, cổng 5198: kịch bản UI 1-9, 11 + ảnh chụp)
//        node tests/soanbai.mjs dist       (python3 http.server cổng 5199 trên dist/: chunk lười + kịch bản chính)
//        node tests/soanbai.mjs offline    (dist/ của `vite build --mode offline`: kịch bản 2, 4, 5, 9 + thời gian mở)
// Ảnh chụp vào SHOTS (mặc định thư mục screens/ của dự án bang-nhieu-nguoi-viet), tên bắt đầu bằng soanbai-.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { readXlsx } from '../src/core/soanbai/xlsx.js';

const MODE = process.argv[2] || 'dev';
const SHOTS = process.env.SHOTS || '/Users/haku/Desktop/BAO KHOI/CLAUDE/PROJECTS/bang-nhieu-nguoi-viet/screens';
const FIX = resolve('tests/fixtures/soanbai');
const TMP = resolve('test-results');
mkdirSync(SHOTS, { recursive: true });
mkdirSync(TMP, { recursive: true });

const BASELINE_MAIN = 342302;
let BASE;
let viteServer = null;
let py = null;
if (MODE === 'dev') {
  viteServer = await createServer({ server: { port: Number(process.env.SB_PORT || 5198), strictPort: true }, logLevel: 'error' });
  await viteServer.listen();
  BASE = `http://localhost:${process.env.SB_PORT || 5198}/`;
} else {
  py = spawn('python3', ['-m', 'http.server', '5199', '-d', 'dist'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1200));
  BASE = 'http://localhost:5199/';
}
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
const errors = [];
const only = process.argv.slice(3);

const P = (name) => `${FIX}/${name}`;
const TID = (id) => `[data-testid="${id}"]`;
const BIG = { width: 1920, height: 1080 };
const HD = { width: 1280, height: 720 };

function check(name, fn) {
  if (only.length && !only.some((o) => name.startsWith(o))) return Promise.resolve();
  return fn().then(
    () => results.push(`PASS ${name}`),
    (err) => {
      results.push(`FAIL ${name}: ${err.message}`);
      process.exitCode = 1;
    },
  );
}

async function newPage(size, extra = {}) {
  const context = await browser.newContext({ viewport: size, acceptDownloads: true, ...extra });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource|net::ERR/.test(t)) return; // do kịch bản chặn mạng chủ ý
    errors.push(`console: ${t}`);
  });
  return { context, page };
}

async function openEditor(size = HD) {
  const { context, page } = await newPage(size);
  await page.goto(BASE + '#/editor');
  await page.waitForSelector(TID('quick-tools'));
  return { context, page };
}

const vocabRows = (page) => page.locator('.vocab-table tbody tr');
const questionRows = (page) => page.locator('.question-table tbody tr');
const packOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('eslhub.pack.default')));
const shot = async (page, name) => { await page.waitForTimeout(800); return page.screenshot({ path: `${SHOTS}/${/^lib[23]-/.test(name) ? "" : "soanbai-"}${name}.png` }); };
const closeModal = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(150); };

async function assertModalFits(page, label) {
  const info = await page.evaluate(() => {
    const m = document.querySelector('.modal');
    const b = m && m.querySelector('.modal-actions .btn');
    const r = b && b.getBoundingClientRect();
    return {
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      btnBottom: r ? r.bottom : -1, btnTop: r ? r.top : -1, vh: window.innerHeight,
      modalOverX: m ? m.scrollWidth - m.clientWidth : 0,
    };
  });
  assert.ok(info.overflowX <= 1, `${label}: tràn ngang ${info.overflowX}px`);
  assert.ok(info.modalOverX <= 1, `${label}: modal tràn ngang ${info.modalOverX}px`);
  assert.ok(info.btnTop >= 0 && info.btnBottom <= info.vh, `${label}: nút hành động ngoài khung nhìn (${info.btnTop}-${info.btnBottom}/${info.vh})`);
}

function validateQuestions(pack) {
  pack.questions.forEach((q, i) => {
    assert.equal(q.options.length, 3, `câu ${i + 1}`);
    assert.equal(new Set(q.options.map((o) => o.trim().toLowerCase())).size, 3, `câu ${i + 1} trùng đáp án`);
    assert.ok(q.options.every(Boolean) && q.prompt, `câu ${i + 1} rỗng`);
    assert.ok(q.answer >= 0 && q.answer < 3);
  });
}

const FAKE_VOCAB = 'apple, banana\nzzqword\nboxes';

try {
  // ---------- 1 ----------
  await check('1. Thấy card Soạn nhanh với 4 nút', async () => {
    const { context, page } = await openEditor(HD);
    for (const id of ['qt-fill', 'qt-questions', 'qt-import', 'qt-library', 'qt-template']) {
      assert.ok(await page.locator(TID(id)).isVisible(), id);
    }
    assert.equal(await page.locator(`${TID('quick-tools')} .qt-btn`).count(), 4);
    if (MODE === 'dev') {
      await shot(page, 'tools-1280x720');
      const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(o <= 1, 'tràn ngang ' + o);
      const p2 = await newPage(BIG);
      await p2.page.goto(BASE + '#/editor');
      await p2.page.waitForSelector(TID('quick-tools'));
      await p2.page.waitForTimeout(700);
      await shot(p2.page, 'tools-1920x1080');
      const o2 = await p2.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(o2 <= 1, 'tràn ngang 1920: ' + o2);
      await p2.context.close();
    }
    await context.close();
  });

  // ---------- 2, 3 ----------
  await check('2. Điền từ danh sách + dòng chưa có trong kho', async () => {
    const { context, page } = await openEditor(HD);
    await page.click(TID('qt-fill'));
    await page.waitForSelector(TID('fill-text'));
    await page.fill(TID('fill-text'), FAKE_VOCAB);
    await page.selectOption(TID('fill-mode'), 'replace');
    await page.click(TID('fill-run'));
    await page.waitForFunction(() => document.querySelector('[data-testid="fill-result"]')?.textContent.includes('chưa có trong kho'));
    const res = await page.textContent(TID('fill-result'));
    assert.match(res, /chưa có trong kho: zzqword/);
    assert.match(res, /Đã điền 3\/4 từ/);
    assert.match(res, /boxes → dùng nghĩa của box/);
    await assertModalFits(page, 'fill');
    if (MODE === 'dev') await shot(page, 'fill-1280x720');
    await page.click(TID('fill-done'));
    await page.waitForTimeout(300);
    assert.equal(await vocabRows(page).count(), 4);
    const apple = vocabRows(page).nth(0);
    assert.ok((await apple.locator('input[aria-label=meaning]').inputValue()).length > 1, 'apple phải có nghĩa');
    assert.ok((await apple.locator('input[aria-label=example]').inputValue()).length > 3, 'apple phải có ví dụ');
    assert.ok((await vocabRows(page).nth(2).getAttribute('class')).includes('row-missing'), 'zzqword phải có row-missing');
    assert.ok(!(await apple.getAttribute('class')).includes('row-missing'));
    // Gõ nghĩa vào dòng thiếu thì mất viền cam.
    await vocabRows(page).nth(2).locator('input[aria-label=meaning]').fill('từ thử');
    assert.ok(!(await vocabRows(page).nth(2).getAttribute('class')).includes('row-missing'), 'phải bỏ viền cam khi sửa nghĩa');
    await context.close();
  });

  await check('3. Tự điền ô trống không ghi đè', async () => {
    const { context, page } = await openEditor(HD);
    await page.click(TID('qt-fill'));
    await page.fill(TID('fill-text'), 'apple\nbanana\ncat');
    await page.selectOption(TID('fill-mode'), 'replace');
    await page.click(TID('fill-run'));
    await page.waitForFunction(() => document.querySelector('[data-testid="fill-result"]')?.textContent.includes('Đã điền'));
    await page.click(TID('fill-done'));
    await page.waitForTimeout(200);
    const meaningOf = (i) => vocabRows(page).nth(i).locator('input[aria-label=meaning]');
    const original = await meaningOf(0).inputValue();
    assert.ok(original);
    await meaningOf(0).fill('');
    await meaningOf(1).fill('chuối của riêng tôi');
    await vocabRows(page).nth(2).locator('input[aria-label=example]').fill('');
    const catBefore = await vocabRows(page).nth(1).locator('input[aria-label=category]').inputValue();
    await page.click(TID('vocab-autofill'));
    await page.waitForFunction((v) => document.querySelectorAll('.vocab-table tbody tr')[0].querySelector('input[aria-label=meaning]').value === v, original);
    assert.equal(await meaningOf(1).inputValue(), 'chuối của riêng tôi', 'không được ghi đè ô đã có chữ');
    assert.equal(await vocabRows(page).nth(1).locator('input[aria-label=category]').inputValue(), catBefore);
    assert.ok((await vocabRows(page).nth(2).locator('input[aria-label=example]').inputValue()).length > 3, 'ví dụ trống phải được điền');
    await context.close();
  });

  // ---------- 4 ----------
  await check('4. Tạo câu hỏi tự động', async () => {
    const { context, page } = await openEditor(HD);
    await page.click(TID('qt-questions'));
    await page.waitForSelector(TID('qtype-list'));
    assert.equal(await page.locator(`${TID('qtype-list')} input:checked`).count() >= 1, true);
    await page.click(`${TID('q-count')} [data-value="10"]`);
    await page.selectOption(TID('q-mode'), 'replace');
    await page.click(TID('q-run'));
    await page.waitForFunction(() => document.querySelector('[data-testid="q-result"]')?.textContent.includes('Đã tạo'));
    assert.match(await page.textContent(TID('q-result')), /Đã tạo 10 câu/);
    await assertModalFits(page, 'questions');
    if (MODE === 'dev') await shot(page, 'questions-1280x720');
    await page.click(TID('q-done'));
    await page.waitForTimeout(300);
    assert.equal(await questionRows(page).count(), 10);
    await page.waitForTimeout(500);
    const pack = await packOf(page);
    validateQuestions(pack);
    assert.ok(pack.questions.every((q) => q.type === 'vocab'));
    if (MODE === 'dev') {
      const errs = await page.evaluate(async () => {
        const c = await import('/src/core/content.js');
        return c.validatePack(c.normalizePack(c.getPack())).errors;
      });
      assert.deepEqual(errs, [], 'validatePack thật phải 0 lỗi');
    }
    // Thêm vào cuối: chạy lần nữa, bảng tăng lên.
    await page.click(TID('questions-auto'));
    await page.selectOption(TID('q-mode'), 'append');
    await page.click(`${TID('q-count')} [data-value="5"]`);
    await page.click(TID('q-run'));
    await page.waitForFunction(() => document.querySelector('[data-testid="q-result"]')?.textContent.includes('Đã tạo'));
    await closeModal(page);
    assert.ok((await questionRows(page).count()) > 10);
    await context.close();
  });

  await check('4b. Khoá khi bảng < 3 từ có nghĩa', async () => {
    const { context, page } = await openEditor(HD);
    await page.click(TID('qt-fill'));
    await page.fill(TID('fill-text'), 'apple');
    await page.selectOption(TID('fill-mode'), 'replace');
    await page.click(TID('fill-run'));
    await page.waitForFunction(() => document.querySelector('[data-testid="fill-result"]')?.textContent.includes('Đã điền'));
    await closeModal(page);
    await page.click(TID('qt-questions'));
    await page.waitForSelector(TID('q-run'));
    assert.ok(await page.locator(TID('q-run')).isDisabled());
    assert.match(await page.textContent('.modal-body'), /Cần ít nhất 3 từ có nghĩa/);
    await context.close();
  });

  // ---------- 5, 6 ----------
  const importFile = async (page, file) => {
    await page.click(TID('qt-import'));
    await page.waitForSelector(TID('import-file'), { state: 'attached' });
    await page.setInputFiles(TID('import-file'), file);
    await page.waitForSelector(TID('import-summary'));
  };

  await check('5a. Nhập CSV (chấm phẩy, BOM) -> xem trước -> đưa vào bảng', async () => {
    const { context, page } = await openEditor(HD);
    const before = await vocabRows(page).count();
    await importFile(page, P('vocab-semicolon-bom.csv'));
    const sum = await page.textContent(TID('import-summary'));
    assert.match(sum, /Đọc được 6 từ vựng/);
    await assertModalFits(page, 'import-preview');
    if (MODE === 'dev') await shot(page, 'import-preview-1280x720');
    await page.click(TID('import-apply'));
    await page.waitForTimeout(400);
    assert.equal(await vocabRows(page).count(), before + 6);
    const pack = await packOf(page);
    const banana = pack.vocab.find((v) => v.word === 'banana');
    assert.ok(banana && banana.meaning && banana.category, 'banana trống phải được điền từ kho');
    assert.equal(pack.vocab.find((v) => v.word === 'ice cream').example, 'I like ice cream, a lot.');
    await context.close();
  });

  await check('5b. Nhập XLSX mẫu (2 trang)', async () => {
    const { context, page } = await openEditor(HD);
    const bv = await vocabRows(page).count();
    const bq = await questionRows(page).count();
    await importFile(page, P('mau-soan-bai.xlsx'));
    const sum = await page.textContent(TID('import-summary'));
    assert.match(sum, /Đọc được 3 từ vựng \(trang 'Từ vựng'\) và 3 câu hỏi \(trang 'Câu hỏi'\)/);
    assert.match(await page.textContent(TID('import-preview')), /Bỏ qua trang 'Hướng dẫn'/);
    await page.click(TID('import-apply'));
    await page.waitForTimeout(400);
    assert.equal(await vocabRows(page).count(), bv + 3);
    assert.equal(await questionRows(page).count(), bq + 3);
    await context.close();
  });

  await check('5c. Nhập TXT danh sách từ + CSV câu hỏi + lỗi file', async () => {
    const { context, page } = await openEditor(HD);
    await importFile(page, P('wordlist.txt'));
    assert.match(await page.textContent(TID('import-summary')), /Đọc được 5 từ tiếng Anh/);
    await page.selectOption(TID('import-vocab-mode'), 'replace');
    await page.click(TID('import-apply'));
    await page.waitForTimeout(400);
    assert.equal(await vocabRows(page).count(), 5);
    assert.ok((await vocabRows(page).nth(0).locator('input[aria-label=meaning]').inputValue()).length > 1, 'apple phải có nghĩa');
    assert.equal(await page.locator('.vocab-table tr.row-missing').count(), 1, 'zzqword thiếu trong kho');
    await importFile(page, P('questions.csv'));
    assert.match(await page.textContent(TID('import-summary')), /Đọc được 3 câu hỏi/);
    await page.selectOption(TID('import-q-mode'), 'replace');
    await page.click(TID('import-apply'));
    await page.waitForTimeout(400);
    assert.equal(await questionRows(page).count(), 3);
    // Đuôi sai + CSV cũ (windows-1258)
    await page.click(TID('qt-import'));
    await page.setInputFiles(TID('import-file'), { name: 'a.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('x') });
    await page.waitForSelector(`${TID('import-error')}:not([hidden])`);
    assert.match(await page.textContent(TID('import-error')), /Chỉ nhận file \.csv, \.txt hoặc \.xlsx/);
    await page.setInputFiles(TID('import-file'), P('vocab-legacy-1258.csv'));
    await page.waitForSelector(TID('import-summary'));
    assert.match(await page.textContent(TID('import-preview')), /không lưu dạng UTF-8/);
    await page.setInputFiles(TID('import-file'), { name: 'bad.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('not a zip at all') });
    await page.waitForFunction(() => /Không mở được file Excel/.test(document.querySelector('[data-testid="import-error"]')?.textContent || ''));
    await page.setInputFiles(TID('import-file'), { name: 'e.csv', mimeType: 'text/csv', buffer: Buffer.from('\n\n') });
    await page.waitForFunction(() => /Không tìm thấy dữ liệu/.test(document.querySelector('[data-testid="import-error"]')?.textContent || ''));
    await context.close();
  });

  await check('6. Kéo thả file CSV vào trang Soạn bài', async () => {
    const { context, page } = await openEditor(HD);
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['word,meaning\nfox,con cáo\nowl,con cú\n'], 'keo-tha.csv', { type: 'text/csv' }));
      const target = document.querySelector('.editor');
      target.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
      target.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    await page.waitForSelector(TID('import-summary'));
    assert.match(await page.textContent(TID('import-summary')), /Đọc được 2 từ vựng/);
    await context.close();
  });

  // ---------- 7 ----------
  await check('7. Tải 3 file mẫu và đọc lại được', async () => {
    const { context, page } = await openEditor(HD);
    const grab = async (testId) => {
      await page.click(TID('qt-template'));
      await page.waitForSelector(TID(testId));
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click(TID(testId))]);
      const path = `${TMP}/dl-${dl.suggestedFilename()}`;
      await dl.saveAs(path);
      await closeModal(page);
      return { name: dl.suggestedFilename(), path };
    };
    const x = await grab('tpl-xlsx');
    assert.equal(x.name, 'mau-soan-bai.xlsx');
    const sheets = await readXlsx(new Uint8Array(readFileSync(x.path)));
    assert.deepEqual(sheets.map((s) => s.name), ['Từ vựng', 'Câu hỏi', 'Hướng dẫn']);
    const v = await grab('tpl-vocab');
    assert.equal(v.name, 'mau-tu-vung.csv');
    assert.equal(readFileSync(v.path, 'utf8').charCodeAt(0), 0xfeff);
    const q = await grab('tpl-questions');
    assert.equal(q.name, 'mau-cau-hoi.csv');
    // Đưa file mẫu vừa tải vào lại
    await importFile(page, v.path);
    assert.match(await page.textContent(TID('import-summary')), /Đọc được 3 từ vựng/);
    await context.close();
  });

  // ---------- 8 ----------
  await check('8. Google Sheet: thành công, chưa công khai, mất mạng', async () => {
    const { context, page } = await openEditor(HD);
    const cors = { 'access-control-allow-origin': '*' };
    let mode = 'ok';
    await context.route('https://docs.google.com/**', (route) => {
      if (mode === 'abort') return route.abort();
      if (mode === 'html') return route.fulfill({ status: 200, contentType: 'text/html', headers: cors, body: '<!DOCTYPE html><html><body>Sign in</body></html>' });
      return route.fulfill({ status: 200, contentType: 'text/csv', headers: cors, body: 'word,meaning,category\nfox,con cáo,animal\nowl,con cú,animal\n' });
    });
    await page.click(TID('qt-import'));
    await page.fill(TID('gs-url'), 'https://docs.google.com/spreadsheets/d/e/2PACX-test/pubhtml');
    await page.click(TID('gs-read'));
    await page.waitForSelector(TID('import-summary'));
    assert.match(await page.textContent(TID('import-summary')), /Đọc được 2 từ vựng \(Google Sheet\)/);
    mode = 'html';
    await page.click(TID('gs-read'));
    await page.waitForFunction(() => /chưa công khai/.test(document.querySelector('[data-testid="import-error"]')?.textContent || ''));
    mode = 'abort';
    await page.click(TID('gs-read'));
    await page.waitForFunction(() => /Không kết nối được Google/.test(document.querySelector('[data-testid="import-error"]')?.textContent || ''));
    await page.fill(TID('gs-url'), 'https://example.com/x');
    await page.click(TID('gs-read'));
    await page.waitForFunction(() => /không phải link Google Sheet/.test(document.querySelector('[data-testid="import-error"]')?.textContent || ''));
    await context.close();
  });

  // ---------- 9 ----------
  await check('9. Thư viện bài (Movers -> Thay) và chơi Memory Match', async () => {
    const { context, page } = await openEditor(HD);
    await page.fill(TID('pack-title'), 'Bài cũ của tôi');
    await page.click(TID('qt-library'));
    await page.waitForSelector(TID('lib-card'));
    await page.click(`${TID('lib-level')} [data-value="movers"]`);
    await page.waitForTimeout(300);
    await assertModalFits(page, 'library');
    if (MODE === 'dev') await shot(page, 'library-1280x720');
    const title = await page.locator(`${TID('lib-card')} .lib-title`).first().textContent();
    await page.locator(TID('lib-card')).first().click();
    await page.waitForSelector(TID('lib-replace'));
    await page.click(TID('lib-replace'));
    await page.waitForTimeout(500);
    assert.equal(await page.inputValue(TID('pack-title')), title);
    assert.ok((await vocabRows(page).count()) >= 12, 'cần >= 12 từ');
    assert.ok((await questionRows(page).count()) >= 12, 'cần >= 12 câu');
    const pack = await packOf(page);
    assert.equal(pack.title, title);
    assert.equal(pack.teams.length >= 2, true);
    validateQuestions(pack);
    await page.goto(BASE + '#/game/memory-match');
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.notice').count(), 0, 'Memory Match không được báo thiếu nội dung');
    await context.close();
  });

  // ---------- 9b (PLAN-LEVELS 5.6) ----------
  await check('9b. Thư viện: tab theo cấp, chip, tìm nhanh, tải lười', async () => {
    const index = JSON.parse(readFileSync('src/data/library/index.json', 'utf8'));
    const { context, page } = await openEditor(HD);
    const packReqs = [];
    const packIds = new Set(index.map((x) => x.id));
    page.on('request', (r) => {
      const u = r.url();
      const m = u.match(/assets\/(.+)-[A-Za-z0-9_-]{8}\.js$/); // dist: mỗi gói là một chunk <id>-<hash>.js
      if (/library\/packs\//.test(u) || (m && packIds.has(m[1]))) packReqs.push(u);
    });
    await page.click(TID('qt-library'));
    await page.waitForSelector(TID('lib-card'));
    // thứ tự tab và số trên tab
    const tabs = await page.locator(`${TID('lib-level')} [data-testid="lib-tab"]`).evaluateAll((els) => els.map((e) => [e.dataset.value, e.textContent.trim()]));
    const order = ['all', 'movers', 'starters', 'flyers', 'ket', 'pet'].filter((v) => v === 'all' || index.some((x) => !x.general && x.level === v));
    assert.deepEqual(tabs.map((t) => t[0]), order);
    const nOf = (lv) => index.filter((x) => !x.general && x.level === lv).length;
    assert.ok(tabs[0][1].startsWith('Tất cả chủ đề'));
    assert.ok(tabs.find((t) => t[0] === 'movers')[1].includes('A1 Movers · ' + nOf('movers')), tabs.join('|'));
    assert.ok(tabs.find((t) => t[0] === 'starters')[1].includes('Pre A1 Starters · ' + nOf('starters')));
    // lần đầu mở: tab Movers
    assert.equal(await page.locator(`${TID('lib-level')} [aria-pressed="true"]`).getAttribute('data-value'), 'movers');
    assert.equal(await page.locator(TID('lib-card')).count(), nOf('movers'));
    assert.equal(packReqs.length, 0, 'chưa bấm gói thì không tải tệp gói: ' + packReqs.join(','));
    await assertModalFits(page, 'library tabs');
    if (MODE === 'dev') await shot(page, 'lib2-movers-1280x720');
    // chip chủ đề
    await page.click(`${TID('lib-chips')} [data-value="animal"]`);
    const animalTitles = await page.locator(`${TID('lib-card')} .lib-title`).allTextContents();
    assert.ok(animalTitles.length >= 1 && animalTitles.length < nOf('movers'), 'chip animal: ' + animalTitles.length);
    await page.click(`${TID('lib-chips')} [data-value=""]`);
    // tìm nhanh (EN và VI không dấu)
    await page.fill(TID('lib-search'), 'food');
    const food = await page.locator(TID('lib-card')).count();
    assert.ok(food >= 1 && food < nOf('movers'), 'tìm food: ' + food);
    await page.fill(TID('lib-search'), 'do an');
    assert.ok((await page.locator(TID('lib-card')).count()) >= 1, 'tìm "do an" không dấu');
    await page.fill(TID('lib-search'), 'zzqqxx');
    assert.equal(await page.locator(TID('lib-card')).count(), 0);
    assert.ok(/Không có bài khớp 'zzqqxx'/.test(await page.locator(TID('lib-empty')).textContent()));
    await page.fill(TID('lib-search'), '');
    // Starters rồi Tất cả (có gói chung ở cuối)
    await page.click(`${TID('lib-level')} [data-value="starters"]`);
    assert.equal(await page.locator(TID('lib-card')).count(), nOf('starters'));
    await page.click(`${TID('lib-level')} [data-value="all"]`);
    assert.equal(await page.locator(TID('lib-card')).count(), index.length);
    assert.ok((await page.locator('.lib-group').last().textContent()).startsWith('Chủ đề chung'));
    // 5 tab cấp: đúng số gói, nhãn có số, mỗi chip chủ đề ra >= 1 gói ở PET, tab PET (109 gói) đổi nhanh và cuộn được
    const LV3 = ['movers', 'starters', 'flyers', 'ket', 'pet'];
    for (const lv of LV3) {
      const t0 = Date.now();
      await page.click(`${TID('lib-level')} [data-value="${lv}"]`);
      assert.equal(await page.locator(TID('lib-card')).count(), nOf(lv), 'số thẻ tab ' + lv);
      const lab = await page.locator(`${TID('lib-level')} [data-value="${lv}"]`).textContent();
      assert.ok(lab.includes(' · ' + nOf(lv)), 'nhãn tab ' + lv + ': ' + lab);
      assert.ok(Date.now() - t0 < 1500, 'đổi sang tab ' + lv + ' chậm: ' + (Date.now() - t0) + ' ms');
      await assertModalFits(page, 'library ' + lv);
      if (MODE === 'dev') await shot(page, 'lib3-' + lv + '-1280x720');
    }
    assert.ok(nOf('pet') >= 100);
    const chipVals = await page.locator(`${TID('lib-chips')} [data-testid="lib-chip"]`).evaluateAll((els) => els.map((e) => e.dataset.value).filter(Boolean));
    assert.ok(chipVals.length >= 12, 'chip: ' + chipVals.length);
    let chipHits = 0;
    for (const v of chipVals) {
      await page.click(`${TID('lib-chips')} [data-value="${v}"]`);
      const n = await page.locator(TID('lib-card')).count();
      if (n > 0) chipHits++;
      assert.ok(n < nOf('pet'), 'chip ' + v + ' không lọc được ở PET (' + n + ')');
    }
    assert.ok(chipHits >= 10, 'chỉ ' + chipHits + ' chip có kết quả ở PET');
    await page.click(`${TID('lib-chips')} [data-value=""]`);
    // cuộn tới thẻ cuối PET
    const scrolled = await page.evaluate(async () => {
      const mb = document.querySelector('.modal-body'); const g = mb || document.scrollingElement;
      g.scrollTop = g.scrollHeight; await new Promise((r) => setTimeout(r, 200)); return g.scrollTop;
    });
    assert.ok(scrolled > 500, 'PET phải cuộn được: ' + scrolled);
    await page.fill(TID('lib-search'), 'phrasal');
    const ph = await page.locator(TID('lib-card')).count();
    assert.ok(ph >= 1, 'tìm phrasal ở PET: ' + ph);
    await page.fill(TID('lib-search'), '');
    // đổi tab được nhớ cho lần mở sau
    await page.click(`${TID('lib-level')} [data-value="starters"]`);
    if (MODE === 'dev') await shot(page, 'lib2-starters-1280x720');
    // bấm một gói: tải đúng 1 tệp gói
    await page.locator(TID('lib-card')).first().click();
    await page.waitForSelector(TID('lib-replace'));
    assert.equal(packReqs.length, 1, 'bấm 1 gói tải đúng 1 tệp: ' + packReqs.join(','));
    await closeModal(page);
    await closeModal(page);
    await page.click(TID('qt-library'));
    await page.waitForSelector(TID('lib-card'));
    assert.equal(await page.locator(`${TID('lib-level')} [aria-pressed="true"]`).getAttribute('data-value'), 'starters', 'nhớ tab lần trước');
    await context.close();
    const big = await newPage(BIG);
    await big.page.goto(BASE + '#/editor');
    await big.page.waitForSelector(TID('quick-tools'));
    await big.page.click(TID('qt-library'));
    await big.page.waitForSelector(TID('lib-card'));
    await assertModalFits(big.page, 'library 1080');
    if (MODE === 'dev') await shot(big.page, 'lib2-movers-1920x1080');
    for (const lv of ['movers', 'starters', 'flyers', 'ket', 'pet']) {
      await big.page.click(`${TID('lib-level')} [data-value="${lv}"]`);
      await assertModalFits(big.page, 'library 1080 ' + lv);
      if (MODE === 'dev') await shot(big.page, 'lib3-' + lv + '-1920x1080');
    }
    await big.context.close();
  });

  // ---------- 10 ----------
  if (MODE === 'dist') {
    await check('10. Chunk lười + kích thước bundle chính', async () => {
      const urls = [];
      const { context, page } = await newPage(HD);
      page.on('request', (r) => urls.push(r.url()));
      const menuJs = {};
      let collecting = true;
      page.on('response', async (r) => {
        if (!collecting || !/\.js(\?|$)/.test(r.url())) return;
        try { menuJs[r.url().split('/').pop()] = (await r.body()).length; } catch { /* bỏ qua */ }
      });
      await page.goto(BASE + '#/');
      await page.waitForSelector('.game-card');
      await page.waitForTimeout(3000);
      collecting = false;
      const bad = /words-|panel-|xlsx-|fflate|library|packs\//;
      assert.deepEqual(urls.filter((u) => bad.test(u)), [], 'menu không được tải chunk soanbai');
      urls.length = 0;
      await page.goto(BASE + '#/editor');
      await page.waitForSelector(TID('quick-tools'));
      await page.waitForTimeout(3500);
      assert.ok(urls.some((u) => /\/words-/.test(u)), 'phải prefetch kho từ (words-)');
      assert.ok(urls.some((u) => /\/panel-/.test(u)), 'phải prefetch panel');
      assert.ok(!urls.some((u) => /xlsx-/.test(u)), 'chưa được tải xlsx-');
      await page.click(TID('qt-import'));
      await page.setInputFiles(TID('import-file'), P('vocab-semicolon-bom.csv'));
      await page.waitForSelector(TID('import-summary'));
      assert.ok(!urls.some((u) => /xlsx-/.test(u)), 'CSV không được tải xlsx-');
      await page.setInputFiles(TID('import-file'), P('mau-soan-bai.xlsx'));
      await page.waitForFunction(() => /trang/.test(document.querySelector('[data-testid="import-summary"]')?.textContent || ''));
      assert.ok(urls.some((u) => /xlsx-/.test(u)), 'chọn .xlsx phải tải xlsx-');
      await context.close();
      const files = readdirSync('dist/assets');
      const menuTotal = Object.values(menuJs).reduce((a, b) => a + b, 0);
      console.log('JS tải khi mở menu:', JSON.stringify(menuJs), 'tổng', menuTotal, '; gốc (index + preload-helper)', BASELINE_MAIN + 1233, '; tăng', menuTotal - BASELINE_MAIN - 1233);
      const main = ['menu-js', menuTotal - 1233];
      const chunks = files.filter((f) => /^(words|panel|xlsx|index|table|library|starters|movers)-.*\.js$/.test(f)).map((f) => `${f}=${statSync('dist/assets/' + f).size}`);
      console.log('Bundle chính (JS tải lúc mở menu, trừ preload-helper):', main[1], 'byte; gốc', BASELINE_MAIN, '; tăng', main[1] - BASELINE_MAIN, '; các chunk:', chunks.join(' '));
      writeFileSync(`${TMP}/bundle-size.txt`, `${main[0]} ${main[1]} (gốc ${BASELINE_MAIN}, tăng ${main[1] - BASELINE_MAIN})\n${chunks.join('\n')}\n`);
      assert.ok(main[1] - BASELINE_MAIN <= 15 * 1024, `bundle chính tăng ${main[1] - BASELINE_MAIN} byte (> 15 KB)`);
    });
  }

  if (MODE === 'offline') {
    await check('F3. Thời gian mở menu (offline)', async () => {
      const times = [];
      for (let i = 0; i < 3; i++) {
        const { context, page } = await newPage(HD);
        const t0 = Date.now();
        await page.goto(BASE);
        await page.waitForSelector('.game-card');
        times.push(Date.now() - t0);
        await context.close();
      }
      console.log('Thời gian goto -> menu (ms):', times.join(', '), '; dist/index.html =', statSync('dist/index.html').size, 'byte');
      writeFileSync(`${TMP}/offline-timing.txt`, `${times.join(',')}ms; index.html ${statSync('dist/index.html').size}\n`);
    });
  }

  // ---------- 11 ----------
  await check('11. Nút mới >= 44x44 px', async () => {
    const { context, page } = await openEditor(HD);
    for (const id of ['qt-fill', 'qt-questions', 'qt-import', 'qt-template', 'qt-library', 'vocab-autofill', 'questions-auto']) {
      const box = await page.locator(TID(id)).boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44, `${id}: ${box && box.width}x${box && box.height}`);
    }
    await context.close();
  });
} finally {
  await browser.close();
  if (viteServer) await viteServer.close();
  if (py) py.kill();
}

if (errors.length) {
  results.push('LỖI TRÌNH DUYỆT:\n  ' + errors.join('\n  '));
  process.exitCode = 1;
}
writeFileSync(`${TMP}/soanbai-summary.txt`, results.join('\n') + '\n');
console.log(results.join('\n'));
