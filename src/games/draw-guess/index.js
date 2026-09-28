// Draw & Guess — học sinh vẽ từ bí mật, cả lớp đoán bằng tiếng Anh. Đặc tả: docs/GAMES_SPEC.md
// Từ bí mật KHÔNG nằm trong trang khi không nhấn giữ nút "Hold to see word".
import './style.css';
import confetti from 'canvas-confetti';
import { shuffle } from '../../core/content.js';
import { playSound, speak } from '../../core/audio.js';
import {
  TEAM_COLORS, button, createCountdown, createGameFrame, createScoreboard, h, openModal, resultsScreen, segmented, setupScreen,
} from '../../core/ui.js';
import { gameArt } from '../../core/art.js';
import { icon } from '../../core/icons.js';
import { qrSvg } from '../../core/qr.js';
import { line } from '../../core/voice-lines.js';
import { createBoard } from './board.js';

const DEFAULT_TEAMS = ['Red', 'Blue', 'Green', 'Pink'];
const PEN_COLORS = [
  { id: 'black', value: '#1c1f25', label: 'Black' },
  { id: 'red', value: '#ff5a00', label: 'Red' },
  { id: 'blue', value: '#0c6bed', label: 'Blue' },
  { id: 'green', value: '#04bc09', label: 'Green' },
];

const HOW_TO = {
  title: 'How to play',
  text: 'One student draws the secret word.',
  steps: ['Hold the eye button to see the word.', 'Draw. No letters, no numbers.', 'The class guesses in English.', 'Teacher taps Correct and picks the team.'],
};

function createGame(root, pack) {
  const words = pack.vocab.filter((v) => v.word);
  const names = [...pack.teams];
  for (const d of DEFAULT_TEAMS) if (names.length < 4 && !names.includes(d)) names.push(d);
  const opts = { seconds: 90, teams: Math.min(Math.max(pack.teams.length, 2), 4) };

  let queue = [];
  let secret = null; // chỉ giữ trong biến JS, không đưa vào DOM
  let roundNo = 0;
  let playing = false;
  let timer = null;
  let scoreboard = null;
  let board = null;
  let teamNames = [];

  const frame = createGameFrame(root, {
    title: 'Draw & Guess',
    howTo: HOW_TO,
    onPause: () => {
      if (timer) timer.pause();
      if (board) board.setEnabled(false);
    },
    onResume: () => {
      if (timer && playing) timer.resume();
      if (board) board.setEnabled(playing);
    },
    onRestart: () => showSetup(),
  });

  const setStage = (...nodes) => {
    frame.stage.textContent = '';
    frame.stage.append(...nodes);
  };

  function showSetup() {
    cleanupRound();
    frame.extra.textContent = '';
    frame.setPaused(false);
    setStage(setupScreen({
      gameId: 'draw-guess',
      title: 'Draw & Guess',
      art: gameArt('draw-guess'),
      rows: [
        { label: 'Thời gian mỗi lượt vẽ', control: segmented([60, 90].map((n) => ({ value: n, label: `${n}s` })), opts.seconds, (v) => (opts.seconds = v), 'dg-seconds') },
        { label: 'Số đội', control: segmented([2, 3, 4].map((n) => ({ value: n, label: String(n) })), opts.teams, (v) => (opts.teams = v), 'dg-teams'),
          hint: 'Học sinh vẽ nhấn giữ nút con mắt để xem từ (chữ nhỏ ở góc). Hoặc bấm "QR" rồi quét bằng điện thoại giáo viên.' },
      ],
      onStart: start,
    }));
  }

  function start() {
    teamNames = names.slice(0, opts.teams);
    queue = shuffle(words);
    roundNo = 0;
    scoreboard = createScoreboard(teamNames, { controls: true });
    scoreboard.el.classList.add('dg-scores');
    timer = createCountdown({ seconds: opts.seconds, onEnd: timeUp, onTick: (s) => s <= 5 && s > 0 && playSound('tick') });
    frame.extra.textContent = '';
    frame.extra.append(scoreboard.el, timer.el);
    buildPlay();
    nextRound();
  }

  // ---------- Giao diện vẽ ----------
  let overlay = null;
  let holdBtn = null;
  let peekEl = null;
  let actionBtns = [];

  function buildPlay() {
    const canvasWrap = h('div', { class: 'dg-canvas-wrap', 'data-testid': 'dg-canvas-wrap' });
    board = createBoard(canvasWrap);

    const colorBtns = PEN_COLORS.map((c) => {
      const b = h('button', { type: 'button', class: 'dg-tool dg-color', style: { '--pen': c.value }, 'aria-label': `${c.label} pen`, 'data-color': c.id },
        h('span', { class: 'dg-swatch' }));
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        board.setTool({ color: c.value, erase: false });
        selectTool(b, colorBtns.concat(eraser));
      });
      return b;
    });
    const eraser = h('button', { type: 'button', class: 'dg-tool dg-eraser', 'aria-label': 'Eraser', 'data-testid': 'dg-eraser' }, eraserIcon());
    eraser.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      board.setTool({ erase: true });
      selectTool(eraser, colorBtns.concat(eraser));
    });
    const sizeBtns = [{ id: 'thin', label: 'Thin pen' }, { id: 'thick', label: 'Thick pen' }].map((s) => {
      const b = h('button', { type: 'button', class: `dg-tool dg-size ${s.id}`, 'aria-label': s.label, 'data-size': s.id }, h('span', { class: 'dg-dot' }));
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        board.setTool({ size: s.id });
        selectTool(b, sizeBtns);
      });
      return b;
    });
    const clearBtn = h('button', { type: 'button', class: 'dg-tool dg-clear', 'aria-label': 'Clear all', 'data-testid': 'dg-clear' }, icon('trash', 34));
    clearBtn.addEventListener('click', () => board.clear());
    selectTool(colorBtns[0], colorBtns.concat(eraser));
    selectTool(sizeBtns[0], sizeBtns);

    // Nút "Giữ để xem từ": từ chỉ được chèn vào trang khi đang nhấn giữ.
    peekEl = h('div', { class: 'dg-peek-host' });
    holdBtn = h('button', { type: 'button', class: 'dg-hold', 'data-testid': 'dg-hold', 'aria-label': 'Hold to see word' },
      eyeIcon(), h('span', {}, 'Hold to see word'));
    const show = (e) => {
      e.preventDefault();
      if (!secret || !playing) return;
      holdBtn.setPointerCapture?.(e.pointerId);
      peekEl.textContent = '';
      peekEl.append(h('span', { class: 'dg-secret en', 'data-testid': 'dg-secret' }, secret.word));
    };
    const hide = () => (peekEl.textContent = '');
    holdBtn.addEventListener('pointerdown', show);
    ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave'].forEach((ev) => holdBtn.addEventListener(ev, hide));
    holdBtn.addEventListener('contextmenu', (e) => e.preventDefault());

    const qrBtn = button({ label: 'QR', iconName: 'grid', attrs: { 'data-testid': 'dg-qr' }, onClick: showQr });
    const correctBtn = button({ label: 'Correct', iconName: 'check', variant: 'primary', size: 'lg', onClick: markCorrect, attrs: { 'data-testid': 'dg-correct' } });
    const skipBtn = button({ label: 'Skip', iconName: 'refresh', onClick: () => endRound(null, 'Skipped'), attrs: { 'data-testid': 'dg-skip' } });
    const finishBtn = button({ label: 'Finish', iconName: 'trophy', variant: 'ghost', onClick: finishGame, attrs: { 'data-testid': 'dg-finish' } });
    actionBtns = [correctBtn, skipBtn, qrBtn];

    overlay = h('div', { class: 'dg-overlay', hidden: true });
    setStage(h('div', { class: 'dg-play' },
      h('div', { class: 'dg-tools' }, colorBtns, h('span', { class: 'dg-sep' }), sizeBtns, h('span', { class: 'dg-sep' }), eraser, clearBtn),
      h('div', { class: 'dg-board' }, canvasWrap, peekEl, overlay),
      h('div', { class: 'dg-side' },
        h('div', { class: 'dg-round en', 'data-testid': 'dg-round' }),
        holdBtn, qrBtn, h('span', { class: 'dg-grow' }), skipBtn, correctBtn, finishBtn)));
    requestAnimationFrame(() => board && board.resize());
  }

  function selectTool(btn, group) {
    group.forEach((b) => b.classList.toggle('active', b === btn));
  }

  function eyeIcon() {
    const w = h('span', { class: 'dg-eye' });
    w.innerHTML = '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
    return w;
  }

  function eraserIcon() {
    const w = h('span', { class: 'dg-eraser-icon' });
    w.innerHTML = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>';
    return w;
  }

  // ---------- Vòng chơi ----------
  function nextRound() {
    if (!queue.length) queue = shuffle(words);
    secret = queue.shift();
    roundNo += 1;
    playing = false;
    board.clear();
    board.setEnabled(false);
    timer.reset(opts.seconds);
    frame.stage.querySelector('[data-testid=dg-round]').textContent = `Round ${roundNo}`;
    actionBtns.forEach((b) => (b.disabled = true));
    showOverlay(
      h('div', { class: 'dg-card' },
        h('p', { class: 'dg-card-title en' }, `Round ${roundNo}`),
        h('p', { class: 'dg-card-text en' }, 'Choose a student to draw. Ready?'),
        button({ label: `Start ${opts.seconds}s`, iconName: 'play', variant: 'primary', size: 'lg', onClick: beginDrawing, attrs: { 'data-testid': 'dg-begin' } })),
    );
  }

  function beginDrawing() {
    hideOverlay();
    playing = true;
    board.setEnabled(true);
    actionBtns.forEach((b) => (b.disabled = false));
    timer.start();
    speak(line('timeToDraw'));
  }

  function markCorrect() {
    if (!playing) return;
    timer.pause();
    let picked = -1;
    const modal = openModal({
      title: 'Which team guessed it?',
      body: h('div', { class: 'dg-team-pick' },
        teamNames.map((name, i) =>
          h('button', { type: 'button', class: 'dg-team-btn en', style: { '--team': TEAM_COLORS[i] }, 'data-team': i, onClick: () => {
            picked = i;
            modal.close();
          } }, name))),
      actions: [{ label: 'Back', variant: 'ghost' }],
      onClose: () => {
        if (picked >= 0) {
          scoreboard.add(picked, 1);
          endRound(picked, `${teamNames[picked]} +1`);
        } else if (playing) {
          timer.resume();
        }
      },
    });
  }

  function timeUp() {
    if (playing) endRound(null, "Time's up");
  }

  function endRound(team, title) {
    playing = false;
    timer.stop();
    board.setEnabled(false);
    peekEl.textContent = '';
    actionBtns.forEach((b) => (b.disabled = true));
    playSound(team == null ? 'wrong' : 'correct');
    if (team != null) confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 }, disableForReducedMotion: true });
    const word = secret.word;
    // Hết lượt mới được hiện đáp án.
    showOverlay(
      h('div', { class: 'dg-card', 'data-testid': 'dg-round-end' },
        h('p', { class: 'dg-card-title en' }, title),
        h('p', { class: 'dg-card-text en' }, 'The word was'),
        h('p', { class: 'dg-answer en' }, word),
        h('div', { class: 'dg-card-actions' },
          button({ label: 'Listen', iconName: 'volume', size: 'lg', onClick: () => speak(word) }),
          button({ label: 'Next round', iconName: 'play', variant: 'primary', size: 'lg', onClick: nextRound, attrs: { 'data-testid': 'dg-next' } }))),
    );
    const lead = team != null ? line('correct') : title === "Time's up" ? line('timesUp') : null;
    (lead ? speak(lead) : Promise.resolve(true))
      .then(() => !playing && secret && secret.word === word && speak(line('wordWas')))
      .then(() => !playing && secret && secret.word === word && speak(word));
  }

  function finishGame() {
    playing = false;
    if (timer) timer.stop();
    if (board) board.destroy();
    board = null;
    const ranking = scoreboard.ranking();
    const tie = ranking[0].score === ranking[1].score;
    setStage(resultsScreen({ title: tie ? "It's a tie" : `${ranking[0].name} team wins`, ranking, unit: ' pts', onReplay: showSetup }));
    playSound('win');
    confetti({ particleCount: 160, spread: 90, origin: { y: 0.6 }, disableForReducedMotion: true });
  }

  function showQr() {
    if (!secret || !playing) return;
    const box = h('div', { class: 'dg-qr', 'data-testid': 'dg-qr-code', innerHTML: qrSvg(secret.word) });
    openModal({
      title: 'Scan with the teacher phone',
      body: h('div', { class: 'dg-qr-body' }, box, h('p', { class: 'muted' }, 'Mở camera điện thoại giáo viên, quét mã để xem từ. Đưa điện thoại cho học sinh vẽ.')),
      actions: [{ label: 'Close', variant: 'primary' }],
    });
  }

  function showOverlay(node) {
    overlay.textContent = '';
    overlay.append(node);
    overlay.hidden = false;
  }

  function hideOverlay() {
    overlay.hidden = true;
    overlay.textContent = '';
  }

  function cleanupRound() {
    playing = false;
    secret = null;
    if (timer) timer.stop();
    if (board) board.destroy();
    board = null;
  }

  showSetup();

  return {
    destroy() {
      cleanupRound();
      confetti.reset();
      frame.destroy();
    },
  };
}

let instance = null;

export default {
  id: 'draw-guess',
  title: 'Draw & Guess',
  needsCamera: false,
  minItems: { vocab: 5 },
  group: 'class',
  icon: 'brush',
  description: 'Vẽ từ bí mật, cả lớp đoán bằng tiếng Anh.',
  ready: true,

  mount(rootEl, content) {
    instance = createGame(rootEl, content);
  },

  unmount() {
    if (instance) instance.destroy();
    instance = null;
  },
};
