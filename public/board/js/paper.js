// Nền viết: lớp SVG tĩnh (background-image data:) đặt TRÊN #tiles, DƯỚI #input-layer. PLAN-V2 mục D.4.
// Chỉ dựng lại khi đổi bố cục hoặc đổi nền; không vẽ lại theo khung hình. Nền không nằm trong ngăn hoàn tác.
const LINE = 'rgba(255,255,255,0.14)', MAJOR = 'rgba(255,255,255,0.26)', MARGIN = 'rgba(255,105,97,0.35)';
const f = (n) => String(Math.round(n * 100) / 100);

function line(x1, y1, x2, y2, c, w, dash) {
  return '<line x1="' + f(x1) + '" y1="' + f(y1) + '" x2="' + f(x2) + '" y2="' + f(y2) + '" stroke="' + c + '" stroke-width="' + f(w) + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>';
}

// Lưới ô: cell px, đường đậm sau mỗi `every` ô. Trả mảng chuỗi.
function gridLines(w, h, cell, every, sw) {
  const out = [];
  for (let i = 0, x = 0; x <= w + 0.5; i++, x = i * cell) out.push(line(x, 0, x, h, i % every === 0 ? MAJOR : LINE, i % every === 0 ? sw * 1.4 : sw));
  for (let j = 0, y = 0; y <= h + 0.5; j++, y = j * cell) out.push(line(0, y, w, y, j % every === 0 ? MAJOR : LINE, j % every === 0 ? sw * 1.4 : sw));
  return out;
}

// kind: 'blank' | 'lines4' | 'oli' | 'grid' | 'axes'; w, h: cỡ vùng viết (CSS px); u: hệ số nét (s)
export function paperSVG(kind, w, h, u) {
  const sw = Math.max(1, u || 1);
  let body = [];
  if (kind === 'lines4') {
    // 3 hàng chữ, mỗi hàng 4 đường (trên, giữa nét đứt, chân chữ đậm, đuôi); cách hàng 20% hàng
    const r = (h * 0.92) / (3 + 2 * 0.2), gap = r * 0.2, top = h * 0.04;
    for (let k = 0; k < 3; k++) {
      const y0 = top + k * (r + gap);
      body.push(line(0, y0, w, y0, LINE, sw));
      body.push(line(0, y0 + r / 3, w, y0 + r / 3, LINE, sw, f(8 * sw) + ' ' + f(6 * sw)));
      body.push(line(0, y0 + 2 * r / 3, w, y0 + 2 * r / 3, MAJOR, sw * 1.6));
      body.push(line(0, y0 + r, w, y0 + r, LINE, sw));
    }
  } else if (kind === 'oli') {
    const cell = h / 24;
    body = gridLines(w, h, cell, 4, sw);
    body.push(line(cell * 8, 0, cell * 8, h, MARGIN, sw * 1.8));   // lề đỏ ở x = 2 ô lớn
  } else if (kind === 'grid' || kind === 'axes') {
    const cell = h / 16;
    body = gridLines(w, h, cell, 5, sw);
    if (kind === 'axes') {
      const cx = Math.round(w / 2 / cell) * cell, cy = Math.round(h / 2 / cell) * cell;
      const ax = 'rgba(255,255,255,0.7)', aw = sw * 2, ah = cell * 0.35;
      body.push(line(0, cy, w - 2, cy, ax, aw), line(cx, h, cx, 2, ax, aw));
      body.push('<path d="M' + f(w - 2) + ' ' + f(cy) + ' l' + f(-ah * 1.4) + ' ' + f(-ah * 0.6) + ' l0 ' + f(ah * 1.2) + ' z" fill="' + ax + '"/>');
      body.push('<path d="M' + f(cx) + ' 2 l' + f(-ah * 0.6) + ' ' + f(ah * 1.4) + ' l' + f(ah * 1.2) + ' 0 z" fill="' + ax + '"/>');
      const fs = cell * 0.5, tc = 'rgba(255,255,255,0.55)';
      const t = (x, y, s, anchor) => '<text x="' + f(x) + '" y="' + f(y) + '" font-size="' + f(fs) + '" font-family="Segoe UI,Arial,sans-serif" fill="' + tc + '" text-anchor="' + (anchor || 'middle') + '">' + s + '</text>';
      body.push(t(cx - cell * 0.15, cy + fs * 1.05, 'O', 'end'));
      body.push(t(w - cell * 0.6, cy - cell * 0.3, 'x'), t(cx + cell * 0.5, cell * 0.8, 'y'));
      for (let k = -5; k <= 5; k++) {
        if (!k) continue;
        const x = cx + k * cell, y = cy - k * cell;
        if (x > cell && x < w - cell) body.push(t(x, cy + fs * 1.15, String(k).replace('-', '−')));
        if (y > cell && y < h - cell) body.push(t(cx - cell * 0.15, y + fs * 0.35, String(k).replace('-', '−'), 'end'));
      }
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + f(w) + '" height="' + f(h) + '" viewBox="0 0 ' + f(w) + ' ' + f(h) + '">' + body.join('') + '</svg>';
}

// Gắn nền vào phần tử .paper đã đặt đúng vị trí. rect: { w, h }; u: hệ số s
export function applyPaper(el, kind, rect, u) {
  el.dataset.paper = kind;
  if (kind === 'blank' || !kind) { el.style.backgroundImage = 'none'; return; }
  el.style.backgroundImage = 'url("data:image/svg+xml,' + encodeURIComponent(paperSVG(kind, rect.w, rect.h, u)) + '")';
  el.style.backgroundSize = rect.w + 'px ' + rect.h + 'px';
}
