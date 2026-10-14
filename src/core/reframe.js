// Phát hiện camera tự đổi khung (camera AI như ClassIn S1 tự phóng to / dời khung theo người): thuần JS, không DOM.
// Đầu vào: ảnh xám nhỏ 64x36 (Float32Array hoặc Uint8Array). Ước lượng chuyển động TOÀN CỤC giữa 2 khung bằng khớp khối
// (32 khối 8x8, tìm +-6 px, SAD bỏ trung bình nên không nhạy đổi sáng), khớp mô hình dời + co giãn (dx, dy, s),
// rồi phân biệt với người cử động (cục bộ): camera đổi khung khi đa số khối có vân cùng dời theo MỘT mô hình và trải đủ
// 3/4 góc ảnh, HOẶC tương quan toàn ảnh sụp (cắt sang khung khác hẳn). Xem PLAN-S1-REFRAME.md.
export const RF = {
  DW: 64, DH: 36, PS: 8, R: 6,
  TEX_MIN: 2.0, // độ vân tối thiểu của khối (trung bình |gradient|, thang 0..255) để được dùng
  SAD_ABS: 1.0, SAD_REL: 0.3, // khối "dời" khi SAD tốt nhất thấp hơn SAD tại chỗ ít nhất max(ABS, REL*SAD0)
  INLIER_PX: 1.5, MOVED_FRAC: 0.5, INLIER_FRAC: 0.6, MAG_MIN: 0.75, QUADS_MIN: 3,
  GATE_NCC: 0.95, // tương quan toàn ảnh >= 0.95: chắc chắn không đổi khung, bỏ qua khớp khối (rẻ)
  CUT_NCC: 0.5, // < 0.5: cắt sang khung khác hẳn
  SHORT_MS: 200, LONG_MS: 1000, LONG_EVERY_MS: 250,
  STABLE_MS: 1200, // không còn dấu hiệu đổi khung trong 1,2 s thì coi là ổn định (> LONG_MS để trôi chậm không chập chờn)
  RING: 24, REPEAT_WINDOW_MS: 60000, REPEAT_N: 3,
  FULL_GAP_MS: 120, // khớp khối (đắt) tối đa ~8 lần/giây; giữa hai lần chỉ chạy cổng tương quan (rẻ)
};
const N = RF.DW * RF.DH;

// 256x144 -> 64x36 (trung bình 4x4). Dùng cho Statue (đã có ảnh 256x144).
export function down4(gray, w = 256, h = 144, out = new Float32Array(N)) {
  out.fill(0);
  const ow = w >> 2;
  for (let y = 0; y < h; y++) {
    const r = (y >> 2) * ow;
    const k0 = y * w;
    for (let x = 0; x < w; x++) out[r + (x >> 2)] += gray[k0 + x];
  }
  for (let i = 0; i < out.length; i++) out[i] /= 16;
  return out;
}

export function ncc(a, b) {
  let ma = 0;
  let mb = 0;
  const n = a.length;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) { const u = a[i] - ma; const v = b[i] - mb; sab += u * v; saa += u * u; sbb += v * v; }
  if (saa < 1e-6 || sbb < 1e-6) return 1; // ảnh phẳng (tối đen / che ống kính): không kết luận
  return sab / Math.sqrt(saa * sbb);
}

// Dời của từng khối 8x8 (từ a sang b), SAD đã trừ chênh lệch trung bình (bù sáng).
export function patchShifts(a, b) {
  const { DW, DH, PS, R } = RF;
  const pts = [];
  for (let py = 0; py + PS <= DH; py += PS) {
    for (let px = 0; px + PS <= DW; px += PS) {
      let tex = 0;
      for (let y = py; y < py + PS; y++) {
        for (let x = px; x < px + PS; x++) {
          const k = y * DW + x;
          if (x + 1 < px + PS) tex += Math.abs(a[k + 1] - a[k]);
          if (y + 1 < DH) tex += Math.abs(a[k + DW] - a[k]);
        }
      }
      tex /= PS * PS;
      let best = Infinity;
      let bx = 0;
      let by = 0;
      let sad0 = 0;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          let n = 0;
          let mb = 0;
          for (let y = py; y < py + PS; y++) {
            const yy = y + dy;
            if (yy < 0 || yy >= DH) continue;
            for (let x = px; x < px + PS; x++) {
              const xx = x + dx;
              if (xx < 0 || xx >= DW) continue;
              mb += b[yy * DW + xx] - a[y * DW + x];
              n++;
            }
          }
          if (n < PS * PS * 0.6) continue;
          mb /= n;
          let s = 0;
          for (let y = py; y < py + PS; y++) {
            const yy = y + dy;
            if (yy < 0 || yy >= DH) continue;
            for (let x = px; x < px + PS; x++) {
              const xx = x + dx;
              if (xx < 0 || xx >= DW) continue;
              s += Math.abs(b[yy * DW + xx] - a[y * DW + x] - mb);
            }
          }
          s /= n;
          if (!dx && !dy) sad0 = s;
          if (s < best - 1e-6 || (Math.abs(s - best) <= 1e-6 && dx * dx + dy * dy < bx * bx + by * by)) { best = s; bx = dx; by = dy; }
        }
      }
      if (!(sad0 - best > Math.max(RF.SAD_ABS, RF.SAD_REL * sad0))) { bx = 0; by = 0; }
      pts.push({ x: px + PS / 2, y: py + PS / 2, dx: bx, dy: by, tex });
    }
  }
  return pts;
}

// Khớp u = k*(x-cx) + tx, v = k*(y-cy) + ty (k = s-1) trên các khối có vân.
export function fitSimilarity(pts) {
  const cx = RF.DW / 2;
  const cy = RF.DH / 2;
  const use = pts.filter((p) => p.tex > RF.TEX_MIN);
  if (use.length < 6) return null;
  const n = use.length;
  let sX = 0; let sY = 0; let sXX = 0; let sU = 0; let sV = 0; let sXU = 0;
  for (const p of use) {
    const X = p.x - cx; const Y = p.y - cy;
    sX += X; sY += Y; sXX += X * X + Y * Y; sU += p.dx; sV += p.dy; sXU += X * p.dx + Y * p.dy;
  }
  const det = sXX - (sX * sX + sY * sY) / n;
  const k = det > 1e-6 ? (sXU - (sX * sU + sY * sV) / n) / det : 0;
  const tx = (sU - k * sX) / n;
  const ty = (sV - k * sY) / n;
  let inl = 0; let moved = 0;
  const quads = new Set();
  for (const p of use) {
    const ok = Math.hypot(k * (p.x - cx) + tx - p.dx, k * (p.y - cy) + ty - p.dy) <= RF.INLIER_PX;
    if (ok) inl++;
    if (p.dx || p.dy) { moved++; if (ok) quads.add((p.x < cx ? 0 : 1) + (p.y < cy ? 0 : 2)); }
  }
  return { k, tx, ty, inl: inl / n, moved: moved / n, quads: quads.size, n };
}

// So 2 ảnh 64x36. kind: 'shift' (dời/co giãn đồng loạt) | 'cut' (khung khác hẳn) | null.
export function judgePair(a, b, allowFull = true) {
  const c = ncc(a, b);
  if (c >= RF.GATE_NCC) return { kind: null, ncc: c, fit: null };
  if (c < RF.CUT_NCC) return { kind: 'cut', ncc: c, fit: null };
  if (!allowFull) return { kind: null, ncc: c, fit: null, skipped: true };
  const fit = fitSimilarity(patchShifts(a, b));
  if (!fit) return { kind: null, ncc: c, fit };
  const mag = Math.hypot(fit.tx, fit.ty) + Math.abs(fit.k) * 20;
  const shift = fit.moved >= RF.MOVED_FRAC && fit.inl >= RF.INLIER_FRAC && mag >= RF.MAG_MIN && fit.quads >= RF.QUADS_MIN;
  return { kind: shift ? 'shift' : null, ncc: c, fit, mag };
}

// Theo dõi liên tục. push(small, t) trả về { moving, started, ended, kind }.
// started: khung đầu tiên phát hiện đổi khung; ended: khung đầu tiên ổn định trở lại (sau STABLE_MS không còn dấu hiệu).
export function createReframeWatch() {
  const ring = Array.from({ length: RF.RING }, () => ({ img: new Float32Array(N), t: -Infinity }));
  let head = 0;
  let moving = false;
  let lastHit = -Infinity;
  let movingSince = 0;
  let lastLong = -Infinity;
  let lastFull = -Infinity;
  const recent = [];
  const judge = (a, b, t) => {
    const j = judgePair(a, b, t - lastFull >= RF.FULL_GAP_MS);
    if (j.fit !== null || (!j.skipped && j.kind === null && j.ncc < RF.GATE_NCC)) lastFull = t;
    return j;
  };
  const st = { events: 0, lastKind: '', lastSettleMs: 0, ncc: 1, totalMovingMs: 0, repeatedWarned: false };
  const find = (t, ageMs, notBefore) => {
    let best = null;
    for (const f of ring) {
      if (f.t === -Infinity || f.t < notBefore) continue;
      if (t - f.t >= ageMs - 6 && (!best || f.t > best.t)) best = f;
    }
    return best;
  };
  return {
    push(small, t) {
      const slot = ring[head];
      head = (head + 1) % RF.RING;
      slot.img.set(small);
      slot.t = t;
      let kind = null;
      const s = find(t, RF.SHORT_MS, -Infinity);
      if (s && s !== slot) {
        const j = judge(s.img, small, t);
        st.ncc = j.ncc;
        kind = j.kind;
      }
      // So xa (1 s) để bắt trôi chậm; chỉ dùng ảnh mới hơn lần đổi khung gần nhất.
      if (!kind && t - lastLong >= RF.LONG_EVERY_MS) {
        const l = find(t, RF.LONG_MS, lastHit);
        if (l && l !== slot) {
          lastLong = t;
          kind = judge(l.img, small, t).kind;
        }
      }
      let started = false;
      let ended = false;
      if (kind) {
        lastHit = t;
        st.lastKind = kind;
        if (!moving) {
          moving = true;
          started = true;
          movingSince = t;
          st.events++;
          recent.push(t);
        }
      } else if (moving && t - lastHit >= RF.STABLE_MS) {
        moving = false;
        ended = true;
        st.lastSettleMs = Math.round(t - movingSince);
        st.totalMovingMs += t - movingSince;
      }
      while (recent.length && t - recent[0] > RF.REPEAT_WINDOW_MS) recent.shift();
      return { moving, started, ended, kind, repeated: recent.length >= RF.REPEAT_N };
    },
    reset() {
      for (const f of ring) f.t = -Infinity;
      moving = false;
      lastHit = -Infinity;
      lastLong = -Infinity;
      lastFull = -Infinity;
    },
    get moving() { return moving; },
    stats() { return { ...st, moving, recent: recent.length }; },
  };
}
