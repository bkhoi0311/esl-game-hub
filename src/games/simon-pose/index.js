// Simon Says Pose — 1-3 học sinh đứng cách camera 2-3 mét. "Simon says" + làm đúng tư thế trong 4 giây: +1.
// Không có "Simon says" mà vẫn làm: -1. MediaPipe Pose (numPoses 3), giữ đúng 0.5 giây mới tính. Đặc tả: docs/GAMES_SPEC.md
import './style.css';
import confetti from 'canvas-confetti';
import { playSound, speak } from '../../core/audio.js';
import { cameraSetupScreen, createCameraSession, createFpsMonitor } from '../../core/camera.js';
import { createPoseDetector, drawSkeleton } from '../../core/vision.js';
import { TEAM_COLORS, button, createGameFrame, h, resultsScreen, segmented, toast } from '../../core/ui.js';
import { gameArt } from '../../core/art.js';
import { icon } from '../../core/icons.js';
import { line } from '../../core/voice-lines.js';
import { POSES, commandText } from './poses.js';

const WINDOW_MS = 4000;
const HOLD_MS = 500;
const PLAYER_NAMES = ['Player 1', 'Player 2', 'Player 3'];

const HOW_TO = {
  title: 'How to play',
  text: 'Listen carefully.',
  steps: ['"Simon says…": do it and hold.', 'No "Simon says": do not move.', 'Stand 2-3 metres from the camera.'],
};

function createGame(root) {
  const session = createCameraSession();
  const opts = { rounds: 10, poses: new Set(POSES.map((p) => p.id)), simonRate: 0.7 };
  let detector = null;
  let raf = 0;
  let timers = [];
  let view = null;
  let round = null;
  let roundNo = 0;
  let scores = [0, 0, 0];
  let players = []; // landmarks theo thứ tự trái -> phải trên màn hình
  let lastVideoTime = -1;

  const frame = createGameFrame(root, {
    title: 'Simon Says Pose',
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
    round = null;
    frame.extra.textContent = '';
    frame.setPaused(false);
    const poseBoxes = h('div', { class: 'sp-poses' },
      POSES.map((p) =>
        h('label', { class: 'sp-pose' },
          h('input', { type: 'checkbox', checked: opts.poses.has(p.id), onChange: (e) => (e.target.checked ? opts.poses.add(p.id) : opts.poses.delete(p.id)) }),
          h('span', { class: 'en' }, p.text))));
    setStage(cameraSetupScreen({
      session,
      title: 'Simon Says Pose',
      art: gameArt('simon-pose'),
      hint: '1-3 học sinh đứng cách camera 2-3 mét, camera thấy toàn thân (cả bàn chân).',
      extraRows: [
        { label: 'Tư thế dùng trong bài', control: poseBoxes },
        { label: 'Số lượt', control: segmented([6, 10, 15].map((n) => ({ value: n, label: String(n) })), opts.rounds, (v) => (opts.rounds = v), 'sp-rounds') },
      ],
      onReady: () => {
        if (opts.poses.size < 2) {
          toast('Chọn ít nhất 2 tư thế.', 'error');
          return;
        }
        startGame();
      },
    }));
  }

  async function startGame() {
    roundNo = 0;
    scores = [0, 0, 0];
    const overlay = h('canvas', { class: 'sp-overlay' });
    const videoBox = h('div', { class: 'sp-video' }, session.video, overlay);
    const command = h('div', { class: 'sp-command en', 'data-testid': 'sp-command' });
    const bar = h('div', { class: 'sp-bar' }, h('span'));
    const board = h('div', { class: 'sp-board' });
    const controls = h('div', { class: 'sp-controls' });
    const loading = h('div', { class: 'sp-loading', 'data-testid': 'sp-loading' }, 'Loading AI model…');
    videoBox.append(loading);
    view = { overlay, videoBox, command, bar, board, controls, loading };
    const camBtn = button({ label: 'Tắt camera', iconName: 'camera', attrs: { 'data-testid': 'cam-toggle' } });
    camBtn.addEventListener('click', async () => {
      if (session.active) {
        stopLoop();
        clearTimers();
        session.stop();
        round = null;
        command.textContent = 'Camera off';
        camBtn.querySelector('span').textContent = 'Bật camera';
      } else {
        await session.start().catch(() => toast('Không bật lại được camera.', 'error'));
        camBtn.querySelector('span').textContent = 'Tắt camera';
        startLoop();
        nextRound();
      }
    });
    frame.extra.textContent = '';
    frame.extra.append(camBtn);
    setStage(h('div', { class: 'sp-play' }, h('div', { class: 'sp-top' }, command, bar), videoBox, h('div', { class: 'sp-bottom' }, board, controls)));
    renderBoard();
    try {
      detector ||= await createPoseDetector({ numPoses: 3 });
    } catch (err) {
      loading.textContent = '';
      loading.append(icon('alert', 40), h('strong', {}, 'Không nạp được model AI'),
        h('span', {}, 'Cần mạng Internet lần đầu, hoặc mở app qua server local (npm run dev / npm run preview) để dùng model lưu sẵn.'));
      loading.classList.add('error');
      console.error(err);
      return;
    }
    loading.remove();
    startLoop();
    command.textContent = 'Get ready!';
    later(nextRound, 1500);
  }

  function renderBoard() {
    const n = Math.max(1, players.length);
    view.board.textContent = '';
    for (let i = 0; i < n; i++) {
      const res = round && round.result ? round.result[i] : null;
      view.board.append(h('div', { class: `sp-player${res ? ' ' + res : ''}`, style: { '--team': TEAM_COLORS[i] } },
        h('span', { class: 'en' }, PLAYER_NAMES[i]), h('strong', { class: 'en' }, String(scores[i]))));
    }
  }

  function nextRound() {
    clearTimers();
    if (roundNo >= opts.rounds) {
      finish();
      return;
    }
    roundNo += 1;
    const pool = POSES.filter((p) => opts.poses.has(p.id));
    const pose = pool[Math.floor(Math.random() * pool.length)];
    const simon = Math.random() < opts.simonRate;
    round = { pose, simon, start: 0, end: 0, hold: [0, 0, 0], matched: [false, false, false], result: null };
    const text = commandText(pose, simon);
    view.command.textContent = text;
    view.command.dataset.simon = String(simon);
    view.controls.textContent = '';
    view.bar.firstChild.style.width = '100%';
    speak(text).then(() => {
      if (!round || round.pose !== pose) return;
      round.start = performance.now();
      round.end = round.start + WINDOW_MS;
    });
  }

  function endRound() {
    const r = round;
    const n = Math.max(1, players.length);
    r.result = [];
    for (let i = 0; i < n; i++) {
      if (r.simon) {
        if (r.matched[i]) scores[i] += 1;
        r.result[i] = r.matched[i] ? 'good' : 'miss';
      } else {
        if (r.matched[i]) scores[i] = Math.max(0, scores[i] - 1);
        r.result[i] = r.matched[i] ? 'bad' : 'good';
      }
    }
    const anyBad = r.result.includes('bad');
    playSound(r.result.every((x) => x === 'good') ? 'correct' : 'wrong');
    view.command.textContent = r.simon ? (r.result.includes('good') ? 'Well done!' : 'Too slow!') : anyBad ? "Simon didn't say!" : 'Good listening!';
    renderBoard();
    later(nextRound, 2200);
  }

  function finish() {
    stopLoop();
    const n = Math.max(1, players.length);
    const ranking = PLAYER_NAMES.slice(0, n).map((name, index) => ({ name, index, score: scores[index] })).sort((a, b) => b.score - a.score);
    setStage(resultsScreen({ title: 'Simon Says: results', ranking, unit: ' pts', onReplay: () => startGame() }));
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
      if (v.currentTime !== lastVideoTime) {
        lastVideoTime = v.currentTime;
        fps.tick(now);
        const res = detector.detect(v, now);
        if (!res) return;
        // Sắp xếp người theo vị trí trên màn hình gương (trái -> phải) = Player 1, 2, 3.
        players = (res.landmarks || []).slice().sort((a, b) => (1 - a[0].x) - (1 - b[0].x));
        update(now);
      }
      draw();
    };
    raf = requestAnimationFrame(tick);
  }

  function stopLoop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function update(now) {
    const r = round;
    if (!r || r.result || !r.start) return;
    view.bar.firstChild.style.width = `${Math.max(0, (r.end - now) / WINDOW_MS) * 100}%`;
    players.forEach((lm, i) => {
      if (i > 2 || r.matched[i]) return;
      if (r.pose.check(lm)) {
        if (!r.hold[i]) r.hold[i] = now;
        if (now - r.hold[i] >= HOLD_MS) {
          r.matched[i] = true;
          if (r.simon) playSound('pop');
        }
      } else {
        r.hold[i] = 0;
      }
    });
    if (now >= r.end) endRound();
  }

  function draw() {
    const { overlay, videoBox } = view;
    const w = videoBox.clientWidth;
    const hgt = videoBox.clientHeight;
    if (overlay.width !== w || overlay.height !== hgt) {
      overlay.width = w;
      overlay.height = hgt;
    }
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, w, hgt);
    const vw = session.video.videoWidth || 16;
    const vh = session.video.videoHeight || 9;
    const scale = Math.min(w / vw, hgt / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    ctx.save();
    ctx.translate((w - dw) / 2, (hgt - dh) / 2);
    players.forEach((lm, i) => {
      if (i > 2) return;
      const ok = round && round.matched[i];
      drawSkeleton(ctx, lm, { width: dw, height: dh, color: ok ? '#04bc09' : TEAM_COLORS[i], lineWidth: Math.max(4, dw / 180) });
      const nose = lm[0];
      const x = (1 - nose.x) * dw;
      const y = Math.max(30, nose.y * dh - dh * 0.12);
      ctx.font = `800 ${Math.round(dw / 40)}px 'Plus Jakarta Sans', sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#fff';
      ctx.strokeText(PLAYER_NAMES[i], x, y);
      ctx.fillStyle = TEAM_COLORS[i];
      ctx.fillText(PLAYER_NAMES[i], x, y);
    });
    ctx.restore();
    if (players.length !== view.board.children.length && !(round && round.result)) renderBoard();
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
  id: 'simon-pose',
  title: 'Simon Says Pose',
  needsCamera: true,
  minItems: 0,
  group: 'camera',
  icon: 'hand',
  description: 'Nghe lệnh, làm đúng tư thế: bộ phận cơ thể, trái/phải.',
  ready: true,

  mount(rootEl, content) {
    instance = createGame(rootEl, content);
  },

  unmount() {
    if (instance) instance.destroy();
    instance = null;
  },
};
