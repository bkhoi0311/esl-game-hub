// Word Ninja: vật lý thẻ bay và phép thử "nhát chém" cắt qua thẻ (thuần logic, test được).

// Đoạn thẳng (x1,y1)-(x2,y2) có cắt hình chữ nhật tâm (cx,cy) rộng w cao h không.
export function segmentHitsRect(x1, y1, x2, y2, cx, cy, w, hgt) {
  const minX = cx - w / 2;
  const maxX = cx + w / 2;
  const minY = cy - hgt / 2;
  const maxY = cy + hgt / 2;
  const inside = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY;
  if (inside(x1, y1) || inside(x2, y2)) return true;
  // Liang-Barsky
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const clip = (p, q) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, x1 - minX) && clip(dx, maxX - x1) && clip(-dy, y1 - minY) && clip(dy, maxY - y1) && t0 <= t1;
}

// Tạo 1 thẻ bay từ dưới lên theo đường cong, đỉnh nằm trong 15-45% chiều cao màn hình.
export function launchCard(item, width, height, rand = Math.random) {
  const g = height * 1.1; // gia tốc rơi (px/s^2)
  const peakY = height * (0.15 + rand() * 0.3);
  const startY = height + 60;
  const vy = -Math.sqrt(2 * g * (startY - peakY));
  const x = width * (0.15 + rand() * 0.7);
  const flight = (2 * -vy) / g;
  const targetX = width * (0.1 + rand() * 0.8);
  return { ...item, x, y: startY, vx: (targetX - x) / flight, vy, g, sliced: false, gone: false, angle: 0, spin: (rand() - 0.5) * 1.2 };
}

export function stepCard(c, dt) {
  c.vy += c.g * dt;
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  c.angle += c.spin * dt;
}

// Tốc độ tay (px/giây) từ 2 điểm liên tiếp.
export function speedOf(a, b) {
  const dt = Math.max(1e-3, (b.t - a.t) / 1000);
  return Math.hypot(b.x - a.x, b.y - a.y) / dt;
}

// Nhóm có ít nhất `min` từ.
export function playableCategories(vocab, min = 3) {
  const groups = {};
  vocab.filter((v) => v.word && v.category).forEach((v) => (groups[v.category.toLowerCase()] ||= []).push(v));
  return Object.fromEntries(Object.entries(groups).filter(([, list]) => list.length >= min));
}
