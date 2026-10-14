// Khung 256x144 tổng hợp có camera TỰ ĐỔI KHUNG (camera AI kiểu ClassIn S1): dời, phóng to, cắt sang người khác, trôi chậm.
// Cảnh như frames.mjs (nền ô 8x8, 2 người) + tuỳ chọn tường phẳng nửa trên (flat) để tái hiện lỗi cũ. PLAN-S1-REFRAME.md.
import { W, H, rng, gauss, makeScene } from './frames.mjs';

export const DT = 1000 / 15;

function drawClean(scene, st) {
  const img = Float32Array.from(scene.bg);
  if (st.flat) for (let y = 0; y < 70; y++) for (let x = 0; x < W; x++) img[y * W + x] = 150 + (y / H) * 6; // tường trơn
  const rect = (x, y, w, h, v) => {
    for (let yy = Math.max(0, Math.round(y)); yy < Math.min(H, Math.round(y + h)); yy++) for (let xx = Math.max(0, Math.round(x)); xx < Math.min(W, Math.round(x + w)); xx++) img[yy * W + xx] = v;
  };
  const people = st.people || scene.people;
  people.forEach((p, i) => {
    rect(p.x0, p.y0 + 20, 40, 70, 120);
    for (let y = p.y0 - 4; y <= p.y0 + 20; y++) for (let x = p.x0 + 8; x <= p.x0 + 32; x++) {
      if (x >= 0 && x < W && y >= 0 && y < H && (x - p.x0 - 20) ** 2 + (y - p.y0 - 8) ** 2 <= 144) img[y * W + x] = 170;
    }
    const h = st.hand && st.hand[i];
    if (h) rect(p.x0 + 24 + h.dx, p.y0 + 50 + h.dy, 6, 6, 145);
  });
  if (st.arm != null) rect(20 + st.arm, 50, 14, 50, 235);
  return img;
}

// v = { s, dx, dy }: camera phóng s lần quanh tâm ảnh rồi dời (dx, dy) điểm ảnh (toạ độ cảnh).
function warp(img, v) {
  if (!v || (v.s === 1 && !v.dx && !v.dy)) return img;
  const out = new Float32Array(W * H);
  const cx = W / 2;
  const cy = H / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = Math.max(0, Math.min(W - 1.001, cx + (x - cx) / v.s + v.dx));
    const sy = Math.max(0, Math.min(H - 1.001, cy + (y - cy) / v.s + v.dy));
    const x0 = sx | 0; const y0 = sy | 0; const fx = sx - x0; const fy = sy - y0; const k = y0 * W + x0;
    out[y * W + x] = (img[k] * (1 - fx) + img[k + 1] * fx) * (1 - fy) + (img[k + W] * (1 - fx) + img[k + W + 1] * fx) * fy;
  }
  return out;
}

function noise(img, r, gain = 1) {
  const out = new Uint8Array(W * H);
  const fl = new Float32Array((W / 8) * (H / 8));
  for (let i = 0; i < fl.length; i++) fl[i] = gauss(r) * 1.2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = (img[y * W + x] + gauss(r) * 2.5 + fl[(y >> 3) * (W / 8) + (x >> 3)]) * gain;
    out[y * W + x] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
  }
  return out;
}

const ramp = (t, t0, dur) => Math.max(0, Math.min(1, (t - t0) / dur));
const tri = (t, period, amp) => { const ph = (t / period) % 1; return amp * (ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4); };

// Góc nhìn camera theo thời gian t (ms, tính từ đầu chuỗi con), sự kiện bắt đầu ở at (ms).
export function viewAt(kind, t, at = 1500) {
  const u = ramp(t, at, 300);
  switch (kind) {
    case 'none': return { s: 1, dx: 0, dy: 0 };
    case 'pan': return { s: 1, dx: 30 * u, dy: 6 * u }; // dời 30 px trong 0,3 s
    case 'zoom': return { s: 1 + 0.6 * u, dx: 0, dy: 0 }; // phóng 1,0 -> 1,6 trong 0,3 s
    case 'jump': return t >= at ? { s: 1.6, dx: 40, dy: 10 } : { s: 1, dx: 0, dy: 0 }; // nhảy sang người khác (cắt)
    case 'drift': return { s: 1, dx: Math.min(30, 0.6 * (t / DT)), dy: 0 }; // trôi 9 px/s suốt
    case 'breathe': return { s: 1 + 0.04 * Math.sin(t / 400), dx: 0, dy: 0 }; // phóng ra vào liên tục
    default: throw new Error(`view ${kind}?`);
  }
}

// Trạng thái người: still | wave (tay trong thân) | bigWave (tay quét nền) | walk | light | crowd
export function actorAt(kind, t, k, seed) {
  const st = { hand: [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }], gain: 1 };
  if (kind === 'wave') st.hand[0] = { dx: tri(t, 1600, 12), dy: 0 };
  if (kind === 'bigWave') st.arm = tri(t, 1000, 40);
  if (kind === 'walk') st.people = [{ x0: 60 + Math.round(k * 2), y0: 40 }, { x0: 176, y0: 40 }];
  if (kind === 'light') st.gain = 1 + 0.2 * ramp(t, 1500, 1000);
  if (kind === 'crowd') { const rr = rng(k * 7 + seed); st.people = Array.from({ length: 8 }, (_, i) => ({ x0: 4 + i * 31 + Math.round(rr() * 8 - 4), y0: 40 + Math.round(rr() * 8 - 4) })); }
  return st;
}

// Tạo hàm sinh khung: frame(t, { view, actor, at, base }) -> Uint8Array 256x144. base: góc nhìn cộng thêm (khung sau đổi).
export function makeCamera(seed, { flat = false } = {}) {
  const scene = makeScene(seed);
  const r = rng(seed * 104729 + 11);
  let k = 0;
  return (t, { view = 'none', actor = 'still', at = 1500, base = null } = {}) => {
    const st = { ...actorAt(actor, t, k++, seed), flat };
    let v = viewAt(view, t, at);
    if (base) v = { s: base.s * v.s, dx: base.dx + v.dx, dy: base.dy + v.dy };
    return noise(warp(drawClean(scene, st), v), r, st.gain);
  };
}
