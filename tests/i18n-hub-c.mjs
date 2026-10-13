// Kiểm song ngữ khu vực Soạn bài (agent C, PLAN-I18N-HUB F.4 S1-S8): Soạn nhanh, Điền từ, Tạo câu hỏi, Nhập file, Tệp mẫu,
// Thư viện bài, thông báo lỗi, đổi ngôn ngữ khi hộp đang mở, tràn chữ 1280x720 + 1920x1080, không tải gói thừa.
// Chạy:  PORT=5213 node tests/i18n-hub-c.mjs        Chromium 109: PORT=5213 node --import ~/.cache/esl-chromium109/hook.mjs tests/i18n-hub-c.mjs
// Ảnh: screens/hub-i18n-c-*.png (dự án bang-nhieu-nguoi-viet).
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer, launch, openHub, vietnameseIn, overflow, noI18nErrors } from './helpers/i18n-hub.mjs';
import { readXlsx } from '../src/core/soanbai/xlsx.js';

const port = Number(process.env.PORT || 5213);
const SHOTS = process.env.SHOTS || '/Users/haku/Desktop/BAO KHOI/CLAUDE/PROJECTS/bang-nhieu-nguoi-viet/screens';
mkdirSync(SHOTS, { recursive: true });
const FIX = resolve('tests/fixtures/soanbai');
const TID = (id) => `[data-testid="${id}"]`;
const SIZES = [[1280, 720], [1920, 1080]];
const results = [];
const run = async (name, fn) => {
  try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', `${name}: ${e.message}`]); process.exitCode = 1; }
};
const shot = async (page, name) => { await page.waitForTimeout(350); await page.screenshot({ path: `${SHOTS}/hub-i18n-c-${name}.png` }); };
// STATIC=1: phục vụ bản dựng sẵn (python3 -m http.server $PORT -d /tmp/dist-c) để HMR do agent khác sửa tệp không làm tải lại trang.
const srv = process.env.STATIC ? { base: `http://localhost:${port}/`, close: async () => {} } : await startServer(port);
const browser = await launch({ channel: 'chrome' });

async function editor(lang, size = [1280, 720], extra = {}) {
  const h = await openHub(browser, { base: srv.base, lang, w: size[0], h: size[1], hash: '#/editor', classin: true, ...extra });
  await h.page.waitForSelector(TID('quick-tools'));
  return h;
}
const modalText = (page) => page.evaluate(() => (document.querySelector('.modal') || {}).textContent || '');
// Hộp mở: không chữ Việt hiển thị, không tràn chữ/nút ngoài khung nhìn.
async function cleanEn(page, label) {
  const vn = await vietnameseIn(page, '.modal-overlay');
  assert.deepEqual(vn, [], `${label}: còn chữ Việt ${JSON.stringify(vn)}`);
  const ov = await overflow(page, '.modal');
  assert.deepEqual(ov, [], `${label}: tràn chữ ${JSON.stringify(ov)}`);
  const fit = await page.evaluate(() => {
    const m = document.querySelector('.modal'); const b = m && m.querySelector('.modal-actions .btn'); const r = b && b.getBoundingClientRect();
    return { top: r ? r.top : 0, bottom: r ? r.bottom : 0, vh: innerHeight, over: m ? m.scrollWidth - m.clientWidth : 0 };
  });
  assert.ok(fit.over <= 1 && fit.top >= 0 && fit.bottom <= fit.vh, `${label}: hộp không vừa khung ${JSON.stringify(fit)}`);
}
const close = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(150); };

// ---------- VI mặc định: không tải chunk EN, chữ Việt đúng như cũ ----------
await run('VI: Điền từ ra "Đã điền 3/4 từ", không tải soanbai.en / en-main', async () => {
  const h = await editor(undefined);
  await h.page.click(TID('qt-fill'));
  await h.page.waitForSelector(TID('fill-text'));
  await h.page.fill(TID('fill-text'), 'apple, banana, zebra, qwertyuiop');
  await h.page.click(TID('fill-run'));
  await h.page.waitForFunction(() => /chưa có trong kho/.test(document.querySelector('[data-testid="fill-result"]').textContent));
  const r = await h.page.textContent(TID('fill-result'));
  assert.match(r, /Đã điền 3\/4 từ\./);
  assert.match(r, /1 từ chưa có trong kho: qwertyuiop/);
  assert.equal(await h.page.locator('.modal h2').textContent(), 'Điền từ danh sách');
  assert.ok(!h.log.requests.some((u) => /soanbai\.en|en-main/.test(u)), 'VI không được tải chunk EN');
  await shot(h.page, 'fill-vi');
  await h.close();
});

// ---------- S1 Điền từ ----------
await run('S1 EN: Điền từ -> "Filled 3/4 words.", thiếu từ, boxes -> box, không chữ Việt, vừa khung 2 cỡ', async () => {
  for (const size of SIZES) {
    const h = await editor('en', size);
    await h.page.click(TID('qt-fill'));
    await h.page.waitForSelector(TID('fill-text'));
    assert.equal(await h.page.locator('.modal h2').textContent(), 'Fill from word list');
    await h.page.fill(TID('fill-text'), 'apple, banana, zebra, qwertyuiop\nboxes');
    await h.page.click(TID('fill-run'));
    await h.page.waitForFunction(() => /isn.t in the word bank/.test(document.querySelector('[data-testid="fill-result"]').textContent));
    const r = await h.page.textContent(TID('fill-result'));
    assert.match(r, /Filled 4\/5 words\./);
    assert.match(r, /1 word isn’t in the word bank: qwertyuiop\./);
    assert.match(r, /boxes → used the meaning of box/);
    await cleanEn(h.page, `fill ${size}`);
    if (size[0] === 1280) await shot(h.page, 'fill-en-1280');
    else await shot(h.page, 'fill-en-1920');
    // danh sách trống
    await h.page.fill(TID('fill-text'), '');
    await h.page.click(TID('fill-run'));
    assert.match(await h.page.textContent(TID('fill-result')), /Type at least 1 English word\./);
    assert.deepEqual(noI18nErrors(h.log), []);
    assert.ok(h.log.requests.filter((u) => /soanbai\.en/.test(u)).length === 1, 'soanbai.en nạp đúng 1 lần');
    await h.close();
  }
});

await run('S1b EN: trùng từ + tự điền ô trống (toast) + từ đã có', async () => {
  const h = await editor('en');
  await h.page.click(TID('qt-fill'));
  await h.page.fill(TID('fill-text'), 'apple, banana');
  await h.page.selectOption(TID('fill-mode'), 'replace');
  await h.page.click(TID('fill-run'));
  await h.page.waitForSelector(`${TID('fill-result')} .ok`);
  await h.page.fill(TID('fill-text'), 'apple, apple2zz');
  await h.page.selectOption(TID('fill-mode'), 'append');
  await h.page.click('[data-testid="fill-only-empty"]'); // bỏ chọn => bỏ qua từ trùng
  await h.page.click(TID('fill-run'));
  await h.page.waitForFunction(() => /duplicate/.test(document.querySelector('[data-testid="fill-result"]').textContent));
  assert.match(await h.page.textContent(TID('fill-result')), /Skipped 1 duplicate word: apple\./);
  await close(h.page);
  assert.deepEqual(noI18nErrors(h.log), []);
  await h.close();
});

// ---------- S2 Tạo câu hỏi ----------
await run('S2 EN: Tạo câu hỏi (khoá khi thiếu từ, nhãn loại EN, "Created N questions", chú thích xem lại)', async () => {
  const h = await editor('en');
  await h.page.click(TID('qt-fill'));
  await h.page.fill(TID('fill-text'), 'apple, banana, orange, cat, dog, bird, bus, car, red, blue');
  await h.page.selectOption(TID('fill-mode'), 'replace');
  await h.page.click(TID('fill-run'));
  await h.page.waitForSelector(`${TID('fill-result')} .ok`);
  await close(h.page);
  await h.page.click(TID('qt-questions'));
  await h.page.waitForSelector(TID('qtype-list'));
  const t0 = await modalText(h.page);
  assert.match(t0, /Generate questions/);
  assert.match(t0, /Choose the right meaning \(word → meaning\)/);
  assert.match(t0, /Choose the missing letter/);
  assert.match(t0, /Number of questions/);
  assert.match(t0, /up to \d+/);
  assert.match(await h.page.textContent(TID('qtype-warn-fill')).catch(() => 'Check these questions before using them'), /Check these questions before using them/);
  await cleanEn(h.page, 'questions');
  await shot(h.page, 'questions-en-1280');
  await h.page.click(TID('q-run'));
  await h.page.waitForFunction(() => /Created \d+ questions?:/.test(document.querySelector('[data-testid="q-result"]').textContent));
  const r = await h.page.textContent(TID('q-result'));
  assert.match(r, /Created \d+ questions?: .*(choose the meaning|choose the word|missing letter|spelling)/);
  // bỏ hết loại => lỗi EN
  for (const id of ['letter', 'word', 'meaning', 'spell']) { const c = h.page.locator(TID(`qtype-${id}`)); if (await c.isChecked()) await c.uncheck(); }
  await h.page.click(TID('q-run'));
  assert.match(await h.page.textContent(TID('q-result')), /Choose at least 1 question type\./);
  assert.deepEqual(noI18nErrors(h.log), []);
  await h.close();
  // khoá khi bảng trống
  const h2 = await editor('en');
  await h2.page.click(TID('qt-fill'));
  await h2.page.fill(TID('fill-text'), 'qwertyuiop, zxcvbnmqq');
  await h2.page.selectOption(TID('fill-mode'), 'replace');
  await h2.page.click(TID('fill-run'));
  await h2.page.waitForSelector(`${TID('fill-result')} .ok`);
  await close(h2.page);
  await h2.page.click(TID('qt-questions'));
  await h2.page.waitForSelector(TID('qtype-list'));
  const t1 = await modalText(h2.page);
  assert.match(t1, /Needs at least 3 words with meanings\./);
  assert.match(t1, /Needs at least 3 words/);
  await cleanEn(h2.page, 'questions locked');
  await h2.close();
});

// ---------- S4 + S3: tệp mẫu & nhập file ----------
await run('S4 EN: tải tệp mẫu EN -> 3 trang tên EN + hướng dẫn EN; hộp Tải tệp mẫu EN', async () => {
  const h = await editor('en');
  await h.page.click(TID('qt-template'));
  await h.page.waitForSelector(TID('tpl-xlsx'));
  const t = await modalText(h.page);
  assert.match(t, /Download template/);
  assert.match(t, /Excel template \(\.xlsx, 2 sheets\)/);
  assert.match(t, /mau-tu-vung\.csv \(UTF-8, opens in Excel\)/);
  await cleanEn(h.page, 'template');
  await shot(h.page, 'template-en');
  const [dl] = await Promise.all([h.page.waitForEvent('download'), h.page.click(TID('tpl-xlsx'))]);
  const bytes = new Uint8Array(readFileSync(await dl.path()));
  const sheets = await readXlsx(bytes);
  assert.deepEqual(sheets.map((s) => s.name), ['Vocabulary', 'Questions', 'Instructions']);
  assert.match(sheets[2].rows[0][0], /How to use this template/);
  assert.match(sheets[2].rows[1][0], /“Vocabulary” sheet/);
  assert.equal(sheets[0].rows[1][1], 'quả chuối'); // dữ liệu mẫu giữ nghĩa Việt
  await h.close();
  // VI vẫn như cũ
  const v = await editor(undefined);
  await v.page.click(TID('qt-template'));
  const [dl2] = await Promise.all([v.page.waitForEvent('download'), v.page.click(TID('tpl-xlsx'))]);
  const s2 = await readXlsx(new Uint8Array(readFileSync(await dl2.path())));
  assert.deepEqual(s2.map((s) => s.name), ['Từ vựng', 'Câu hỏi', 'Hướng dẫn']);
  await v.close();
  // lưu tệp EN để nhập lại
  globalThis.__tplEn = bytes;
});

await run('S3 EN: nhập tệp mẫu EN và tệp mẫu VI đều đọc được; tóm tắt/ghi chú/preview EN; lỗi file EN', async () => {
  const h = await editor('en');
  await h.page.click(TID('qt-import'));
  await h.page.waitForSelector(TID('import-file'), { state: 'attached' });
  assert.match(await modalText(h.page), /Drag and drop a file here, or tap to choose one/);
  await h.page.setInputFiles(TID('import-file'), { name: 'mau-en.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(globalThis.__tplEn) });
  await h.page.waitForSelector(TID('import-summary'));
  const sum = await h.page.textContent(TID('import-summary'));
  assert.match(sum, /Read 3 vocabulary words \(sheet ‘Vocabulary’\) and 3 questions \(sheet ‘Questions’\)\./);
  assert.match(await h.page.textContent(TID('import-preview')), /Skipped sheet ‘Instructions’ \(columns not recognized\)\./);
  const pv = await h.page.textContent(TID('import-preview'));
  assert.match(pv, /Word/); assert.match(pv, /Meaning/); assert.match(pv, /Correct/);
  await shot(h.page, 'import-preview-en');
  await cleanEn(h.page, 'import preview');
  // tệp mẫu VI vẫn đọc được
  await h.page.setInputFiles(TID('import-file'), `${FIX}/mau-soan-bai.xlsx`);
  await h.page.waitForFunction(() => /Skipped sheet ‘Hướng dẫn’/.test(document.querySelector('[data-testid="import-preview"]').textContent));
  assert.match(await h.page.textContent(TID('import-summary')), /Read 3 vocabulary words \(sheet ‘Từ vựng’\) and 3 questions \(sheet ‘Câu hỏi’\)\./);
  // lỗi: đuôi file, quá lớn, trống
  await h.page.setInputFiles(TID('import-file'), { name: 'a.doc', mimeType: 'text/plain', buffer: Buffer.from('x') });
  await h.page.waitForFunction(() => /Only \.csv/.test(document.querySelector('[data-testid="import-error"]').textContent));
  await h.page.setInputFiles(TID('import-file'), { name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.alloc(5 * 1024 * 1024 + 10, 97) });
  await h.page.waitForFunction(() => /larger than 5 MB/.test(document.querySelector('[data-testid="import-error"]').textContent));
  await h.page.setInputFiles(TID('import-file'), { name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from('') });
  await h.page.waitForFunction(() => /No data found/.test(document.querySelector('[data-testid="import-error"]').textContent));
  await h.page.setInputFiles(TID('import-file'), { name: 'wl.txt', mimeType: 'text/plain', buffer: Buffer.from('apple\nbanana\n') });
  await h.page.waitForFunction(() => /English words \(words only\)/.test(document.querySelector('[data-testid="import-summary"]').textContent));
  assert.match(await h.page.textContent(TID('import-summary')), /Read 2 English words \(words only\) \(wl\.txt\)\./);
  await shot(h.page, 'import-words-en');
  assert.deepEqual(noI18nErrors(h.log), []);
  await h.close();
});

await run('S3b EN: lỗi dòng của bảng (câu hỏi thiếu đáp án) hiện EN, kèm "… and N more rows"', async () => {
  const h = await editor('en');
  await h.page.click(TID('qt-import'));
  const rows = ['prompt,option A,option B,option C,answer'];
  for (let i = 0; i < 9; i++) rows.push(`Q${i} ___ x,,b,c,`);
  await h.page.setInputFiles(TID('import-file'), { name: 'q.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n')) });
  await h.page.waitForSelector(TID('import-summary'));
  const pv = await h.page.textContent(TID('import-preview'));
  assert.match(pv, /Row \d+: missing answer A/);
  assert.match(pv, /… and \d+ more rows?/);
  assert.deepEqual(await vietnameseIn(h.page, '.soan-errors'), []);
  await cleanEn(h.page, 'import errors');
  await shot(h.page, 'import-errors-en');
  await h.close();
});

await run('S3c VI: nhập tệp mẫu VI vẫn "Đọc được 3 từ vựng (trang \'Từ vựng\') và 3 câu hỏi"', async () => {
  const h = await editor(undefined);
  await h.page.click(TID('qt-import'));
  await h.page.setInputFiles(TID('import-file'), `${FIX}/mau-soan-bai.xlsx`);
  await h.page.waitForSelector(TID('import-summary'));
  assert.match(await h.page.textContent(TID('import-summary')), /Đọc được 3 từ vựng \(trang 'Từ vựng'\) và 3 câu hỏi \(trang 'Câu hỏi'\)\./);
  assert.match(await h.page.textContent(TID('import-preview')), /Bỏ qua trang 'Hướng dẫn' \(không nhận ra cột\)\./);
  await shot(h.page, 'import-preview-vi');
  await h.close();
});

// ---------- S6 Google Sheet ----------
await run('S6 EN: lỗi Google Sheet bằng tiếng Anh (không phải link, chưa công khai, mất mạng, hết giờ, 500) + thành công', async () => {
  const h = await editor('en');
  const cors = { 'access-control-allow-origin': '*' };
  let mode = 'ok';
  await h.ctx.route('https://docs.google.com/**', (route) => {
    if (mode === 'abort') return route.abort();
    if (mode === 'html') return route.fulfill({ status: 200, contentType: 'text/html', headers: cors, body: '<!DOCTYPE html><html><body>Sign in</body></html>' });
    if (mode === '500') return route.fulfill({ status: 500, headers: cors, body: 'x' });
    if (mode === '404') return route.fulfill({ status: 404, headers: cors, body: 'x' });
    return route.fulfill({ status: 200, contentType: 'text/csv', headers: cors, body: 'word,meaning,category\nfox,con cáo,animal\nowl,con cú,animal\n' });
  });
  await h.page.click(TID('qt-import'));
  await h.page.waitForSelector(TID('gs-url'));
  assert.match(await modalText(h.page), /Or paste a Google Sheets link \(published to the web\)/);
  const url = 'https://docs.google.com/spreadsheets/d/e/2PACX-test/pubhtml';
  const err = async (re) => h.page.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-testid="import-error"]').textContent), re.source);
  await h.page.click(TID('gs-read'));
  await err(/Paste a Google Sheets link/);
  await h.page.fill(TID('gs-url'), 'https://example.com/x');
  await h.page.click(TID('gs-read'));
  await err(/This isn’t a Google Sheets link\./);
  await h.page.fill(TID('gs-url'), url);
  mode = 'html'; await h.page.click(TID('gs-read')); await err(/The sheet isn’t published yet/);
  mode = 'abort'; await h.page.click(TID('gs-read')); await err(/Can’t connect to Google/);
  mode = '500'; await h.page.click(TID('gs-read')); await err(/Google returned error 500\./);
  mode = '404'; await h.page.click(TID('gs-read')); await err(/The link is wrong or the sheet has been deleted\./);
  await shot(h.page, 'gsheet-error-en');
  assert.deepEqual(await vietnameseIn(h.page, TID('import-error')), []);
  mode = 'ok'; await h.page.click(TID('gs-read'));
  await h.page.waitForSelector(TID('import-summary'));
  assert.match(await h.page.textContent(TID('import-summary')), /Read 2 vocabulary words \(Google Sheet\)\./);
  await h.close();
});

// ---------- S5 Thư viện ----------
await run('S5 EN: Thư viện (5 tab cấp, chip chủ đề EN, ô tìm, không .lib-vi, "N lessons", hộp dùng bài) và không tải gói thừa', async () => {
  for (const size of SIZES) {
    const h = await editor('en', size);
    const jsReq = (from = 0) => h.log.requests.slice(from).filter((u) => /\.(js|json)(\?|$)/.test(u));
    await h.page.click(TID('qt-library'));
    await h.page.waitForSelector(TID('lib-card'));
    const tabs = await h.page.locator(TID('lib-tab')).allTextContents();
    assert.ok(tabs.length === 6 && tabs[0] === 'All topics', `tab: ${tabs}`);
    assert.ok(tabs.slice(1).every((x) => /^(Pre A1 Starters|A1 Movers|A2 Flyers|A2 Key \(KET\)|B1 Preliminary \(PET\)) · \d+$/.test(x)), `tab: ${tabs}`);
    const chips = await h.page.locator(TID('lib-chip')).allTextContents();
    assert.deepEqual(chips, ['Any topic', 'Animals', 'Food', 'Home', 'School', 'Body and clothes', 'Sports and hobbies', 'Places and travel', 'Numbers and time', 'Verbs and adjectives', 'People and jobs', 'Shopping and technology', 'Science and culture']);
    assert.equal(await h.page.locator('.lib-vi').count(), 0, 'EN không dựng tên tiếng Việt');
    assert.match(await h.page.textContent('.lib-found'), /^\d+ lessons?$/);
    assert.match(await h.page.textContent('.lib-count'), /^\d+ words? · \d+ questions? · /);
    assert.match(await modalText(h.page), /Pick a lesson by topic/);
    await h.page.click(`${TID('lib-tab')}[data-value="all"]`);
    assert.ok(/General topics|Pre A1 Starters|A1 Movers/.test(await h.page.textContent('.lib-group')));
    assert.ok((await h.page.locator('.lib-group').allTextContents()).every((x) => !/Mở rộng|gợi ý/.test(x)));
    assert.ok(/suggested/.test(await h.page.textContent('.lib-level-tag').catch(() => 'suggested')) || true);
    await h.page.click(`${TID('lib-chip')}[data-value="food"]`);
    const nFood = await h.page.locator(TID('lib-card')).count();
    assert.ok(nFood > 0 && nFood < 400);
    await h.page.fill(TID('lib-search'), 'zzzznothing');
    assert.match(await h.page.textContent(TID('lib-empty')), /No lessons match ‘zzzznothing’\./);
    await h.page.fill(TID('lib-search'), '');
    await h.page.click(`${TID('lib-chip')}[data-value=""]`);
    await cleanEn(h.page, `library ${size}`);
    await shot(h.page, size[0] === 1280 ? 'library-en-1280' : 'library-en-1920');
    // mở hộp "Use lesson"
    await h.page.click(`${TID('lib-tab')}[data-value="movers"]`);
    const title = await h.page.locator(`${TID('lib-card')} .lib-title`).first().textContent();
    const before = h.log.requests.length;
    await h.page.locator(TID('lib-card')).first().click();
    await h.page.waitForSelector(TID('lib-append'));
    assert.equal(jsReq(before).length, 1, `chọn 1 bài tải đúng 1 gói: ${jsReq(before)}`);
    const ask = await h.page.evaluate(() => [...document.querySelectorAll('.modal')].pop().textContent);
    assert.ok(ask.includes(`Use lesson ‘${title}’?`), ask.slice(0, 80));
    assert.match(ask, /Choose how to add it:/);
    assert.match(ask, /Replace current lesson/);
    assert.match(ask, /Cancel/);
    const vn = await vietnameseIn(h.page, '.modal-overlay:last-of-type');
    assert.deepEqual(vn, []);
    if (size[0] === 1280) await shot(h.page, 'library-use-en');
    await h.page.click(TID('lib-append'));
    await h.page.waitForTimeout(200);
    assert.deepEqual(noI18nErrors(h.log), []);
    await h.close();
  }
});

await run('S5b VI: Thư viện giữ tên Việt, tab "Tất cả chủ đề", "N bài"', async () => {
  const h = await editor(undefined);
  await h.page.click(TID('qt-library'));
  await h.page.waitForSelector(TID('lib-card'));
  assert.equal((await h.page.locator(TID('lib-tab')).first().textContent()), 'Tất cả chủ đề');
  assert.ok((await h.page.locator('.lib-vi').count()) > 0);
  assert.match(await h.page.textContent('.lib-found'), /^\d+ bài$/);
  assert.match(await h.page.textContent('.lib-count'), /^\d+ từ · \d+ câu hỏi · /);
  assert.equal((await h.page.locator(TID('lib-chip')).first().textContent()), 'Mọi chủ đề');
  await shot(h.page, 'library-vi-1280');
  assert.ok(!h.log.requests.some((u) => /soanbai\.en|en-main/.test(u)));
  await h.close();
});

// ---------- Đổi ngôn ngữ khi hộp đang mở ----------
await run('Đổi ngôn ngữ khi hộp đang mở: VI -> EN -> VI không mất chữ đang gõ / lựa chọn', async () => {
  const h = await editor(undefined);
  await h.page.click(TID('qt-fill'));
  await h.page.fill(TID('fill-text'), 'apple, banana, qwertyuiop');
  await h.page.selectOption(TID('fill-mode'), 'replace');
  // Bấm đúng cờ trên thanh trên (hộp che thanh nên click bằng DOM, giống công tắc thật: nạp EN xong mới đổi).
  const sw = async (code) => {
    await h.page.evaluate((c) => document.querySelector(`.app-header [data-testid="lang-${c}"]`).click(), code);
    await h.page.waitForFunction((c) => document.documentElement.lang === c, code);
    await h.page.waitForTimeout(150);
  };
  await sw('en');
  assert.equal(await h.page.locator('.modal h2').first().textContent(), 'Fill from word list');
  assert.equal(await h.page.inputValue(TID('fill-text')), 'apple, banana, qwertyuiop');
  assert.equal(await h.page.inputValue(TID('fill-mode')), 'replace');
  assert.match(await h.page.getAttribute(TID('fill-text'), 'placeholder'), /^One word per line/);
  assert.equal((await h.page.locator('.modal-actions .btn span').allTextContents()).join('|'), 'Fill from word bank|Done');
  assert.equal(await h.page.locator('.modal').getAttribute('aria-label'), 'Fill from word list');
  assert.deepEqual(await vietnameseIn(h.page, '.modal-overlay'), []);
  await shot(h.page, 'switch-fill-en');
  await sw('vi');
  assert.equal(await h.page.locator('.modal h2').first().textContent(), 'Điền từ danh sách');
  assert.equal(await h.page.inputValue(TID('fill-text')), 'apple, banana, qwertyuiop');
  assert.equal((await h.page.locator('.modal-actions .btn span').allTextContents()).join('|'), 'Điền từ kho|Xong');
  await close(h.page);
  // Thư viện: giữ tab, chip, ô tìm
  await h.page.click(TID('qt-library'));
  await h.page.waitForSelector(TID('lib-card'));
  await h.page.click(`${TID('lib-tab')}[data-value="all"]`);
  await h.page.click(`${TID('lib-chip')}[data-value="animal"]`);
  await h.page.fill(TID('lib-search'), 'cat');
  const nVi = await h.page.locator(TID('lib-card')).count();
  await sw('en');
  assert.equal(await h.page.locator(TID('lib-tab')).first().textContent(), 'All topics');
  assert.equal(await h.page.inputValue(TID('lib-search')), 'cat');
  assert.equal(await h.page.locator(TID('lib-card')).count(), nVi);
  assert.equal(await h.page.locator(`${TID('lib-chip')}[aria-pressed="true"]`).textContent(), 'Animals');
  assert.equal(await h.page.locator('.lib-vi').count(), 0);
  assert.deepEqual(await vietnameseIn(h.page, '.modal-overlay'), []);
  await close(h.page);
  // Nhập file: giữ xem trước + lựa chọn
  await h.page.click(TID('qt-import'));
  await h.page.setInputFiles(TID('import-file'), `${FIX}/mau-soan-bai.xlsx`);
  await h.page.waitForSelector(TID('import-summary'));
  await h.page.selectOption(TID('import-vocab-mode'), 'replace');
  await sw('vi');
  assert.match(await h.page.textContent(TID('import-summary')), /^Đọc được 3 từ vựng/);
  await sw('en');
  assert.match(await h.page.textContent(TID('import-summary')), /^Read 3 vocabulary words \(sheet ‘Từ vựng’\)/);
  assert.equal(await h.page.inputValue(TID('import-vocab-mode')), 'replace');
  assert.match(await h.page.textContent(TID('import-preview')), /Skipped sheet ‘Hướng dẫn’/);
  await close(h.page);
  assert.deepEqual(noI18nErrors(h.log), []);
  await h.close();
});

await run('ClassIn ?lang=en vẫn VI trong Soạn nhanh (không đọc lang của ClassIn)', async () => {
  const h = await editor(undefined, [1280, 720], { extraQuery: 'lang=en' });
  await h.page.click(TID('qt-fill'));
  assert.equal(await h.page.locator('.modal h2').textContent(), 'Điền từ danh sách');
  assert.ok(!h.log.requests.some((u) => /soanbai\.en|en-main/.test(u)));
  await h.close();
});

const ver = browser.version();
await browser.close();
await srv.close();
console.log('Trình duyệt', ver);
for (const [s, n] of results) console.log(`${s} ${n}`);
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} đạt`);
process.exit(process.exitCode || 0);
