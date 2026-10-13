// Hướng dẫn cho giáo viên: trình chiếu 8 bước bằng ảnh giao diện thật (vòng xanh đánh số chỉ chỗ bấm)
// + video có giọng đọc. Soạn bài ngay trong Bảng đen của app ClassIn (file Interaction Game.edu),
// lưu file .edu của bài, Upload lên Drive, rồi mở trên màn hình tương tác (cùng tài khoản).
import { gsap } from 'gsap';
import { button, h, openModal } from './ui.js';
import { icon } from './icons.js';
import { reducedMotion } from './events.js';
import { t, addStrings } from '../i18n/index.js';
import VI from '../i18n/strings/camera-guide.vi.js';

addStrings('camera-guide', VI);

const BASE = `${import.meta.env.BASE_URL}guide/`;

// marks: [x%, y%] trên ảnh, theo thứ tự bấm. tips: 1 thẻ chữ ngắn cho mỗi vòng (cùng số).
// Các bước dựng theo ngôn ngữ hiện tại (không gọi t() ở cấp module). Khoá viết đủ để công cụ i18n:check thấy.
const steps = () => [
  { place: 'laptop', label: t('guide.s1.label'), title: t('guide.s1.title'), img: 'steps/0-bang-den.webp', ratio: 1100 / 840,
    marks: [[12.7, 73.2]], tips: [t('guide.s1.tip1')], note: t('guide.s1.note') },
  { place: 'laptop', label: t('guide.s2.label'), title: t('guide.s2.title'), img: 'steps/0-drive-bang-den.webp', ratio: 2000 / 1168,
    marks: [[97.35, 52.2], [77.4, 54.8]], tips: [t('guide.tip.cloud'), t('guide.s2.tip2')], note: t('guide.s2.note') },
  { place: 'laptop', label: t('guide.s3.label'), title: t('guide.s3.title'), img: 'steps/1-soan-bai.webp', ratio: 16 / 9,
    marks: [[46.7, 5.5], [46.1, 34.6], [50, 61.2]], tips: [t('guide.s3.tip1'), t('guide.s3.tip2'), t('guide.s3.tip3')] },
  { place: 'laptop', label: t('guide.s4.label'), title: t('guide.s4.title'), img: 'steps/2-luu-edu.webp', ratio: 16 / 9,
    marks: [[54.7, 14.4], [70.1, 72.5]], tips: [t('guide.s4.tip1'), t('guide.s4.tip2')], note: t('guide.s4.note') },
  { place: 'laptop', label: t('guide.s5.label'), title: t('guide.s5.title'), img: 'steps/0-drive-bang-den.webp', ratio: 2000 / 1168,
    marks: [[97.35, 52.2], [37.85, 16.3]], tips: [t('guide.tip.cloud'), t('guide.s5.tip2')] },
  { place: 'board', label: t('guide.s6.label'), title: t('guide.s6.title'), img: 'steps/4-dang-nhap.webp', ratio: 1280 / 636,
    marks: [[35.2, 90.5], [37.9, 49.8]], tips: [t('guide.s6.tip1'), t('guide.s6.tip2')], warn: t('guide.s6.warn') },
  { place: 'board', label: t('guide.s7.label'), title: t('guide.s7.title'), img: 'steps/5-mo-file.webp', ratio: 16 / 9,
    marks: [[42.6, 91.6], [21.3, 20.2], [56, 55.6]], tips: [t('guide.s7.tip1'), t('guide.s7.tip2'), t('guide.s7.tip3')], note: t('guide.s7.note') },
  { place: 'board', label: t('guide.s8.label'), title: t('guide.s8.title'), img: 'steps/6-choi.webp', ratio: 16 / 9,
    marks: [[69.5, 46.1]], tips: [t('guide.s8.tip1')], note: t('guide.s8.note') },
];

const PLACES = { laptop: { key: 'guide.dev.pc', icon: 'laptop' }, board: { key: 'guide.dev.board', icon: 'board' } };

export function openGuide() {
  let index = 0;
  const STEPS = steps();
  let mode = 'steps';
  const calm = reducedMotion();

  const rail = h('ol', { class: 'gs-rail' });
  const stage = h('div', { class: 'gs-stage' });
  const info = h('div', { class: 'gs-info' });
  const prev = button({ label: t('guide.prev'), iconName: 'chevron-left', onClick: () => go(index - 1), attrs: { 'data-testid': 'guide-prev' } });
  const next = button({ label: t('guide.next'), iconName: 'chevron-right', variant: 'primary', size: 'lg', onClick: () => (index < STEPS.length - 1 ? go(index + 1) : modal.close()), attrs: { 'data-testid': 'guide-next' } });
  const stepsView = h('div', { class: 'gs-steps' }, rail, stage, info, h('div', { class: 'gs-nav' }, prev, next));

  const video = h('video', { class: 'gs-video', src: `${BASE}huong-dan-luu-edu.mp4`, poster: `${BASE}huong-dan-luu-edu.jpg`, controls: true, playsInline: true, preload: 'none', 'data-testid': 'guide-video' });
  const videoView = h('div', { class: 'gs-video-view', hidden: true }, video);

  const tabs = h('div', { class: 'gs-tabs segmented', role: 'tablist' });
  const renderTabs = () => {
    tabs.textContent = '';
    [['steps', t('guide.steps'), 'steps'], ['video', t('guide.video'), 'film']].forEach(([key, label, ic]) =>
      tabs.append(button({ label, iconName: ic, attrs: { 'aria-pressed': String(mode === key), 'data-testid': `guide-tab-${key}` }, onClick: () => setMode(key) })));
  };
  const setMode = (m) => {
    mode = m;
    renderTabs();
    stepsView.hidden = m !== 'steps';
    videoView.hidden = m !== 'video';
    if (m === 'video') video.play().catch(() => {});
    else video.pause();
  };

  // Thanh tiến trình: 2 chặng (máy tính, màn hình lớp), mỗi bước 1 nút tròn
  STEPS.forEach((s, i) => {
    if (i === 0 || STEPS[i - 1].place !== s.place) {
      rail.append(h('li', { class: 'gs-place' }, icon(PLACES[s.place].icon, 22), h('span', {}, t(PLACES[s.place].key))));
    }
    rail.append(h('li', { class: 'gs-dot-wrap' },
      h('button', { type: 'button', class: 'gs-dot', 'data-i': i, onClick: () => go(i), 'aria-label': t('guide.stepAria', { n: i + 1, label: s.label }) },
        h('span', { class: 'gs-num' }, String(i + 1)), h('span', { class: 'gs-label' }, s.label))));
  });

  function go(i) {
    const dir = i > index ? 1 : -1;
    index = Math.max(0, Math.min(STEPS.length - 1, i));
    const s = STEPS[index];
    rail.querySelectorAll('.gs-dot').forEach((d, k) => {
      d.classList.toggle('active', k === index);
      d.classList.toggle('done', k < index);
    });
    // Ảnh + vòng xanh đánh số, hiện lần lượt
    const pic = h('div', { class: 'gs-pic', style: { aspectRatio: String(s.ratio) } },
      h('img', { src: BASE + s.img, alt: s.title, draggable: false }),
      s.marks.map(([x, y], k) => h('span', { class: 'gs-mark', style: { left: `${x}%`, top: `${y}%`, animationDelay: `${0.35 + k * 0.7}s` } }, h('b', {}, String(k + 1)))));
    stage.textContent = '';
    stage.append(pic);
    info.textContent = '';
    info.append(...[
      h('div', { class: 'gs-head' },
        h('span', { class: `gs-where gs-${s.place}` }, icon(PLACES[s.place].icon, 20), t(PLACES[s.place].key)),
        h('h3', {}, h('span', { class: 'gs-step' }, t('guide.step', { n: index + 1 })), s.title)),
      h('ol', { class: 'gs-tips' }, s.tips.map((tip, k) => h('li', { style: { animationDelay: `${0.35 + k * 0.7}s` } }, h('b', {}, String(k + 1)), tip))),
      s.warn ? h('p', { class: 'gs-warn' }, icon('alert', 22), s.warn) : null,
      s.note ? h('p', { class: 'gs-note' }, icon('info', 20), s.note) : null].filter(Boolean));
    prev.disabled = index === 0;
    next.querySelector('span').textContent = index === STEPS.length - 1 ? t('common.done') : t('guide.next');
    if (!calm) gsap.fromTo(pic, { x: 40 * dir, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: 'power2.out' });
  }

  const onKey = (e) => {
    if (mode !== 'steps') return;
    if (e.key === 'ArrowRight') go(index + 1);
    if (e.key === 'ArrowLeft') go(index - 1);
  };
  document.addEventListener('keydown', onKey);

  const body = h('div', { class: 'gs' }, tabs, stepsView, videoView);
  renderTabs();
  go(0);
  const modal = openModal({
    title: t('guide.title'),
    body,
    wide: true,
    onClose: () => {
      video.pause();
      document.removeEventListener('keydown', onKey);
    },
  });
  modal.el.classList.add('gs-modal');
  return modal;
}
