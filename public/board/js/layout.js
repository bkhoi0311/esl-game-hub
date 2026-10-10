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
