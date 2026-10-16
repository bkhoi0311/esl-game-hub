// .edu gộp: Soạn bài > Lưu file .edu (1 nút) -> url trỏ MÀN CHỌN (start/index.html#L=...) -> màn chọn hiện tên bài trên thẻ ESL
// -> bấm ESL: Hub mở sẵn bài; Bảng không mang bài. Còn: không bài / mã hỏng / EN / .edu cũ không bài / hộp thoại chỉ còn 3 nút.
// Chạy: npm run test:start-edu   (PORT=... đổi cổng; SHOT_DIR=... chụp ảnh; DIST=1 chạy trên dist/ đã build)
import { chromium } from 'playwright';
import { createServer, preview } from 'vite';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const SHOT = process.env.SHOT_DIR || '';
if (SHOT) mkdirSync(SHOT, { recursive: true });
const shot = async (page, name) => { if (SHOT) await page.screenshot({ path: `${SHOT}/${name}.png` }); };
const PORT = Number(process.env.PORT || 5199);
// DIST=1: chạy trên bản build (vite preview) cho nhanh; mặc định Vite dev.
const server = process.env.DIST
  ? await preview({ preview: { port: PORT, strictPort: true, host: 'localhost' }, logLevel: 'error' })
  : await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' });
if (!process.env.DIST) await server.listen();
const BASE = `http://localhost:${PORT}/`;
let browser;
try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ channel: 'chrome' }); }
const errors = [];
let failed = false;
const pg = async (ctx) => { const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message)); return p; };

try {
  const tctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  const t = await pg(tctx);
  await t.goto(BASE + '#/editor');
  const title = t.locator('[data-testid=pack-title]');
  await title.fill('Unit 1+2: Exam');
  await title.blur();
  await t.click('[data-testid=make-link]');
  await t.waitForSelector('[data-testid=save-edu]');
  // Hộp thoại: chỉ còn Mở thử, Sao chép link, Lưu file .edu (không còn nút Bảng)
  assert.equal(await t.locator('[data-testid=open-board]').count(), 0);
  assert.equal(await t.locator('[data-testid=save-edu-board]').count(), 0);
  const labels = await t.locator('.modal .modal-actions button, .modal .actions button, .modal footer button').allTextContents();
  console.log('nút trong hộp thoại:', JSON.stringify(labels));
  assert.ok(!labels.some((x) => /Bảng/.test(x)), 'không còn nút liên quan Bảng');
  const link = await t.locator('[data-testid=lesson-link]').inputValue();
  assert.match(link, /\/start\/index\.html#L=1[A-Za-z0-9_-]+$/, 'link trỏ màn chọn: ' + link.slice(0, 90));
  await shot(t, 'edu-gop-1-hop-thoai');
  const [dl] = await Promise.all([t.waitForEvent('download'), t.click('[data-testid=save-edu]')]);
  assert.equal(dl.suggestedFilename(), 'unit-1-2-exam.edu');
  const edu = JSON.parse(readFileSync(await dl.path(), 'utf8'));
  assert.equal(edu.url, link, 'url trong .edu = link của hộp thoại (Mở thử / Sao chép cùng URL)');
  assert.equal(edu.title, 'Unit 1+2: Exam');
  assert.ok(edu.uid === true && edu.identity === true && edu.size === '1280x720,400x300');

  // Màn tương tác: mở url trong .edu (ClassIn có thể gắn ?uid=...)
  const sctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const s = await pg(sctx);
  await s.goto(edu.url.replace('#', '?uid=1&identity=teacher#'));
  await s.waitForSelector('[data-testid=lesson-chip]:not([hidden])');
  assert.equal(await s.textContent('[data-testid=lesson-title]'), 'Unit 1+2: Exam');
  const counts = await s.textContent('.lesson-counts');
  console.log('thẻ ESL:', counts);
  assert.match(counts, /\d+ từ/);
  assert.ok((await s.getAttribute('[data-testid=part-games]', 'href')).includes('#L='));
  assert.ok(!(await s.getAttribute('[data-testid=part-board]', 'href')).includes('L='), 'Bảng không mang bài');
  await shot(s, 'edu-gop-2-man-chon-vi');
  // EN
  await s.click('.lang-btn:has-text("EN")');
  await s.waitForFunction(() => /Lesson loaded/.test(document.querySelector('.lesson-tag').textContent));
  assert.match(await s.textContent('.lesson-counts'), /\d+ words?/);
  assert.ok((await s.getAttribute('[data-testid=part-games]', 'href')).includes('#L=') && (await s.getAttribute('[data-testid=part-games]', 'href')).includes('ui=en'));
  await shot(s, 'edu-gop-3-man-chon-en');
  await s.click('.lang-btn:has-text("VI")');
  // ESL -> Hub đã nạp bài
  await s.click('[data-testid=part-games]');
  await s.waitForSelector('.game-card');
  assert.match(await s.textContent('[data-testid=pack-chip]'), /Unit 1\+2: Exam/, 'Hub nạp sẵn bài');
  await shot(s, 'edu-gop-4-hub-da-nap-bai');

  // Bảng thuần: không bài, không lỗi, không tải lesson.js
  const bctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const b = await pg(bctx);
  const reqs = []; b.on('request', (r) => reqs.push(r.url()));
  const s2 = await pg(bctx);
  await s2.goto(edu.url);
  await s2.waitForSelector('[data-testid=lesson-chip]:not([hidden])');
  await s2.click('[data-testid=part-board]');
  await s2.waitForSelector('[data-testid=badge-1]');
  assert.ok(!/L=/.test(s2.url()), 'Bảng không có mã bài: ' + s2.url());
  await b.goto(BASE + 'board/index.html?from=hub#L=' + edu.url.split('#L=')[1]);
  await b.waitForSelector('[data-testid=badge-1]');
  await b.waitForTimeout(500);
  assert.ok(!reqs.some((u) => /lesson\.js/.test(u)), 'không còn lesson.js');
  assert.equal(await b.locator('[data-testid=deck-pack-lesson]').count(), 0);

  // Không bài / mã hỏng / .edu cũ: màn chọn như cũ
  for (const u of ['start/index.html', 'start/index.html#L=1bad!!', 'start/index.html?ui=en']) {
    const p = await pg(await browser.newContext({ viewport: { width: 1280, height: 720 } }));
    await p.goto(BASE + u);
    await p.waitForSelector('[data-testid=part-games]');
    await p.waitForTimeout(300);
    assert.equal(await p.locator('[data-testid=lesson-chip]:not([hidden])').count(), 0, u);
    // mã hỏng: không hiện chip; vẫn chuyển mã sang Hub (Hub tự bỏ qua mã hỏng, xem hub-chooser C10)
    if (!/bad/.test(u)) assert.ok(!(await p.getAttribute('[data-testid=part-games]', 'href')).includes('L='), u);
    if (u === 'start/index.html') await shot(p, 'edu-gop-5-man-chon-khong-bai');
  }
  const old = JSON.parse(readFileSync(resolve('public/start/edu/ESL-Game-Hub-2-phan.edu'), 'utf8'));
  assert.match(old.url, /esl-game-hub\/$/, '.edu cũ vẫn trỏ gốc Hub (không bài): Hub tự chuyển về màn chọn');

  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS .edu gộp');
} catch (err) {
  failed = true;
  console.log(`FAIL .edu gộp: ${err.stack || err.message}`);
}
await browser.close();
if (process.env.DIST) await new Promise((r) => server.httpServer.close(r)); else await server.close();
process.exit(failed ? 1 : 0);
