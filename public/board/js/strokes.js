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
    done: false, path: null,
  };
}

const FAKE_PRESSURE = [0, 0.5, 1];

// Thêm điểm; bỏ điểm cách điểm trước < MIN_STEP. Trả true nếu đã thêm.
export function addPoint(stroke, ux, uy, p, isPen) {
  const n = stroke.pts.length;
  if (n >= 3) {
    const dx = ux - stroke.pts[n - 3], dy = uy - stroke.pts[n - 2];
    if (dx * dx + dy * dy < MIN_STEP * MIN_STEP) return false;
  }
  const pr = p > 0 ? p : 0.5;
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
export function addPointSplit(zone, stroke, ux, uy, p, isPen) {
  const added = addPoint(stroke, ux, uy, p, isPen);
  if (added && stroke.pts.length / 3 >= MAX_PTS) {
    const n = stroke.pts.length;
    const lx = stroke.pts[n - 3], ly = stroke.pts[n - 2], lp = stroke.pts[n - 1];
    const finished = endStroke(zone, stroke);
    const next = beginStroke(zone, { color: stroke.color, size: stroke.size });
    next.realPressure = stroke.realPressure;
    addPoint(next, lx, ly, lp, false);
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
