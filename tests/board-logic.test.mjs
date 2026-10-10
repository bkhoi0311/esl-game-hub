// Test logic thuần của "Bảng nhiều người viết" (không cần trình duyệt). Chạy: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
