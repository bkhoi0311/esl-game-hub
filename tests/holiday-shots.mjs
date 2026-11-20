// Chụp giao diện ngày lễ: hub menu, 1 game, start, board × nhiều chủ đề × 2 kích thước.
// Chạy: BASE=http://127.0.0.1:4174 THEMES=tet,christmas node tests/holiday-shots.mjs
const { chromium } = await import(process.env.PW || 'playwright'); // PW=/đường/dẫn/playwright-core/index.mjs nếu thư viện trong repo hỏng
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:4174';
const THEMES = (process.env.THEMES || 'auto,teachers,culture24,christmas,tet,trungthu,halloween,quockhanh').split(',');
const OUT = process.env.OUT || 'screenshots/holiday';
mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: exe });
const SIZES = [['1920', 1920, 1080], ['390', 390, 844]];
const q = (t) => (t === 'auto' ? '' : `?theme=${t}`);
for (const th of THEMES) {
  for (const [sn, w, h] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: sn === '390' });
    const page = await ctx.newPage();
    if (process.env.PARTICLES) await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false })); // bật hạt rơi (mặc định tắt khi máy tự động điều khiển)
    const shots = [
      ['menu', `${BASE}/${q(th)}#/`],
      ['game', `${BASE}/${q(th)}#/game/memory-match`],
      ['start', `${BASE}/start/index.html${q(th)}`],
      ['board', `${BASE}/board/index.html${q(th)}`],
    ];
    for (const [name, url] of shots) {
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForTimeout(name === 'game' ? 2500 : name === 'board' ? 3000 : 1500);
      await page.screenshot({ path: `${OUT}/${th}-${name}-${sn}.png` });
    }
    await ctx.close();
  }
}
await browser.close();
console.log('done');
