// Hướng dẫn cho giáo viên: trình chiếu 6 bước bằng ảnh giao diện thật (vòng xanh đánh số chỉ chỗ bấm)
// + video có giọng đọc. Từ soạn bài trên máy tính đến mở bài trên màn hình tương tác ClassIn.
import { gsap } from 'gsap';
import { button, h, openModal } from './ui.js';
import { icon } from './icons.js';
import { reducedMotion } from './events.js';

const BASE = `${import.meta.env.BASE_URL}guide/`;

// marks: [x%, y%] trên ảnh, theo thứ tự bấm. tips: 1 thẻ chữ ngắn cho mỗi vòng (cùng số).
const STEPS = [
  {
    place: 'laptop', label: 'Soạn bài', title: 'Soạn bài', img: 'steps/1-soan-bai.webp', ratio: 16 / 9,
    marks: [[46.7, 5.5], [46.1, 34.6], [50, 61.2]],
    tips: ['Bấm Soạn bài', 'Gõ tên bài', 'Gõ từ vựng, hoặc dán bảng từ Excel'],
  },
  {
    place: 'laptop', label: 'Lưu .edu', title: 'Lưu file .edu', img: 'steps/2-luu-edu.webp', ratio: 16 / 9,
    marks: [[54.7, 14.4], [70.1, 72.5]],
    tips: ['Bấm nút xanh Lưu file .edu', 'Bấm Lưu file .edu lần nữa'],
    note: 'File nằm trong thư mục Tải xuống (Downloads)',
  },
  {
    place: 'laptop', label: 'Lên Drive', title: 'Tải file lên Drive ClassIn', img: 'steps/3-drive.webp', ratio: 1280 / 672,
    marks: [[8.4, 50.2], [20.5, 25], [43, 12.8], [43.9, 20.2]],
    tips: ['Mở app ClassIn, bấm Drive', 'Drive của tôi', 'Tải lên', 'Tệp, chọn file .edu'],
  },
  {
    place: 'board', label: 'Đăng nhập', title: 'Đăng nhập màn hình lớp', img: 'steps/4-dang-nhap.webp', ratio: 1280 / 636,
    marks: [[35.2, 90.5], [37.9, 49.8]],
    tips: ['Vuốt lên, bấm ảnh đại diện', 'Quét mã QR bằng app ClassIn trên điện thoại'],
    warn: 'Đăng nhập CÙNG tài khoản với máy tính',
  },
  {
    place: 'board', label: 'Mở file', title: 'Mở file .edu', img: 'steps/5-mo-file.webp', ratio: 16 / 9,
    marks: [[42.6, 91.6], [21.3, 20.2], [56, 55.6]],
    tips: ['Bấm Tệp (Files)', 'Drive của tôi', 'Bấm file .edu của bài'],
  },
  {
    place: 'board', label: 'Chơi', title: 'Chọn trò chơi và chơi', img: 'steps/6-choi.webp', ratio: 16 / 9,
    marks: [[69.5, 46.1]],
    tips: ['Bấm trò chơi, rồi Bắt đầu chơi'],
    note: 'Muốn sửa bài: sửa ở Soạn bài, lưu file .edu mới, tải lên Drive lại',
  },
];

const PLACES = { laptop: { name: 'Máy tính', icon: 'laptop' }, board: { name: 'Màn hình lớp', icon: 'board' } };

export function openGuide() {
  let index = 0;
  let mode = 'steps';
  const calm = reducedMotion();

  const rail = h('ol', { class: 'gs-rail' });
  const stage = h('div', { class: 'gs-stage' });
  const info = h('div', { class: 'gs-info' });
  const prev = button({ label: 'Trước', iconName: 'chevron-left', onClick: () => go(index - 1), attrs: { 'data-testid': 'guide-prev' } });
  const next = button({ label: 'Tiếp', iconName: 'chevron-right', variant: 'primary', size: 'lg', onClick: () => (index < STEPS.length - 1 ? go(index + 1) : modal.close()), attrs: { 'data-testid': 'guide-next' } });
  const stepsView = h('div', { class: 'gs-steps' }, rail, stage, info, h('div', { class: 'gs-nav' }, prev, next));

  const video = h('video', { class: 'gs-video', src: `${BASE}huong-dan-luu-edu.mp4`, poster: `${BASE}huong-dan-luu-edu.jpg`, controls: true, playsInline: true, preload: 'none', 'data-testid': 'guide-video' });
  const videoView = h('div', { class: 'gs-video-view', hidden: true }, video);

  const tabs = h('div', { class: 'gs-tabs segmented', role: 'tablist' });
  const renderTabs = () => {
    tabs.textContent = '';
    [['steps', 'Từng bước', 'steps'], ['video', 'Xem video', 'film']].forEach(([key, label, ic]) =>
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
      rail.append(h('li', { class: 'gs-place' }, icon(PLACES[s.place].icon, 22), h('span', {}, PLACES[s.place].name)));
    }
    rail.append(h('li', { class: 'gs-dot-wrap' },
      h('button', { type: 'button', class: 'gs-dot', 'data-i': i, onClick: () => go(i), 'aria-label': `Bước ${i + 1}: ${s.label}` },
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
        h('span', { class: `gs-where gs-${s.place}` }, icon(PLACES[s.place].icon, 20), PLACES[s.place].name),
        h('h3', {}, h('span', { class: 'gs-step' }, `Bước ${index + 1}`), s.title)),
      h('ol', { class: 'gs-tips' }, s.tips.map((t, k) => h('li', { style: { animationDelay: `${0.35 + k * 0.7}s` } }, h('b', {}, String(k + 1)), t))),
      s.warn ? h('p', { class: 'gs-warn' }, icon('alert', 22), s.warn) : null,
      s.note ? h('p', { class: 'gs-note' }, icon('info', 20), s.note) : null].filter(Boolean));
    prev.disabled = index === 0;
    next.querySelector('span').textContent = index === STEPS.length - 1 ? 'Xong' : 'Tiếp';
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
    title: 'Soạn bài và mở trên màn hình ClassIn',
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
