// Balloon Pop — bóng bay chữ bay lên ở 2 nửa bảng; bấm nổ bóng thuộc nhóm yêu cầu (vd "Pop only DRINKS").
// Nhóm mục tiêu đổi mỗi 20 giây. Đúng +1, sai -1.
import './style.css';
import { playSound, speak } from '../../core/audio.js';
import { h } from '../../core/ui.js';
import { balloonTarget } from '../../core/voice-lines.js';
import { createDuelGame } from '../shared/duel.js';
import { playableCategories } from '../word-ninja/logic.js';

const TARGET_MS = 20000;
const COLORS = ['#fd3cc6', '#04bc09', '#ffea00', '#00a2fd', '#ff9800', '#bbee23', '#00e1f3'];

const HOW_TO = {
  title: 'How to play',
  text: 'Pop only the balloons in the target group.',
  steps: ['Tap a balloon to pop it.', 'Right group: +1 point.', 'Wrong group: -1 point.'],
};

function balloonSvg(color) {
  return `<svg viewBox="0 0 100 150" aria-hidden="true">
    <path d="M50 118q4 14-4 30" fill="none" stroke="#1c1f25" stroke-width="3"/>
    <ellipse cx="50" cy="56" rx="44" ry="52" fill="${color}" stroke="#1c1f25" stroke-width="5"/>
    <path d="M44 116l6-9 6 9z" fill="${color}" stroke="#1c1f25" stroke-width="4" stroke-linejoin="round"/>
    <path d="M22 36q6-16 22-20" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".8"/>
  </svg>`;
}

function createSideFactory(shared) {
  return function createSide(side, api) {
    const vocab = api.pack.vocab.filter((v) => v.word && v.category);
    let balloons = [];
    let raf = 0;
    let spawnTimer = 0;
    let last = 0;
    const startedAt = performance.now();
    const area = side.el;
    area.classList.add('bp-sky');

    function spawn() {
      if (!api.running || api.paused || !shared.cat) return;
      const wantTarget = Math.random() < 0.45;
      const pool = vocab.filter((v) => (v.category.toLowerCase() === shared.cat) === wantTarget);
      const item = pool[Math.floor(Math.random() * pool.length)];
      if (item && balloons.length < 7) {
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        const el = h('div', { class: 'bp-balloon', 'data-word': item.word, 'data-cat': item.category.toLowerCase() },
          h('span', { class: 'bp-shape', innerHTML: balloonSvg(color) }), h('span', { class: 'bp-word en' }, item.word));
        const b = { el, item, x: 4 + Math.random() * 64, y: 0, speed: 0, phase: Math.random() * 6, done: false };
        // Bay hết chiều cao trong 7.5 giây lúc đầu, nhanh dần tới 5 giây.
        const t = (performance.now() - startedAt) / 1000;
        b.speed = 1 / Math.max(5, 7.5 - t * 0.05);
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          pop(b);
        });
        area.append(el);
        balloons.push(b);
      }
      spawnTimer = setTimeout(spawn, 650 + Math.random() * 450);
    }

    function pop(b) {
      if (b.done || !api.running || api.paused) return;
      b.done = true;
      const good = b.item.category.toLowerCase() === shared.cat;
      side.addScore(good ? 1 : -1);
      playSound(good ? 'pop' : 'wrong');
      if (good) speak(b.item.word);
      b.el.classList.add(good ? 'popped' : 'wrong');
      setTimeout(() => b.el.remove(), good ? 350 : 700);
      balloons = balloons.filter((x) => x !== b);
    }

    function tick(now) {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (api.paused) return;
      const H = area.clientHeight;
      balloons.forEach((b) => {
        b.y += b.speed * dt;
        const px = H + 40 - b.y * (H + 260);
        const sway = Math.sin(now / 600 + b.phase) * 10;
        b.el.style.transform = `translate(${sway}px, ${px}px)`;
        b.el.style.left = `${b.x}%`;
        if (b.y > 1) {
          b.done = true;
          b.el.remove();
        }
      });
      balloons = balloons.filter((b) => !b.done);
    }

    return {
      start() {
        cancelAnimationFrame(raf);
        clearTimeout(spawnTimer);
        last = 0;
        raf = requestAnimationFrame(tick);
        spawnTimer = setTimeout(spawn, 200 + side.index * 250);
      },
      stop() {
        cancelAnimationFrame(raf);
        clearTimeout(spawnTimer);
      },
      destroy() {
        cancelAnimationFrame(raf);
        clearTimeout(spawnTimer);
        balloons.forEach((b) => b.el.remove());
        balloons = [];
      },
    };
  };
}

let instance = null;

export default {
  id: 'balloon-pop',
  title: 'Balloon Pop',
  needsCamera: false,
  minItems: { vocab: 8 },
  group: 'class',
  theme: 'sky',
  icon: 'search',
  description: '2 học sinh thi bấm nổ bóng bay có từ đúng nhóm.',
  ready: true,
  checkContent(pack) {
    const n = Object.keys(playableCategories(pack.vocab)).length;
    return n >= 2 ? [] : [`Cần ít nhất 2 nhóm từ, mỗi nhóm ít nhất 3 từ (hiện có ${n} nhóm đủ).`];
  },

  mount(rootEl, content) {
    const shared = { cat: null };
    const cats = Object.keys(playableCategories(content.vocab));
    const setTarget = (api) => {
      const choices = cats.filter((c) => c !== shared.cat);
      shared.cat = choices[Math.floor(Math.random() * choices.length)] || cats[0];
      const text = balloonTarget(shared.cat);
      api.setBanner(text.replace(/!$/, '').replace(/(\w+)$/, (m) => m.toUpperCase()));
      speak(text);
    };
    instance = createDuelGame(rootEl, content, {
      id: 'balloon-pop',
      title: 'Balloon Pop',
      howTo: HOW_TO,
      banner: true,
      setupHint: `Nhóm mục tiêu đổi mỗi 20 giây. Nhóm dùng trong game: ${cats.join(', ')}.`,
      createSide: createSideFactory(shared),
      onRoundStart(api) {
        shared.cat = null;
        setTarget(api);
        const again = () => {
          if (!api.running) return;
          setTarget(api);
          api.later(again, TARGET_MS);
        };
        api.later(again, TARGET_MS);
      },
    });
  },

  unmount() {
    if (instance) instance.destroy();
    instance = null;
  },
};
