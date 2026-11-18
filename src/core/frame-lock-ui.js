// Giao diện KHÓA KHUNG (xem frame-lock.js): viền + biểu ngữ phủ khung video, và màn "Khóa khung" lớn trước khi chơi.
import '../styles/frame-lock.css';
import { h, button } from './ui.js';
import { t, addStrings } from '../i18n/index.js';
import VI from '../i18n/strings/camera-guide.vi.js';
import { createGrabber, lockHoldMs } from './frame-lock.js';

addStrings('camera-guide', VI);

const GRAB_GAP_MS = 66;
const BANNER_HIDE_MS = 1200;

// Gắn viền (CSS ::after phủ toàn bộ box), chip trạng thái và biểu ngữ đổi khung vào một khung video. Trả về hàm gỡ.
export function attachFrameLockUi(box, fl) {
  if (!fl || !fl.enabled) return () => {};
  const banner = h('div', { class: 'fl-banner', role: 'status', 'data-testid': 'fl-banner', hidden: true }, t('cam.lock.banner'));
  const chip = h('div', { class: 'fl-chip', 'data-testid': 'fl-chip' });
  box.classList.add('fl-box');
  box.append(banner, chip);
  let hideT = 0;
  const apply = (state) => {
    box.dataset.lock = state;
    chip.textContent = t('cam.lock.state.' + state);
    clearTimeout(hideT);
    if (state === 'reframed' || state === 'settling') {
      banner.dataset.state = state;
      banner.hidden = false;
    } else {
      hideT = setTimeout(() => { banner.hidden = true; }, state === 'locked' ? BANNER_HIDE_MS : 0);
    }
  };
  apply(fl.state);
  const off = fl.onChange(({ state }) => apply(state));
  return () => {
    off();
    clearTimeout(hideT);
    banner.remove();
    chip.remove();
    box.classList.remove('fl-box');
    delete box.dataset.lock;
  };
}

// Dòng thống kê "Camera đổi khung: N lần" (tự cập nhật). Trả về { el, destroy }.
export function frameLockStat(fl) {
  const el = h('div', { class: 'fl-stat', 'data-testid': 'fl-count', hidden: !fl.enabled });
  const render = () => {
    el.dataset.n = String(fl.count);
    el.textContent = t('cam.lock.count', { n: fl.count });
  };
  render();
  const off = fl.onChange(render);
  return { el, refresh: render, destroy: off };
}

// Màn "Khóa khung": xem trước camera LỚN, viền dày bao quanh toàn khung, thanh "Giữ yên N giây" để chốt mốc.
// onDone({ locked }) khi bấm "Khóa khung" (locked = true) hoặc "Bỏ qua" (locked = false). onBack() khi bấm "Quay lại".
export function frameLockScreen({ session, fl, onDone, onBack }) {
  const holdMs = lockHoldMs();
  const holdSec = Math.round(holdMs / 1000);
  const grab = createGrabber();
  const box = h('div', { class: 'fl-preview', 'data-testid': 'fl-preview' }, session.video);
  const detach = attachFrameLockUi(box, fl);
  const label = h('span', {}, t('cam.lock.hold', { n: holdSec }));
  const status = h('span', { 'data-testid': 'fl-status' });
  const fill = h('div', { class: 'fl-fill', 'data-testid': 'fl-fill' });
  const lockBtn = button({ label: t('cam.lock.btn.lock'), iconName: 'lock', variant: 'primary', size: 'lg', attrs: { disabled: true, 'data-testid': 'fl-lock' } });
  const recapBtn = button({ label: t('cam.lock.btn.recapture'), iconName: 'refresh', size: 'lg', attrs: { 'data-testid': 'fl-recapture' } });
  const skipBtn = button({ label: t('cam.lock.btn.skip'), size: 'lg', attrs: { 'data-testid': 'fl-skip' } });
  const backBtn = button({ label: t('cam.lock.btn.back'), iconName: 'chevron-left', size: 'lg', attrs: { 'data-testid': 'fl-back' } });
  const el = h('div', { class: 'fl-screen', 'data-testid': 'fl-screen' },
    h('div', { class: 'fl-head' }, h('h2', {}, t('cam.lock.title')), h('p', {}, t('cam.lock.sub'))),
    h('div', { class: 'fl-stage' }, box),
    h('div', { class: 'fl-progress' },
      h('div', { class: 'fl-progress-row' }, label, status),
      h('div', { class: 'fl-track', role: 'progressbar', 'aria-label': t('cam.lock.hold', { n: holdSec }) }, fill)),
    h('div', { class: 'fl-bottom' },
      h('ol', { class: 'fl-tips' }, [t('cam.lock.tip1'), t('cam.lock.tip2'), t('cam.lock.tip3')].map((x) => h('li', {}, x))),
      h('div', { class: 'fl-actions' }, onBack ? backBtn : null, recapBtn, skipBtn, lockBtn)));

  let raf = 0;
  let still = 0; // thời điểm bắt đầu đứng yên liên tục
  let lastGrab = 0;
  let lastCt = -1;
  let done = false;

  const setProgress = (u, msg) => {
    fill.style.width = `${Math.round(u * 100)}%`;
    status.textContent = msg;
  };
  const restart = (moved = true) => {
    still = 0;
    fl.clearBaseline();
    lockBtn.disabled = true;
    el.dataset.done = 'false';
    setProgress(0, moved ? t('cam.lock.waiting') : t('cam.lock.progress', { s: 0, n: holdSec }));
  };
  const tick = (now) => {
    if (!el.isConnected) { stop(); return; }
    raf = requestAnimationFrame(tick);
    const v = session.video;
    if (session.active && v.readyState >= 2 && v.currentTime !== lastCt && now - lastGrab >= GRAB_GAP_MS) {
      lastCt = v.currentTime;
      lastGrab = now;
      const small = grab(v);
      fl.push(small, now);
      if (fl.state === 'locked' && !still) still = now;
      if (fl.state !== 'locked') {
        if (still || fl.hasBaseline) restart();
        still = 0;
      } else if (!fl.hasBaseline) {
        const u = Math.min(1, (now - still) / holdMs);
        setProgress(u, t('cam.lock.progress', { s: Math.min(holdSec, Math.floor((now - still) / 1000)), n: holdSec }));
        if (u >= 1) {
          fl.captureBaseline(small, now);
          lockBtn.disabled = false;
          el.dataset.done = 'true';
          setProgress(1, t('cam.lock.captured'));
        }
      }
    }
    fl.tick(now);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const finish = (locked) => {
    if (done) return;
    done = true;
    stop();
    detach();
    if (!locked) fl.clearBaseline();
    onDone({ locked });
  };
  lockBtn.addEventListener('click', () => finish(true));
  skipBtn.addEventListener('click', () => finish(false));
  recapBtn.addEventListener('click', () => restart(false));
  backBtn.addEventListener('click', () => { stop(); detach(); fl.clearBaseline(); onBack(); });

  fl.reset();
  restart(false);
  raf = requestAnimationFrame(tick);
  return { el, destroy() { stop(); detach(); } };
}
