// Simon Says Pose — 1-3 học sinh đứng cách camera 2-3 mét. "Simon says" + làm đúng tư thế trong 4 giây: +1.
// Không có "Simon says" mà vẫn làm: -1. MediaPipe Pose (tối đa 5 người, bộ theo dõi chọn người chơi trong vùng chơi), giữ đúng 0.5 giây mới tính. Đặc tả: docs/GAMES_SPEC.md
import './style.css';
import confetti from 'canvas-confetti';
import { PERF } from '../../core/perf.js';
import { confettiLite } from '../../core/fx.js';
import { playSound, speak } from '../../core/audio.js';
import { cameraSetupScreen, createCameraSession } from '../../core/camera.js';
import { createPoseDetector, drawSkeleton } from '../../core/vision.js';
import { TEAM_COLORS, button, createGameFrame, h, resultsScreen, segmented, toast } from '../../core/ui.js';
import { gameArt } from '../../core/art.js';
import { icon } from '../../core/icons.js';
import { line } from '../../core/voice-lines.js';
import { POSES, commandText } from './poses.js';
import { createPoseTracker } from '../../core/pose-tracker.js';
import { RF, createReframeWatch, judgePair } from '../../core/reframe.js';
import { t, addStrings } from '../../i18n/index.js';
import VI from '../../i18n/strings/camera-guide.vi.js';

addStrings('camera-guide', VI);

// Vùng chơi theo màn hình gương: chỉ người đứng trong vùng mới được tính.
const ZONES = { full: [0, 1], middle: [0.15, 0.85], narrow: [0.25, 0.75] };
// Tư thế cần thấy chân: tự bỏ khi camera chỉ thấy nửa người.
const LEG_POSES = new Set(['one-leg', 'squat']);
const GRACE_MS = 220; // mất nhận diện chớp nhoáng không huỷ lượt giữ tư thế
// Camera AI (S1) tự đổi khung: tạm dừng chấm, giữ Player, kéo dài lượt tối đa PAUSE_MAX_MS. ?reframe=0 tắt. PLAN-S1-REFRAME.md.
const REFRAME = !/[?&#]reframe=0\b/.test(location.href);
const PAUSE_MAX_MS = 3000;
const AFTER_STABLE_MS = 1500; // sau khi khung ổn định còn ít nhất 1,5 s để làm tư thế
const RF_GRAB_MS = 66; // lấy ảnh 64x36 để dò đổi khung tối đa ~15 lần/giây
const RF_TOAST_GAP_MS = 10000;

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
  // zone mặc định 'full': không vẽ khung vùng chơi (khung nét đứt trắng hiện ra lúc AI nạp xong là cái "khung trắng bó vào").
  const opts = { rounds: 10, poses: new Set(POSES.map((p) => p.id)), simonRate: 0.7, zone: 'full', count: 3, model: 'full' };
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
  // dò camera tự đổi khung
  const rfCanvas = document.createElement('canvas');
  rfCanvas.width = RF.DW * 2;
  rfCanvas.height = RF.DH * 2;
  let rfCtx = null;
  const rfSmall = new Float32Array(RF.DW * RF.DH);
  const rfPrev = new Float32Array(RF.DW * RF.DH);
  let rw = null;
  let rfLastGrab = 0;
  let pauseAt = 0;
  let rfToastAt = -Infinity;
  let rfLockWarned = false;
  const DIAG = PERF.diag === 'sp';
  let hud = null;
  let hudAt = 0;

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
      hint: `${t('game.simon.camHint')} ${t('cam.autoframe.hint')}`,
      extraRows: [
        { label: t('game.simon.poses'), control: poseBoxes },
        { label: t('game.simon.rounds'), control: segmented([6, 10, 15].map((n) => ({ value: n, label: String(n) })), opts.rounds, (v) => (opts.rounds = v), 'sp-rounds') },
        { label: t('game.simon.players'), control: segmented([1, 2, 3].map((n) => ({ value: n, label: String(n) })), opts.count, (v) => (opts.count = v), 'sp-count') },
        { label: t('game.simon.zone'), control: segmented([{ value: 'full', label: t('game.simon.zone.full') }, { value: 'middle', label: t('game.simon.zone.mid') }, { value: 'narrow', label: t('game.simon.zone.narrow') }], opts.zone, (v) => (opts.zone = v), 'sp-zone'),
          hint: t('game.simon.zoneHint') },
        { label: t('game.simon.accuracy'), control: segmented([{ value: 'full', label: t('game.simon.acc.high') }, { value: 'lite', label: t('game.simon.acc.fast') }], opts.model, (v) => (opts.model = v), 'sp-model') },
      ],
      onReady: () => {
        if (opts.poses.size < 2) {
          toast(t('game.simon.needPoses'), 'error');
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
    rw = REFRAME ? createReframeWatch() : null;
    pauseAt = 0;
    const overlay = h('canvas', { class: 'sp-overlay' });
    // Tip nằm ĐÈ trong khung video (không chiếm hàng riêng): hiện/ẩn tip không làm khung video co lại.
    const tip = h('div', { class: 'sp-tip en', 'data-testid': 'sp-tip', hidden: true });
    hud = DIAG ? h('pre', { class: 'sp-hud', 'data-testid': 'sp-hud' }) : null;
    const videoBox = h('div', { class: 'sp-video', 'data-testid': 'sp-video' }, session.video, overlay, tip, hud);
    const command = h('div', { class: 'sp-command en', 'data-testid': 'sp-command' });
    const bar = h('div', { class: 'sp-bar' }, h('span'));
    const board = h('div', { class: 'sp-board' });
    const controls = h('div', { class: 'sp-controls' });
    const loading = h('div', { class: 'sp-loading', 'data-testid': 'sp-loading' }, 'Loading AI model…');
    videoBox.append(loading);
    view = { overlay, videoBox, command, bar, board, controls, loading, tip };
    const camBtn = button({ label: t('cam.off'), iconName: 'camera', attrs: { 'data-testid': 'cam-toggle' } });
    camBtn.addEventListener('click', async () => {
      if (session.active) {
        stopLoop();
        clearTimers();
        session.stop();
        round = null;
        command.textContent = 'Camera off';
        camBtn.querySelector('span').textContent = t('cam.on');
      } else {
        await session.start().catch(() => toast(t('cam.reopenFail'), 'error'));
        camBtn.querySelector('span').textContent = t('cam.off');
        startLoop();
        nextRound();
      }
    });
    frame.extra.textContent = '';
    frame.extra.append(camBtn);
    setStage(h('div', { class: 'sp-play' }, h('div', { class: 'sp-top' }, command, bar), videoBox, h('div', { class: 'sp-bottom' }, board, controls)));
    renderBoard();
    startLoop(); // vẽ khung + dò đổi khung ngay cả lúc AI đang nạp
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
      loading.append(icon('alert', 40), h('strong', {}, t('cam.ai.fail')),
        h('span', {}, t('cam.ai.failHint')));
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
    round = { pose, simon, start: 0, end: 0, hold: [0, 0, 0], lastOk: [0, 0, 0], matched: [false, false, false], result: null, paused: 0, lastNow: 0 };
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

  function endRound(skipped = false) {
    const r = round;
    r.result = [];
    if (skipped) {
      // Camera đổi khung quá lâu trong lượt: không cộng, không trừ ai.
      for (const i of slotsShown()) r.result[i] = 'miss';
      view.command.textContent = 'Camera moved – next one!';
      renderBoard();
      later(nextRound, 2200);
      return;
    }
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
    confetti({ particleCount: Math.round(150 * PERF.confetti), spread: 90, origin: { y: 0.6 }, disableForReducedMotion: true, ...confettiLite() });
  }

  // ---------- Vòng nhận diện ----------
  function startLoop() {
    cancelAnimationFrame(raf);
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const v = session.video;
      if (!session.active || v.readyState < 2) return;
      if (v.currentTime !== lastVideoTime) {
        lastVideoTime = v.currentTime;
        if (rw && now - rfLastGrab >= RF_GRAB_MS) {
          rfLastGrab = now;
          onReframe(rw.push(grabSmall(v), now), now);
        }
        const res = detector ? detector.detect(v, now) : null;
        if (res) {
          // Bộ theo dõi: chọn người chơi trong vùng, giữ đúng số Player, làm mịn toạ độ.
          const tr = tracker.update(res.landmarks || [], now);
          players = tr.players;
          others = tr.others;
          players.forEach((p, i) => p && seen.add(i));
          update(now);
        }
      }
      draw(); // vẽ cả lúc AI đang nạp: vùng chơi (nếu chọn) hiện ngay từ đầu, không "bó vào" sau
    };
    raf = requestAnimationFrame(tick);
  }

  function stopLoop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  // Ảnh xám 64x36 (chưa gương, cùng hệ toạ độ với landmark) cho bộ dò đổi khung. ~0,3 ms.
  function grabSmall(v) {
    rfCtx ||= rfCanvas.getContext('2d', { willReadFrequently: true });
    rfCtx.drawImage(v, 0, 0, rfCanvas.width, rfCanvas.height);
    const d = rfCtx.getImageData(0, 0, rfCanvas.width, rfCanvas.height).data;
    const W2 = rfCanvas.width;
    for (let y = 0; y < RF.DH; y++) {
      for (let x = 0; x < RF.DW; x++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          const i = (((y * 2 + (k >> 1)) * W2) + x * 2 + (k & 1)) * 4;
          sum += (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
        }
        rfSmall[y * RF.DW + x] = sum / 4;
      }
    }
    return rfSmall;
  }

  function onReframe(o, now) {
    if (o.started) {
      pauseAt = now;
      tracker.hold(true);
      shown.fill(null);
      if (round) round.hold = [0, 0, 0];
      view.videoBox.dataset.reframe = 'true';
      if (now - rfToastAt > RF_TOAST_GAP_MS) {
        rfToastAt = now;
        toast(t('game.simon.reframe.wait'), 'info', 2500);
      }
      if (o.repeated && !rfLockWarned) {
        rfLockWarned = true;
        toast(t('cam.autoframe.lock'), 'info', 9000);
      }
    }
    if (o.ended) {
      // Phép biến đổi tổng (trước -> sau) nếu đo được: ghép lại Player theo chỗ dự đoán; không thì theo thứ tự trái -> phải.
      const j = judgePair(rfPrev, rfSmall);
      const tf = j.kind === 'shift' && j.fit ? { k: j.fit.k, dx: j.fit.tx / RF.DW, dy: j.fit.ty / RF.DH } : null;
      tracker.reanchor(tf);
      shown.fill(null);
      delete view.videoBox.dataset.reframe;
      const r = round;
      if (r && r.start && !r.result && r.paused < PAUSE_MAX_MS) r.end = Math.max(r.end, now + AFTER_STABLE_MS);
    }
    if (!o.moving) rfPrev.set(rfSmall); // ảnh ổn định gần nhất (trước lúc đổi khung)
  }

  function update(now) {
    const r = round;
    if (!r || r.result || !r.start) return;
    const dt = r.lastNow ? Math.min(100, now - r.lastNow) : 0;
    r.lastNow = now;
    if (rw && rw.moving) {
      // Camera đang đổi khung: không chấm, không phạt; dừng đồng hồ tối đa PAUSE_MAX_MS.
      if (r.paused < PAUSE_MAX_MS) {
        r.end += dt;
        r.paused += dt;
      } else if (now >= r.end) endRound(true);
      return;
    }
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
    // Vùng chơi (chỉ khi giáo viên chọn Giữa/Hẹp): làm tối nhẹ phần ngoài vùng, vạch mảnh, vẽ ngay từ đầu.
    const [z0, z1] = ZONES[opts.zone];
    if (z0 > 0 || z1 < 1) {
      ctx.fillStyle = 'rgba(20, 22, 40, 0.3)';
      ctx.fillRect(0, 0, z0 * dw, dh);
      ctx.fillRect(z1 * dw, 0, (1 - z1) * dw, dh);
      ctx.setLineDash([10, 10]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.moveTo(z0 * dw, 0); ctx.lineTo(z0 * dw, dh);
      ctx.moveTo(z1 * dw, 0); ctx.lineTo(z1 * dw, dh);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (rw && rw.moving) {
      ctx.font = `800 ${Math.round(dw / 36)}px 'Plus Jakarta Sans', sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(28, 31, 37, 0.8)';
      ctx.strokeText('Camera moving… wait', dw / 2, dh * 0.22);
      ctx.fillStyle = '#fff';
      ctx.fillText('Camera moving… wait', dw / 2, dh * 0.22);
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
    if (hud && performance.now() - hudAt > 500) {
      hudAt = performance.now();
      const st = rw ? rw.stats() : null;
      hud.textContent = st
        ? `đổi khung ${st.events} · ${st.moving ? 'ĐANG ĐỔI' : 'ổn định'} · ổn định sau ${st.lastSettleMs} ms · ncc ${st.ncc.toFixed(2)}\n` // i18n-keep: HUD chẩn đoán
          + `Player ${players.map((p) => (p ? p.id : '-')).join(' ')} · dừng lượt ${round ? Math.round(round.paused) : 0} ms · video ${session.video.videoWidth}x${session.video.videoHeight}` // i18n-keep: HUD chẩn đoán
        : 'reframe=0';
    }
  }

  showSetup();

  return {
    // Cho test tự động.
    debug: () => ({
      zone: opts.zone,
      reframing: Boolean(rw && rw.moving),
      rf: rw ? rw.stats() : null,
      players: players.map((p) => (p ? p.id : null)),
      round: round ? { end: round.end, paused: round.paused, result: round.result } : null,
    }),
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
  get description() { return t('game.simon.desc'); },
  ready: true,

  mount(rootEl, content) {
    instance = createGame(rootEl, content);
    window.__simonPose = instance;
  },

  unmount() {
    if (instance) instance.destroy();
    instance = null;
    delete window.__simonPose;
  },
};
