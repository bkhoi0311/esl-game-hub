// Statue Freeze: kịch bản người TRÁI (person 0) cử động lúc hiệu chỉnh (cúi đầu, lắc, gãi) và TV/quạt nhấp nháy. Dùng cho C12–C14.
// Người có vân (tóc/áo) để cử động đổi nhiều điểm ảnh như camera thật. Xem PLAN-STATUE-FIX.md.
import { W, H, rng, gauss, makeScene, CAL_MS, RED_MS, DT } from './frames.mjs';

function tex(seed, w, h, amp) { const r = rng(seed); const t = new Float32Array(w * h); for (let i = 0; i < t.length; i++) t[i] = (r() - 0.5) * 2 * amp; return t; }
const TEX = tex(99, 64, 64, 30); // vân tóc/áo đi theo người
const TVT = tex(7, 512, 64, 90);

function drawPerson(img, p, o) {
  const tx = o.tx || 0, hy = o.hy || 0, hx = o.hx || 0;
  const x0 = p.x0 + tx, y0 = p.y0;
  for (let y = y0 + 20 + Math.round(hy / 2); y < y0 + 90; y++) for (let x = Math.round(x0); x < x0 + 40; x++) if (x >= 0 && x < W && y >= 0 && y < H) img[y * W + x] = 120 + TEX[((y - y0 - Math.round(hy/2)) & 63) * 64 + ((x - Math.round(x0)) & 63)] * 0.6;
  const cx = x0 + 20 + hx, cy = y0 + 8 + hy, rad = 14;
  for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
    if (x >= 0 && x < W && y >= 0 && y < H && (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) img[y * W + x] = 60 + TEX[((y - Math.round(cy)) & 63) * 64 + ((x - Math.round(cx)) & 63)];
  }
  if (o.hand) { const hx2 = x0 + 24 + o.hand.dx, hy2 = y0 + 50 + o.hand.dy; for (let y = hy2; y < hy2 + 6; y++) for (let x = hx2; x < hx2 + 6; x++) if (x>=0&&x<W&&y>=0&&y<H) img[Math.round(y) * W + Math.round(x)] = 145; }
  if (o.scr) { const sx = x0 + 30 + o.scr.dx, sy = y0 + 4 + o.scr.dy; for (let y = sy; y < sy + 10; y++) for (let x = sx; x < sx + 8; x++) if (x>=0&&x<W&&y>=0&&y<H) img[Math.round(y) * W + Math.round(x)] = 200; }
}

function renderX(scene, st, r, frameNo) {
  const img = Float32Array.from(scene.bg);
  scene.people.forEach((p, i) => drawPerson(img, p, (st.p && st.p[i]) || {}));
  if (st.tv) { // TV: nội dung đổi mỗi khung (x 16..64, y 16..48)
    const off = (frameNo * 37) % 448;
    for (let y = 16; y < 48; y++) for (let x = 16; x < 64; x++) img[y * W + x] = 130 + TVT[(y & 63) * 512 + ((x + off) % 512)];
  }
  if (st.fan) { // quạt: thanh sáng quay quanh (220, 24) bán kính 18
    const a = frameNo * 0.9;
    for (const da of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) for (let rr = 0; rr < 18; rr += 0.5) for (let w = -2; w <= 2; w++) {
      const x = Math.round(220 + Math.cos(a + da) * rr - Math.sin(a + da) * w), y = Math.round(24 + Math.sin(a + da) * rr + Math.cos(a + da) * w);
      if (x >= 0 && x < W && y >= 0 && y < H) img[y * W + x] = 230;
    }
  }
  const out = new Uint8Array(W * H);
  const flick = new Float32Array((W / 8) * (H / 8));
  for (let i = 0; i < flick.length; i++) flick[i] = gauss(r) * 1.2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = img[y * W + x] + gauss(r) * 2.5 + flick[(y >> 3) * (W / 8) + (x >> 3)];
    out[y * W + x] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
  }
  return out;
}

const tri = (t, period, amp) => { const ph = (t / period) % 1; return amp * (ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4); };
// calKind: none | bowHold | bowFidget | scratch | sway ; redKind: still | hand | head ; env: {tv,fan}
export function seqCalMove(calKind, redKind, seed, env = {}) {
  const scene = makeScene(seed);
  const r = rng(seed * 104729 + 7);
  const nCal = Math.round(CAL_MS / DT);
  let last = {};
  const cal = [];
  for (let k = 0; k < nCal; k++) {
    const t = k * DT; const o = {};
    const ph = seed * 0.37;
    if (calKind === 'bowHold') o.hy = Math.max(0, Math.min(1, (t - 800) / 1000)) * 18;
    if (calKind === 'bowFidget') { o.hy = 8 + 6 * Math.sin(2 * Math.PI * t / 900 + ph); o.tx = 3 * Math.sin(2 * Math.PI * t / 1300 + ph); }
    if (calKind === 'scratch') o.scr = { dx: tri(t + ph * 1000, 400, 6), dy: tri(t, 700, 4) };
    if (calKind === 'sway') o.tx = 4 * Math.sin(2 * Math.PI * t / 1500 + ph);
    if (calKind === 'lookDown') { o.hy = 10 + tri(t, 2000, 5); o.hx = tri(t + 300, 1100, 3); }
    last = o;
    cal.push({ gray: renderX(scene, { p: [o, {}], ...env }, r, k), t });
  }
  const redT0 = nCal * DT + 200;
  // giữa pha xanh: người đổi tư thế rồi đứng yên ở tư thế cuối của hiệu chỉnh (cúi) – giữ 'last' tĩnh, chỉ lấy phần tư thế
  const base = { hy: Math.round(last.hy || 0), tx: Math.round(last.tx || 0), hx: Math.round(last.hx || 0) };
  const red = [];
  const nRed = Math.round(RED_MS / DT);
  for (let k = 0; k < nRed; k++) {
    const tr = k * DT; const o = { ...base };
    if (redKind === 'hand') o.hand = { dx: tri(tr, 1600, 12), dy: 0 };
    if (redKind === 'head') o.hx = base.hx + tri(tr, 1600, 4); // lắc đầu nhẹ +-4 px
    red.push({ gray: renderX(scene, { p: [o, {}], ...env }, r, nCal + 3 + k), t: redT0 + tr });
  }
  return { cal, red, redT0 };
}
