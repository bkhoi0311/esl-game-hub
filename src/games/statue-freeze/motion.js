// Statue Freeze v2: phát hiện chuyển động thuần JS (không DOM, không AI) để test bằng node --test.
// Đầu vào: ảnh xám 256x144 (đã gương, đã thu nhỏ 2x2). Thuật toán và lý do: PLAN-GAMES-V2.md mục 4.
// Ý chính: đếm SỐ điểm ảnh đổi trên khối 8x8 (không lấy trung bình pha loãng), ngưỡng theo nhiễu cảm biến thật
// và nhiễu riêng từng khối, so ngắn hạn (~200 ms) VÀ so với ảnh mốc (bắt cử động chậm), bù sáng toàn khung,
// bằng chứng có suy giảm thay cho "reset khi hụt một khung".

export const SF = {
  SAMPLE_W: 256, SAMPLE_H: 144, BLOCK: 8, CELLS_X: 16, CELLS_Y: 9,
  PROCESS_MIN_GAP_MS: 60, SHORT_DT_MS: 200, RING: 6,
  CAL_MS: 3000, CAL_SIGMA_MS: 800, CAL_MAX_SAMPLES: 64,
  GRACE_MS: 700, REF_MS: 200, MEASURE_MS: 3000, REF_RETAKE_MS: 300,
  SIGMA_MIN: 1.5, SIGMA_MAX: 8, TAU_MIN: 5, TAU_MAX: 24,
  MIN_COUNT: 2, BASE_COUNT: 2, R_TAU_ADD: 4, R_COUNT_ADD: 1,
  E_ADD: 2, E_ON: 3, R_ON: 3, GLOBAL_FRAC: 0.6, UNSTABLE_FRAC: 0.4,
  GAIN_MIN: 0.75, GAIN_MAX: 1.33,
  // Khối bất ổn (TV, quạt) phải bất ổn ở CẢ UNSTABLE_PARTS phần của cửa sổ hiệu chỉnh; cụm bất ổn > MASK_BLOB_MAX khối
  // (8 hướng, ~8 ô) là người cử động lúc hiệu chỉnh, không che. Xem PLAN-STATUE-FIX.md.
  UNSTABLE_PARTS: 3, MASK_BLOB_MAX: 32,
  TAU_K0: 2.5, TAU_K1: 0, // tau = round((K0 - K1*s) * sigma) + 2
  Q_LOG0: -4, Q_LOG_STEP: 0.1, // xác suất nhiễu cho phép của một khối: 10^(Q_LOG0 + Q_LOG_STEP*(s-1))
};

const BX = SF.SAMPLE_W / SF.BLOCK; // 32
const BY = SF.SAMPLE_H / SF.BLOCK; // 18
const NB = BX * BY; // 576
const NC = SF.CELLS_X * SF.CELLS_Y; // 144
const BLOCK_PX = SF.BLOCK * SF.BLOCK; // 64

export const sensMul = (s) => 1.6 - 0.12 * s;

// Ngưỡng chênh sáng của một điểm ảnh, theo nhiễu cảm biến sigma. Plan đề xuất hạ tau khi tăng độ nhạy, nhưng đo trên khung
// tổng hợp thì hạ tau làm đuôi nhiễu nén dày lên, ngưỡng đếm buộc phải tăng theo và kết quả lại KÉM nhạy (không đơn điệu).
// Nên tau chỉ phụ thuộc sigma (TAU_K1 = 0); toàn bộ độ nhạy nằm ở ngưỡng đếm theo xác suất nhiễu q(s).
export function tauFor(sigma, s) {
  const t = Math.round((SF.TAU_K0 - SF.TAU_K1 * s) * sigma) + 2;
  return Math.min(SF.TAU_MAX, Math.max(SF.TAU_MIN, t));
}

export function rgbaToGray(rgba, n) {
  const out = new Uint8Array(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) out[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  return out;
}

// Trung bình 2x2 (làm tròn) giảm nhiễu hạt khoảng 2 lần.
export function boxDown2(src, w, h) {
  const ow = w >> 1;
  const oh = h >> 1;
  const out = new Uint8Array(ow * oh);
  for (let y = 0; y < oh; y++) {
    const r0 = y * 2 * w;
    const r1 = r0 + w;
    for (let x = 0; x < ow; x++) {
      const k = x * 2;
      out[y * ow + x] = (src[r0 + k] + src[r0 + k + 1] + src[r1 + k] + src[r1 + k + 1] + 2) >> 2;
    }
  }
  return out;
}

// Trung bình sáng của lưới cx x cy ô.
export function cellMeans(gray, w, h, cx, cy, out = new Float32Array(cx * cy)) {
  out.fill(0);
  const cw = w / cx;
  const ch = h / cy;
  for (let y = 0; y < h; y++) {
    const r = Math.min(cy - 1, Math.floor(y / ch));
    for (let x = 0; x < w; x++) out[r * cx + Math.min(cx - 1, Math.floor(x / cw))] += gray[y * w + x];
  }
  const area = cw * ch;
  for (let i = 0; i < out.length; i++) out[i] /= area;
  return out;
}

const medianOf = (arr) => {
  const a = Array.from(arr).sort((x, y) => x - y);
  const n = a.length;
  if (!n) return 0;
  return n % 2 ? a[(n - 1) >> 1] : (a[n / 2 - 1] + a[n / 2]) / 2;
};

function gainFromMeans(refMeans, curMeans) {
  const c = medianOf(curMeans);
  if (c < 1) return 1;
  return Math.min(SF.GAIN_MAX, Math.max(SF.GAIN_MIN, medianOf(refMeans) / c));
}

// Hệ số nhân để ảnh cur có độ sáng như ref (trung vị tỉ số, kẹp [0,75; 1,33]).
export function gainBetween(refGray, curGray, w, h) {
  return gainFromMeans(cellMeans(refGray, w, h, SF.CELLS_X, SF.CELLS_Y), cellMeans(curGray, w, h, SF.CELLS_X, SF.CELLS_Y));
}

// Số điểm ảnh trong mỗi khối có |gain*cur - other| > tau.
export function blockCounts(cur, other, gain, tau, w, h, block, out) {
  const bx = w / block;
  const by = h / block;
  const res = out || new Uint16Array(bx * by);
  res.fill(0);
  for (let y = 0; y < h; y++) {
    const rowBase = (y / block | 0) * bx;
    const k0 = y * w;
    for (let x = 0; x < w; x++) {
      const k = k0 + x;
      const d = cur[k] * gain - other[k];
      if (d > tau || d < -tau) res[rowBase + (x / block | 0)]++;
    }
  }
  return res;
}

// Khối "hoạt động": đạt ngưỡng riêng VÀ (có láng giềng đạt nửa ngưỡng HOẶC gấp đôi ngưỡng) VÀ không bị che.
export function coherent(counts, thr, masked, bx, by, out = new Uint8Array(bx * by)) {
  out.fill(0);
  for (let y = 0; y < by; y++) {
    for (let x = 0; x < bx; x++) {
      const i = y * bx + x;
      if (masked && masked[i]) continue;
      const c = counts[i];
      const t = thr[i];
      if (c < t) continue;
      if (c >= 2 * t) { out[i] = 1; continue; }
      const half = Math.ceil(t / 2);
      let ok = false;
      for (let dy = -1; dy <= 1 && !ok; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= by) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= bx) continue;
          if (counts[yy * bx + xx] >= half) { ok = true; break; }
        }
      }
      if (ok) out[i] = 1;
    }
  }
  return out;
}

// Mức nhiễu bền: trung vị + 3 * 1,4826 * MAD (vài cử động lẻ tẻ không kéo mức lên).
export function robustLevel(values) {
  const a = Array.from(values);
  if (!a.length) return 0;
  const med = medianOf(a);
  const mad = medianOf(a.map((v) => Math.abs(v - med)));
  return med + 3 * 1.4826 * mad;
}

// Ô hiển thị = OR của 2x2 khối.
export function poolToCells(blocks, bx, by, out) {
  const cx = bx >> 1;
  const cy = by >> 1;
  const res = out || new Uint8Array(cx * cy);
  res.fill(0);
  for (let y = 0; y < by; y++) {
    for (let x = 0; x < bx; x++) if (blocks[y * bx + x]) res[(y >> 1) * cx + (x >> 1)] = 1;
  }
  return res;
}

// Số thành phần liên thông 4 hướng.
export function countAreas(cells, cols, rows) {
  const seen = new Uint8Array(cols * rows);
  let n = 0;
  const stack = [];
  for (let i = 0; i < cols * rows; i++) {
    if (!cells[i] || seen[i]) continue;
    n++;
    seen[i] = 1;
    stack.push(i);
    while (stack.length) {
      const p = stack.pop();
      const x = p % cols;
      const y = (p / cols) | 0;
      const nb = [x > 0 ? p - 1 : -1, x < cols - 1 ? p + 1 : -1, y > 0 ? p - cols : -1, y < rows - 1 ? p + cols : -1];
      for (const q of nb) if (q >= 0 && cells[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
    }
  }
  return n;
}

// lanes = 1: [tổng vùng]; lanes = 2: [vùng nửa trái, vùng nửa phải] (ảnh đã gương: trái màn hình).
export function laneAreas(cells, cols, rows, lanes = 1) {
  if (lanes <= 1) return [countAreas(cells, cols, rows)];
  const half = cols >> 1;
  const mk = (c0, c1) => {
    const w = c1 - c0;
    const sub = new Uint8Array(w * rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < w; x++) sub[y * w + x] = cells[y * cols + c0 + x];
    return countAreas(sub, w, rows);
  };
  return [mk(0, half), mk(half, cols)];
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ---------- Bộ phát hiện v2 ----------
export function createDetector({ sensitivity = 6 } = {}) {
  let sens = sensitivity;
  let phase = 'idle'; // idle | cal | red
  let sigma = 2.5;
  let taus = [tauFor(sigma, 1)]; // các tau khác nhau theo độ nhạy 1..10
  let tauOfSens = new Array(11).fill(0);
  let nBlock = [new Float32Array(NB).fill(1)]; // theo tau: mức nhiễu khối (đã chặn trần)
  let unst = [new Uint8Array(NB)]; // theo tau: khối bất ổn suốt cửa sổ hiệu chỉnh (TV, quạt)
  let busy = [new Uint8Array(NB)]; // theo tau: khối có cử động lúc hiệu chỉnh (mức nhiễu > trần), không đưa vào sàn gộp
  let bigBlobs = 0;
  let calibrated = false;
  let poolT = SF.MIN_COUNT;
  let calInfo = { sigma, tau: 0, medNoise: 0, masked: 0, movingFrac: 0 };

  const ring = Array.from({ length: SF.RING + 1 }, () => ({ g: new Uint8Array(SF.SAMPLE_W * SF.SAMPLE_H), cm: new Float32Array(NC), t: -Infinity, ok: false }));
  let ringHead = 0;
  const cal = { t0: 0, hist: new Uint32Array(256), nHist: 0, samples: [], frames: 0, sigmaDone: false };
  const red = {
    t0: 0, fb: new Uint8Array(NB), e: new Uint8Array(NB), r: new Uint8Array(NB),
    refSum: new Float32Array(SF.SAMPLE_W * SF.SAMPLE_H), refN: 0, refGray: new Uint8Array(SF.SAMPLE_W * SF.SAMPLE_H), refMeans: new Float32Array(NC),
    refReady: false, refFrom: 0, retakeAt: 0,
  };
  const live = new Uint8Array(NC);
  const flaggedCells = new Uint8Array(NC);
  const maskedBlocks = new Uint8Array(NB);
  const maskedCells = new Uint8Array(NC);
  const cS = new Uint16Array(NB);
  const cR = new Uint16Array(NB);
  const act = new Uint8Array(NB);
  const actR = new Uint8Array(NB);
  const thrS = new Uint16Array(NB);
  const thrR = new Uint16Array(NB);
  const tmpMeans = new Float32Array(NC);
  let version = 0;
  const st = { procHz: 0, ms: 0, globalEvents: 0, gain: 1, lastT: 0 };

  // Sàn ngưỡng theo đuôi phân bố nhiễu GỘP mọi khối trong lúc hiệu chỉnh: số điểm ảnh k nhỏ nhất mà xác suất
  // một khối nhiễu đạt >= k không quá q(s). Nhiễu nén theo khối làm đuôi dày, ngưỡng trung vị + MAD không thấy được.
  function poolFloor(ti) {
    const ns = cal.samples.length;
    if (!calibrated || !ns) return SF.MIN_COUNT;
    const hist = new Float64Array(BLOCK_PX + 2);
    let n = 0;
    for (let b = 0; b < NB; b++) {
      if (maskedBlocks[b] || busy[ti][b]) continue;
      for (let k = 0; k < ns; k++) { hist[cal.samples[k][ti * NB + b]]++; n++; }
    }
    if (!n) return SF.MIN_COUNT;
    const q = 10 ** (SF.Q_LOG0 + SF.Q_LOG_STEP * (sens - 1));
    let tail = n;
    for (let k = 0; k <= BLOCK_PX; k++) {
      if (tail / n <= q) return Math.max(SF.MIN_COUNT, k);
      tail -= hist[k];
    }
    return BLOCK_PX;
  }

  function applySens() {
    const ti = tauOfSens[sens] || 0;
    const nb = nBlock[ti];
    for (let i = 0; i < NB; i++) maskedBlocks[i] = calibrated && unst[ti][i] ? 1 : 0;
    // Cụm khối bất ổn quá lớn (> MASK_BLOB_MAX khối, nối 8 hướng) là người cử động lúc hiệu chỉnh, không phải TV/quạt: bỏ che.
    bigBlobs = 0;
    if (calibrated) {
      const seen = new Uint8Array(NB);
      const stack = [];
      const comp = [];
      for (let i0 = 0; i0 < NB; i0++) {
        if (!maskedBlocks[i0] || seen[i0]) continue;
        comp.length = 0;
        seen[i0] = 1;
        stack.push(i0);
        while (stack.length) {
          const p = stack.pop();
          comp.push(p);
          const x = p % BX;
          const y = (p / BX) | 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; const yy = y + dy;
            if (xx < 0 || xx >= BX || yy < 0 || yy >= BY) continue;
            const q = yy * BX + xx;
            if (maskedBlocks[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
          }
        }
        if (comp.length > SF.MASK_BLOB_MAX) { bigBlobs++; for (const q of comp) maskedBlocks[q] = 0; }
      }
    }
    // Viền: khối có cử động lúc hiệu chỉnh nằm sát khối bất ổn còn lại (mép cánh quạt, mép TV) cũng che.
    if (calibrated) {
      const core = Uint8Array.from(maskedBlocks);
      for (let y = 0; y < BY; y++) for (let x = 0; x < BX; x++) {
        const i = y * BX + x;
        if (core[i] || !busy[ti][i]) continue;
        let near = 0;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy; const xx = x + dx;
          if (yy >= 0 && yy < BY && xx >= 0 && xx < BX && core[yy * BX + xx]) { near = 1; break; }
        }
        if (near) maskedBlocks[i] = 1;
      }
    }
    const floorT = poolFloor(ti);
    poolT = floorT;
    for (let i = 0; i < NB; i++) {
      thrS[i] = Math.max(SF.MIN_COUNT, floorT, Math.round(sensMul(sens) * (nb[i] + SF.BASE_COUNT)));
      thrR[i] = thrS[i] + SF.R_COUNT_ADD;
    }
    maskedCells.fill(0);
    const per = new Uint8Array(NC);
    for (let y = 0; y < BY; y++) for (let x = 0; x < BX; x++) if (maskedBlocks[y * BX + x]) per[(y >> 1) * SF.CELLS_X + (x >> 1)]++;
    for (let i = 0; i < NC; i++) maskedCells[i] = per[i] >= 2 ? 1 : 0;
  }

  const curTau = () => taus[tauOfSens[sens] || 0];

  function setTausFromSigma() {
    const list = [];
    for (let s = 1; s <= 10; s++) {
      const t = tauFor(sigma, s);
      let k = list.indexOf(t);
      if (k < 0) { list.push(t); k = list.length - 1; }
      tauOfSens[s] = k;
    }
    taus = list;
  }

  const medianFromHist = (hist, n) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc * 2 >= n) return v;
    }
    return 0;
  };

  function findOld(t) {
    let best = null;
    for (const f of ring) {
      if (!f.ok) continue;
      if (t - f.t >= SF.SHORT_DT_MS - 6 && (!best || f.t > best.t)) best = f;
    }
    return best;
  }

  function resetRef(from) {
    red.refSum.fill(0);
    red.refN = 0;
    red.refReady = false;
    red.refFrom = from;
  }

  function finalizeRef() {
    const n = Math.max(1, red.refN);
    for (let i = 0; i < red.refGray.length; i++) red.refGray[i] = Math.round(red.refSum[i] / n);
    cellMeans(red.refGray, SF.SAMPLE_W, SF.SAMPLE_H, SF.CELLS_X, SF.CELLS_Y, red.refMeans);
    red.refReady = true;
  }

  function push(gray, t) {
    const t0p = now();
    // vào vòng đệm
    const slot = ring[ringHead];
    ringHead = (ringHead + 1) % ring.length;
    slot.g.set(gray);
    slot.t = t;
    slot.ok = true;
    cellMeans(slot.g, SF.SAMPLE_W, SF.SAMPLE_H, SF.CELLS_X, SF.CELLS_Y, slot.cm);
    version++;
    const dtp = st.lastT ? t - st.lastT : 0;
    if (dtp > 0) st.procHz = st.procHz ? st.procHz * 0.9 + (1000 / dtp) * 0.1 : 1000 / dtp;
    st.lastT = t;

    let isGlobal = false;
    const old = findOld(t);
    if (!old || old === slot) return finish(t0p, false);
    const gain = gainFromMeans(old.cm, slot.cm);
    st.gain = gain;

    if (phase === 'cal') {
      const el = t - cal.t0;
      if (!cal.sigmaDone) {
        for (let k = (cal.frames & 3); k < slot.g.length; k += 4) {
          const d = Math.round(Math.abs(slot.g[k] * gain - old.g[k]));
          cal.hist[d > 255 ? 255 : d]++;
          cal.nHist++;
        }
        cal.frames++;
        if (el >= SF.CAL_SIGMA_MS) {
          const med = medianFromHist(cal.hist, cal.nHist);
          sigma = Math.min(SF.SIGMA_MAX, Math.max(SF.SIGMA_MIN, (1.4826 * med) / Math.SQRT2));
          setTausFromSigma();
          cal.sigmaDone = true;
        }
      } else if (cal.samples.length < SF.CAL_MAX_SAMPLES) {
        const rec = new Uint8Array(taus.length * NB);
        const tmp = new Uint16Array(NB);
        for (let k = 0; k < taus.length; k++) {
          blockCounts(slot.g, old.g, gain, taus[k], SF.SAMPLE_W, SF.SAMPLE_H, SF.BLOCK, tmp);
          for (let b = 0; b < NB; b++) rec[k * NB + b] = tmp[b];
        }
        cal.samples.push(rec);
      }
      return finish(t0p, false);
    }

    // ----- idle / red: tín hiệu ngắn hạn S -----
    blockCounts(slot.g, old.g, gain, curTau(), SF.SAMPLE_W, SF.SAMPLE_H, SF.BLOCK, cS);
    coherent(cS, thrS, maskedBlocks, BX, BY, act);
    let nAct = 0;
    let nUnmasked = 0;
    for (let b = 0; b < NB; b++) {
      nAct += act[b];
      if (!maskedBlocks[b]) nUnmasked++;
    }
    isGlobal = nUnmasked > 0 && nAct > SF.GLOBAL_FRAC * nUnmasked;
    poolToCells(isGlobal ? new Uint8Array(NB) : act, BX, BY, live);

    if (phase === 'red') {
      const dt = t - red.t0;
      const detectFrom = SF.GRACE_MS + SF.REF_MS;
      if (isGlobal) {
        st.globalEvents++;
        for (let b = 0; b < NB; b++) { red.e[b] = red.e[b] > 0 ? red.e[b] - 1 : 0; red.r[b] = 0; }
        red.retakeAt = t + SF.REF_RETAKE_MS;
        resetRef(red.retakeAt);
      } else if (dt >= SF.GRACE_MS) {
        // ảnh mốc: cộng dồn trong REF_MS đầu sau ân hạn (hoặc sau lần chụp lại)
        if (!red.refReady && t >= red.refFrom) {
          if (t - red.refFrom < SF.REF_MS || red.refN === 0) {
            for (let i = 0; i < red.refSum.length; i++) red.refSum[i] += slot.g[i];
            red.refN++;
          } else finalizeRef();
        }
        if (dt >= detectFrom) {
          // S: bằng chứng có suy giảm
          for (let b = 0; b < NB; b++) {
            if (act[b]) red.e[b] = Math.min(255, red.e[b] + SF.E_ADD);
            else if (red.e[b] > 0) red.e[b]--;
            if (red.e[b] >= SF.E_ON) red.fb[b] = 1;
          }
          // R: so với ảnh mốc
          if (red.refReady) {
            const gR = gainFromMeans(red.refMeans, slot.cm);
            blockCounts(slot.g, red.refGray, gR, curTau() + SF.R_TAU_ADD, SF.SAMPLE_W, SF.SAMPLE_H, SF.BLOCK, cR);
            coherent(cR, thrR, maskedBlocks, BX, BY, actR);
            let nR = 0;
            for (let b = 0; b < NB; b++) nR += actR[b];
            if (nUnmasked > 0 && nR > SF.GLOBAL_FRAC * nUnmasked) {
              st.globalEvents++;
              red.r.fill(0);
              red.retakeAt = t + SF.REF_RETAKE_MS;
              resetRef(red.retakeAt);
              isGlobal = true;
            } else {
              for (let b = 0; b < NB; b++) {
                red.r[b] = actR[b] ? Math.min(255, red.r[b] + 1) : 0;
                if (red.r[b] >= SF.R_ON) red.fb[b] = 1;
              }
            }
          }
          poolToCells(red.fb, BX, BY, flaggedCells);
        }
      }
    }
    return finish(t0p, isGlobal);
  }

  function finish(t0p, isGlobal) {
    const ms = now() - t0p;
    st.ms = st.ms ? st.ms * 0.9 + ms * 0.1 : ms;
    return { live, global: isGlobal };
  }

  function clearRing() {
    for (const f of ring) { f.ok = false; f.t = -Infinity; }
  }

  const det = {
    setSensitivity(s) {
      sens = Math.min(10, Math.max(1, Math.round(s)));
      applySens();
    },
    startCalibration(t) {
      phase = 'cal';
      calibrated = false;
      cal.t0 = t;
      cal.hist.fill(0);
      cal.nHist = 0;
      cal.samples = [];
      cal.frames = 0;
      cal.sigmaDone = false;
      clearRing();
      live.fill(0);
      flaggedCells.fill(0);
      maskedBlocks.fill(0);
      maskedCells.fill(0);
    },
    finishCalibration() {
      phase = 'idle';
      if (!cal.sigmaDone) {
        const med = cal.nHist ? medianFromHist(cal.hist, cal.nHist) : 0;
        if (cal.nHist) sigma = Math.min(SF.SIGMA_MAX, Math.max(SF.SIGMA_MIN, (1.4826 * med) / Math.SQRT2));
        setTausFromSigma();
      }
      const ns = cal.samples.length;
      nBlock = taus.map(() => new Float32Array(NB).fill(1));
      unst = taus.map(() => new Uint8Array(NB));
      busy = taus.map(() => new Uint8Array(NB));
      let movingFrames = 0;
      if (ns) {
        const caps = [];
        for (let k = 0; k < taus.length; k++) {
          const raw = new Float32Array(NB);
          const vals = new Array(ns);
          for (let b = 0; b < NB; b++) {
            for (let s = 0; s < ns; s++) vals[s] = cal.samples[s][k * NB + b];
            raw[b] = robustLevel(vals);
            // Bất ổn = trung vị > UNSTABLE_FRAC*64 ở MỌI phần của cửa sổ (nháy liên tục), không chỉ trung vị cả cửa sổ.
            const parts = ns >= 2 * SF.UNSTABLE_PARTS ? SF.UNSTABLE_PARTS : 1;
            let all = 1;
            for (let p = 0; p < parts && all; p++) {
              const a = Math.floor((p * ns) / parts);
              const z = Math.floor(((p + 1) * ns) / parts);
              if (medianOf(vals.slice(a, z)) <= SF.UNSTABLE_FRAC * BLOCK_PX) all = 0;
            }
            unst[k][b] = all;
          }
          const cap = Math.max(4, 2 * medianOf(raw) + 2);
          for (let b = 0; b < NB; b++) { nBlock[k][b] = Math.min(raw[b], cap); busy[k][b] = raw[b] > cap ? 1 : 0; }
          caps.push(cap);
        }
        const kk = tauOfSens[sens] || 0;
        for (let s = 0; s < ns; s++) {
          let over = 0;
          for (let b = 0; b < NB; b++) if (cal.samples[s][kk * NB + b] > caps[kk]) over++;
          if (over > 0.15 * NB) movingFrames++;
        }
      }
      calibrated = true;
      applySens();
      let masked = 0;
      for (let i = 0; i < NC; i++) masked += maskedCells[i];
      const kk = tauOfSens[sens] || 0;
      let sum = 0;
      for (let b = 0; b < NB; b++) sum += nBlock[kk][b];
      calInfo = { sigma, tau: taus[kk], medNoise: sum / NB, masked, movingFrac: ns ? movingFrames / ns : 0, bigBlobs };
      return calInfo;
    },
    startRed(t) {
      phase = 'red';
      red.t0 = t;
      red.fb.fill(0);
      red.e.fill(0);
      red.r.fill(0);
      flaggedCells.fill(0);
      resetRef(t + SF.GRACE_MS);
    },
    endRed() {
      phase = 'idle';
      poolToCells(red.fb, BX, BY, flaggedCells);
      const flagged = Uint8Array.from(flaggedCells);
      return {
        flagged,
        areas: countAreas(flagged, SF.CELLS_X, SF.CELLS_Y),
        lanes: laneAreas(flagged, SF.CELLS_X, SF.CELLS_Y, 2),
      };
    },
    setIdle() {
      phase = 'idle';
      flaggedCells.fill(0);
      red.fb.fill(0);
    },
    push,
    get flagged() { return flaggedCells; },
    get live() { return live; },
    get masked() { return maskedCells; },
    get version() { return version; },
    get phase() { return phase; },
    stats() {
      let l = 0;
      for (let i = 0; i < NC; i++) l += live[i];
      let m = 0;
      for (let i = 0; i < NC; i++) m += maskedCells[i];
      const kk = tauOfSens[sens] || 0;
      return {
        mode: 'v2', procHz: st.procHz, ms: st.ms, sigma, tau: taus[kk], medNoise: calInfo.medNoise, masked: m, live: l,
        globalEvents: st.globalEvents, gain: st.gain, refReady: red.refReady, poolT,
      };
    },
  };
  applySens();
  return det;
}

// ---------- Bản cũ (v1) đưa về cùng giao diện để A/B và test so sánh ----------
// Cổng d > 12, trung bình ô 16x9 (mỗi ô 16x16 điểm ảnh của ảnh 256x144), nhiễu = TB + 3 sigma,
// ngưỡng nhiễu + max(2, 26 - 2,3 s), cờ khi 2 lần đo liên tiếp vượt ngưỡng (hụt một lần là reset).
export const legacyThreshold = (noise, sensitivity) => noise + Math.max(2, 26 - sensitivity * 2.3);

export function createLegacyDetector({ sensitivity = 6 } = {}) {
  let sens = sensitivity;
  let phase = 'idle';
  let prev = null;
  let samples = [];
  let noise = new Float32Array(NC);
  const hot = new Uint8Array(NC);
  const flagged = new Uint8Array(NC);
  const live = new Uint8Array(NC);
  const masked = new Uint8Array(NC);
  let version = 0;
  const st = { procHz: 0, ms: 0, lastT: 0 };

  function measure(gray) {
    const out = new Float32Array(NC);
    if (!prev) { prev = Uint8Array.from(gray); return out; }
    const cw = SF.SAMPLE_W / SF.CELLS_X;
    const ch = SF.SAMPLE_H / SF.CELLS_Y;
    for (let y = 0; y < SF.SAMPLE_H; y++) {
      const r = (y / ch) | 0;
      for (let x = 0; x < SF.SAMPLE_W; x++) {
        const k = y * SF.SAMPLE_W + x;
        const d = Math.abs(gray[k] - prev[k]);
        if (d > 12) out[r * SF.CELLS_X + ((x / cw) | 0)] += d;
      }
    }
    for (let i = 0; i < NC; i++) out[i] /= cw * ch;
    prev.set(gray);
    return out;
  }

  return {
    setSensitivity(s) { sens = s; },
    startCalibration() { phase = 'cal'; samples = []; prev = null; flagged.fill(0); },
    finishCalibration() {
      phase = 'idle';
      noise = new Float32Array(NC);
      if (samples.length) {
        for (let i = 0; i < NC; i++) {
          let sum = 0;
          let sq = 0;
          for (const s of samples) { sum += s[i]; sq += s[i] * s[i]; }
          const mean = sum / samples.length;
          noise[i] = mean + 3 * Math.sqrt(Math.max(0, sq / samples.length - mean * mean));
        }
      }
      let sum = 0;
      for (let i = 0; i < NC; i++) sum += noise[i];
      return { sigma: 0, tau: 12, medNoise: sum / NC, masked: 0, movingFrac: 0 };
    },
    startRed() { phase = 'red'; hot.fill(0); flagged.fill(0); },
    endRed() {
      phase = 'idle';
      const f = Uint8Array.from(flagged);
      return { flagged: f, areas: countAreas(f, SF.CELLS_X, SF.CELLS_Y), lanes: laneAreas(f, SF.CELLS_X, SF.CELLS_Y, 2) };
    },
    setIdle() { phase = 'idle'; flagged.fill(0); hot.fill(0); },
    push(gray, t) {
      const t0 = now();
      version++;
      const m = measure(gray);
      if (phase === 'cal') samples.push(m);
      else if (phase === 'red') {
        for (let i = 0; i < NC; i++) {
          if (m[i] > legacyThreshold(noise[i], sens)) {
            hot[i] = Math.min(255, hot[i] + 1);
            if (hot[i] >= 2) flagged[i] = 1;
          } else hot[i] = 0;
        }
      }
      if (st.lastT && t > st.lastT) st.procHz = st.procHz ? st.procHz * 0.9 + (1000 / (t - st.lastT)) * 0.1 : 1000 / (t - st.lastT);
      st.lastT = t;
      st.ms = st.ms ? st.ms * 0.9 + (now() - t0) * 0.1 : now() - t0;
      return { live, global: false };
    },
    get flagged() { return flagged; },
    get live() { return live; },
    get masked() { return masked; },
    get version() { return version; },
    get phase() { return phase; },
    stats() {
      return { mode: 'v1', procHz: st.procHz, ms: st.ms, sigma: 0, tau: 12, medNoise: 0, masked: 0, live: 0, globalEvents: 0, gain: 1, refReady: false };
    },
  };
}
