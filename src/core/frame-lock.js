// KHÓA KHUNG: lớp mỏng bọc reframe.js (không sao chép logic dò). Gom kết quả dò "camera tự đổi khung" thành 4 trạng thái
// cho giao diện (viền / biểu ngữ), giữ mốc khung và đếm số lần đổi khung. Thuần JS, không DOM (trừ createGrabber).
//   locked   : khung ổn định (xanh)
//   reframed : camera vừa đổi khung (đỏ cam)
//   settling : vẫn đang ổn định lại, qua giai đoạn "vừa đổi" (vàng)
//   lost     : không nhận được hình mới từ camera
// Hai cách cấp dữ liệu: push(small64x36, t) (dùng bộ dò riêng của module, vd màn Khóa khung / Simon)
// hoặc ingest(kqReframe, t) khi game đã có bộ dò sẵn (Statue Freeze). ?reframe=0 tắt hết (enabled = false).
import { RF, createReframeWatch, ncc } from './reframe.js';

export const LOCK = {
  HOLD_MS: 10000, // giữ yên bao lâu để chốt mốc khung
  HOT_MS: 600, // sau lần đổi khung gần nhất, bấy nhiêu ms còn là "vừa đổi" (đỏ cam), sau đó là "đang ổn định" (vàng)
  LOST_MS: 3000, // không có khung mới quá lâu thì "lost"
  DRIFT_EVERY_MS: 500,
};

export function frameLockEnabled() {
  return typeof location === 'undefined' || !/[?&#]reframe=0\b/.test(location.href);
}

// ?lockhold=2500 chỉ để test; mặc định 10 giây.
export function lockHoldMs() {
  const m = typeof location === 'undefined' ? null : /[?&#]lockhold=(\d{3,5})\b/.exec(location.href);
  return m ? Number(m[1]) : LOCK.HOLD_MS;
}

export function createFrameLock({ enabled = frameLockEnabled() } = {}) {
  const watch = enabled ? createReframeWatch() : null;
  const subs = new Set();
  let state = 'locked';
  let count = 0; // số lần camera đổi khung kể từ resetCount()
  let lastHit = -Infinity;
  let lastSeen = 0;
  let hasFrames = false;
  let base = null; // mốc khung: ảnh 64x36 lúc khung ổn định
  let baseAt = 0;
  let drift = 0; // 1 - tương quan(mốc, hiện tại), chỉ cập nhật khi có mốc
  let lastDriftAt = -Infinity;

  const set = (next, t) => {
    if (next === state) return;
    const prev = state;
    state = next;
    subs.forEach((fn) => fn({ state, prev, count, t }));
  };

  // o: kết quả của createReframeWatch().push() (moving / started / ended / kind).
  function ingest(o, t) {
    if (!enabled) return o;
    lastSeen = t;
    hasFrames = true;
    if (o.started) count++;
    if (o.kind) lastHit = t;
    set(o.moving ? (t - lastHit < LOCK.HOT_MS ? 'reframed' : 'settling') : 'locked', t);
    return { ...o, state, count };
  }

  const api = {
    enabled,
    push(small, t) {
      if (!watch) return { moving: false, started: false, ended: false, kind: null, repeated: false, state, count };
      const o = ingest(watch.push(small, t), t);
      if (base && t - lastDriftAt >= LOCK.DRIFT_EVERY_MS) {
        lastDriftAt = t;
        drift = 1 - ncc(base, small);
      }
      return o;
    },
    ingest,
    // Gọi mỗi khung hình vẽ: phát hiện mất hình camera.
    tick(t) {
      if (enabled && hasFrames && t - lastSeen > LOCK.LOST_MS) set('lost', t);
    },
    captureBaseline(small, t = 0) {
      base = Float32Array.from(small);
      baseAt = t;
      drift = 0;
    },
    clearBaseline() { base = null; baseAt = 0; drift = 0; },
    onChange(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    resetCount() { count = 0; },
    // Bỏ trạng thái dò (đổi nguồn dữ liệu / bắt đầu ván mới). Không đổi số đếm và mốc.
    reset() {
      if (watch) watch.reset();
      lastHit = -Infinity;
      hasFrames = false;
      set('locked', 0);
    },
    get state() { return state; },
    get count() { return count; },
    get moving() { return Boolean(watch && watch.moving); },
    get hasBaseline() { return Boolean(base); },
    get baselineAt() { return baseAt; },
    get drift() { return drift; },
    stats() {
      return { ...(watch ? watch.stats() : { events: 0, moving: false, lastSettleMs: 0, ncc: 1, recent: 0 }), state, count, baseline: Boolean(base), drift };
    },
  };
  return api;
}

// Lấy ảnh xám 64x36 từ <video> (chưa gương, cùng hệ toạ độ ảnh gốc). ~0,3 ms. Trả về cùng một Float32Array mỗi lần.
export function createGrabber() {
  const cv = document.createElement('canvas');
  cv.width = RF.DW * 2;
  cv.height = RF.DH * 2;
  const out = new Float32Array(RF.DW * RF.DH);
  let ctx = null;
  return (video) => {
    ctx ||= cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, cv.width, cv.height);
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const W2 = cv.width;
    for (let y = 0; y < RF.DH; y++) {
      for (let x = 0; x < RF.DW; x++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          const i = (((y * 2 + (k >> 1)) * W2) + x * 2 + (k & 1)) * 4;
          sum += (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
        }
        out[y * RF.DW + x] = sum / 4;
      }
    }
    return out;
  };
}
