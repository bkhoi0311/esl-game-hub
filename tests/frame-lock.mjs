// KHÓA KHUNG end-to-end: màn "Khóa khung" lớn + viền + biểu ngữ trong game, với camera giả mô phỏng reframe (phóng/dời khung).
// Chạy: node tests/frame-lock.mjs   (PORT=... để đổi cổng; SHOTS=thư-mục để lưu ảnh chụp)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { startCam } from './helpers/start-cam.mjs';

const OUT = resolve(process.env.SHOTS || 'screenshots/frame-lock');
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.PORT || 5197);
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
const BASE = `http://localhost:${PORT}/`;
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const results = [];
const pageErrors = [];

// Camera giả: cảnh tĩnh có vân; window.__view = { s, dx, dy } phóng/dời khung như camera AI S1.
const FAKE_CAMERA = () => {
  const tracks = [];
  window.__tracks = tracks;
  const make = () => {
    const c = document.createElement('canvas');
    c.width = 640; c.height = 360;
    const ctx = c.getContext('2d');
    const draw = () => {
      ctx.fillStyle = '#8fa3b8';
      ctx.fillRect(0, 0, 640, 360);
      const vw = window.__view;
      if (vw) { ctx.save(); ctx.translate(320, 180); ctx.scale(vw.s || 1, vw.s || 1); ctx.translate(-320 - (vw.dx || 0), -180 - (vw.dy || 0)); }
      ctx.fillStyle = '#c9b48a';
      ctx.fillRect(0, 250, 640, 110);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = ['#e0664f', '#4f7be0', '#46b36a', '#e0c14f', '#9a4fe0', '#e04f9a'][i];
        ctx.fillRect(40 + i * 100, 120, 60, 150);
        ctx.beginPath(); ctx.arc(70 + i * 100, 100, 26, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = 0; i < 400; i++) { ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'; ctx.fillRect(Math.random() * 640, Math.random() * 360, 2, 2); }
      if (vw) ctx.restore();
    };
    setInterval(draw, 33);
    draw();
    const s = c.captureStream(30);
    s.getTracks().forEach((tr) => tracks.push(tr));
    return s;
  };
  navigator.mediaDevices.getUserMedia = async () => make();
  window.__cams = [{ kind: 'videoinput', deviceId: 'fake-s1', label: 'ClassIn Cam S1 (fake)', groupId: 'g' }];
  navigator.mediaDevices.enumerateDevices = async () => window.__cams;
};

async function open(hash, viewport = { width: 1920, height: 1080 }) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(FAKE_CAMERA);
  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${hash}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/third_party\/mediapipe|calculator|RET_CHECK|WaitUntilIdle|^INFO:|XNNPACK/.test(m.text()) && pageErrors.push(`${hash}: ${m.text()}`));
  await page.goto(BASE + hash);
  await page.waitForSelector('[data-testid=cam-start]:not([disabled])');
  return { context, page };
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
const animateView = (page, from, to, ms = 300) => page.evaluate(([a, b, d]) => {
  const t0 = performance.now();
  const id = setInterval(() => {
    const u = Math.min(1, (performance.now() - t0) / d);
    window.__view = { s: a.s + (b.s - a.s) * u, dx: a.dx + (b.dx - a.dx) * u, dy: a.dy + (b.dy - a.dy) * u };
    if (u >= 1) clearInterval(id);
  }, 33);
}, [from, to, ms]);
const lockOf = (page, sel) => page.getAttribute(sel, 'data-lock');
const waitLock = (page, sel, want, ms = 8000) => page.waitForFunction(([s, w]) => { const e = document.querySelector(s); return e && w.includes(e.dataset.lock); }, [sel, want], { timeout: ms });
const VIEW0 = { s: 1, dx: 0, dy: 0 };
const TESTS = {};

// Màn Khóa khung (Statue): viền xanh -> reframe làm viền đổi màu + đếm lại -> chốt mốc -> "Khóa khung" vào game.
TESTS['lock-screen'] = async () => {
  const { context, page } = await open('?lockhold=2500#/game/statue-freeze');
  await page.click('[data-testid=cam-start]');
  await page.waitForSelector('[data-testid=fl-screen]');
  // xem trước lớn: chiếm phần lớn bề rộng khả dụng
  const pw = await page.evaluate(() => document.querySelector('[data-testid=fl-preview]').getBoundingClientRect().width);
  assert.ok(pw >= 1000, `xem trước chỉ rộng ${Math.round(pw)} px`);
  assert.ok(await page.isDisabled('[data-testid=fl-lock]'), 'chưa chốt mốc thì nút Khóa khung phải tắt');
  await waitLock(page, '[data-testid=fl-preview]', ['locked']);
  await page.waitForTimeout(1200);
  await shot(page, '1-man-khoa-khung');
  const ring = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=fl-preview]'), '::after').borderTopWidth);
  assert.equal(ring, '14px', 'viền màn Khóa khung phải dày 14px');
  // chốt mốc sau ~2,5 s
  await page.waitForFunction(() => !document.querySelector('[data-testid=fl-lock]').disabled, null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => document.querySelector('[data-testid=fl-fill]').style.width), '100%');
  // reframe: viền đổi màu + biểu ngữ + mốc bị huỷ
  await animateView(page, VIEW0, { s: 1.5, dx: 40, dy: 0 });
  await waitLock(page, '[data-testid=fl-preview]', ['reframed', 'settling']);
  assert.ok(await page.isVisible('[data-testid=fl-preview] .fl-banner'), 'phải có biểu ngữ đổi khung');
  assert.ok(await page.isDisabled('[data-testid=fl-lock]'), 'đổi khung thì mốc cũ bị huỷ');
  const col = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=fl-preview]')).getPropertyValue('--fl').trim());
  assert.match(col, /#(ff5a3c|f5b800)/i);
  await waitLock(page, '[data-testid=fl-preview]', ['locked'], 10000);
  await page.waitForFunction(() => !document.querySelector('[data-testid=fl-lock]').disabled, null, { timeout: 10000 });
  // chụp lại mốc rồi khóa
  await page.click('[data-testid=fl-recapture]');
  assert.ok(await page.isDisabled('[data-testid=fl-lock]'));
  await page.waitForFunction(() => !document.querySelector('[data-testid=fl-lock]').disabled, null, { timeout: 8000 });
  await page.click('[data-testid=fl-lock]');
  await page.waitForSelector('.sf-video');
  await page.waitForFunction(() => window.__statueFreeze && window.__statueFreeze.debug().phase !== 'idle');
  await context.close();
};

// Trong game Statue: viền xanh, rồi reframe -> viền đổi màu + biểu ngữ + tạm dừng chấm điểm (không ô đỏ giả), đếm số lần.
TESTS['statue-in-game'] = async () => {
  const { context, page } = await open('#/game/statue-freeze');
  await startCam(page); // Bỏ qua màn Khóa khung
  await page.waitForSelector('.sf-video');
  await waitLock(page, '.sf-video', ['locked']);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.sf-video'), '::after').borderTopWidth), '5px');
  const dbg = () => page.evaluate(() => window.__statueFreeze.debug());
  const waitPhase = async (p, ms = 25000) => {
    const end = Date.now() + ms;
    while ((await dbg()).phase !== p) {
      if (Date.now() > end) throw new Error(`chờ pha ${p} quá lâu (đang ${(await dbg()).phase})`);
      await page.waitForTimeout(100);
    }
  };
  await waitPhase('green');
  await page.waitForTimeout(800);
  await shot(page, '2-vien-xanh-trong-game');
  assert.equal(await page.isVisible('.sf-video .fl-banner'), false, 'khung ổn định thì không có biểu ngữ');
  await waitPhase('red');
  await page.waitForTimeout(1300);
  await animateView(page, VIEW0, { s: 1.5, dx: 40, dy: 0 });
  await waitLock(page, '.sf-video', ['reframed']);
  assert.ok(await page.isVisible('.sf-video .fl-banner'));
  assert.match(await page.textContent('.sf-video .fl-banner'), /Camera vừa đổi khung/);
  await shot(page, '3-bieu-ngu-doi-khung');
  const mid = await dbg();
  assert.equal(mid.reframing, true, 'tạm dừng chấm điểm khi đổi khung');
  assert.equal(mid.flagged.reduce((a, b) => a + b, 0), 0, 'đổi khung mà có ô đỏ giả');
  await waitPhase('review', 25000);
  const end = await dbg();
  assert.ok(end.areas <= 1, `camera đổi khung mà báo ${end.areas} vùng`);
  await waitLock(page, '.sf-video', ['locked'], 8000);
  await page.waitForFunction(() => document.querySelector('.sf-video .fl-banner').hidden, null, { timeout: 4000 });
  assert.ok(end.reframes >= 1);
  assert.match(await page.textContent('[data-testid=fl-count]'), /Camera đổi khung: [1-9]/);
  await context.close();
};

// Simon: màn Khóa khung -> Bỏ qua / Quay lại; trong game viền + đếm số lần đổi khung.
TESTS['simon'] = async () => {
  const { context, page } = await open('?lockhold=2500#/game/simon-pose');
  await page.click('[data-testid=cam-start]');
  await page.waitForSelector('[data-testid=fl-screen]');
  await page.click('[data-testid=fl-back]');
  await page.waitForSelector('[data-testid=cam-start]');
  await page.waitForFunction(() => document.querySelector('.cam-preview video') !== null);
  await page.click('[data-testid=cam-start]');
  await page.waitForSelector('[data-testid=fl-skip]');
  await page.click('[data-testid=fl-skip]');
  await page.waitForSelector('[data-testid=sp-video]');
  await waitLock(page, '[data-testid=sp-video]', ['locked']);
  await page.waitForTimeout(1500);
  await animateView(page, VIEW0, { s: 1.5, dx: 40, dy: 0 });
  await waitLock(page, '[data-testid=sp-video]', ['reframed']);
  assert.ok(await page.isVisible('[data-testid=sp-video] .fl-banner'));
  assert.equal((await page.evaluate(() => window.__simonPose.debug())).reframing, true);
  await waitLock(page, '[data-testid=sp-video]', ['locked'], 10000);
  const d = await page.evaluate(() => window.__simonPose.debug());
  assert.ok(d.reframes >= 1, `đếm ${d.reframes}`);
  await context.close();
};

// ?reframe=0 tắt toàn bộ: không màn Khóa khung, không viền, không biểu ngữ.
TESTS['reframe-off'] = async () => {
  const { context, page } = await open('?reframe=0#/game/statue-freeze');
  await page.click('[data-testid=cam-start]');
  await page.waitForSelector('.sf-video');
  await page.waitForTimeout(800);
  assert.equal(await page.locator('[data-testid=fl-screen]').count(), 0);
  assert.equal(await page.getAttribute('.sf-video', 'data-lock'), null);
  assert.equal(await page.locator('.fl-banner, .fl-chip').count(), 0);
  await context.close();
};

try {
  const only = process.argv.slice(2);
  for (const [name, fn] of Object.entries(TESTS)) {
    if (only.length && !only.includes(name)) continue;
    try { await fn(); results.push(`PASS ${name}`); } catch (err) { results.push(`FAIL ${name}: ${err.message.split('\n').slice(0, 3).join(' / ')}`); process.exitCode = 1; }
  }
} finally {
  await browser.close();
  await server.close();
}
if (pageErrors.length) { results.push('LỖI TRÌNH DUYỆT:\n  ' + [...new Set(pageErrors)].join('\n  ')); process.exitCode = 1; }
console.log(results.join('\n'));
