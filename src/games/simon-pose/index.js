// Simon Says Pose — 1-3 học sinh đứng cách camera 2-3 mét. "Simon says" + làm đúng tư thế trong 4 giây: +1.
// Không có "Simon says" mà vẫn làm: -1. MediaPipe Pose (tối đa 5 người, bộ theo dõi chọn người chơi trong vùng chơi), giữ đúng 0.5 giây mới tính. Đặc tả: docs/GAMES_SPEC.md
import './style.css';
import confetti from 'canvas-confetti';
import { playSound, speak } from '../../core/audio.js';
import { cameraSetupScreen, createCameraSession } from '../../core/camera.js';
import { createPoseDetector, drawSkeleton } from '../../core/vision.js';
import { TEAM_COLORS, button, createGameFrame, h, resultsScreen, segmented, toast } from '../../core/ui.js';
import { gameArt } from '../../core/art.js';
import { icon } from '../../core/icons.js';
import { line } from '../../core/voice-lines.js';
import { POSES, commandText } from './poses.js';
import { createPoseTracker } from '../../core/pose-tracker.js';

// Vùng chơi theo màn hình gương: chỉ người đứng trong vùng mới được tính.
const ZONES = { full: [0, 1], middle: [0.15, 0.85], narrow: [0.25, 0.75] };
// Tư thế cần thấy chân: tự bỏ khi camera chỉ thấy nửa người.
const LEG_POSES = new Set(['one-leg', 'squat']);
const GRACE_MS = 220; // mất nhận diện chớp nhoáng không huỷ lượt giữ tư thế

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
  const opts = { rounds: 10, poses: new Set(POSES.map((p) => p.id)), simonRate: 0.7, zone: 'middle', count: 3, model: 'full' };
  let detector = null;
  let raf = 0;
  let timers = [];
  let view = null;
  let round = null;
  let roundNo = 0;
  let scores = [0, 0, 0];
  let players = [null, null, null]; // chỗ Player 1..3 (bộ theo dõi giữ đúng người)
  let others = []; // người không được tính (đứng xa / ngoài vùng chơi)
  const shown = [null, null, null]; // khung xương đang vẽ (trượt dần tới kết quả AI)
  let seen = new Set(); // chỗ đã từng có người chơi trong ván
  let detectorModel = null;
  let tracker = null;
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
        { label: 'Số học sinh chơi cùng lúc', control: segmented([1, 2, 3].map((n) => ({ value: n, label: String(n) })), opts.count, (v) => (opts.count = v), 'sp-count') },
        { label: 'Vùng chơi (lớp đông nên chọn Giữa hoặc Hẹp)', control: segmented([{ value: 'full', label: 'Cả khung' }, { value: 'middle', label: 'Giữa' }, { value: 'narrow', label: 'Hẹp' }], opts.zone, (v) => (opts.zone = v), 'sp-zone'),
          hint: 'Chỉ tính các bạn đứng trong vùng chơi và gần camera nhất. Các bạn phía sau hiện khung xương mờ, không bị tính điểm.' },
        { label: 'Độ chính xác nhận diện', control: segmented([{ value: 'full', label: 'Chính xác (khuyên dùng)' }, { value: 'lite', label: 'Nhanh (máy yếu)' }], opts.model, (v) => (opts.model = v), 'sp-model') },
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
    players = [null, null, null];
    others = [];
    seen = new Set();
    tracker = createPoseTracker({ maxPlayers: opts.count, zone: ZONES[opts.zone] });
    const overlay = h('canvas', { class: 'sp-overlay' });
    const videoBox = h('div', { class: 'sp-video' }, session.video, overlay);
    const command = h('div', { class: 'sp-command en', 'data-testid': 'sp-command' });
    const tip = h('div', { class: 'sp-tip en', 'data-testid': 'sp-tip', hidden: true });
    const bar = h('div', { class: 'sp-bar' }, h('span'));
    const board = h('div', { class: 'sp-board' });
    const controls = h('div', { class: 'sp-controls' });
    const loading = h('div', { class: 'sp-loading', 'data-testid': 'sp-loading' }, 'Loading AI model…');
    videoBox.append(loading);
    view = { overlay, videoBox, command, bar, board, controls, loading, tip };
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
    setStage(h('div', { class: 'sp-play' }, h('div', { class: 'sp-top' }, command, tip, bar), videoBox, h('div', { class: 'sp-bottom' }, board, controls)));
    renderBoard();
    try {
      if (detector && detectorModel !== opts.model) {
        detector.close();
        detector = null;
      }
      // Nhận diện tối đa 5 người rồi chọn người chơi; người thừa hiện mờ.
      detector ||= await createPoseDetector({ numPoses: 5, model: opts.model });
      detectorModel = opts.model;
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

  // Chỗ đang hiện trên bảng điểm: có người, hoặc đã từng chơi trong ván.
  function slotsShown() {
    const list = [];
    for (let i = 0; i < opts.count; i++) if (players[i] || seen.has(i)) list.push(i);
    return list.length ? list : [0];
  }

  function renderBoard() {
    view.board.textContent = '';
    for (const i of slotsShown()) {
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
    let pool = POSES.filter((p) => opts.poses.has(p.id));
    // Camera không thấy chân của ai đó (đứng nửa người / quá gần): bỏ lệnh cần chân ở lượt này.
    const active = players.filter(Boolean);
    const legsOk = !active.length || active.every((p) => p.legs);
    const noLegs = pool.filter((p) => !LEG_POSES.has(p.id));
    const skippedLegs = !legsOk && noLegs.length < pool.length && noLegs.length > 0;
    if (skippedLegs) pool = noLegs;
    view.tip.hidden = !skippedLegs;
    view.tip.textContent = skippedLegs ? 'Step back so the camera can see your feet!' : '';
    const pose = pool[Math.floor(Math.random() * pool.length)];
    const simon = Math.random() < opts.simonRate;
    round = { pose, simon, start: 0, end: 0, hold: [0, 0, 0], lastOk: [0, 0, 0], matched: [false, false, false], result: null };
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
    r.result = [];
    for (const i of slotsShown()) {
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
    const ranking = slotsShown().map((index) => ({ name: PLAYER_NAMES[index], index, score: scores[index] })).sort((a, b) => b.score - a.score);
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
        const res = detector.detect(v, now);
        if (!res) return;
        // Bộ theo dõi: chọn người chơi trong vùng, giữ đúng số Player, làm mịn toạ độ.
        const t = tracker.update(res.landmarks || [], now);
        players = t.players;
        others = t.others;
        players.forEach((p, i) => p && seen.add(i));
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
    players.forEach((p, i) => {
      if (!p || r.matched[i]) return;
      if (p.fresh && r.pose.check(p.lm)) {
        if (!r.hold[i]) r.hold[i] = now;
        r.lastOk[i] = now;
        if (now - r.hold[i] >= HOLD_MS) {
          r.matched[i] = true;
          if (r.simon) playSound('pop');
        }
      } else if (now - r.lastOk[i] > GRACE_MS) {
        r.hold[i] = 0; // chỉ huỷ khi sai tư thế lâu hơn một chớp mắt
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
    // Vùng chơi: làm tối phần ngoài vùng.
    const [z0, z1] = ZONES[opts.zone];
    if (z0 > 0 || z1 < 1) {
      ctx.fillStyle = 'rgba(20, 22, 40, 0.45)';
      ctx.fillRect(0, 0, z0 * dw, dh);
      ctx.fillRect(z1 * dw, 0, (1 - z1) * dw, dh);
      ctx.setLineDash([14, 10]);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.strokeRect(z0 * dw, 2, (z1 - z0) * dw, dh - 4);
      ctx.setLineDash([]);
    }
    // Người không được tính: khung xương mờ.
    others.forEach((lm) => drawSkeleton(ctx, lm, { width: dw, height: dh, color: 'rgba(255, 255, 255, 0.35)', lineWidth: Math.max(3, dw / 300) }));
    players.forEach((p, i) => {
      if (!p) {
        shown[i] = null;
        return;
      }
      // Vẽ khung xương trượt dần tới kết quả AI mới nhất ở mọi khung hình (60 fps),
      // nên AI nhận diện 15–20 lần/giây vẫn thấy chuyển động liền mạch.
      const prev = shown[i];
      const lm = (shown[i] = p.lm.map((q, k) => {
        const o = prev && prev[k];
        return o ? { ...q, x: o.x + (q.x - o.x) * 0.45, y: o.y + (q.y - o.y) * 0.45 } : q;
      }));
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
    if (slotsShown().length !== view.board.children.length && !(round && round.result)) renderBoard();
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
  theme: 'meadow',
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
