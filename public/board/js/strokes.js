// Mô hình nét, vùng, hoàn tác (THUẦN, không DOM).
// Đơn vị lưu: đơn vị vùng, 1 đơn vị = zone.rect.h / 1000 CSS px, gốc ở góc trên-trái vùng.

export const MAX_UNDO = 50;
export const MAX_PTS = 1500;
export const MAX_STROKES = 2000;
export const MIN_STEP = 0.6;

let strokeSeq = 1;
let useSeq = 0;
// Đánh dấu vùng vừa dùng (tăng dần, không phụ thuộc đồng hồ).
export function touchZone(zone) { zone.lastUsed = ++useSeq; }

export function createBoard(n) {
  const zones = [];
  for (let i = 1; i <= n; i++) {
    zones.push({
      id: i, rect: { x: 0, y: 0, w: 1000, h: 1000 }, strokes: [], undo: [],
      tool: 'pen', color: '#FFFFFF', size: 10, lastUsed: 0,
    });
  }
  return { zones };
}

export function setZoneRects(board, rects) {
  for (const r of rects) {
    const z = board.zones[r.id - 1];
    if (z) z.rect = { x: r.x, y: r.y, w: r.w, h: r.h };
  }
}

export function zoneScale(zone) {
  return zone.rect.h / 1000;
}

export function toZoneUnits(zone, xCss, yCss) {
  const sc = zoneScale(zone);
  return [(xCss - zone.rect.x) / sc, (yCss - zone.rect.y) / sc];
}

export function beginStroke(zone, opts) {
  return {
    id: strokeSeq++, zone: zone.id, color: opts.color || zone.color, size: opts.size || zone.size,
    pts: [], realPressure: false,
    bbox: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    done: false, path: null, cum: null, contStart: false, contEnd: false,
  };
}

const FAKE_PRESSURE = [0, 0.5, 1];

// Thêm điểm; bỏ điểm cách điểm trước < MIN_STEP. Trả true nếu đã thêm.
// Ô thứ 3 của điểm = hệ số độ dày wf (PLAN-INK); không truyền wf thì giữ hành vi cũ (áp lực).
export function addPoint(stroke, ux, uy, p, isPen, minStep, wf) {
  const n = stroke.pts.length;
  if (n >= 3) {
    const ms = minStep > 0 ? minStep : MIN_STEP;
    const dx = ux - stroke.pts[n - 3], dy = uy - stroke.pts[n - 2];
    if (dx * dx + dy * dy < ms * ms) return false;
  }
  const pr = wf > 0 ? wf : (p > 0 ? p : 0.5);
  stroke.pts.push(ux, uy, pr);
  if (isPen && FAKE_PRESSURE.indexOf(p) === -1 && p > 0) stroke.realPressure = true;
  const b = stroke.bbox;
  if (ux < b.minX) b.minX = ux;
  if (uy < b.minY) b.minY = uy;
  if (ux > b.maxX) b.maxX = ux;
  if (uy > b.maxY) b.maxY = uy;
  return true;
}

// Thêm điểm, tự tách nét khi quá MAX_PTS. Trả { stroke: nét đang vẽ, finished: nét vừa kết thúc | null }.
export function addPointSplit(zone, stroke, ux, uy, p, isPen, maxPts, minStep, wf) {
  const mp = maxPts > 0 ? maxPts : MAX_PTS;
  const added = addPoint(stroke, ux, uy, p, isPen, minStep, wf);
  if (added && stroke.pts.length / 3 >= mp) {
    const n = stroke.pts.length;
    const lx = stroke.pts[n - 3], ly = stroke.pts[n - 2], lp = stroke.pts[n - 1];
    stroke.contEnd = true;                      // chỗ nối: không thon cuối
    const finished = endStroke(zone, stroke);
    const next = beginStroke(zone, { color: stroke.color, size: stroke.size });
    next.realPressure = stroke.realPressure;
    next.contStart = true;                      // và không thon đầu
    addPoint(next, lx, ly, lp, false, minStep, lp);
    return { stroke: next, finished };
  }
  return { stroke, finished: null };
}

export function zoneFull(zone) {
  return zone.strokes.length >= MAX_STROKES;
}

export function pushAction(zone, a) {
  zone.undo.push(a);
  while (zone.undo.length > MAX_UNDO) zone.undo.shift();
}

// Kết thúc nét: đưa vào vùng + đẩy thao tác 'add'. Trả nét, hoặc null nếu vùng đầy / nét rỗng.
export function endStroke(zone, stroke) {
  stroke.done = true;
  if (stroke.pts.length < 3 || zoneFull(zone)) return null;
  zone.strokes.push(stroke);
  pushAction(zone, { type: 'add', stroke });
  touchZone(zone);
  return stroke;
}

export function distPointSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
}

function strokeHit(stroke, ux, uy, r) {
  const rr = r + stroke.size / 2;
  const b = stroke.bbox;
  if (ux < b.minX - rr || ux > b.maxX + rr || uy < b.minY - rr || uy > b.maxY + rr) return false;
  const p = stroke.pts, n = p.length;
  if (n === 3) return Math.hypot(ux - p[0], uy - p[1]) < rr;
  for (let i = 3; i < n; i += 3) {
    if (distPointSeg(ux, uy, p[i - 3], p[i - 2], p[i], p[i + 1]) < rr) return true;
  }
  return false;
}

export function newEraseSession() {
  return { removed: [] };
}

// Xoá ngay các nét bị chạm; gom vào session. Trả mảng nét vừa xoá.
export function eraseAt(zone, ux, uy, r, session) {
  const hit = [];
  for (let i = zone.strokes.length - 1; i >= 0; i--) {
    const s = zone.strokes[i];
    if (strokeHit(s, ux, uy, r)) {
      zone.strokes.splice(i, 1);
      session.removed.push({ stroke: s, index: i });
      hit.push(s);
    }
  }
  return hit;
}

export function commitErase(zone, session) {
  if (session.removed.length) pushAction(zone, { type: 'erase', removed: session.removed });
  return session.removed.length;
}

export function clearZone(zone) {
  const removed = zone.strokes.splice(0, zone.strokes.length);
  if (removed.length) pushAction(zone, { type: 'clear', removed });
  return removed.length;
}

// Hoàn tác thao tác cuối. Trả thao tác đã hoàn tác hoặc null.
export function undo(zone) {
  const a = zone.undo.pop();
  if (!a) return null;
  if (a.type === 'add') {
    const i = zone.strokes.indexOf(a.stroke);
    if (i >= 0) zone.strokes.splice(i, 1);
  } else if (a.type === 'erase') {
    for (let k = a.removed.length - 1; k >= 0; k--) {
      const { stroke, index } = a.removed[k];
      zone.strokes.splice(Math.min(index, zone.strokes.length), 0, stroke);
    }
  } else if (a.type === 'clear') {
    zone.strokes = a.removed.concat(zone.strokes);
  }
  return a;
}

// Đoạn làm mượt kiểu nối điểm giữa cho các điểm [from, to) của pts (mảng phẳng x,y,p).
// Trả { segs: [[x0,y0, cx,cy, x1,y1], ...], minX, minY, maxX, maxY }; đoạn i dùng P[i-1], P[i].
// i = 1: thẳng P0 -> M1 (cx,cy = P0); i >= 2: M(i-1) --quad(P[i-1])--> M(i); M(i) = (P[i-1]+P[i])/2.
// closeTail = true (lúc nhả tay): thêm đoạn thẳng M(n-1) -> P(n-1).
export function smoothSegments(pts, from, to, closeTail) {
  const n = pts.length / 3;
  const end = Math.min(to, n);
  const segs = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x, y) => {
    if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  };
  const mid = (i) => [(pts[(i - 1) * 3] + pts[i * 3]) / 2, (pts[(i - 1) * 3 + 1] + pts[i * 3 + 1]) / 2];
  for (let i = Math.max(1, from); i < end; i++) {
    let seg;
    if (i === 1) {
      const m = mid(1);
      seg = [pts[0], pts[1], pts[0], pts[1], m[0], m[1]];
    } else {
      const a = mid(i - 1), b = mid(i);
      seg = [a[0], a[1], pts[(i - 1) * 3], pts[(i - 1) * 3 + 1], b[0], b[1]];
    }
    segs.push(seg);
    grow(seg[0], seg[1]); grow(seg[2], seg[3]); grow(seg[4], seg[5]);
  }
  if (closeTail && end >= 2 && end >= Math.max(2, from + 1)) {
    const m = mid(end - 1 >= 1 ? end - 1 : 1);
    const lx = pts[(end - 1) * 3], ly = pts[(end - 1) * 3 + 1];
    segs.push([m[0], m[1], m[0], m[1], lx, ly]);
    grow(m[0], m[1]); grow(lx, ly);
  }
  return { segs, minX, minY, maxX, maxY };
}
