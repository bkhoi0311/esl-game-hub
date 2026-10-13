// Khung "2 học sinh thi tốc độ" chạy trên Phaser: cài đặt, đồng hồ, bảng điểm, xếp hạng là HTML;
// vùng chơi (2 nửa) là 1 canvas Phaser nhận nhiều ngón chạm cùng lúc.
import './duel.css';
import { playSound, speak } from '../../core/audio.js';
import {
  TEAM_COLORS, createCountdown, createGameFrame, createScoreboard, h, isSmallScreen, resultsScreen, segmented, setupScreen,
} from '../../core/ui.js';
import { gameArt } from '../../core/art.js';
import { icon } from '../../core/icons.js';
import { addStrings, onLang, t } from '../../i18n/index.js';
import VI from '../../i18n/strings/games-duel.vi.js';

addStrings('games-duel', VI);
import { celebrate } from '../../core/fx.js';
import { mountPhaser } from './phaser-host.js';
import { createTapGuard } from './tap-guard.js';

// game: { id, title, howTo, setupHint, startLine, makeScene(Phaser), banner, onRoundStart(api) }
export function createPhaserDuel(root, pack, game) {
  const opts = { seconds: 60, guard: true };
  let timer = null;
  let phaser = null;
  let scoreboard = null;
  let running = false;
  let setupOpen = false;
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
    setupOpen = true;
    frame.extra.textContent = '';
    frame.setPaused(false);
    if (isSmallScreen()) {
      setStage(h('div', { class: 'big-screen-only', 'data-testid': 'duel-big-screen' },
        icon('alert', 64), h('h2', {}, t('duel.big.title')),
        h('p', {}, t('duel.big.body', { title: game.title })),
        h('a', { href: '#/', class: 'btn btn-primary' }, icon('home', 22), h('span', {}, t('duel.big.menu')))));
      return;
    }
    setStage(setupScreen({
      gameId: game.id,
      title: game.title,
      art: gameArt(game.id),
      rows: [
        { label: t('duel.time'), control: segmented([45, 60, 90].map((n) => ({ value: n, label: `${n}s` })), opts.seconds, (v) => (opts.seconds = v), `${game.id}-seconds`),
          hint: t('duel.sidesHint', { hint: game.setupHint, left: pack.teams[0], right: pack.teams[1] }) },
        { label: t('duel.guard'), control: segmented([{ value: true, label: t('duel.guard.on') }, { value: false, label: t('ui.off') }], opts.guard, (v) => (opts.guard = v), `${game.id}-guard`),
          hint: t('duel.guardHint') },
      ],
      onStart: start,
    }));
  }

  async function start() {
    teardown();
    setupOpen = false;
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
    const guard = createTapGuard({ enabled: opts.guard });
    // Lớp phủ khoá (style viết thẳng để không phụ thuộc duel.css). Ẩn/hiện bằng display, không dùng hidden.
    const cools = [0, 1].map((i) => h('div', {
      class: 'pd-cool',
      'data-testid': `pd-cool-${i}`,
      style: {
        position: 'absolute', top: '0', bottom: '0', left: i ? '50%' : '0', width: '50%', display: 'none', placeItems: 'center',
        background: 'rgba(28, 31, 37, 0.16)', pointerEvents: 'none', zIndex: '2', color: '#1c1f25',
      },
    }, icon('lock', 72)));
    setStage(h('div', { class: 'pd-play' }, host, ...cools, banner, loading));

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
      // Chống bấm loạn: gọi trước khi tính một chạm; penalize khi chạm sai.
      tapAllowed(side) {
        return guard.allow(side, performance.now());
      },
      penalize(side) {
        if (!guard.enabled) return;
        const until = guard.wrong(side, performance.now());
        cools[side].style.display = 'grid';
        timers.push(setTimeout(() => {
          if (performance.now() >= guard.coolingUntil(side) - 5) cools[side].style.display = 'none';
        }, Math.max(0, until - performance.now())));
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

  // Đổi ngôn ngữ: chỉ dựng lại màn cài đặt khi đang mở; game đang chơi giữ nguyên.
  const offLang = onLang(() => { if (setupOpen) showSetup(); });
  showSetup();

  return {
    destroy() {
      offLang();
      teardown();
      frame.destroy();
    },
  };
}
