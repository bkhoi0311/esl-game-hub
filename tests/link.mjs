// Kiểm tra "Link bài học": Soạn bài -> tạo link -> mở link ở trình duyệt khác (chế độ trình chiếu)
// -> chuyển game, tải lại trang vẫn giữ bài -> "Sửa bài này" chép bài về Soạn bài.
// Chạy: npm run test:link
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const OUT = resolve('screenshots');
mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5195, strictPort: true }, logLevel: 'error' });
await server.listen();
const BASE = 'http://localhost:5195/';
const browser = await chromium.launch();
const errors = [];
let failed = false;

try {
  // 1. Giáo viên soạn bài trên máy tính
  const teacher = await browser.newContext({ viewport: { width: 1366, height: 768 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const t = await teacher.newPage();
  t.on('pageerror', (e) => errors.push(e.message));
  await t.goto(BASE + '#/editor');
  const title = t.locator('[data-testid=pack-title]');
  await title.fill('Unit 9 - Animals');
  await title.blur();
  await t.click('[data-testid=make-link]');
  const link = await t.locator('[data-testid=lesson-link]').inputValue();
  // Lưu file .edu (cùng khuôn công cụ classin.vn): tải về 1 file JSON trỏ tới link bài học
  await t.selectOption('[data-testid=edu-who]', 'true');
  const [dl] = await Promise.all([t.waitForEvent('download'), t.click('[data-testid=save-edu]')]);
  assert.equal(dl.suggestedFilename(), 'unit-9-animals.edu', 'tên file .edu');
  const edu = JSON.parse(readFileSync(await dl.path(), 'utf8'));
  assert.equal(edu.url, link, 'file .edu trỏ đúng link bài học');
  assert.equal(edu.title, 'Unit 9 - Animals');
  assert.equal(edu.classin_authority, true);
  assert.equal(edu.size, '1280x720,400x300');
  assert.ok(edu.uid === true && edu.identity === true);
  console.log('file .edu:', JSON.stringify(edu).length, 'byte JSON');
  assert.match(link, /#L=1[A-Za-z0-9_-]+$/, 'link phải có dạng #L=1...');
  console.log(`link dài ${link.length} ký tự`);
  await t.waitForTimeout(500);
  await t.screenshot({ path: `${OUT}/link-modal.png` });

  // 2. Màn tương tác: trình duyệt mới, chưa từng soạn bài
  const board = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const b = await board.newPage();
  b.on('pageerror', (e) => errors.push(e.message));
  // ClassIn có thể gắn thêm ?uid=..&identity=.. vào link khi mở .edu: vẫn phải đọc được bài
  await b.goto(link.replace('#', '?uid=123&identity=student#') + '&uid=123');
  await b.waitForSelector('.game-card');
  assert.match(await b.textContent('[data-testid=pack-chip]'), /Unit 9 - Animals/, 'phải dùng bài trong link');
  assert.ok(await b.evaluate(() => document.body.classList.contains('present')), 'phải ở chế độ trình chiếu');
  assert.ok(!(await b.locator('.nav-link[href="#/editor"]').isVisible()), 'ẩn Soạn bài');
  assert.equal(new URL(b.url()).hash, '#/', 'link được rút gọn sau khi nạp');

  // Vào game, tải lại trang: vẫn giữ bài
  await b.goto(BASE + '#/game/gold-heist');
  await b.reload();
  await b.waitForSelector('[data-testid=pack-chip]');
  assert.match(await b.textContent('[data-testid=pack-chip]'), /Unit 9 - Animals/, 'tải lại vẫn giữ bài');
  // Gõ #/editor: bị đưa về menu
  await b.goto(BASE + '#/editor');
  await b.waitForFunction(() => location.hash === '#/');

  // 3. "Sửa bài này": chép bài về Soạn bài của máy này
  await b.click('[data-testid=open-settings]');
  await b.click('[data-testid=edit-linked]');
  await b.waitForFunction(() => location.hash === '#/editor' && document.querySelector('.editor-card'));
  assert.ok(!(await b.evaluate(() => document.body.classList.contains('present'))), 'đã thoát chế độ trình chiếu');
  assert.equal(await b.locator('[data-testid=pack-title]').inputValue(), 'Unit 9 - Animals', 'Soạn bài có bài từ link');

  // 4. Link hỏng: không lỗi, dùng bài mặc định
  const c = await board.newPage();
  await c.goto(BASE + '#L=1bad!!');
  await c.waitForSelector('.game-card');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS link bài học');
} catch (err) {
  failed = true;
  console.log(`FAIL link bài học: ${err.message}`);
}
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
