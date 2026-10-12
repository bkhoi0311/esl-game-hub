// Hàm đo chất lượng nét (THUẦN, không trình duyệt). Viết lại bằng JS từ ink-lab/metrics.py + harness.mjs (PLAN-INK mục 3.2).
// Đơn vị đo: điểm ảnh vật lý. Ảnh = { w, h, d: RGBA phẳng }.

// ---------- tạo mẫu pointer giả (sao y harness) ----------
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
export const SHAPES = {
  H: { len: 520, speed: 120, f: (s) => [60 + s * 520 / Math.hypot(520, 26), 150 + s * 26 / Math.hypot(520, 26)] },
  V: { len: 380, speed: 120, f: (s) => [1200 + s * 18 / Math.hypot(18, 380), 90 + s * 380 / Math.hypot(18, 380)] },
  C: { len: 110 * (300 * Math.PI / 180), speed: 180, f: (s) => { const a = (-160 * Math.PI / 180) + s / 110; return [330 + 110 * Math.cos(a), 340 + 110 * Math.sin(a)]; } },
  W: { len: 0, speed: 350, wave: true },
};
function wavePts() {
  const raw = []; for (let x = 700; x <= 1140; x += 0.25) raw.push([x, 300 + 50 * Math.sin(2 * Math.PI * (x - 700) / 150)]);
  const cum = [0]; for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
  return { raw, cum, len: cum[cum.length - 1] };
}
const WV = wavePts();
function at(shape, s) {
  if (shape === 'W') { let i = 0; while (i < WV.cum.length - 1 && WV.cum[i + 1] < s) i++; return WV.raw[i]; }
  return SHAPES[shape].f(s);
}
export const NOISE = { N0: { g: 0, ar: 0, q: 1 / 3 }, N1: { g: 0.8, ar: 0.3, q: 1 }, N2: { g: 0.6, ar: 0.7, q: 1 } };
export const CLIPS = { H: { x: 40, y: 125, width: 560, height: 75 }, V: { x: 1170, y: 70, width: 80, height: 420 }, C: { x: 200, y: 210, width: 260, height: 260 }, W: { x: 680, y: 230, width: 480, height: 140 } };

// -> [[tMs, x, y], ...] nhịp 120 Hz, tăng/giảm tốc 40 px đầu/cuối
export function genSamples(shape, noise, seed) {
  const nz = typeof noise === 'string' ? NOISE[noise] : noise;
  const sh = SHAPES[shape]; const len = shape === 'W' ? WV.len : sh.len;
  const hz = 120, dt = 1000 / hz, ds = sh.speed / hz;
  const r = rng(seed == null ? 1234 + shape.charCodeAt(0) : seed);
  const out = []; let arx = 0, ary = 0;
  let s = 0, t = 0;
  while (s <= len) {
    const [x, y] = at(shape, s);
    arx = 0.9 * arx + nz.ar * Math.sqrt(1 - 0.81) * gauss(r); ary = 0.9 * ary + nz.ar * Math.sqrt(1 - 0.81) * gauss(r);
    let nx = x + nz.g * gauss(r) + arx, ny = y + nz.g * gauss(r) + ary;
    nx = Math.round(nx / nz.q) * nz.q; ny = Math.round(ny / nz.q) * nz.q;
    out.push([t, nx, ny]);
    const ramp = Math.min(1, 0.25 + Math.min(s, len - s) / 40);
    s += ds * ramp; t += dt;
  }
  return out;
}

// ---------- ảnh -> alpha ----------
export function grayOf(img) {
  const n = img.w * img.h, g = new Float64Array(n);
  for (let i = 0; i < n; i++) g[i] = Math.round((299 * img.d[i * 4] + 587 * img.d[i * 4 + 1] + 114 * img.d[i * 4 + 2]) / 1000);
  return g;
}
// alpha = (L-18)/(255-18) kẹp 0..1 (nền bảng #121212)
export function alphaFromRGBA(img) {
  const g = grayOf(img), a = new Float64Array(g.length);
  for (let i = 0; i < g.length; i++) a[i] = Math.min(1, Math.max(0, (g[i] - 18) / (255 - 18)));
  return a;
}

// ---------- đo ----------
export function movingAvg(x, w) {
  const n = x.length, p = w >> 1, out = new Float64Array(n);
  if (!n) return out;
  const xp = new Float64Array(n + 2 * p);
  for (let i = 0; i < xp.length; i++) xp[i] = x[Math.min(n - 1, Math.max(0, i - p))];
  let sum = 0;
  for (let j = 0; j < w; j++) sum += xp[j];
  out[0] = sum / w;
  for (let i = 1; i < n; i++) { sum += xp[i + w - 1] - xp[i - 1]; out[i] = sum / w; }
  return out;
}
const mean = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; };
const std = (a) => { const m = mean(a); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return a.length ? Math.sqrt(s / a.length) : 0; };
const sub = (a, b) => { const o = new Float64Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] - b[i]; return o; };
const r3 = (v) => Math.round(v * 1000) / 1000;

function transposeAlpha(A, w, h) {
  const T = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) T[x * h + y] = A[y * w + x];
  return T;
}

// biên trên/dưới mỗi cột (nội suy dưới điểm ảnh tại alpha 0,5)
function edgesCols(A, w, h) {
  const tops = [], bots = [];
  for (let x = 0; x < w; x++) {
    let i = -1, j = -1;
    for (let y = 0; y < h; y++) if (A[y * w + x] >= 0.5) { if (i < 0) i = y; j = y; }
    if (i < 0) continue;
    const c = (y) => A[y * w + x];
    const t = i > 0 && c(i) !== c(i - 1) ? i - (c(i) - 0.5) / (c(i) - c(i - 1)) : i;
    const b = j < h - 1 && c(j) !== c(j + 1) ? j + (c(j) - 0.5) / (c(j) - c(j + 1)) : j;
    tops.push(t); bots.push(b);
  }
  return { t: Float64Array.from(tops), b: Float64Array.from(bots) };
}

// Nét gần ngang trong ảnh alpha w x h (transpose=true: nét gần dọc). Bỏ marginPx cột mỗi đầu.
// k = hệ số phóng (điểm ảnh vật lý / CSS px) để quy beads về mỗi 100 CSS px.
export function lineMetrics(alpha, w, h, marginPx, transpose, k) {
  let A = alpha, W = w, H = h;
  if (transpose) { A = transposeAlpha(alpha, w, h); W = h; H = w; }
  const e = edgesCols(A, W, H);
  // cắt theo cột có nét: edgesCols đã bỏ cột rỗng; giống Python, cắt margin trên danh sách cột có nét
  const t = e.t.subarray(marginPx, e.t.length - marginPx), b = e.b.subarray(marginPx, e.b.length - marginPx);
  const c = new Float64Array(t.length), wd = new Float64Array(t.length);
  for (let i = 0; i < t.length; i++) { c[i] = (t[i] + b[i]) / 2; wd[i] = b[i] - t[i]; }
  const hf = (std(sub(t, movingAvg(t, 15))) + std(sub(b, movingAvg(b, 15)))) / 2;
  const wob = std(sub(c, movingAvg(c, 181)));
  const wr = sub(wd, movingAvg(wd, 31));
  let peaks = 0;
  for (let i = 3; i < wr.length - 3; i++) {
    let mx = -Infinity; for (let j = i - 3; j <= i + 3; j++) if (wr[j] > mx) mx = wr[j];
    if (wr[i] === mx && wr[i] > 0.75) peaks++;
  }
  const wm = mean(wd);
  return { hf: r3(hf), wob: r3(wob), wcv: r3(std(wd) / wm), wmean: Math.round(wm * 100) / 100, beads100: Math.round(peaks / (wd.length / (100 * (k || 3))) * 100) / 100 };
}

// Cung tròn tâm (cx,cy) px vật lý, bán kính ~ r0 (px vật lý). trimDeg: bỏ mỗi đầu (cung từ -160° tới +140°).
export function arcMetrics(alpha, w, h, cx, cy, r0, trimDeg) {
  r0 = r0 || 330; trimDeg = trimDeg == null ? 15 : trimDeg;
  const samp = (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    if (x0 < 0 || y0 < 0 || x0 + 1 >= w || y0 + 1 >= h) return 0;
    return alpha[y0 * w + x0] * (1 - fx) * (1 - fy) + alpha[y0 * w + x0 + 1] * fx * (1 - fy) + alpha[(y0 + 1) * w + x0] * (1 - fx) * fy + alpha[(y0 + 1) * w + x0 + 1] * fx * fy;
  };
  const ro = [], ri = [];
  const a0 = -160 + trimDeg, a1 = 140 - trimDeg;
  const nr = Math.round(100 / 0.25);
  for (let ad = a0; ad < a1; ad += 0.1) {
    const a = ad * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const v = new Float64Array(nr);
    for (let q = 0; q < nr; q++) v[q] = samp(cx + (r0 - 50 + q * 0.25) * ca, cy + (r0 - 50 + q * 0.25) * sa);
    let i = -1, j = -1;
    for (let q = 0; q < nr; q++) if (v[q] >= 0.5) { if (i < 0) i = q; j = q; }
    if (i < 1 || j >= nr - 1) continue;
    const rs = (q) => r0 - 50 + q * 0.25;
    ri.push(rs(i) - 0.25 * (v[i] - 0.5) / Math.max(1e-6, v[i] - v[i - 1]));
    ro.push(rs(j) + 0.25 * (v[j] - 0.5) / Math.max(1e-6, v[j] - v[j + 1]));
  }
  const RO = Float64Array.from(ro), RI = Float64Array.from(ri);
  const hf = (std(sub(RO, movingAvg(RO, 26))) + std(sub(RI, movingAvg(RI, 26)))) / 2;
  const c = new Float64Array(RO.length), wd = new Float64Array(RO.length);
  for (let i = 0; i < RO.length; i++) { c[i] = (RO[i] + RI[i]) / 2; wd[i] = RO[i] - RI[i]; }
  const wob = std(sub(c, movingAvg(c, 311)));
  const wm = mean(wd);
  return { hf: r3(hf), wob: r3(wob), wcv: r3(std(wd) / wm), wmean: Math.round(wm * 100) / 100 };
}

// % điểm ảnh của nét đổi giữa hai ảnh (|Δ| > 96) / điểm ảnh mực (max > 128). Trả 0..1.
export function changedFraction(imgA, imgB) {
  const a = grayOf(imgA), b = grayOf(imgB);
  let ink = 0, ch = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.max(a[i], b[i]) > 128) ink++;
    if (Math.abs(a[i] - b[i]) > 96) ch++;
  }
  return ink ? ch / ink : 0;
}
