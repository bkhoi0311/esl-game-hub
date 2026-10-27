// Gold Heist — trắc nghiệm theo đội, trả lời đúng được mở rương vàng. Đặc tả: docs/GAMES_SPEC.md
import './style.css';
import { gsap } from 'gsap';
import confetti from 'canvas-confetti';
import { PERF } from '../../core/perf.js';
import { confettiLite } from '../../core/fx.js';
import { shuffle } from '../../core/content.js';
import { picNode, picOf, studentQuestions } from '../../core/pics.js';
import { playSound, speak } from '../../core/audio.js';
import {
  TEAM_COLORS, teamVars, answerButtons, button, createGameFrame, createScoreboard, h, resultsScreen, segmented, setupScreen, stepper,
} from '../../core/ui.js';
import { gameArt } from '../../core/art.js';
import { icon } from '../../core/icons.js';
import { addStrings, onLang, t } from '../../i18n/index.js';
import VI from '../../i18n/strings/games-duel.vi.js';
import { burst, floatText } from '../../core/fx.js';
import { line } from '../../core/voice-lines.js';
import { CHESTS, applyChest, dealChests, defaultWeights, needsTarget, validTargets } from './logic.js';

addStrings('games-duel', VI);

const DEFAULT_TEAMS = ['Red', 'Blue', 'Green', 'Pink'];

const HOW_TO = {
  title: 'How to play',
  text: 'Teams take turns to answer.',
  steps: ['Correct answer: open a treasure chest.', 'Chests can add, double, steal or swap gold.', 'Wrong answer: lose your turn.', 'The team with the most gold wins.'],
};

function chestSvg() {
  return `<svg viewBox="0 0 160 140" aria-hidden="true">
    <g class="chest-body">
      <path d="M18 62h124v58a10 10 0 0 1-10 10H28a10 10 0 0 1-10-10z" fill="#c8711e" stroke="#1c1f25" stroke-width="5" stroke-linejoin="round"/>
      <path d="M50 62v68M110 62v68" stroke="#1c1f25" stroke-width="4" opacity=".3"/>
    </g>
    <g class="chest-lid">
      <path d="M18 62q0-44 62-44t62 44z" fill="#e98b2a" stroke="#1c1f25" stroke-width="5" stroke-linejoin="round"/>
      <path d="M50 24v38M110 24v38" stroke="#1c1f25" stroke-width="4" opacity=".3"/>
      <rect x="66" y="52" width="28" height="28" rx="6" fill="#ffea00" stroke="#1c1f25" stroke-width="5"/>
      <circle cx="80" cy="66" r="4" fill="#1c1f25"/>
    </g>
  </svg>`;
}

function createGame(root, pack) {
  const questionsAll = studentQuestions(pack);
  const names = [...pack.teams];
  for (const d of DEFAULT_TEAMS) if (names.length < 4 && !names.includes(d)) names.push(d);

  const opts = { teams: Math.min(Math.max(pack.teams.length, 2), 4), count: 10, weights: defaultWeights() };
  let state = null;
  let timers = [];
  let scoreboard = null;

  const frame = createGameFrame(root, {
    title: 'Gold Heist',
    howTo: HOW_TO,
    onRestart: () => showSetup(),
    onExit: () => (location.hash = '#/'),
  });

  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const clearTimers = () => {
    timers.forEach(clearTimeout);
    timers = [];
    gsap.killTweensOf(frame.stage.querySelectorAll('*'));
  };
  const setStage = (...nodes) => {
    frame.stage.textContent = '';
    frame.stage.append(...nodes);
  };

  // ---------- Cài đặt (giáo viên) ----------
  function showSetup() {
    clearTimers();
    state = null;
    setupOpen = true;
    frame.extra.textContent = '';
    frame.setPaused(false);
    const allowed = [10, 15, 20].filter((n) => n <= questionsAll.length);
    if (!allowed.includes(opts.count)) opts.count = allowed[allowed.length - 1] || questionsAll.length;
    const counts = [10, 15, 20].map((n) => ({ value: n, label: String(n), disabled: n > questionsAll.length }));

    const weightInputs = h('div', { class: 'gh-weights' },
      Object.entries(CHESTS).map(([key, c]) =>
        h('div', { class: 'gh-weight', role: 'group', 'aria-label': t('game.gold.ratioAria', { label: c.label }) },
          h('span', { class: 'en' }, c.label),
          stepper({
            value: opts.weights[key], min: 0, max: 100, step: 5, label: t('game.gold.ratioLabel', { label: c.label }), testId: `gh-weight-${key}`,
            onChange: (v) => { opts.weights[key] = v; },
          }))));

    setStage(setupScreen({
      gameId: 'gold-heist',
      title: 'Gold Heist',
      art: gameArt('gold-heist'),
      rows: [
        { label: t('game.gold.teams'), control: segmented([2, 3, 4].map((n) => ({ value: n, label: String(n) })), opts.teams, (v) => (opts.teams = v), 'gh-teams'),
          hint: t('game.gold.teamsHint', { teams: names.slice(0, 4).join(', ') }) },
        { label: t('game.gold.questions'), control: segmented(counts, opts.count, (v) => (opts.count = v), 'gh-count'),
          hint: t('game.gold.questionsHint', { n: questionsAll.length }) },
        { label: t('game.gold.chests'), control: weightInputs,
          hint: t('game.gold.chestsHint') },
      ],
      onStart: start,
    }));
  }

  // ---------- Chơi ----------
  function start() {
    setupOpen = false;
    const teamNames = names.slice(0, opts.teams);
    state = {
      teamNames,
      gold: teamNames.map(() => 0),
      turn: 0,
      index: 0,
      questions: shuffle(questionsAll).slice(0, Math.min(opts.count, questionsAll.length)),
    };
    scoreboard = createScoreboard(teamNames, { controls: false });
    scoreboard.el.classList.add('gh-scores');
    frame.extra.textContent = '';
    frame.extra.append(scoreboard.el);
    showQuestion(true);
  }

  function syncScores() {
    state.gold.forEach((g, i) => scoreboard.set(i, g));
    scoreboard.highlight(state.turn);
  }

  function turnBanner(extra) {
    const t = state.turn;
    return h('div', { class: 'gh-turn', style: { '--team': TEAM_COLORS[t] } },
      h('span', { class: 'gh-turn-team' }, `${state.teamNames[t]} team`),
      h('span', { class: 'gh-turn-q' }, extra || `Question ${state.index + 1} / ${state.questions.length}`));
  }

  function showQuestion(first = false) {
    syncScores();
    const turnLine = line('teamTurn', { team: state.teamNames[state.turn] });
    if (first) speak(line('goldWelcome')).then(() => state && speak(turnLine));
    else speak(turnLine);
    const q = state.questions[state.index];
    // Trộn thứ tự đáp án mỗi lần hỏi.
    const order = shuffle([0, 1, 2]);
    const texts = order.map((k) => q.options[k]);
    const correctPos = order.indexOf(q.answer);
    const listen = button({ iconName: 'volume', title: 'Listen', variant: 'ghost', onClick: () => speak(q.prompt.replace(/_{2,}/g, 'blank'), { manual: true }) });

    const { el: answersEl, buttons } = answerButtons(texts, (pos, btn) => {
      if (frame.paused) return;
      buttons.forEach((b) => (b.disabled = true));
      if (pos === correctPos) {
        btn.classList.add('correct');
        buttons.forEach((b) => b !== btn && b.classList.add('dim'));
        playSound('correct');
        burst(btn);
        speak(line('correct'));
        later(showChests, 900);
      } else {
        btn.classList.add('wrong');
        buttons[correctPos].classList.add('correct');
        playSound('wrong');
        speak(line('tryAgain'));
        later(() => showOutcome('Wrong answer. Turn lost.', false), 1300);
      }
    });
    answersEl.classList.add('gh-answers');
    answersEl.dataset.correct = String(correctPos);
    setStage(h('div', { class: 'gh-play', 'data-testid': 'gh-question' },
      turnBanner(),
      h('div', { class: 'gh-prompt-row' }, q.pic ? picNode(picOf(q.pic), 'q-pic') : null, h('p', { class: 'prompt' }, q.prompt), listen),
      answersEl));
  }

  function showChests() {
    const kinds = dealChests(state.gold, state.turn, opts.weights);
    let opened = false;
    const chests = kinds.map((kind, i) => {
      const b = h('button', { type: 'button', class: 'gh-chest', 'data-kind': kind, 'aria-label': `Chest ${i + 1}` },
        h('span', { class: 'gh-chest-art', innerHTML: chestSvg() }),
        h('span', { class: `gh-reveal gh-${kind}` }, CHESTS[kind].label));
      b.addEventListener('click', () => {
        if (opened || frame.paused) return;
        opened = true;
        openChest(b, kind, chests);
      });
      return b;
    });
    setStage(h('div', { class: 'gh-play' },
      turnBanner('Pick a chest'),
      h('div', { class: 'gh-chests', 'data-testid': 'gh-chests' }, chests)));
    speak(line('pickChest'));
    gsap.from(chests, { y: 60, opacity: 0, duration: 0.45, stagger: 0.1, ease: 'back.out(1.6)', clearProps: 'opacity,transform' });
  }

  function openChest(btn, kind, all) {
    playSound('pop');
    gsap.killTweensOf(all);
    gsap.set(all, { clearProps: 'opacity,transform' });
    all.forEach((c) => c !== btn && c.classList.add('dim'));
    btn.classList.add('open');
    const lid = btn.querySelector('.chest-lid');
    const reveal = btn.querySelector('.gh-reveal');
    gsap.timeline()
      .to(btn, { rotation: -4, duration: 0.08, yoyo: true, repeat: 5, transformOrigin: '50% 90%' })
      .to(btn, { rotation: 0, duration: 0.05 })
      .to(lid, { rotation: -35, y: -24, svgOrigin: '20 62', duration: 0.35, ease: 'back.out(2)' })
      .fromTo(reveal, { scale: 0.2, opacity: 0, y: 30 }, { scale: 1, opacity: 1, y: 0, duration: 0.4, ease: 'back.out(2)' }, '-=0.15');
    setTimeout(() => {
      if (btn.isConnected) {
        burst(btn, { shapes: ['dot', 'star'], colors: ['#ffd23f', '#ffb400', '#fff176'], count: 22, spread: 1.4 });
        floatText(btn, CHESTS[kind].label, { color: kind === 'lose10' ? '#ff5a00' : '#e39b00' });
      }
    }, 700);
    // Hẹn giờ riêng (không phụ thuộc hoạt ảnh) để game luôn chạy tiếp.
    later(() => resolveChest(kind), 1600);
  }

  function resolveChest(kind) {
    if (!needsTarget(kind)) {
      finishChest(kind, -1);
      return;
    }
    const targets = validTargets(state.gold, state.turn, kind);
    if (!targets.length) {
      finishChest('plus10', -1);
      return;
    }
    const verb = kind === 'steal20' ? 'Steal 20 gold from…' : 'Swap gold with…';
    setStage(h('div', { class: 'gh-play' },
      turnBanner(verb),
      h('div', { class: 'gh-targets', 'data-testid': 'gh-targets' },
        targets.map((t) =>
          h('button', { type: 'button', class: 'gh-target', style: teamVars(TEAM_COLORS[t]), onClick: () => finishChest(kind, t) },
            h('span', {}, state.teamNames[t]),
            h('span', { class: 'gh-target-gold' }, icon('coins', 36), String(state.gold[t])))))));
  }

  function finishChest(kind, target) {
    const { gold, text } = applyChest(state.gold, state.turn, kind, target, state.teamNames);
    state.gold = gold;
    playSound(kind === 'lose10' ? 'wrong' : 'correct');
    showOutcome(text, kind !== 'lose10');
  }

  function showOutcome(text, good) {
    syncScores();
    const last = state.index + 1 >= state.questions.length;
    setStage(h('div', { class: 'gh-play' },
      turnBanner(),
      h('div', { class: `gh-outcome ${good ? 'good' : 'bad'}`, 'data-testid': 'gh-outcome' }, text),
      h('div', { class: 'gh-next' },
        button({ label: last ? 'See results' : 'Next team', iconName: last ? 'trophy' : 'play', variant: 'primary', size: 'lg', onClick: next, attrs: { 'data-testid': 'gh-next' } }))));
  }

  function next() {
    state.index += 1;
    if (state.index >= state.questions.length) {
      showResults();
      return;
    }
    state.turn = (state.turn + 1) % state.teamNames.length;
    showQuestion();
  }

  function showResults() {
    scoreboard.highlight(-1);
    const ranking = state.teamNames.map((name, index) => ({ name, index, score: state.gold[index] })).sort((a, b) => b.score - a.score);
    const tie = ranking.length > 1 && ranking[0].score === ranking[1].score;
    setStage(resultsScreen({ title: tie ? "It's a tie" : `${ranking[0].name} team wins`, ranking, unit: ' gold', onReplay: showSetup }));
    playSound('win');
    speak(tie ? line('tie') : line('teamWins', { team: ranking[0].name }));
    confetti({ particleCount: Math.round(160 * PERF.confetti), spread: 90, origin: { y: 0.6 }, disableForReducedMotion: true, ...confettiLite() });
  }

  let setupOpen = false;
  // Đổi ngôn ngữ: chỉ dựng lại màn cài đặt khi đang mở; game đang chơi giữ nguyên.
  const offLang = onLang(() => { if (setupOpen) showSetup(); });
  showSetup();

  return {
    destroy() {
      offLang();
      clearTimers();
      confetti.reset();
      frame.destroy();
    },
  };
}

let instance = null;

export default {
  id: 'gold-heist',
  title: 'Gold Heist',
  needsCamera: false,
  minItems: { questions: 10 },
  group: 'class',
  theme: 'island',
  icon: 'coins',
  get description() { return t('game.gold.desc'); },
  ready: true,

  mount(rootEl, content) {
    instance = createGame(rootEl, content);
  },

  unmount() {
    if (instance) instance.destroy();
    instance = null;
  },
};
