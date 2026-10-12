// Nét mực: hằng số + hàm thuần (không DOM). Xem PLAN-INK.md.
export const INK = {
  K_MAX: 3,                       // trần k (backing = CSS x k); k = min(DPR, K_MAX)
  MAX_BACKING_PX: 3840 * 2160,    // trần tổng điểm ảnh backing của #stage
  TILE: 192,                      // CSS px
  MIN_STEP: 1.2,                  // đv vùng, bỏ điểm sát nhau (sau lọc)
  LIVE_PTS: 1500,                 // tách nét
  FILTER: { minCutoff: 1.0, beta: 0.02, dCutoff: 1.0 },   // One Euro, CSS px, Hz
  SPEED: { thin: 0.3, v0: 150, v1: 1500, ema: 0.25 },     // độ dày theo tốc độ (CSS px/s)
  PEN_MIN: 0.35,                  // bút có áp lực thật: wf = PEN_MIN + (1-PEN_MIN)*p
  TAPER: { startMin: 0.55, startLen: 2, endMin: 0.3, endLen: 4, endMaxFrac: 0.4, minLen: 2 }, // độ dài tính theo bội của size
  CATCHUP: { stepMs: 8, maxIter: 8, eps: 0.3 },           // kéo đuôi về điểm nhả tay (CSS px)
  WIDTH_QUANT: 4,                 // gộp đoạn cùng độ dày theo 1/4 điểm ảnh vật lý
};

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function alphaOf(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }

// One Euro 2D: tốc độ dùng chung (độ lớn vector) để không méo hướng.
// push(x, y, tMs) -> [fx, fy, speedPxPerS]; điểm đầu trả nguyên.
export function createPointFilter(o) {
  const mc = o.minCutoff, beta = o.beta, dc = o.dCutoff;
  let px = null, py = 0, vx = 0, vy = 0, tPrev = 0;
  return {
    push(x, y, tMs) {
      if (px === null) { px = x; py = y; tPrev = tMs; return [x, y, 0]; }
      let dt = (tMs - tPrev) / 1000;
      if (!(dt > 0)) dt = 0.004;
      if (dt > 0.05) dt = 0.05;
      tPrev = tMs;
      const ad = alphaOf(dc, dt);
      vx += ad * ((x - px) / dt - vx);
      vy += ad * ((y - py) / dt - vy);
      const sp = Math.sqrt(vx * vx + vy * vy);
      const a = alphaOf(mc + beta * sp, dt);
      px += a * (x - px);
      py += a * (y - py);
      return [px, py, sp];
    },
    last() { return px === null ? null : [px, py]; },
  };
}

// tốc độ -> hệ số độ dày (chậm = đậm 1, nhanh = mảnh tới 1-thin)
export function widthFromSpeed(sp) {
  const S = INK.SPEED;
  return 1 - S.thin * smoothstep(S.v0, S.v1, sp);
}

// Mảng độ dài cung tích luỹ (đv vùng), nối thêm phần còn thiếu, trả lại chính mảng.
export function cumLengths(pts, cum) {
  const n = pts.length / 3;
  if (!cum || !cum.length) cum = [0];
  for (let i = cum.length; i < n; i++) {
    const dx = pts[i * 3] - pts[i * 3 - 3], dy = pts[i * 3 + 1] - pts[i * 3 - 2];
    cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  return cum;
}

// Hệ số thon tại độ dài L. fin=false (đang vẽ): chỉ thon đầu. fin=true (đã chốt): thêm thon cuối.
// contStart/contEnd: đoạn nối của nét bị tách (LIVE_PTS) thì không thon ở chỗ nối.
export function taperFactor(L, total, size, fin, contStart, contEnd) {
  const T = INK.TAPER;
  if (fin && total < T.minLen * size) return 1;          // chấm/nét rất ngắn: tròn đủ dày
  let f = 1;
  if (!contStart) f *= T.startMin + (1 - T.startMin) * smoothstep(0, T.startLen * size, L);
  if (fin && !contEnd) {
    const le = Math.min(T.endLen * size, T.endMaxFrac * total);
    f *= T.endMin + (1 - T.endMin) * smoothstep(0, le, total - L);
  }
  return f;
}

// Độ dày (đv vùng) tại điểm i. s.cum phải đã cập nhật.
export function pointWidth(s, i, fin) {
  const c = s.cum, total = c[c.length - 1];
  const wf = s.pts[i * 3 + 2] > 0 ? s.pts[i * 3 + 2] : 1;
  return s.size * wf * taperFactor(c[i], total, s.size, fin, !!s.contStart, !!s.contEnd);
}

// Chia các đoạn làm mượt [from,to) thành các "lượt" cùng độ dày (đã lượng tử theo q đv).
// segs: kết quả smoothSegments(s.pts, from, to, closeTail).segs. Trả [{ w, segs: [...] }].
export function widthRuns(s, segs, from, fin, q) {
  const n = s.pts.length / 3;
  const runs = [];
  let i = Math.max(1, from), cur = null;
  for (const g of segs) {
    const a = Math.min(i - 1, n - 1), b = Math.min(i, n - 1);
    const w = Math.max(q, Math.round(((pointWidth(s, a, fin) + pointWidth(s, b, fin)) / 2) / q) * q);
    if (!cur || cur.w !== w) { cur = { w, segs: [] }; runs.push(cur); }
    cur.segs.push(g);
    i++;
  }
  return runs;
}

// Hộp bao (đv vùng) của phần đuôi sẽ đổi khi chốt (thon cuối + đoạn closeTail).
export function tailBox(s) {
  const c = cumLengths(s.pts, s.cum); s.cum = c;
  const total = c[c.length - 1], T = INK.TAPER;
  const le = Math.min(T.endLen * s.size, T.endMaxFrac * total) + s.size;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const n = s.pts.length / 3;
  for (let i = n - 1; i >= 0; i--) {
    const x = s.pts[i * 3], y = s.pts[i * 3 + 1];
    if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    if (total - c[i] > le && i < n - 2) break;
  }
  return { minX, minY, maxX, maxY };
}

// Khoá thử nghiệm: chỉ khi test=1.
export function parseInkOverrides(search) {
  const q = new URLSearchParams(search || '');
  if (q.get('test') !== '1') return {};
  const o = {};
  if (q.get('ink') === 'raw') o.raw = true;
  const k = Number(q.get('k'));
  if (q.get('k') && isFinite(k) && k >= 0.5 && k <= 3) o.k = k;
  const lp = Number(q.get('livepts'));
  if (q.get('livepts') && isFinite(lp) && lp >= 100 && lp <= 1500) o.livepts = Math.round(lp);
  return o;
}

export function inkText(k, o) {
  const kk = String(Math.round(k * 100) / 100).replace('.', ',');
  if (o && o.raw) return 'THÔ (test) · k ' + kk + ' · lát ' + INK.TILE + ' px';
  return 'lọc One Euro (mc 1 · β 0,02) · k ' + kk + ' · lát ' + INK.TILE + ' px · thon đầu/cuối';
}
