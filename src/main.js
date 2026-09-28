// Router: menu chính (#/) -> tab Soạn bài (#/editor) -> từng game (#/game/<id>).
import './styles/main.css';
import { GAMES, GROUPS, findGame } from './games/index.js';
import { getPack, hasEmbeddedPack, missingForGame, onPackChange } from './core/content.js';
import { mountEditor } from './core/editor.js';
import { getSettings, updateSettings } from './core/settings.js';
import { getEnglishVoices, speak, ttsSupported } from './core/audio.js';
import { button, h, openModal } from './core/ui.js';
import { icon } from './core/icons.js';

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
  h('a', { href: '#/', class: 'brand' }, h('span', { class: 'brand-mark' }, 'ESL'), h('span', { class: 'brand-name' }, 'Game Hub')),
  h('nav', { class: 'app-nav' }, navLinks.menu, navLinks.editor),
  packChip,
  button({ iconName: 'settings', title: 'Cài đặt', variant: 'ghost', onClick: openSettings, attrs: { 'data-testid': 'open-settings' } }),
);
const main = h('main', { class: 'app-main' });
app.append(header, main);

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
  root.append(view);
  return () => view.remove();
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
      class: `game-card${game.ready ? '' : ' disabled'}`,
      'aria-disabled': game.ready ? null : 'true',
      'data-game': game.id,
      onClick: (e) => {
        if (!game.ready) e.preventDefault();
      },
    },
    h('span', { class: 'card-icon' }, icon(game.icon, 40)),
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
    button({ label: 'Nghe thử', iconName: 'volume', onClick: () => speak('Hello class! Are you ready to play?') }),
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

  if (view === 'editor') cleanup = mountEditor(main);
  else if (view === 'game') cleanup = renderGame(main, parts[1]);
  else cleanup = renderMenu(main);
}

window.addEventListener('hashchange', route);
route();
