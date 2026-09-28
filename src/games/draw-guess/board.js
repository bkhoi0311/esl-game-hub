// Bảng vẽ canvas bằng Pointer Events: nhiều ngón vẽ cùng lúc, nét mượt (đường cong qua trung điểm,
// lấy cả điểm gộp getCoalescedEvents), tự vẽ lại khi đổi kích thước. Tọa độ lưu theo tỉ lệ 0..1.

const SIZES = { thin: 0.007, thick: 0.02 }; // tỉ lệ theo chiều rộng bảng
const ERASER_SCALE = 2.4;

export function createBoard(host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'dg-canvas';
  canvas.setAttribute('aria-label', 'Drawing board');
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const tool = { color: '#1c1f25', size: 'thin', erase: false };
  const strokes = []; // { color, size, erase, points: [[x, y], ...] }
  const active = new Map(); // pointerId -> stroke
  let enabled = false;
  let w = 0;
  let hgt = 0;

  function resize() {
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = rect.width;
    hgt = rect.height;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(hgt * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${hgt}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }

  function lineWidth(s) {
    return SIZES[s.size] * w * (s.erase ? ERASER_SCALE : 1);
  }

  function style(s) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = lineWidth(s);
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
  }

  const px = (p) => [p[0] * w, p[1] * hgt];

  // Vẽ đoạn cuối của nét (từ điểm i-1 tới i) bằng đường cong qua trung điểm.
  function drawTail(s, from) {
    style(s);
    const pts = s.points;
    if (pts.length === 1) {
      const [x, y] = px(pts[0]);
      ctx.beginPath();
      ctx.arc(x, y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    for (let i = Math.max(1, from); i < pts.length; i++) {
      const [x0, y0] = px(pts[i - 1]);
      const [x1, y1] = px(pts[i]);
      const prev = i >= 2 ? px(pts[i - 2]) : [x0, y0];
      const m0 = [(prev[0] + x0) / 2, (prev[1] + y0) / 2];
      const m1 = [(x0 + x1) / 2, (y0 + y1) / 2];
      ctx.beginPath();
      ctx.moveTo(m0[0], m0[1]);
      ctx.quadraticCurveTo(x0, y0, m1[0], m1[1]);
      ctx.stroke();
    }
  }

  function redraw() {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, hgt);
    ctx.restore();
    strokes.forEach((s) => drawTail(s, 1));
    ctx.globalCompositeOperation = 'source-over';
  }

  function point(e) {
    const rect = canvas.getBoundingClientRect();
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height];
  }

  function onDown(e) {
    if (!enabled) return;
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    const s = { color: tool.color, size: tool.size, erase: tool.erase, points: [point(e)] };
    strokes.push(s);
    active.set(e.pointerId, s);
    drawTail(s, 1);
  }

  function onMove(e) {
    const s = active.get(e.pointerId);
    if (!s) return;
    e.preventDefault();
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
    const start = s.points.length;
    (events.length ? events : [e]).forEach((ev) => s.points.push(point(ev)));
    drawTail(s, start);
  }

  function onUp(e) {
    const s = active.get(e.pointerId);
    if (!s) return;
    active.delete(e.pointerId);
    // Đoạn cuối tới đúng điểm nhấc bút.
    if (s.points.length > 1) {
      style(s);
      const [x0, y0] = px(s.points[s.points.length - 2]);
      const [x1, y1] = px(s.points[s.points.length - 1]);
      ctx.beginPath();
      ctx.moveTo((x0 + x1) / 2, (y0 + y1) / 2);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
  if (ro) ro.observe(host);
  resize();

  return {
    canvas,
    resize,
    setTool(patch) {
      Object.assign(tool, patch);
    },
    setEnabled(v) {
      enabled = v;
      if (!v) active.clear();
      canvas.classList.toggle('disabled', !v);
    },
    clear() {
      strokes.length = 0;
      active.clear();
      redraw();
    },
    strokeCount: () => strokes.length,
    destroy() {
      if (ro) ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.remove();
    },
  };
}
