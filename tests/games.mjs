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
      await page.waitForTimeout(1000); // chờ rương bay vào xong
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

// ---------- Whack-a-Word + Balloon Pop: 2 học sinh chạm cùng lúc ----------
TESTS['whack-word'] = async () => {
  const { context, page } = await open('#/game/whack-word', BIG, { hasTouch: true });
  await page.click('[data-testid=whack-word-start]');
  await page.waitForFunction(() => window.__duelScene, null, { timeout: 15000 });
  const cdp = await context.newCDPSession(page);
  const scores = () => page.$$eval('.pd-scores .score-value', (els) => els.map((e) => Number(e.textContent)));
  const end = Date.now() + 25000;
  let sc = [0, 0];
  let shotDone = false;
  // Chờ tới khi CẢ 2 bên cùng có chuột mục tiêu đang ngoi, rồi 2 ngón chạm cùng lúc.
  while (Date.now() < end && (sc[0] < 2 || sc[1] < 2)) {
    const pts = await page.evaluate(() => [0, 1].map((i) => window.__duelScene.targets(i).find((t) => t.target) || null));
    if (pts[0] && pts[1]) {
      if (!shotDone) {
        await shot(page, 'whack-word-1-play');
        shotDone = true;
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0].x, y: pts[0].y, id: 1 }, { x: pts[1].x, y: pts[1].y, id: 2 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(150);
    }
    sc = await scores();
    await page.waitForTimeout(100);
  }
  assert.ok(sc[0] >= 2 && sc[1] >= 2, `chạm đồng thời 2 bên phải cùng được điểm: ${sc}`);
  await shot(page, 'whack-word-2-hit');
  // Đập sai: trừ 1 điểm.
  let wrong = null;
  for (let k = 0; k < 40 && !wrong; k++) {
    wrong = await page.evaluate(() => window.__duelScene.targets(0).find((t) => !t.target) || null);
    if (!wrong) await page.waitForTimeout(100);
  }
  if (wrong) {
    const before = (await scores())[0];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: wrong.x, y: wrong.y, id: 9 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);
    assert.equal((await scores())[0], before - 1, 'đập sai phải bị trừ 1 điểm');
  }
  await context.close();
  const ph = await open('#/game/whack-word', PHONE);
  await ph.page.waitForSelector('[data-testid=duel-big-screen]');
  await ph.context.close();
};

TESTS['balloon-pop'] = async () => {
  const { context, page } = await open('#/game/balloon-pop', BIG, { hasTouch: true });
  await page.click('[data-testid=balloon-pop-seconds] [data-value="45"]');
  await page.click('[data-testid=balloon-pop-start]');
  await page.waitForSelector('[data-testid=duel-banner]:not([hidden])');
  await page.waitForFunction(() => window.__duelScene, null, { timeout: 15000 });
  assert.match(await page.textContent('[data-testid=duel-banner]'), /Pop only [A-Z]+/);
  const cdp = await context.newCDPSession(page);
  const scores = () => page.$$eval('.pd-scores .score-value', (els) => els.map((e) => Number(e.textContent)));
  const end = Date.now() + 25000;
  let sc = [0, 0];
  let shotDone = false;
  while (Date.now() < end && (sc[0] < 2 || sc[1] < 2)) {
    const pts = await page.evaluate(() => {
      const cat = document.querySelector('[data-testid=duel-banner]').textContent.split(' ').pop().toLowerCase();
      return [0, 1].map((i) => window.__duelScene.targets(i).find((t) => cat.startsWith(t.cat)) || null);
    });
    if (pts[0] && pts[1]) {
      if (!shotDone) {
        await shot(page, 'balloon-pop-1-play');
        shotDone = true;
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0].x, y: pts[0].y, id: 1 }, { x: pts[1].x, y: pts[1].y, id: 2 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(200);
      if (sc[0] === 0 && sc[1] === 0) await shot(page, 'balloon-pop-2-pop');
    }
    sc = await scores();
    await page.waitForTimeout(120);
  }
  assert.ok(sc[0] >= 2 && sc[1] >= 2, `2 bên chạm cùng lúc phải cùng được điểm: ${sc}`);
  await context.close();
};

// ---------- Memory Match ----------
TESTS['memory-match'] = async () => {
  const { context, page } = await open('#/game/memory-match');
  await page.click('[data-testid=mm-pairs] [data-value="6"]');
  await page.click('[data-testid=memory-match-start]');
  await page.waitForSelector('[data-testid=mm-grid]');
  const pairs = await page.$$eval('.mm-card', (els) => els.map((e) => Number(e.dataset.pair)));
  assert.equal(pairs.length, 12);
  // Lật sai 1 lần: đổi lượt.
  const first = pairs[0];
  const wrongIdx = pairs.findIndex((p, i) => i > 0 && p !== first);
  await page.click('.mm-card[data-index="0"]');
  await page.click(`.mm-card[data-index="${wrongIdx}"]`);
  await page.waitForTimeout(1600);
  assert.match(await page.textContent('[data-testid=mm-turn]'), /Blue team/);
  await shot(page, 'memory-match-1-play');
  // Lật đúng hết các cặp.
  for (let p = 0; p < 6; p++) {
    const idx = pairs.map((x, i) => (x === p ? i : -1)).filter((i) => i >= 0);
    await page.click(`.mm-card[data-index="${idx[0]}"]`);
    await page.click(`.mm-card[data-index="${idx[1]}"]`);
    await page.waitForTimeout(700);
    if (p === 2) await shot(page, 'memory-match-2-matched');
  }
  await page.waitForSelector('[data-testid=results]', { timeout: 5000 });
  const scores = await page.$$eval('.rank-list li span:last-child', (els) => els.map((e) => parseInt(e.textContent, 10)));
  assert.deepEqual(scores.sort(), [0, 6]);
  await context.close();
};

// ---------- Tic-Tac-Toe Quiz ----------
TESTS['tic-tac-toe'] = async () => {
  const { context, page } = await open('#/game/tic-tac-toe');
  await page.waitForSelector('[data-testid=ttt-board]');
  const play = async (cell, correct) => {
    await page.click(`.ttt-cell[data-index="${cell}"]`);
    await page.waitForSelector('.ttt-answers');
    const c = Number(await page.getAttribute('.ttt-answers', 'data-correct'));
    await page.click(`.ttt-answers .answer-btn[data-index="${correct ? c : (c + 1) % 3}"]`);
    await page.waitForTimeout(1400);
  };
  await play(0, true); // Red X ô 0
  await play(4, false); // Blue sai -> ô 4 vẫn trống
  assert.equal(await page.$eval('.ttt-cell[data-index="4"]', (e) => e.classList.contains('taken')), false);
  await shot(page, 'tic-tac-toe-1-question');
  await play(1, true); // Red ô 1
  await play(3, true); // Blue ô 3
  await play(2, true); // Red ô 2 -> thắng
  await page.waitForSelector('[data-testid=ttt-result]');
  assert.match(await page.textContent('[data-testid=ttt-result]'), /Red team wins/);
  assert.equal(await page.$$eval('.ttt-cell.win', (els) => els.length), 3);
  await shot(page, 'tic-tac-toe-2-win');
  await page.click('[data-testid=ttt-next]');
  assert.match(await page.textContent('[data-testid=ttt-turn]'), /Blue team/);
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

