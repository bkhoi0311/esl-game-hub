// Test thuần: camera AI tự đổi khung (ClassIn S1) với Statue Freeze. Chạy: node --test tests/reframe.test.mjs. Xem PLAN-S1-REFRAME.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReframeWatch, down4 } from '../src/core/reframe.js';
import { createDetector } from '../src/games/statue-freeze/motion.js';
import { makeCamera, DT } from './helpers/frames-reframe.mjs';
import { sequence } from './helpers/frames.mjs';
import { seqCalMove } from './helpers/frames-calmove.mjs';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const sum = (a) => a.reduce((x, y) => x + y, 0);

function watchEvents(view, actor, seed, flat, ms = 5000) {
  const cam = makeCamera(seed, { flat });
  const w = createReframeWatch();
  let ev = 0;
  for (let t = 0; t < ms; t += DT) if (w.push(down4(cam(t, { view, actor })), t).started) ev++;
  return { ev, st: w.stats(), moving: w.moving };
}

test('R1 phát hiện đổi khung: dời / phóng 1,0->1,6 / cắt sang người khác / trôi chậm, cảnh có vân và tường trơn', () => {
  for (const flat of [false, true]) for (const view of ['pan', 'zoom', 'jump', 'drift', 'breathe']) {
    const hit = SEEDS.filter((s) => watchEvents(view, 'still', s, flat).ev > 0).length;
    assert.ok(hit >= 9, `${view}${flat ? ' (tường trơn)' : ''}: chỉ bắt ${hit}/10`);
  }
});

test('R2 không báo đổi khung khi chỉ có người cử động hoặc đổi sáng', () => {
  for (const flat of [false, true]) for (const actor of ['still', 'wave', 'bigWave', 'walk', 'light', 'crowd']) {
    const fp = SEEDS.filter((s) => watchEvents('none', actor, s, flat).ev > 0).length;
    assert.equal(fp, 0, `${actor}${flat ? ' (tường trơn)' : ''}: báo nhầm ${fp}/10`);
  }
});

test('R3 ổn định lại trong 2 s sau khi camera dừng đổi khung', () => {
  for (const view of ['pan', 'zoom', 'jump']) {
    for (const seed of SEEDS) {
      const r = watchEvents(view, 'still', seed, false);
      assert.equal(r.moving, false, `${view} seed ${seed}: vẫn "đang đổi khung"`);
      assert.ok(r.st.lastSettleMs <= 2000, `${view} seed ${seed}: ổn định sau ${r.st.lastSettleMs} ms`);
    }
  }
});

// Chạy hiệu chỉnh như game: đẩy khung tới khi calReady (tối đa CAL_MAX_MS) rồi finishCalibration.
const CAL_MAX_MS = 9000;
function calibrate(d, cam, view) {
  d.startCalibration(0);
  let t = 0;
  for (; t < CAL_MAX_MS; t += DT) {
    d.push(cam(t, { view }), t);
    if (d.calReady(t)) break;
  }
  return { cal: d.finishCalibration(), t };
}

test('R4 Stand still: camera đổi khung giữa lúc đo thì đo lại, không ô xám; sau đó đứng yên không báo sai', () => {
  for (const flat of [false, true]) for (const view of ['pan', 'zoom', 'jump', 'drift']) {
    let masked = 0; let flags = 0; let restarts = 0;
    for (const seed of SEEDS) {
      const cam = makeCamera(seed, { flat });
      const d = createDetector({ sensitivity: 6 });
      const { cal, t } = calibrate(d, cam, view);
      masked += cal.masked;
      restarts += cal.reframes > 0 ? 1 : 0;
      const t0 = t + 3000;
      d.startRed(t0);
      for (let k = 0; k < 58; k++) d.push(cam(t0 + k * DT, { view, at: -1e9 }), t0 + k * DT);
      flags += sum(Array.from(d.endRed().flagged));
    }
    assert.equal(masked, 0, `${view}${flat ? ' (tường trơn)' : ''}: còn ${masked} ô xám`);
    if (view !== 'drift') assert.ok(restarts >= 9, `${view}: chỉ đo lại ${restarts}/10`);
    if (view !== 'drift') assert.ok(flags <= 2, `${view}${flat ? ' (tường trơn)' : ''}: đứng yên mà báo ${flags} ô`);
  }
});

// Pha Freeze như game: đo RED_MS, kéo dài tối đa EXTEND_MS khi camera đang đổi khung.
const RED_MS = 3900;
const EXTEND_MS = 4000;
function freeze(d, cam, t0, view, actorAfter, at = 1500) {
  d.startRed(t0);
  let end = t0 + RED_MS;
  let extended = 0;
  let t = t0;
  let stableAt = null;
  for (; t < end; t += DT) {
    const rel = t - t0;
    const actor = actorAfter && stableAt != null && t > stableAt + 600 ? actorAfter : 'still';
    d.push(cam(rel, { view, at, actor }), t);
    if (d.reframing && extended < EXTEND_MS) { end += DT; extended += DT; }
    if (!d.reframing && d.stats().rf.events > 0 && stableAt == null) { stableAt = t; end = Math.max(end, Math.min(t0 + RED_MS + EXTEND_MS, t + 2200)); }
  }
  return d.endRed();
}

test('R5 Freeze: camera đổi khung không sinh ô đỏ; cử động thật sau khi ổn định vẫn bắt được', () => {
  for (const flat of [false, true]) for (const view of ['pan', 'zoom', 'jump']) {
    let flags = 0; let det = 0; let interrupted = 0;
    for (const seed of SEEDS) {
      const cam = makeCamera(seed, { flat });
      const d = createDetector({ sensitivity: 6 });
      calibrate(d, cam, 'none');
      const r1 = freeze(d, cam, 4000, view, null);
      flags += sum(Array.from(r1.flagged));
      if (r1.interrupted) interrupted++;
      const cam2 = makeCamera(seed, { flat });
      const d2 = createDetector({ sensitivity: 6 });
      calibrate(d2, cam2, 'none');
      const r2 = freeze(d2, cam2, 4000, view, 'wave');
      if (r2.areas > 0) det++;
    }
    assert.ok(flags <= 2, `${view}${flat ? ' (tường trơn)' : ''}: báo sai ${flags} ô`);
    assert.equal(interrupted, 0, `${view}: ${interrupted} lượt bị coi là gián đoạn dù đã kéo dài`);
    assert.ok(det >= 9, `${view}${flat ? ' (tường trơn)' : ''}: bắt tay sau khi ổn định ${det}/10`);
  }
});

test('R6 Freeze: camera đổi khung suốt lượt => lượt gián đoạn, 0 ô đỏ', () => {
  for (const seed of SEEDS.slice(0, 5)) {
    const cam = makeCamera(seed, {});
    const d = createDetector({ sensitivity: 6 });
    calibrate(d, cam, 'none');
    const r = freeze(d, cam, 4000, 'breathe', null, -1e9);
    assert.equal(r.interrupted, true, `seed ${seed}: phải báo gián đoạn`);
    assert.equal(sum(Array.from(r.flagged)), 0, `seed ${seed}: còn ô đỏ`);
  }
});

test('R7 các chuỗi cũ (C1, C3, C11, C14) không kích hoạt đổi khung', () => {
  for (const seed of SEEDS.slice(0, 5)) {
    for (const seq of [sequence('still', seed), sequence('handInBody', seed), sequence('bigWaveOutside', seed), seqCalMove('none', 'hand', seed, { tv: 1, fan: 1 }), seqCalMove('bowFidget', 'hand', seed)]) {
      const d = createDetector({ sensitivity: 6 });
      d.startCalibration(seq.cal[0].t);
      for (const f of seq.cal) d.push(f.gray, f.t);
      d.finishCalibration();
      d.startRed(seq.redT0);
      for (const f of seq.red) d.push(f.gray, f.t);
      assert.equal(d.stats().rf.events, 0, `seed ${seed}: báo đổi khung nhầm`);
    }
  }
});

test('R8 ?reframe=0 (reframe: false) giữ hành vi cũ', () => {
  const d = createDetector({ sensitivity: 6, reframe: false });
  assert.equal(d.stats().rf, null);
  assert.equal(typeof d.calReady, 'function');
});
