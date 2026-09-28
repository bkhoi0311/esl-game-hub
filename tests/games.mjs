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

// ---------- Impostor Word ----------
TESTS.impostor = async () => {
  const { context, page } = await open('#/game/impostor');
  await page.click('[data-testid=impostor-start]');
  const seen = new Set();
  for (let r = 0; r < 4; r++) {
    await page.waitForSelector('[data-testid=imp-card]');
    const cards = await page.$$eval('[data-testid=imp-card]', (els) => els.map((e) => ({ word: e.querySelector('.imp-word').textContent, imp: e.dataset.impostor === 'true', cat: e.querySelector('.imp-tag').textContent })));
    assert.equal(cards.length, 5);
    assert.equal(cards.filter((c) => c.imp).length, 1, 'phải có đúng 1 impostor');
    const major = cards.find((c) => !c.imp).cat;
    assert.equal(cards.filter((c) => c.cat !== major).length, 1, 'có 2 từ khác nhóm');
    const key = cards.map((c) => c.word).sort().join('|');
    assert.ok(!seen.has(key), 'lặp tổ hợp trong phiên');
    seen.add(key);
    if (r === 0) {
      await page.click('[data-testid=imp-start]');
      await page.waitForTimeout(1200);
      await shot(page, 'impostor-1-round');
    }
    const pick = r % 2 === 0 ? cards.findIndex((c) => c.imp) : cards.findIndex((c) => !c.imp);
    await page.click(`[data-testid=imp-card] >> nth=${pick}`);
    await page.waitForSelector('[data-testid=imp-answer]');
    const text = await page.textContent('[data-testid=imp-answer]');
    assert.match(text, /4 are \w+, 1 is an? \w+\./);
    if (r === 0) await shot(page, 'impostor-2-reveal');
    await page.click('[data-testid=imp-next]');
  }
  const status = await page.textContent('.imp-status');
  assert.match(status, /Class score 2/);
  await context.close();

  // Thiếu nhóm: báo rõ, không crash.
  const c2 = await browser.newContext({ viewport: BIG });
  const p2 = await c2.newPage();
  p2.on('pageerror', (e) => pageErrors.push(`impostor-missing: ${e.message}`));
  await p2.goto(BASE);
  await p2.evaluate(() => localStorage.setItem('eslhub.pack.default', JSON.stringify({ title: 'T', vocab: [
    { word: 'apple', category: 'fruit' }, { word: 'pear', category: 'fruit' }, { word: 'kiwi', category: 'fruit' }, { word: 'lime', category: 'fruit' },
    { word: 'tea', category: 'drink' }, { word: 'milk', category: 'drink' }, { word: 'soda', category: 'drink' }, { word: 'rice', category: 'meal' } ], questions: [], teams: ['A', 'B'] })));
  await p2.goto(BASE + '#/game/impostor');
  await p2.reload();
  await p2.waitForSelector('.notice');
  const msg = await p2.textContent('.notice');
  assert.match(msg, /"drink" cần thêm 1 từ/);
  await shot(p2, 'impostor-3-missing');
  await c2.close();
};

// ---------- Spell Grid ----------
async function typeWord(page, word, how) {
  for (const ch of word) {
    if (how === 'keyboard') await page.keyboard.press(ch);
    else await page.dispatchEvent(`.wd-key[data-key="${ch}"]`, 'pointerdown');
  }
  if (how === 'keyboard') await page.keyboard.press('Enter');
  else await page.dispatchEvent('.wd-key[data-key="enter"]', 'pointerdown');
  await page.waitForTimeout(900);
}

TESTS.wordle = async () => {
  // Gõ thiếu chữ rồi Enter: báo "Not enough letters", không tính lượt.
  const { context, page } = await open('#/game/wordle');
  await page.click('[data-testid=wordle-start]');
  await page.waitForSelector('[data-testid=wd-grid]');
  await page.keyboard.press('a');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.wd-toast:not([hidden])');
  assert.equal(await page.$$eval('.wd-tile[data-state]', (els) => els.length), 0);
  await context.close();

  // Chơi với bộ nội dung chỉ có "apple" để biết trước đáp án.
  const c2 = await browser.newContext({ viewport: BIG });
  const p2 = await c2.newPage();
  p2.on('pageerror', (e) => pageErrors.push(`wordle: ${e.message}`));
  await p2.goto(BASE);
  await p2.evaluate(() => localStorage.setItem('eslhub.pack.default', JSON.stringify({ title: 'Test', vocab: [
    { word: 'apple', meaning: 'quả táo', category: 'fruit' }, { word: 'ice cream', meaning: 'kem', category: 'meal' } ], questions: [], teams: ['Red', 'Blue'] })));
  await p2.goto(BASE + '#/game/wordle');
  await p2.reload();
  await p2.click('[data-testid=wd-mode] [data-value="solo"]');
  await p2.click('[data-testid=wordle-start]');
  await p2.waitForSelector('[data-testid=wd-grid]');
  assert.equal(await p2.$$eval('.wd-row:first-child .wd-tile', (els) => els.length), 5, 'chỉ dùng từ 4-6 chữ (apple)');

  await typeWord(p2, 'puppy', 'keyboard');       // bàn phím thật
  await typeWord(p2, 'paper', 'virtual');        // bàn phím ảo
  const rows = await p2.$$eval('.wd-row', (rs) => rs.slice(0, 2).map((r) => [...r.children].map((t) => ({ correct: 'G', present: 'Y', absent: '-' })[t.dataset.state]).join('')));
  assert.deepEqual(rows, ['Y-G--', 'YYGY-'], 'tô màu chữ lặp sai');
  const keyP = await p2.getAttribute('.wd-key[data-key="p"]', 'data-state');
  const keyU = await p2.getAttribute('.wd-key[data-key="u"]', 'data-state');
  assert.equal(keyP, 'correct');
  assert.equal(keyU, 'absent');
  await p2.click('[data-testid=wd-hint]');
  assert.match(await p2.textContent('[data-testid=wd-hint-text]'), /quả táo/);
  await shot(p2, 'wordle-1-playing');
  await typeWord(p2, 'apple', 'virtual');
  await p2.waitForSelector('[data-testid=wd-result]');
  assert.match(await p2.textContent('[data-testid=wd-result]'), /Solved! \+20/); // lượt 3: 40 - 20 gợi ý
  assert.equal(await p2.textContent('[data-testid=wd-total]'), 'Score 20');
  await p2.waitForTimeout(400);
  await shot(p2, 'wordle-2-solved');
  await c2.close();
};

// ---------- Tug of War ----------
TESTS['tug-of-war'] = async () => {
  const { context, page } = await open('#/game/tug-of-war', BIG, { hasTouch: true });
  await page.click('[data-testid=tug-of-war-start]');
  await page.waitForSelector('[data-testid=tw-half-1] .answer-btn');
  await shot(page, 'tug-of-war-1-play');

  const center = async (side, which) => {
    const correct = Number(await page.getAttribute(`[data-testid=tw-half-${side}] .tw-answers`, 'data-correct'));
    const idx = which === 'correct' ? correct : (correct + 1) % 3;
    const box = await page.locator(`[data-testid=tw-half-${side}] .answer-btn[data-index="${idx}"]`).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const counts = () => page.$$eval('.tw-half', (els) => els.map((e) => Number(e.dataset.correctCount)));

  // 2 ngón chạm CÙNG LÚC vào đáp án đúng của 2 bên.
  const cdp = await context.newCDPSession(page);
  const a = await center(0, 'correct');
  const b = await center(1, 'correct');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y, id: 1 }, { x: b.x, y: b.y, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(500);
  assert.deepEqual(await counts(), [1, 1], 'chạm đồng thời: cả 2 bên phải được tính');
  assert.equal(await page.getAttribute('[data-testid=tw-flag]', 'data-pos'), '0');

  // Bên phải trả lời sai -> khóa 2 giây, chạm trong lúc khóa không tính; bên trái vẫn chơi được.
  const wrong = await center(1, 'wrong');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: wrong.x, y: wrong.y, id: 3 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForSelector('[data-testid=tw-half-1] .tw-lock:not([hidden])');
  await shot(page, 'tug-of-war-2-locked');
  const r = await center(1, 'correct');
  const l = await center(0, 'correct');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 4 }, { x: l.x, y: l.y, id: 5 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(400);
  assert.deepEqual(await counts(), [2, 1], 'bên bị khóa không được tính, bên kia vẫn tính');
  await page.waitForSelector('[data-testid=tw-half-1] .tw-lock', { state: 'hidden', timeout: 3000 });

  // Bên trái kéo tới vạch thắng (5 nấc).
  for (let k = 0; k < 4; k++) {
    const p = await center(0, 'correct');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 10 + k }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(400);
  }
  await page.waitForSelector('[data-testid=results]');
  assert.match(await page.textContent('[data-testid=results] h2'), /Red wins/);
  await shot(page, 'tug-of-war-3-win');
  await context.close();

  // Điện thoại: báo dùng màn hình lớn.
  const ph = await open('#/game/tug-of-war', PHONE);
  await ph.page.waitForSelector('[data-testid=tw-big-screen]');
  assert.match(await ph.page.textContent('[data-testid=tw-big-screen]'), /Dùng trên màn hình lớn/);
  await shot(ph.page, 'tug-of-war-4-phone');
  await ph.context.close();
};

// ---------- Draw & Guess ----------
TESTS['draw-guess'] = async () => {
  const { context, page } = await open('#/game/draw-guess', BIG, { hasTouch: true });
  await page.click('[data-testid=draw-guess-start]');
  await page.click('[data-testid=dg-begin]');
  const stageText = () => page.evaluate(() => document.querySelector('.stage').innerText.toLowerCase());

  // Nhấn giữ: từ hiện; thả ra: từ biến mất khỏi trang.
  const hold = page.locator('[data-testid=dg-hold]');
  const hb = await hold.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  const word = (await page.textContent('[data-testid=dg-secret]')).trim();
  assert.ok(word.length > 0);
  await shot(page, 'draw-guess-2-holding');
  await page.mouse.up();
  assert.equal(await page.$('[data-testid=dg-secret]'), null, 'từ vẫn còn sau khi thả');
  const re = new RegExp(`\\b${word.toLowerCase()}\\b`);
  assert.ok(!re.test(await stageText()), `từ "${word}" hiện trên màn hình khi không nhấn giữ`);
  const html = await page.content();
  assert.ok(!html.toLowerCase().includes(`>${word.toLowerCase()}<`), 'từ nằm trong HTML khi không nhấn giữ');

  // Vẽ bằng chuột.
  const cv = await page.locator('.dg-canvas').boundingBox();
  await page.mouse.move(cv.x + 100, cv.y + 100);
  await page.mouse.down();
  for (let k = 1; k <= 20; k++) await page.mouse.move(cv.x + 100 + k * 15, cv.y + 100 + Math.sin(k / 3) * 60);
  await page.mouse.up();
  // Vẽ bằng 2 ngón cùng lúc (cảm ứng).
  const cdp = await context.newCDPSession(page);
  const tp = (k) => [{ x: cv.x + 200 + k * 10, y: cv.y + 400, id: 1 }, { x: cv.x + 700 + k * 10, y: cv.y + 420 + k * 5, id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(0) });
  for (let k = 1; k <= 15; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(k) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const inked = (x, y) => page.evaluate(([px, py]) => {
    const c = document.querySelector('.dg-canvas');
    const r = c.getBoundingClientRect();
    const sx = c.width / r.width;
    const d = c.getContext('2d').getImageData(Math.round(px * sx) - 6, Math.round(py * sx) - 6, 12, 12).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
    return false;
  }, [x, y]);
  assert.ok(await inked(100 + 10 * 15, 100 + Math.sin(10 / 3) * 60), 'nét chuột không được vẽ');
  assert.ok(await inked(200 + 80, 400), 'ngón 1 không vẽ được');
  assert.ok(await inked(700 + 80, 420 + 40), 'ngón 2 không vẽ được');
  await shot(page, 'draw-guess-1-drawing');

  // QR.
  await page.click('[data-testid=dg-qr]');
  await page.waitForSelector('[data-testid=dg-qr-code] svg');
  await page.waitForTimeout(400);
  await shot(page, 'draw-guess-3-qr');
  await page.click('.modal .btn-primary');

  // Xóa hết.
  await page.click('[data-testid=dg-clear]');
  assert.ok(!(await inked(280, 400)), 'xóa hết chưa sạch');

  // Đúng -> chọn đội Blue -> Blue +1, hiện đáp án.
  await page.click('[data-testid=dg-correct]');
  await page.click('.dg-team-btn[data-team="1"]');
  await page.waitForSelector('[data-testid=dg-round-end]');
  const scores = await page.$$eval('.dg-scores .score-value', (els) => els.map((e) => Number(e.textContent)));
  assert.deepEqual(scores, [0, 1]);
  assert.match(await page.textContent('[data-testid=dg-round-end]'), new RegExp(word));
  await shot(page, 'draw-guess-4-correct');
  await page.click('[data-testid=dg-next]');
  await page.click('[data-testid=dg-begin]');
  await page.click('[data-testid=dg-finish]');
  await page.waitForSelector('[data-testid=results]');
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

