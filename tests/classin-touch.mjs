// Test chạm kiểu ClassIn X (CEF Chromium 109, chạm báo pointerType=touch, width=height=50).
// Chạy: npm run test:classin
// Chạy 2 lượt: Chrome thường, và Chrome tắt cờ LabelInteractiveContentCheckBeforeHandler
// (mô phỏng hành vi Chromium 109: <label> chuyển click giả vào nút đầu tiên khi nút bị dựng lại).
// Mỗi điều khiển được bấm 3 cách: chuột, el.click(), chạm (CDP radius 25 và PointerEvent giả width=50).
import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

const PORT = 5197;
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
const BASE = `http://localhost:${PORT}/`;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.5414.120 Safari/537.36 ClassIn X/6.0.9.1813';
const CAM_ARGS = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];
const RUNS = [
  { name: 'chrome-thuong', args: [] },
  { name: 'chromium109-mo-phong', args: ['--disable-blink-features=LabelInteractiveContentCheckBeforeHandler'] },
];
const VIEWPORTS = [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }];
const METHODS = ['chuot', 'click', 'cham-cdp', 'cham-pointer'];
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));

// Ma trận: game -> các điều khiển segmented và giá trị cần thử (không phải lựa chọn đầu).
const MATRIX = [
  { hash: 'memory-match', controls: [['mm-pairs', ['8', '10']], ['mm-teams', ['3', '4']]] },
  { hash: 'gold-heist', controls: [['gh-teams', ['3', '4']], ['gh-count', ['15', '20']]] },
  { hash: 'impostor', controls: [['imp-seconds', ['60', '90']]] },
  { hash: 'tug-of-war', controls: [['tw-steps', ['5', '7']]] },
  { hash: 'balloon-pop', controls: [['balloon-pop-seconds', ['60', '90']]] },
  { hash: 'whack-word', controls: [['whack-word-seconds', ['60', '90']]] },
  { hash: 'word-ninja', controls: [['wn-mode', ['touch']]] },
  { hash: 'statue-freeze', controls: [['sf-auto', ['true']]] },
  { hash: 'simon-pose', controls: [['sp-rounds', ['10', '15']], ['sp-count', ['2', '3']], ['sp-zone', ['middle', 'narrow']], ['sp-model', ['lite']]] },
];

const results = [];
const failures = [];
const record = (ok, name, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ': ' + detail : ''}`;
  results.push(line);
  if (!ok || process.env.VERBOSE) console.log(line);
  if (!ok) failures.push(name);
};
async function check(name, fn) {
  try { await fn(); record(true, name); } catch (e) { record(false, name, String(e.message).split('\n')[0].slice(0, 160)); }
}

// Bấm một phần tử theo 1 trong 4 cách.
async function activate(page, cdp, sel, method) {
  const loc = page.locator(sel).first();
  await loc.scrollIntoViewIfNeeded();
  if (method === 'chuot') {
    await loc.click({ timeout: 4000 });
  } else if (method === 'click') {
    await loc.evaluate((el) => el.click());
  } else if (method === 'cham-cdp') {
    const b = await loc.boundingBox();
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: 25, radiusY: 25, force: 0, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await loc.evaluate((el) => {
      const init = { pointerType: 'touch', width: 50, height: 50, pressure: 0, bubbles: true, cancelable: true, isPrimary: true, pointerId: 7 };
      el.dispatchEvent(new PointerEvent('pointerdown', init));
      el.dispatchEvent(new PointerEvent('pointerup', init));
      el.click();
    });
  }
  await page.waitForTimeout(method === 'cham-cdp' ? 320 : 80);
}

const pressed = (page, tid) => page.$eval(`[data-testid="${tid}"] [aria-pressed="true"]`, (e) => e.dataset.value).catch(() => null);

async function openGame(browser, hash, viewport) {
  const context = await browser.newContext({ viewport, hasTouch: true, userAgent: UA, permissions: ['camera'] });
  await context.addInitScript(() => {
    window.__gum = 0;
    const md = navigator.mediaDevices;
    if (md && md.getUserMedia) {
      const orig = md.getUserMedia.bind(md);
      md.getUserMedia = (...a) => { window.__gum++; return orig(...a); };
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(3000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}#/game/${hash}`);
  const cdp = await context.newCDPSession(page);
  await page.waitForSelector('.setup-row', { timeout: 10000 });
  return { context, page, cdp, errors };
}

// Chọn giá trị đích: bấm lựa chọn đầu để đặt lại, rồi bấm giá trị đích bằng cách cần thử.
async function pickAndAssert(page, cdp, tid, target, method) {
  const first = await page.$eval(`[data-testid="${tid}"] .btn:not([disabled])`, (e) => e.dataset.value);
  if (first !== target) await activate(page, cdp, `[data-testid="${tid}"] [data-value="${first}"]`, 'chuot');
  const sel = `[data-testid="${tid}"] [data-value="${target}"]`;
  const disabled = await page.$eval(sel, (e) => e.disabled);
  if (disabled) return 'skip';
  await activate(page, cdp, sel, method);
  const got = await pressed(page, tid);
  assert.equal(got, target, `${tid} bấm "${target}" bằng ${method} nhưng đang là "${got}"`);
  return 'ok';
}

async function runMatrix(browser, runName, viewport) {
  const vp = `${viewport.width}x${viewport.height}`;
  for (const g of MATRIX) {
    if (only.length && !only.includes(g.hash)) continue;
    const { context, page, cdp, errors } = await openGame(browser, g.hash, viewport);
    try {
      for (const [tid, values] of g.controls) {
        for (const method of METHODS) {
          for (const v of values) {
            await check(`${runName} ${vp} ${g.hash} ${tid}=${v} [${method}]`, () => pickAndAssert(page, cdp, tid, v, method));
          }
        }
      }
      await check(`${runName} ${vp} ${g.hash} khong loi trang`, async () => assert.deepEqual(errors, []));
    } finally {
      await context.close();
    }
  }
}

// Chạm vào chữ tiêu đề / chữ gợi ý của dòng cài đặt không được đặt lại giá trị; kết quả sau Start đúng.
async function runLabelTaps(browser, runName, viewport) {
  const vp = `${viewport.width}x${viewport.height}`;
  if (!only.length || only.includes('memory-match')) {
    const { context, page, cdp } = await openGame(browser, 'memory-match', viewport);
    try {
      await check(`${runName} ${vp} memory-match cham chu tieu de/goi y khong doi so doi`, async () => {
        await pickAndAssert(page, cdp, 'mm-teams', '3', 'chuot');
        await activate(page, cdp, '.setup-row:has([data-testid="mm-teams"]) > span', 'cham-cdp');
        await activate(page, cdp, '.setup-row:has([data-testid="mm-teams"]) > small', 'cham-cdp');
        await activate(page, cdp, '[data-testid="mm-teams"]', 'cham-cdp'); // viền/khoảng hở của thanh
        assert.equal(await pressed(page, 'mm-teams'), '3');
      });
      await check(`${runName} ${vp} memory-match sau Start: 16 the, 4 doi`, async () => {
        await pickAndAssert(page, cdp, 'mm-pairs', '8', 'cham-cdp');
        await pickAndAssert(page, cdp, 'mm-teams', '4', 'cham-cdp');
        await page.click('[data-testid=memory-match-start]');
        await page.waitForSelector('[data-testid=mm-grid]');
        assert.equal(await page.locator('.mm-card').count(), 16);
        assert.equal(await page.locator('.mm-scores .score-team').count(), 4);
      });
    } finally { await context.close(); }
  }
  if (!only.length || only.includes('gold-heist')) {
    const { context, page, cdp } = await openGame(browser, 'gold-heist', viewport);
    try {
      await check(`${runName} ${vp} gold-heist sau Start: 3 doi`, async () => {
        await pickAndAssert(page, cdp, 'gh-teams', '3', 'cham-cdp');
        await page.click('[data-testid=gold-heist-start]');
        await page.waitForSelector('[data-testid=gh-question]');
        assert.equal(await page.locator('.gh-scores .score-team').count(), 3);
      });
    } finally { await context.close(); }
  }
  if (!only.length || only.includes('word-ninja')) {
    const { context, page, cdp } = await openGame(browser, 'word-ninja', viewport);
    try {
      await check(`${runName} ${vp} word-ninja che do cham khong xin camera`, async () => {
        await pickAndAssert(page, cdp, 'wn-mode', 'touch', 'cham-cdp');
        await page.click('[data-testid=word-ninja-start]');
        await page.waitForSelector('[data-testid=wn-canvas]', { timeout: 8000 });
        assert.equal(await page.evaluate(() => window.__gum), 0);
      });
    } finally { await context.close(); }
  }
  if (!only.length || only.includes('simon-pose')) {
    const { context, page, cdp } = await openGame(browser, 'simon-pose', viewport);
    try {
      await check(`${runName} ${vp} simon-pose cham chu "Tu the" khong doi checkbox`, async () => {
        const read = () => page.$$eval('.sp-pose input', (els) => els.map((e) => e.checked).join(','));
        const before = await read();
        // Chạm thật gần ô tư thế bị Chrome "dịch" sang ô gần nhất (touch adjustment), nên dùng PointerEvent + click trực tiếp lên chữ.
        await activate(page, cdp, '.setup-row:has(.sp-poses) > span', 'cham-pointer');
        assert.equal(await read(), before);
      });
      await check(`${runName} ${vp} simon-pose cham chu "Camera" khong mo select`, async () => {
        const before = await page.$eval('[data-testid=cam-select]', (e) => document.activeElement === e);
        await activate(page, cdp, '.setup-row:has([data-testid=cam-select]) > span', 'cham-cdp');
        const after = await page.$eval('[data-testid=cam-select]', (e) => document.activeElement === e);
        assert.equal(after, before);
      });
    } finally { await context.close(); }
  }
}

// Điều khiển mới thay <select>/number/range: Cài đặt (giọng, chế độ giọng, tốc độ), stepper tỉ lệ rương, chọn camera bằng nút.
async function runForms(browser, runName, viewport) {
  const vp = `${viewport.width}x${viewport.height}`;
  const stored = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem('eslhub.settings') || '{}')[k], key);
  if (!only.length || only.includes('settings')) {
    const context = await browser.newContext({ viewport, hasTouch: true, userAgent: UA });
    const page = await context.newPage();
    page.setDefaultTimeout(3000);
    const cdp = await context.newCDPSession(page);
    try {
      await page.goto(BASE + '#/');
      await page.waitForSelector('[data-testid=open-settings]');
      await page.click('[data-testid=open-settings]');
      await page.waitForSelector('[data-testid=accent]');
      for (const method of METHODS) {
        await check(`${runName} ${vp} settings accent=en-GB [${method}]`, async () => {
          await pickAndAssert(page, cdp, 'accent', 'en-GB', method);
          assert.equal(await stored(page, 'accent'), 'en-GB');
        });
        await check(`${runName} ${vp} settings voice-mode=web [${method}]`, async () => {
          await pickAndAssert(page, cdp, 'voice-mode', 'web', method);
          assert.equal(await stored(page, 'voiceMode'), 'web');
        });
        await check(`${runName} ${vp} settings toc do doc +/- [${method}]`, async () => {
          const before = await page.$eval('[data-testid=tts-rate]', (e) => Number(e.value));
          await activate(page, cdp, '.range-steps [data-act="inc"]', method);
          const up = await page.$eval('[data-testid=tts-rate]', (e) => Number(e.value));
          assert.ok(up > before, `tăng: ${before} -> ${up}`);
          await activate(page, cdp, '.range-steps [data-act="dec"]', method);
          const down = await page.$eval('[data-testid=tts-rate]', (e) => Number(e.value));
          assert.ok(Math.abs(down - before) < 1e-9, `giảm: ${up} -> ${down}`);
          assert.ok(Math.abs((await stored(page, 'ttsRate')) - before) < 1e-9);
        });
      }
    } finally { await context.close(); }
  }
  if (!only.length || only.includes('gold-heist')) {
    const { context, page, cdp } = await openGame(browser, 'gold-heist', viewport);
    try {
      for (const method of METHODS) {
        await check(`${runName} ${vp} gold-heist ti le ruong +/- [${method}]`, async () => {
          const sel = '.gh-weight [data-testid^="gh-weight-"]';
          const before = await page.$eval(sel, (e) => Number(e.dataset.value));
          await activate(page, cdp, `${sel} [data-act="inc"]`, method);
          assert.equal(await page.$eval(sel, (e) => Number(e.dataset.value)), Math.min(100, before + 5));
          await activate(page, cdp, `${sel} [data-act="dec"]`, method);
          assert.equal(await page.$eval(sel, (e) => Number(e.dataset.value)), before);
        });
      }
    } finally { await context.close(); }
  }
  if (!only.length || only.includes('simon-pose')) {
    const { context, page, cdp } = await openGame(browser, 'simon-pose', viewport);
    try {
      await check(`${runName} ${vp} simon-pose nhom nut chon camera hien tren ClassIn X`, async () => {
        await page.waitForSelector('[data-testid=cam-pick] .btn', { timeout: 6000 });
        for (const method of METHODS) {
          await activate(page, cdp, '[data-testid=cam-pick] .btn >> nth=0', method);
          assert.equal(await page.$eval('[data-testid=cam-pick] .btn', (e) => e.getAttribute('aria-pressed')), 'true');
        }
        const h = await page.$eval('[data-testid=cam-pick] .btn', (e) => e.getBoundingClientRect().height);
        assert.ok(h >= 52, `nút camera cao ${h}px`);
      });
    } finally { await context.close(); }
  }
}

// Kích thước vùng bấm: mọi nút phân đoạn và nút -/+ >= 52 px ở cả 2 cỡ cửa sổ.
async function runSizes(browser, runName, viewport) {
  const vp = `${viewport.width}x${viewport.height}`;
  if (only.length && !only.includes('memory-match')) return;
  const { context, page } = await openGame(browser, 'memory-match', viewport);
  try {
    await check(`${runName} ${vp} nut phan doan cao/rong >= 52px`, async () => {
      const sizes = await page.$$eval('.segmented .btn', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
      assert.ok(sizes.length > 0);
      for (const [w, h] of sizes) assert.ok(w >= 52 && h >= 52, `nút ${w}x${h}`);
    });
  } finally { await context.close(); }
}

const browsers = [];
try {
  for (const run of RUNS) {
    const browser = await chromium.launch({ channel: 'chrome', args: [...CAM_ARGS, ...run.args] });
    browsers.push(browser);
    for (const viewport of VIEWPORTS) {
      await runMatrix(browser, run.name, viewport);
      await runLabelTaps(browser, run.name, viewport);
      await runForms(browser, run.name, viewport);
      await runSizes(browser, run.name, viewport);
    }
    await browser.close();
    browsers.pop();
  }
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  await server.close();
}

const fails = results.filter((r) => r.startsWith('FAIL'));
console.log(`\n${results.length - fails.length}/${results.length} PASS, ${fails.length} FAIL`);
process.exit(fails.length ? 1 : 0);
