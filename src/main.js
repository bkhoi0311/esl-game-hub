// Router: menu chính (#/) -> tab Soạn bài (#/editor) -> từng game (#/game/<id>).
import './styles/fonts.css';
import './styles/liquid-glass.css';
import './styles/main.css';
import './styles/kids.css';
import './styles/motion.css';
import './styles/liquid.css';
import './vendor/liquid-glass.js';
import { PERF, applyPerfClasses } from './core/perf.js';
import logoUrl from './assets/classin-logo-green.png';
import { GAMES, GROUPS, findGame } from './games/index.js';
import { getPack, hasEmbeddedPack, initLinkedPack, isLinkedPack, leaveLinkedPack, missingForGame, onPackChange } from './core/content.js';
import { mountEditor } from './core/editor.js';
import { mountCamCheck } from './core/camcheck.js';
import { getSettings, updateSettings } from './core/settings.js';
import { clipCount, getEnglishVoices, setVoiceGame, stopSpeaking, speak, ttsSupported, voiceFor, voiceLabel } from './core/audio.js';
import { line } from './core/voice-lines.js';
import { button, h, openModal, rangeWithSteps, segmented } from './core/ui.js';
import { icon } from './core/icons.js';
import { gameArt } from './core/art.js';
import { gsap } from 'gsap';
import { mountWorld, setWorld } from './core/world.js';
import { createMascot } from './core/mascot.js';
import { reducedMotion } from './core/events.js';
import { clearFx, setStreakEnabled } from './core/fx.js';

// Game 2 học sinh bấm song song trên 2 nửa bảng.
const DUEL_GAMES = new Set(['balloon-pop', 'whack-word', 'tug-of-war']);
// Game vẽ bằng Phaser (canvas cập nhật 60 khung/giây).
const PHASER_GAMES = new Set(['balloon-pop', 'whack-word', 'tug-of-war', 'word-ninja', 'statue-freeze']);

// Mở từ "link bài học" (#L=...): dùng bài trong link, chế độ trình chiếu (ẩn Soạn bài).
await initLinkedPack();
const PRESENT = isLinkedPack();
document.body.classList.toggle('present', PRESENT);

// Test tự động (Playwright) chỉ bấm được phần tử đứng yên: tắt chuyển động lặp khi trình duyệt do máy điều khiển.
if (navigator.webdriver) document.documentElement.classList.add('no-idle');
// Giao diện sáng cố định: nền thế giới hoạt hình là cảnh ban ngày, kính đọc rõ nhất trên nền sáng.
document.documentElement.dataset.theme = 'light';
// Hồ sơ hiệu năng (ClassIn X tự chọn 'lite'): đặt lớp html.perf-lite / no-glass / no-loop trước khi dựng nền.
applyPerfClasses();
window.__perf = PERF;
// Tab/cửa sổ bị ẩn thì dừng mọi GSAP (đỡ tốn CPU nền).
document.addEventListener('visibilitychange', () => gsap.globalTimeline.paused(document.hidden));

const app = document.getElementById('app');
let cleanup = null; // hàm dọn dẹp của màn hình đang mở

// ---------- Khung trang ----------

const packChip = h('a', { class: 'pack-chip', 'data-testid': 'pack-chip', href: PRESENT ? null : '#/editor', onClick: (e) => PRESENT && (e.preventDefault(), openSettings()) });
const navLinks = {
  menu: h('a', { href: '#/', class: 'nav-link' }, icon('gamepad', 22), h('span', {}, 'Trò chơi')),
  editor: h('a', { href: '#/editor', class: 'nav-link' }, icon('book-open', 22), h('span', {}, 'Soạn bài')),
};
// Viên trắng trượt dưới mục đang chọn (kiểu thanh chọn của Apple), chạy theo lò xo.
const navGlider = h('span', { class: 'nav-glider', 'aria-hidden': 'true' });
function moveGlider() {
  const nav = navGlider.parentElement;
  const active = nav && nav.querySelector('.nav-link.active:not([hidden])');
  if (!active || !active.offsetWidth) {
    navGlider.style.width = '0';
    return;
  }
  navGlider.style.left = `${active.offsetLeft}px`;
  navGlider.style.width = `${active.offsetWidth}px`;
}
// Nút về màn chọn 2 phần (trang tĩnh start/). Ẩn ở chế độ trình chiếu và bản offline 1 file.
const toChooser = h('a', { href: './start/index.html', class: 'to-chooser', 'data-testid': 'to-chooser', 'aria-label': 'Về màn chọn', title: 'Về màn chọn' },
  icon('grid', 22), h('span', {}, 'Màn chọn'));
if (PRESENT || __SINGLE_FILE__) toChooser.hidden = true;
const header = h(
  'header', { class: 'app-header' },
  toChooser,
  h('a', { href: '#/', class: 'brand', 'aria-label': 'ESL Game Hub' },
    h('img', { src: logoUrl, alt: 'ClassIn', class: 'brand-logo' }),
    h('span', { class: 'brand-sep' }),
    h('span', { class: 'brand-name' }, 'ESL Game Hub')),
  h('nav', { class: 'app-nav has-glider' }, navGlider, navLinks.menu, navLinks.editor),
  h('div', { class: 'header-mascot' }),
  packChip,
  button({ iconName: 'settings', title: 'Cài đặt', variant: 'ghost', onClick: openSettings, attrs: { 'data-testid': 'open-settings' } }),
);
const main = h('main', { class: 'app-main' });
const stage = h('div', { class: 'stage' }, header, main);
app.append(stage);
mountWorld(stage);

// Mascot Lumi ở thanh trên: luôn hiện, reo khi đúng, buồn khi sai (nghe kênh sự kiện).
const mascot = createMascot({ size: '4.8rem' });
header.querySelector('.header-mascot').append(mascot.el);
window.__mascot = mascot;

// ---------- Khung A4 ngang ----------
// Màn hình ngang (bảng tương tác 65/75/86 inch, laptop): cả app nằm gọn trong 1 khung tỉ lệ A4 ngang
// (1485 x 1050 đơn vị), tự phóng to/thu nhỏ theo màn hình, không cuộn trang.
// Màn hình dọc/hẹp (điện thoại): bỏ khung, trang cuộn bình thường.
const CANVAS = { width: 1485, height: 1050 };

function fitStage() {
  const w = window.innerWidth;
  const hgt = window.innerHeight;
  const framed = w >= 700 && w / hgt >= 1.15;
  const unit = framed ? Math.min(w / CANVAS.width, hgt / CANVAS.height) : Math.min(w / 430, 1.4);
  document.documentElement.style.fontSize = `${(16 * unit).toFixed(3)}px`;
  document.body.classList.toggle('framed', framed);
  document.body.classList.toggle('fluid', !framed);
}
fitStage();

// Cờ chẩn đoán ?diag=1: ghi mỗi lần chạm/bấm vào hộp chữ xanh ở góc dưới trái (chỉ đọc, không đổi hành vi).
if (/[?&]diag=1/.test(location.search) || location.hash.includes('diag=1')) {
  const box = h('pre', { class: 'diag-box', style: { position: 'fixed', left: '8px', bottom: '8px', zIndex: 99999, maxWidth: '46vw', maxHeight: '40vh', overflow: 'auto', background: 'rgba(0,0,0,.82)', color: '#0f0', font: '12px/1.35 monospace', padding: '8px', borderRadius: '8px', pointerEvents: 'none' } });
  document.body.append(box);
  const logDiag = (t) => { box.textContent = (t + '\n' + box.textContent).slice(0, 4000); };
  logDiag(`UA ${navigator.userAgent}\nmaxTouchPoints ${navigator.maxTouchPoints} dpr ${devicePixelRatio} rem ${getComputedStyle(document.documentElement).fontSize}`);
  const desc = (t) => (t && t.nodeType === 1
    ? `${t.tagName.toLowerCase()}${t.dataset && t.dataset.value != null ? '[v=' + t.dataset.value + ']' : ''}${t.closest('[data-testid]') ? ' in ' + t.closest('[data-testid]').dataset.testid : ''}${t.isConnected ? '' : ' (DETACHED)'}`
    : String(t));
  for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click']) {
    document.addEventListener(type, (e) => logDiag(`${type} ${e.pointerType || ''} w${Math.round(e.width || 0)} trusted=${e.isTrusted} -> ${desc(e.target)}`), true);
  }
}
// HUD chẩn đoán ?diag=2 (nhỏ, cập nhật 1 lần/giây): hồ sơ, nhịp rAF, số animation đang chạy, Phaser k + khung hình, GPU.
if (PERF.diag === '2') {
  const hud = h('pre', { 'data-testid': 'hud-perf', style: { position: 'fixed', right: '6px', bottom: '6px', zIndex: 99999, width: '220px', height: '90px', overflow: 'hidden', margin: 0, background: '#000c', color: '#9f9', font: '11px/1.3 monospace', padding: '4px 6px', borderRadius: '6px', pointerEvents: 'none', whiteSpace: 'pre' } });
  document.body.append(hud);
  let gpu = '?';
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    gpu = gl ? String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'không có WebGL';
    const lose = gl && gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
  } catch { /* giữ '?' */ }
  const soft = /swiftshader|software|llvmpipe|basic render/i.test(gpu);
  const gpuShort = gpu.replace(/^ANGLE \(|\)$/g, '').slice(0, 24);
  let frames = 0;
  let last = performance.now();
  let durs = [];
  let lastR = 0;
  let lastT = performance.now();
  const loop = (now) => { frames++; durs.push(now - last); last = now; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  setInterval(() => {
    const sorted = durs.slice().sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
    const fps = frames;
    frames = 0;
    durs = [];
    const anims = document.getAnimations().filter((a) => a.playState === 'running').length;
    const g = window.__phaser;
    const live = g && g.canvas && g.canvas.isConnected;
    const now = performance.now();
    let draw = '-';
    if (live) {
      // Số khung Phaser thật sự vẽ mỗi giây (có giới hạn: đếm khung đã qua bộ giới hạn).
      draw = g.__fpsLimit ? `${Math.round(((g.__rendered || 0) - lastR) / ((now - lastT) / 1000))}/${g.__fpsLimit}` : `${Math.round(g.loop.actualFps)}/-`;
      lastR = g.__rendered || 0;
    }
    lastT = now;
    const phaser = live ? `k=${(g.__k || 1).toFixed(2)} ${g.canvas.width}x${g.canvas.height}->${Math.round(g.canvas.getBoundingClientRect().width * devicePixelRatio)} ${draw}` : '-';
    hud.textContent = `Hồ sơ: ${PERF.name}(${PERF.source}) kính:${PERF.glass ? 1 : 0} lặp:${PERF.idle ? 1 : 0}\n`
      + `rAF: ${fps} fps p95 ${Math.round(p95)} ms\nAnim: ${anims} CSS\nPhaser: ${phaser}\nGL: ${gpuShort}${soft ? ' (PHẦN MỀM)' : ''}`;
  }, 1000);
}
window.addEventListener('resize', () => {
  fitStage();
  moveGlider();
});

function renderPackChip(pack) {
  packChip.textContent = '';
  packChip.append(icon(PRESENT ? 'link' : 'book-open', 18), h('span', {}, `${pack.title || 'Bài chưa đặt tên'}${pack.level ? ' · ' + pack.level : ''}`), icon('chevron-right', 18));
  packChip.title = PRESENT ? 'Bài học mở từ link' : hasEmbeddedPack() ? 'Nội dung nhúng trong file này' : 'Nội dung đang dùng. Bấm để soạn bài.';
}
renderPackChip(getPack());
onPackChange(renderPackChip);

// ---------- Menu chính ----------

// Bảng màu thẻ game: nền chuyển màu (trên, dưới), màu chữ tiêu đề, màu nút mũi tên.
const CARD_COLORS = {
  'statue-freeze': ['#8ec5ff', '#dcecff', '#1b2a7a', '#3b82f6'],
  'simon-pose': ['#ffd66b', '#fff1c7', '#c2410c', '#f59e0b'],
  'gold-heist': ['#b79bff', '#ece4ff', '#2e1a7a', '#8b5cf6'],
  impostor: ['#ff9fcf', '#ffe3f1', '#c81e6a', '#ec4899'],
  'tug-of-war': ['#8fd0ff', '#e0f3ff', '#1e3a8a', '#2563eb'],
  'whack-word': ['#a7e07a', '#e8f8d8', '#14532d', '#22c55e'],
  'head-tilt': ['#a7e07a', '#e8f8d8', '#14532d', '#22c55e'],
  'word-ninja': ['#d8a6ff', '#f5e6ff', '#3b0764', '#a855f7'],
  'balloon-pop': ['#8fd6ff', '#e3f5ff', '#1e3a8a', '#0ea5e9'],
  'memory-match': ['#ffa8d2', '#ffe6f2', '#be185d', '#ec4899'],
  'tic-tac-toe': ['#a7e07a', '#e8f8d8', '#14532d', '#22c55e'],
};

const SIGN_SVG = `<svg viewBox="0 0 220 150" aria-hidden="true">
  <path d="M60 110v40M160 110v40" stroke="#8a5a2b" stroke-width="12" stroke-linecap="round"/>
  <g transform="rotate(-8 110 60)">
    <rect x="10" y="14" width="200" height="96" rx="16" fill="#c98a4b" stroke="#8a5a2b" stroke-width="6"/>
    <path d="M22 44h176M22 78h176" stroke="#b27638" stroke-width="3" opacity=".6"/>
    <circle cx="28" cy="30" r="4" fill="#8a5a2b"/><circle cx="192" cy="30" r="4" fill="#8a5a2b"/>
    <text x="110" y="55" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="30" fill="#fff" stroke="#8a5a2b" stroke-width="6" paint-order="stroke">Let's</text>
    <text x="110" y="92" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="30" fill="#fff" stroke="#8a5a2b" stroke-width="6" paint-order="stroke">Learn &amp; Play!</text>
  </g></svg>`;

const BOOKS_SVG = `<svg viewBox="0 0 240 110" aria-hidden="true">
  <rect x="20" y="66" width="200" height="34" rx="8" fill="#ff8a3d" stroke="#c2410c" stroke-width="4"/>
  <rect x="26" y="72" width="188" height="8" rx="4" fill="#fff" opacity=".6"/>
  <g transform="rotate(-4 120 50)"><rect x="34" y="30" width="180" height="36" rx="8" fill="#04bc09" stroke="#027c05" stroke-width="4"/>
  <rect x="40" y="36" width="168" height="8" rx="4" fill="#fff" opacity=".5"/>
  <text x="124" y="60" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="20" fill="#fff">ClassIn</text></g>
  <g transform="rotate(3 120 20)"><rect x="50" y="2" width="150" height="30" rx="8" fill="#38bdf8" stroke="#0369a1" stroke-width="4"/>
  <rect x="56" y="8" width="138" height="7" rx="3.5" fill="#fff" opacity=".6"/></g></svg>`;

function renderMenu(root) {
  const pack = getPack();
  const motion = !reducedMotion();
  const big = createMascot({ size: '10rem', react: false, bubble: false });
  const peek = createMascot({ size: '7rem', react: false, bubble: false });
  const tabs = h('div', { class: 'group-tabs', role: 'group', 'aria-label': 'Nhóm trò chơi' });
  const heads = h('div', { class: 'menu-heads' }, h('div', { class: 'menu-peek' }, peek.el), tabs);
  const grid = h('div', { class: 'card-grid' });

  // Lưới 6 cột x 2 hàng: 2 cột trái cho game camera, 4 cột phải cho game thi đấu.
  for (const group of GROUPS) {
    const games = GAMES.filter((g) => g.group === group.id);
    const cols = group.id === 'camera' ? 2 : 4;
    const first = group.id === 'camera' ? 1 : 3;
    games.forEach((g, i) => {
      const card = gameCard(g, pack, i);
      card.dataset.group = group.id;
      card.style.gridRow = String(Math.floor(i / cols) + 1);
      card.style.gridColumn = String((i % cols) + first);
      grid.append(card);
    });
    const tab = h('button', { type: 'button', class: `group-tab group-${group.id}`, 'data-testid': `group-${group.id}` },
      h('span', { class: 'group-icon' }, icon(group.id === 'camera' ? 'camera' : 'users', 30)),
      h('span', { class: 'group-text' }, h('strong', {}, group.title), h('small', {}, group.hint)),
      h('span', { class: 'group-go' }, icon('chevron-right', 22)));
    // Bấm vào nhóm: các thẻ trong nhóm nhún nhảy chào.
    tab.addEventListener('click', () => {
      if (motion) gsap.fromTo(grid.querySelectorAll(`[data-group="${group.id}"]`), { y: 0 }, { y: -18, duration: 0.18, yoyo: true, repeat: 1, stagger: 0.06, ease: 'power2.out' });
      speak(group.id === 'camera' ? 'Stand up and move!' : 'Come to the board!');
    });
    tabs.append(tab);
  }
  heads.append(h('div', { class: 'menu-sign', innerHTML: SIGN_SVG }));
  // Ô trống cuối lưới: bé Lumi cỡ lớn + chồng sách.
  const menuMascot = h('div', { class: 'menu-mascot' },
    h('div', { class: 'pick-bubble en' }, 'Pick a game!'),
    big.el,
    h('div', { class: 'menu-books', innerHTML: BOOKS_SVG }));
  grid.append(menuMascot);
  const view = h('div', { class: 'menu' }, heads, grid);
  root.append(view);
  // Hồ sơ lite: chờ lớp fade mở menu xong (600 ms) rồi mới vẫy tay. 2 bé vẫy LẦN LƯỢT: nếu cùng lúc, vùng hỏng của khung
  // là hình chữ nhật bao cả 2 bé (gần hết màn) dù mỗi bé chỉ nhỏ.
  const lite = PERF.name === 'lite';
  const waveTimers = [setTimeout(() => big.wave(), lite ? 600 : 0), setTimeout(() => peek.wave(), lite ? 2200 : 0)];

  // Khúc xạ kính thật (Chromium) cho nhóm tab; trình duyệt khác dùng kính mờ.
  const refract = window.liquidGlass && !reducedMotion() && PERF.glass ? window.liquidGlass(tabs, { scale: -70, chroma: 4, blur: 5, saturate: 1.6 }) : null;
  const tweens = [];
  if (motion && PERF.name === 'lite') {
    // Hồ sơ lite: chỉ 1 lớp fade 0,25 s cho cả menu (opacity trên lớp được nâng), không GSAP từng thẻ.
    view.style.willChange = 'opacity';
    tweens.push(gsap.fromTo(view, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power1.out', onComplete: () => { view.style.willChange = ''; gsap.set(view, { clearProps: 'opacity' }); } }));
    gsap.set(view.querySelector('.pick-bubble'), { rotation: -6 });
  } else if (motion) {
    // Menu = thanh điều khiển: trượt lên gọn, không nảy; cả chuỗi so le ≤ 0,5 s (skill game-feel-motion).
    gsap.from(view.querySelectorAll('.game-card'), { y: 24, opacity: 0, scale: 0.96, duration: 0.45, stagger: { each: 0.035, from: 'start' }, ease: 'power2.out', clearProps: 'transform,opacity' });
    gsap.from(view.querySelectorAll('.group-tab'), { y: 10, opacity: 0, duration: 0.35, stagger: 0.06, delay: 0.1, ease: 'power2.out', clearProps: 'transform,opacity' });
    tweens.push(gsap.fromTo(view.querySelector('.pick-bubble'), { scale: 0, rotation: -20 }, { scale: 1, rotation: -6, duration: 0.6, delay: 0.7, ease: 'back.out(3)' }));
  }
  // Lumi vẫy tay nhắc nhẹ mỗi 7 giây.
  const nudge = setInterval(() => big.wave(), PERF.idle ? 7000 : 20000);
  return () => {
    clearInterval(nudge);
    waveTimers.forEach(clearTimeout);
    if (refract) refract.destroy();
    tweens.forEach((t) => t.kill());
    big.destroy();
    peek.destroy();
    view.remove();
  };
}

function gameCard(game, pack, index) {
  const missing = game.ready ? missingForGame(game, pack) : [];
  const [c1, c2, ink, accent] = CARD_COLORS[game.id] || ['#bfe8b0', '#eefae8', '#14532d', '#22c55e'];
  const badges = h('div', { class: 'card-badges' },
    game.needsCamera ? h('span', { class: 'badge badge-camera' }, icon('camera', 16), 'Cần camera') : null,
    !game.ready ? h('span', { class: 'badge badge-soon' }, icon('clock', 16), 'Sắp có') : null,
    game.ready && missing.length ? h('span', { class: 'badge badge-warn' }, icon('alert', 16), 'Thiếu nội dung') : null,
  );
  const card = h(
    'a',
    {
      href: game.ready ? `#/game/${game.id}` : null,
      class: `game-card${game.ready ? '' : ' disabled'}`,
      style: { '--c1': c1, '--c2': c2, '--ink-card': ink, '--accent-card': accent, '--i': index },
      'aria-disabled': game.ready ? null : 'true',
      'data-game': game.id,
      onClick: (e) => {
        if (!game.ready) e.preventDefault();
      },
    },
    h('span', { class: 'card-pic' }, gameArt(game.id)),
    badges,
    h('span', { class: 'card-panel' },
      h('span', { class: 'card-title' }, game.title),
      h('span', { class: 'card-desc' }, game.description),
      h('span', { class: 'card-go' }, icon('chevron-right', 26))),
  );
  // Chuột: thẻ nghiêng nhẹ theo con trỏ (màn cảm ứng không có hover nên không bị ảnh hưởng).
  if (!reducedMotion()) {
    card.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--ry', `${(((e.clientX - r.left) / r.width) - 0.5) * 8}deg`);
      card.style.setProperty('--rx', `${(0.5 - ((e.clientY - r.top) / r.height)) * 8}deg`);
    });
    card.addEventListener('pointerleave', () => {
      card.style.removeProperty('--rx');
      card.style.removeProperty('--ry');
    });
  }
  return card;
}

// ---------- Màn hình game ----------

function renderGame(root, id) {
  const game = findGame(id);
  const host = h('div', { class: 'game-host' });
  root.append(host);

  if (!game || !game.ready) {
    host.append(notice('Trò chơi này sắp có', game ? `"${game.title}" đang được xây dựng.` : 'Không tìm thấy trò chơi.'));
    return () => host.remove();
  }
  const pack = getPack();
  const missing = missingForGame(game, pack);
  if (missing.length) {
    host.append(notice(`${game.title}: cần thêm nội dung`, missing, true));
    return () => host.remove();
  }
  try {
    game.mount(host, pack, getSettings());
  } catch (err) {
    console.error(err);
    host.textContent = '';
    host.append(notice('Có lỗi khi mở trò chơi', String(err.message || err)));
  }
  return () => {
    try {
      game.unmount();
    } finally {
      host.remove();
    }
  };
}

function notice(title, lines, toEditor = false) {
  return h(
    'div', { class: 'notice' },
    icon('alert', 48),
    h('h2', {}, title),
    h('ul', {}, [].concat(lines).map((l) => h('li', {}, l))),
    h('div', { class: 'notice-actions' },
      toEditor ? h('a', { href: '#/editor', class: 'btn btn-primary' }, icon('book-open', 22), h('span', {}, 'Mở Soạn bài')) : null,
      h('a', { href: '#/', class: 'btn btn-ghost' }, icon('home', 22), h('span', {}, 'Về menu'))),
  );
}

// ---------- Cài đặt ----------

async function openSettings() {
  const s = getSettings();
  const voiceInfo = h('p', { class: 'muted' }, 'Đang kiểm tra giọng đọc...');
  const rateValue = h('output', {}, s.ttsRate.toFixed(1));

  const linkBox = PRESENT
    ? h('div', { class: 'link-box' },
      h('p', {}, h('strong', {}, 'Đang mở bài học từ link.'), ' Chế độ trình chiếu: ẩn Soạn bài để học sinh không sửa nhầm.'),
      h('div', { class: 'link-box-actions' },
        button({ label: 'Sửa bài này', iconName: 'pencil', variant: 'primary', onClick: () => leaveLinkedPack({ edit: true }), attrs: { 'data-testid': 'edit-linked' } }),
        button({ label: 'Thoát chế độ trình chiếu', iconName: 'log-out', onClick: () => leaveLinkedPack() })))
    : null;
  const body = h(
    'div', { class: 'settings' },
    linkBox,
    h('label', { class: 'switch-row' },
      h('input', { type: 'checkbox', checked: s.sound, onChange: (e) => updateSettings({ sound: e.target.checked }) }),
      h('span', {}, 'Bật âm thanh hiệu ứng (đúng / sai / thắng)')),
    h('div', { class: 'field', role: 'group', 'aria-labelledby': 'set-accent' },
      h('span', { id: 'set-accent' }, 'Giọng đọc tiếng Anh'),
      segmented([{ value: 'en-US', label: 'Anh-Mỹ (en-US)' }, { value: 'en-GB', label: 'Anh-Anh (en-GB)' }], s.accent, (v) => updateSettings({ accent: v }), 'accent')),
    h('div', { class: 'field', role: 'group', 'aria-labelledby': 'set-rate' },
      h('span', { id: 'set-rate' }, 'Tốc độ đọc ', rateValue),
      rangeWithSteps(h('input', {
        type: 'range', min: 0.5, max: 1.5, step: 0.1, value: s.ttsRate, 'aria-labelledby': 'set-rate', 'data-testid': 'tts-rate',
        onInput: (e) => { rateValue.textContent = Number(e.target.value).toFixed(1); updateSettings({ ttsRate: Number(e.target.value) }); },
      }), { step: 0.1, label: 'tốc độ đọc' })),
    h('div', { class: 'field', role: 'group', 'aria-labelledby': 'set-voice' },
      h('span', { id: 'set-voice' }, 'Giọng đọc'),
      segmented([
        { value: 'omni', label: 'Giọng thu sẵn (OmniVoice)' },
        { value: 'web', label: 'Giọng máy (Web Speech)' },
      ], s.voiceMode !== 'web' ? 'omni' : 'web', (v) => updateSettings({ voiceMode: v }), 'voice-mode'),
      h('small', { class: 'muted' }, `Giọng thu sẵn: mỗi game 1 giọng dẫn (${clipCount()} câu).`)),
    h('div', { class: 'voice-list' },
      GAMES.filter((g) => g.ready).map((g) =>
        h('div', { class: 'voice-row' },
          h('span', { class: 'en' }, g.title),
          h('span', { class: 'muted' }, voiceLabel(voiceFor(g.id))),
          button({ iconName: 'volume', title: `Nghe giọng ${g.title}`, variant: 'ghost', onClick: () => speak(line('letsPlay'), { voice: voiceFor(g.id) }) })))),
    h('p', { class: 'muted' }, 'Câu chưa thu sẵn (nội dung mới thêm) sẽ đọc bằng giọng máy. Anh-Mỹ/Anh-Anh và tốc độ bên dưới chỉ áp dụng cho giọng máy.'),
    button({ label: 'Nghe thử giọng máy', iconName: 'volume', onClick: () => speak('Hello class! Are you ready to play?', { web: true }) }),
    voiceInfo,
    h('p', { class: 'muted' }, 'Chọn camera sẽ có khi làm các game dùng camera.'),
  );
  openModal({ title: 'Cài đặt', body, actions: [{ label: 'Xong', variant: 'primary' }] });

  if (!ttsSupported()) {
    voiceInfo.textContent = 'Trình duyệt này không hỗ trợ đọc giọng nói. Nên dùng Chrome hoặc Edge.';
    voiceInfo.className = 'warn-text';
    return;
  }
  const voices = await getEnglishVoices();
  if (voices.length) {
    voiceInfo.textContent = `Máy có ${voices.length} giọng tiếng Anh.`;
  } else {
    voiceInfo.textContent = 'Máy chưa có giọng đọc tiếng Anh. Windows: Settings > Time & Language > Speech > Add voices, chọn English (United States).';
    voiceInfo.className = 'warn-text';
  }
}

// ---------- Router ----------

function route() {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  const hash = location.hash.replace(/^#/, '') || '/';
  const parts = hash.split('/').filter(Boolean);
  let view = parts[0] || 'menu';
  if (PRESENT && view === 'editor') {
    location.replace('#/');
    return;
  }
  if (!['menu', 'editor', 'game', 'camcheck'].includes(view)) view = 'menu';

  navLinks.menu.classList.toggle('active', view === 'menu');
  navLinks.editor.classList.toggle('active', view === 'editor');
  requestAnimationFrame(moveGlider);
  document.body.dataset.view = view;
  main.scrollTop = 0;
  window.scrollTo(0, 0);

  stopSpeaking();
  clearFx(); // hạt, pháo giấy, chữ bay của màn trước không được chạy tiếp sang màn mới
  setVoiceGame(view === 'game' ? parts[1] : null);
  const game = view === 'game' ? findGame(parts[1]) : null;
  // Game 2 bé bấm song song: không có "chuỗi đúng" chung (tránh hiệu ứng lớn bật liên tục).
  setStreakEnabled(!(game && DUEL_GAMES.has(game.id)));
  // Game camera: chế độ nhẹ (bỏ kính mờ, dừng nền động) để máy OPS còn sức cho video + AI + lớp ClassIn.
  // Game Phaser (canvas vẽ lại liên tục) cũng dùng chế độ nhẹ: kính mờ đè lên canvas động rất tốn GPU.
  document.body.classList.toggle('perf-cam', Boolean(game && (PERF.name === 'lite' || game.needsCamera || PHASER_GAMES.has(game.id))));
  setWorld(view === 'editor' ? 'plain' : game ? game.theme || 'meadow' : 'meadow');
  if (view === 'editor') cleanup = mountEditor(main);
  else if (view === 'camcheck') cleanup = mountCamCheck(main);
  else if (view === 'game') cleanup = renderGame(main, parts[1]);
  else cleanup = renderMenu(main);
}

window.addEventListener('hashchange', route);
route();
