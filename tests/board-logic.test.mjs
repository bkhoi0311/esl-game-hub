// Test logic thuần của "Bảng nhiều người viết" (không cần trình duyệt). Chạy: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPalmFilter, parsePalmMode, isHugePalm, PALM_MIN } from '../public/board/js/palm.js';
import { computeZones, calcScale, topHeight, zoneAt, parseZones, GAP } from '../public/board/js/layout.js';
import {
  createBoard, setZoneRects, toZoneUnits, zoneScale, beginStroke, addPoint, addPointSplit, endStroke,
  eraseAt, newEraseSession, commitErase, clearZone, undo, pushAction, distPointSeg, MAX_UNDO, MAX_PTS, MAX_STROKES, zoneFull,
} from '../public/board/js/strokes.js';

const sumW = (zs) => zs.reduce((a, z) => a + z.w, 0) + (zs.length - 1) * GAP;
const sumH = (zs) => zs.reduce((a, z) => a + z.h, 0) + (zs.length - 1) * GAP;

test('U1: computeZones cột khi W>=H, hàng khi W<H, tổng + khe = kích thước', () => {
  for (let n = 1; n <= 4; n++) {
    const top = topHeight(calcScale(1280, 720));
    const zs = computeZones(1280, 720, n, top);
    assert.equal(zs.length, n);
    assert.equal(sumW(zs), 1280);
    assert.ok(zs.every((z) => z.y === top && z.h === 720 - top));
    assert.deepEqual(zs.map((z) => z.id), Array.from({ length: n }, (_, i) => i + 1));
    for (let i = 1; i < n; i++) assert.equal(zs[i].x, zs[i - 1].x + zs[i - 1].w + GAP);
  }
  const top = topHeight(calcScale(720, 1280));
  const col = computeZones(720, 1280, 4, top);
  assert.equal(sumH(col), 1280 - top);
  assert.ok(col.every((z) => z.w === 720 && z.x === 0));
  assert.equal(col[0].y, top);
  const z960 = computeZones(960, 540, 4, topHeight(calcScale(960, 540)));
  assert.equal(sumW(z960), 960);
  assert.ok(z960.every((z) => z.w >= 238), 'vùng 4 cột ở 960 >= 238: ' + z960.map((z) => z.w));
  // hệ số tỉ lệ
  assert.equal(calcScale(1280, 720), 1);
  assert.equal(calcScale(1920, 1080), 1.5);
  assert.equal(calcScale(960, 540), 0.92);
  assert.equal(calcScale(3840, 2160), 1.5);
  assert.equal(parseZones('9'), 2);
  assert.equal(parseZones('3'), 3);
  assert.equal(parseZones(null), 2);
});

test('zoneAt: trong vùng, trong khe, ngoài vùng', () => {
  const zs = computeZones(1280, 720, 2, 56);
  assert.equal(zoneAt(zs, 10, 100).id, 1);
  assert.equal(zoneAt(zs, 1270, 100).id, 2);
  assert.equal(zoneAt(zs, zs[0].w + 0.4, 100).id, 1);
  assert.equal(zoneAt(zs, zs[1].x - 0.4, 100).id, 2);
  assert.equal(zoneAt(zs, -50, 900).id, 1);
});

function mkZone(h = 664) {
  const b = createBoard(2);
  setZoneRects(b, [{ id: 1, x: 0, y: 56, w: 639, h }, { id: 2, x: 641, y: 56, w: 639, h }]);
  return b.zones[0];
}

test('đổi đơn vị: 1 đơn vị = h/1000 px', () => {
  const z = mkZone(664);
  assert.equal(zoneScale(z), 0.664);
  const [ux, uy] = toZoneUnits(z, 66.4, 56 + 66.4);
  assert.ok(Math.abs(ux - 100) < 1e-9 && Math.abs(uy - 100) < 1e-9);
});

test('U2: addPoint lọc điểm sát nhau; 1500 điểm tách nét', () => {
  const z = mkZone();
  const s = beginStroke(z, {});
  assert.equal(addPoint(s, 0, 0, 0.5), true);
  assert.equal(addPoint(s, 0.3, 0.3, 0.5), false, 'cách < 0.6 bị bỏ');
  assert.equal(addPoint(s, 5, 0, 0.5), true);
  assert.equal(s.pts.length / 3, 2);
  assert.deepEqual(s.bbox, { minX: 0, minY: 0, maxX: 5, maxY: 0 });
  // tách nét
  let cur = beginStroke(z, {});
  let finished = [];
  for (let i = 0; i < 3200; i++) {
    const r = addPointSplit(z, cur, i * 2, 0, 0.5, false);
    cur = r.stroke;
    if (r.finished) finished.push(r.finished);
  }
  assert.equal(finished.length, 2);
  assert.ok(finished.every((f) => f.pts.length / 3 === MAX_PTS));
  // nét mới nối tiếp từ điểm cuối của nét trước
  const last = finished[0].pts.slice(-3);
  assert.deepEqual(finished[1].pts.slice(0, 3), last);
  assert.equal(z.strokes.length, 2);
  // áp lực thật chỉ khi pen và giá trị lạ
  const p = beginStroke(z, {});
  addPoint(p, 0, 0, 0.5, true); addPoint(p, 5, 0, 1, true);
  assert.equal(p.realPressure, false);
  addPoint(p, 10, 0, 0.37, true);
  assert.equal(p.realPressure, true);
  const f = beginStroke(z, {});
  addPoint(f, 0, 0, 0.37, false);
  assert.equal(f.realPressure, false, 'touch không tính');
});

function draw(z, pts, opts = {}) {
  const s = beginStroke(z, opts);
  for (const [x, y] of pts) addPoint(s, x, y, 0.5);
  return endStroke(z, s);
}

test('U3: undo 60 thao tác chỉ giữ 50', () => {
  const z = mkZone();
  for (let i = 0; i < 60; i++) draw(z, [[0, i * 10], [20, i * 10]]);
  assert.equal(z.undo.length, MAX_UNDO);
  assert.equal(z.strokes.length, 60);
  let n = 0;
  while (undo(z)) n++;
  assert.equal(n, 50);
  assert.equal(z.strokes.length, 10);
  const q = createBoard(1).zones[0];
  for (let i = 0; i < 60; i++) pushAction(q, { type: 'add', stroke: i });
  assert.equal(q.undo.length, 50);
  assert.equal(q.undo[0].stroke, 10, 'bỏ thao tác cũ nhất');
});

test('U4: eraseAt xoá đúng nét chéo, không xoá nét xa', () => {
  const z = mkZone();
  const diag = draw(z, [[0, 0], [100, 100], [200, 200], [300, 300]]);
  const far = draw(z, [[800, 800], [900, 800]]);
  const dot = draw(z, [[500, 100]]);
  assert.equal(z.strokes.length, 3);
  const ses = newEraseSession();
  assert.deepEqual(eraseAt(z, 150, 100, 5, ses), [], 'cách đường chéo ~35, r+size/2 = 10');
  assert.equal(z.strokes.length, 3);
  const hit = eraseAt(z, 152, 148, 5, ses);
  assert.deepEqual(hit, [diag]);
  assert.equal(z.strokes.indexOf(far) >= 0, true);
  assert.equal(eraseAt(z, 503, 103, 3, ses).length, 1, 'nét 1 điểm bị tẩy khi chạm');
  assert.equal(z.strokes.length, 1);
  assert.equal(distPointSeg(0, 5, -10, 0, 10, 0), 5);
  assert.equal(distPointSeg(20, 0, 0, 0, 10, 0), 10);
  assert.equal(distPointSeg(3, 4, 0, 0, 0, 0), 5);
});

test('U5: hoàn tác tẩy và xoá vùng đưa nét về đúng vị trí thứ tự', () => {
  const z = mkZone();
  const a = draw(z, [[0, 0], [100, 0]]);
  const b = draw(z, [[0, 50], [100, 50]]);
  const c = draw(z, [[0, 100], [100, 100]]);
  const d = draw(z, [[0, 150], [100, 150]]);
  const order = z.strokes.slice();
  // tẩy b và d trong một phiên
  const ses = newEraseSession();
  eraseAt(z, 50, 50, 3, ses);
  eraseAt(z, 50, 150, 3, ses);
  commitErase(z, ses);
  assert.deepEqual(z.strokes, [a, c]);
  assert.equal(undo(z).type, 'erase');
  assert.deepEqual(z.strokes, order);
  // xoá vùng rồi hoàn tác
  assert.equal(clearZone(z), 4);
  assert.equal(z.strokes.length, 0);
  assert.equal(undo(z).type, 'clear');
  assert.deepEqual(z.strokes, order);
  // hoàn tác 'add'
  assert.equal(undo(z).type, 'add');
  assert.deepEqual(z.strokes, [a, b, c]);
  // tẩy một phiên rỗng không tạo thao tác
  const depth = z.undo.length;
  commitErase(z, newEraseSession());
  assert.equal(z.undo.length, depth);
  assert.equal(clearZone(createBoard(1).zones[0]), 0);
});

test('vùng đầy sau 2000 nét', () => {
  const z = mkZone();
  for (let i = 0; i < MAX_STROKES; i++) z.strokes.push({ pts: [0, 0, 0.5] });
  assert.equal(zoneFull(z), true);
  const s = beginStroke(z, {});
  addPoint(s, 1, 1, 0.5);
  assert.equal(endStroke(z, s), null);
});

// ---------- PLAN-PERF: đoạn làm mượt gia tăng (T5a) ----------
import { smoothSegments } from '../public/board/js/strokes.js';


test('T5a: smoothSegments cho 3 điểm trả 2 đoạn, hộp bao đúng, closeTail thêm đoạn cuối', () => {
  const pts = [0, 0, 0.5, 10, 0, 0.5, 10, 10, 0.5];
  const r = smoothSegments(pts, 1, 3, false);
  assert.equal(r.segs.length, 2);
  assert.deepEqual(r.segs[0], [0, 0, 0, 0, 5, 0]);            // P0 -> M1 thẳng
  assert.deepEqual(r.segs[1], [5, 0, 10, 0, 10, 5]);          // M1 --quad(P1)--> M2
  assert.deepEqual([r.minX, r.minY, r.maxX, r.maxY], [0, 0, 10, 5]);
  const c = smoothSegments(pts, 1, 3, true);
  assert.equal(c.segs.length, 3);
  assert.deepEqual(c.segs[2], [10, 5, 10, 5, 10, 10]);       // M2 -> P2
  assert.equal(c.maxY, 10);
  // gia tăng khớp liền: đoạn cuối lần 1 kết thúc đúng chỗ đoạn đầu lần 2 bắt đầu
  const a = smoothSegments(pts, 1, 2, false), b = smoothSegments(pts, 2, 3, false);
  assert.deepEqual([a.segs[a.segs.length - 1][4], a.segs[a.segs.length - 1][5]], [b.segs[0][0], b.segs[0][1]]);
  assert.equal(smoothSegments(pts, 3, 3, false).segs.length, 0);
});

test('T5b: addPoint/addPointSplit nhận minStep và maxPts', () => {
  const z = createBoard(1).zones[0];
  const s = beginStroke(z, {});
  addPoint(s, 0, 0, 0.5, false, 1.2);
  assert.equal(addPoint(s, 1, 0, 0.5, false, 1.2), false);   // < 1.2
  assert.equal(addPoint(s, 1.3, 0, 0.5, false, 1.2), true);
  assert.equal(addPoint(s, 2.1, 0, 0.5, false), true);       // mặc định 0.6
  let cur = beginStroke(z, {}); let fin = 0;
  for (let i = 0; i < 12; i++) { const r = addPointSplit(z, cur, i * 5, 0, 0.5, false, 5, 1.2); cur = r.stroke; if (r.finished) fin++; }
  assert.ok(fin >= 2, 'tách nét theo maxPts=5');
});

const UA_CI = 'Mozilla/5.0 (Windows NT 10.0) ClassIn X/6.0.9.1813 Safari/537.36';
const UA_N = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0.0.0 Safari/537.36';
const tch = (w, h = w) => ({ pointerType: 'touch', width: w, height: h });

test('PALM1: UA ClassIn => không lọc kể cả width 50', () => {
  const f = createPalmFilter({ mode: 'auto', ua: UA_CI });
  f.observe(tch(50)); assert.equal(f.isPalm(tch(50)), false);
  assert.equal(f.isPalm(tch(120)), false);
  const st = f.state(); assert.equal(st.enabled, false); assert.equal(st.reason, 'ua'); assert.equal(st.samples, 1);
});
test('PALM2: UA thường + 3 chạm width 50 ổn định => tự tắt', () => {
  const f = createPalmFilter({ mode: 'auto', ua: UA_N });
  assert.equal(f.isPalm(tch(50)), true);
  assert.equal(f.observe(tch(50)), false); assert.equal(f.observe(tch(51)), false);
  assert.equal(f.isPalm(tch(50)), true);
  assert.equal(f.observe(tch(50)), true);
  assert.equal(f.isPalm(tch(50)), false);
  assert.equal(f.state().reason, 'auto');
  assert.deepEqual(f.state().recent, [[50, 50], [51, 51], [50, 50]]);
  assert.equal(f.isPalm({ pointerType: 'pen', width: 80, height: 80 }), false);
});
test('PALM3: một chạm width 80 lẫn chạm width 12 => vẫn lọc', () => {
  const f = createPalmFilter({ mode: 'auto', ua: UA_N });
  for (const w of [12, 12, 80, 12, 12, 80, 13, 12]) f.observe(tch(w));
  assert.equal(f.state().enabled, true);
  assert.equal(f.isPalm(tch(80)), true); assert.equal(f.isPalm(tch(12)), false);
  // dao động lớn (50, 60, 70) không coi là cố định
  const g = createPalmFilter({ mode: 'auto', ua: UA_N });
  for (const w of [50, 60, 70, 55]) g.observe(tch(w));
  assert.equal(g.state().enabled, true);
  // cố định nhưng nhỏ (12) không tắt, và w cố định cũ bị xen chạm nhỏ thì cửa sổ không còn đồng nhất
  const h = createPalmFilter({ mode: 'auto', ua: UA_N });
  for (const w of [50, 50, 12, 50]) h.observe(tch(w));
  assert.equal(h.state().enabled, true);
});
test('PALM4: palm=0 / palm=1 ghi đè; parsePalmMode', () => {
  const off = createPalmFilter({ mode: '0', ua: UA_N });
  assert.equal(off.isPalm(tch(90)), false); assert.equal(off.state().reason, 'param');
  const on = createPalmFilter({ mode: '1', ua: UA_CI });
  for (let i = 0; i < 5; i++) on.observe(tch(50));
  assert.equal(on.isPalm(tch(50)), true); assert.equal(on.state().reason, 'forced');
  assert.equal(parsePalmMode('?palm=0'), '0'); assert.equal(parsePalmMode('?palm=1'), '1');
  assert.equal(parsePalmMode('?palm=auto'), 'auto'); assert.equal(parsePalmMode(''), 'auto');
});
test('PALM5: nút bấm chỉ bỏ qua chạm to >= 3 x ngưỡng', () => {
  assert.equal(isHugePalm(tch(50)), false); assert.equal(isHugePalm(tch(PALM_MIN * 3)), true);
  assert.equal(isHugePalm({ pointerType: 'mouse', width: 500, height: 500 }), false);
});

// ---------- PLAN-INK: lọc One Euro, độ dày, thon, đo ----------
import {
  INK, smoothstep, createPointFilter, widthFromSpeed, cumLengths, taperFactor, pointWidth, widthRuns, tailBox,
  parseInkOverrides, inkText,
} from '../public/board/js/ink.js';
import { genSamples, alphaFromRGBA, lineMetrics, changedFraction, movingAvg } from './ink-metrics.mjs';

function lcg(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gaussR(r) { let u = 0; while (u === 0) u = r(); const v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

test('INK1: One Euro – điểm đầu nguyên, độ trễ ổn định, đứng yên hội tụ', () => {
  const f0 = createPointFilter(INK.FILTER);
  assert.deepEqual(f0.push(10, 20, 100), [10, 20, 0]);
  assert.deepEqual(f0.last(), [10, 20]);
  for (const [v, maxLag] of [[120, 2.6], [600, 4.6], [1200, 5.6]]) {
    const f = createPointFilter(INK.FILTER);
    let lag = 0;
    for (let i = 0; i < 240; i++) {
      const t = i * 1000 / 120, x = 50 + v * t / 1000;
      const r = f.push(x, 100, t);
      lag = x - r[0];
    }
    assert.ok(lag > 0 && lag <= maxLag, 'trễ ' + v + ' px/s = ' + lag.toFixed(2) + ' (<= ' + maxLag + ')');
  }
  const f = createPointFilter(INK.FILTER);
  f.push(0, 0, 0);
  let r;
  for (let i = 1; i <= 200; i++) r = f.push(30, 40, i * 1000 / 120);
  assert.ok(Math.hypot(r[0] - 30, r[1] - 40) < 0.01, 'hội tụ: ' + r);
});

test('INK2: lọc giảm nhiễu >= 2 lần (std vuông góc)', () => {
  const rg = lcg(99);
  const f = createPointFilter(INK.FILTER);
  const raw = [], fil = [];
  for (let i = 0; i < 480; i++) {
    const t = i * 1000 / 120, x = 20 + 120 * t / 1000;
    const nx = Math.round(x + 0.8 * gaussR(rg)), ny = Math.round(100 + 0.8 * gaussR(rg));
    const r = f.push(nx, ny, t);
    if (i >= 30) { raw.push(ny - 100); fil.push(r[1] - 100); }
  }
  const sd = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length); };
  assert.ok(sd(fil) <= 0.5 * sd(raw), 'lọc ' + sd(fil).toFixed(3) + ' thô ' + sd(raw).toFixed(3));
});

test('INK3: dt bất thường không ra NaN/Infinity', () => {
  const f = createPointFilter(INK.FILTER);
  f.push(0, 0, 1000);
  const chk = (r) => assert.ok(r.every((v) => Number.isFinite(v)), 'hữu hạn: ' + r);
  chk(f.push(5, 5, 1000));          // dt = 0
  chk(f.push(8, 5, 990));           // lùi thời gian
  chk(f.push(12, 9, 3000));         // nghỉ 2 s
  chk(f.push(13, 9, 3004));
});

test('INK4: widthFromSpeed', () => {
  assert.equal(widthFromSpeed(0), 1);
  assert.equal(widthFromSpeed(150), 1);
  assert.ok(Math.abs(widthFromSpeed(1500) - 0.7) < 1e-12);
  assert.ok(Math.abs(widthFromSpeed(99999) - 0.7) < 1e-12);
  let prev = 2;
  for (let v = 0; v <= 2000; v += 25) { const w = widthFromSpeed(v); assert.ok(w <= prev + 1e-12); prev = w; }
  assert.equal(smoothstep(0, 1, -1), 0); assert.equal(smoothstep(0, 1, 2), 1);
});

test('INK5: taperFactor', () => {
  const size = 10, T = INK.TAPER;
  assert.equal(taperFactor(0, 100, size, false, false, false), T.startMin);
  assert.equal(taperFactor(5, 100, size, false, false, false), taperFactor(5, 9999, size, false, false, false), 'fin=false không phụ thuộc total');
  assert.equal(taperFactor(2 * size, 500, size, false, false, false), 1);
  assert.equal(taperFactor(300, 500, size, false, false, false), 1);
  assert.ok(Math.abs(taperFactor(400, 400, size, true, false, false) - T.endMin) < 1e-12, 'cuối = 0,3');
  assert.ok(Math.abs(taperFactor(300, 300, size, true, true, false) - T.endMin) < 1e-12, 'contStart tắt thon đầu, giữ thon cuối');
  assert.equal(taperFactor(0, 300, size, true, false, true), T.startMin, 'contEnd tắt thon cuối, giữ thon đầu');
  assert.equal(taperFactor(0, 300, size, true, true, true), 1);
  assert.equal(taperFactor(0, 19, size, true, false, false), 1, 'total < 2 size => 1');
  assert.equal(taperFactor(0, 19, size, false, false, false), T.startMin, 'đang vẽ vẫn thon đầu');
});

function lineStroke(n, wf = 1, size = 10, step = 5) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(i * step, 0, wf);
  return { pts, size, cum: null, contStart: false, contEnd: false };
}
function segsOf(s, from, to, close) { return smoothSegments(s.pts, from, to, close).segs; }

test('INK6: widthRuns – thon đầu đơn điệu, số đoạn bảo toàn, fin không đổi phần giữa', () => {
  const s = lineStroke(50);
  s.cum = cumLengths(s.pts, s.cum);
  const segs = segsOf(s, 1, 50, false);
  const runs = widthRuns(s, segs, 1, false, 0.05);
  assert.equal(runs.reduce((a, r) => a + r.segs.length, 0), segs.length);
  const ws = runs.map((r) => r.w);
  for (let i = 1; i < ws.length; i++) assert.ok(ws[i] >= ws[i - 1] - 1e-9, 'không giảm dọc phần thon đầu');
  assert.ok(ws[0] < ws[ws.length - 1]);
  // fin=true: cùng độ dày ở mọi điểm cách cuối > le
  const total = s.cum[s.cum.length - 1], le = Math.min(INK.TAPER.endLen * s.size, INK.TAPER.endMaxFrac * total);
  for (let i = 0; i < 50; i++) {
    if (total - s.cum[i] > le) assert.equal(pointWidth(s, i, true), pointWidth(s, i, false), 'điểm ' + i);
  }
  const segsF = segsOf(s, 1, 50, true);
  const runsF = widthRuns(s, segsF, 1, true, 0.05);
  assert.equal(runsF.reduce((a, r) => a + r.segs.length, 0), segsF.length);
});

test('INK7: tailBox chứa điểm cuối, không chứa điểm đầu nét dài 300 đv', () => {
  const s = lineStroke(61, 1, 10, 5);   // x 0..300
  const b = tailBox(s);
  assert.ok(b.maxX === 300 && b.minX <= 300 && b.minX > 0, JSON.stringify(b));
  assert.ok(b.minX > 100, 'không chứa điểm đầu: ' + b.minX);
});

test('INK8: addPoint với wf; realPressure theo p; addPointSplit đặt contEnd/contStart', () => {
  const z = createBoard(1).zones[0];
  const s = beginStroke(z, {});
  assert.equal(s.contStart, false); assert.equal(s.contEnd, false); assert.equal(s.cum, null);
  addPoint(s, 0, 0, 0.5, true, 1.2, 0.8);
  assert.equal(s.pts[2], 0.8);
  assert.equal(s.realPressure, false, 'pen p 0,5 + wf 0,8 => false');
  addPoint(s, 10, 0, 0.37, true, 1.2, 0.8);
  assert.equal(s.realPressure, true);
  addPoint(s, 20, 0, 0.5, false, 1.2);
  assert.equal(s.pts[8], 0.5, 'không truyền wf => cũ');
  addPoint(s, 30, 0, 0, false, 1.2);
  assert.equal(s.pts[11], 0.5);
  let cur = beginStroke(z, {}); let fin = null;
  for (let i = 0; i < 12; i++) { const r = addPointSplit(z, cur, i * 5, 0, 0.5, false, 5, 1.2, 0.6); cur = r.stroke; if (r.finished && !fin) fin = r.finished; }
  assert.ok(fin && fin.contEnd === true && fin.contStart === false);
  assert.equal(cur.contStart, true); assert.equal(cur.contEnd, false);
  assert.equal(cur.pts[2], 0.6, 'điểm đầu nét nối giữ wf');
});

test('INK9: parseInkOverrides', () => {
  assert.deepEqual(parseInkOverrides('?ink=raw&k=1&livepts=400'), {});
  assert.deepEqual(parseInkOverrides(''), {});
  assert.deepEqual(parseInkOverrides('?test=1&ink=raw&k=1&livepts=400'), { raw: true, k: 1, livepts: 400 });
  assert.deepEqual(parseInkOverrides('?test=1&k=9&livepts=5&ink=zz'), {});
  assert.deepEqual(parseInkOverrides('?test=1&k=2.5'), { k: 2.5 });
  assert.ok(inkText(3, {}).startsWith('lọc One Euro'));
  assert.ok(inkText(1, { raw: true }).startsWith('THÔ'));
  assert.ok(inkText(2.5, {}).includes('k 2,5'));
});

// ---------- hàm đo (ink-metrics) ----------
function synthStrip(noise, seed) {
  // dải ngang dày 18 px, biên khử răng cưa chính xác (alpha theo độ phủ)
  const w = 600, h = 60, a = new Float64Array(w * h), rg = lcg(seed || 7);
  for (let x = 0; x < w; x++) {
    const n1 = noise ? (rg() < 0.5 ? -noise : noise) : 0, n2 = noise ? (rg() < 0.5 ? -noise : noise) : 0;
    const top = 20 + n1, bot = 38 + n2;
    for (let y = 0; y < h; y++) a[y * w + x] = Math.max(0, Math.min(1, Math.min(y + 1, bot) - Math.max(y, top)));
  }
  return { a, w, h };
}
test('INK-M: hàm đo – dải sạch hf < 0,05, dải nhiễu ±1 px hf > 0,3; ma/changedFraction', () => {
  const c = synthStrip(0), n = synthStrip(1);
  const mc = lineMetrics(c.a, c.w, c.h, 60, false, 3), mn = lineMetrics(n.a, n.w, n.h, 60, false, 3);
  assert.ok(mc.hf < 0.05, 'sạch ' + mc.hf);
  assert.ok(mn.hf > 0.3, 'nhiễu ' + mn.hf);
  assert.ok(Math.abs(mc.wmean - 18) < 0.2, 'dày ' + mc.wmean);
  // transpose cho nét dọc
  const tr = new Float64Array(c.w * c.h); for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) tr[x * c.h + y] = c.a[y * c.w + x];
  const mt = lineMetrics(tr, c.h, c.w, 60, true, 3);
  assert.deepEqual(mt, mc);
  const ma = movingAvg(Float64Array.from([1, 2, 3, 4, 5]), 3);
  assert.deepEqual(Array.from(ma), [4 / 3, 2, 3, 4, 14 / 3]);
  const img = (v) => { const d = new Uint8ClampedArray(16 * 4); for (let i = 0; i < 16; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v(i); d[i * 4 + 3] = 255; } return { w: 4, h: 4, d }; };
  assert.equal(changedFraction(img(() => 255), img(() => 255)), 0);
  assert.equal(changedFraction(img((i) => (i < 8 ? 255 : 18)), img((i) => (i < 4 ? 255 : 18))), 0.5);
  const al = alphaFromRGBA(img((i) => (i === 0 ? 255 : 18)));
  assert.equal(al[0], 1); assert.equal(al[1], 0);
  assert.ok(genSamples('H', 'N1', 5).length > 300);
});

// ================= v2.1 (PLAN-BOARD-V21) =================
import { readFeatures, DEFAULTS } from '../public/board/js/features.js';
import { chromeLayout } from '../public/board/js/layout.js';
import { BOARDS, PALETTES, inkMap, remapInk, paperColors, parseTheme } from '../public/board/js/theme.js';
import { paperSVG } from '../public/board/js/paper.js';

test('F1: readFeatures (mặc định tắt Đề; deck=1 bật; deck=0 thắng src; src= và #L= bật)', () => {
  assert.equal(DEFAULTS.deck, false);
  assert.equal(readFeatures('', '').deck, false);
  assert.equal(readFeatures('?zones=3', '').deck, false);
  assert.equal(readFeatures('?deck=1', '').deck, true);
  assert.equal(readFeatures('?deck=0&src=lib:x', '').deck, false);
  assert.equal(readFeatures('?src=lib:food-and-drink&kind=write', '').deck, true);
  assert.equal(readFeatures('', '#L=abc').deck, true);
  assert.equal(readFeatures('', '#x=abc').deck, false);
  assert.equal(readFeatures('?snip=0', '').snip, false);
  assert.equal(readFeatures('', '').snip, true);
});

test('L1: chromeLayout (gộp thanh, hai hàng, Đề bật giữ bố cục cũ)', () => {
  let c = chromeLayout(1280, 720, false);
  assert.deepEqual([c.merged, c.barH, c.rowH, c.compact], [true, 64, 0, true]);
  c = chromeLayout(1366, 768, false);
  assert.ok(c.merged && c.compact && c.barH === Math.round(64 * c.s));
  c = chromeLayout(1920, 1080, false);
  assert.deepEqual([c.s, c.merged, c.barH, c.rowH, c.compact], [1.5, true, 96, 0, true]);
  c = chromeLayout(2560, 1080, false);
  assert.ok(c.merged && !c.compact && c.s === 1.5, 'W/s = 1707 không thu gọn');
  c = chromeLayout(960, 540, false);
  assert.deepEqual([c.merged, c.barH, c.rowH], [false, 52, 59]);
  c = chromeLayout(1280, 720, false, true);
  assert.deepEqual([c.merged, c.barH, c.rowH], [false, 56, 64], 'forceRows');
  c = chromeLayout(1280, 720, true);
  assert.deepEqual([c.merged, c.barH, c.rowH], [false, 56, 64]);
  c = chromeLayout(1920, 1080, true);
  assert.deepEqual([c.barH, c.rowH], [84, 96]);
});

test('TH1: inkMap song ánh, đổi hai lần trả mã cũ', () => {
  const d2l = inkMap('dark', 'light'), l2d = inkMap('light', 'dark');
  assert.equal(d2l.size, 6); assert.equal(l2d.size, 6);
  assert.equal(new Set(d2l.values()).size, 6, 'ảnh của map không trùng');
  for (const [from, to] of d2l) assert.equal(l2d.get(to.toUpperCase()), PALETTES.dark.find((c) => c.hex === from).hex);
  assert.equal(d2l.get('#FFFFFF'), '#1C1C1E');
  assert.equal(d2l.get('#FFD43B'), '#E67700');
  assert.equal(PALETTES.dark.length, PALETTES.light.length);
  assert.equal(BOARDS.dark.bg, '#121212'); assert.equal(BOARDS.light.bg, '#FFFFFF');
  assert.equal(parseTheme('light'), 'light'); assert.equal(parseTheme('x'), 'dark'); assert.equal(parseTheme(null), 'dark');
});

test('TH2: remapInk đổi zone.color, nét, undo (add / erase / clear), nét đang vẽ; mỗi nét một lần; màu lạ giữ', () => {
  const b = createBoard(2);
  setZoneRects(b, [{ id: 1, x: 0, y: 64, w: 600, h: 600 }, { id: 2, x: 602, y: 64, w: 600, h: 600 }]);
  const z = b.zones[0];
  const mk = (color) => { const s = beginStroke(z, { color, size: 10 }); addPoint(s, 100, 100, 0.5, false, 0.5, 1); addPoint(s, 200, 220, 0.5, false, 0.5, 1); return s; };
  const s1 = mk('#FFFFFF'), s2 = mk('#FFD43B'), s3 = mk('#123456');
  [s1, s2, s3].forEach((s) => endStroke(z, s));
  // erase: nét s2 bị xoá (nằm trong undo, không còn trong strokes)
  const sess = newEraseSession();
  z.strokes.splice(z.strokes.indexOf(s2), 1); sess.removed.push({ stroke: s2, index: 1 }); commitErase(z, sess);
  clearZone(z);   // 'clear': removed là mảng nét
  const live = mk('#4DABF7');
  z.color = '#FF4D4F';
  const n = remapInk(b, inkMap('dark', 'light'), [live]);
  assert.equal(z.color, '#E03131');
  assert.equal(s1.color, '#1C1C1E'); assert.equal(s2.color, '#E67700'); assert.equal(s3.color, '#123456');
  assert.equal(live.color, '#1971C2');
  assert.equal(n, 3, 'mỗi nét đổi đúng một lần (s1, s2, live; s3 màu lạ)');
  // đổi lại
  remapInk(b, inkMap('light', 'dark'), [live]);
  assert.equal(s1.color, '#FFFFFF'); assert.equal(s2.color, '#FFD43B'); assert.equal(live.color, '#4DABF7'); assert.equal(z.color, '#FF4D4F');
  // nét xuất hiện cả ở strokes và undo chỉ đổi một lần (nếu đổi hai lần sẽ trôi sang màu khác)
  undo(z);
  remapInk(b, inkMap('dark', 'light'));
  assert.ok(z.strokes.every((s) => s.color !== '#FFFFFF'));
  assert.equal(b.zones[1].color, '#1C1C1E');
});

test('TH3: paperSVG nền Trắng dùng rgba(28,28,30; nền Đen giữ chuỗi cũ', () => {
  for (const k of ['lines4', 'oli', 'grid', 'axes']) {
    const dk = paperSVG(k, 500, 400, 1), dk2 = paperSVG(k, 500, 400, 1, 'dark'), lt = paperSVG(k, 500, 400, 1, 'light');
    assert.equal(dk, dk2, k + ': mặc định = dark');
    assert.ok(dk.includes('rgba(255,255,255,0.14)'), k + ' dark');
    assert.ok(lt.includes('rgba(28,28,30'), k + ' light');
    assert.ok(!lt.includes('rgba(255,255,255'), k + ' light không còn trắng');
  }
  assert.equal(paperColors('light').margin, 'rgba(224,49,49,0.5)');
});
