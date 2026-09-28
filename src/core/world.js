// Nền "thế giới hoạt hình" phía sau khung app: bầu trời, mây trôi, đồi, sao lấp lánh.
// Mỗi màn có 1 bối cảnh (theme). Vẽ bằng SVG, chuyển động bằng CSS (tắt khi prefers-reduced-motion).
const W = 1485;
const H = 1050;

const cloud = (x, y, s, cls = '') => `<g transform="translate(${x} ${y}) scale(${s})"><g class="w-cloud ${cls}">
  <path d="M20 60q-20 0-20-18t22-20q6-22 32-22t34 20q26-4 30 20t-22 20z" fill="#fff" stroke="#cfe3ef" stroke-width="3"/></g></g>`;
const star = (x, y, r, d) => `<g transform="translate(${x} ${y}) scale(${r})"><path class="w-twinkle" style="animation-delay:${d}s" d="M0-10L2.6-2.6 10 0 2.6 2.6 0 10-2.6 2.6-10 0-2.6-2.6z" fill="#fff6b0"/></g>`;
const flower = (x, y, c) => `<g transform="translate(${x} ${y})"><path d="M0 0v22" stroke="#2e9a3a" stroke-width="3"/>
  ${[0, 72, 144, 216, 288].map((a) => `<circle cx="${(Math.cos((a * Math.PI) / 180) * 7).toFixed(1)}" cy="${(Math.sin((a * Math.PI) / 180) * 7).toFixed(1)}" r="6" fill="${c}"/>`).join('')}<circle r="4.5" fill="#ffd23f"/></g>`;

function hills(c1, c2, c3) {
  return `<path d="M0 ${H - 250}q220-120 460-30t520-20 505 40V${H}H0z" fill="${c1}"/>
    <path d="M0 ${H - 170}q300-90 620-10t560-30 305 20V${H}H0z" fill="${c2}"/>
    <path d="M0 ${H - 90}q380-60 760 0t725-20V${H}H0z" fill="${c3}"/>`;
}

const clouds = () => cloud(80, 110, 1.3, 'c1') + cloud(620, 60, 0.9, 'c2') + cloud(1080, 150, 1.1, 'c3') + cloud(1300, 40, 0.7, 'c1');
const sun = (x, y) => `<g transform="translate(${x} ${y})"><circle class="w-sun" r="70" fill="#ffd23f" stroke="#ffb400" stroke-width="10" stroke-dasharray="14 18"/></g>`;
const flowers = (list) => list.map(([x, y, c]) => `<g class="w-sway" style="animation-delay:${(-(x % 7) * 0.4).toFixed(1)}s">${flower(x, y, c)}</g>`).join('');

// Mặt trời có khuôn mặt: tia nắng xoay chậm, mặt cười chớp mắt.
const happySun = (x, y) => `<g transform="translate(${x} ${y})">
  <g class="w-sun">${Array.from({ length: 12 }, (_, i) => `<path d="M0-96l12 22h-24z" fill="#ffc21a" transform="rotate(${i * 30})"/>`).join('')}</g>
  <circle r="70" fill="url(#w-sunfill)"/>
  <g class="w-blink"><ellipse cx="-24" cy="-6" rx="7" ry="10" fill="#5a3a12"/><ellipse cx="24" cy="-6" rx="7" ry="10" fill="#5a3a12"/>
  <circle cx="-21" cy="-10" r="2.6" fill="#fff"/><circle cx="27" cy="-10" r="2.6" fill="#fff"/></g>
  <path d="M-22 18q22 22 44 0" fill="none" stroke="#5a3a12" stroke-width="6" stroke-linecap="round"/>
  <ellipse cx="-44" cy="14" rx="11" ry="7" fill="#ff8a5c" opacity=".55"/><ellipse cx="44" cy="14" rx="11" ry="7" fill="#ff8a5c" opacity=".55"/></g>`;

// Hàng cây và bụi cỏ tròn phía xa.
const tree = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-8" y="0" width="16" height="60" rx="6" fill="#9b6a3c"/>
  <circle cx="0" cy="-10" r="44" fill="#3fae4a"/><circle cx="-30" cy="10" r="30" fill="#48bb52"/><circle cx="30" cy="8" r="32" fill="#48bb52"/><circle cx="-10" cy="-30" r="20" fill="#6fd06f" opacity=".7"/></g>`;
const bush = (x, y, s, c = '#3fb34c') => `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="-34" cy="0" r="30" fill="${c}"/><circle cx="0" cy="-14" r="38" fill="${c}"/><circle cx="36" cy="0" r="30" fill="${c}"/><circle cx="-8" cy="-26" r="14" fill="#fff" opacity=".18"/></g>`;
const fence = (x, y, n) => `<g transform="translate(${x} ${y})" fill="#e0a86a" stroke="#a8703a" stroke-width="5">${Array.from({ length: n }, (_, i) => `<path d="M${i * 46} 0l14-16 14 16v84h-28z"/>`).join('')}<rect x="-8" y="22" width="${n * 46 + 4}" height="14" rx="6"/><rect x="-8" y="56" width="${n * 46 + 4}" height="14" rx="6"/></g>`;

const THEMES = {
  // Menu: đồng cỏ nắng
  meadow: {
    sky: ['#8fd8ff', '#e6f8ff'],
    body: () => `${happySun(1400, 110)}${clouds()}
      ${tree(60, 560, 1.1)}${tree(170, 600, 0.8)}${tree(1300, 590, 1)}${tree(1420, 560, 1.2)}
      ${hills('#a6e67f', '#7fd862', '#5cc84e')}
      ${bush(40, 820, 1.2)}${bush(1450, 830, 1.3, '#36a843')}${bush(720, 880, 0.9, '#4cbf55')}
      ${fence(-10, 900, 5)}
      ${flowers([[120, 950, '#fd3cc6'], [240, 990, '#ffffff'], [420, 960, '#ff9800'], [610, 1000, '#ffd23f'], [900, 985, '#fd3cc6'], [1060, 950, '#ffffff'], [1220, 995, '#00a2fd'], [1380, 975, '#ff5a7a']])}`,
  },
  // Bóng bay: bầu trời cầu vồng
  sky: {
    sky: ['#7fd3ff', '#e9f8ff'],
    body: () => `<g opacity=".5" fill="none" stroke-width="34">${['#ff5a7a', '#ff9800', '#ffd23f', '#6ad36a', '#00a2fd', '#a26bff'].map((c, i) => `<path d="M-60 ${H + 40}A ${860 - i * 34} ${760 - i * 34} 0 0 1 ${W + 60} ${H + 40}" stroke="${c}"/>`).join('')}</g>
      ${clouds()}${cloud(200, 520, 1.6, 'c2')}${cloud(1100, 600, 1.4, 'c3')}`,
  },
  // Chuột chũi: khu vườn có hàng rào
  garden: {
    sky: ['#aee6ff', '#f0fbff'],
    body: () => `${sun(1360, 120)}${clouds()}${hills('#b6ea8a', '#8fdc68', '#6ccb4f')}
      <g stroke="#a4703f" stroke-width="8" fill="#d9a066">${Array.from({ length: 16 }, (_, i) => `<rect x="${i * 95 + 10}" y="${H - 330}" width="40" height="120" rx="12"/>`).join('')}<rect x="0" y="${H - 300}" width="${W}" height="18" rx="9"/></g>
      ${flowers([[80, 960, '#ff5a7a'], [400, 990, '#ffd23f'], [760, 960, '#ffffff'], [1080, 995, '#ff9800'], [1400, 960, '#fd3cc6']])}`,
  },
  // Word Ninja / Statue Freeze: đêm sao
  night: {
    sky: ['#1d1b4f', '#4b3a8f'],
    body: () => `<circle cx="1260" cy="150" r="80" fill="#fff6c8"/><circle cx="1295" cy="130" r="72" fill="#3a3375"/>
      ${Array.from({ length: 34 }, (_, i) => star((i * 211) % W, ((i * 97) % 620) + 30, 0.6 + (i % 4) * 0.35, (i % 7) * 0.4)).join('')}
      ${hills('#3c3a86', '#2f2c70', '#24215a')}`,
  },
  // Gold Heist: đảo kho báu
  island: {
    sky: ['#6fd0ff', '#dff7ff'],
    body: () => `${sun(200, 140)}${clouds()}
      <path d="M0 ${H - 260}h${W}V${H}H0z" fill="#38b6f0"/>
      <g class="w-wave"><path d="M-240 ${H - 250}${'q60-20 120 0t120 0'.repeat(8)}v20H-240z" fill="#8fdcff"/></g>
      <path d="M160 ${H}q260-190 560-150t620 150z" fill="#ffe29a" stroke="#f2c55b" stroke-width="6"/>`,
  },
  // Memory / Impostor: xứ kẹo
  candy: {
    sky: ['#ffd6ef', '#fff4fb'],
    body: () => `${clouds()}${hills('#ffc2e2', '#ffa9d6', '#f78cc6')}
      ${[[140, 860, '#00e1f3'], [460, 900, '#ffd23f'], [980, 880, '#a26bff'], [1320, 905, '#04bc09']].map(([x, y, c]) => `<g transform="translate(${x} ${y})"><path d="M0 0v90" stroke="#fff" stroke-width="10"/><circle r="44" fill="${c}" stroke="#fff" stroke-width="8"/><path d="M-30 0a30 30 0 0 1 60 0a20 20 0 0 1-40 0a10 10 0 0 1 20 0" fill="none" stroke="#fff" stroke-width="7"/></g>`).join('')}`,
  },
  // Tug of War / Tic-Tac-Toe: sân cỏ
  field: {
    sky: ['#8fdcff', '#eafaff'],
    body: () => `${sun(1330, 120)}${clouds()}<path d="M0 ${H - 300}h${W}V${H}H0z" fill="#7fd36a"/>
      ${Array.from({ length: 8 }, (_, i) => `<rect x="${i * 190}" y="${H - 300}" width="95" height="300" fill="#74c95f"/>`).join('')}
      <path d="M${W / 2} ${H - 300}V${H}" stroke="#fff" stroke-width="10" opacity=".8"/>`,
  },
  // Soạn bài: nền dịu
  plain: {
    sky: ['#eef8f0', '#f7f7f7'],
    body: () => `${cloud(1180, 40, 0.8, 'c1')}${cloud(60, 120, 0.7, 'c2')}`,
  },
};

// Hạt lấp lánh / bong bóng nhỏ trôi từ dưới lên, lặp mãi (CSS .w-float trong motion.css).
function floaters(key) {
  const night = key === 'night';
  return Array.from({ length: 16 }, (_, i) => {
    const x = ((i * 397) % (W - 60)) + 30;
    const y = H - 40 - ((i * 53) % 160);
    const r = 5 + ((i * 7) % 9);
    const dur = 9 + ((i * 13) % 9);
    const delay = -((i * 1.7) % dur).toFixed(1);
    const shape = night || i % 3 === 0
      ? `<path d="M0-${r * 1.4}L${r * 0.4}-${r * 0.4} ${r * 1.4} 0 ${r * 0.4} ${r * 0.4} 0 ${r * 1.4}-${r * 0.4} ${r * 0.4}-${r * 1.4} 0-${r * 0.4}-${r * 0.4}z" fill="${night ? '#fff6b0' : '#fffbe0'}"/>`
      : `<circle r="${r}" fill="#fff" fill-opacity=".35" stroke="#fff" stroke-opacity=".8" stroke-width="2"/><circle cx="${-r * 0.35}" cy="${-r * 0.35}" r="${r * 0.25}" fill="#fff"/>`;
    return `<g transform="translate(${x} ${y})"><g class="w-float" style="animation-duration:${dur}s;animation-delay:${delay}s">${shape}</g></g>`;
  }).join('');
}

let host = null;

export function mountWorld(parent) {
  host = document.createElement('div');
  host.className = 'world';
  host.setAttribute('aria-hidden', 'true');
  parent.prepend(host);
  setWorld('meadow');
  return host;
}

export function setWorld(name = 'meadow') {
  if (!host) return;
  const key = THEMES[name] ? name : 'meadow';
  if (host.dataset.theme === key) return;
  const t = THEMES[key];
  host.dataset.theme = key;
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="w-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.sky[0]}"/><stop offset="1" stop-color="${t.sky[1]}"/></linearGradient>
    <radialGradient id="w-sunfill" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff3a0"/><stop offset=".6" stop-color="#ffd23f"/><stop offset="1" stop-color="#ffb400"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#w-sky)"/>${t.body()}${key === 'plain' ? '' : floaters(key)}</svg>`;
}
