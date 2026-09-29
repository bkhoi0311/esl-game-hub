// Chụp màn hình ESL Game Hub cho video hướng dẫn (kit Guide-ClassIn-2026) + in toạ độ nút.
// Chạy: node tools/guide/shots.mjs <thư mục ra>
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve(process.argv[2] || 'screenshots/guide');
mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5194, strictPort: true }, logLevel: 'error' });
await server.listen();
const BASE = 'http://localhost:5194/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
const page = await ctx.newPage();
const coords = {};
const box = async (name, sel) => {
  const b = await page.locator(sel).first().boundingBox();
  coords[name] = [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2), Math.round(b.width), Math.round(b.height)];
};
const shot = async (file) => {
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${file}` });
};

await page.goto(BASE);
await page.waitForSelector('.game-card');
await box('web_soan_bai', '.nav-link[href="#/editor"]');
await shot('g1-web.png');

await page.goto(BASE + '#/editor');
await page.waitForSelector('[data-testid=vocab-table]');
await box('ed_ten_bai', '[data-testid=pack-title]');
await box('ed_dan_bang', '.paste-panel summary');
await box('ed_bang_tu', '[data-testid=vocab-table]');
await box('ed_hop_le', '.editor-issues');
await box('ed_luu_edu', '[data-testid=make-link]');
await box('ed_huong_dan', '[data-testid=open-guide]');
await shot('g2-editor.png');

await page.click('[data-testid=make-link]');
await page.waitForSelector('[data-testid=save-edu]');
await box('md_ten', '[data-testid=edu-title]');
await box('md_ai', '[data-testid=edu-who]');
await box('md_luu', '[data-testid=save-edu]');
await shot('g3-modal.png');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=save-edu]')]);
await dl.saveAs(`${OUT}/${dl.suggestedFilename()}`);
await page.waitForSelector('.toast');
await box('md_da_luu', '.toast');
await shot('g4-saved.png');

// Bài mở từ file .edu (chế độ trình chiếu): menu + màn cài đặt 1 game
const url = JSON.parse((await import('node:fs')).readFileSync(`${OUT}/${dl.suggestedFilename()}`, 'utf8')).url;
const board = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await board.goto(url.replace('http://localhost:5194/', BASE));
await board.waitForSelector('.game-card');
const pageRef = page;
{
  const b = await board.locator('[data-game="tug-of-war"]').boundingBox();
  coords.menu_game = [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2), Math.round(b.width), Math.round(b.height)];
}
await board.waitForTimeout(1200);
await board.screenshot({ path: `${OUT}/g5-menu.png` });
await board.click('[data-game="tug-of-war"]');
await board.waitForSelector('[data-testid$=-start]');
{
  const b = await board.locator('[data-testid$=-start]').first().boundingBox();
  coords.game_bat_dau = [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2), Math.round(b.width), Math.round(b.height)];
}
await board.waitForTimeout(900);
await board.screenshot({ path: `${OUT}/g6-setup.png` });
await board.click('[data-testid$=-start]');
await board.waitForTimeout(4500);
await board.screenshot({ path: `${OUT}/g7-play.png` });
void pageRef;

writeFileSync(`${OUT}/coords.json`, JSON.stringify(coords, null, 1));
console.log(JSON.stringify(coords));
await browser.close();
await server.close();
