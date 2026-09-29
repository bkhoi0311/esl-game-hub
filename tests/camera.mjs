// Test 4 game camera bằng "camera giả": thay getUserMedia bằng luồng từ canvas mà test điều khiển được.
// Chạy: npm run test:camera [tên-game ...]
import { chromium } from 'playwright';
import { createServer, preview } from 'vite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const OUT = resolve('screenshots/camera');
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

// PREVIEW=1: chạy trên bản build (dist/) thay vì dev server, để kiểm tra bản sẽ đưa lên web.
const server = process.env.PREVIEW
  ? await preview({ preview: { port: 5196, strictPort: true }, logLevel: 'error' })
  : await createServer({ server: { port: 5196, strictPort: true }, logLevel: 'error' });
if (!process.env.PREVIEW) await server.listen();
const BASE = 'http://localhost:5196/';
const browser = await chromium.launch();
const results = [];
const pageErrors = [];

// Camera giả: cảnh tĩnh + nhiễu cảm biến nhẹ; window.__motion = {x, y, w, h} (tỉ lệ ảnh GỐC) vẽ 1 bàn tay vẫy.
// window.__camError = 'NotReadableError' ... để giả lập lỗi.
const FAKE_CAMERA = () => {
  const tracks = [];
  window.__tracks = tracks;
  const make = () => {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 360;
    const ctx = c.getContext('2d');
    let t = 0;
    const draw = () => {
      t += 1;
      ctx.fillStyle = '#8fa3b8';
      ctx.fillRect(0, 0, 640, 360);
      ctx.fillStyle = '#c9b48a';
      ctx.fillRect(0, 250, 640, 110);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = ['#e0664f', '#4f7be0', '#46b36a', '#e0c14f', '#9a4fe0', '#e04f9a'][i];
        ctx.fillRect(40 + i * 100, 120, 60, 150);
        ctx.beginPath();
        ctx.arc(70 + i * 100, 100, 26, 0, Math.PI * 2);
        ctx.fill();
      }
      // nhiễu cảm biến nhẹ
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
        ctx.fillRect(Math.random() * 640, Math.random() * 360, 2, 2);
      }
      const m = window.__motion;
      if (m) {
        const dx = Math.sin(t / 2) * m.w * 640 * 0.35;
        ctx.fillStyle = '#ffd2a6';
        ctx.fillRect(m.x * 640 + m.w * 640 * 0.3 + dx, m.y * 360, m.w * 640 * 0.4, m.h * 360);
      }
    };
    setInterval(draw, 33);
    draw();
    const s = c.captureStream(30);
    s.getTracks().forEach((tr) => tracks.push(tr));
    return s;
  };
  navigator.mediaDevices.getUserMedia = async (c) => {
    const want = c && c.video && c.video.deviceId && c.video.deviceId.exact;
    if (want && (window.__busyIds || []).includes(want)) {
      const e = new Error('busy');
      e.name = 'NotReadableError';
      throw e;
    }
    if (window.__camError) {
      const e = new Error('fake');
      e.name = window.__camError;
      throw e;
    }
    return make();
  };
  window.__cams = window.__cams || [{ kind: 'videoinput', deviceId: 'fake-s1', label: 'ClassIn Cam S1 (fake)', groupId: 'g' }];
  navigator.mediaDevices.enumerateDevices = async () => window.__cams;
};

async function open(hash, viewport = { width: 1920, height: 1080 }, init) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(FAKE_CAMERA);
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${hash}: ${e.message}`));
  // Log nội bộ của WASM MediaPipe (đã được bắt và xử lý) không tính là lỗi.
  page.on('console', (m) => m.type() === 'error' && !/third_party\/mediapipe|calculator|RET_CHECK|WaitUntilIdle|^INFO:|XNNPACK/.test(m.text()) && pageErrors.push(`${hash}: ${m.text()}`));
  await page.goto(BASE + hash);
  return { context, page };
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
const TESTS = {};

// ---------- Statue Freeze ----------
TESTS['statue-freeze'] = async () => {
  const { context, page } = await open('#/game/statue-freeze');
  await page.waitForSelector('[data-testid=cam-start]:not([disabled])');
  assert.match(await page.textContent('[data-testid=cam-select]'), /ClassIn Cam S1/);
  await shot(page, 'statue-1-setup');
  await page.click('[data-testid=cam-start]');
  const phase = () => page.evaluate(() => window.__statueFreeze.debug().phase);
  const waitPhase = async (p, ms = 15000) => {
    const end = Date.now() + ms;
    while ((await phase()) !== p) {
      if (Date.now() > end) throw new Error(`chờ pha ${p} quá lâu (đang ${await phase()})`);
      await page.waitForTimeout(100);
    }
  };
  await waitPhase('green');
  await shot(page, 'statue-2-green');
  await waitPhase('red');
  // Vẫy tay ở góc trên-trái của ẢNH GỐC => trên màn hình gương là góc trên-PHẢI.
  await page.evaluate(() => (window.__motion = { x: 0.08, y: 0.15, w: 0.14, h: 0.25 }));
  await waitPhase('review');
  await page.evaluate(() => (window.__motion = null));
  await shot(page, 'statue-3-moved');
  const flagged = await page.evaluate(() => window.__statueFreeze.debug().flagged);
  const cells = flagged.map((f, i) => (f ? i : -1)).filter((i) => i >= 0).map((i) => ({ c: i % 16, r: Math.floor(i / 16) }));
  assert.ok(cells.length >= 2, `vẫy tay nhưng chỉ ${cells.length} ô đỏ`);
  const outside = cells.filter((p) => p.c < 11 || p.r > 4);
  assert.equal(outside.length, 0, `ô đỏ sai vị trí (phải ở góc trên-phải màn hình): ${JSON.stringify(outside)}`);

  // Lượt tiếp: đứng yên khi đèn đỏ => không quá 1 ô.
  await page.click('[data-testid=sf-next]');
  await waitPhase('red');
  await waitPhase('review');
  const still = (await page.evaluate(() => window.__statueFreeze.debug().flagged)).reduce((a, b) => a + b, 0);
  assert.ok(still <= 1, `đứng yên mà báo ${still} ô`);
  await shot(page, 'statue-4-still');

  // Nút tắt camera tắt hẳn track.
  await page.click('[data-testid=cam-toggle]');
  const live = await page.evaluate(() => window.__tracks.filter((t) => t.readyState === 'live').length);
  assert.equal(live, 0, 'tắt camera nhưng track vẫn chạy');
  await context.close();
};

// ---------- Lỗi camera ----------
TESTS['camera-errors'] = async () => {
  for (const [name, re] of [['NotReadableError', /app khác/], ['NotAllowedError', /chặn quyền/], ['NotFoundError', /Không tìm thấy camera/]]) {
    const { context, page } = await open('#/game/statue-freeze', undefined, `window.__camError = '${name}'`);
    await page.waitForSelector('[data-testid=cam-error]:not([hidden])');
    assert.match(await page.textContent('[data-testid=cam-error]'), re);
    if (name === 'NotReadableError') {
      assert.match(await page.textContent('[data-testid=cam-error]'), /ClassIn/);
      await shot(page, 'camera-error-busy');
    }
    await context.close();
  }
};

// ---------- S1 đang bị lớp ClassIn giữ ----------
// Có camera ảo (OBS): tự chuyển sang camera ảo.
TESTS['camera-busy-virtual'] = async () => {
  const { context, page } = await open('#/game/simon-pose', undefined,
    "window.__busyIds = ['classin-s1']; localStorage.setItem('eslhub.settings', JSON.stringify({ cameraId: 'classin-s1' })); window.__cams = [{ kind: 'videoinput', deviceId: 'classin-s1', label: 'ClassIn Cam S1', groupId: 'a' }, { kind: 'videoinput', deviceId: 'obs', label: 'OBS Virtual Camera', groupId: 'b' }]");
  await page.waitForFunction(() => document.querySelector('[data-testid=cam-select]').value === 'obs', null, { timeout: 8000 });
  await page.waitForSelector('[data-testid=cam-start]:not([disabled])');
  assert.equal(await page.isVisible('[data-testid=cam-busy]'), false, 'đã dùng camera ảo thì không hiện bảng lỗi');
  assert.match(await page.textContent('[data-testid=cam-switch]'), /OBS Virtual Camera/);
  await context.close();
};
// Không có camera ảo nhưng máy có camera khác rảnh (camera của màn hình): tự dùng, không hỏi.
TESTS['camera-busy-other'] = async () => {
  const { context, page } = await open('#/game/simon-pose', undefined,
    "window.__busyIds = ['classin-s1']; localStorage.setItem('eslhub.settings', JSON.stringify({ cameraId: 'classin-s1' })); window.__cams = [{ kind: 'videoinput', deviceId: 'classin-s1', label: 'ClassIn Cam S1', groupId: 'a' }, { kind: 'videoinput', deviceId: 'board', label: 'Board Camera', groupId: 'b' }]");
  await page.waitForFunction(() => document.querySelector('[data-testid=cam-select]').value === 'board', null, { timeout: 8000 });
  await page.waitForSelector('[data-testid=cam-start]:not([disabled])');
  assert.equal(await page.isVisible('[data-testid=cam-busy]'), false);
  await shot(page, 'camera-busy-other');
  await context.close();
};
// Không có camera nào khác: hiện 2 cách, tự thử lại; tắt camera trong lớp là game tự nhận.
TESTS['camera-busy-wait'] = async () => {
  const { context, page } = await open('#/game/simon-pose', undefined,
    "window.__busyIds = ['classin-s1']; localStorage.setItem('eslhub.settings', JSON.stringify({ cameraId: 'classin-s1' })); window.__cams = [{ kind: 'videoinput', deviceId: 'classin-s1', label: 'ClassIn Cam S1', groupId: 'a' }]");
  await page.waitForSelector('[data-testid=cam-busy]');
  assert.match(await page.textContent('[data-testid=cam-busy]'), /OBS Virtual Camera/);
  await shot(page, 'camera-busy-wait');
  await page.evaluate(() => (window.__busyIds = []));
  await page.waitForSelector('[data-testid=cam-start]:not([disabled])', { timeout: 6000 });
  assert.equal(await page.isVisible('[data-testid=cam-error]'), false, 'camera rảnh thì bảng lỗi phải ẩn');
  await context.close();
};

// ---------- Cắm camera S1 sau khi mở trang: tự tìm thấy và tự chuyển sang S1 ----------
TESTS['camera-hotplug'] = async () => {
  const { context, page } = await open('#/game/statue-freeze', undefined,
    "window.__cams = [{ kind: 'videoinput', deviceId: 'laptop', label: 'Integrated Webcam', groupId: 'a' }]");
  await page.waitForSelector('[data-testid=cam-start]:not([disabled])');
  assert.match(await page.textContent('[data-testid=cam-count]'), /Tìm thấy 1 camera/);
  assert.equal(await page.isVisible('[data-testid=cam-help]'), true, 'chỉ 1 camera thì phải hiện hướng dẫn');
  await shot(page, 'camera-only-laptop');
  await page.evaluate(() => {
    window.__cams.push({ kind: 'videoinput', deviceId: 'classin-s1', label: 'ClassIn Cam S1', groupId: 'b' });
    navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
  });
  await page.waitForFunction(() => document.querySelector('[data-testid=cam-select]').value === 'classin-s1', null, { timeout: 5000 });
  assert.match(await page.textContent('[data-testid=cam-count]'), /Tìm thấy 2 camera/);
  await page.waitForSelector('[data-testid=cam-start]:not([disabled])');
  await shot(page, 'camera-s1-found');
  await context.close();
};

// ---------- 3 game AI: nạp model, chạy vòng lặp không lỗi ----------
for (const [id, ready] of [['simon-pose', '[data-testid=sp-command]'], ['head-tilt', '[data-testid=ht-prompt]']]) {
  TESTS[id] = async () => {
    const { context, page } = await open(`#/game/${id}`, undefined, undefined);
    await page.waitForSelector('[data-testid=cam-start]:not([disabled])');
    await page.click('[data-testid=cam-start]');
    await page.waitForSelector(ready);
    await page.waitForSelector('.sp-loading', { state: 'detached', timeout: 60000 });
    await page.waitForTimeout(3500);
    const info = await page.evaluate(() => window.__vision && window.__vision.info());
    console.log(`  ${id}: AI chạy ${info && info.mode} · bậc ${info && info.tier} · ${info && info.model} · ${info && info.delegate || ''} · ${info && info.ms}ms · ${info && info.results} lần`);

    assert.equal(info && info.mode, 'worker', 'AI phải chạy ở luồng riêng');
    assert.ok(info.results > 5, 'AI phải trả kết quả liên tục');
    // Máy chậm: hạ 2 bậc (Simon: full -> lite, ảnh nhỏ hơn), AI vẫn chạy tiếp, không báo lỗi, không tắt camera.
    const before = info.results;
    await page.evaluate(() => window.__vision.degrade());
    await page.waitForTimeout(3500); // đợi đổi model xong
    await page.evaluate(() => window.__vision.degrade());
    await page.waitForTimeout(2500);
    const after = await page.evaluate(() => window.__vision.info());
    assert.equal(after.tier, 2, 'phải xuống bậc 2');
    assert.ok(after.results > before + 5, 'sau khi hạ bậc AI vẫn phải chạy');
    assert.equal(await page.locator('.toast').count(), 0, 'không được hiện thông báo máy chậm');
    await shot(page, `${id}-play`);
    await context.close();
  };
}

TESTS['word-ninja'] = async () => {
  // Chế độ chuột: kéo chuột thật nhanh qua màn hình, phải chém được thẻ (điểm hoặc mạng thay đổi).
  const { context, page } = await open('#/game/word-ninja');
  await page.click('[data-testid=wn-mode] [data-value="touch"]');
  await page.click('[data-testid=word-ninja-start]');
  await page.waitForSelector('[data-testid=wn-canvas]');
  await page.waitForFunction(() => /Slice only [A-Z]+/.test(document.querySelector('[data-testid=wn-target]').textContent), null, { timeout: 15000 });
  const box = await page.locator('[data-testid=wn-canvas]').boundingBox();
  let changed = false;
  for (let k = 0; k < 40 && !changed; k++) {
    await page.waitForTimeout(250);
    for (const y of [0.25, 0.4, 0.55]) {
      await page.mouse.move(box.x + 5, box.y + box.height * y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 5, box.y + box.height * y, { steps: 4 });
      await page.mouse.up();
    }
    const score = await page.textContent('[data-testid=wn-score]');
    const lives = await page.getAttribute('[data-testid=wn-lives]', 'data-lives');
    changed = score !== 'Score 0' || lives !== '3' || Boolean(await page.$('[data-testid=results]'));
  }
  assert.ok(changed, 'chém bằng chuột không trúng thẻ nào');
  await shot(page, 'word-ninja-touch');
  await context.close();

  // Chế độ camera: nạp model, chạy không lỗi.
  const c2 = await open('#/game/word-ninja');
  await c2.page.click('[data-testid=word-ninja-start]');
  await c2.page.waitForSelector('[data-testid=cam-start]:not([disabled])');
  await c2.page.click('[data-testid=cam-start]');
  await c2.page.waitForSelector('[data-testid=wn-canvas]');
  await c2.page.waitForFunction(() => window.__ninjaScene, null, { timeout: 60000 });
  await c2.page.waitForTimeout(2500);
  await shot(c2.page, 'word-ninja-camera');
  await c2.context.close();
};

// ---------- Vào/ra 5 lần: camera phải tắt hẳn ----------
async function enterExit(id) {
  const { context, page } = await open('#/');
  for (let i = 0; i < 5; i++) {
    await page.evaluate((gid) => (location.hash = `#/game/${gid}`), id);
    await page.waitForSelector('[data-testid=cam-start]:not([disabled]), [data-testid=word-ninja-start]');
    await page.waitForTimeout(300);
    await page.evaluate(() => (location.hash = '#/'));
    await page.waitForSelector('.menu');
  }
  const live = await page.evaluate(() => window.__tracks.filter((t) => t.readyState === 'live').length);
  assert.equal(live, 0, `còn ${live} track camera chạy sau khi thoát`);
  await context.close();
}

try {
  for (const [name, fn] of Object.entries(TESTS)) {
    if (only.length && !only.includes(name)) continue;
    const runs = [[name, fn]];
    if (!['camera-errors', 'camera-hotplug', 'camera-busy-virtual', 'camera-busy-wait', 'camera-busy-other'].includes(name)) runs.push([`${name} vào/ra 5 lần`, () => enterExit(name)]);
    for (const [label, run] of runs) {
      try {
        await run();
        results.push(`PASS ${label}`);
      } catch (err) {
        results.push(`FAIL ${label}: ${err.message.split('\n')[0]}`);
        process.exitCode = 1;
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
}
if (pageErrors.length) {
  results.push('LỖI TRÌNH DUYỆT:\n  ' + [...new Set(pageErrors)].join('\n  '));
  process.exitCode = 1;
}
console.log(results.join('\n'));
