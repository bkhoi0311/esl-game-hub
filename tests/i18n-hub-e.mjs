// Kiểm song ngữ khu vực camera + 3 game camera + Hướng dẫn (bước E). Chạy: PORT=5215 node tests/i18n-hub-e.mjs
// Chromium 109: node --import ~/.cache/esl-chromium109/hook.mjs tests/i18n-hub-e.mjs   (C109=1 do hook đặt)
// Camera giả bằng JS (getUserMedia thay bằng luồng canvas), UA giả ClassIn X (hiện nhóm nút chọn camera).
import assert from 'node:assert/strict';
import { startServer, launch, vietnameseIn, overflow, noI18nErrors, shot, UA_CLASSIN } from './helpers/i18n-hub.mjs';

const port = Number(process.env.PORT || 5215);
const srv = await startServer(port);
const browser = await launch({ channel: 'chrome' }).catch(() => launch());
const results = [];
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null; // ONLY=Statue để chạy riêng một nhóm ca
const run = async (name, fn) => {
  if (ONLY && !ONLY.test(name)) return;
  // Thử lại 1 lần: dev server Vite tải lại trang khi agent khác sửa tệp giữa chừng.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try { await fn(); results.push(['PASS', name]); return; } catch (e) { if (attempt === 2) results.push(['FAIL', name + ': ' + e.message]); }
  }
};
const noVi = async (page, scope) => (await vietnameseIn(page, scope)).filter((x) => x !== 'aria-label: Tiếng Việt'); // nút ngôn ngữ của thanh trên (tên bản ngữ)
// Cột .cam-side cuộn dọc (overflow-y:auto) nên cắt ngang âm thầm: đo scrollWidth > clientWidth.
const camSideClipped = (page) => page.evaluate(() => [...document.querySelectorAll('.cam-side, .cam-left, .setup-card')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => `${e.className} ${e.scrollWidth}>${e.clientWidth}`));
const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent.trim(), sel);

const FAKE_CAMERA = () => {
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
      }
      const m = window.__motion;
      if (m) {
        ctx.fillStyle = '#ffd2a6';
        ctx.fillRect(m.x * 640 + Math.sin(t / 2) * 30, m.y * 360, m.w * 640, m.h * 360);
      }
    };
    setInterval(draw, 33);
    draw();
    return c.captureStream(30);
  };
  navigator.mediaDevices.getUserMedia = async (c) => {
    const want = c && c.video && c.video.deviceId && c.video.deviceId.exact;
    if (want && (window.__busyIds || []).includes(want)) { const e = new Error('busy'); e.name = 'NotReadableError'; throw e; }
    if (window.__camError) { const e = new Error('fake'); e.name = window.__camError; throw e; }
    return make();
  };
  window.__cams = window.__cams || [{ kind: 'videoinput', deviceId: 'fake-s1', label: 'ClassIn Cam S1 (fake)', groupId: 'g' }];
  navigator.mediaDevices.enumerateDevices = async () => window.__cams;
};

// Mở Hub với camera giả. init: hàm chạy trước trang (đặt __camError, __cams, __busyIds...).
async function open({ lang, hash, w = 1280, h = 720, init, routes } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, userAgent: UA_CLASSIN });
  await ctx.addInitScript(FAKE_CAMERA);
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const log = { errors: [], requests: [] };
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/third_party\/mediapipe|calculator|RET_CHECK|WaitUntilIdle|^INFO:|XNNPACK|Failed to load resource/.test(m.text())) log.errors.push('console: ' + m.text()); });
  page.on('request', (r) => log.requests.push(r.url()));
  if (routes) await routes(page);
  const q = ['test=1', lang ? `ui=${lang}` : ''].filter(Boolean).join('&');
  await page.goto(`${srv.base}?${q}${hash}`);
  return { ctx, page, log, close: () => ctx.close() };
}
const GAMES = { statue: '#/game/statue-freeze', simon: '#/game/simon-pose', ninja: '#/game/word-ninja' };

// ---------- VI mặc định không đổi ----------
await run('VI mặc định: Statue Freeze/Simon/Word Ninja giữ đúng chữ Việt, không request en-main', async () => {
  const s = await open({ hash: GAMES.statue });
  await s.page.waitForSelector('[data-testid=cam-start]:not([disabled])');
  const t = await s.page.textContent('.cam-setup');
  for (const w of ['Chia đội', 'Cả lớp', '2 đội (trái / phải)', 'Sau mỗi lượt đèn đỏ', 'Giáo viên bấm tiếp', 'Tìm lại camera', 'Tìm thấy 1 camera', 'Bắt đầu', 'Không ghi hình']) assert.ok(t.includes(w), 'thiếu: ' + w);
  assert.ok(!s.log.requests.some((u) => /en-main/.test(u)));
  assert.deepEqual(noI18nErrors(s.log), []);
  await s.close();
  const p = await open({ hash: GAMES.simon });
  await p.page.waitForSelector('[data-testid=cam-start]:not([disabled])');
  const t2 = await p.page.textContent('.cam-setup');
  for (const w of ['Tư thế dùng trong bài', 'Số lượt', 'Vùng chơi (lớp đông nên chọn Giữa hoặc Hẹp)', 'Chính xác (khuyên dùng)']) assert.ok(t2.includes(w), 'thiếu: ' + w);
  await p.close();
  const n = await open({ hash: GAMES.ninja });
  await n.page.waitForSelector('[data-testid=wn-mode]');
  const t3 = await n.page.textContent('.setup');
  for (const w of ['Cách chém', 'Vung tay trước camera', 'Chuột / cảm ứng (không camera)', 'Tiếp tục']) assert.ok(t3.includes(w), 'thiếu: ' + w);
  await n.close();
});

// ---------- Statue Freeze EN ----------
for (const [w, h] of [[1280, 720], [1920, 1080]]) {
  await run(`Statue Freeze EN ${w}x${h}: cài đặt + chuẩn bị + trong game`, async () => {
    const s = await open({ lang: 'en', hash: GAMES.statue, w, h });
    await s.page.waitForSelector('[data-testid=cam-start]:not([disabled])');
    const t = await s.page.textContent('.cam-setup');
    for (const x of ['Teams', 'Whole class', '2 teams (left / right)', 'After each red light', 'Teacher taps next', 'Auto-continue', 'Rescan cameras', 'Found 1 camera', 'Start', 'Point the camera at the whole class']) assert.ok(t.includes(x), 'thiếu: ' + x);
    assert.match(await text(s.page, '.cam-setup .setup-row .cam-select-row ~ *, .cam-setup'), /ClassIn Cam S1/);
    assert.deepEqual(await vietnameseIn(s.page, '.cam-setup'), []);
    assert.deepEqual(await overflow(s.page, '.cam-setup'), []);
    assert.deepEqual(await camSideClipped(s.page), [], 'cột bị cắt ngang');
    // nhóm nút chọn camera hiện trên ClassIn X; nhãn nhóm EN
    assert.equal(await s.page.getAttribute('[data-testid=cam-pick]', 'aria-label'), 'Choose camera with buttons');
    assert.equal(await s.page.getAttribute('[data-testid=cam-select]', 'aria-label'), 'Choose camera');
    await shot(s.page, `hub-i18n-e-statue-setup-en-${w}`);
    // 2 đội: gợi ý có tên đội
    await s.page.click('[data-testid=sf-lanes] [data-value="2"]');
    assert.match(await s.page.textContent('.cam-setup'), /2 teams: Red stands on the left half of the screen, Blue on the right half/);
    await s.page.click('[data-testid=sf-lanes] [data-value="1"]');
    // vào game; vẫy tay lúc đo để có toast
    await s.page.evaluate(() => { window.__motion = { x: 0.2, y: 0.2, w: 0.3, h: 0.5 }; });
    await s.page.click('[data-testid=cam-start]');
    await s.page.waitForSelector('[data-testid=sf-sensitivity]');
    assert.equal(await s.page.getAttribute('[data-testid=sf-sensitivity] [data-act=dec]', 'title'), 'Decrease sensitivity');
    assert.equal(await s.page.getAttribute('[data-testid=sf-sensitivity] [data-act=inc]', 'title'), 'Increase sensitivity');
    assert.equal(await text(s.page, '.sf-sens span'), 'Sensitivity');
    assert.equal(await text(s.page, '[data-testid=cam-toggle]'), 'Turn camera off');
    await s.page.waitForFunction(() => document.querySelector('.toast, [data-testid=toast], .toasts > *'), null, { timeout: 8000 }).catch(() => {});
    const toasts = await s.page.$$eval('.toast, .toasts > *', (a) => a.map((x) => x.textContent.trim()));
    assert.deepEqual(toasts.filter((x) => /[à-ỹ]/i.test(x)), [], 'toast còn chữ Việt: ' + toasts.join(' | '));
    if (toasts.length) assert.match(toasts.join(' '), /still moving|keep flickering|check/i, toasts.join(' | '));
    await s.page.evaluate(() => { window.__motion = null; });
    await s.page.click('[data-testid=cam-toggle]');
    assert.equal(await text(s.page, '[data-testid=cam-toggle]'), 'Turn camera on');
    assert.match(await text(s.page, '.sf-side'), /Tap “Turn camera on” to keep playing\./);
    assert.deepEqual(await noVi(s.page, '#app'), []);
    assert.deepEqual(await overflow(s.page, '#app'), []);
    await shot(s.page, `hub-i18n-e-statue-play-en-${w}`);
    assert.deepEqual(noI18nErrors(s.log), []);
    await s.close();
  });
}

await run('Statue Freeze VI 1280x720: ảnh chụp để so', async () => {
  const s = await open({ hash: GAMES.statue });
  await s.page.waitForSelector('[data-testid=cam-start]:not([disabled])');
  assert.deepEqual(await overflow(s.page, '.cam-setup'), []);
    assert.deepEqual(await camSideClipped(s.page), [], 'cột bị cắt ngang');
  await shot(s.page, 'hub-i18n-e-statue-setup-vi-1280');
  await s.close();
});

// ---------- Simon Says Pose EN ----------
for (const [w, h] of [[1280, 720], [1920, 1080]]) {
  await run(`Simon Says Pose EN ${w}x${h}: cài đặt, tối thiểu 2 tư thế, bắt đầu`, async () => {
    const s = await open({ lang: 'en', hash: GAMES.simon, w, h });
    await s.page.waitForSelector('[data-testid=cam-start]:not([disabled])');
    const t = await s.page.textContent('.cam-setup');
    for (const x of ['Poses in this round', 'Number of rounds', 'Students playing at once', 'Play area (for big classes choose Middle or Narrow)', 'Full frame', 'Middle', 'Narrow', 'Detection accuracy', 'Accurate (recommended)', 'Fast (slow PCs)', 'Only students inside the play area']) assert.ok(t.includes(x), 'thiếu: ' + x);
    assert.deepEqual(await vietnameseIn(s.page, '.cam-setup'), []);
    assert.deepEqual(await overflow(s.page, '.cam-setup'), []);
    assert.deepEqual(await camSideClipped(s.page), [], 'cột bị cắt ngang');
    await shot(s.page, `hub-i18n-e-simon-setup-en-${w}`);
    // bỏ hết tư thế trừ 1: toast lỗi EN
    const boxes = await s.page.$$('.sp-pose input');
    for (let i = 1; i < boxes.length; i++) await boxes[i].evaluate((e) => e.click());
    await s.page.click('[data-testid=cam-start]');
    await s.page.waitForSelector('.toast, .toasts > *');
    const m = await s.page.$$eval('.toast, .toasts > *', (a) => a.map((x) => x.textContent.trim()).join('|'));
    assert.match(m, /Choose at least 2 poses\./);
    assert.deepEqual(noI18nErrors(s.log), []);
    await s.close();
  });
}

await run('Simon Says Pose EN: model AI không nạp được -> thông báo EN', async () => {
  const s = await open({
    lang: 'en', hash: GAMES.simon,
    routes: async (page) => { await page.route(/\.(task|tflite|wasm)(\?|$)|mediapipe|tasks-vision/i, (r) => r.abort()); },
  });
  await s.page.waitForSelector('[data-testid=cam-start]:not([disabled])');
  await s.page.click('[data-testid=cam-start]');
  await s.page.waitForSelector('.sp-loading.error', { timeout: 60000 });
  const t = await text(s.page, '.sp-loading.error');
  assert.match(t, /Couldn’t load the AI model/);
  assert.match(t, /first time needs internet/);
  assert.deepEqual(await vietnameseIn(s.page, '.sp-loading'), []);
  await shot(s.page, 'hub-i18n-e-simon-aifail-en');
  await s.close();
});

// ---------- Word Ninja EN ----------
for (const [w, h] of [[1280, 720], [1920, 1080]]) {
  await run(`Word Ninja EN ${w}x${h}: cài đặt, chuẩn bị camera`, async () => {
    const s = await open({ lang: 'en', hash: GAMES.ninja, w, h });
    await s.page.waitForSelector('[data-testid=wn-mode]');
    const t = await s.page.textContent('.setup');
    for (const x of ['How to slice', 'Swipe hands in front of the camera', 'Mouse / touch (no camera)', 'Continue', '1–2 students stand 1.5–2.5 meters from the camera', 'Word groups used in the game:']) assert.ok(t.includes(x), 'thiếu: ' + x);
    assert.deepEqual(await vietnameseIn(s.page, '.setup'), []);
    assert.deepEqual(await overflow(s.page, '.setup'), []);
    await shot(s.page, `hub-i18n-e-ninja-setup-en-${w}`);
    await s.page.click('.setup .btn-primary');
    await s.page.waitForSelector('[data-testid=cam-start]:not([disabled])');
    assert.match(await s.page.textContent('.cam-setup'), /Step back so the camera can see both hands\./);
    assert.deepEqual(await vietnameseIn(s.page, '.cam-setup'), []);
    assert.deepEqual(await overflow(s.page, '.cam-setup'), []);
    assert.deepEqual(await camSideClipped(s.page), [], 'cột bị cắt ngang');
    await shot(s.page, `hub-i18n-e-ninja-camera-en-${w}`);
    assert.deepEqual(noI18nErrors(s.log), []);
    await s.close();
  });
}

await run('Word Ninja: mô tả trong menu EN và tên nút camera', async () => {
  const s = await open({ lang: 'en', hash: '#/' });
  await s.page.waitForSelector('#app .game-card, #app [data-game-id], #app .card');
  const body = await s.page.textContent('#app');
  assert.ok(body.includes('Swipe your hands to slice word cards from the right group. Mouse / touch mode available.'));
  assert.ok(body.includes('Listen to action commands; on a red light, freeze like a statue.'));
  assert.ok(body.includes('Listen to the command and do the right pose: body parts, left/right.'));
  await s.close();
});

// ---------- Lỗi camera (4 loại) EN ----------
const ERRS = [
  ['NotAllowedError', 'The browser is blocking camera access', /Allow/],
  ['NotFoundError', 'No camera found', /Device Manager/],
  ['Whatever', 'Couldn’t open the camera', /Error: Whatever/],
];
for (const [name, title, re] of ERRS) {
  await run(`Lỗi camera ${name} EN`, async () => {
    const s = await open({ lang: 'en', hash: GAMES.statue, init: `window.__camError = ${JSON.stringify(name)};` });
    await s.page.waitForSelector('[data-testid=cam-error]:not([hidden])');
    const t = await text(s.page, '[data-testid=cam-error]');
    assert.ok(t.includes(title), t);
    assert.match(t, re);
    assert.ok(t.includes('Try again'));
    assert.deepEqual(await vietnameseIn(s.page, '.cam-setup'), []);
    assert.deepEqual(await overflow(s.page, '.cam-setup'), []);
    assert.deepEqual(await camSideClipped(s.page), [], 'cột bị cắt ngang');
    await shot(s.page, `hub-i18n-e-camerr-${name}-en`);
    await s.close();
  });
}
await run('Lỗi camera "không hỗ trợ" EN (không có mediaDevices.getUserMedia)', async () => {
  // describeCameraError kiểm navigator.mediaDevices.getUserMedia; xoá sau khi trang dựng để tới nhánh unsupported
  const s = await open({ lang: 'en', hash: GAMES.statue, init: 'window.__camError = "NotAllowedError";' });
  await s.page.waitForSelector('[data-testid=cam-error]:not([hidden])');
  const info = await s.page.evaluate(async () => {
    const m = await import('/src/core/camera.js');
    const gum = navigator.mediaDevices.getUserMedia;
    navigator.mediaDevices.getUserMedia = undefined;
    const r = m.describeCameraError(new Error('x'));
    navigator.mediaDevices.getUserMedia = gum;
    return r;
  });
  assert.equal(info.title, 'This browser doesn’t support the camera');
  assert.ok(info.steps.every((x) => !/[à-ỹ]/i.test(x)), info.steps.join('|'));
  await s.close();
});

await run('Camera bận EN: 1 camera -> bảng 2 cách + chờ; 2 camera -> tự chuyển + ghi chú', async () => {
  const one = await open({ lang: 'en', hash: GAMES.statue, init: 'window.__camError = "NotReadableError";' });
  await one.page.waitForSelector('[data-testid=cam-busy]');
  const t = await text(one.page, '[data-testid=cam-error]');
  for (const x of ['The camera is being used by the ClassIn class (or another app)', 'Waiting for the camera to be free', 'Turn off the camera in your ClassIn class for now', 'Share the camera (one-time IT setup)', 'Download installer for IT', 'Try again now']) assert.ok(t.includes(x), 'thiếu: ' + x);
  assert.deepEqual(await vietnameseIn(one.page, '.cam-setup'), []);
  assert.deepEqual(await overflow(one.page, '.cam-setup'), []);
  assert.deepEqual(await camSideClipped(one.page), []);
  await shot(one.page, 'hub-i18n-e-cambusy-en');
  await one.close();
  const two = await open({
    lang: 'en', hash: GAMES.statue,
    init: 'window.__cams = [{kind:"videoinput",deviceId:"s1",label:"ClassIn Cam S1",groupId:"a"},{kind:"videoinput",deviceId:"b",label:"OBS Virtual Camera",groupId:"b"}]; window.__busyIds = ["s1"];',
  });
  await two.page.waitForSelector('[data-testid=cam-switch]:not([hidden])');
  assert.equal(await text(two.page, '[data-testid=cam-switch]'), 'S1 is being used by the ClassIn class, so the game is using camera “OBS Virtual Camera”.');
  await two.page.waitForSelector('[data-testid=cam-start]:not([disabled])');
  assert.equal(await text(two.page, '[data-testid=cam-count]'), 'Found 2 cameras: ClassIn Cam S1, OBS Virtual Camera.');
  await shot(two.page, 'hub-i18n-e-camswitch-en');
  await two.close();
});

await run('Không thấy camera EN: hộp trợ giúp + "No camera found yet"', async () => {
  const s = await open({ lang: 'en', hash: GAMES.statue, init: 'window.__cams = []; window.__camError = "NotFoundError";' });
  await s.page.waitForSelector('[data-testid=cam-help]:not([hidden])');
  const t = await text(s.page, '[data-testid=cam-help]');
  assert.ok(t.includes('Don’t see ClassIn camera S1 in the list?'), t);
  assert.equal(await text(s.page, '[data-testid=cam-count]'), 'Found 0 cameras.');
  assert.equal(await text(s.page, '[data-testid=cam-select]'), 'No camera found yet');
  assert.deepEqual(await vietnameseIn(s.page, '.cam-setup'), []);
  assert.deepEqual(await overflow(s.page, '.cam-setup'), []);
    assert.deepEqual(await camSideClipped(s.page), [], 'cột bị cắt ngang');
  await shot(s.page, 'hub-i18n-e-camhelp-en');
  await s.close();
});

// ---------- Hướng dẫn ----------
for (const [w, h] of [[1280, 720], [1920, 1080]]) {
  await run(`Hướng dẫn EN ${w}x${h}: 8 bước, Back/Next/Done, không chữ Việt, không tràn`, async () => {
    const s = await open({ lang: 'en', hash: '#/editor', w, h });
    await s.page.waitForSelector('[data-testid=open-guide]');
    await s.page.click('[data-testid=open-guide]');
    await s.page.waitForSelector('.gs-modal .gs-pic');
    assert.equal(await text(s.page, '.gs-modal .modal-title, .gs-modal h2'), 'Create a lesson and open it on the ClassIn display');
    assert.equal(await text(s.page, '[data-testid=guide-prev]'), 'Back');
    assert.equal(await text(s.page, '[data-testid=guide-next]'), 'Next');
    assert.equal(await text(s.page, '[data-testid=guide-tab-steps]'), 'Step by step');
    assert.equal(await s.page.$$eval('.gs-dot', (a) => a.length), 8);
    assert.match(await text(s.page, '.gs-head h3'), /^Step 1/);
    assert.equal(await s.page.getAttribute('.gs-dot[data-i="1"]', 'aria-label'), 'Step 2: Open game');
    for (let i = 0; i < 8; i++) {
      assert.deepEqual(await vietnameseIn(s.page, '.gs-modal'), [], `bước ${i + 1}`);
      assert.deepEqual(await overflow(s.page, '.gs-modal'), [], `bước ${i + 1}`);
      if (i === 0 || i === 5) await shot(s.page, `hub-i18n-e-guide-step${i + 1}-en-${w}`);
      if (i < 7) await s.page.click('[data-testid=guide-next]');
    }
    assert.equal(await text(s.page, '[data-testid=guide-next]'), 'Done');
    assert.equal(await s.page.isDisabled('[data-testid=guide-prev]'), false);
    await s.page.click('[data-testid=guide-next]');
    await s.page.waitForSelector('.gs-modal', { state: 'detached' });
    assert.deepEqual(noI18nErrors(s.log), []);
    await s.close();
  });
}

await run('Hướng dẫn VI: chữ Việt như cũ (Trước/Tiếp/Xong, Bước 1)', async () => {
  const s = await open({ hash: '#/editor' });
  await s.page.waitForSelector('[data-testid=open-guide]');
  await s.page.click('[data-testid=open-guide]');
  await s.page.waitForSelector('.gs-modal .gs-pic');
  assert.equal(await text(s.page, '[data-testid=guide-prev]'), 'Trước');
  assert.equal(await text(s.page, '[data-testid=guide-next]'), 'Tiếp');
  assert.match(await text(s.page, '.gs-head h3'), /^Bước 1Mở Bảng đen/);
  assert.equal(await text(s.page, '.gs-modal .modal-title, .gs-modal h2'), 'Soạn bài và mở trên màn hình ClassIn');
  await shot(s.page, 'hub-i18n-e-guide-step1-vi-1280');
  for (let i = 0; i < 7; i++) await s.page.click('[data-testid=guide-next]');
  assert.equal(await text(s.page, '[data-testid=guide-next]'), 'Xong');
  await s.close();
});

await run('Hướng dẫn: tab video EN có nhãn "Watch video"', async () => {
  const s = await open({ lang: 'en', hash: '#/editor' });
  await s.page.waitForSelector('[data-testid=open-guide]');
  await s.page.click('[data-testid=open-guide]');
  await s.page.waitForSelector('[data-testid=guide-tab-video]');
  assert.equal(await text(s.page, '[data-testid=guide-tab-video]'), 'Watch video');
  await s.close();
});

console.log(results.map((r) => r.join(' ')).join('\n'));
const fail = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - fail}/${results.length} đạt`);
await browser.close();
await srv.close();
process.exit(fail ? 1 : 0);
