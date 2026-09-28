// Statue Freeze — đèn xanh làm theo lệnh, đèn đỏ đứng im. So sánh khung hình trên lưới 16x9, KHÔNG dùng AI,
// KHÔNG nhận diện từng học sinh: chỉ tô đỏ vùng có chuyển động để giáo viên nhìn. Đặc tả: docs/GAMES_SPEC.md
import './style.css';
import { playSound, speak } from '../../core/audio.js';
import { cameraSetupScreen, createCameraSession, createFpsMonitor } from '../../core/camera.js';
import { createMotionGrid } from '../../core/vision.js';
import { button, createGameFrame, h, segmented, toast } from '../../core/ui.js';
import { gameArt } from '../../core/art.js';
import { line } from '../../core/voice-lines.js';
import { shuffle } from '../../core/content.js';

const CALIBRATE_MS = 3000;
const RED_MS = 3000;
const MEASURE_EVERY_MS = 66; // ~15 lần/giây là đủ, nhẹ máy

const HOW_TO = {
  title: 'How to play',
  text: 'Green light: do the action. Red light: freeze!',
  steps: ['Listen to the command.', 'Red light: stand still for 3 seconds.', 'Red boxes show movement.'],
};

// Độ nhạy 1..10 -> ngưỡng cộng thêm trên mức nhiễu (càng nhạy ngưỡng càng thấp).
export function thresholdFor(noise, sensitivity) {
  const extra = 26 - sensitivity * 2.3;
  return noise + Math.max(2, extra);
}

// Mức nhiễu mỗi ô từ các mẫu lúc hiệu chỉnh: trung bình + 3 độ lệch chuẩn.
export function noiseFromSamples(samples, cells) {
  const noise = new Float32Array(cells);
  if (!samples.length) return noise;
  for (let i = 0; i < cells; i++) {
    let sum = 0;
    let sq = 0;
    for (const s of samples) {
      sum += s[i];
      sq += s[i] * s[i];
    }
    const mean = sum / samples.length;
    const std = Math.sqrt(Math.max(0, sq / samples.length - mean * mean));
    noise[i] = mean + 3 * std;
  }
  return noise;
}

function createGame(root, pack) {
  const session = createCameraSession();
  const grid = createMotionGrid({ cols: 16, rows: 9 });
  const cells = grid.cols * grid.rows;
  const opts = { sensitivity: 6, auto: false };
  let raf = 0;
  let timers = [];
  let phase = 'idle'; // calibrate | green | red | review | idle
  let phaseEnd = 0;
  let noise = new Float32Array(cells);
  let calibSamples = [];
  let hot = new Uint8Array(cells); // số lần đo liên tiếp vượt ngưỡng
  let flagged = new Uint8Array(cells); // ô bị tô đỏ trong lượt đèn đỏ này
  let lastMeasure = 0;
  let commands = [];
  let roundNo = 0;
  let view = null;

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

  const fps = createFpsMonitor({
    onSlow: async (f) => {
      toast(`Máy xử lý chậm (${Math.round(f)} khung/giây). Đang giảm độ phân giải camera.`, 'error', 5000);
      await session.lowerResolution().catch(() => {});
      grid.reset();
    },
  });

  // ---------- Cài đặt + chọn camera ----------
  function showSetup() {
    stopLoop();
    clearTimers();
    view = null;
    phase = 'idle';
    frame.extra.textContent = '';
    frame.setPaused(false);
    setStage(cameraSetupScreen({
      session,
      title: 'Statue Freeze',
      art: gameArt('statue-freeze'),
      hint: 'Đặt camera thấy cả lớp. Game KHÔNG nhận diện từng học sinh, chỉ tô đỏ vùng có chuyển động khi đèn đỏ. Giáo viên nhìn vùng đỏ để gọi tên.',
      extraRows: [
        { label: 'Sau mỗi lượt đèn đỏ', control: segmented([{ value: false, label: 'Giáo viên bấm tiếp' }, { value: true, label: 'Tự chạy tiếp' }], opts.auto, (v) => (opts.auto = v), 'sf-auto') },
      ],
      onReady: startGame,
    }));
  }

  // ---------- Màn chơi ----------
  function startGame() {
    commands = shuffle(pack.actionCommands);
    roundNo = 0;
    const overlay = h('canvas', { class: 'sf-overlay', 'data-testid': 'sf-overlay' });
    const light = h('div', { class: 'sf-light', 'data-testid': 'sf-light' }, h('span', { class: 'sf-bulb red' }), h('span', { class: 'sf-bulb green' }));
    const banner = h('div', { class: 'sf-banner en', 'data-testid': 'sf-banner' });
    const sub = h('div', { class: 'sf-sub en' });
    const count = h('div', { class: 'sf-count', 'data-testid': 'sf-count', hidden: true });
    const controls = h('div', { class: 'sf-controls' });
    const videoBox = h('div', { class: 'sf-video' }, session.video, overlay, count);
    view = { overlay, light, banner, sub, count, controls, videoBox };

    const slider = h('input', {
      type: 'range', min: 1, max: 10, step: 1, value: opts.sensitivity, 'aria-label': 'Độ nhạy', 'data-testid': 'sf-sensitivity',
      onInput: (e) => (opts.sensitivity = Number(e.target.value)),
    });
    const camBtn = button({ label: 'Tắt camera', iconName: 'camera', attrs: { 'data-testid': 'cam-toggle' } });
    camBtn.addEventListener('click', async () => {
      if (session.active) {
        stopLoop();
        clearTimers();
        session.stop();
        phase = 'idle';
        phaseEnd = 0;
        setBanner('Camera off', 'Bấm "Bật camera" để chơi tiếp.');
        camBtn.querySelector('span').textContent = 'Bật camera';
      } else {
        await session.start().catch(() => toast('Không bật lại được camera.', 'error'));
        camBtn.querySelector('span').textContent = 'Tắt camera';
        grid.reset();
        startLoop();
        calibrate();
      }
    });
    frame.extra.textContent = '';
    frame.extra.append(h('label', { class: 'sf-sens' }, h('span', {}, 'Độ nhạy'), slider), camBtn);

    setStage(h('div', { class: 'sf-play' },
      videoBox,
      h('div', { class: 'sf-side' }, light, banner, sub, controls)));
    grid.reset();
    startLoop();
    calibrate();
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
    calibSamples = [];
    flagged = new Uint8Array(cells);
    view.count.hidden = true;
    setLight('off');
    setBanner('Stand still', 'Checking the camera for 3 seconds…');
    setControls();
    speak(line('standStill'));
    phaseEnd = performance.now() + CALIBRATE_MS;
  }

  function finishCalibration() {
    noise = noiseFromSamples(calibSamples, cells);
    nextGreen();
  }

  function nextGreen() {
    clearTimers();
    if (!commands.length) commands = shuffle(pack.actionCommands);
    const cmd = commands.shift();
    roundNo += 1;
    phase = 'green';
    flagged = new Uint8Array(cells);
    hot = new Uint8Array(cells);
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
    flagged = new Uint8Array(cells);
    hot = new Uint8Array(cells);
    setLight('red');
    setBanner('Freeze!', 'Stand still for 3 seconds.');
    speak(line('freeze'));
    phaseEnd = performance.now() + RED_MS;
  }

  function finishRed() {
    phase = 'review';
    view.light.dataset.phase = phase;
    const n = flagged.reduce((a, b) => a + b, 0);
    view.count.hidden = false;
    view.count.textContent = n ? `${n} moving area${n > 1 ? 's' : ''}` : 'Perfect statues!';
    view.count.dataset.good = String(!n);
    playSound(n ? 'wrong' : 'win');
    if (!n) speak(line('greatJob'));
    setBanner(n ? 'Who moved?' : 'Great job!', n ? 'Look at the red boxes.' : 'Nobody moved.');
    setControls(
      button({ label: 'Next command', iconName: 'play', variant: 'primary', size: 'lg', onClick: nextGreen, attrs: { 'data-testid': 'sf-next' } }),
      button({ label: 'Check again (stand still)', iconName: 'refresh', onClick: calibrate }),
    );
    if (opts.auto) later(nextGreen, 4000);
  }

  // ---------- Vòng xử lý ----------
  function startLoop() {
    cancelAnimationFrame(raf);
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (!session.active || session.video.readyState < 2) return;
      fps.tick(now);
      if (now - lastMeasure >= MEASURE_EVERY_MS) {
        lastMeasure = now;
        process(grid.measure(session.video));
      }
      draw();
      if (phaseEnd && now >= phaseEnd) {
        phaseEnd = 0;
        if (phase === 'calibrate') finishCalibration();
        else if (phase === 'green') startRed();
        else if (phase === 'red') finishRed();
      }
    };
    raf = requestAnimationFrame(tick);
  }

  function stopLoop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function process(motion) {
    if (phase === 'calibrate') {
      calibSamples.push(motion);
      return;
    }
    if (phase !== 'red') return;
    for (let i = 0; i < cells; i++) {
      if (motion[i] > thresholdFor(noise[i], opts.sensitivity)) {
        hot[i] = Math.min(255, hot[i] + 1);
        if (hot[i] >= 2) flagged[i] = 1; // 2 lần đo liên tiếp mới tính, tránh nháy nhiễu
      } else {
        hot[i] = 0;
      }
    }
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
    const n = flagged.reduce((a, b) => a + b, 0);
    overlay.dataset.flagged = String(n);
    if (phase !== 'red' && phase !== 'review') return;
    // Vùng hình thật của video (object-fit: contain) trong khung.
    const vw = session.video.videoWidth || 16;
    const vh = session.video.videoHeight || 9;
    const scale = Math.min(w / vw, hgt / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const ox = (w - dw) / 2;
    const oy = (hgt - dh) / 2;
    const cw = dw / grid.cols;
    const ch = dh / grid.rows;
    ctx.lineWidth = 3;
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        if (!flagged[r * grid.cols + c]) continue;
        ctx.fillStyle = 'rgba(255, 60, 20, 0.42)';
        ctx.strokeStyle = 'rgba(255, 60, 20, 0.95)';
        ctx.fillRect(ox + c * cw, oy + r * ch, cw, ch);
        ctx.strokeRect(ox + c * cw + 1.5, oy + r * ch + 1.5, cw - 3, ch - 3);
      }
    }
  }

  showSetup();

  return {
    destroy() {
      stopLoop();
      clearTimers();
      session.stop();
      frame.destroy();
    },
    // Cho test tự động.
    debug: () => ({ phase, flagged: Array.from(flagged) }),
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
  description: 'Nghe lệnh hành động, đèn đỏ thì đứng im như tượng.',
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
