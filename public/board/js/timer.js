// Đồng hồ lớp học: đếm ngược / bấm giờ xuôi. Không dùng rAF; cập nhật DOM do bên ngoài làm 1 lần mỗi giây.
// Đồng hồ và bộ hẹn giờ được tiêm vào để kiểm thử. speed > 1 (chỉ để test) làm đồng hồ chạy nhanh.
//   createTimer({ now, onTick, onEnd, schedule, cancel, speed })
//   set(mode, sec) · start() · pause() · reset() · tick() · state()
// state() = { mode: 'off'|'down'|'up', total, left (giây nguyên hiển thị), running, ended }
export function createTimer(opts) {
  const o = opts || {};
  const now = o.now || (() => performance.now());
  const schedule = o.schedule || ((fn, ms) => setTimeout(fn, ms));
  const cancel = o.cancel || ((h) => clearTimeout(h));
  const speed = o.speed > 0 ? o.speed : 1;
  const onTick = o.onTick || (() => {});
  const onEnd = o.onEnd || (() => {});
  let mode = 'off', total = 60, elapsed = 0, startedAt = 0, running = false, ended = false, handle = null;

  const elapsedMs = () => (elapsed + (running ? (now() - startedAt) * speed : 0));
  function left() {
    if (mode === 'down') return Math.max(0, Math.ceil((total * 1000 - elapsedMs()) / 1000 - 1e-9));
    if (mode === 'up') return Math.floor(elapsedMs() / 1000 + 1e-9);
    return total;
  }
  function state() { return { mode, total, left: left(), running, ended }; }
  function arm() {
    if (handle != null) { cancel(handle); handle = null; }
    if (!running) return;
    // căn theo mốc giây kế tiếp của đồng hồ (tính theo thời gian thật = giây hiển thị / speed)
    const e = elapsedMs();
    const toNext = mode === 'down' ? (e % 1000 === 0 ? 1000 : 1000 - (e % 1000)) : 1000 - (e % 1000);
    handle = schedule(tick, Math.max(20, Math.ceil(toNext / speed) + 5));
  }
  function tick() {
    handle = null;
    if (!running) return;
    if (mode === 'down' && elapsedMs() >= total * 1000 - 1e-6) {
      elapsed = total * 1000; running = false; ended = true;
      onTick(state());
      onEnd(state());
      return;
    }
    onTick(state());
    arm();
  }
  return {
    set(m, sec) {
      if (handle != null) { cancel(handle); handle = null; }
      mode = m; total = sec > 0 ? sec : (m === 'down' ? 60 : 0);
      elapsed = 0; running = false; ended = false;
      onTick(state());
    },
    start() {
      if (mode === 'off' || running) return;
      if (ended) { elapsed = 0; ended = false; }
      running = true; startedAt = now();
      onTick(state());
      arm();
    },
    pause() {
      if (!running) return;
      elapsed = elapsedMs(); running = false;
      if (handle != null) { cancel(handle); handle = null; }
      onTick(state());
    },
    reset() {
      if (handle != null) { cancel(handle); handle = null; }
      elapsed = 0; running = false; ended = false;
      onTick(state());
    },
    tick, state,
  };
}

export function fmtClock(sec) {
  const s = Math.max(0, sec | 0);
  const m = Math.floor(s / 60), r = s % 60;
  return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
}
