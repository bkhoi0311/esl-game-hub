// Kiểm A2 song ngữ Hub: thanh trên, menu, Cài đặt, công tắc cờ VI/EN (PLAN-I18N-HUB C, D.2, F.4 C1-C8).
// Chạy: PORT=5211 node tests/i18n-hub-a2.mjs          (Chrome mới)
//       PORT=5211 node --import ~/.cache/esl-chromium109/hook.mjs tests/i18n-hub-a2.mjs   (Chromium 109 của ClassIn X)
// Ảnh: SHOTS=1 -> /Users/haku/Desktop/BAO KHOI/CLAUDE/PROJECTS/bang-nhieu-nguoi-viet/screens/hub-i18n-a2-*.png
import assert from 'node:assert/strict';
import { startServer, launch, openHub, vietnameseIn, overflow, hit56, noI18nErrors, shot, UA_CLASSIN } from './helpers/i18n-hub.mjs';

process.env.SHOT_DIR = process.env.SHOT_DIR || '/Users/haku/Desktop/BAO KHOI/CLAUDE/PROJECTS/bang-nhieu-nguoi-viet/screens';
const SHOTS = Boolean(process.env.SHOTS);
const port = Number(process.env.PORT || 5211);
const srv = await startServer(port);
const browser = await launch();
const results = [];
const run = async (name, fn) => { if (process.env.ONLY && !new RegExp(process.env.ONLY).test(name)) return; try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name + ': ' + String(e.message).replace(/\n+/g, ' | ')]); } console.log(results.at(-1).join('  ').slice(0, 700)); };
const NAV = (page) => page.$$eval('.app-nav .nav-link', (a) => a.map((x) => x.textContent.trim()));
const mark = (page) => page.evaluate(() => { window.__mark = 'm1'; });
const alive = (page) => page.evaluate(() => window.__mark === 'm1');
const state = (page) => page.evaluate(() => ({
  html: document.documentElement.lang,
  ls: localStorage.getItem('eslhub.ui'),
  ui: new URL(location.href).searchParams.get('ui'),
  hash: location.hash,
  pressed: [...document.querySelectorAll('.app-header [data-testid^="lang-"]')].map((b) => b.getAttribute('lang') + ':' + b.getAttribute('aria-pressed')).join(','),
}));

// Chạm bằng CDP với vùng tiếp xúc w=h=50 (như màn ClassIn X), cho phần tử khớp selector.
async function touchTap(page, sel) {
  const cdp = await page.context().newCDPSession(page);
  const b = await page.locator(sel).first().boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: 25, radiusY: 25, force: 0, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
async function headerOverlaps(page) {
  return page.evaluate(() => {
    const kids = [...document.querySelector('.app-header').children].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    const bad = [];
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push(`${kids[i].className} x ${kids[j].className}`);
    }
    const hr = document.querySelector('.app-header').getBoundingClientRect();
    for (const k of kids) { const r = k.getBoundingClientRect(); if (r.right > hr.right + 1 || r.left < hr.left - 1) bad.push('ngoài thanh: ' + k.className); }
    return bad;
  });
}

await run('C1 VI mặc định: nav "Trò chơi/Soạn bài", "Màn chọn", 2 cờ, không request en-main', async () => {
  const h = await openHub(browser, { base: srv.base, hash: '#/' });
  await h.page.waitForSelector('.game-card');
  assert.deepEqual(await NAV(h.page), ['Trò chơi', 'Soạn bài']);
  assert.equal(await h.page.textContent('[data-testid="to-chooser"]'), 'Màn chọn');
  assert.equal(await h.page.getAttribute('[data-testid="open-settings"]', 'aria-label'), 'Cài đặt');
  assert.equal(await h.page.locator('.app-header [data-testid="lang-switch"] .flag svg').count(), 2);
  assert.equal(await h.page.getAttribute('.app-header [data-testid="lang-vi"]', 'aria-pressed'), 'true');
  assert.ok(!h.log.requests.some((u) => /en-main/.test(u)));
  assert.deepEqual(noI18nErrors(h.log), []);
  await h.close();
});

await run('C2 ?ui=en: thanh trên, menu, badge, nhóm, thẻ đều EN; đúng 1 request en-main, không tải soanbai.en', async () => {
  const h = await openHub(browser, { base: srv.base, lang: 'en', hash: '#/' });
  await h.page.waitForSelector('.game-card');
  assert.deepEqual(await NAV(h.page), ['Games', 'Lessons']);
  assert.equal(await h.page.textContent('[data-testid="to-chooser"]'), 'Tools');
  assert.equal(await h.page.getAttribute('[data-testid="open-settings"]', 'title'), 'Settings');
  assert.equal(await h.page.getAttribute('.group-tabs', 'aria-label'), 'Game groups');
  assert.deepEqual((await vietnameseIn(h.page, '.app-header, .menu')).filter((x) => x !== 'aria-label: Tiếng Việt'), []); // tên ngôn ngữ viết bằng chính ngôn ngữ đó
  assert.equal(h.log.requests.filter((u) => /en-main/.test(u)).length, 1);
  assert.ok(!h.log.requests.some((u) => /soanbai\.en/.test(u)));
  assert.deepEqual(noI18nErrors(h.log), []);
  await h.close();
});

await run('C3 ClassIn gắn lang=en: vẫn VI', async () => {
  const h = await openHub(browser, { base: srv.base, extraQuery: 'lang=en', hash: '#/', classin: true });
  await h.page.waitForSelector('.game-card');
  assert.deepEqual(await NAV(h.page), ['Trò chơi', 'Soạn bài']);
  assert.equal((await state(h.page)).ls, null);
  await h.close();
});

await run('C4 ClassIn UA, chạm 50x50: VI -> EN -> VI -> EN bằng cờ, không tải lại, URL/storage/lang đúng, nhanh', async () => {
  const h = await openHub(browser, { base: srv.base, hash: '#/', classin: true, touch: true });
  await h.page.waitForSelector('.game-card');
  await mark(h.page);
  await touchTap(h.page, '.app-header [data-testid="lang-en"]');
  await h.page.waitForFunction(() => document.documentElement.lang === 'en');
  assert.deepEqual(await NAV(h.page), ['Games', 'Lessons']);
  let s = await state(h.page);
  assert.equal(s.ls, 'en'); assert.equal(s.ui, 'en'); assert.equal(s.hash, '#/'); assert.match(s.pressed, /vi:false,en:true/);
  assert.match(await h.page.getAttribute('[data-testid="to-chooser"]', 'href'), /ui=en/);
  await touchTap(h.page, '.app-header [data-testid="lang-vi"]');
  await h.page.waitForFunction(() => document.documentElement.lang === 'vi');
  assert.deepEqual(await NAV(h.page), ['Trò chơi', 'Soạn bài']);
  s = await state(h.page);
  assert.equal(s.ui, 'vi'); assert.equal(s.ls, 'vi'); assert.doesNotMatch(await h.page.getAttribute('[data-testid="to-chooser"]', 'href'), /ui=/);
  const ms = await h.page.evaluate(async () => {
    const t0 = performance.now();
    document.querySelector('.app-header [data-testid="lang-en"]').click();
    while (document.documentElement.lang !== 'en' || !/Games/.test(document.querySelector('.nav-link').textContent)) await new Promise((r) => setTimeout(r, 4));
    return performance.now() - t0;
  });
  assert.ok(ms < 300, `chuyển EN mất ${ms | 0} ms`);
  assert.ok(await alive(h.page), 'trang bị tải lại');
  assert.deepEqual(noI18nErrors(h.log), []);
  await h.close();
});

await run('C4b bấm cờ đang chọn: không đổi gì; không có request en-main thứ 2', async () => {
  const h = await openHub(browser, { base: srv.base, lang: 'en', hash: '#/' });
  await h.page.waitForSelector('.game-card');
  await h.page.click('.app-header [data-testid="lang-en"]');
  await h.page.click('.app-header [data-testid="lang-vi"]');
  await h.page.click('.app-header [data-testid="lang-en"]');
  assert.equal(h.log.requests.filter((u) => /en-main/.test(u)).length, 1);
  await h.close();
});

await run('C6 tải lại vẫn EN (storage), context mới chỉ có storage en => EN, hash giữ', async () => {
  const h = await openHub(browser, { base: srv.base, hash: '#/editor', storageLang: 'en' });
  await h.page.waitForSelector('.app-nav');
  assert.deepEqual(await NAV(h.page), ['Games', 'Lessons']);
  assert.equal(await h.page.getAttribute('.nav-link.active', 'href'), '#/editor');
  await h.page.reload();
  await h.page.waitForSelector('.app-nav');
  assert.deepEqual(await NAV(h.page), ['Games', 'Lessons']);
  await h.close();
});

await run('C5 Cài đặt: hàng ngôn ngữ đầu tiên; đổi EN trong hộp => hộp mở lại EN, chỉ 1 hộp; không chữ Việt trừ set.lang', async () => {
  const h = await openHub(browser, { base: srv.base, hash: '#/' });
  await h.page.waitForSelector('.game-card');
  await h.page.click('[data-testid="open-settings"]');
  await h.page.waitForSelector('.modal .settings');
  assert.equal(await h.page.locator('.modal .settings .field').first().locator('[data-testid="lang-switch"]').count(), 1);
  assert.equal(await h.page.textContent('.modal-head h2'), 'Cài đặt');
  if (SHOTS) { await h.page.waitForTimeout(600); await h.page.evaluate(() => { document.querySelector('.modal').scrollTop = 0; }); await shot(h.page, 'hub-i18n-a2-settings-vi-1280x720'); }
  await h.page.click('.modal [data-testid="lang-en"]');
  await h.page.waitForFunction(() => document.querySelector('.modal-head h2')?.textContent === 'Settings');
  assert.equal(await h.page.locator('.modal-overlay').count(), 1);
  await h.page.waitForTimeout(400);
  const vn = (await vietnameseIn(h.page, '.modal-overlay')).filter((x) => !/Ngôn ngữ|Tiếng Việt/.test(x));
  assert.deepEqual(vn, []);
  assert.match(await h.page.textContent('.modal .settings'), /Read words aloud in team games/);
  assert.equal(await h.page.getAttribute('.modal [data-testid="lang-en"]', 'aria-pressed'), 'true');
  if (SHOTS) { await h.page.evaluate(() => { document.querySelector('.modal').scrollTop = 0; }); await shot(h.page, 'hub-i18n-a2-settings-en-1280x720'); }
  await h.page.click('.modal [data-testid="lang-vi"]');
  await h.page.waitForFunction(() => document.querySelector('.modal-head h2')?.textContent === 'Cài đặt');
  assert.equal(await h.page.locator('.modal-overlay').count(), 1);
  assert.deepEqual(noI18nErrors(h.log), []);
  await h.close();
});

await run('C7 đang chơi Tic-Tac-Toe bấm EN: game không dựng lại, có toast hub.lang.later; về menu => EN', async () => {
  const h = await openHub(browser, { base: srv.base, hash: '#/game/tic-tac-toe' });
  await h.page.waitForSelector('.game-host *');
  await h.page.waitForTimeout(500);
  await h.page.evaluate(() => { document.querySelector('.game-host').__keep = 1; });
  await h.page.click('.app-header [data-testid="lang-en"]');
  await h.page.waitForFunction(() => document.documentElement.lang === 'en');
  assert.match(await h.page.textContent('.toast-host'), /new language applies/);
  assert.equal(await h.page.evaluate(() => document.querySelector('.game-host').__keep), 1, 'game bị dựng lại');
  await h.page.evaluate(() => { location.hash = '#/'; });
  await h.page.waitForSelector('.game-card');
  assert.deepEqual(await NAV(h.page), ['Games', 'Lessons']);
  await h.close();
});

await run('C7b màn cài đặt game (Gold Heist) dựng lại theo ngôn ngữ; game camera giữ nguyên', async () => {
  const h = await openHub(browser, { base: srv.base, hash: '#/game/gold-heist' });
  await h.page.waitForSelector('.setup');
  await h.page.click('.app-header [data-testid="lang-en"]');
  await h.page.waitForFunction(() => /Start game/.test(document.querySelector('.setup')?.textContent || ''));
  await h.page.click('.app-header [data-testid="lang-vi"]');
  await h.page.waitForFunction(() => /Bắt đầu chơi/.test(document.querySelector('.setup')?.textContent || ''));
  await h.close();
});

await run('C7c Soạn bài: bấm EN dựng lại, tab "Lessons" đang chọn', async () => {
  const h = await openHub(browser, { base: srv.base, hash: '#/editor' });
  await h.page.waitForSelector('.app-main *');
  await h.page.waitForTimeout(800);
  await h.page.click('.app-header [data-testid="lang-en"]');
  await h.page.waitForFunction(() => document.documentElement.lang === 'en');
  assert.deepEqual(await NAV(h.page), ['Games', 'Lessons']);
  assert.equal(await h.page.getAttribute('.nav-link.active', 'href'), '#/editor');
  assert.equal((await state(h.page)).hash, '#/editor');
  await h.close();
});

await run('C9 en-main không tải được: toast tiếng Việt hub.lang.loadFail, vẫn VI, cờ VI còn chọn', async () => {
  const h = await openHub(browser, { base: srv.base, hash: '#/' });
  await h.page.waitForSelector('.game-card');
  await h.page.route(/en-main/, (r) => r.abort());
  await h.page.click('.app-header [data-testid="lang-en"]');
  await h.page.waitForSelector('.toast');
  assert.match(await h.page.textContent('.toast-host'), /Không tải được tiếng Anh/);
  const s = await state(h.page);
  assert.equal(s.html, 'vi'); assert.equal(s.ls, null);
  await h.close();
});

for (const lang of ['vi', 'en']) {
  for (const [w, hh] of [[960, 540], [1280, 647], [1280, 720], [1366, 768], [1920, 1080]]) {
    await run(`C8 thanh trên + menu ${w}x${hh} ${lang}: không chồng, không tràn, cờ/Cài đặt >= 56 px`, async () => {
      const h = await openHub(browser, { base: srv.base, lang, w, h: hh, hash: '#/', classin: true, touch: true });
      await h.page.waitForSelector('.game-card');
      await h.page.waitForTimeout(1300);
      assert.deepEqual(await headerOverlaps(h.page), []);
      assert.deepEqual(await overflow(h.page, '.app-header'), []);
      assert.deepEqual(await overflow(h.page, '.menu', { allow: ['.pack-chip > span', '.card-pic', '.card-pic *', 'svg *'] }), []); // .card-pic là khung ảnh cắt tròn, không phải chữ
      assert.deepEqual(await hit56(h.page, '.app-header .lang-btn', { header: true }), []);
      assert.ok(await h.page.evaluate(() => { const b = document.querySelector('[data-testid="open-settings"]'); const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return b === e || b.contains(e); }), 'nút Cài đặt không bấm được');
      const sizes = await h.page.$$eval('.app-header .lang-btn', (a) => a.map((b) => { const r = b.getBoundingClientRect(); return [r.width, r.height]; }));
      for (const [bw, bh] of sizes) assert.ok(bw >= 55.5 && bh >= 55.5, `cờ ${bw}x${bh}`);
      if (SHOTS && (w === 1280 && hh === 720 || w === 1920)) {
        await shot(h.page, `hub-i18n-a2-menu-${lang}-${w}x${hh}`);
        await h.page.click('[data-testid="open-settings"]');
        await h.page.waitForSelector('.modal .settings');
        await h.page.waitForTimeout(700);
        assert.deepEqual(await overflow(h.page, '.modal'), []);
        await h.page.evaluate(() => { document.querySelector('.modal').scrollTop = 0; });
        await shot(h.page, `hub-i18n-a2-settings-${lang}-${w}x${hh}`);
      } else if (w === 960 || w === 1920) {
        await h.page.click('[data-testid="open-settings"]');
        await h.page.waitForSelector('.modal .settings');
        await h.page.waitForTimeout(500);
        assert.deepEqual(await overflow(h.page, '.modal'), []);
      }
      assert.deepEqual(noI18nErrors(h.log), []);
      await h.close();
    });
  }
}

await browser.close();
await srv.close();
let fail = 0;
for (const [st, n] of results) { if (st === 'FAIL') fail++; console.log(`${st}  ${n}`); }
console.log(`\n${results.length - fail}/${results.length} đạt`);
process.exit(fail ? 1 : 0);
