// Test trang chẩn đoán public/gesture-test/. Chạy: node tests/gesture-test.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const PORT = 5196;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.5414.120 Safari/537.36 ClassIn X/6.0.9.1813';
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: new URL('../public', import.meta.url).pathname, stdio: 'ignore' });
const fails = [];
const check = async (name, fn) => { try { await fn(); console.log('PASS', name); } catch (e) { fails.push(name); console.log('FAIL', name, String(e.message).split('\n')[0]); } };
let browser;
try {
  await new Promise((r) => setTimeout(r, 800));
  browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true, userAgent: UA, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 25, radiusY: 25, force: 0.5 })) });
  const rep = () => page.evaluate(() => window.__gt.report());
  const B = 'http://127.0.0.1:' + PORT + '/gesture-test/';
  await page.goto(B + '?zones=2&dur=2');
  await page.waitForTimeout(600);

  await check('trang chạy: 2 vùng, HUD, không select/input/label', async () => {
    assert.equal(await page.locator('.zone canvas').count(), 2);
    assert.match(await page.locator('#hud').innerText(), /Đổi cỡ: 0 lần/);
    assert.equal(await page.locator('select,input,label').count(), 0);
  });
  await check('nút >= 56px', async () => {
    for (const b of await page.locator('button').all()) { const r = await b.boundingBox(); assert.ok(r.height >= 56 && r.width >= 56, 'nút nhỏ ' + (await b.innerText())); }
  });
  await check('chạm 1 ngón ra nét, loại touch', async () => {
    await touch('touchStart', [[200, 200, 1]]); await touch('touchMove', [[260, 260, 1]]); await touch('touchEnd', []);
    const r = await rep(); assert.equal(r.pointerTypes.touch, 1);
  });
  await check('đổi cỡ khi không chạm: size=1, multi=0', async () => {
    await page.setViewportSize({ width: 1000, height: 560 }); await page.waitForTimeout(400);
    const r = await rep(); assert.equal(r.totals.size, 1); assert.equal(r.totals.sizeMulti, 0);
    assert.match(await page.locator('#hud').innerText(), /CỬA SỔ BỊ THU NHỎ/);
    assert.ok(r.events.some((e) => e.kind === 'size'));
    await page.setViewportSize({ width: 1280, height: 720 }); await page.waitForTimeout(400);
  });
  await check('M1 bắt đầu, đếm 0 lần, tự dừng', async () => {
    await page.locator('[data-m=M1]').click(); await page.waitForTimeout(300);
    assert.match(await page.locator('[data-m=M1]').innerText(), /Dừng M1/);
    await page.waitForTimeout(2400);
    const t = await page.locator('[data-m=M1]').innerText(); assert.match(t, /Bắt đầu M1/); assert.match(t, /0 lần đổi cỡ/);
  });
  await check('đổi cỡ khi 2 pointer: K tăng đúng 1', async () => {
    const before = (await rep()).totals;
    await page.locator('[data-m=M4]').click();
    await touch('touchStart', [[150, 300, 1], [900, 300, 2]]); await page.waitForTimeout(150);
    assert.equal((await page.evaluate(() => window.__gt.state().nActive)), 2);
    await page.setViewportSize({ width: 1100, height: 620 }); await page.waitForTimeout(400);
    await touch('touchEnd', []); await page.waitForTimeout(150);
    const r = await rep();
    assert.equal(r.totals.sizeMulti - before.sizeMulti, 1);
    assert.equal(r.totals.size - before.size, 1);
    assert.equal(r.perLabel.M4.resizeMulti, 1);
    assert.match(r.conclusion[3], /M4: 1 lần đổi cỡ \(1 khi ≥2 ngón\)/);
    assert.ok(r.events.some((e) => e.kind === 'size' && e.active >= 2));
  });
  await check('nút Copy báo cáo ra JSON hợp lệ', async () => {
    await page.locator('#bCopy').click(); await page.waitForTimeout(300);
    assert.match(await page.locator('#msg').innerText(), /Đã copy/);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    const j = JSON.parse(clip); assert.ok(j.ua.includes('ClassIn')); assert.ok(Array.isArray(j.events)); assert.ok(!('uid' in j.params));
    await page.locator('#bRep').click(); assert.match(await page.locator('#rep').innerText(), /KẾT LUẬN/);
  });
  await check('log <= 60 dòng, không lỗi console', async () => {
    assert.ok((await page.locator('#log').innerText()).split('\n').length <= 60);
    assert.deepEqual(errs, [], JSON.stringify(errs));
  });
  await check('zones=1 chạy', async () => {
    await page.goto(B + '?zones=1&w=A'); await page.waitForTimeout(300);
    assert.equal(await page.locator('.zone canvas').count(), 1);
  });
} finally {
  if (browser) await browser.close();
  srv.kill();
}
if (fails.length) { console.log('THẤT BẠI:', fails.join(', ')); process.exit(1); }
console.log('TẤT CẢ ĐẠT');
