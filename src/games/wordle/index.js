// Spell Grid (lối chơi đoán chữ 6 lượt) — luyện chính tả. Đặc tả: docs/GAMES_SPEC.md ("ESL Wordle")
import './style.css';
import confetti from 'canvas-confetti';
import { shuffle } from '../../core/content.js';
import { playSound, speak } from '../../core/audio.js';
import { TEAM_COLORS, button, createGameFrame, createScoreboard, h, segmented, setupScreen } from '../../core/ui.js';
import { gameArt } from '../../core/art.js';
import { line } from '../../core/voice-lines.js';
import { MAX_LEN, MAX_TRIES, MIN_LEN, eligibleWords, mergeKeyStates, scoreGuess, wordScore } from './logic.js';

const HOW_TO = {
  title: 'How to play',
  text: 'Guess the secret word in 6 tries.',
  steps: ['Green: right letter, right place.', 'Yellow: right letter, wrong place.', 'Grey: not in the word.', 'Hint shows the meaning (-20 points).'],
};

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

function createGame(root, pack) {
  const words = eligibleWords(pack.vocab);
  const opts = { mode: 'class' };
  let queue = [];
  let game = null; // trạng thái từ hiện tại
  let teamNames = [];
  let scoreboard = null;
  let turn = 0;
  let total = 0;

  const frame = createGameFrame(root, {
    title: 'Spell Grid',
    howTo: HOW_TO,
    onRestart: () => showSetup(),
  });

  const setStage = (...nodes) => {
    frame.stage.textContent = '';
    frame.stage.append(...nodes);
  };

  // ---------- Cài đặt ----------
  function showSetup() {
    game = null;
    frame.extra.textContent = '';
    frame.setPaused(false);
    setStage(setupScreen({
      gameId: 'wordle',
      title: 'Spell Grid',
      art: gameArt('wordle'),
      rows: [
        { label: 'Chế độ', control: segmented([{ value: 'class', label: 'Cả lớp (thi đội)' }, { value: 'solo', label: 'Cá nhân' }], opts.mode, (v) => (opts.mode = v), 'wd-mode'),
          hint: 'Cả lớp: các đội lần lượt đoán mỗi đội 1 từ, điểm cộng cho đội. Cá nhân: 1 học sinh chơi trên máy của mình.' },
      ],
      onStart: start,
    }));
    const info = h('p', { class: 'muted' }, `Dùng ${words.length} từ có ${MIN_LEN}-${MAX_LEN} chữ cái trong bộ nội dung: ${words.map((w) => w.word).join(', ')}.`);
    frame.stage.querySelector('.setup-card').insertBefore(info, frame.stage.querySelector('.setup-actions'));
  }

  function start() {
    queue = shuffle(words);
    total = 0;
    turn = 0;
    frame.extra.textContent = '';
    if (opts.mode === 'class') {
      teamNames = pack.teams.slice(0, 4);
      scoreboard = createScoreboard(teamNames, { controls: false });
      scoreboard.el.classList.add('wd-scores');
      frame.extra.append(scoreboard.el);
    } else {
      scoreboard = null;
      frame.extra.append(h('div', { class: 'wd-total en', 'data-testid': 'wd-total' }, 'Score 0'));
    }
    nextWord();
  }

  function nextWord() {
    if (!queue.length) queue = shuffle(words);
    const target = queue.shift();
    game = { target, word: target.word, row: 0, current: '', rows: [], keys: {}, done: false, hint: false };
    if (scoreboard) scoreboard.highlight(turn);
    render();
    speak(line('guessWord'));
  }

  // ---------- Vẽ ----------
  let tiles = [];
  let keyEls = {};
  let side = null;
  let toastEl = null;

  function render() {
    const len = game.word.length;
    tiles = [];
    const grid = h('div', { class: 'wd-grid', style: { '--len': len }, 'data-testid': 'wd-grid' });
    for (let r = 0; r < MAX_TRIES; r++) {
      const row = h('div', { class: 'wd-row' });
      const cells = [];
      for (let c = 0; c < len; c++) {
        const cell = h('div', { class: 'wd-tile en' });
        row.append(cell);
        cells.push(cell);
      }
      tiles.push(cells);
      grid.append(row);
    }

    keyEls = {};
    const keyboard = h('div', { class: 'wd-keyboard', 'data-testid': 'wd-keyboard' },
      ROWS.map((letters, r) =>
        h('div', { class: 'wd-krow' },
          r === 2 ? keyBtn('Enter', 'enter') : null,
          [...letters].map((ch) => (keyEls[ch] = keyBtn(ch.toUpperCase(), ch))),
          r === 2 ? keyBtn('⌫', 'back', 'Delete') : null)));

    side = h('div', { class: 'wd-side' });
    toastEl = h('div', { class: 'wd-toast en', hidden: true });
    setStage(h('div', { class: 'wd-play' },
      h('div', { class: 'wd-main' }, h('div', { class: 'wd-board' }, grid, toastEl), keyboard),
      side));
    renderSide();
  }

  function keyBtn(label, key, title) {
    const b = h('button', { type: 'button', class: `wd-key en${key.length > 1 ? ' wide' : ''}`, 'data-key': key, 'aria-label': title || label }, label);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      press(key);
    });
    return b;
  }

  function renderSide() {
    side.textContent = '';
    const turnInfo = scoreboard
      ? h('div', { class: 'wd-turn en', style: { '--team': TEAM_COLORS[turn] } }, `${teamNames[turn]} team`)
      : null;
    if (turnInfo) side.append(turnInfo);
    side.append(
      h('div', { class: 'wd-len en' }, `${game.word.length} letters`),
      game.hint
        ? h('div', { class: 'wd-hint', 'data-testid': 'wd-hint-text' }, h('small', {}, 'Nghĩa'), game.target.meaning || '(chưa có nghĩa)')
        : button({ label: 'Hint (-20)', iconName: 'help', size: 'lg', onClick: useHint, attrs: { 'data-testid': 'wd-hint', disabled: game.done || null } }),
    );
    if (game.done) {
      const pts = wordScore(game.row, game.solved, game.hint);
      side.append(
        h('div', { class: `wd-result ${game.solved ? 'good' : 'bad'}`, 'data-testid': 'wd-result' },
          h('span', { class: 'en' }, game.solved ? `Solved! +${pts}` : 'The word was'),
          h('strong', { class: 'en' }, game.word.toUpperCase()),
          h('span', {}, game.target.meaning || '')),
        button({ label: 'Listen', iconName: 'volume', size: 'lg', onClick: () => speak(game.target.word) }),
        button({ label: 'Next word', iconName: 'play', variant: 'primary', size: 'lg', onClick: advance, attrs: { 'data-testid': 'wd-next' } }),
      );
    }
  }

  function useHint() {
    if (!game || game.done || game.hint) return;
    game.hint = true;
    renderSide();
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => (toastEl.hidden = true), 1400);
  }

  // ---------- Nhập ----------
  function press(key) {
    if (!game || game.done || frame.paused || document.body.classList.contains('modal-open')) return;
    const len = game.word.length;
    if (key === 'back') {
      game.current = game.current.slice(0, -1);
    } else if (key === 'enter') {
      submit();
      return;
    } else if (/^[a-z]$/.test(key) && game.current.length < len) {
      game.current += key;
    }
    paintCurrent();
  }

  function paintCurrent() {
    const cells = tiles[game.row];
    cells.forEach((cell, i) => {
      const ch = game.current[i] || '';
      cell.textContent = ch.toUpperCase();
      cell.classList.toggle('filled', Boolean(ch));
    });
  }

  function submit() {
    const len = game.word.length;
    const rowEl = tiles[game.row][0].parentElement;
    if (game.current.length < len) {
      rowEl.classList.remove('shake');
      void rowEl.offsetWidth;
      rowEl.classList.add('shake');
      showToast('Not enough letters');
      playSound('wrong');
      return;
    }
    const guess = game.current;
    const result = scoreGuess(guess, game.word);
    tiles[game.row].forEach((cell, i) => {
      cell.style.setProperty('--delay', `${i * 0.12}s`);
      cell.classList.add('flip', result[i]);
      cell.dataset.state = result[i];
    });
    game.keys = mergeKeyStates(game.keys, guess, result);
    game.rows.push({ guess, result });
    game.row += 1;
    game.current = '';
    setTimeout(() => {
      Object.entries(game.keys).forEach(([ch, st]) => {
        if (keyEls[ch]) keyEls[ch].dataset.state = st;
      });
    }, len * 120 + 250);

    const solved = guess === game.word;
    if (solved || game.row >= MAX_TRIES) {
      game.done = true;
      game.solved = solved;
      const pts = wordScore(game.row, solved, game.hint);
      total += pts;
      if (scoreboard) scoreboard.add(turn, pts);
      else frame.extra.querySelector('.wd-total').textContent = `Score ${total}`;
      setTimeout(() => {
        playSound(solved ? 'win' : 'wrong');
        if (solved) confetti({ particleCount: 110, spread: 80, origin: { y: 0.55 }, disableForReducedMotion: true });
        const word = game.word;
        speak(line(solved ? 'greatJob' : 'wordWas')).then(() => game && game.word === word && speak(word));
        renderSide();
      }, len * 120 + 350);
    } else {
      playSound('pop');
    }
  }

  function advance() {
    if (scoreboard) turn = (turn + 1) % teamNames.length;
    nextWord();
  }

  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key;
    if (k === 'Enter') press('enter');
    else if (k === 'Backspace') press('back');
    else if (/^[a-zA-Z]$/.test(k)) press(k.toLowerCase());
    else return;
    e.preventDefault();
  };
  window.addEventListener('keydown', onKey);

  showSetup();

  return {
    destroy() {
      window.removeEventListener('keydown', onKey);
      clearTimeout(showToast.t);
      confetti.reset();
      frame.destroy();
    },
  };
}

let instance = null;

export default {
  id: 'wordle',
  title: 'Spell Grid',
  needsCamera: false,
  minItems: 1,
  group: 'class',
  icon: 'grid',
  description: 'Đoán từ bí mật trong 6 lượt, luyện chính tả.',
  ready: true,
  checkContent: (pack) =>
    eligibleWords(pack.vocab).length
      ? []
      : [`Cần ít nhất 1 từ có ${MIN_LEN}-${MAX_LEN} chữ cái tiếng Anh, không dấu cách (ví dụ: bread, apple).`],

  mount(rootEl, content) {
    instance = createGame(rootEl, content);
  },

  unmount() {
    if (instance) instance.destroy();
    instance = null;
  },
};
