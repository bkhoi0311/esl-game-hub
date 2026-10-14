// Test thuần: Simon Says Pose khi camera AI (S1) tự đổi khung: ngưỡng tư thế theo vai, bộ theo dõi giữ Player. PLAN-S1-REFRAME.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POSES } from '../src/games/simon-pose/poses.js';
import { createPoseTracker } from '../src/core/pose-tracker.js';

// Khung xương 33 điểm (x ảnh gốc, chưa gương): vai rộng sw, tâm cx, đỉnh đầu top. pose: left-hand | right-hand | hands-up | t-pose | hands-on-head | touch-nose | none
export function body(cx, top, sw, pose = 'none') {
  const P = Array.from({ length: 33 }, () => ({ x: cx, y: top, visibility: 0.9 }));
  const set = (i, x, y) => (P[i] = { x, y, visibility: 0.95 });
  const sy = top + 0.9 * sw; const hy = sy + 1.6 * sw; const ky = hy + 1.2 * sw; const ay = ky + 1.2 * sw;
  const ny = top + 0.3 * sw;
  set(0, cx, ny);
  set(11, cx + sw / 2, sy); set(12, cx - sw / 2, sy);
  set(23, cx + sw * 0.35, hy); set(24, cx - sw * 0.35, hy);
  set(25, cx + sw * 0.35, ky); set(26, cx - sw * 0.35, ky); set(27, cx + sw * 0.35, ay); set(28, cx - sw * 0.35, ay);
  const arm = (side, kind) => {
    const e = side > 0 ? 13 : 14; const w = side > 0 ? 15 : 16; const sx = P[side > 0 ? 11 : 12].x;
    if (kind === 'up') { set(e, sx + side * 0.2 * sw, sy - 0.8 * sw); set(w, sx + side * 0.25 * sw, sy - 2.0 * sw); }
    else if (kind === 'side') { set(e, sx + side * 0.8 * sw, sy); set(w, sx + side * 1.6 * sw, sy + 0.05 * sw); }
    else if (kind === 'head') { set(e, sx + side * 0.5 * sw, sy - 0.3 * sw); set(w, cx + side * 0.6 * sw, ny - 0.6 * sw); }
    else if (kind === 'nose') { set(e, sx + side * 0.1 * sw, sy + 0.4 * sw); set(w, cx + side * 0.15 * sw, ny + 0.1 * sw); }
    else { set(e, sx + side * 0.1 * sw, sy + 0.9 * sw); set(w, sx + side * 0.1 * sw, sy + 1.7 * sw); }
  };
  const L = { 'left-hand': 'up', 'hands-up': 'up', 't-pose': 'side', 'hands-on-head': 'head', 'touch-nose': 'nose' }[pose] || 'down';
  const R = { 'right-hand': 'up', 'hands-up': 'up', 't-pose': 'side', 'hands-on-head': 'head' }[pose] || 'down';
  arm(1, L); arm(-1, R);
  return P;
}
export const zoom = (lm, s, cx = 0.5, cy = 0.5) => lm.map((p) => ({ ...p, x: cx + (p.x - cx) * s, y: cy + (p.y - cy) * s }));
const pan = (lm, dx) => lm.map((p) => ({ ...p, x: p.x + dx }));

test('S1 tư thế Simon cho cùng kết quả ở zoom 0,6 / 1,0 / 1,6 (ngưỡng theo bề rộng vai)', () => {
  for (const pose of ['left-hand', 'right-hand', 'hands-up', 't-pose', 'hands-on-head', 'touch-nose', 'none']) {
    const lm = body(0.5, 0.15, 0.08, pose);
    const ref = POSES.map((p) => p.check(lm));
    for (const s of [0.6, 1.6]) assert.deepEqual(POSES.map((p) => p.check(zoom(lm, s))), ref, `${pose} @${s}`);
    if (pose !== 'none') assert.ok(ref[POSES.findIndex((p) => p.id === pose)], `${pose} phải khớp ở zoom 1`);
  }
});

test('S2 camera dời 25% khi đang giữ (hold) rồi ghép lại: giữ đúng Player 1/2', () => {
  const tr = createPoseTracker({ maxPlayers: 2, zone: [0.15, 0.85] });
  const A = body(0.38, 0.15, 0.085); const B = body(0.62, 0.15, 0.085);
  const ids0 = tr.update([A, B], 0).players.map((p) => p.id);
  tr.hold(true);
  for (let t = 100; t < 2500; t += 100) tr.update([pan(A, 0.25), pan(B, 0.25)], t); // quá lostMs mà không mất chỗ
  tr.reanchor(null);
  const r = tr.update([pan(A, 0.25), pan(B, 0.25)], 2600);
  assert.deepEqual(r.players.map((p) => p && p.id), ids0);
  assert.ok(r.players.every((p) => p.fresh));
});

test('S3 camera phóng 1,6 (S1 zoom) rồi ghép lại: giữ đúng thứ tự; ghép theo phép biến đổi khi có tf', () => {
  const tr = createPoseTracker({ maxPlayers: 2, zone: [0, 1] });
  const A = body(0.4, 0.2, 0.07); const B = body(0.6, 0.2, 0.07);
  const ids0 = tr.update([A, B], 0).players.map((p) => p.id);
  tr.hold(true);
  tr.update([], 300);
  tr.reanchor(null);
  assert.deepEqual(tr.update([zoom(A, 1.6), zoom(B, 1.6)], 1500).players.map((p) => p && p.id), ids0);
  // chỉ thấy B sau khi phóng, có tf: B về đúng chỗ của B
  const tr2 = createPoseTracker({ maxPlayers: 2, zone: [0, 1] });
  const first = tr2.update([A, B], 0).players;
  const bSlot = first.findIndex((p) => Math.abs(p.cx - 0.6) < 0.01); // chỗ của B (Player theo thứ tự gương)
  tr2.hold(true);
  tr2.reanchor({ k: 0.6, dx: 0, dy: 0 });
  const r = tr2.update([zoom(B, 1.6)], 1500).players;
  assert.equal(r[bSlot].id, first[bSlot].id);
  assert.equal(r[bSlot].fresh, true, 'B phải được ghép lại đúng chỗ của B');
  assert.equal(r[1 - bSlot].fresh, false, 'A ngoài khung: giữ chỗ, không chấm');
});

test('S4 camera thu nhỏ (vai 0,05 -> 0,035): người đang chơi không bị loại; người mới nhỏ vẫn không được nhận', () => {
  const tr = createPoseTracker({ maxPlayers: 2, zone: [0, 1] });
  const A = body(0.4, 0.2, 0.055);
  const id = tr.update([A], 0).players[0].id;
  const r = tr.update([zoom(A, 0.65), body(0.8, 0.3, 0.036)], 100);
  assert.equal(r.players[0] && r.players[0].id, id);
  assert.equal(r.players[1], null);
});

test('S5 mất chân chớp nhoáng (< 800 ms) không bật tip "Step back"', () => {
  const tr = createPoseTracker({ maxPlayers: 1, zone: [0, 1] });
  const A = body(0.5, 0.1, 0.06);
  tr.update([A], 0);
  const noLegs = A.map((p, i) => ([25, 26, 27, 28].includes(i) ? { ...p, visibility: 0.1 } : p));
  assert.equal(tr.update([noLegs], 300).players[0].legs, true);
  assert.equal(tr.update([noLegs], 1200).players[0].legs, false);
  assert.equal(tr.update([A], 1300).players[0].legs, true);
});
