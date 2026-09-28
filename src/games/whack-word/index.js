// Whack-a-Word — chuột chũi ngoi lên cầm từ tiếng Anh; bấm thật nhanh con có từ đúng với nghĩa tiếng Việt.
// 2 học sinh 2 nửa bảng, mỗi bên mục tiêu riêng. Đúng +1, sai -1.
import './style.css';
import { playSound, speak } from '../../core/audio.js';
import { shuffle } from '../../core/content.js';
import { h } from '../../core/ui.js';
import { line } from '../../core/voice-lines.js';
import { createDuelGame } from '../shared/duel.js';
import { nextTarget, pickMoleWord, usableWords } from './logic.js';

const HOLES = 6;
const MAX_UP = 3;

const HOW_TO = {
  title: 'How to play',
  text: 'Read the Vietnamese word at the top.',
  steps: ['Tap the mole with the English word.', 'Right mole: +1 point.', 'Wrong mole: -1 point.'],
};

const MOLE_SVG = `<svg viewBox="0 0 120 110" aria-hidden="true">
  <path d="M14 110V58a46 46 0 0 1 92 0v52z" fill="#b07a4f" stroke="#1c1f25" stroke-width="5"/>
  <ellipse cx="60" cy="78" rx="20" ry="14" fill="#e8c4a0"/>
  <circle cx="44" cy="56" r="6" fill="#1c1f25"/><circle cx="76" cy="56" r="6" fill="#1c1f25"/>
  <circle cx="46" cy="54" r="2" fill="#fff"/><circle cx="78" cy="54" r="2" fill="#fff"/>
  <ellipse cx="60" cy="68" rx="9" ry="6.5" fill="#fd3cc6" stroke="#1c1f25" stroke-width="3"/>
  <path d="M52 82q8 6 16 0" fill="none" stroke="#1c1f25" stroke-width="3.5" stroke-linecap="round"/>
  <circle cx="34" cy="72" r="6" fill="#fd3cc6" opacity=".35"/><circle cx="86" cy="72" r="6" fill="#fd3cc6" opacity=".35"/>
</svg>`;

function createSide(side, api) {
  const words = usableWords(api.pack.vocab);
  let target = null;
  let sinceTarget = 0;
  let spawnTimer = 0;
  let upSince = performance.now();
  const holes = [];

  const prompt = h('div', { class: 'wk-prompt', 'data-testid': `wk-prompt-${side.index}` },
    h('small', {}, 'Find the English word for'),
    h('strong', {}, ''));
  const field = h('div', { class: 'wk-field' });
  for (let i = 0; i < HOLES; i++) {
    const sign = h('div', { class: 'wk-sign en' });
    const mole = h('div', { class: 'wk-mole' }, sign, h('div', { class: 'wk-face', innerHTML: MOLE_SVG }));
    const hole = h('div', { class: 'wk-hole' }, h('div', { class: 'wk-pit' }, mole), h('div', { class: 'wk-dirt' }));
    const slot = { hole, mole, sign, item: null, hideTimer: 0 };
    mole.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      whack(slot);
    });
    holes.push(slot);
    field.append(hole);
  }
  side.el.append(prompt, field);

  function setTarget(t) {
    target = t;
    sinceTarget = 0;
    prompt.querySelector('strong').textContent = t.meaning;
    prompt.dataset.word = t.word; // cho test tự động
    prompt.classList.remove('new');
    void prompt.offsetWidth;
    prompt.classList.add('new');
  }

  function stayMs() {
    // Chuột ở trên lâu 1.9 giây lúc đầu, nhanh dần tới 1.2 giây.
    const t = (performance.now() - upSince) / 1000;
    return Math.max(1200, 1900 - t * 12);
  }

  function spawn() {
    if (!api.running || api.paused) return;
    const free = holes.filter((s) => !s.item);
    const up = holes.filter((s) => s.item);
    if (free.length && up.length < MAX_UP) {
      const onBoard = up.map((s) => s.item);
      const item = pickMoleWord(words, target, onBoard, sinceTarget);
      if (item) {
        sinceTarget = item === target ? 0 : sinceTarget + 1;
        const slot = free[Math.floor(Math.random() * free.length)];
        slot.item = item;
        slot.sign.textContent = item.word;
        slot.mole.dataset.word = item.word;
        slot.mole.className = 'wk-mole up';
        slot.hideTimer = setTimeout(() => hide(slot), stayMs());
      }
    }
    spawnTimer = setTimeout(spawn, 520 + Math.random() * 380);
  }

  function hide(slot) {
    clearTimeout(slot.hideTimer);
    slot.mole.classList.remove('up');
    slot.item = null;
  }

  function whack(slot) {
    if (!api.running || api.paused || !slot.item || slot.mole.classList.contains('hit')) return;
    const item = slot.item;
    clearTimeout(slot.hideTimer);
    if (item === target) {
      side.addScore(1);
      playSound('correct');
      slot.mole.classList.add('hit', 'good');
      speak(item.word);
      setTarget(nextTarget(words, target));
    } else {
      side.addScore(-1);
      playSound('wrong');
      slot.mole.classList.add('hit', 'bad');
    }
    slot.item = null;
    setTimeout(() => {
      slot.mole.className = 'wk-mole';
    }, 380);
  }

  setTarget(nextTarget(shuffle(words), null));
  return {
    start() {
      clearTimeout(spawnTimer);
      spawnTimer = setTimeout(spawn, 300);
    },
    stop() {
      clearTimeout(spawnTimer);
    },
    destroy() {
      clearTimeout(spawnTimer);
      holes.forEach((s) => clearTimeout(s.hideTimer));
    },
  };
}

let instance = null;

export default {
  id: 'whack-word',
  title: 'Whack-a-Word',
  needsCamera: false,
  minItems: { vocab: 6 },
  group: 'class',
  theme: 'garden',
  icon: 'hand',
  description: '2 học sinh thi đập chuột cầm từ tiếng Anh đúng nghĩa.',
  ready: true,
  checkContent: (pack) => (usableWords(pack.vocab).length >= 6 ? [] : ['Cần ít nhất 6 từ có cả nghĩa tiếng Việt.']),

  mount(rootEl, content) {
    instance = createDuelGame(rootEl, content, {
      id: 'whack-word',
      title: 'Whack-a-Word',
      howTo: HOW_TO,
      setupHint: 'Mỗi bên có mục tiêu riêng (nghĩa tiếng Việt), bấm chuột cầm từ tiếng Anh đúng.',
      startLine: line('whackStart'),
      createSide,
    });
  },

  unmount() {
    if (instance) instance.destroy();
    instance = null;
  },
};
