// Tính bố cục (THUẦN, không DOM). Đơn vị: CSS px.
export const GAP = 2; // khe giữa các vùng

// Hệ số tỉ lệ giao diện: clamp(0.92, min(W/1280, H/720), 1.5)
export function calcScale(W, H) {
  return Math.min(1.5, Math.max(0.92, Math.min(W / 1280, H / 720)));
}

export function topHeight(s) {
  return Math.round(56 * s);
}

// Chia vùng. W >= H: cột dọc cạnh nhau; W < H: hàng ngang.
// Trả về [{id, x, y, w, h}] theo toạ độ trang (y đã cộng topH).
export function computeZones(W, H, n, topH) {
  const sx = 0, sy = topH, sw = W, sh = Math.max(0, H - topH);
  const out = [];
  if (W >= H) {
    const zw = Math.floor((sw - (n - 1) * GAP) / n);
    for (let i = 0; i < n; i++) {
      const x = i * (zw + GAP);
      const w = i === n - 1 ? sw - x : zw;
      out.push({ id: i + 1, x: sx + x, y: sy, w, h: sh });
    }
  } else {
    const zh = Math.floor((sh - (n - 1) * GAP) / n);
    for (let i = 0; i < n; i++) {
      const y = i * (zh + GAP);
      const h = i === n - 1 ? sh - y : zh;
      out.push({ id: i + 1, x: sx, y: sy + y, w: sw, h });
    }
  }
  return out;
}

// Vùng chứa điểm (x, y); rơi vào khe/ngoài thì lấy vùng gần nhất.
export function zoneAt(rects, x, y) {
  let best = rects[0], bestD = Infinity;
  for (const r of rects) {
    const dx = x < r.x ? r.x - x : x > r.x + r.w ? x - (r.x + r.w) : 0;
    const dy = y < r.y ? r.y - y : y > r.y + r.h ? y - (r.y + r.h) : 0;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = r; }
    if (d === 0) break;
  }
  return best;
}

export function parseZones(v) {
  const n = parseInt(v, 10);
  return n >= 1 && n <= 4 ? n : 2;
}

// ---------- v2: thanh lớp, dải đề (PLAN-V2 mục C.1, C.3, C.8) ----------
export function classbarHeight(s) {
  return Math.round(64 * s);
}

// Chiều cao dải đề đầu mỗi vùng: clamp(96·s, 0,2·stageH, 160·s); 0 khi chưa có đề.
export function bandHeight(s, stageH, hasDeck) {
  if (!hasDeck) return 0;
  return Math.round(Math.min(160 * s, Math.max(96 * s, 0.2 * stageH)));
}

// Cỡ chữ đề lớn nhất theo số vùng (đơn vị gốc ở s = 1: 44 / 38 / 32 / 28).
export function fontMax(n, s) {
  return Math.round(([44, 38, 32, 28][Math.min(4, Math.max(1, n)) - 1]) * s);
}

// Tách mỗi vùng thành dải đề (trên) và vùng viết (dưới). bandH = 0: vùng viết = cả vùng.
export function splitBands(rects, bandH) {
  const bands = [], writes = [];
  for (const r of rects) {
    const b = Math.min(bandH, Math.max(0, r.h - 40));
    bands.push({ id: r.id, x: r.x, y: r.y, w: r.w, h: b });
    writes.push({ id: r.id, x: r.x, y: r.y + b, w: r.w, h: r.h - b });
  }
  return { bands, writes };
}
