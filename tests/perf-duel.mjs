// Đo độ mượt game 2 bé (Phaser) khi bấm liên tục: fps vẽ, khung dài nhất, số khung > 50 ms.
// Giả lập máy yếu bằng CPU throttling. Chạy: node tests/perf-duel.mjs [balloon-pop|whack-word] [4]
import { chromium } from 'playwright';
import { preview } from 'vite';
const [game = 'whack-word', rate = '4'] = process.argv.slice(2);
const server = await preview({ preview: { port: 5184, strictPort: true }, logLevel: 'error' });
const b = await chromium.launch({ args: process.env.SWGL ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, hasTouch: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://localhost:5184/#/game/${game}`, { timeout: 120000 });
await p.click(`[data-testid=${game}-start]`, { timeout: 60000 });
await p.waitForFunction(() => window.__duelScene && window.__duelScene.targets, null, { timeout: 60000 });
await p.waitForTimeout(2500);
const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(rate) });
// Đo khung hình trong 8 s, đồng thời bấm liên tục 2 bên
const measure = p.evaluate(() => new Promise((res) => {
  const t = []; let last = performance.now(); const end = last + 8000;
  const tick = (now) => { t.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else res(t); };
  requestAnimationFrame(tick);
}));
let taps = 0;
const t0 = Date.now();
while (Date.now() - t0 < 7500) {
  for (const side of [0, 1]) {
    const pts = await p.evaluate((s) => window.__duelScene.targets(s), side).catch(() => []);
    const pt = pts[0] || { x: side ? 1400 : 500, y: 600 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y, id: side }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    taps++;
  }
  await p.waitForTimeout(80);
}
const m = await measure;
console.log(JSON.stringify({ game, cpu: `${rate}x`, taps, fps: +(m.length / 8).toFixed(1), worstMs: Math.round(Math.max(...m)), over50ms: m.filter((x) => x > 50).length, over100ms: m.filter((x) => x > 100).length, errors: errs.slice(0, 2) }));
await b.close(); server.httpServer.close();
