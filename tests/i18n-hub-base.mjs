// Kiểm nền móng song ngữ Hub (A1): VI mặc định không đổi, ?ui=en nạp đúng 1 chunk en-main, nút "Start game",
// ClassIn (?lang=en) vẫn VI, không nháy chữ Việt khi EN, không thiếu khoá.
// Chạy: PORT=5211 node tests/i18n-hub-base.mjs        Bản dựng: PREVIEW=1 PORT=5211 node tests/i18n-hub-base.mjs
import assert from 'node:assert/strict';
import { startServer, launch, openHub, noI18nErrors } from './helpers/i18n-hub.mjs';

const port = Number(process.env.PORT || 5211);
let srv, browser;
if (process.env.PREVIEW) {
  const { preview } = await import('vite');
  const s = await preview({ preview: { port, strictPort: true }, logLevel: 'error' });
  srv = { base: `http://localhost:${port}/`, close: () => s.close?.() ?? new Promise((r) => s.httpServer.close(r)) };
} else srv = await startServer(port);
browser = await launch();
const results = [];
const run = async (name, fn) => { try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name + ': ' + e.message]); } };
const GAME = '#/game/gold-heist'; // game có màn cài đặt (Tic-Tac-Toe vào thẳng game)
const startLabel = (page) => page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((x) => /Bắt đầu chơi|Start game/.test(x))[0]);

await run('VI mặc định: "Bắt đầu chơi", không request en-main, nav Việt', async () => {
  const h = await openHub(browser, { base: srv.base, hash: GAME });
  await h.page.waitForSelector('.setup');
  assert.equal(await startLabel(h.page), 'Bắt đầu chơi');
  assert.equal(await h.page.evaluate(() => document.documentElement.lang), 'vi');
  assert.ok(!h.log.requests.some((u) => /en-main/.test(u)), 'VI không được tải en-main');
  assert.ok(await h.page.evaluate(() => /Trò chơi/.test(document.querySelector('.nav-link').textContent)));
  assert.deepEqual(noI18nErrors(h.log), []);
  await h.close();
});

await run('?ui=en: "Start game", đúng 1 request en-main, html lang=en, không lỗi', async () => {
  const h = await openHub(browser, { base: srv.base, lang: 'en', hash: GAME });
  await h.page.waitForSelector('.setup');
  assert.equal(await startLabel(h.page), 'Start game');
  assert.equal(await h.page.evaluate(() => document.documentElement.lang), 'en');
  assert.equal(h.log.requests.filter((u) => /en-main/.test(u)).length, 1);
  assert.ok(!h.log.requests.some((u) => /soanbai\.en/.test(u)), 'chunk soanbai.en chỉ nạp khi cần');
  assert.deepEqual(noI18nErrors(h.log), []);
  assert.equal(await h.page.evaluate(() => localStorage.getItem('eslhub.ui')), 'en');
  await h.close();
});

await run('ClassIn gắn lang=en: vẫn tiếng Việt (không đọc `lang`)', async () => {
  const h = await openHub(browser, { base: srv.base, extraQuery: 'lang=en', hash: GAME, classin: true });
  await h.page.waitForSelector('.setup');
  assert.equal(await startLabel(h.page), 'Bắt đầu chơi');
  assert.equal(await h.page.evaluate(() => localStorage.getItem('eslhub.ui')), null);
  await h.close();
});

await run('Không nháy: ?ui=en không bao giờ vẽ chữ "Bắt đầu chơi" (MutationObserver từ đầu trang)', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => {
    window.__seen = [];
    const mo = new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { const t = n.textContent || ''; if (/Bắt đầu chơi/.test(t)) window.__seen.push(t.slice(0, 40)); })));
    document.addEventListener('DOMContentLoaded', () => mo.observe(document.documentElement, { childList: true, subtree: true }));
    mo.observe(document, { childList: true, subtree: true });
  });
  const page = await ctx.newPage();
  await page.goto(`${srv.base}?test=1&ui=en${GAME}`);
  await page.waitForSelector('.setup');
  assert.deepEqual(await page.evaluate(() => window.__seen), []);
  await ctx.close();
});

await run('EN: menu dựng được (nhóm game đọc getter), không lỗi', async () => {
  const h = await openHub(browser, { base: srv.base, lang: 'en', hash: '#/' });
  await h.page.waitForSelector('.game-card, [data-testid^=game-]', { timeout: 15000 });
  assert.deepEqual(noI18nErrors(h.log), []);
  await h.close();
});

await browser.close();
await srv.close();
for (const [s, m] of results) console.log(s, m);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(failed ? `\n${failed} ca lỗi` : '\nTất cả đạt');
process.exit(failed ? 1 : 0);
