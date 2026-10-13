// Test thuần (node --test) cho Statue Freeze v2: so bản cũ (v1) với bản mới (v2) trên khung hình tổng hợp tất định.
// Chạy: node --test tests/statue-motion.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SF, boxDown2, countAreas, coherent, createDetector, createLegacyDetector, gainBetween, laneAreas, robustLevel,
} from '../src/games/statue-freeze/motion.js';
import { countFlagged, inBox, run, sequence, targetBox } from './helpers/frames.mjs';
import { seqCalMove } from './helpers/frames-calmove.mjs';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const cache = new Map();
const seqOf = (kind, seed, opts) => {
  const key = `${kind}|${seed}|${JSON.stringify(opts || {})}`;
  if (!cache.has(key)) cache.set(key, sequence(kind, seed, opts));
  return cache.get(key);
};
const table = [];

// Chạy cả hai bản trên cùng 10 chuỗi. detected = có ô cờ trong hộp mục tiêu.
function evaluate(kind, { s = 6, opts, label = kind } = {}) {
  const out = { v1: { det: 0, flags: 0, areas: [] }, v2: { det: 0, flags: 0, areas: [] }, res: { v1: [], v2: [] } };
  for (const seed of SEEDS) {
    const seq = seqOf(kind, seed, opts);
    const box = targetBox(kind);
    for (const [name, make] of [['v1', createLegacyDetector], ['v2', createDetector]]) {
      const res = run(make({ sensitivity: s }), seq, { sensitivity: s });
      out[name].flags += countFlagged(res);
      out[name].areas.push(res.areas);
      out.res[name].push(res);
      if (box ? inBox(res, box) > 0 : res.areas > 0) out[name].det++;
    }
  }
  table.push({ ca: label, s, 'v1 bắt': `${out.v1.det}/10`, 'v2 bắt': `${out.v2.det}/10`, 'v1 ô cờ': out.v1.flags, 'v2 ô cờ': out.v2.flags });
  return out;
}

test('C1 still: chỉ có nhiễu, v2 không báo sai (s=6 và s=10)', () => {
  const a = evaluate('still', { s: 6 });
  assert.ok(a.v2.flags <= 1, `v2 s=6 báo sai ${a.v2.flags} ô`);
  const b = evaluate('still', { s: 10, label: 'still' });
  assert.ok(b.v2.flags <= 2, `v2 s=10 báo sai ${b.v2.flags} ô`);
});

test('C2 aeRamp: tăng sáng 15% giữa pha đo không gây báo sai', () => {
  const a = evaluate('aeRamp');
  a.res.v2.forEach((r, i) => assert.ok(countFlagged(r) <= 1, `seed ${i + 1}: ${countFlagged(r)} ô`));
});

test('C3 handInBody: bàn tay (tương phản 25) cử động trước thân áo', () => {
  const a = evaluate('handInBody');
  assert.ok(a.v2.det >= 9, `v2 bắt ${a.v2.det}/10`);
  assert.ok(a.v2.det - a.v1.det >= 5, `v2 ${a.v2.det} so với v1 ${a.v1.det}`);
});

test('C4 sleeveSwing: ống tay áo tương phản 8 lắc', () => {
  const a = evaluate('sleeveSwing');
  assert.ok(a.v2.det >= 7, `v2 bắt ${a.v2.det}/10`);
  assert.ok(a.v1.det <= 2, `v1 bắt ${a.v1.det}/10 (dự kiến <= 2)`);
});

test('C5 slowDrift: dời rất chậm 12 px, nhờ so với ảnh mốc', () => {
  const a = evaluate('slowDrift');
  assert.ok(a.v2.det >= 8, `v2 bắt ${a.v2.det}/10`);
});

test('C6 dupFrames: camera 7,5 fps (mỗi khung lặp 2 lần)', () => {
  const a = evaluate('dupFrames');
  assert.ok(a.v2.det >= 8, `v2 bắt ${a.v2.det}/10`);
});

test('C7 fidget: lúc hiệu chỉnh có bạn còn cử động (30% khung), v2 vẫn bắt tay', () => {
  const o = { fidget: 0.3 };
  let det = 0;
  let flagsStill = 0;
  for (const seed of SEEDS) {
    const box = targetBox('handInBody');
    const res = run(createDetector({ sensitivity: 6 }), seqOf('handInBody', seed, o));
    if (inBox(res, box) > 0) det++;
    flagsStill += countFlagged(run(createDetector({ sensitivity: 6 }), seqOf('still', seed, o)));
  }
  table.push({ ca: 'fidget 0.3', s: 6, 'v1 bắt': '-', 'v2 bắt': `${det}/10`, 'v1 ô cờ': '-', 'v2 ô cờ': `${flagsStill} (đứng yên)` });
  assert.ok(det >= 8, `v2 bắt ${det}/10`);
  assert.ok(flagsStill <= 3, `fidget rồi đứng yên: báo sai ${flagsStill} ô`);
});

test('C8 leftOnly: chỉ người trái cử động => làn [>=1, 0]', () => {
  const a = evaluate('leftOnly');
  let ok = 0;
  a.res.v2.forEach((r) => { if (r.lanes[0] >= 1 && r.lanes[1] === 0) ok++; });
  assert.ok(ok >= 9, `đúng làn ${ok}/10`);
});

test('C9 độ nhạy đơn điệu trên C4; s=1 vẫn bắt cánh tay vẫy lớn', () => {
  const total = (s) => SEEDS.reduce((acc, seed) => acc + countFlagged(run(createDetector({ sensitivity: s }), seqOf('sleeveSwing', seed), { sensitivity: s })), 0);
  const t3 = total(3);
  const t6 = total(6);
  const t9 = total(9);
  table.push({ ca: 'sleeve: tổng ô cờ', s: '3/6/9', 'v1 bắt': '-', 'v2 bắt': '-', 'v1 ô cờ': '-', 'v2 ô cờ': `${t3}/${t6}/${t9}` });
  assert.ok(t9 >= t6 && t6 >= t3, `không đơn điệu: ${t3} ${t6} ${t9}`);
  const big = evaluate('bigWaveOutside', { s: 1, label: 'bigWaveOutside' });
  assert.equal(big.v2.det, 10, `s=1 bắt ${big.v2.det}/10`);
});

test('C10 salt: điểm ảnh lẻ ngẫu nhiên không thành ô', () => {
  const a = evaluate('salt');
  assert.equal(a.v2.flags, 0, `v2 báo ${a.v2.flags} ô`);
});

test('C11 bigWaveOutside: cánh tay quét qua nền, không thụt lùi', () => {
  const a = evaluate('bigWaveOutside');
  assert.equal(a.v1.det, 10, `v1 ${a.v1.det}/10`);
  assert.equal(a.v2.det, 10, `v2 ${a.v2.det}/10`);
});

// ---------- C12–C14: người cử động lúc hiệu chỉnh không bị tô xám; TV/quạt vẫn xám (PLAN-STATUE-FIX.md) ----------
const leftMaskedCells = (d) => { let n = 0; for (let i = 0; i < 144; i++) if (d.masked[i] && i % 16 < 8) n++; return n; };

test('C12 cúi đầu rồi giữ / lắc người lúc hiệu chỉnh: làn trái không xám nặng, vẫn bắt tay ở pha đỏ', () => {
  for (const calKind of ['bowHold', 'bowFidget', 'sway', 'lookDown']) {
    let det = 0;
    let maxMasked = 0;
    for (const seed of SEEDS) {
      const d = createDetector({ sensitivity: 6 });
      const res = run(d, seqCalMove(calKind, 'hand', seed), { sensitivity: 6 });
      maxMasked = Math.max(maxMasked, leftMaskedCells(d));
      if (res.lanes[0] >= 1) det++;
    }
    table.push({ ca: `cal ${calKind} → hand`, s: 6, 'v1 bắt': '-', 'v2 bắt': `${det}/10`, 'v1 ô cờ': '-', 'v2 ô cờ': `xám trái max ${maxMasked}` });
    assert.ok(maxMasked <= 2, `${calKind}: làn trái còn ${maxMasked} ô xám`);
    assert.ok(det >= 9, `${calKind}: bắt ${det}/10`);
  }
});

test('C13 cử động lúc hiệu chỉnh rồi đứng yên: không báo sai', () => {
  for (const calKind of ['bowHold', 'bowFidget', 'sway']) {
    let flags = 0;
    for (const seed of SEEDS) flags += countFlagged(run(createDetector({ sensitivity: 6 }), seqCalMove(calKind, 'still', seed), { sensitivity: 6 }));
    assert.ok(flags <= 1, `${calKind}: báo sai ${flags} ô`);
  }
});

test('C14 TV + quạt: vẫn tô xám, không báo sai, người vẫn bắt được', () => {
  let flagsStill = 0;
  let det = 0;
  for (const seed of SEEDS) {
    const d = createDetector({ sensitivity: 6 });
    const r1 = run(d, seqCalMove('none', 'still', seed, { tv: 1, fan: 1 }), { sensitivity: 6 });
    assert.ok(r1.cal.masked >= 8, `seed ${seed}: chỉ ${r1.cal.masked} ô xám`);
    flagsStill += countFlagged(r1);
    const r2 = run(createDetector({ sensitivity: 6 }), seqCalMove('none', 'hand', seed, { tv: 1, fan: 1 }), { sensitivity: 6 });
    if (r2.lanes[0] >= 1) det++;
  }
  assert.ok(flagsStill <= 3, `TV/quạt báo sai ${flagsStill} ô`);
  assert.ok(det >= 9, `bắt ${det}/10`);
});

test('Bảng so sánh v1 và v2', () => {
  console.table(table);
  assert.ok(table.length > 0);
});

// ---------- Hàm đơn vị ----------
test('boxDown2: ảnh 4x2 biết trước', () => {
  const out = boxDown2(Uint8Array.from([10, 20, 30, 40, 30, 40, 50, 60]), 4, 2);
  assert.deepEqual(Array.from(out), [25, 45]);
});

test('robustLevel: một giá trị ngoại lai không kéo mức nhiễu lên', () => {
  assert.ok(robustLevel([0, 0, 0, 0, 50]) < 5);
  assert.ok(robustLevel([3, 4, 3, 4, 3]) >= 3);
});

test('countAreas / laneAreas', () => {
  const cols = 16;
  const rows = 9;
  const cells = new Uint8Array(cols * rows);
  [[1, 1], [2, 1], [12, 5], [13, 5], [13, 6]].forEach(([c, r]) => { cells[r * cols + c] = 1; });
  assert.equal(countAreas(cells, cols, rows), 2);
  assert.deepEqual(laneAreas(cells, cols, rows, 2), [1, 1]);
  assert.deepEqual(laneAreas(cells, cols, rows, 1), [2]);
  cells[1 * cols + 8] = 1; // chéo không nối
  assert.equal(countAreas(cells, cols, rows), 3);
});

test('gainBetween: ảnh x1,1 => ~0,909; kẹp [0,75; 1,33]', () => {
  const w = 256;
  const h = 144;
  const ref = new Uint8Array(w * h).fill(100);
  const cur = new Uint8Array(w * h).fill(110);
  assert.ok(Math.abs(gainBetween(ref, cur, w, h) - 100 / 110) < 0.01);
  assert.equal(gainBetween(ref, new Uint8Array(w * h).fill(250), w, h), SF.GAIN_MIN);
  assert.equal(gainBetween(ref, new Uint8Array(w * h).fill(20), w, h), SF.GAIN_MAX);
});

test('coherent: khối đơn lẻ bị loại, cụm hai khối giữ lại', () => {
  const bx = 8;
  const by = 4;
  const counts = new Uint16Array(bx * by);
  const thr = new Uint16Array(bx * by).fill(6);
  counts[1 * bx + 1] = 8; // đơn lẻ: >= ngưỡng nhưng < 2*ngưỡng, không có láng giềng
  const a = coherent(counts, thr, null, bx, by);
  assert.equal(a[1 * bx + 1], 0);
  counts[1 * bx + 2] = 3; // láng giềng đạt nửa ngưỡng
  assert.equal(coherent(counts, thr, null, bx, by)[1 * bx + 1], 1);
  counts[3 * bx + 6] = 12; // gấp đôi ngưỡng: giữ dù đơn lẻ
  assert.equal(coherent(counts, thr, null, bx, by)[3 * bx + 6], 1);
});
