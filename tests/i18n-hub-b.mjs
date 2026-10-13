// Kiểm song ngữ tab Soạn bài (editor.js, bước B). Chạy: PORT=5212 node tests/i18n-hub-b.mjs
// Chromium 109: node --import ~/.cache/esl-chromium109/hook.mjs tests/i18n-hub-b.mjs   (C109=1 do hook đặt)
import assert from 'node:assert/strict';
import { startServer, launch, openHub, vietnameseIn, overflow, noI18nErrors, shot } from './helpers/i18n-hub.mjs';

const port = Number(process.env.PORT || 5212);
const srv = await startServer(port);
const browser = await launch({ channel: 'chrome' }).catch(() => launch());
const results = [];
const run = async (name, fn) => { try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name + ': ' + e.message]); } };
const HASH = '#/editor';
const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent.trim(), sel);

await run('VI mặc định: "Soạn bài", "Lưu file .edu", không request en-main', async () => {
  const h = await openHub(browser, { base: srv.base, hash: HASH, classin: true });
  await h.page.waitForSelector('.editor');
  assert.equal(await text(h.page, '.editor h1'), 'Soạn bài');
  assert.match(await text(h.page, '[data-testid=make-link]'), /Lưu file \.edu/);
  assert.match(await text(h.page, '.question-table thead'), /Câu hỏi.*Đáp án A/);
  assert.ok(!h.log.requests.some((u) => /en-main/.test(u)));
  assert.deepEqual(noI18nErrors(h.log), []);
  await h.close();
});

for (const [w, hh] of [[1280, 720], [1920, 1080]]) {
  await run(`EN ${w}x${hh}: đủ khối, không chữ Việt, không tràn chữ`, async () => {
    const h = await openHub(browser, { base: srv.base, lang: 'en', hash: HASH, classin: true, w, h: hh });
    await h.page.waitForSelector('.editor');
    assert.equal(await text(h.page, '.editor h1'), 'Lesson editor');
    const heads = await h.page.$$eval('.editor-card h2', (a) => a.map((x) => x.textContent.trim()));
    assert.deepEqual(heads, ['Quick build', 'Lesson details', 'Vocabulary', 'Multiple-choice questions', 'Action commands (Statue Freeze)']);
    assert.equal(await text(h.page, '[data-testid=make-link]'), 'Save .edu file');
    assert.equal(await text(h.page, '[data-testid=reset-sample]'), 'Restore sample content');
    assert.match(await text(h.page, '.vocab-table thead'), /Word.*Meaning.*Category.*Example sentence/);
    // mở các ô dán để đo luôn
    await h.page.$$eval('details', (d) => d.forEach((x) => { x.open = true; }));
    assert.deepEqual(await vietnameseIn(h.page, '.editor'), []);
    assert.deepEqual(await overflow(h.page, '.editor'), []);
    await shot(h.page, `hub-i18n-b-editor-en-${w}`);
    assert.deepEqual(noI18nErrors(h.log), []);
    await h.close();
  });
}

await run('Hộp "Lưu bài cho ClassIn (.edu)" EN: nút, 3 bước, không chữ Việt, không tràn', async () => {
  const h = await openHub(browser, { base: srv.base, lang: 'en', hash: HASH, classin: true });
  await h.page.waitForSelector('.editor');
  await h.page.click('[data-testid=make-link]');
  await h.page.waitForSelector('.modal');
  assert.equal(await text(h.page, '.modal h2, .modal .modal-title'), 'Save lesson for ClassIn (.edu)');
  const btns = await h.page.$$eval('.modal-actions button, .modal footer button', (a) => a.map((x) => x.textContent.trim()));
  assert.ok(btns.includes('Save .edu for Multi-Writer Board') && btns.includes('Try on the board') && btns.includes('Save .edu file'), btns.join('|'));
  assert.deepEqual(await vietnameseIn(h.page, '.modal-overlay'), []);
  assert.deepEqual(await overflow(h.page, '.modal'), []);
  await shot(h.page, 'hub-i18n-b-edu-modal-en');
  // URL trong .edu/bảng mang ui=en
  assert.match(await h.page.$eval('[data-testid=lesson-link]', (e) => e.value), /./);
  await h.close();
});

await run('Dán 3 từ ⇒ toast "Added 3 words."; trạng thái "Auto-saved at"; lỗi "errors/warning"', async () => {
  const h = await openHub(browser, { base: srv.base, lang: 'en', hash: HASH });
  await h.page.waitForSelector('.editor');
  await h.page.$eval('[data-testid=paste-vocab]', (e) => e.closest('details').open = true);
  await h.page.fill('[data-testid=paste-vocab]', 'cat\tcon mèo\tanimal\tA cat.\ndog\tcon chó\tanimal\tA dog.\nfish\tcon cá\tanimal\tA fish.');
  await h.page.selectOption('[data-testid=paste-vocab-mode]', 'replace');
  await h.page.click('[data-testid=paste-vocab-apply]');
  await h.page.waitForSelector('.toast');
  assert.match(await text(h.page, '.toast'), /Added 3 words\./);
  assert.match(await text(h.page, '.editor-status'), /^Auto-saved at /);
  assert.match(await text(h.page, '.vocab-table ~ *, .editor'), /./);
  assert.equal(await h.page.$$eval('.vocab-table tbody tr', (a) => a.length), 3);
  assert.match(await text(h.page, '.head-extra .count'), /^3 words, 1 group$/);
  assert.match(await text(h.page, '.issue-box summary, .issue'), /error|looks good/);
  assert.deepEqual(await vietnameseIn(h.page, '.editor-issues, .editor-status, .toast'), []);
  await h.close();
});

await run('Đổi ngôn ngữ không mất dữ liệu đang nhập (tên bài, từ, câu hỏi, đội, lệnh, ô dán)', async () => {
  const h = await openHub(browser, { base: srv.base, lang: 'vi', hash: HASH });
  await h.page.waitForSelector('.editor');
  await h.page.fill('[data-testid=pack-title]', 'Bài thử B');
  await h.page.fill('[data-testid=commands]', 'Jump\nSpin');
  await h.page.click('.editor-card:has([data-testid=vocab-table]) button:has-text("Thêm từ")');
  await h.page.fill('.vocab-table tbody tr:last-child .col-word input', 'zebra');
  await h.page.click('.editor-card:has(.question-table) button:has-text("Thêm câu hỏi")');
  await h.page.fill('.question-table tbody tr:last-child .col-prompt input', 'Xyz ___?');
  await h.page.$eval('[data-testid=paste-vocab]', (e) => e.closest('details').open = true);
  const before = await h.page.evaluate(() => JSON.stringify({ vocab: document.querySelectorAll('.vocab-table tbody tr').length, q: document.querySelectorAll('.question-table tbody tr').length, teams: document.querySelectorAll('.team-edit input').length }));
  await h.page.click('button[lang="en"]');
  await h.page.waitForFunction(() => document.querySelector('.editor h1')?.textContent === 'Lesson editor');
  assert.equal(await h.page.inputValue('[data-testid=pack-title]'), 'Bài thử B');
  assert.equal(await h.page.inputValue('[data-testid=commands]'), 'Jump\nSpin');
  assert.equal(await h.page.inputValue('.vocab-table tbody tr:last-child .col-word input'), 'zebra');
  assert.equal(await h.page.inputValue('.question-table tbody tr:last-child .col-prompt input'), 'Xyz ___?');
  assert.equal(await h.page.evaluate(() => JSON.stringify({ vocab: document.querySelectorAll('.vocab-table tbody tr').length, q: document.querySelectorAll('.question-table tbody tr').length, teams: document.querySelectorAll('.team-edit input').length })), before);
  assert.equal(await h.page.$eval('[data-testid=paste-vocab]', (e) => e.closest('details').open), true);
  assert.deepEqual(await vietnameseIn(h.page, '.editor'), []);
  // bài đã lưu ngay
  assert.match(await h.page.evaluate(() => JSON.stringify(Object.entries(localStorage))), /Bài thử B/);
  // quay lại VI
  await h.page.click('button[lang="vi"]');
  await h.page.waitForFunction(() => document.querySelector('.editor h1')?.textContent === 'Soạn bài');
  assert.equal(await h.page.inputValue('[data-testid=pack-title]'), 'Bài thử B');
  assert.equal(await text(h.page, '[data-testid=make-link]'), 'Lưu file .edu');
  await shot(h.page, 'hub-i18n-b-editor-vi-1280');
  assert.deepEqual(noI18nErrors(h.log), []);
  await h.close();
});

await run('Bài có lỗi: khung lỗi EN "N errors, M warnings" + câu content.* tiếng Anh', async () => {
  const h = await openHub(browser, { base: srv.base, lang: 'en', hash: HASH });
  await h.page.waitForSelector('.editor');
  await h.page.fill('[data-testid=pack-title]', '');
  await h.page.click('.editor-card:has([data-testid=vocab-table]) button:has-text("Add word")');
  await h.page.waitForSelector('.issue-box summary', { timeout: 8000 });
  const s = await text(h.page, '.issue-box summary');
  assert.match(s, /\d+ errors?, \d+ warnings?/, s);
  assert.deepEqual(await vietnameseIn(h.page, '.editor-issues'), []);
  await h.close();
});

console.log(results.map((r) => r.join(' ')).join('\n'));
const fail = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - fail}/${results.length} đạt`);
await browser.close();
await srv.close();
process.exit(fail ? 1 : 0);
