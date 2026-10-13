// Sentence Race — 2 học sinh đứng 2 bên bảng, mỗi bên một câu bị xáo thành thẻ từ; chạm thẻ theo đúng thứ tự để dựng câu.
// Chỉ chạm (pointerdown, không kéo thả), không camera, DOM thuần. Sai thì khoá bên đó 0,8 s (chống bấm loạn).
// Câu lấy từ câu ví dụ của từ vựng và câu hỏi điền chỗ trống. Đặc tả: PLAN-GAMES-V2.md mục 5.
import './style.css';
import confetti from 'canvas-confetti';
import { playSound, speak } from '../../core/audio.js';
import { reducedMotion } from '../../core/events.js';
import { burst, celebrate, floatText, shake } from '../../core/fx.js';
import { PERF } from '../../core/perf.js';
import { line } from '../../core/voice-lines.js';
import {
  TEAM_COLORS, createCountdown, createGameFrame, createScoreboard, h, isSmallScreen, resultsScreen, segmented, setupScreen, teamVars,
} from '../../core/ui.js';
import { gameArt } from '../../core/art.js';
import { icon } from '../../core/icons.js';
import { createTapGuard } from '../shared/tap-guard.js';
import {
  LENGTHS, MIN_SENTENCES, bestLength, countsByLength, isNext, makeRound, poolFor, sentencesFromPack, shuffle,
} from './logic.js';

const COOL_MS = 800;
const HINT_MS = 20000;

const HOW_TO = {
  title: 'How to play',
  text: 'Tap the words in the right order.',
  steps: ['Build the sentence on your side.', 'Right word: it jumps up.', 'Wrong word: wait a moment.', 'Full sentence: +1 point.'],
};

const LENGTH_LABEL = { short: 'Ngắn (3–5 từ)', medium: 'Vừa (4–7 từ)', long: 'Dài (5–9 từ)' };

function createGame(root, pack) {
  const sentences = sentencesFromPack(pack);
  const counts = countsByLength(sentences);
  const opts = { seconds: 90, length: bestLength(sentences), caps: 'keep', guard: true };
  const teams = [0, 1].map((i) => (pack.teams && pack.teams[i]) || ['Red', 'Blue'][i]);
  let state = null;
  let timers = [];
  let timer = null;
  let scoreboard = null;
  let guard = null;

  const frame = createGameFrame(root, {
    title: 'Sentence Race',
    howTo: HOW_TO,
    onPause: () => timer && timer.pause(),
    onResume: () => timer && timer.resume(),
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
    if (state) state.sides.forEach((s) => clearTimeout(s.hintTimer));
  };
  const setStage = (...nodes) => {
    frame.stage.textContent = '';
    frame.stage.append(...nodes);
  };

  function showSetup() {
    clearTimers();
    if (timer) timer.stop();
    state = null;
    frame.extra.textContent = '';
    frame.setPaused(false);
    if (isSmallScreen()) {
      setStage(h('div', { class: 'big-screen-only', 'data-testid': 'duel-big-screen' },
        icon('alert', 64), h('h2', {}, 'Dùng trên màn hình lớn'),
        h('p', {}, 'Sentence Race cần 2 học sinh cùng chạm trên bảng tương tác hoặc màn hình máy tính.'),
        h('a', { href: '#/', class: 'btn btn-primary' }, icon('home', 22), h('span', {}, 'Về menu'))));
      return;
    }
    const lengthOpts = Object.keys(LENGTHS).map((k) => ({ value: k, label: `${LENGTH_LABEL[k]} · ${counts[k]} câu`, disabled: counts[k] < MIN_SENTENCES }));
    if (counts[opts.length] < MIN_SENTENCES) opts.length = bestLength(sentences);
    setStage(setupScreen({
      gameId: 'sentence-race',
      title: 'Sentence Race',
      art: gameArt('sentence-race'),
      rows: [
        { label: 'Thời gian', control: segmented([60, 90, 120].map((n) => ({ value: n, label: `${n}s` })), opts.seconds, (v) => (opts.seconds = v), 'sr-seconds'),
          hint: `Hai bên: ${teams[0]} (trái) và ${teams[1]} (phải). Mỗi bên một câu khác nhau. Câu lấy từ câu ví dụ của từ vựng và câu hỏi điền chỗ trống.` },
        { label: 'Độ dài câu', control: segmented(lengthOpts, opts.length, (v) => (opts.length = v), 'sr-length') },
        { label: 'Chữ hoa đầu câu', control: segmented([{ value: 'keep', label: 'Giữ (dễ hơn)' }, { value: 'lower', label: 'Viết thường hết (khó hơn)' }], opts.caps, (v) => (opts.caps = v), 'sr-caps') },
        { label: 'Chống bấm loạn', control: segmented([{ value: true, label: 'Bật (khuyên dùng)' }, { value: false, label: 'Tắt' }], opts.guard, (v) => (opts.guard = v), 'sr-guard'),
          hint: 'Chạm sai: bên đó bị khoá 0,8 giây. Hai lần chạm sát nhau (dưới 0,12 giây) chỉ tính một.' },
      ],
      onStart: start,
    }));
  }

  // ---------- Chơi ----------
  function start() {
    clearTimers();
    const pool = poolFor(sentences, opts.length);
    guard = createTapGuard({ sides: 2, coolMs: COOL_MS, enabled: opts.guard });
    state = {
      running: true,
      sides: [0, 1].map((i) => {
        const queue = shuffle(pool);
        // Bên phải bắt đầu ở vị trí khác để 2 bên ít khi gặp cùng câu.
        if (i === 1 && queue.length > 1) queue.push(...queue.splice(0, Math.ceil(queue.length / 2)));
        return { i, queue, item: null, round: null, progress: 0, busy: false, done: 0, hintTimer: 0, el: null };
      }),
      pool,
    };
    scoreboard = createScoreboard(teams, { controls: false });
    scoreboard.el.classList.add('sr-scores');
    [...scoreboard.el.querySelectorAll('.score-value')].forEach((el, i) => el.setAttribute('data-testid', `sr-score-${i}`));
    timer = createCountdown({ seconds: opts.seconds, onEnd: finish, onTick: (s) => s <= 5 && s > 0 && playSound('tick') });
    frame.extra.textContent = '';
    frame.extra.append(scoreboard.el, timer.el);
    const halves = state.sides.map((side) => buildHalf(side));
    setStage(h('div', { class: 'sr-play' }, halves));
    state.sides.forEach(nextRound);
    timer.start();
    speak(line('buildSentence')); // bị cổng giọng chặn khi "Đọc từ trong game thi đấu" = Tắt
  }

  function buildHalf(side) {
    const done = h('span', { class: 'sr-done en' }, 'Done: 0');
    const slot = h('span', { class: 'sr-slot' });
    const end = h('span', { class: 'sr-end en' });
    const lineEl = h('div', { class: 'sr-line', 'data-testid': `sr-line-${side.i}` }, slot, end);
    const poolEl = h('div', { class: 'sr-pool', 'data-testid': `sr-pool-${side.i}` });
    const cool = h('div', { class: 'sr-cool', 'data-testid': `sr-cool-${side.i}` }, icon('lock', 72));
    const half = h('section', {
      class: `sr-half ${side.i === 0 ? 'left' : 'right'}`,
      style: teamVars(TEAM_COLORS[side.i]),
      'data-testid': `sr-half-${side.i}`,
      'data-progress': '0',
    },
      h('header', { class: 'sr-head' }, h('span', { class: 'sr-name en' }, teams[side.i]), done),
      lineEl, poolEl, cool);
    side.el = { half, lineEl, poolEl, slot, end, done, cool };
    // Mỗi nửa nghe pointerdown riêng: 2 học sinh chạm cùng lúc không chặn nhau.
    poolEl.addEventListener('pointerdown', (e) => {
      const tile = e.target.closest ? e.target.closest('.sr-tile') : null;
      if (!tile || tile.classList.contains('used')) return;
      e.preventDefault();
      if (!state || !state.running || frame.paused || side.busy) return;
      if (!guard.allow(side.i, performance.now())) return;
      tap(side, tile);
    });
    return half;
  }

  function nextItem(side) {
    if (!side.queue.length) side.queue = shuffle(state.pool);
    let item = side.queue.shift();
    const other = state.sides[1 - side.i].item;
    // Câu kế tiếp trùng câu bên kia đang có thì lấy câu sau.
    if (other && other === item && side.queue.length) {
      const alt = side.queue.shift();
      side.queue.push(item);
      item = alt;
    }
    return item;
  }

  function nextRound(side) {
    if (!state || !state.running) return;
    side.item = nextItem(side);
    side.round = makeRound(side.item, { keepCaps: opts.caps === 'keep' });
    side.progress = 0;
    side.busy = false;
    const { half, lineEl, poolEl, slot, end } = side.el;
    [...lineEl.querySelectorAll('.sr-tile')].forEach((t) => t.remove());
    lineEl.classList.remove('done');
    end.textContent = side.round.end;
    poolEl.textContent = '';
    side.round.tiles.forEach((t) => poolEl.append(h('button', { type: 'button', class: 'sr-tile en', 'data-text': t.text, 'data-id': t.id }, t.text)));
    half.classList.toggle('sr-long', side.round.answer.join('').length + side.round.answer.length > 40);
    half.dataset.answer = JSON.stringify(side.round.answer);
    half.dataset.progress = '0';
    if (slot.parentNode !== lineEl) lineEl.insertBefore(slot, end);
    armHint(side);
  }

  function armHint(side) {
    clearTimeout(side.hintTimer);
    side.el.poolEl.querySelectorAll('.hint').forEach((t) => t.classList.remove('hint'));
    side.hintTimer = setTimeout(() => {
      if (!state || !state.running || side.busy) return;
      if (frame.paused) { armHint(side); return; }
      const next = [...side.el.poolEl.querySelectorAll('.sr-tile:not(.used)')].find((t) => isNext(side.round, side.progress, t.dataset.text));
      if (next) next.classList.add('hint');
    }, HINT_MS);
  }

  function tap(side, tile) {
    const text = tile.dataset.text;
    if (isNext(side.round, side.progress, text)) {
      tile.classList.add('used');
      tile.classList.remove('hint');
      const copy = h('span', { class: 'sr-tile placed en' }, text);
      side.el.lineEl.insertBefore(copy, side.el.slot);
      if (PERF.name !== 'lite' && !reducedMotion() && copy.animate) {
        copy.animate([{ transform: 'scale(0.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 160, easing: 'ease-out' });
      }
      playSound('pop');
      side.progress += 1;
      side.el.half.dataset.progress = String(side.progress);
      if (side.progress >= side.round.answer.length) complete(side);
      else armHint(side);
    } else {
      playSound('wrong');
      shake(tile);
      if (guard.enabled) {
        guard.wrong(side.i, performance.now());
        side.el.half.classList.add('cooling');
        later(() => side.el.half.classList.remove('cooling'), COOL_MS);
      }
      armHint(side);
    }
  }

  function complete(side) {
    side.busy = true;
    clearTimeout(side.hintTimer);
    side.done += 1;
    const { lineEl, done } = side.el;
    lineEl.classList.add('done');
    done.textContent = `Done: ${side.done}`;
    playSound('correct');
    burst(lineEl, { count: 10 });
    floatText(lineEl, '+1', { color: TEAM_COLORS[side.i] });
    scoreboard.add(side.i, 1);
    later(() => nextRound(side), 700);
  }

  function finish() {
    if (!state || !state.running) return;
    state.running = false;
    clearTimers();
    const ranking = state.sides.map((s) => ({ name: teams[s.i], index: s.i, score: s.done })).sort((a, b) => b.score - a.score);
    const tie = ranking[0].score === ranking[1].score;
    setStage(resultsScreen({ title: tie ? "It's a tie" : `${ranking[0].name} wins`, ranking, unit: ' sentences', onReplay: showSetup }));
    playSound('win');
    celebrate({ x: tie ? 0.5 : ranking[0].index ? 0.75 : 0.25, y: 0.6 });
    speak(tie ? line('tie') : `${ranking[0].name} wins!`);
  }

  showSetup();

  return {
    destroy() {
      if (state) state.running = false;
      clearTimers();
      if (timer) timer.stop();
      confetti.reset();
      frame.destroy();
    },
    // Cho test tự động.
    debug: () => ({ sides: state ? state.sides.map((s) => ({ answer: s.round && s.round.answer, progress: s.progress, score: s.done })) : [] }),
  };
}

let instance = null;

export default {
  id: 'sentence-race',
  title: 'Sentence Race',
  needsCamera: false,
  minItems: 0,
  group: 'class',
  theme: 'meadow',
  icon: 'steps',
  description: '2 học sinh thi xếp từ thành câu đúng.',
  ready: true,
  checkContent: (pack) => {
    const n = sentencesFromPack(pack).length;
    return n >= MIN_SENTENCES ? [] : [`Cần ít nhất ${MIN_SENTENCES} câu: thêm câu ví dụ (cột example) cho từ vựng, hoặc câu hỏi điền chỗ trống có "___" (hiện có ${n}).`];
  },

  mount(rootEl, content) {
    instance = createGame(rootEl, content);
    window.__sentenceRace = instance;
  },

  unmount() {
    if (instance) instance.destroy();
    instance = null;
    delete window.__sentenceRace;
  },
};
