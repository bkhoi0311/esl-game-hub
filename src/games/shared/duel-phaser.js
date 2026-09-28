// Khung "2 học sinh thi tốc độ" chạy trên Phaser: cài đặt, đồng hồ, bảng điểm, xếp hạng là HTML;
// vùng chơi (2 nửa) là 1 canvas Phaser nhận nhiều ngón chạm cùng lúc.
import './duel.css';
import { playSound, speak } from '../../core/audio.js';
import {
  TEAM_COLORS, createCountdown, createGameFrame, createScoreboard, h, isSmallScreen, resultsScreen, segmented, setupScreen,
} from '../../core/ui.js';
import { gameArt } from '../../core/art.js';
import { icon } from '../../core/icons.js';
import { celebrate } from '../../core/fx.js';
import { mountPhaser } from './phaser-host.js';

// game: { id, title, howTo, setupHint, startLine, makeScene(Phaser), banner, onRoundStart(api) }
export function createPhaserDuel(root, pack, game) {
  const opts = { seconds: 60 };
  let timer = null;
  let phaser = null;
  let scoreboard = null;
  let running = false;
  let timers = [];
  let token = 0;

  const frame = createGameFrame(root, {
    title: game.title,
    howTo: game.howTo,
    onPause: () => {
      if (!running) return;
      timer.pause();
      if (phaser) phaser.game.scene.pause('main');
    },
    onResume: () => {
      if (!running) return;
      timer.resume();
      if (phaser) phaser.game.scene.resume('main');
    },
    onRestart: () => showSetup(),
  });
  const setStage = (...nodes) => {
    frame.stage.textContent = '';
    frame.stage.append(...nodes);
  };

  function teardown() {
    running = false;
    token++;
    if (timer) timer.stop();
    timers.forEach(clearTimeout);
    timers = [];
    if (phaser) phaser.game.destroy(true);
    phaser = null;
    delete window.__duelScene;
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

  async function start() {
    teardown();
    const my = token;
    const teams = pack.teams.slice(0, 2);
    const scores = [0, 0];
    scoreboard = createScoreboard(teams, { controls: false });
    scoreboard.el.classList.add('pd-scores');
    [...scoreboard.el.querySelectorAll('.score-value')].forEach((el, i) => el.setAttribute('data-testid', `duel-score-${i}`));
    timer = createCountdown({ seconds: opts.seconds, onEnd: () => finish(scores), onTick: (s) => s <= 5 && s > 0 && playSound('tick') });
    frame.extra.textContent = '';
    frame.extra.append(scoreboard.el, timer.el);

    const banner = h('div', { class: 'duel-banner pd-banner en', 'data-testid': 'duel-banner', hidden: !game.banner });
    const host = h('div', { class: 'pd-host', 'data-testid': 'pd-host' });
    const loading = h('div', { class: 'sp-loading' }, 'Loading…');
    setStage(h('div', { class: 'pd-play' }, host, banner, loading));

    const api = {
      pack,
      teams,
      colors: TEAM_COLORS,
      get running() {
        return running;
      },
      get paused() {
        return frame.paused;
      },
      addScore(side, n) {
        scores[side] = Math.max(0, scores[side] + n);
        scoreboard.set(side, scores[side]);
        return scores[side];
      },
      setBanner(text) {
        banner.hidden = !text;
        banner.textContent = text || '';
      },
      later(fn, ms) {
        timers.push(setTimeout(fn, ms));
      },
    };
    phaser = await mountPhaser(host, game.makeScene, { api });
    if (my !== token) {
      phaser.game.destroy(true);
      return;
    }
    loading.remove();
    running = true;
    if (game.onRoundStart) game.onRoundStart(api);
    if (game.startLine) speak(game.startLine);
    timer.start();
    // Cho test tự động: truy cập scene đang chạy.
    const wait = () => {
      const sc = phaser && phaser.game.scene.getScene('main');
      if (sc && sc.sys.isActive()) window.__duelScene = sc;
      else if (phaser) setTimeout(wait, 50);
    };
    wait();
  }

  function finish(scores) {
    if (!running) return;
    const final = [...scores];
    teardown();
    const teams = pack.teams.slice(0, 2);
    const ranking = [0, 1].map((i) => ({ name: teams[i], index: i, score: final[i] })).sort((a, b) => b.score - a.score);
    const tie = ranking[0].score === ranking[1].score;
    setStage(resultsScreen({ title: tie ? "It's a tie" : `${ranking[0].name} wins`, ranking, unit: ' pts', onReplay: showSetup }));
    playSound('win');
    speak(tie ? "It's a tie!" : `${ranking[0].name} wins!`);
    celebrate({ x: tie ? 0.5 : ranking[0].index ? 0.75 : 0.25, y: 0.6 });
  }

  showSetup();

  return {
    destroy() {
      teardown();
      frame.destroy();
    },
  };
}
