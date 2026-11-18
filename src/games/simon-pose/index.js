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
import { RF, judgePair } from '../../core/reframe.js';
import { createFrameLock, createGrabber } from '../../core/frame-lock.js';
import { attachFrameLockUi } from '../../core/frame-lock-ui.js';
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

// Nhận diện người (PLAN-SIMON-FIX.md): bộ theo dõi v2 cho Simon. Ghi đè bằng URL (trước hoặc sau #) để chỉnh trên máy thật:
// sp_dedup=0|1 sp_confirm=N sp_excl=K sp_jump=K sp_lost=ms sp_filter=ema|euro sp_np=N sp_det=x sp_pres=x
// Hành vi cũ: &sp_dedup=0&sp_confirm=1&sp_excl=0&sp_jump=99&sp_filter=ema&sp_lost=900
const SQ = new URLSearchParams(location.search + '&' + (location.hash.split('?')[1] || ''));
const spNum = (k, d) => (SQ.has(k) && SQ.get(k) !== '' && !Number.isNaN(Number(SQ.get(k))) ? Number(SQ.get(k)) : d);
const SP_TRACK = {
  dedupe: SQ.get('sp_dedup') !== '0',
  confirmFrames: spNum('sp_confirm', 5),
  exclusionK: spNum('sp_excl', 1.3),
  jumpK: spNum('sp_jump', 0.6),
  filter: SQ.get('sp_filter') === 'ema' ? 'ema' : 'euro',
  lostMs: spNum('sp_lost', 2000),
  staleMs: 250,
};
const SP_NP = Math.max(1, Math.min(8, Math.round(spNum('sp_np', 5)))); // số pose tối đa MediaPipe dò (mặc định 5, chưa đổi)
const SEEN_MS = 800; // chỉ người đã ổn định >= 0,8 s mới lên bảng điểm
const REC_MAX = 1200; // vòng đệm ghi landmark (~60 s)
const STALE_ALPHA = 0.35;

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
  const shownId = [null, null, null]; // id người của khung xương đang vẽ (không trượt từ người này sang người khác)
  const lastOwner = [null, null, null]; // id cuối cùng của mỗi ô, để đếm số lần đổi chủ
  let ownerChanges = 0;
  let rec = []; // ghi landmark thô (?diag=sp&sprec=1), phím R tải về
  let hzAt = 0;
  let hzN = 0;
  let hz = 0;
  let onKey = null;
  let seen = new Set(); // chỗ đã từng có người chơi trong ván
  let detectorModel = null;
  let tracker = null;
  let lastVideoTime = -1;
  // dò camera tự đổi khung (KHÓA KHUNG: frame-lock.js bọc reframe.js; viền + biểu ngữ + đếm số lần)
  const fl = createFrameLock({ enabled: REFRAME });
  const grabSmall = createGrabber();
  let rfSmall = null;
  const rfPrev = new Float32Array(RF.DW * RF.DH);
  let flDetach = () => {};
  let rw = null;
  let rfLastGrab = 0;
  let pauseAt = 0;
  let rfLockWarned = false;
  const DIAG = PERF.diag === 'sp';
  const REC = DIAG && SQ.get('sprec') === '1';
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
      frameLock: fl,
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
    shownId.fill(null);
    lastOwner.fill(null);
    ownerChanges = 0;
    rec = [];
    tracker = createPoseTracker({ maxPlayers: opts.count, zone: ZONES[opts.zone], ...SP_TRACK });
    rw = fl.enabled ? fl : null;
    fl.reset();
    fl.resetCount();
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
    flDetach();
    flDetach = attachFrameLockUi(videoBox, fl);
    const camBtn = button({ label: t('cam.off'), iconName: 'camera', attrs: { 'data-testid': 'cam-toggle' } });
    camBtn.addEventListener('click', async () => {
      if (session.active) {
        stopLoop();
        clearTimers();
        session.stop();
        round = null;
        tracker.lockJoins(false);
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
      // Nhận diện tối đa SP_NP (mặc định 5) người rồi chọn người chơi; người thừa hiện mờ.
      detector ||= await createPoseDetector({ numPoses: SP_NP, model: opts.model, minDet: spNum('sp_det', 0.55), minPres: spNum('sp_pres', 0.5) });
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

  // Chỗ đang hiện trên bảng điểm: chỉ người đã ổn định >= SEEN_MS (seen), kể cả khi họ vừa rời khung.
  function slotsShown() {
    const list = [];
    for (let i = 0; i < opts.count; i++) if (seen.has(i)) list.push(i);
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
      tracker.lockJoins(true); // trong lượt chấm: không nhận người mới (khoá người chơi)
      round.start = performance.now();
      round.end = round.start + WINDOW_MS;
    });
  }

  function endRound(skipped = false) {
    const r = round;
    if (tracker) tracker.lockJoins(false); // giữa các lượt người mới được vào
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
    setStage(resultsScreen({ title: 'Simon Says: results', ranking, unit: ' pts', onReplay: () => startGame(), note: fl.enabled ? t('cam.lock.count', { n: fl.count }) : null }));
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
          rfSmall = grabSmall(v);
          onReframe(rw.push(rfSmall, now), now);
        }
        // window.__spInject: hook cho test/phát lại (hàm now -> danh sách landmark); không dùng khi chơi thật.
        const inj = window.__spInject;
        const res = typeof inj === 'function' ? { landmarks: inj(now) || [] } : detector ? detector.detect(v, now) : null;
        if (res) {
          if (REC) recordFrame(now, res.landmarks || []);
          // Bộ theo dõi: chọn người chơi trong vùng, giữ đúng số Player, làm mịn toạ độ.
          const tr = tracker.update(res.landmarks || [], now);
          players = tr.players;
          others = tr.others;
          players.forEach((p, i) => {
            if (!p) return;
            if (lastOwner[i] !== null && lastOwner[i] !== p.id) ownerChanges++;
            lastOwner[i] = p.id;
            if (p.fresh && now - p.since >= SEEN_MS) seen.add(i);
          });
          update(now);
        }
      }
      fl.tick(now);
      draw(); // vẽ cả lúc AI đang nạp: vùng chơi (nếu chọn) hiện ngay từ đầu, không "bó vào" sau
    };
    raf = requestAnimationFrame(tick);
  }

  function recordFrame(now, list) {
    const r4 = (n) => Math.round(n * 1e4) / 1e4;
    rec.push({ t: Math.round(now), list: list.map((lm) => lm.map((q) => ({ x: r4(q.x), y: r4(q.y), visibility: r4(q.visibility ?? 1) }))) });
    if (rec.length > REC_MAX) rec.shift();
    window.__spRec = rec;
  }

  function downloadRec() {
    const blob = new Blob([JSON.stringify({ frames: rec, video: [session.video.videoWidth, session.video.videoHeight] })], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `simon-rec-${Date.now()}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function stopLoop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function onReframe(o, now) {
    if (o.started) {
      pauseAt = now;
      tracker.hold(true);
      shown.fill(null);
      if (round) round.hold = [0, 0, 0];
      view.videoBox.dataset.reframe = 'true';
      if (o.repeated && !rfLockWarned) {
        rfLockWarned = true;
        toast(t('cam.autoframe.lock'), 'info', 9000);
      }
    }
    if (o.ended) {
      // Phép biến đổi tổng (trước -> sau) nếu đo được: ghép lại Player theo chỗ dự đoán; không thì theo thứ tự trái -> phải.
      const j = judgePair(rfPrev, rfSmall || rfPrev);
      const tf = j.kind === 'shift' && j.fit ? { k: j.fit.k, dx: j.fit.tx / RF.DW, dy: j.fit.ty / RF.DH } : null;
      tracker.reanchor(tf);
      shown.fill(null);
      delete view.videoBox.dataset.reframe;
      const r = round;
      if (r && r.start && !r.result && r.paused < PAUSE_MAX_MS) r.end = Math.max(r.end, now + AFTER_STABLE_MS);
    }
    if (!o.moving && rfSmall) rfPrev.set(rfSmall); // ảnh ổn định gần nhất (trước lúc đổi khung)
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
        shownId[i] = null;
        return;
      }
      // Vẽ khung xương trượt dần tới kết quả AI mới nhất ở mọi khung hình (60 fps),
      // nên AI nhận diện 15–20 lần/giây vẫn thấy chuyển động liền mạch.
      // Trượt gắn theo id: đổi người (hoặc nhảy > 1 vai) thì bắt đầu lại, không trộn hai bộ xương.
      let prev = shownId[i] === p.id ? shown[i] : null;
      shownId[i] = p.id;
      if (prev && prev[11] && prev[12] && p.lm[11] && p.lm[12]) {
        const dx = (prev[11].x + prev[12].x - p.lm[11].x - p.lm[12].x) / 2;
        const dy = (prev[11].y + prev[12].y - p.lm[11].y - p.lm[12].y) / 2;
        if (Math.hypot(dx, dy) > (p.size || 0.1)) prev = null;
      }
      const lm = (shown[i] = p.lm.map((q, k) => {
        const o = prev && prev[k];
        return o ? { ...q, x: o.x + (q.x - o.x) * 0.45, y: o.y + (q.y - o.y) * 0.45 } : q;
      }));
      const ok = round && round.matched[i];
      if (p.stale) {
        // Mất người (quá staleMs không có dữ liệu mới): vẽ mờ, không nhãn; hết lostMs thì biến mất.
        ctx.globalAlpha = STALE_ALPHA;
        drawSkeleton(ctx, lm, { width: dw, height: dh, color: TEAM_COLORS[i], lineWidth: Math.max(4, dw / 180) });
        ctx.globalAlpha = 1;
        return;
      }
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
      const di = detector ? detector.info() : null;
      if (di) {
        const dtH = (hudAt - hzAt) / 1000;
        if (hzAt && dtH > 0) hz = Math.round((di.results - hzN) / dtH);
        hzN = di.results;
        hzAt = hudAt;
      }
      const ts = tracker ? tracker.stats() : null;
      const aiLine = di && ts
        ? `AI ${di.model} t${di.tier} ${di.delegate || ''} ${di.ms} ms ${hz} Hz · np ${SP_NP} · thô ${ts.raw} → ${ts.kept} (gộp tổng ${ts.mergedTotal}) · loại ${ts.excluded} · chờ ${ts.pending} · nhảy-chặn ${ts.jumpRejected} · vào ${ts.joins} · đổi chủ ô ${ownerChanges}\n` // i18n-keep: HUD chẩn đoán
          + `${ts.slots.map((s, i) => `P${i + 1} ${s ? `id${s.id} ${s.age}s` : '–'}`).join(' · ')}${REC ? ` · ghi ${rec.length} khung (phím R)` : ''}\n` // i18n-keep: HUD chẩn đoán
        : '';
      hud.textContent = aiLine + (st
        ? `đổi khung ${st.events} · ${st.moving ? 'ĐANG ĐỔI' : 'ổn định'} · ổn định sau ${st.lastSettleMs} ms · ncc ${st.ncc.toFixed(2)}\n` // i18n-keep: HUD chẩn đoán
          + `Player ${players.map((p) => (p ? p.id : '-')).join(' ')} · dừng lượt ${round ? Math.round(round.paused) : 0} ms · video ${session.video.videoWidth}x${session.video.videoHeight}` // i18n-keep: HUD chẩn đoán
        : 'reframe=0');
    }
  }

  if (REC) {
    onKey = (e) => { if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !/INPUT|TEXTAREA/.test((e.target && e.target.tagName) || '')) downloadRec(); };
    window.addEventListener('keydown', onKey);
  }

  showSetup();

  return {
    // Cho test tự động.
    debug: () => ({
      zone: opts.zone,
      reframing: Boolean(rw && rw.moving),
      lock: fl.state,
      reframes: fl.count,
      rf: rw ? rw.stats() : null,
      players: players.map((p) => (p ? p.id : null)),
      stale: players.map((p) => (p ? p.stale : null)),
      seen: [...seen],
      board: view ? view.board.children.length : 0,
      ownerChanges,
      tracker: tracker ? tracker.stats() : null,
      round: round ? { end: round.end, paused: round.paused, result: round.result } : null,
    }),
    destroy() {
      stopLoop();
      clearTimers();
      flDetach();
      if (onKey) window.removeEventListener('keydown', onKey);
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
