// Word Ninja — thẻ từ bay lên, vung tay chém thẻ đúng nhóm. Chém đúng +1, chém sai mất 1 mạng (3 mạng), 60 giây.
// MediaPipe Pose (cổ tay 2 tay) vẽ vệt sáng; chỉ tính là chém khi tay đủ nhanh.
// Chế độ dự phòng: chém bằng chuột / cảm ứng khi không có camera. Đặc tả: docs/GAMES_SPEC.md
import './style.css';
import confetti from 'canvas-confetti';
import { playSound, speak } from '../../core/audio.js';
import { cameraSetupScreen, createCameraSession, createFpsMonitor } from '../../core/camera.js';
import { POSE, createPoseDetector } from '../../core/vision.js';
import { shuffle } from '../../core/content.js';
import { button, createCountdown, createGameFrame, h, resultsScreen, segmented, setupScreen, toast } from '../../core/ui.js';
import { gameArt } from '../../core/art.js';
import { icon } from '../../core/icons.js';
import { line, ninjaTarget } from '../../core/voice-lines.js';
import { launchCard, playableCategories, segmentHitsRect, speedOf, stepCard } from './logic.js';

const GAME_SECONDS = 60;
const LIVES = 3;
const SPAWN_MS = 1000;
const TRAIL = 10;
const CARD_COLORS = ['#fff4c2', '#dcfbfe', '#ffe3f6', '#e3eeff', '#e9fbd0'];

const HOW_TO = {
  title: 'How to play',
  text: 'Slice only the words in the target group.',
  steps: ['Swing your hand fast through a card.', 'Right group: +1 point.', 'Wrong group: lose a life.'],
};

function createGame(root, pack) {
  const groups = playableCategories(pack.vocab);
  const cats = Object.keys(groups);
  const opts = { mode: 'camera' };
  const session = createCameraSession();
  let detector = null;
  let raf = 0;
  let view = null;
  let state = null;
  let timer = null;
  let lastVideoTime = -1;
  const blades = new Map(); // id -> [{x,y,t}]

  const frame = createGameFrame(root, {
    title: 'Word Ninja',
    howTo: HOW_TO,
    onPause: () => {
      if (timer) timer.pause();
      stopLoop();
    },
    onResume: () => {
      if (state && !state.over) {
        timer.resume();
        startLoop();
      }
    },
    onRestart: () => showSetup(),
  });
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
    if (timer) timer.stop();
    state = null;
    view = null;
    session.stop();
    frame.extra.textContent = '';
    frame.setPaused(false);
    setStage(setupScreen({
      gameId: 'word-ninja',
      title: 'Word Ninja',
      art: gameArt('word-ninja'),
      rows: [
        { label: 'Cách chém', control: segmented([{ value: 'camera', label: 'Vung tay trước camera' }, { value: 'touch', label: 'Chuột / cảm ứng (không camera)' }], opts.mode, (v) => (opts.mode = v), 'wn-mode'),
          hint: '1-2 học sinh đứng cách camera 1,5-2,5 mét, thấy từ hông trở lên. Nhóm từ dùng trong game: ' + cats.join(', ') + '.' },
      ],
      startLabel: 'Tiếp tục',
      onStart: () => {
        if (opts.mode === 'touch') startGame();
        else setStage(cameraSetupScreen({ session, title: 'Word Ninja', art: gameArt('word-ninja'), hint: 'Đứng lùi lại để camera thấy 2 tay. Vung tay thật nhanh qua thẻ để chém.', onReady: startGame }));
      },
    }));
  }

  async function startGame() {
    const canvas = h('canvas', { class: 'wn-canvas', 'data-testid': 'wn-canvas' });
    const target = h('div', { class: 'wn-target en', 'data-testid': 'wn-target' });
    const hud = h('div', { class: 'wn-hud en' });
    const box = h('div', { class: `wn-box ${opts.mode}` }, opts.mode === 'camera' ? session.video : null, canvas, target, hud);
    view = { canvas, target, hud, box };
    timer = createCountdown({ seconds: GAME_SECONDS, onEnd: () => endGame("Time's up"), onTick: (s) => s <= 5 && s > 0 && playSound('tick') });
    frame.extra.textContent = '';
    frame.extra.append(timer.el);
    if (opts.mode === 'camera') {
      const camBtn = button({ label: 'Tắt camera', iconName: 'camera', attrs: { 'data-testid': 'cam-toggle' } });
      camBtn.addEventListener('click', async () => {
        if (session.active) {
          session.stop();
          camBtn.querySelector('span').textContent = 'Bật camera';
        } else {
          await session.start().catch(() => toast('Không bật lại được camera.', 'error'));
          camBtn.querySelector('span').textContent = 'Tắt camera';
        }
      });
      frame.extra.append(camBtn);
    }
    setStage(h('div', { class: 'wn-play' }, box));
    bindPointer(canvas);

    if (opts.mode === 'camera') {
      const loading = h('div', { class: 'sp-loading' }, 'Loading AI model…');
      box.append(loading);
      try {
        detector ||= await createPoseDetector({ numPoses: 2 });
        loading.remove();
      } catch (err) {
        console.error(err);
        loading.textContent = '';
        loading.append(icon('alert', 40), h('strong', {}, 'Không nạp được model AI'),
          h('span', {}, 'Game chuyển sang chém bằng chuột / cảm ứng.'));
        loading.classList.add('error');
        setTimeout(() => loading.remove(), 3500);
      }
    }

    const cat = cats[Math.floor(Math.random() * cats.length)];
    const others = pack.vocab.filter((v) => v.word && v.category && v.category.toLowerCase() !== cat);
    state = { cat, targets: shuffle(groups[cat]), others: shuffle(others), cards: [], score: 0, lives: LIVES, lastSpawn: 0, lastT: 0, over: false, bursts: [] };
    target.textContent = ninjaTarget(cat).replace(/!$/, '').replace(/(\w+)$/, (m) => m.toUpperCase());
    renderHud();
    speak(ninjaTarget(cat));
    timer.start();
    startLoop();
  }

  function renderHud() {
    view.hud.textContent = '';
    view.hud.append(
      h('span', { class: 'wn-score', 'data-testid': 'wn-score' }, `Score ${state.score}`),
      h('span', { class: 'wn-lives', 'data-testid': 'wn-lives', 'data-lives': state.lives },
        Array.from({ length: LIVES }, (_, i) => h('span', { class: `wn-heart${i < state.lives ? '' : ' lost'}` }, '♥'))),
    );
  }

  // ---------- Chém bằng chuột / cảm ứng ----------
  function bindPointer(canvas) {
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height), t: performance.now() };
    };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      blades.set(`p${e.pointerId}`, [pos(e)]);
    });
    canvas.addEventListener('pointermove', (e) => {
      const trail = blades.get(`p${e.pointerId}`);
      if (!trail) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      (evs.length ? evs : [e]).forEach((ev) => addPoint(`p${e.pointerId}`, pos(ev), 0.45));
    });
    const up = (e) => blades.delete(`p${e.pointerId}`);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  // Thêm điểm vào vệt chém; minSpeed tính theo chiều cao màn hình mỗi giây.
  function addPoint(id, p, minSpeed) {
    const trail = blades.get(id) || [];
    const prev = trail[trail.length - 1];
    trail.push(p);
    while (trail.length > TRAIL) trail.shift();
    blades.set(id, trail);
    if (!prev || !state || state.over || frame.paused) return;
    const fast = speedOf(prev, p) >= minSpeed * view.canvas.height;
    if (!fast) return;
    for (const c of state.cards) {
      if (c.sliced || c.gone) continue;
      if (segmentHitsRect(prev.x, prev.y, p.x, p.y, c.x, c.y, c.w, c.h)) slice(c);
    }
  }

  function slice(c) {
    c.sliced = true;
    c.slicedAt = performance.now();
    state.bursts.push({ x: c.x, y: c.y, t: performance.now(), good: c.target });
    if (c.target) {
      state.score += 1;
      playSound('correct');
    } else {
      state.lives -= 1;
      playSound('wrong');
      view.box.classList.remove('hurt');
      void view.box.offsetWidth;
      view.box.classList.add('hurt');
      if (state.lives <= 0) endGame('No lives left');
    }
    renderHud();
  }

  // ---------- Vòng lặp ----------
  function startLoop() {
    cancelAnimationFrame(raf);
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (!state) return;
      const { canvas, box } = view;
      if (canvas.width !== box.clientWidth || canvas.height !== box.clientHeight) {
        canvas.width = box.clientWidth;
        canvas.height = box.clientHeight;
      }
      const dt = state.lastT ? Math.min(0.05, (now - state.lastT) / 1000) : 0;
      state.lastT = now;
      if (!state.over) {
        if (now - state.lastSpawn > SPAWN_MS) {
          state.lastSpawn = now;
          spawn();
        }
        state.cards.forEach((c) => {
          stepCard(c, dt);
          if (c.y > canvas.height + 120 && c.vy > 0) c.gone = true;
        });
        state.cards = state.cards.filter((c) => !c.gone && !(c.sliced && now - c.slicedAt > 500));
        trackHands(now);
      }
      draw(now);
    };
    raf = requestAnimationFrame(tick);
  }

  function stopLoop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function spawn() {
    const isTarget = Math.random() < 0.5;
    const pool = isTarget ? state.targets : state.others;
    if (!pool.length) return;
    const item = pool[Math.floor(Math.random() * pool.length)];
    const W = view.canvas.width;
    const H = view.canvas.height;
    const fontPx = Math.round(H / 16);
    const ctx = view.canvas.getContext('2d');
    ctx.font = `800 ${fontPx}px Gilroy, sans-serif`;
    const w = ctx.measureText(item.word).width + fontPx * 1.4;
    const card = launchCard({ word: item.word, target: isTarget, w, h: fontPx * 2, fontPx, color: CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)] }, W, H);
    state.cards.push(card);
  }

  function trackHands(now) {
    if (!detector || opts.mode !== 'camera' || !session.active) return;
    const v = session.video;
    if (v.readyState < 2 || v.currentTime === lastVideoTime) return;
    lastVideoTime = v.currentTime;
    fps.tick(now);
    const res = detector.detect(v, now);
    if (!res) return;
    const W = view.canvas.width;
    const H = view.canvas.height;
    // Video hiển thị kiểu "cover" trên toàn khung: đổi toạ độ chuẩn hoá sang toạ độ canvas (có lật gương).
    const vw = v.videoWidth || 16;
    const vh = v.videoHeight || 9;
    const scale = Math.max(W / vw, H / vh);
    const ox = (W - vw * scale) / 2;
    const oy = (H - vh * scale) / 2;
    (res.landmarks || []).slice(0, 2).forEach((lm, i) => {
      [POSE.leftWrist, POSE.rightWrist].forEach((k) => {
        const p = lm[k];
        if (!p || (p.visibility ?? 1) < 0.5) return;
        addPoint(`w${i}-${k}`, { x: ox + (1 - p.x) * vw * scale, y: oy + p.y * vh * scale, t: now }, 0.9);
      });
    });
  }

  function draw(now) {
    const { canvas } = view;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Thẻ từ
    state.cards.forEach((c) => {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      const half = c.sliced ? Math.min(1, (now - c.slicedAt) / 500) : 0;
      const parts = c.sliced ? [-1, 1] : [0];
      parts.forEach((side) => {
        ctx.save();
        if (c.sliced) {
          ctx.translate(side * half * 60, half * 40);
          ctx.rotate(side * half * 0.6);
          ctx.globalAlpha = 1 - half;
          ctx.beginPath();
          ctx.rect(side < 0 ? -c.w : 0, -c.h, c.w, c.h * 2);
          ctx.clip();
        }
        roundRect(ctx, -c.w / 2, -c.h / 2, c.w, c.h, c.h / 3);
        ctx.fillStyle = c.sliced ? (c.target ? '#04bc09' : '#ff5a00') : c.color;
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#1c1f25';
        ctx.stroke();
        ctx.fillStyle = c.sliced ? '#fff' : '#1c1f25';
        ctx.font = `800 ${c.fontPx}px Gilroy, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(c.word, 0, 2);
        ctx.restore();
      });
      ctx.restore();
    });
    // Chữ +1 / -1 bay lên
    state.bursts = state.bursts.filter((b) => now - b.t < 800);
    state.bursts.forEach((b) => {
      const k = (now - b.t) / 800;
      ctx.globalAlpha = 1 - k;
      ctx.font = `800 ${Math.round(canvas.height / 12)}px Gilroy, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = b.good ? '#04bc09' : '#ff3d10';
      ctx.fillText(b.good ? '+1' : '-1', b.x, b.y - k * 80);
      ctx.globalAlpha = 1;
    });
    // Vệt sáng theo tay / ngón
    for (const [id, trail] of blades) {
      const fresh = trail.filter((p) => now - p.t < 180);
      if (fresh.length < 2) continue;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const [width, color] of [[canvas.height / 30, 'rgba(0, 225, 243, 0.35)'], [canvas.height / 90, '#ffffff']]) {
        ctx.beginPath();
        ctx.moveTo(fresh[0].x, fresh[0].y);
        fresh.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.stroke();
      }
      if (now - trail[trail.length - 1].t > 1000 && id.startsWith('w')) blades.delete(id);
    }
  }

  function roundRect(ctx, x, y, w, hgt, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + hgt, r);
    ctx.arcTo(x + w, y + hgt, x, y + hgt, r);
    ctx.arcTo(x, y + hgt, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function endGame(reason) {
    if (!state || state.over) return;
    state.over = true;
    timer.stop();
    stopLoop();
    playSound(state.lives > 0 ? 'win' : 'wrong');
    speak(reason === "Time's up" ? line('timesUp') : line('tryAgain'));
    const score = state.score;
    setTimeout(() => {
      if (!view) return;
      setStage(resultsScreen({ title: `${reason}: ${score} point${score === 1 ? '' : 's'}`, ranking: [{ name: 'Ninja', index: 2, score }], unit: ' pts', onReplay: () => showSetup() }));
      if (score > 0) confetti({ particleCount: 140, spread: 90, origin: { y: 0.6 }, disableForReducedMotion: true });
    }, 700);
  }

  showSetup();

  return {
    destroy() {
      stopLoop();
      if (timer) timer.stop();
      session.stop();
      if (detector) detector.close();
      detector = null;
      view = null;
      confetti.reset();
      frame.destroy();
    },
  };
}

let instance = null;

export default {
  id: 'word-ninja',
  title: 'Word Ninja',
  needsCamera: true,
  minItems: { vocab: 8 },
  group: 'camera',
  icon: 'swords',
  description: 'Vung tay chém thẻ từ đúng nhóm. Có chế độ chuột / cảm ứng.',
  ready: true,
  checkContent(pack) {
    const groups = playableCategories(pack.vocab);
    const n = Object.keys(groups).length;
    return n >= 2 ? [] : [`Cần ít nhất 2 nhóm từ, mỗi nhóm ít nhất 3 từ (hiện có ${n} nhóm đủ).`];
  },

  mount(rootEl, content) {
    instance = createGame(rootEl, content);
  },

  unmount() {
    if (instance) instance.destroy();
    instance = null;
  },
};
