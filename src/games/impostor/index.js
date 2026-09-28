// Impostor Word — 5 thẻ từ, tìm 1 từ khác nhóm và giải thích. Đặc tả: docs/GAMES_SPEC.md
import './style.css';
import confetti from 'canvas-confetti';
import { playSound, speak } from '../../core/audio.js';
import { button, createCountdown, createGameFrame, h, segmented, setupScreen } from '../../core/ui.js';
import { gameArt } from '../../core/art.js';
import { icon } from '../../core/icons.js';
import { checkContent, explain, makeRound } from './logic.js';

const HOW_TO = {
  title: 'How to play',
  text: 'Four words belong together. One word is the impostor.',
  steps: ['Talk with your team for 60 seconds.', 'Choose the impostor.', 'Say why: "It is a fruit, not a drink."'],
};

const CARD_COLORS = ['#e3eeff', '#fff4c2', '#ffe3f6', '#dcfbfe', '#e9fbd0'];

function createGame(root, pack) {
  const opts = { seconds: 60 };
  const used = new Set(); // tổ hợp đã dùng trong phiên
  let round = null;
  let roundNo = 0;
  let score = 0;
  let timer = null;

  const frame = createGameFrame(root, {
    title: 'Impostor Word',
    howTo: HOW_TO,
    onPause: () => timer && timer.pause(),
    onResume: () => timer && round && !round.done && round.started && timer.resume(),
    onRestart: () => showSetup(),
  });

  const setStage = (...nodes) => {
    frame.stage.textContent = '';
    frame.stage.append(...nodes);
  };

  const status = h('div', { class: 'imp-status en' });

  function showSetup() {
    if (timer) timer.stop();
    round = null;
    roundNo = 0;
    score = 0;
    frame.extra.textContent = '';
    frame.setPaused(false);
    setStage(setupScreen({
      gameId: 'impostor',
      title: 'Impostor Word',
      art: gameArt('impostor'),
      rows: [
        { label: 'Thời gian thảo luận mỗi vòng', control: segmented([30, 60, 90].map((n) => ({ value: n, label: `${n}s` })), opts.seconds, (v) => (opts.seconds = v), 'imp-seconds'),
          hint: 'Hết giờ, giáo viên bấm vào thẻ mà cả lớp chọn. Mỗi phiên không lặp lại tổ hợp 5 từ.' },
      ],
      onStart: () => {
        timer = createCountdown({ seconds: opts.seconds, onEnd: timeUp, onTick: (s) => s <= 5 && s > 0 && playSound('tick') });
        frame.extra.textContent = '';
        frame.extra.append(status, timer.el);
        nextRound();
      },
    }));
  }

  function renderStatus() {
    status.textContent = `Round ${roundNo}  ·  Class score ${score}`;
  }

  function nextRound() {
    let r = makeRound(pack.vocab, used);
    if (!r) {
      // Đã dùng hết tổ hợp: bắt đầu lại danh sách.
      used.clear();
      r = makeRound(pack.vocab, used);
    }
    roundNo += 1;
    round = { ...r, done: false, started: false };
    timer.reset(opts.seconds);
    renderStatus();
    renderRound();
  }

  function renderRound() {
    const cards = round.cards.map((c, i) => {
      const speakBtn = button({ iconName: 'volume', title: `Listen: ${c.word}`, variant: 'ghost' });
      speakBtn.classList.add('imp-speak');
      speakBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        speak(c.word);
      });
      const card = h('div', {
        class: 'imp-card', role: 'button', tabindex: 0, style: { '--card': CARD_COLORS[i] },
        'data-impostor': String(c.impostor), 'data-testid': 'imp-card',
        onClick: () => choose(i),
        onKeydown: (e) => (e.key === 'Enter' || e.key === ' ') && choose(i),
      },
        h('span', { class: 'imp-word en' }, c.word),
        h('span', { class: 'imp-tag en' }, c.category),
        speakBtn);
      return card;
    });
    round.cardEls = cards;

    const startBtn = button({
      label: `Start ${opts.seconds}s talk`, iconName: 'timer', variant: 'primary', size: 'lg', attrs: { 'data-testid': 'imp-start' },
      onClick: () => {
        round.started = true;
        timer.start();
        startBtn.hidden = true;
        hint.textContent = 'Talk with your team. Which word is the impostor?';
      },
    });
    const hint = h('p', { class: 'imp-hint en' }, 'Which word does not belong?');
    setStage(h('div', { class: 'imp-play' },
      h('div', { class: 'imp-cards' }, cards),
      h('div', { class: 'imp-bottom' }, hint, startBtn)));
    round.hintEl = hint;
    round.bottom = startBtn.parentElement;
  }

  function timeUp() {
    if (!round || round.done) return;
    playSound('wrong');
    round.hintEl.textContent = "Time's up. Teacher: tap the class's choice.";
    round.hintEl.classList.add('warn');
  }

  function choose(i) {
    if (!round || round.done || frame.paused) return;
    round.done = true;
    timer.stop();
    const picked = round.cards[i];
    const correct = picked.impostor;
    if (correct) score += 1;
    renderStatus();

    round.cardEls.forEach((el, k) => {
      el.classList.add('revealed');
      el.classList.toggle('picked', k === i);
      el.classList.toggle('is-impostor', round.cards[k].impostor);
      if (round.cards[k].impostor) el.prepend(h('span', { class: 'imp-badge en' }, icon('search', 22), 'Impostor'));
    });
    const bottom = round.bottom;
    bottom.textContent = '';
    bottom.append(
      h('div', { class: `imp-answer ${correct ? 'good' : 'bad'}`, 'data-testid': 'imp-answer' },
        h('span', { class: 'imp-verdict en' }, correct ? 'Correct' : 'Not this one'),
        h('span', { class: 'imp-explain en' }, explain(round.major, round.odd))),
      button({ label: 'Next round', iconName: 'play', variant: 'primary', size: 'lg', onClick: nextRound, attrs: { 'data-testid': 'imp-next' } }),
    );
    playSound(correct ? 'correct' : 'wrong');
    if (correct) confetti({ particleCount: 90, spread: 70, origin: { y: 0.55 }, disableForReducedMotion: true });
    speak(explain(round.major, round.odd));
  }

  const missing = checkContent(pack.vocab);
  if (missing.length) {
    setStage(h('div', { class: 'notice' }, icon('alert', 48), h('h2', {}, 'Cần thêm nội dung'),
      h('ul', {}, missing.map((m) => h('li', {}, m))),
      h('div', { class: 'notice-actions' }, h('a', { href: '#/editor', class: 'btn btn-primary' }, icon('book-open', 22), h('span', {}, 'Mở Soạn bài')))));
  } else {
    showSetup();
  }

  return {
    destroy() {
      if (timer) timer.stop();
      confetti.reset();
      frame.destroy();
    },
  };
}

let instance = null;

export default {
  id: 'impostor',
  title: 'Impostor Word',
  needsCamera: false,
  minItems: { vocab: 8 },
  group: 'class',
  icon: 'search',
  description: 'Tìm từ khác nhóm trong 5 thẻ và giải thích vì sao.',
  ready: true,
  checkContent: (pack) => checkContent(pack.vocab),

  mount(rootEl, content) {
    instance = createGame(rootEl, content);
  },

  unmount() {
    if (instance) instance.destroy();
    instance = null;
  },
};
