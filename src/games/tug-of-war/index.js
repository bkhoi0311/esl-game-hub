// Tug of War — 2 học sinh đứng 2 bên bảng tương tác, trả lời đúng kéo dây về phía mình.
// Mỗi nửa màn hình nhận Pointer Events riêng, 2 người chạm cùng lúc không chặn nhau. Đặc tả: docs/GAMES_SPEC.md
import './style.css';
import confetti from 'canvas-confetti';
import { getQuestions, shuffle } from '../../core/content.js';
import { playSound, speak } from '../../core/audio.js';
import { line } from '../../core/voice-lines.js';
import {
  TEAM_COLORS, answerButtons, button, createGameFrame, h, isSmallScreen, resultsScreen, segmented, setupScreen,
} from '../../core/ui.js';
import { gameArt } from '../../core/art.js';
import { icon } from '../../core/icons.js';

const LOCK_MS = 2000;

const HOW_TO = {
  title: 'How to play',
  text: 'Two players, one on each side.',
  steps: ['Tap the right answer on your side.', 'Correct: pull the rope one step.', 'Wrong: wait 2 seconds.', 'Pull the flag to your line to win.'],
};

function createGame(root, pack) {
  const questions = getQuestions(pack);
  const opts = { steps: 5 };
  let state = null;
  let timers = [];

  const frame = createGameFrame(root, {
    title: 'Tug of War',
    howTo: HOW_TO,
    onRestart: () => showSetup(),
  });
  const later = (fn, ms) => {
    const t = setTimeout(fn, ms);
    timers.push(t);
    return t;
  };
  const clearTimers = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };
  const setStage = (...nodes) => {
    frame.stage.textContent = '';
    frame.stage.append(...nodes);
  };

  function showSetup() {
    clearTimers();
    state = null;
    frame.extra.textContent = '';
    frame.setPaused(false);
    if (isSmallScreen()) {
      setStage(h('div', { class: 'big-screen-only', 'data-testid': 'tw-big-screen' },
        icon('alert', 64),
        h('h2', {}, 'Dùng trên màn hình lớn'),
        h('p', {}, 'Tug of War cần 2 học sinh cùng chạm trên bảng tương tác hoặc màn hình máy tính.'),
        h('a', { href: '#/', class: 'btn btn-primary' }, icon('home', 22), h('span', {}, 'Về menu'))));
      return;
    }
    setStage(setupScreen({
      gameId: 'tug-of-war',
      title: 'Tug of War',
      art: gameArt('tug-of-war'),
      rows: [
        { label: 'Số nấc để thắng', control: segmented([3, 5, 7].map((n) => ({ value: n, label: String(n) })), opts.steps, (v) => (opts.steps = v), 'tw-steps'),
          hint: `Hai bên: ${pack.teams[0]} (trái) và ${pack.teams[1]} (phải). Dùng ${questions.length} câu hỏi của bộ nội dung.` },
      ],
      onStart: start,
    }));
  }

  // ---------- Chơi ----------
  function start() {
    state = {
      pos: 0, // âm = kéo về trái, dương = kéo về phải
      over: false,
      sides: [0, 1].map((i) => ({ i, queue: [], q: null, order: null, locked: false, correct: 0, el: null })),
    };
    const rope = buildRope();
    const halves = state.sides.map((side) => buildHalf(side));
    setStage(h('div', { class: 'tw-play' }, rope, h('div', { class: 'tw-halves' }, halves)));
    state.sides.forEach(nextQuestion);
    renderRope();
    speak(line('readyPull'));
  }

  function buildRope() {
    const n = opts.steps;
    const marks = [];
    for (let k = -n; k <= n; k++) {
      marks.push(h('span', { class: `tw-mark${k === 0 ? ' center' : ''}${Math.abs(k) === n ? ' goal' : ''}`, style: { left: `${stepPct(k)}%` } }));
    }
    state.flag = h('div', { class: 'tw-flag', 'data-testid': 'tw-flag' },
      h('span', { class: 'tw-flag-knot' }), h('span', { class: 'tw-flag-cloth' }));
    return h('div', { class: 'tw-rope-area' },
      h('div', { class: 'tw-end left', style: { '--team': TEAM_COLORS[0] } }, pack.teams[0]),
      h('div', { class: 'tw-track' }, marks, h('div', { class: 'tw-rope' }), state.flag),
      h('div', { class: 'tw-end right', style: { '--team': TEAM_COLORS[1] } }, pack.teams[1]));
  }

  function stepPct(k) {
    return 50 + (k * 44) / opts.steps;
  }

  function renderRope() {
    state.flag.style.left = `${stepPct(state.pos)}%`;
    state.flag.dataset.pos = String(state.pos);
  }

  function buildHalf(side) {
    const promptEl = h('p', { class: 'prompt tw-prompt' });
    const answersHost = h('div', { class: 'tw-answers-host' });
    const counter = h('span', { class: 'tw-count en' });
    const lock = h('div', { class: 'tw-lock', hidden: true }, icon('lock', 64), h('span', { class: 'tw-lock-num en' }, '2'));
    const half = h('section', {
      class: `tw-half ${side.i === 0 ? 'left' : 'right'}`,
      style: { '--team': TEAM_COLORS[side.i] },
      'data-side': side.i,
      'data-testid': `tw-half-${side.i}`,
    },
      h('header', { class: 'tw-half-head' }, h('span', { class: 'tw-name en' }, pack.teams[side.i]), counter),
      promptEl,
      answersHost,
      lock);
    side.el = { half, promptEl, answersHost, counter, lock };
    return half;
  }

  function nextQuestion(side) {
    if (!side.queue.length) {
      side.queue = shuffle(questions);
      // Bên phải bắt đầu ở vị trí khác để 2 bên ít khi gặp cùng câu.
      if (side.i === 1 && side.queue.length > 1) side.queue.push(...side.queue.splice(0, Math.ceil(side.queue.length / 2)));
    }
    side.q = side.queue.shift();
    let order = shuffle([0, 1, 2]);
    const other = state.sides[1 - side.i];
    if (other.q === side.q && other.order && other.order.join() === order.join()) order = [order[1], order[2], order[0]];
    side.order = order;
    const correctPos = order.indexOf(side.q.answer);

    side.el.promptEl.textContent = side.q.prompt;
    const { el, buttons } = answerButtons(order.map((k) => side.q.options[k]), (pos, btn) => answer(side, pos, correctPos, btn, buttons), { usePointer: true });
    el.classList.add('tw-answers');
    el.dataset.correct = String(correctPos);
    side.el.answersHost.textContent = '';
    side.el.answersHost.append(el);
    side.el.counter.textContent = `Correct: ${side.correct}`;
    side.el.half.dataset.correctCount = String(side.correct);
  }

  function answer(side, pos, correctPos, btn, buttons) {
    if (!state || state.over || side.locked || frame.paused) return;
    if (pos === correctPos) {
      side.correct += 1;
      btn.classList.add('correct');
      playSound('correct');
      state.pos += side.i === 0 ? -1 : 1;
      renderRope();
      side.el.half.classList.remove('pulled');
      void side.el.half.offsetWidth;
      side.el.half.classList.add('pulled');
      if (Math.abs(state.pos) >= opts.steps) {
        win(side.i);
        return;
      }
      side.locked = true; // chống bấm 2 lần vào nút đang đổi câu
      later(() => {
        side.locked = false;
        nextQuestion(side);
      }, 250);
    } else {
      btn.classList.add('wrong');
      buttons.forEach((b) => (b.disabled = true));
      playSound('wrong');
      lockSide(side);
    }
  }

  function lockSide(side) {
    side.locked = true;
    const { lock } = side.el;
    const num = lock.querySelector('.tw-lock-num');
    lock.hidden = false;
    const until = performance.now() + LOCK_MS;
    const tick = () => {
      const left = Math.max(0, until - performance.now());
      num.textContent = String(Math.ceil(left / 1000));
      if (left > 0) side.lockTimer = later(tick, 100);
      else {
        lock.hidden = true;
        side.locked = false;
        if (!state.over) nextQuestion(side);
      }
    };
    tick();
  }

  function win(i) {
    state.over = true;
    clearTimers();
    playSound('win');
    speak(`${pack.teams[i]} wins!`);
    const loser = 1 - i;
    later(() => {
      const ranking = [
        { name: pack.teams[i], index: i, score: state.sides[i].correct },
        { name: pack.teams[loser], index: loser, score: state.sides[loser].correct },
      ];
      setStage(resultsScreen({ title: `${pack.teams[i]} wins`, ranking, unit: ' correct', onReplay: showSetup }));
      confetti({ particleCount: 180, spread: 100, origin: { x: i === 0 ? 0.25 : 0.75, y: 0.6 }, disableForReducedMotion: true });
    }, 900);
  }

  showSetup();

  return {
    destroy() {
      clearTimers();
      if (state) state.over = true;
      confetti.reset();
      frame.destroy();
    },
  };
}

let instance = null;

export default {
  id: 'tug-of-war',
  title: 'Tug of War',
  needsCamera: false,
  minItems: { questions: 6 },
  group: 'class',
  icon: 'arrow-left-right',
  description: '2 học sinh thi trả lời nhanh, kéo dây về phía mình.',
  ready: true,

  mount(rootEl, content) {
    instance = createGame(rootEl, content);
  },

  unmount() {
    if (instance) instance.destroy();
    instance = null;
  },
};
