// Khung chung cho game "2 học sinh thi tốc độ" trên bảng tương tác: màn hình chia đôi,
// mỗi nửa nhận Pointer Events riêng (2 người chạm cùng lúc không chặn nhau), đồng hồ chung, xếp hạng cuối.
import './duel.css';
import confetti from 'canvas-confetti';
import { playSound, speak } from '../../core/audio.js';
import {
  TEAM_COLORS, createCountdown, createGameFrame, h, isSmallScreen, resultsScreen, segmented, setupScreen,
} from '../../core/ui.js';
import { gameArt } from '../../core/art.js';
import { icon } from '../../core/icons.js';

// game: { id, title, howTo, setupHint, startLine, createSide(side, api) -> { start(), stop(), destroy() }, onRoundStart?(api), banner? }
// side: { index, name, color, el (vùng chơi), addScore(n), score }
export function createDuelGame(root, pack, game) {
  const opts = { seconds: 60 };
  let timer = null;
  let sides = [];
  let running = false;
  let extraTimers = [];

  const frame = createGameFrame(root, {
    title: game.title,
    howTo: game.howTo,
    onPause: () => {
      if (!running) return;
      timer.pause();
      sides.forEach((s) => s.impl.stop());
    },
    onResume: () => {
      if (!running) return;
      timer.resume();
      sides.forEach((s) => s.impl.start());
    },
    onRestart: () => showSetup(),
  });
  const setStage = (...nodes) => {
    frame.stage.textContent = '';
    frame.stage.append(...nodes);
  };

  function teardown() {
    running = false;
    if (timer) timer.stop();
    extraTimers.forEach(clearTimeout);
    extraTimers = [];
    sides.forEach((s) => s.impl.destroy());
    sides = [];
  }

  function showSetup() {
    teardown();
    frame.extra.textContent = '';
    frame.setPaused(false);
    if (isSmallScreen()) {
      setStage(h('div', { class: 'big-screen-only', 'data-testid': 'duel-big-screen' },
        icon('alert', 64), h('h2', {}, 'Dùng trên màn hình lớn'),
        h('p', {}, `${game.title} cần 2 học sinh cùng chạm trên bảng tương tác hoặc màn hình máy tính.`),
        h('a', { href: '#/', class: 'btn btn-primary' }, icon('home', 22), h('span', {}, 'Về menu'))));
      return;
    }
    setStage(setupScreen({
      gameId: game.id,
      title: game.title,
      art: gameArt(game.id),
      rows: [
        { label: 'Thời gian', control: segmented([45, 60, 90].map((n) => ({ value: n, label: `${n}s` })), opts.seconds, (v) => (opts.seconds = v), `${game.id}-seconds`),
          hint: `${game.setupHint} Hai bên: ${pack.teams[0]} (trái) và ${pack.teams[1]} (phải).` },
      ],
      onStart: start,
    }));
  }

  function start() {
    teardown();
    timer = createCountdown({ seconds: opts.seconds, onEnd: finish, onTick: (s) => s <= 5 && s > 0 && playSound('tick') });
    const banner = h('div', { class: 'duel-banner en', 'data-testid': 'duel-banner', hidden: !game.banner });
    frame.extra.textContent = '';
    frame.extra.append(timer.el);
    const api = {
      pack,
      setBanner(text) {
        banner.hidden = !text;
        banner.textContent = text || '';
      },
      later(fn, ms) {
        extraTimers.push(setTimeout(fn, ms));
      },
      get paused() {
        return frame.paused;
      },
      get running() {
        return running;
      },
    };
    const halves = [0, 1].map((i) => {
      const scoreEl = h('strong', { class: 'duel-score en', 'data-testid': `duel-score-${i}` }, '0');
      const area = h('div', { class: 'duel-area' });
      const half = h('section', { class: `duel-half ${i ? 'right' : 'left'}`, style: { '--team': TEAM_COLORS[i] }, 'data-testid': `duel-half-${i}` },
        h('header', { class: 'duel-head' }, h('span', { class: 'duel-name en' }, pack.teams[i]), scoreEl),
        area);
      const side = {
        index: i,
        name: pack.teams[i],
        color: TEAM_COLORS[i],
        el: area,
        half,
        score: 0,
        addScore(n) {
          side.score = Math.max(0, side.score + n);
          scoreEl.textContent = String(side.score);
          scoreEl.classList.remove('bump');
          void scoreEl.offsetWidth;
          scoreEl.classList.add('bump');
          half.dataset.score = String(side.score);
          if (n < 0) {
            half.classList.remove('hurt');
            void half.offsetWidth;
            half.classList.add('hurt');
          }
        },
      };
      side.impl = game.createSide(side, api);
      return side;
    });
    sides = halves;
    setStage(h('div', { class: 'duel-play' }, banner, h('div', { class: 'duel-halves' }, halves.map((s) => s.half))));
    running = true;
    if (game.onRoundStart) game.onRoundStart(api);
    if (game.startLine) speak(game.startLine);
    sides.forEach((s) => s.impl.start());
    timer.start();
  }

  function finish() {
    if (!running) return;
    const scores = sides.map((s) => s.score);
    teardown();
    const ranking = [0, 1].map((i) => ({ name: pack.teams[i], index: i, score: scores[i] })).sort((a, b) => b.score - a.score);
    const tie = ranking[0].score === ranking[1].score;
    setStage(resultsScreen({ title: tie ? "It's a tie" : `${ranking[0].name} wins`, ranking, unit: ' pts', onReplay: showSetup }));
    playSound('win');
    speak(tie ? "It's a tie!" : `${ranking[0].name} wins!`);
    confetti({ particleCount: 170, spread: 100, origin: { x: tie ? 0.5 : ranking[0].index ? 0.75 : 0.25, y: 0.6 }, disableForReducedMotion: true });
  }

  showSetup();

  return {
    destroy() {
      teardown();
      confetti.reset();
      frame.destroy();
    },
  };
}
