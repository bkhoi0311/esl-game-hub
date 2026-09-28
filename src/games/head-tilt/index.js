// Head Tilt Quiz — câu hỏi ở trên, 2 đáp án 2 bên; nghiêng đầu quá 15 độ và giữ 0.4 giây để chọn.
// 1-2 học sinh đứng gần camera (dưới 1.5 mét). MediaPipe Face Landmarker. Đặc tả: docs/GAMES_SPEC.md
import './style.css';
import confetti from 'canvas-confetti';
import { playSound, speak } from '../../core/audio.js';
import { cameraSetupScreen, createCameraSession, createFpsMonitor } from '../../core/camera.js';
import { createFaceDetector } from '../../core/vision.js';
import { getQuestions, shuffle } from '../../core/content.js';
import { TEAM_COLORS, button, createGameFrame, h, resultsScreen, toast } from '../../core/ui.js';
import { gameArt } from '../../core/art.js';
import { icon } from '../../core/icons.js';
import { line } from '../../core/voice-lines.js';
import { TILT_DEG, createTiltTracker, rollDegrees, twoChoice } from './logic.js';

const QUESTIONS = 10;
const QUESTION_MS = 6000;
const PLAYER_NAMES = ['Player 1', 'Player 2'];

const HOW_TO = {
  title: 'How to play',
  text: 'Tilt your head to choose.',
  steps: ['Read the question.', 'Tilt your head to the left or right answer.', 'Hold it for a moment.'],
};

function createGame(root, pack) {
  const session = createCameraSession();
  const questionsAll = getQuestions(pack);
  let detector = null;
  let raf = 0;
  let timers = [];
  let view = null;
  let faces = []; // [{ deg, cx }]
  let trackers = [createTiltTracker(), createTiltTracker()];
  let q = null;
  let qIndex = 0;
  let list = [];
  let scores = [0, 0];
  let lastVideoTime = -1;

  const frame = createGameFrame(root, {
    title: 'Head Tilt Quiz',
    howTo: HOW_TO,
    onPause: () => stopLoop(),
    onResume: () => view && startLoop(),
    onRestart: () => showSetup(),
  });
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const clearTimers = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };
  const setStage = (...nodes) => {
    frame.stage.textContent = '';
    frame.stage.append(...nodes);
  };
  const fps = createFpsMonitor({
    onSlow: async (f) => {
      toast(`Máy xử lý chậm (${Math.round(f)} khung/giây). Đang giảm độ phân giải camera.`, 'error', 5000);
      await session.lowerResolution().catch(() => {});
    },
  });

  function showSetup() {
    stopLoop();
    clearTimers();
    view = null;
    q = null;
    frame.extra.textContent = '';
    frame.setPaused(false);
    setStage(cameraSetupScreen({
      session,
      title: 'Head Tilt Quiz',
      art: gameArt('head-tilt'),
      hint: `1-2 học sinh đứng gần camera (dưới 1,5 mét), thấy rõ mặt. ${QUESTIONS} câu, mỗi câu 6 giây. Câu 3 đáp án chỉ lấy đáp án đúng + 1 đáp án sai.`,
      onReady: startGame,
    }));
  }

  async function startGame() {
    qIndex = 0;
    scores = [0, 0];
    list = shuffle(questionsAll).slice(0, QUESTIONS);
    const prompt = h('div', { class: 'ht-prompt en', 'data-testid': 'ht-prompt' });
    const bar = h('div', { class: 'sp-bar' }, h('span'));
    const left = h('div', { class: 'ht-answer left', 'data-testid': 'ht-left' });
    const right = h('div', { class: 'ht-answer right', 'data-testid': 'ht-right' });
    const loading = h('div', { class: 'sp-loading' }, 'Loading AI model…');
    const videoBox = h('div', { class: 'ht-video' }, session.video, loading);
    const meters = h('div', { class: 'ht-meters' });
    const status = h('div', { class: 'imp-status en' });
    view = { prompt, bar, left, right, videoBox, meters, status, loading };
    const camBtn = button({ label: 'Tắt camera', iconName: 'camera', attrs: { 'data-testid': 'cam-toggle' } });
    camBtn.addEventListener('click', async () => {
      if (session.active) {
        stopLoop();
        clearTimers();
        session.stop();
        q = null;
        prompt.textContent = 'Camera off';
        camBtn.querySelector('span').textContent = 'Bật camera';
      } else {
        await session.start().catch(() => toast('Không bật lại được camera.', 'error'));
        camBtn.querySelector('span').textContent = 'Tắt camera';
        startLoop();
        nextQuestion();
      }
    });
    frame.extra.textContent = '';
    frame.extra.append(status, camBtn);
    setStage(h('div', { class: 'ht-play' },
      h('div', { class: 'ht-top' }, prompt, bar),
      h('div', { class: 'ht-middle' }, left, videoBox, right),
      meters));
    renderStatus();
    try {
      detector ||= await createFaceDetector({ numFaces: 2 });
    } catch (err) {
      loading.textContent = '';
      loading.append(icon('alert', 40), h('strong', {}, 'Không nạp được model AI'),
        h('span', {}, 'Cần mạng Internet lần đầu, hoặc mở app qua server local để dùng model lưu sẵn.'));
      loading.classList.add('error');
      console.error(err);
      return;
    }
    loading.remove();
    startLoop();
    nextQuestion();
  }

  function renderStatus() {
    view.status.textContent = `Question ${Math.min(qIndex + 1, QUESTIONS)} / ${list.length}  ·  ` + PLAYER_NAMES.map((n, i) => `P${i + 1}: ${scores[i]}`).join('  ');
  }

  function nextQuestion() {
    clearTimers();
    if (qIndex >= list.length) {
      finish();
      return;
    }
    const src = list[qIndex];
    const choice = twoChoice(src);
    q = { src, ...choice, picks: [null, null], start: 0, end: 0, done: false };
    trackers.forEach((t) => t.reset());
    view.prompt.textContent = src.prompt;
    [view.left, view.right].forEach((el) => {
      el.className = `ht-answer ${el === view.left ? 'left' : 'right'}`;
      el.textContent = '';
    });
    view.left.append(h('span', { class: 'ht-arrow' }, '◀'), h('span', { class: 'ht-text en' }, choice.left), h('span', { class: 'ht-picks' }));
    view.right.append(h('span', { class: 'ht-text en' }, choice.right), h('span', { class: 'ht-arrow' }, '▶'), h('span', { class: 'ht-picks' }));
    renderStatus();
    speak(src.prompt).then(() => {
      if (!q || q.src !== src) return;
      q.start = performance.now();
      q.end = q.start + QUESTION_MS;
    });
    // Không chờ mãi nếu máy không đọc được.
    later(() => {
      if (q && q.src === src && !q.start) {
        q.start = performance.now();
        q.end = q.start + QUESTION_MS;
      }
    }, 4000);
  }

  function pick(player, side) {
    if (!q || q.done || q.picks[player]) return;
    q.picks[player] = side;
    playSound('pop');
    const el = side === 'left' ? view.left : view.right;
    el.querySelector('.ht-picks').append(h('span', { class: 'ht-chip en', style: { '--team': TEAM_COLORS[player] } }, `P${player + 1}`));
    const n = Math.max(1, Math.min(2, faces.length));
    if (q.picks.slice(0, n).every(Boolean)) reveal();
  }

  function reveal() {
    if (q.done) return;
    q.done = true;
    const correctEl = q.correct === 'left' ? view.left : view.right;
    const wrongEl = q.correct === 'left' ? view.right : view.left;
    correctEl.classList.add('correct');
    wrongEl.classList.add('wrong');
    let anyRight = false;
    q.picks.forEach((p, i) => {
      if (p === q.correct) {
        scores[i] += 1;
        anyRight = true;
      }
    });
    playSound(anyRight ? 'correct' : 'wrong');
    speak(line(anyRight ? 'correct' : 'tryAgain'));
    qIndex += 1;
    renderStatus();
    later(nextQuestion, 2200);
  }

  function finish() {
    stopLoop();
    const n = Math.max(1, Math.min(2, faces.length || 1));
    const ranking = PLAYER_NAMES.slice(0, n).map((name, index) => ({ name, index, score: scores[index] })).sort((a, b) => b.score - a.score);
    setStage(resultsScreen({ title: 'Head Tilt Quiz: results', ranking, unit: ` / ${list.length}`, onReplay: () => startGame() }));
    playSound('win');
    speak(line('greatJob'));
    confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 }, disableForReducedMotion: true });
  }

  // ---------- Vòng nhận diện ----------
  function startLoop() {
    cancelAnimationFrame(raf);
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const v = session.video;
      if (!detector || !session.active || v.readyState < 2) return;
      if (v.currentTime === lastVideoTime) return;
      lastVideoTime = v.currentTime;
      fps.tick(now);
      const res = detector.detect(v, now);
      if (!res) return;
      faces = (res.faceLandmarks || [])
        .map((lm) => ({ deg: rollDegrees(lm), cx: 1 - lm[1].x }))
        .sort((a, b) => a.cx - b.cx)
        .slice(0, 2);
      faces.forEach((f, i) => {
        const side = trackers[i].update(f.deg, now);
        if (side && q && q.start && !q.done) pick(i, side);
      });
      if (q && q.start && !q.done) {
        view.bar.firstChild.style.width = `${Math.max(0, (q.end - now) / QUESTION_MS) * 100}%`;
        if (now >= q.end) reveal();
      }
      renderMeters();
    };
    raf = requestAnimationFrame(tick);
  }

  function stopLoop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  // Thanh chỉ báo góc nghiêng cho mỗi học sinh.
  function renderMeters() {
    const m = view.meters;
    while (m.children.length < Math.max(1, faces.length)) {
      const i = m.children.length;
      m.append(h('div', { class: 'ht-meter', style: { '--team': TEAM_COLORS[i] }, 'data-testid': `ht-meter-${i}` },
        h('span', { class: 'ht-meter-name en' }, PLAYER_NAMES[i]),
        h('div', { class: 'ht-track' },
          h('span', { class: 'ht-zone left' }), h('span', { class: 'ht-zone right' }), h('span', { class: 'ht-center' }), h('span', { class: 'ht-needle' })),
        h('span', { class: 'ht-deg en' }, '0°')));
    }
    while (m.children.length > Math.max(1, faces.length)) m.lastChild.remove();
    [...m.children].forEach((el, i) => {
      const f = faces[i];
      const deg = f ? f.deg : 0;
      const clamped = Math.max(-40, Math.min(40, deg));
      el.querySelector('.ht-needle').style.left = `${50 + (clamped / 40) * 50}%`;
      el.querySelector('.ht-deg').textContent = f ? `${Math.round(deg)}°` : 'No face';
      el.dataset.side = deg > TILT_DEG ? 'right' : deg < -TILT_DEG ? 'left' : 'none';
    });
  }

  showSetup();

  return {
    destroy() {
      stopLoop();
      clearTimers();
      session.stop();
      if (detector) detector.close();
      detector = null;
      confetti.reset();
      frame.destroy();
    },
  };
}

let instance = null;

export default {
  id: 'head-tilt',
  title: 'Head Tilt Quiz',
  needsCamera: true,
  minItems: { questions: 10 },
  group: 'camera',
  theme: 'garden',
  icon: 'scan-face',
  description: 'Nghiêng đầu chọn 1 trong 2 đáp án.',
  ready: true,

  mount(rootEl, content) {
    instance = createGame(rootEl, content);
  },

  unmount() {
    if (instance) instance.destroy();
    instance = null;
  },
};
