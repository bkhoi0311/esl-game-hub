// Chọn chế độ kính lúc khởi động, tự hạ cấp theo số đo render, báo lý do cho HUD.
export const SLOW_P95 = 20;   // ms
export const SLOW_FPS = 40;

export function pickMode(search) {
  const q = new URLSearchParams(search);
  const g = q.get('glass');
  if (g === '0') return { mode: 'lite', reason: 'param', allowAuto: false };
  if (g === '1') return { mode: 'on', reason: 'param', allowAuto: false };
  let supported = false;
  try {
    supported = !!(window.CSS && (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)')));
  } catch (e) { supported = false; }
  if (!supported) return { mode: 'lite', reason: 'unsupported', allowAuto: false };
  let reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-transparency: reduce)').matches; } catch (e) { reduced = false; }
  if (reduced) return { mode: 'lite', reason: 'transparency', allowAuto: false };
  return { mode: 'on', reason: 'default', allowAuto: true };
}

const TEXT = {
  'on:default': 'bật', 'on:param': 'bật (tham số)',
  'lite:param': 'nhẹ (tham số)', 'lite:unsupported': 'nhẹ (không hỗ trợ)',
  'lite:transparency': 'nhẹ (giảm trong suốt)', 'lite:auto': 'nhẹ (tự hạ)',
};

export function createGlass(search) {
  const root = document.documentElement;
  const st = pickMode(search);
  let bad = 0;
  function apply() {
    root.classList.toggle('glass-on', st.mode === 'on');
    root.classList.toggle('glass-lite', st.mode === 'lite');
  }
  apply();
  return {
    state: st,
    text: () => 'Kính: ' + (TEXT[st.mode + ':' + st.reason] || st.mode),
    // render.js gọi mỗi cửa sổ 2 s lúc có nét đang vẽ
    onWindow(stats) {
      if (!st.allowAuto || st.mode !== 'on') return;
      bad = stats.p95 > SLOW_P95 || stats.fps < SLOW_FPS ? bad + 1 : 0;
      if (bad >= 2) { st.mode = 'lite'; st.reason = 'auto'; apply(); }
    },
  };
}
