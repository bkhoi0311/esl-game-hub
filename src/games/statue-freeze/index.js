// Statue Freeze — đèn xanh làm theo lệnh, đèn đỏ đứng im. So sánh khung hình (KHÔNG dùng AI, KHÔNG nhận diện từng
// học sinh): chỉ tô đỏ vùng có chuyển động để giáo viên nhìn. Thuật toán v2 nằm ở motion.js (thuần, có test);
// ?sf=v1 chạy lại bản cũ để A/B, ?diag=sf hiện HUD. Đặc tả: docs/GAMES_SPEC.md, PLAN-GAMES-V2.md mục 4.
import './style.css';
import { playSound, speak } from '../../core/audio.js';
import { cameraSetupScreen, createCameraSession } from '../../core/camera.js';
import { PERF } from '../../core/perf.js';
import { button, createGameFrame, createScoreboard, h, segmented, stepper, toast } from '../../core/ui.js';
import { gameArt } from '../../core/art.js';
import { line } from '../../core/voice-lines.js';
import { shuffle } from '../../core/content.js';
import { mountPhaser } from '../shared/phaser-host.js';
import { makeStatueScene } from './statue-scene.js';
import { SF, boxDown2, createDetector, createLegacyDetector, rgbaToGray } from './motion.js';
import { t, addStrings } from '../../i18n/index.js';
import VI from '../../i18n/strings/camera-guide.vi.js';

addStrings('camera-guide', VI);

const MODE = /[?&#]sf=v1\b/.test(location.href) ? 'v1' : 'v2';
const REFRAME = !/[?&#]reframe=0\b/.test(location.href); // ?reframe=0: tắt xử lý camera tự đổi khung (PLAN-S1-REFRAME.md)
const CAL_MAX_MS = 9000; // camera đổi khung liên tục: chờ tối đa 9 s rồi chốt hiệu chỉnh (không tô xám)
const RED_EXTEND_MAX_MS = 4000; // pha Freeze được kéo dài tối đa 4 s khi camera đổi khung
const RED_AFTER_STABLE_MS = SF.REF_MS + 2000; // sau khi khung ổn định còn ít nhất ~2,2 s để đo lại
const RECAL_MIN_GAP_MS = 15000; // vùng xám cũ bị bỏ vì đổi khung: tự đo lại trước lượt sau, không quá 1 lần / 15 s
const RF_TOAST_GAP_MS = 10000;
const MEASURE_V1_MS = 66; // bản cũ đo mỗi 66 ms trong rAF, không kiểm khung mới (giữ nguyên để A/B)
const RED_TOTAL_MS = SF.GRACE_MS + SF.REF_MS + SF.MEASURE_MS;

const HOW_TO = {
  title: 'How to play',
  text: 'Green light: do the action. Red light: freeze!',
  steps: ['Listen to the command.', 'Red light: stand still for 3 seconds.', 'Red boxes show movement.'],
};

function createGame(root, pack) {
  const session = createCameraSession();
  const detector = MODE === 'v1' ? createLegacyDetector({ sensitivity: 6 }) : createDetector({ sensitivity: 6, reframe: REFRAME });
  const teams = (pack.teams || ['Red', 'Blue']).slice(0, 2);
  const opts = { sensitivity: 6, auto: false, lanes: 1 };
  let raf = 0;
  let vfc = 0;
  let timers = [];
  let phase = 'idle'; // calibrate | green | red | review | idle
  let phaseEnd = 0;
  let redStart = 0;
  let commands = [];
  let roundNo = 0;
  let view = null;
  let lastLanes = [0, 0];
  let lastAreas = 0;
  let scoreboard = null;
  let lastCount = '';
  // camera tự đổi khung (S1)
  let calStart = 0;
  let lastCalAt = -Infinity;
  let redExtended = 0;
  let lastTickAt = 0;
  let rfWasMoving = false;
  let rfToastAt = -Infinity;
  let rfLockWarned = false;
  let lastInterrupted = false;
  // lấy khung
  const cvs = document.createElement('canvas');
  let cvsMode = 'box'; // box: vẽ 512x288 rồi trung bình 2x2 | direct: vẽ thẳng 256x144 (máy yếu)
  let ctx = null;
  let grabMs = 0;
  let grabBad = 0;
  let lastPresented = -1;
  let lastProc = 0;
  let lastVfcAt = 0;
  let lastVT = -1;
  let srcName = 'rVFC';
  const counters = { dup: 0, skip: 0 };
  let lastMeasureV1 = 0;

  const frame = createGameFrame(root, {
    title: 'Statue Freeze',
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

  // ---------- Cài đặt + chọn camera ----------
  function showSetup() {
    stopLoop();
    clearTimers();
    if (view && view.phaser) view.phaser.game.destroy(true);
    view = null;
    scoreboard = null;
    phase = 'idle';
    frame.extra.textContent = '';
    frame.setPaused(false);
    setStage(cameraSetupScreen({
      session,
      title: 'Statue Freeze',
      art: gameArt('statue-freeze'),
      hint: `${t('game.statue.camHint')} ${t('cam.autoframe.hint')}`,
      extraRows: [
        { label: t('game.statue.after'), control: segmented([{ value: false, label: t('game.statue.after.teacher') }, { value: true, label: t('game.statue.after.auto') }], opts.auto, (v) => (opts.auto = v), 'sf-auto') },
        {
          label: t('game.statue.teams'),
          control: segmented([{ value: 1, label: t('game.statue.teams.class') }, { value: 2, label: t('game.statue.teams.two') }], opts.lanes, (v) => (opts.lanes = v), 'sf-lanes'),
          hint: t('game.statue.teamsHint', { left: teams[0], right: teams[1] }),
        },
      ],
      onReady: startGame,
    }));
  }

  // ---------- Màn chơi ----------
  function startGame() {
    commands = shuffle(pack.actionCommands);
    roundNo = 0;
    detector.setSensitivity(opts.sensitivity);
    const overlay = h('div', { class: 'sf-overlay', 'data-testid': 'sf-overlay' });
    const face = (mood) => `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="34" cy="44" r="7" fill="#1c1f25"/><circle cx="66" cy="44" r="7" fill="#1c1f25"/><circle cx="36" cy="42" r="2.4" fill="#fff"/><circle cx="68" cy="42" r="2.4" fill="#fff"/>${mood === 'stop' ? '<ellipse cx="50" cy="68" rx="9" ry="10" fill="#1c1f25"/>' : '<path d="M34 64q16 16 32 0" fill="none" stroke="#1c1f25" stroke-width="6" stroke-linecap="round"/>'}<circle cx="22" cy="60" r="6" fill="#ff7aa8" opacity=".6"/><circle cx="78" cy="60" r="6" fill="#ff7aa8" opacity=".6"/></svg>`;
    const light = h('div', { class: 'sf-light', 'data-testid': 'sf-light' },
      h('span', { class: 'sf-bulb red', innerHTML: face('stop') }), h('span', { class: 'sf-bulb green', innerHTML: face('go') }));
    const banner = h('div', { class: 'sf-banner en', 'data-testid': 'sf-banner' });
    const sub = h('div', { class: 'sf-sub en' });
    const count = h('div', { class: 'sf-count', 'data-testid': 'sf-count', hidden: true });
    const controls = h('div', { class: 'sf-controls' });
    const hud = PERF.diag === 'sf' ? h('pre', { class: 'sf-hud', 'data-testid': 'sf-hud' }) : null;
    const videoBox = h('div', { class: 'sf-video' }, session.video, overlay, count, hud);
    view = { overlay, light, banner, sub, count, controls, videoBox, hud };

    const sens = stepper({
      value: opts.sensitivity, min: 1, max: 10, step: 1, testId: 'sf-sensitivity', label: t('game.statue.sens.lower'),
      onChange: (v) => { opts.sensitivity = v; detector.setSensitivity(v); },
    });
    const camBtn = button({ label: t('cam.off'), iconName: 'camera', attrs: { 'data-testid': 'cam-toggle' } });
    camBtn.addEventListener('click', async () => {
      if (session.active) {
        stopLoop();
        clearTimers();
        session.stop();
        phase = 'idle';
        phaseEnd = 0;
        setBanner('Camera off', t('game.statue.camOffHint'));
        camBtn.querySelector('span').textContent = t('cam.on');
      } else {
        await session.start().catch(() => toast(t('cam.reopenFail'), 'error'));
        camBtn.querySelector('span').textContent = t('cam.off');
        startLoop();
        calibrate();
      }
    });
    frame.extra.textContent = '';
    scoreboard = null;
    if (opts.lanes === 2) {
      scoreboard = createScoreboard(teams, { controls: true });
      scoreboard.el.classList.add('sf-scores');
      [...scoreboard.el.querySelectorAll('.score-value')].forEach((el, i) => el.setAttribute('data-testid', `sf-score-${i}`));
    }
    frame.extra.append(h('div', { class: 'sf-sens', role: 'group', 'aria-label': t('game.statue.sens') }, h('span', {}, t('game.statue.sens')), sens), camBtn);

    setStage(h('div', { class: 'sf-play' },
      videoBox,
      h('div', { class: 'sf-side' }, scoreboard ? scoreboard.el : null, light, banner, sub, controls)));
    startLoop();
    calibrate();
    // Lớp phủ Phaser: đọc trạng thái mỗi khung hình để vẽ.
    const my = view;
    mountPhaser(overlay, makeStatueScene, {
      teams,
      getState: () => ({
        phase,
        flagged: detector.flagged,
        live: detector.live,
        masked: detector.masked,
        lanes: opts.lanes,
        grace: phase === 'red' && performance.now() < redStart + SF.GRACE_MS,
        version: detector.version,
        cols: SF.CELLS_X,
        rows: SF.CELLS_Y,
        vw: session.video.videoWidth || 16,
        vh: session.video.videoHeight || 9,
      }),
    }, 'resize').then((p) => {
      if (view !== my) p.game.destroy(true);
      else view.phaser = p;
    });
  }

  function setBanner(text, subText = '') {
    view.banner.textContent = text;
    view.sub.textContent = subText;
  }

  function setLight(color) {
    view.light.dataset.color = color;
    view.videoBox.dataset.color = color;
    view.light.dataset.phase = phase;
  }

  function setControls(...nodes) {
    view.controls.textContent = '';
    view.controls.append(...nodes);
  }

  function calibrate() {
    clearTimers();
    phase = 'calibrate';
    view.count.hidden = true;
    setLight('off');
    setBanner('Stand still', 'Checking the camera for 3 seconds…');
    setControls();
    speak(line('standStill'));
    const now = performance.now();
    calStart = now;
    lastCalAt = now;
    detector.setSensitivity(opts.sensitivity);
    detector.startCalibration(now);
    lastProc = 0;
    phaseEnd = now + SF.CAL_MS;
  }

  function finishCalibration() {
    const q = detector.finishCalibration();
    if (q.bigBlobs > 0) toast(t('game.statue.cal.someMoved'));
    else if (q.masked > 0) toast(t('game.statue.cal.masked', { n: q.masked }));
    else if (q.movingFrac > 0.25) toast(t('game.statue.cal.manyMoved'));
    nextGreen();
  }

  function nextGreen() {
    clearTimers();
    // Camera đã đổi khung làm vùng xám cũ sai chỗ: đo lại (Stand still) trước lượt này.
    if (detector.needRecal && performance.now() - lastCalAt > RECAL_MIN_GAP_MS) {
      calibrate();
      return;
    }
    if (!commands.length) commands = shuffle(pack.actionCommands);
    const cmd = commands.shift();
    roundNo += 1;
    phase = 'green';
    detector.setIdle();
    view.count.hidden = true;
    setLight('green');
    setBanner(cmd, `Round ${roundNo}`);
    setControls();
    playSound('pop');
    speak(cmd);
    phaseEnd = performance.now() + 3000 + Math.random() * 5000;
  }

  function startRed() {
    phase = 'red';
    const now = performance.now();
    redStart = now;
    redExtended = 0;
    detector.startRed(now);
    lastCount = '';
    setLight('red');
    setBanner('Freeze!', 'Stand still for 3 seconds.');
    speak(line('freeze'));
    phaseEnd = now + RED_TOTAL_MS;
  }

  function finishRed() {
    phase = 'review';
    view.light.dataset.phase = phase;
    const r = detector.endRed();
    lastInterrupted = Boolean(r.interrupted);
    if (r.interrupted) {
      // Camera đổi khung gần hết lượt: không đủ thời gian đo, không tính lượt (không phạt ai).
      lastLanes = [0, 0];
      lastAreas = 0;
      view.count.hidden = false;
      view.count.textContent = 'Camera moved';
      view.count.dataset.good = 'false';
      playSound('pop');
      setBanner('Camera moved', "Let's try that again.");
      toast(t('game.statue.reframe.round'), 'info', 6000);
      setControls(
        button({ label: 'Next command', iconName: 'play', variant: 'primary', size: 'lg', onClick: nextGreen, attrs: { 'data-testid': 'sf-next' } }),
        button({ label: 'Check again (stand still)', iconName: 'refresh', onClick: calibrate }),
      );
      if (opts.auto) later(nextGreen, 4000);
      return;
    }
    lastLanes = r.lanes;
    lastAreas = r.areas;
    const n = r.areas;
    view.count.hidden = false;
    view.count.textContent = n ? `${n} moving area${n > 1 ? 's' : ''}` : 'Perfect statues!';
    view.count.dataset.good = String(!n);
    playSound(n ? 'wrong' : 'win');
    if (!n) speak(line('greatJob'));
    let subText = n ? 'Look at the red boxes.' : 'Nobody moved.';
    if (opts.lanes === 2 && scoreboard) {
      [0, 1].forEach((i) => { if (r.lanes[i] === 0) scoreboard.add(i, 1); });
      subText = [0, 1].map((i) => `${teams[i]}: ${r.lanes[i] ? `${r.lanes[i]} moving` : 'Perfect!'}`).join(' · ');
    }
    setBanner(n ? 'Who moved?' : 'Great job!', subText);
    setControls(
      button({ label: 'Next command', iconName: 'play', variant: 'primary', size: 'lg', onClick: nextGreen, attrs: { 'data-testid': 'sf-next' } }),
      button({ label: 'Check again (stand still)', iconName: 'refresh', onClick: calibrate }),
    );
    if (opts.auto) later(nextGreen, 4000);
  }

  // ---------- Lấy khung + vòng xử lý ----------
  // Vẽ gương, chuyển xám, thu nhỏ về 256x144 (trung bình 2x2 khi chế độ box). Chỉ gọi khi có khung camera mới.
  function grab(video) {
    const t0 = performance.now();
    const w = cvsMode === 'box' ? SF.SAMPLE_W * 2 : SF.SAMPLE_W;
    const hh = cvsMode === 'box' ? SF.SAMPLE_H * 2 : SF.SAMPLE_H;
    if (!ctx || cvs.width !== w) {
      cvs.width = w;
      cvs.height = hh;
      ctx = cvs.getContext('2d', { willReadFrequently: true });
      if (cvsMode === 'direct') ctx.imageSmoothingQuality = 'medium';
    }
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, hh);
    ctx.restore();
    const data = ctx.getImageData(0, 0, w, hh).data;
    let gray = rgbaToGray(data, w * hh);
    if (cvsMode === 'box') gray = boxDown2(gray, w, hh);
    const ms = performance.now() - t0;
    grabMs = grabMs ? grabMs * 0.9 + ms * 0.1 : ms;
    // Máy yếu: > 6 ms kéo dài thì bỏ bước 512 (ghi BUILD-NOTES-GAMES-V2).
    if (cvsMode === 'box' && grabMs > 6) {
      if (++grabBad > 20) { cvsMode = 'direct'; ctx = null; grabBad = 0; }
    } else grabBad = 0;
    return gray;
  }

  function processFrame(now) {
    if (!session.active || session.video.readyState < 2) return;
    if (now - lastProc < SF.PROCESS_MIN_GAP_MS) { counters.skip++; return; }
    lastProc = now;
    detector.push(grab(session.video), now);
  }

  function startLoop() {
    stopLoop();
    const video = session.video;
    const useVfc = MODE === 'v2' && typeof video.requestVideoFrameCallback === 'function';
    lastVfcAt = performance.now();
    srcName = useVfc ? 'rVFC' : 'raf';
    const onFrame = (now, meta) => {
      vfc = video.requestVideoFrameCallback(onFrame);
      lastVfcAt = performance.now();
      if (meta && meta.presentedFrames === lastPresented) { counters.dup++; return; }
      lastPresented = meta ? meta.presentedFrames : -1;
      if (srcName === 'rVFC') processFrame(now);
    };
    if (useVfc) vfc = video.requestVideoFrameCallback(onFrame);
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (!session.active || session.video.readyState < 2) return;
      if (MODE === 'v1') {
        if (now - lastMeasureV1 >= MEASURE_V1_MS) { lastMeasureV1 = now; processFrame(now); lastProc = 0; }
      } else if (useVfc && srcName === 'rVFC' && now - lastVfcAt > 1000) {
        srcName = 'raf'; // rVFC im lặng quá 1 s (CEF OSR): đo trong rAF khi currentTime đổi
      } else if (srcName === 'raf' && video.currentTime !== lastVT) {
        lastVT = video.currentTime;
        processFrame(now);
      } else if (srcName === 'raf' && useVfc && now - lastVfcAt < 300) {
        srcName = 'rVFC';
      }
      watchReframe(now);
      draw(now);
      if (phaseEnd && now >= phaseEnd) {
        if (phase === 'calibrate') {
          // Chỉ chốt khi đã đo đủ 3 s trên khung ổn định (hoặc đã chờ quá CAL_MAX_MS).
          if (!detector.calReady || detector.calReady(now) || now - calStart >= CAL_MAX_MS) {
            phaseEnd = 0;
            finishCalibration();
          } else phaseEnd = now + 100;
        } else {
          phaseEnd = 0;
          if (phase === 'green') startRed();
          else if (phase === 'red') finishRed();
        }
      }
    };
    raf = requestAnimationFrame(tick);
  }

  function stopLoop() {
    cancelAnimationFrame(raf);
    raf = 0;
    if (vfc && session.video.cancelVideoFrameCallback) session.video.cancelVideoFrameCallback(vfc);
    vfc = 0;
  }

  // Camera tự đổi khung: kéo dài pha Freeze, báo giáo viên, nhắc khoá khung khi lặp lại.
  function watchReframe(now) {
    const moving = Boolean(detector.reframing);
    const dt = lastTickAt ? Math.min(100, now - lastTickAt) : 0;
    lastTickAt = now;
    if (phase === 'red' && phaseEnd) {
      if (moving && redExtended < RED_EXTEND_MAX_MS) {
        phaseEnd += dt;
        redExtended += dt;
      }
      if (rfWasMoving && !moving) phaseEnd = Math.max(phaseEnd, Math.min(redStart + RED_TOTAL_MS + RED_EXTEND_MAX_MS, now + RED_AFTER_STABLE_MS));
    }
    if (moving === rfWasMoving) return;
    rfWasMoving = moving;
    view.videoBox.dataset.reframe = String(moving);
    if (moving) {
      if (phase === 'calibrate' || phase === 'red') view.sub.textContent = 'Camera is moving… stay still';
      if (now - rfToastAt > RF_TOAST_GAP_MS) {
        rfToastAt = now;
        toast(t('game.statue.reframe.wait'), 'info', 2500);
      }
      const rf = detector.stats().rf;
      if (rf && rf.recent >= 3 && !rfLockWarned) {
        rfLockWarned = true;
        toast(t('cam.autoframe.lock'), 'info', 9000);
      }
    } else if (phase === 'calibrate') view.sub.textContent = 'Checking the camera for 3 seconds…';
    else if (phase === 'red') lastCount = ''; // đếm ngược hiện lại
  }

  let hudAt = 0;
  // Vẽ do lớp phủ Phaser đảm nhận; ở đây ghi số ô đỏ cho test, đếm ngược và HUD.
  function draw(now) {
    const fl = detector.flagged;
    let n = 0;
    for (let i = 0; i < fl.length; i++) n += fl[i];
    view.overlay.dataset.flagged = String(n);
    if (phase === 'red' && now >= redStart + SF.GRACE_MS + SF.REF_MS && !detector.reframing) {
      const left = Math.max(1, Math.ceil((phaseEnd - now) / 1000));
      const txt = String(Math.min(3, left));
      if (txt !== lastCount) { lastCount = txt; view.sub.textContent = txt; }
    }
    if (now - hudAt > 500) {
      hudAt = now;
      const st = detector.stats();
      window.__sfStats = { ...st, src: srcName, grabMs, ...counters, mode: MODE };
      if (view.hud) {
        view.hud.textContent = `${MODE} · ${st.procHz.toFixed(1)} Hz · ${(st.ms + grabMs).toFixed(1)} ms · dup ${counters.dup} · ${srcName} · ${cvsMode} · video ${session.video.videoWidth}x${session.video.videoHeight}\n`
          + `σ ${st.sigma.toFixed(1)} · τ ${st.tau} · nhiễu khối TB ${st.medNoise.toFixed(1)} · xám ${st.masked}\n` // i18n-keep: HUD chẩn đoán
          + `live ${st.live} · global ${st.globalEvents} · gain ${st.gain.toFixed(2)} · mốc ${st.refReady ? '✓' : '·'}` // i18n-keep: HUD chẩn đoán
          + (st.rf ? `\nđổi khung ${st.rf.events} · ${st.rf.moving ? 'ĐANG ĐỔI' : 'ổn định'} · ổn định sau ${st.rf.lastSettleMs} ms · ncc ${st.rf.ncc.toFixed(2)} · đo lại ${st.calRestarts}${st.needRecal ? ' · cần đo lại' : ''} · đo được ${Math.round(st.validMs)} ms` : ''); // i18n-keep: HUD chẩn đoán
      }
    }
  }

  showSetup();

  return {
    destroy() {
      stopLoop();
      clearTimers();
      if (view && view.phaser) view.phaser.game.destroy(true);
      session.stop();
      frame.destroy();
    },
    // Cho test tự động.
    debug: () => ({
      phase,
      flagged: Array.from(detector.flagged),
      live: Array.from(detector.live),
      lanes: lastLanes,
      areas: lastAreas,
      interrupted: lastInterrupted,
      reframing: Boolean(detector.reframing),
      needRecal: Boolean(detector.needRecal),
      masked: Array.from(detector.masked).reduce((a, b) => a + b, 0),
      sensitivity: opts.sensitivity,
      mode: MODE,
      stats: { ...detector.stats(), src: srcName, grabMs, ...counters },
    }),
  };
}

let instance = null;

export default {
  id: 'statue-freeze',
  title: 'Statue Freeze',
  needsCamera: true,
  minItems: { actionCommands: 3 },
  group: 'camera',
  theme: 'night',
  icon: 'person-standing',
  get description() { return t('game.statue.desc'); },
  ready: true,

  mount(rootEl, content) {
    instance = createGame(rootEl, content);
    window.__statueFreeze = instance;
  },

  unmount() {
    if (instance) instance.destroy();
    instance = null;
    delete window.__statueFreeze;
  },
};
