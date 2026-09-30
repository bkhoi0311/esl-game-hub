// Đo độ mượt game camera: số khung hình vẽ/giây (rAF), khung dài nhất, số lần AI trả kết quả/giây.
// Giả lập máy chậm bằng CPU throttling (mặc định 4x). Chạy: node tests/perf.mjs [simon-pose] [4]
import { chromium } from 'playwright';
import { preview } from 'vite';
import { readFileSync } from 'node:fs';
const [game = 'simon-pose', rate = '4'] = process.argv.slice(2);
const src = readFileSync(new URL('./camera.mjs', import.meta.url), 'utf8');
const fake = src.slice(src.indexOf('const FAKE_CAMERA = () => {'), src.indexOf('\n};', src.indexOf('const FAKE_CAMERA = () => {')) + 2);
const FAKE_CAMERA = eval(`(${fake.replace('const FAKE_CAMERA = ', '')})`);
const server = await preview({ preview: { port: 5186, strictPort: true }, logLevel: 'error' });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.addInitScript(FAKE_CAMERA);
const p = await ctx.newPage();
await p.goto(`http://localhost:5186/#/game/${game}`, { timeout: 120000 });
await p.click('[data-testid=cam-start]:not([disabled])', { timeout: 60000 });
await p.waitForFunction(() => window.__vision && window.__vision.info().results > 5, null, { timeout: 120000 });
const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(rate) });
await p.waitForTimeout(3000);
const r0 = await p.evaluate(() => window.__vision.info().results);
const m = await p.evaluate(() => new Promise((res) => {
  const t = []; let last = performance.now(); const end = last + 8000;
  const tick = (now) => { t.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else res(t); };
  requestAnimationFrame(tick);
}));
const r1 = await p.evaluate(() => window.__vision.info());
const fps = m.length / 8;
const long = m.filter((x) => x > 50).length;
console.log(JSON.stringify({ game, cpuSlowdown: `${rate}x`, renderFps: +fps.toFixed(1), worstFrameMs: Math.round(Math.max(...m)), framesOver50ms: long, aiPerSec: +((r1.results - r0) / 8).toFixed(1), aiMs: r1.ms, tier: r1.tier, width: r1.width }));
await b.close(); server.httpServer.close();
