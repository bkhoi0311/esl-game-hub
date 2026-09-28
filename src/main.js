// Router: menu chính (#/) -> tab Soạn bài (#/editor) -> từng game (#/game/<id>).
import './styles/fonts.css';
import './styles/main.css';
import './styles/kids.css';
import logoUrl from './assets/classin-logo-green.png';
import { GAMES, GROUPS, findGame } from './games/index.js';
import { getPack, hasEmbeddedPack, missingForGame, onPackChange } from './core/content.js';
import { mountEditor } from './core/editor.js';
import { getSettings, updateSettings } from './core/settings.js';
import { clipCount, getEnglishVoices, setVoiceGame, stopSpeaking, speak, ttsSupported, voiceFor, voiceLabel } from './core/audio.js';
import { line } from './core/voice-lines.js';
import { button, h, openModal } from './core/ui.js';
import { icon } from './core/icons.js';
import { gameArt } from './core/art.js';
import { gsap } from 'gsap';
import { mountWorld, setWorld } from './core/world.js';
import { createMascot } from './core/mascot.js';
import { reducedMotion } from './core/events.js';
import './core/fx.js';

const app = document.getElementById('app');
let cleanup = null; // hàm dọn dẹp của màn hình đang mở

// ---------- Khung trang ----------

const packChip = h('span', { class: 'pack-chip', 'data-testid': 'pack-chip' });
const navLinks = {
  menu: h('a', { href: '#/', class: 'nav-link' }, icon('gamepad', 22), h('span', {}, 'Trò chơi')),
  editor: h('a', { href: '#/editor', class: 'nav-link' }, icon('book-open', 22), h('span', {}, 'Soạn bài')),
};
const header = h(
  'header', { class: 'app-header' },
  h('a', { href: '#/', class: 'brand', 'aria-label': 'ESL Game Hub' },
    h('img', { src: logoUrl, alt: 'ClassIn', class: 'brand-logo' }),
    h('span', { class: 'brand-sep' }),
    h('span', { class: 'brand-name' }, 'ESL Game Hub')),
  h('nav', { class: 'app-nav' }, navLinks.menu, navLinks.editor),
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
window.addEventListener('resize', fitStage);

function renderPackChip(pack) {
  packChip.textContent = '';
  packChip.append(icon('book-open', 18), h('span', {}, `${pack.title || 'Bài chưa đặt tên'}${pack.level ? ' · ' + pack.level : ''}`));
  packChip.title = hasEmbeddedPack() ? 'Nội dung nhúng trong file này' : 'Nội dung đang dùng';
}
renderPackChip(getPack());
onPackChange(renderPackChip);

// ---------- Menu chính ----------

function renderMenu(root) {
  const pack = getPack();
  const view = h('div', { class: 'menu' });
  for (const group of GROUPS) {
    const games = GAMES.filter((g) => g.group === group.id);
    view.append(
      h(
        'section', { class: `menu-group group-${group.id}` },
        h('div', { class: 'menu-group-head' },
          h('h2', {}, icon(group.id === 'camera' ? 'camera' : 'users', 28), group.title),
          h('p', {}, group.hint)),
        h('div', { class: 'card-grid' }, games.map((g) => gameCard(g, pack))),
      ),
    );
  }
  // Ô trống cuối lưới: bé Lumi cỡ lớn chào các bé.
  const big = createMascot({ size: '11rem', react: false });
  const classGrid = view.querySelector('.group-class .card-grid');
  const menuMascot = h('div', { class: 'menu-mascot' }, big.el);
  if (classGrid && classGrid.children.length % 4) classGrid.append(menuMascot);
  root.append(view);
  big.wave();
  big.say('Pick a game!', 0);
  if (!reducedMotion()) {
    gsap.from(view.querySelectorAll('.game-card'), { y: 40, opacity: 0, scale: 0.9, duration: 0.5, stagger: 0.05, ease: 'back.out(1.8)', clearProps: 'all' });
  }
  return () => {
    big.destroy();
    view.remove();
  };
}

function gameCard(game, pack) {
  const missing = game.ready ? missingForGame(game, pack) : [];
  const badges = h('div', { class: 'card-badges' },
    game.needsCamera ? h('span', { class: 'badge badge-camera' }, icon('camera', 16), 'Cần camera') : null,
    !game.ready ? h('span', { class: 'badge badge-soon' }, icon('clock', 16), 'Sắp có') : null,
    game.ready && missing.length ? h('span', { class: 'badge badge-warn' }, icon('alert', 16), 'Thiếu nội dung') : null,
  );
  return h(
    'a',
    {
      href: game.ready ? `#/game/${game.id}` : null,
      class: `game-card theme-${game.theme || 'meadow'}${game.ready ? '' : ' disabled'}`,
      'aria-disabled': game.ready ? null : 'true',
      'data-game': game.id,
      onClick: (e) => {
        if (!game.ready) e.preventDefault();
      },
    },
    gameArt(game.id),
    h('span', { class: 'card-title' }, game.title),
    h('span', { class: 'card-desc' }, game.description),
    badges,
  );
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

  const body = h(
    'div', { class: 'settings' },
    h('label', { class: 'switch-row' },
      h('input', { type: 'checkbox', checked: s.sound, onChange: (e) => updateSettings({ sound: e.target.checked }) }),
      h('span', {}, 'Bật âm thanh hiệu ứng (đúng / sai / thắng)')),
    h('label', { class: 'field' },
      h('span', {}, 'Giọng đọc tiếng Anh'),
      h('select', { onChange: (e) => updateSettings({ accent: e.target.value }) },
        h('option', { value: 'en-US', selected: s.accent === 'en-US' }, 'Anh-Mỹ (en-US)'),
        h('option', { value: 'en-GB', selected: s.accent === 'en-GB' }, 'Anh-Anh (en-GB)'))),
    h('label', { class: 'field' },
      h('span', {}, 'Tốc độ đọc ', rateValue),
      h('input', {
        type: 'range', min: 0.5, max: 1.5, step: 0.1, value: s.ttsRate,
        onInput: (e) => { rateValue.textContent = Number(e.target.value).toFixed(1); updateSettings({ ttsRate: Number(e.target.value) }); },
      })),
    h('label', { class: 'field' },
      h('span', {}, 'Giọng đọc'),
      h('select', { 'data-testid': 'voice-mode', onChange: (e) => updateSettings({ voiceMode: e.target.value }) },
        h('option', { value: 'omni', selected: s.voiceMode !== 'web' }, `Giọng OmniVoice thu sẵn, mỗi game 1 giọng dẫn (${clipCount()} câu)`),
        h('option', { value: 'web', selected: s.voiceMode === 'web' }, 'Chỉ dùng giọng máy (Web Speech)'))),
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
  const view = parts[0] || 'menu';

  navLinks.menu.classList.toggle('active', view === 'menu');
  navLinks.editor.classList.toggle('active', view === 'editor');
  document.body.dataset.view = view;
  main.scrollTop = 0;
  window.scrollTo(0, 0);

  stopSpeaking();
  setVoiceGame(view === 'game' ? parts[1] : null);
  const game = view === 'game' ? findGame(parts[1]) : null;
  setWorld(view === 'editor' ? 'plain' : game ? game.theme || 'meadow' : 'meadow');
  if (view === 'editor') cleanup = mountEditor(main);
  else if (view === 'game') cleanup = renderGame(main, parts[1]);
  else cleanup = renderMenu(main);
}

window.addEventListener('hashchange', route);
route();
