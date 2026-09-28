// Memory Match — lật 2 thẻ, cặp "từ tiếng Anh + nghĩa tiếng Việt" trùng nhau thì ghi điểm và được lật tiếp.
// 2-4 đội thay phiên trên cùng bảng. Máy đọc từ khi tìm được cặp.
import './style.css';
import confetti from 'canvas-confetti';
import { playSound, speak } from '../../core/audio.js';
import {
  TEAM_COLORS, createGameFrame, createScoreboard, h, resultsScreen, segmented, setupScreen,
} from '../../core/ui.js';
import { gameArt } from '../../core/art.js';
import { line } from '../../core/voice-lines.js';
import { buildDeck, isMatch, maxPairs } from './logic.js';
import { burst } from '../../core/fx.js';

const DEFAULT_TEAMS = ['Red', 'Blue', 'Green', 'Pink'];
const HOW_TO = {
  title: 'How to play',
  text: 'Find the English word and its Vietnamese meaning.',
  steps: ['Flip two cards.', 'A pair: +1 point and play again.', 'No pair: next team.'],
};

function createGame(root, pack) {
  const names = [...pack.teams];
  for (const d of DEFAULT_TEAMS) if (names.length < 4 && !names.includes(d)) names.push(d);
  const available = maxPairs(pack.vocab);
  const opts = { pairs: Math.min(8, available), teams: 2 };
  let state = null;
  let scoreboard = null;
  let timers = [];

  const frame = createGameFrame(root, { title: 'Memory Match', howTo: HOW_TO, onRestart: () => showSetup() });
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const setStage = (...nodes) => {
    frame.stage.textContent = '';
    frame.stage.append(...nodes);
  };

  function showSetup() {
    timers.forEach(clearTimeout);
    timers = [];
    state = null;
    frame.extra.textContent = '';
    frame.setPaused(false);
    const pairOpts = [6, 8, 10].map((n) => ({ value: n, label: `${n} cặp`, disabled: n > available }));
    if (opts.pairs > available || ![6, 8, 10].includes(opts.pairs)) opts.pairs = [6, 8, 10].filter((n) => n <= available).pop() || available;
    setStage(setupScreen({
      gameId: 'memory-match',
      title: 'Memory Match',
      art: gameArt('memory-match'),
      rows: [
        { label: 'Số cặp thẻ', control: segmented(pairOpts, opts.pairs, (v) => (opts.pairs = v), 'mm-pairs'), hint: `Bộ nội dung có ${available} từ có nghĩa tiếng Việt.` },
        { label: 'Số đội', control: segmented([2, 3, 4].map((n) => ({ value: n, label: String(n) })), opts.teams, (v) => (opts.teams = v), 'mm-teams'),
          hint: `2 học sinh (hoặc 2-4 đội) thay phiên lên lật thẻ: ${names.slice(0, 4).join(', ')}.` },
      ],
      onStart: start,
    }));
  }

  function start() {
    const deck = buildDeck(pack.vocab, opts.pairs);
    const teamNames = names.slice(0, opts.teams);
    state = { deck, teamNames, turn: 0, open: [], found: 0, busy: false };
    scoreboard = createScoreboard(teamNames, { controls: false });
    scoreboard.el.classList.add('mm-scores');
    frame.extra.textContent = '';
    frame.extra.append(scoreboard.el);
    const cols = deck.length <= 12 ? 4 : 5;
    const grid = h('div', { class: 'mm-grid', style: { '--cols': cols }, 'data-testid': 'mm-grid' },
      deck.map((card, i) => {
        const el = h('button', { type: 'button', class: `mm-card ${card.kind}`, 'data-index': i, 'data-pair': card.pair, 'aria-label': `Card ${i + 1}` },
          h('span', { class: 'mm-inner' },
            h('span', { class: 'mm-back' }, h('span', { class: 'mm-q en' }, '?')),
            h('span', { class: `mm-front${card.kind === 'word' ? ' en' : ''}` }, card.text)));
        el.addEventListener('click', () => flip(i));
        card.el = el;
        return el;
      }));
    const turnEl = h('div', { class: 'mm-turn en', 'data-testid': 'mm-turn' });
    state.turnEl = turnEl;
    setStage(h('div', { class: 'mm-play' }, turnEl, grid));
    renderTurn();
    speak(line('findPairs'));
  }

  function renderTurn() {
    const t = state.turn;
    state.turnEl.textContent = `${state.teamNames[t]} team, your turn`;
    state.turnEl.style.setProperty('--team', TEAM_COLORS[t]);
    scoreboard.highlight(t);
  }

  function flip(i) {
    if (!state || state.busy || frame.paused) return;
    const card = state.deck[i];
    if (card.done || state.open.includes(card)) return;
    card.el.classList.add('flipped');
    playSound('pop');
    state.open.push(card);
    if (state.open.length < 2) return;
    const [a, b] = state.open;
    state.busy = true;
    if (isMatch(a, b)) {
      later(() => {
        a.done = b.done = true;
        a.el.classList.add('matched');
        b.el.classList.add('matched');
        a.el.style.setProperty('--team', TEAM_COLORS[state.turn]);
        b.el.style.setProperty('--team', TEAM_COLORS[state.turn]);
        scoreboard.add(state.turn, 1);
        playSound('correct');
        burst(a.el, { count: 12 });
        burst(b.el, { count: 12 });
        speak(line('match')).then(() => speak(a.word));
        state.found += 1;
        state.open = [];
        state.busy = false;
        if (state.found === state.deck.length / 2) later(finish, 1500);
      }, 500);
    } else {
      later(() => {
        a.el.classList.remove('flipped');
        b.el.classList.remove('flipped');
        state.open = [];
        state.busy = false;
        state.turn = (state.turn + 1) % state.teamNames.length;
        renderTurn();
        speak(line('teamTurn', { team: state.teamNames[state.turn] }));
      }, 1300);
    }
  }

  function finish() {
    const ranking = scoreboard.ranking();
    const tie = ranking[0].score === ranking[1].score;
    setStage(resultsScreen({ title: tie ? "It's a tie" : `${ranking[0].name} team wins`, ranking, unit: ' pairs', onReplay: showSetup }));
    playSound('win');
    speak(tie ? line('tie') : line('teamWins', { team: ranking[0].name }));
    confetti({ particleCount: 160, spread: 90, origin: { y: 0.6 }, disableForReducedMotion: true });
  }

  showSetup();
  return {
    destroy() {
      timers.forEach(clearTimeout);
      confetti.reset();
      frame.destroy();
    },
  };
}

let instance = null;

export default {
  id: 'memory-match',
  title: 'Memory Match',
  needsCamera: false,
  minItems: { vocab: 6 },
  group: 'class',
  theme: 'candy',
  icon: 'grid',
  description: 'Lật thẻ tìm cặp từ tiếng Anh và nghĩa tiếng Việt.',
  ready: true,
  checkContent: (pack) => (maxPairs(pack.vocab) >= 6 ? [] : [`Cần ít nhất 6 từ có nghĩa tiếng Việt khác nhau (hiện có ${maxPairs(pack.vocab)}).`]),

  mount(rootEl, content) {
    instance = createGame(rootEl, content);
  },

  unmount() {
    if (instance) instance.destroy();
    instance = null;
  },
};
