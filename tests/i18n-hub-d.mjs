// Kiểm song ngữ khu vực games-duel (bước D): màn cài đặt EN của 7 game thi đấu (Tic-Tac-Toe không có màn cài đặt),
// nút bắt đầu, bảng điểm, tràn chữ ở 1280x720 và 1920x1080, lựa chọn không-đầu-tiên chọn được,
// đổi ngôn ngữ khi màn cài đặt đang mở thì dựng lại, game đang chơi giữ nguyên.
// Chạy: PORT=5214 node tests/i18n-hub-d.mjs      Chromium 109: PORT=5214 node --import ~/.cache/esl-chromium109/hook.mjs tests/i18n-hub-d.mjs
import assert from 'node:assert/strict';
import { startServer, launch, openHub, vietnameseIn, overflow, noI18nErrors, shot } from './helpers/i18n-hub.mjs';

const port = Number(process.env.PORT || 5214);
const srv = await startServer(port);
const browser = await launch({ channel: process.env.C109 ? undefined : 'chrome' });
const results = [];
const run = async (name, fn) => {
  try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', `${name}: ${e.message}`]); }
};
const tag = browser.version().split('.')[0] >= 120 ? 'new' : 'c109';
const GAMES = ['gold-heist', 'impostor', 'tug-of-war', 'whack-word', 'balloon-pop', 'memory-match', 'sentence-race'];
const SIZES = [[1280, 720], [1920, 1080]];
const startLabel = (page) => page.evaluate(() => [...document.querySelectorAll('.setup button')].map((b) => b.textContent.trim()).filter((x) => /Bắt đầu chơi|Start game/.test(x))[0]);

// Mở game ở ngôn ngữ cho trước, UA ClassIn.
const openGame = (id, lang, w, h) => openHub(browser, { base: srv.base, lang, hash: `#/game/${id}`, classin: true, w, h });

for (const id of GAMES) {
  for (const [w, h] of SIZES) {
    await run(`${id} EN ${w}x${h}: màn cài đặt không chữ Việt, không tràn, nút "Start game"`, async () => {
      const g = await openGame(id, 'en', w, h);
      await g.page.waitForSelector('.setup', { timeout: 15000 });
      assert.equal(await startLabel(g.page), 'Start game');
      assert.deepEqual(await vietnameseIn(g.page, '.setup'), []);
      assert.deepEqual(await overflow(g.page, '.setup-card'), []);
      if (w === 1280) await shot(g.page, `hub-i18n-d-${id}-en-${tag}`);
      assert.deepEqual(noI18nErrors(g.log), []);
      await g.close();
    });
  }

  await run(`${id} EN: chọn được lựa chọn không-đầu-tiên rồi bắt đầu, bảng điểm không chữ Việt`, async () => {
    const g = await openGame(id, 'en', 1280, 720);
    await g.page.waitForSelector('.setup');
    const picked = await g.page.evaluate(() => {
      let n = 0;
      for (const grp of document.querySelectorAll('.setup .segmented')) {
        const btns = [...grp.querySelectorAll('.btn')].filter((b) => !b.disabled);
        const target = btns.find((b, i) => i > 0 && b.getAttribute('aria-pressed') !== 'true');
        if (!target) continue;
        target.click();
        n += target.getAttribute('aria-pressed') === 'true' ? 1 : 100;
      }
      return n;
    });
    assert.ok(picked >= 1 && picked < 100, `chọn lựa chọn khác: ${picked}`);
    await g.page.click('.setup .setup-actions button');
    await g.page.waitForFunction(() => !document.querySelector('.setup'), null, { timeout: 15000 });
    await g.page.waitForTimeout(600);
    assert.deepEqual(await vietnameseIn(g.page, '.scoreboard, .duel-head, .game-bar, header.game-header'), []);
    assert.deepEqual(noI18nErrors(g.log), []);
    await g.close();
  });
}

await run('Tic-Tac-Toe EN: vào thẳng game, mô tả thẻ menu bằng tiếng Anh', async () => {
  const g = await openHub(browser, { base: srv.base, lang: 'en', classin: true, ready: false, hash: '#/' });
  await g.page.waitForSelector('.card-desc');
  const descs = await g.page.$$eval('.card-desc', (els) => els.map((e) => e.textContent));
  assert.ok(descs.length >= 8, 'đủ thẻ');
  assert.ok(descs.some((d) => /3x3 tic-tac-toe/.test(d)), 'mô tả TTT EN');
  assert.deepEqual(await vietnameseIn(g.page, '.card-desc'), []);
  await g.page.goto(`${srv.base}?ui=en#/game/tic-tac-toe`);
  await g.page.waitForSelector('.ttt-board, [data-testid^=ttt]', { timeout: 15000 });
  assert.ok(!(await g.page.$('.setup')), 'Tic-Tac-Toe không có màn cài đặt');
  await g.close();
});

await run('Impostor EN: thiếu nội dung báo bằng tiếng Anh, nút "Open Lessons"', async () => {
  const g = await openHub(browser, { base: srv.base, lang: 'en', classin: true, ready: false, hash: '#/' });
  await g.page.evaluate(() => localStorage.setItem('eslhub.pack.default', JSON.stringify({ title: 'T', vocab: [
    { word: 'apple', category: 'fruit' }, { word: 'pear', category: 'fruit' }, { word: 'kiwi', category: 'fruit' }, { word: 'lime', category: 'fruit' },
    { word: 'tea', category: 'drink' }, { word: 'milk', category: 'drink' }, { word: 'soda', category: 'drink' }, { word: 'rice', category: 'meal' }], questions: [], teams: ['A', 'B'] })));
  await g.page.goto(`${srv.base}?ui=en#/game/impostor`);
  await g.page.reload();
  await g.page.waitForSelector('.notice');
  const txt = await g.page.textContent('.notice');
  assert.match(txt, /needs more content|More content needed/);
  assert.match(txt, /“drink” needs 1 more word/);
  assert.match(txt, /Open Lessons/);
  assert.deepEqual(await vietnameseIn(g.page, '.notice'), []);
  assert.deepEqual(await overflow(g.page, '.notice'), []);
  await shot(g.page, `hub-i18n-d-impostor-need-en-${tag}`);
  await g.close();
});

await run('Đổi VI -> EN khi màn cài đặt đang mở: dựng lại; ngược lại EN -> VI', async () => {
  const g = await openGame('gold-heist', 'vi', 1280, 720);
  await g.page.waitForSelector('.setup');
  assert.equal(await startLabel(g.page), 'Bắt đầu chơi');
  assert.match(await g.page.textContent('.setup'), /Số đội/);
  await g.page.click('.lang-seg--hub [data-testid=lang-en]');
  await g.page.waitForFunction(() => /Number of teams/.test(document.querySelector('.setup')?.textContent || ''), null, { timeout: 8000 });
  assert.deepEqual(await vietnameseIn(g.page, '.setup'), []);
  await g.page.click('.lang-seg--hub [data-testid=lang-vi]');
  await g.page.waitForFunction(() => /Số đội/.test(document.querySelector('.setup')?.textContent || ''), null, { timeout: 8000 });
  await g.close();
});

await run('Đổi ngôn ngữ giữa lúc đang chơi: game giữ nguyên (không quay về màn cài đặt)', async () => {
  const g = await openGame('memory-match', 'vi', 1280, 720);
  await g.page.waitForSelector('.setup');
  await g.page.click('.setup .setup-actions button');
  await g.page.waitForSelector('[data-testid=mm-grid]');
  await g.page.click('.lang-seg--hub [data-testid=lang-en]');
  await g.page.waitForFunction(() => document.documentElement.lang === 'en', null, { timeout: 8000 });
  await g.page.waitForTimeout(400);
  assert.ok(await g.page.$('[data-testid=mm-grid]'), 'lưới thẻ còn nguyên');
  assert.ok(!(await g.page.$('.setup')), 'không bị dựng lại màn cài đặt');
  await g.close();
});

await run('Màn menu EN: thẻ 8 game thi đấu mô tả tiếng Anh', async () => {
  const g = await openHub(browser, { base: srv.base, lang: 'en', classin: true, w: 1920, h: 1080, ready: false, hash: '#/' });
  await g.page.waitForSelector('.card-desc');
  const descs = await g.page.$$eval('.card-desc', (els) => els.map((e) => e.textContent));
  for (const re of [/gold chest/, /doesn’t belong/, /pull the rope/, /whack the mole/, /pop balloons/, /Flip cards/, /tic-tac-toe/, /put words in order/]) {
    assert.ok(descs.some((d) => re.test(d)), `thiếu mô tả ${re}`);
  }
  await g.close();
});

await browser.close();
await srv.close();
let fail = 0;
for (const [s, n] of results) { console.log(`${s}  ${n}`); if (s === 'FAIL') fail++; }
console.log(`\n${results.length - fail}/${results.length} đạt`);
process.exit(fail ? 1 : 0);
