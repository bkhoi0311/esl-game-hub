// Chạy phần kiểm tra của skill liquid-glass-design (qa.py) trên các màn của app.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
const AUDIT = readFileSync(new URL('./qa-audit.js', import.meta.url), 'utf8'); // lấy từ scripts/qa.py của skill liquid-glass-design
const server = await createServer({ server: { port: 5190, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const pages = [['menu', '#/'], ['editor', '#/editor'], ['setup', '#/game/gold-heist'], ['camera', '#/game/simon-pose']];
let hard = 0;
for (const [name, hash] of pages) {
  for (const [label, vp, mobile] of [['desktop', { width: 1366, height: 900 }, false], ['mobile', { width: 390, height: 844 }, true]]) {
    const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on('pageerror', (e) => errors.push(e.message));
    pg.on('console', (m) => m.type() === 'error' && !/getUserMedia|camera|NotFound|Permission/i.test(m.text()) && errors.push(m.text()));
    await pg.goto('http://localhost:5190/' + hash);
    await pg.waitForTimeout(1800);
    await pg.evaluate(`window.__LG_W = ${vp.width}`);
    const r = await pg.evaluate(`(${AUDIT})()`);
    await pg.screenshot({ path: `screenshots/qa/${name}-${label}.png` });
    const out = [];
    if (errors.length) out.push('JS: ' + errors.slice(0, 2).join(' | '));
    if (r.contrast && r.contrast.length) out.push('contrast: ' + JSON.stringify(r.contrast.slice(0, 6)));
    if (mobile && r.overflowX > 0) out.push('overflowX ' + r.overflowX);
    // Hình SVG của nền thế giới bị khung cắt gọn (overflow hidden) nên không tính.
    const past = (r.pastEdge || []).filter((s) => !/^(rect|path|g|circle|ellipse|svg)\./.test(s));
    if (mobile && past.length) out.push('pastEdge ' + JSON.stringify(past.slice(0, 5)));
    if (out.length) hard += 1;
    console.log(`${name}/${label}: ${out.length ? 'FAIL ' + out.join(' ; ') : 'OK'}${r.smallTargets && r.smallTargets.length ? ' · WARN small targets ' + JSON.stringify(r.smallTargets.slice(0, 5)) : ''}${r.glassText ? ' · check glass text ' + r.glassText : ''}`);
    await ctx.close();
  }
}
await browser.close();
await server.close();
process.exit(hard ? 1 : 0);
