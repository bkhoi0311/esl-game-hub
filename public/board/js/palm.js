// Chống lòng bàn tay THÍCH NGHI (THUẦN, không DOM). Xem BUILD-NOTES-PERF.md mục "Sửa lọc lòng bàn tay".
// Thiết bị như ClassIn X (CEF) báo width=height=50 cho mọi điểm chạm: không thể dựa vào kích thước.
export const PALM_MIN = 48;      // CSS px: max(width,height) >= ngưỡng => nghi lòng bàn tay
export const PALM_WINDOW = 8;    // số lần pointerdown touch gần nhất được xét
export const PALM_NEED = 3;      // số mẫu tối thiểu để kết luận "kích thước cố định"
export const PALM_SPREAD = 2;    // chênh lệch tối đa (px) giữa lớn nhất và nhỏ nhất
export const PALM_HUGE = PALM_MIN * 3; // nút bấm chỉ bỏ qua khi chạm to bất thường

const isTouch = (e) => e && e.pointerType === 'touch';
const size = (e) => Math.max(e.width || 0, e.height || 0);

// 'auto' (mặc định) | '0' (tắt) | '1' (luôn bật), từ ?palm=
export function parsePalmMode(search) {
  const v = new URLSearchParams(search || '').get('palm');
  return v === '0' ? '0' : v === '1' ? '1' : 'auto';
}

export const REASON_TEXT = {
  param: 'tham số palm=0',
  ua: 'UA ClassIn',
  auto: 'tự phát hiện w cố định',
  forced: 'luôn bật (palm=1)',
  default: 'mặc định',
};

export function createPalmFilter({ mode = 'auto', ua = '' } = {}) {
  const m = mode === '0' || mode === 0 || mode === 'off' ? '0' : mode === '1' || mode === 1 || mode === 'on' ? '1' : 'auto';
  let enabled = true, reason = 'default';
  if (m === '0') { enabled = false; reason = 'param'; }
  else if (m === '1') { enabled = true; reason = 'forced'; }
  else if (/ClassIn/i.test(ua || '')) { enabled = false; reason = 'ua'; }
  const samples = []; // {w,h,s} các pointerdown touch gần nhất
  let count = 0;

  // Gọi ở MỌI pointerdown (kể cả cái sắp bị bỏ). Trả true nếu vừa tự tắt lọc.
  function observe(e) {
    if (!isTouch(e)) return false;
    count++;
    samples.push({ w: e.width || 0, h: e.height || 0, s: size(e) });
    if (samples.length > PALM_WINDOW) samples.shift();
    if (m !== 'auto' || !enabled) return false;
    if (samples.length < PALM_NEED) return false;
    let lo = Infinity, hi = -Infinity;
    for (const x of samples) { if (x.s < lo) lo = x.s; if (x.s > hi) hi = x.s; }
    if (lo >= PALM_MIN && hi - lo <= PALM_SPREAD) { enabled = false; reason = 'auto'; return true; }
    return false;
  }

  function isPalm(e) {
    return enabled && isTouch(e) && size(e) >= PALM_MIN;
  }

  function state() {
    return {
      mode: m, enabled, reason, reasonText: REASON_TEXT[reason], samples: count,
      recent: samples.slice(-3).map((x) => [x.w, x.h]),
    };
  }
  return { observe, isPalm, state };
}

// Nút bấm: không dùng lọc lòng bàn tay, chỉ bỏ qua khi chạm to hơn hẳn (>= 3 x ngưỡng).
export function isHugePalm(e) {
  return isTouch(e) && size(e) >= PALM_HUGE;
}
