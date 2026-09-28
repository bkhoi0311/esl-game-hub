// Tic-Tac-Toe Quiz — cờ ca-rô 3x3: đội chọn ô rồi trả lời câu hỏi; đúng thì chiếm ô. 3 ô thẳng hàng là thắng ván.
import './style.css';
import confetti from 'canvas-confetti';
import { playSound, speak } from '../../core/audio.js';
import { getQuestions, shuffle } from '../../core/content.js';
import { TEAM_COLORS, answerButtons, button, createGameFrame, createScoreboard, h } from '../../core/ui.js';
import { line } from '../../core/voice-lines.js';
import { outcome } from './logic.js';
import { burst } from '../../core/fx.js';

const MARKS = ['X', 'O'];
const HOW_TO = {
  title: 'How to play',
  text: 'Get three in a row.',
  steps: ['Choose a square.', 'Answer the question.', 'Correct: the square is yours.', 'Wrong: the other team plays.'],
};

function createGame(root, pack) {
  const questionsAll = getQuestions(pack);
  const teams = pack.teams.slice(0, 2);
  let queue = [];
  let board = null;
  let turn = 0;
  let starter = 0;
  let busy = false;
  let cells = [];
  let panel = null;
  let turnEl = null;
  let timers = [];

  const frame = createGameFrame(root, { title: 'Tic-Tac-Toe Quiz', howTo: HOW_TO, onRestart: () => newSeries() });
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const scoreboard = createScoreboard(teams.map((t, i) => `${t} (${MARKS[i]})`), { controls: false });
  scoreboard.el.classList.add('ttt-scores');
  frame.extra.append(scoreboard.el);

  function markSvg(m) {
    return m === 0
      ? '<svg viewBox="0 0 100 100"><path d="M22 22L78 78M78 22L22 78" stroke="#ff5a00" stroke-width="16" stroke-linecap="round" fill="none" pathLength="1"/></svg>'
      : '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" stroke="#0c6bed" stroke-width="15" fill="none" pathLength="1"/></svg>';
  }

  function newSeries() {
    scoreboard.reset();
    starter = 0;
    newMatch();
  }

  function newMatch() {
    timers.forEach(clearTimeout);
    timers = [];
    frame.setPaused(false);
    board = Array(9).fill(null);
    turn = starter;
    busy = false;
    cells = board.map((_, i) => {
      const el = h('button', { type: 'button', class: 'ttt-cell', 'data-index': i, 'aria-label': `Square ${i + 1}` }, h('span', { class: 'ttt-num en' }, String(i + 1)));
      el.addEventListener('click', () => choose(i));
      return el;
    });
    turnEl = h('div', { class: 'ttt-turn en', 'data-testid': 'ttt-turn' });
    panel = h('div', { class: 'ttt-panel', 'data-testid': 'ttt-panel' });
    frame.stage.textContent = '';
    frame.stage.append(h('div', { class: 'ttt-play' },
      h('div', { class: 'ttt-board', 'data-testid': 'ttt-board' }, cells),
      h('div', { class: 'ttt-side' }, turnEl, panel)));
    renderTurn();
    idlePanel();
    speak(line('teamTurn', { team: teams[turn] }));
  }

  function renderTurn() {
    turnEl.textContent = `${teams[turn]} team (${MARKS[turn]}), your turn`;
    turnEl.style.setProperty('--team', TEAM_COLORS[turn]);
    scoreboard.highlight(turn);
    cells.forEach((c) => c.style.setProperty('--team', TEAM_COLORS[turn]));
  }

  function idlePanel() {
    panel.textContent = '';
    panel.append(h('p', { class: 'ttt-hint en' }, 'Choose a free square.'));
  }

  function nextQuestion() {
    if (!queue.length) queue = shuffle(questionsAll);
    return queue.shift();
  }

  function choose(i) {
    if (busy || frame.paused || board[i] !== null) return;
    busy = true;
    cells.forEach((c, k) => c.classList.toggle('picked', k === i));
    const q = nextQuestion();
    const order = shuffle([0, 1, 2]);
    const correctPos = order.indexOf(q.answer);
    const { el, buttons } = answerButtons(order.map((k) => q.options[k]), (pos, btn) => {
      buttons.forEach((b) => (b.disabled = true));
      const ok = pos === correctPos;
      btn.classList.add(ok ? 'correct' : 'wrong');
      buttons[correctPos].classList.add('correct');
      playSound(ok ? 'correct' : 'wrong');
      speak(line(ok ? 'correct' : 'tryAgain'));
      later(() => resolve(i, ok), 1200);
    });
    el.classList.add('ttt-answers');
    el.dataset.correct = String(correctPos);
    panel.textContent = '';
    panel.append(h('p', { class: 'prompt ttt-prompt' }, q.prompt), el);
    speak(q.prompt);
  }

  function resolve(i, ok) {
    cells[i].classList.remove('picked');
    if (ok) {
      board[i] = turn;
      cells[i].classList.add('taken', `m${turn}`);
      cells[i].innerHTML = markSvg(turn);
      burst(cells[i], { count: 14 });
    }
    const res = outcome(board);
    if (res) {
      endMatch(res);
      return;
    }
    turn = 1 - turn;
    busy = false;
    renderTurn();
    idlePanel();
    speak(line('teamTurn', { team: teams[turn] }));
  }

  function endMatch(res) {
    panel.textContent = '';
    turnEl.hidden = true;
    if (res.draw) {
      playSound('pop');
      speak(line('tie'));
      panel.append(h('p', { class: 'ttt-result en', 'data-testid': 'ttt-result' }, "It's a draw"));
    } else {
      res.line.forEach((k) => cells[k].classList.add('win'));
      scoreboard.add(res.winner, 1);
      playSound('win');
      speak(line('threeInRow')).then(() => speak(line('teamWins', { team: teams[res.winner] })));
      confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 }, disableForReducedMotion: true });
      panel.append(h('p', { class: 'ttt-result en', 'data-testid': 'ttt-result', style: { '--team': TEAM_COLORS[res.winner] } }, `${teams[res.winner]} team wins`));
    }
    starter = 1 - starter;
    panel.append(button({ label: 'Next match', iconName: 'play', variant: 'primary', size: 'lg', onClick: newMatch, attrs: { 'data-testid': 'ttt-next' } }));
  }

  newSeries();
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
  id: 'tic-tac-toe',
  title: 'Tic-Tac-Toe Quiz',
  needsCamera: false,
  minItems: { questions: 9 },
  group: 'class',
  theme: 'field',
  icon: 'grid',
  description: 'Cờ ca-rô 3x3: trả lời đúng mới được chiếm ô.',
  ready: true,

  mount(rootEl, content) {
    instance = createGame(rootEl, content);
  },

  unmount() {
    if (instance) instance.destroy();
    instance = null;
  },
};
