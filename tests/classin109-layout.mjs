// Test bố cục trên Chromium 109 (lõi ClassIn X 6.0.9). Chạy: npm run test:classin109
// Cần Chromium 109 ở ~/.cache/esl-chromium109 (xem PLAN-TTT-LAYOUT.md). Không có thì bỏ qua (exit 0).
import { createServer } from 'vite';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const DIR = process.env.CHROMIUM109_DIR || `${homedir()}/.cache/esl-chromium109`;
const EXE = `${DIR}/browsers/chromium-1041/chrome-mac/Chromium.app/Contents/MacOS/Chromium`;
if (!existsSync(EXE)) { console.log('SKIP: chưa cài Chromium 109 ở', DIR); process.exit(0); }
const { chromium } = await import(`${DIR}/node_modules/playwright-core/index.mjs`);
const OUT = resolve('screenshots/classin109'); mkdirSync(OUT, { recursive: true });
const UA = 'Mozilla/5.0 (Windows NT 6.2; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.5414.120 ClassIn X/6.0.9.1813 Safari/537.36';
const PORT = Number(process.env.PORT || 5196); // PORT=... để chạy song song nhiều agent
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: EXE });
let fails = 0;
const box = (page) => page.evaluate(() => {
  const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  return { board: r('.ttt-board'), side: r('.ttt-side'), stage: r('.game-stage'), framed: document.body.classList.contains('framed') };
});
try {
  for (const [w, hh] of [[1280, 647], [1024, 600], [900, 560], [430, 800]]) {
    for (const perf of ['', '?perf=full']) {
      const tag = `ttt-${w}x${hh}${perf ? '-full' : '-lite'}`;
      const ctx = await browser.newContext({ viewport: { width: w, height: hh }, deviceScaleFactor: 3, userAgent: UA, hasTouch: true });
      const page = await ctx.newPage();
      try {
        await page.goto(`http://localhost:${PORT}/${perf}#/game/tic-tac-toe`);
        await page.waitForSelector('.ttt-cell');
        for (let r = 0; r < 3; r++) {
          await page.click('.ttt-cell:not(.taken) >> nth=0', { timeout: 3000 }); // bị che thì timeout = FAIL
          await page.waitForSelector('.ttt-answers'); await page.waitForTimeout(500);
          const b = await box(page);
          if (b.framed) assert.ok(b.board.x + b.board.w <= b.side.x + 1, `${tag} lần ${r + 1}: bàn cờ (phải=${b.board.x + b.board.w}) đè khối câu hỏi (trái=${b.side.x})`);
          assert.ok(b.board.y + b.board.h <= b.stage.y + b.stage.h + 1, `${tag} lần ${r + 1}: bàn cờ bị cắt đáy`);
          const bg = await page.$eval('.ttt-cell.picked', (e) => getComputedStyle(e).backgroundColor);
          assert.notEqual(bg, 'rgba(0, 0, 0, 0)', `${tag}: ô đang chọn có nền trong suốt (color-mix)`);
          if (r === 0) await page.screenshot({ path: `${OUT}/${tag}-q1.png` });
          const c = Number(await page.getAttribute('.ttt-answers', 'data-correct'));
          await page.click(`.ttt-answers .answer-btn[data-index="${r === 0 ? (c + 1) % 3 : c}"]`); // lần 1 sai, sau đó đúng
          await page.waitForTimeout(1500);
        }
        await page.screenshot({ path: `${OUT}/${tag}-later.png` });
        console.log('PASS', tag);
      } catch (e) { fails++; console.log('FAIL', e.message.split('\n')[0]); }
      await ctx.close();
    }
  }
} finally { await browser.close(); await server.close(); }
process.exitCode = fails ? 1 : 0;
