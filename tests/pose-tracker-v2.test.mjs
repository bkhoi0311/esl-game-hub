// Test thuần: pose-tracker v2 (khử trùng lặp, ghép tối ưu, khoá người chơi, chặn nhảy, One Euro). PLAN-SIMON-FIX.md phần 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPoseTracker, dedupePeople } from '../src/core/pose-tracker.js';

function body(cx, top, sw, pose = 'none') {
  const P = Array.from({ length: 33 }, () => ({ x: cx, y: top, visibility: 0.9 }));
  const set = (i, x, y) => (P[i] = { x, y, visibility: 0.95 });
  const sy = top + 0.9 * sw; const hy = sy + 1.6 * sw; const ky = hy + 1.2 * sw; const ay = ky + 1.2 * sw;
  set(0, cx, top + 0.3 * sw);
  set(11, cx + sw / 2, sy); set(12, cx - sw / 2, sy);
  set(23, cx + sw * 0.35, hy); set(24, cx - sw * 0.35, hy);
  set(25, cx + sw * 0.35, ky); set(26, cx - sw * 0.35, ky); set(27, cx + sw * 0.35, ay); set(28, cx - sw * 0.35, ay);
  const up = pose === 'hands-up';
  set(13, cx + sw / 2, up ? sy - 0.8 * sw : sy + 0.9 * sw); set(15, cx + sw / 2, up ? sy - 2 * sw : sy + 1.7 * sw);
  set(14, cx - sw / 2, sy + 0.9 * sw); set(16, cx - sw / 2, sy + 1.7 * sw);
  return P;
}
const shift = (lm, dx, dy = 0, s = 1) => { const cx = lm[0].x, cy = lm[0].y; return lm.map((p) => ({ ...p, x: cx + (p.x - cx) * s + dx, y: cy + (p.y - cy) * s + dy })); };
const ctr = (lm) => (lm[11].x + lm[12].x) / 2;
const SIMON = { confirmFrames: 5, exclusionK: 1.3, jumpK: 0.6, filter: 'euro', lostMs: 2000 };
const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('dedupePeople: bản trùng gộp, hai người thật không gộp', () => {
  const r = body(0.5, 0.15, 0.08);
  assert.equal(dedupePeople([r, shift(r, 0.024, 0.01, 0.9)]).list.length, 1, 'trùng 0,3 vai');
  const r2 = r.map((p, i) => (i === 15 ? { ...p, y: p.y - 0.1 } : p));
  assert.equal(dedupePeople([r, r2]).list.length, 1, 'chỉ khác tay');
  assert.equal(dedupePeople([body(0.46, 0.15, 0.08), body(0.54, 0.16, 0.078)]).list.length, 2, 'chạm vai (tâm 1 vai)');
  assert.equal(dedupePeople([body(0.5, 0.15, 0.08), body(0.5 + 0.072, 0.2, 0.08)]).list.length, 2, 'cạnh nhau 0,9 vai');
  assert.equal(dedupePeople([body(0.5, 0.15, 0.08), body(0.5, 0.2, 0.032)]).list.length, 2, 'người đứng sau cỡ 0,4');
});

function run(opts, maxPlayers, N, gen) {
  const tr = createPoseTracker({ maxPlayers, zone: [0, 1], ...opts });
  const owner = []; const seenIds = new Set(); const seen = new Set();
  let hops = 0; let extra = 0; let slide = 0; let minOcc = 99; let occAt = [];
  for (let k = 0; k < N; k++) {
    const { dets, truth } = gen(k);
    const r = tr.update(dets, k * 50);
    const occ = r.players.filter(Boolean).length;
    occAt.push(occ);
    if (occ > truth.length) extra++;
    r.players.forEach((p, i) => {
      if (!p) { owner[i] = undefined; return; }
      seen.add(i); seenIds.add(p.id);
      if (!p.fresh) return;
      const c = ctr(p.lm);
      const who = truth.reduce((b, t, j) => (Math.abs(t - c) < Math.abs(truth[b] - c) ? j : b), 0);
      if (Math.abs(truth[who] - c) / 0.08 > 0.3) slide++;
      if (owner[i] !== undefined && owner[i] !== who) hops++;
      owner[i] = who;
    });
  }
  return { extra, hops, slide, seen: seen.size, ids: seenIds.size, occAt, tr };
}
const jitter = (rnd) => (lm, a) => lm.map((p) => ({ ...p, x: p.x + (rnd() - 0.5) * a, y: p.y + (rnd() - 0.5) * a }));

test('1 người + bản trùng: không bao giờ có Player thừa, bảng điểm 1 ô', () => {
  { // B: 1 khung trùng duy nhất
    const rnd = rng(7); const jit = jitter(rnd);
    const s = run(SIMON, 3, 200, (k) => { const r = jit(body(0.5, 0.15, 0.08), 0.004); return { dets: k === 60 ? [r, shift(r, 0.025, 0.01, 0.9)] : [r], truth: [0.5] }; });
    assert.equal(s.extra, 0, 'B thừa'); assert.equal(s.seen, 1); assert.ok(s.slide <= 5);
  }
  { // D: trùng 40% + đảo thứ tự
    const rnd = rng(7); const jit = jitter(rnd);
    const s = run(SIMON, 3, 200, () => { const r = jit(body(0.5, 0.15, 0.08), 0.004); if (rnd() < 0.4) { const d = shift(r, 0.03, 0.01, 0.9); return { dets: rnd() < 0.5 ? [r, d] : [d, r], truth: [0.5] }; } return { dets: [r], truth: [0.5] }; });
    assert.equal(s.extra, 0, 'D thừa'); assert.equal(s.seen, 1); assert.ok(s.slide <= 5, `D lệch ${s.slide}`);
  }
  { // E: trùng lệch 0,8 vai
    const rnd = rng(7); const jit = jitter(rnd);
    const s = run(SIMON, 3, 200, () => { const r = jit(body(0.5, 0.15, 0.08), 0.004); return { dets: rnd() < 0.3 ? [shift(r, 0.065, 0.03, 0.85), r] : [r], truth: [0.5] }; });
    assert.equal(s.extra, 0, 'E thừa'); assert.equal(s.seen, 1); assert.ok(s.slide <= 5, `E lệch ${s.slide}`);
  }
  { // H: trùng 30% + bản chính mất 10%
    const rnd = rng(7); const jit = jitter(rnd);
    const s = run(SIMON, 3, 200, () => { const A = jit(body(0.5, 0.15, 0.08), 0.004); const d = shift(A, 0.06, 0.02, 0.88); const dup = rnd() < 0.3; const lost = rnd() < 0.1; return { dets: lost ? (dup ? [d] : []) : dup ? [A, d] : [A], truth: [0.5] }; });
    assert.equal(s.extra, 0, 'H thừa'); assert.equal(s.seen, 1); assert.equal(s.ids, 1, 'id ổn định'); assert.ok(s.slide <= 5, `H lệch ${s.slide}`);
  }
});

test('G: hai người sát, A mất 3 khung: ô không đổi chủ', () => {
  const rnd = rng(7); const jit = jitter(rnd);
  const s = run(SIMON, 2, 200, (k) => {
    const A = jit(body(0.42, 0.15, 0.08), 0.004); const B = jit(body(0.58, 0.15, 0.08), 0.004);
    const l = k % 40 >= 20 && k % 40 < 23;
    return { dets: l ? [B, shift(B, -0.07, 0.01, 0.9)] : [A, B], truth: [0.42, 0.58] };
  });
  assert.equal(s.hops, 0); assert.equal(s.extra, 0);
});

test('J: hai người chạm vai không bị gộp; K: 3 người vào lần lượt', () => {
  const rnd = rng(7); const jit = jitter(rnd);
  const j = run(SIMON, 3, 200, () => ({ dets: [jit(body(0.46, 0.15, 0.08), 0.004), jit(body(0.54, 0.16, 0.078), 0.004)], truth: [0.46, 0.54] }));
  assert.ok(j.occAt.slice(5).every((o) => o === 2), 'luôn đủ 2 từ khung thứ 5');
  const k = run(SIMON, 3, 200, (f) => { const t = [0.3, 0.5, 0.7].slice(0, 1 + Math.floor(f / 60)); return { dets: t.map((x) => jit(body(x, 0.15, 0.07), 0.004)), truth: t }; });
  assert.equal(k.occAt[139], 3); assert.equal(k.extra, 0);
});

test('lockJoins: người mới không được chỗ khi khoá, vào sau <= 5 khung khi mở', () => {
  const tr = createPoseTracker({ maxPlayers: 3, ...SIMON });
  const A = body(0.3, 0.15, 0.08); const B = body(0.7, 0.15, 0.08);
  for (let k = 0; k < 10; k++) tr.update([A], k * 50);
  tr.lockJoins(true);
  let r;
  for (let k = 10; k < 50; k++) r = tr.update([A, B], k * 50);
  assert.equal(r.players.filter(Boolean).length, 1);
  tr.lockJoins(false);
  let n = 0;
  for (let k = 50; k < 60; k++) { r = tr.update([A, B], k * 50); n++; if (r.players.filter(Boolean).length === 2) break; }
  assert.ok(n <= 5, `vào sau ${n} khung`);
  // giữ chỗ 2 s khi mất
  tr.lockJoins(true);
  for (let k = 60; k < 100; k++) r = tr.update([A], k * 50); // B vắng 2 s
  assert.ok(r.players.filter(Boolean).length >= 1);
});

test('jumpK: 1 khung lệch 1 vai thì giữ nguyên, 2 khung liền thì snap', () => {
  const tr = createPoseTracker({ maxPlayers: 1, ...SIMON });
  const A = body(0.5, 0.15, 0.08);
  let r;
  for (let k = 0; k < 10; k++) r = tr.update([A], k * 50);
  r = tr.update([shift(A, 0.08)], 500); // lệch đúng 1 vai (0,08)
  assert.ok(Math.abs(ctr(r.players[0].lm) - 0.5) < 0.01, 'giữ nguyên');
  r = tr.update([shift(A, 0.08)], 550);
  assert.ok(Math.abs(ctr(r.players[0].lm) - 0.58) < 0.005, 'snap');
});

test('mất lâu: stale = true, id không đổi khi quay lại', () => {
  const tr = createPoseTracker({ maxPlayers: 1, ...SIMON });
  const A = body(0.5, 0.15, 0.08);
  let r;
  for (let k = 0; k < 10; k++) r = tr.update([A], k * 50);
  const id = r.players[0].id;
  assert.equal(r.players[0].stale, false);
  for (let k = 10; k < 20; k++) r = tr.update([], k * 50);
  assert.equal(r.players[0].fresh, false); assert.equal(r.players[0].stale, true);
  r = tr.update([A], 1000);
  assert.equal(r.players[0].id, id); assert.equal(r.players[0].stale, false);
});

test('One Euro: giảm rung >= 40%, bước giơ tay đạt 90% <= 150 ms ở 20 Hz', () => {
  const rnd = rng(3); const jit = jitter(rnd);
  const feed = (opts) => {
    const tr = createPoseTracker({ maxPlayers: 1, ...opts });
    let prev = null; let maxJ = 0; let k = 0; let r;
    for (; k < 40; k++) { r = tr.update([jit(body(0.5, 0.15, 0.08), 0.01)], k * 50).players[0]; if (r && k > 10) { if (prev != null) maxJ = Math.max(maxJ, Math.abs(r.lm[15].y - prev)); prev = r.lm[15].y; } }
    const down = body(0.5, 0.15, 0.08)[15].y; const up = body(0.5, 0.15, 0.08, 'hands-up')[15].y; let t90 = null;
    for (let j = 0; j < 30; j++, k++) { r = tr.update([jit(body(0.5, 0.15, 0.08, "hands-up"), 0.01)], k * 50).players[0]; if (t90 == null && (down - r.lm[15].y) / (down - up) >= 0.9) t90 = (j + 1) * 50; }
    return { jitter: maxJ, t90 };
  };
  const ema = feed({}); const eu = feed({ filter: 'euro' });
  assert.ok(eu.jitter <= ema.jitter * 0.6, `rung euro ${eu.jitter} vs ema ${ema.jitter}`);
  assert.ok(eu.t90 != null && eu.t90 <= 150, `t90 ${eu.t90}`);
});
