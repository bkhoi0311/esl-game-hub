// Kênh sự kiện dùng chung: game phát 'correct' / 'wrong' / 'win' / 'streak'; mascot, hiệu ứng, âm thanh chỉ lắng nghe.
const target = new EventTarget();

export const bus = {
  emit(type, detail = {}) {
    target.dispatchEvent(new CustomEvent(type, { detail }));
  },
  on(type, fn) {
    const h = (e) => fn(e.detail || {});
    target.addEventListener(type, h);
    return () => target.removeEventListener(type, h);
  },
};

// Người dùng bật "giảm chuyển động" trong hệ điều hành: giảm rung, nháy, pháo giấy.
export const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
