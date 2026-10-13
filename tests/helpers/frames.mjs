// Khung hình xám 256x144 tổng hợp, tất định, để test Statue Freeze (motion.js) không cần trình duyệt.
export const W = 256;
export const H = 144;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(r) {
  const u = Math.max(1e-9, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

// Cảnh: nền ô 8x8 ngẫu nhiên 70-190 + gradient dọc; 2 người (x 96-144 và x 176-224), y 40-140.
export function makeScene(seed) {
  const r = rng(seed * 7919 + 13);
  const bg = new Float32Array(W * H);
  const tile = new Float32Array((W / 8) * (H / 8));
  for (let i = 0; i < tile.length; i++) tile[i] = 70 + r() * 120;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) bg[y * W + x] = tile[(y >> 3) * (W / 8) + (x >> 3)] + (y / H - 0.5) * 20;
  return { seed, bg, people: [{ x0: 96, y0: 40 }, { x0: 176, y0: 40 }] };
}

const fillRect = (img, x, y, w, h, v) => {
  for (let yy = Math.max(0, Math.round(y)); yy < Math.min(H, Math.round(y + h)); yy++) {
    for (let xx = Math.max(0, Math.round(x)); xx < Math.min(W, Math.round(x + w)); xx++) img[yy * W + xx] = v;
  }
};
const fillCircle = (img, cx, cy, rad, v) => {
  for (let y = Math.floor(cy - rad); y <= cy + rad; y++) {
    for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
      if (x >= 0 && x < W && y >= 0 && y < H && (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) img[y * W + x] = v;
    }
  }
};

// state: { hand: [{dx,dy}|null,...], sleeve: [dx,...], arm: dx|null, gain, salt }
export function render(scene, state, r) {
  const img = Float32Array.from(scene.bg);
  scene.people.forEach((p, i) => {
    fillRect(img, p.x0, p.y0 + 20, 40, 70, 120); // thân áo
    fillCircle(img, p.x0 + 20, p.y0 + 8, 12, 170); // đầu
    const sl = (state.sleeve && state.sleeve[i]) || 0;
    fillRect(img, p.x0 + 4 + sl, p.y0 + 30, 10, 36, 128); // ống tay áo (tương phản 8)
    const h = state.hand && state.hand[i];
    if (h) fillRect(img, p.x0 + 24 + h.dx, p.y0 + 50 + h.dy, 6, 6, state.handV || 145); // bàn tay (tương phản 25 so với áo)
  });
  if (state.arm != null) fillRect(img, 20 + state.arm, 50, 14, 50, 235); // cánh tay quét qua nền, ngoài thân
  const out = new Uint8Array(W * H);
  const flick = new Float32Array((W / 8) * (H / 8));
  for (let i = 0; i < flick.length; i++) flick[i] = gauss(r) * 1.2; // nhấp nháy nén theo khối 8x8
  const g = state.gain || 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = (img[y * W + x] + gauss(r) * 2.5 + flick[(y >> 3) * (W / 8) + (x >> 3)]) * g;
      out[y * W + x] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  if (state.salt) {
    for (let k = 0; k < state.salt; k++) {
      const i = Math.floor(r() * out.length);
      out[i] = Math.max(0, Math.min(255, out[i] + (r() < 0.5 ? -60 : 60)));
    }
  }
  return out;
}

export const CAL_MS = 3000;
export const RED_MS = 3900;
export const HZ = 15;
export const DT = 1000 / HZ;

// Hộp (ô 16x9) bao quanh người/tay để chấm "đúng ô": trả về cột/hàng ô của một hình chữ nhật điểm ảnh, nới 1 ô.
export function cellBox(x0, y0, x1, y1, margin = 1) {
  return { c0: Math.floor(x0 / 16) - margin, c1: Math.floor(x1 / 16) + margin, r0: Math.floor(y0 / 16) - margin, r1: Math.floor(y1 / 16) + margin };
}

// Trạng thái động theo loại, tại thời điểm tr (ms kể từ lúc Freeze).
function stateFor(kind, tr, k, opts) {
  const tri = (t, period, amp) => { const ph = (t / period) % 1; return amp * (ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4); };
  const s = { hand: [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }], sleeve: [0, 0], arm: null, gain: 1, salt: 0 };
  switch (kind) {
    case 'still': break;
    case 'handInBody': // tay dời 3 px mỗi 200 ms, tam giác biên độ 12 px
      s.hand[0] = { dx: tri(tr, 1600, 12), dy: 0 }; break;
    case 'sleeveSwing': // ống tay tương phản 8 lắc +-6 px
      s.sleeve[0] = tri(tr, 1200, 6); break;
    case 'slowDrift': { // 1 px mỗi 2 khung (tổng 12 px) bắt đầu 0,9 s sau Freeze
      const n = Math.max(0, Math.min(24, Math.floor((tr - 900) / DT)));
      s.hand[0] = { dx: Math.floor(n / 2), dy: 0 }; break; }
    case 'bigWaveOutside':
      s.arm = tri(tr, 1000, 40); break;
    case 'aeRamp': {
      const u = Math.max(0, Math.min(1, (tr - 1500) / 1000));
      s.gain = 1 + 0.15 * u; break; }
    case 'salt': s.salt = 6; break;
    case 'dupFrames': s.hand[0] = { dx: tri(tr, 1600, 12), dy: 0 }; break;
    case 'leftOnly': s.hand[0] = { dx: tri(tr, 1600, 6) - 6, dy: 0 }; s.hand[1] = { dx: 0, dy: 0 }; break; // dx -12..0: ở nửa trái
    case 'bothHands': s.hand[0] = { dx: tri(tr, 1600, 12), dy: 0 }; s.hand[1] = { dx: tri(tr, 1500, 12), dy: 0 }; break;
    default: throw new Error(`kind ${kind}?`);
  }
  if (opts && opts.handV) s.handV = opts.handV;
  return s;
}

// Chuỗi khung 15 Hz: hiệu chỉnh 3 s (đứng yên, hoặc fidget = tỉ lệ khung có tay cử động) rồi pha đỏ 3,9 s.
// Trả về { cal: [{gray,t}], red: [{gray,t}], redT0 }.
export function sequence(kind, seed, { fidget = 0, handV = 0 } = {}) {
  const scene = makeScene(seed);
  const r = rng(seed * 104729 + 7);
  const cal = [];
  const nCal = Math.round(CAL_MS / DT);
  for (let k = 0; k < nCal; k++) {
    const st = { hand: [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }], sleeve: [0, 0], gain: 1 };
    if (fidget && r() < fidget) st.hand[0] = { dx: Math.floor(r() * 24) - 12, dy: Math.floor(r() * 8) - 4 };
    cal.push({ gray: render(scene, st, r), t: k * DT });
  }
  const red = [];
  const nRed = Math.round(RED_MS / DT);
  const redT0 = nCal * DT + 200;
  let held = null;
  for (let k = 0; k < nRed; k++) {
    const tr = k * DT;
    let gray;
    if (kind === 'dupFrames' && k % 2 === 1 && held) gray = held; // camera 7,5 fps: khung lặp 2 lần
    else {
      gray = render(scene, stateFor(kind, tr, k, { handV }), r);
      held = gray;
    }
    red.push({ gray, t: redT0 + tr });
  }
  return { cal, red, redT0, scene, calT0: 0 };
}

// Hộp ô của từng loại để chấm đúng vị trí.
export function targetBox(kind) {
  const p0 = { x0: 96, y0: 40 };
  switch (kind) {
    case 'handInBody':
    case 'dupFrames':
    case 'leftOnly':
    case 'slowDrift': return cellBox(p0.x0 + 24 - 12, p0.y0 + 50, p0.x0 + 24 + 12 + 6, p0.y0 + 56);
    case 'sleeveSwing': return cellBox(p0.x0 + 4 - 6, p0.y0 + 30, p0.x0 + 14 + 6, p0.y0 + 66);
    case 'bigWaveOutside': return cellBox(20 - 40, 50, 34 + 40, 100);
    default: return null;
  }
}

// Chạy 1 detector qua chuỗi; trả về kết quả endRed + số ô trong hộp.
export function run(detector, seq, { sensitivity } = {}) {
  if (sensitivity) detector.setSensitivity(sensitivity);
  detector.startCalibration(seq.cal[0].t);
  for (const f of seq.cal) detector.push(f.gray, f.t);
  const cal = detector.finishCalibration();
  detector.startRed(seq.redT0);
  for (const f of seq.red) detector.push(f.gray, f.t);
  const res = detector.endRed();
  return { ...res, cal };
}

export const countFlagged = (res) => res.flagged.reduce((a, b) => a + b, 0);
export function inBox(res, box) {
  let n = 0;
  res.flagged.forEach((f, i) => {
    if (!f) return;
    const c = i % 16;
    const rr = (i / 16) | 0;
    if (c >= box.c0 && c <= box.c1 && rr >= box.r0 && rr <= box.r1) n++;
  });
  return n;
}
