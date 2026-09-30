// Word Ninja (Phaser 4) — thẻ từ bay lên, vung tay chém thẻ đúng nhóm. Chém đúng +1, chém sai mất 1 mạng (3 mạng), 60 giây.
// MediaPipe Pose (cổ tay 2 tay) tạo vệt chém; chỉ tính khi tay đủ nhanh.
// Chế độ dự phòng: chém bằng chuột / cảm ứng khi không có camera. Đặc tả: docs/GAMES_SPEC.md
import './style.css';
import { playSound, speak } from '../../core/audio.js';
import { cameraSetupScreen, createCameraSession } from '../../core/camera.js';
import { POSE, createPoseDetector } from '../../core/vision.js';
import { createPoseTracker } from '../../core/pose-tracker.js';
import { shuffle } from '../../core/content.js';
import { button, createCountdown, createGameFrame, h, resultsScreen, segmented, setupScreen, toast } from '../../core/ui.js';
import { gameArt } from '../../core/art.js';
import { icon } from '../../core/icons.js';
import { celebrate } from '../../core/fx.js';
import { line, ninjaTarget } from '../../core/voice-lines.js';
import { mountPhaser } from '../shared/phaser-host.js';
import { makeNinjaScene } from './ninja-scene.js';
import { playableCategories } from './logic.js';

const GAME_SECONDS = 60;
const LIVES = 3;

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
  let tracker = null;
  let raf = 0;
  let view = null;
  let state = null;
  let timer = null;
  let phaser = null;
  let lastVideoTime = -1;

  const frame = createGameFrame(root, {
    title: 'Word Ninja',
    howTo: HOW_TO,
    onPause: () => {
      if (timer) timer.pause();
      if (phaser) phaser.game.scene.pause('main');
    },
    onResume: () => {
      if (state && !state.over) {
        timer.resume();
        if (phaser) phaser.game.scene.resume('main');
      }
    },
    onRestart: () => showSetup(),
  });
  const setStage = (...nodes) => {
    frame.stage.textContent = '';
    frame.stage.append(...nodes);
  };
  function teardown() {
    cancelAnimationFrame(raf);
    raf = 0;
    if (timer) timer.stop();
    if (phaser) phaser.game.destroy(true);
    phaser = null;
    delete window.__ninjaScene;
  }

  function showSetup() {
    teardown();
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
    teardown();
    const host = h('div', { class: 'wn-phaser', 'data-testid': 'wn-canvas' });
    const target = h('div', { class: 'wn-target en', 'data-testid': 'wn-target' });
    const hud = h('div', { class: 'wn-hud en' });
    const box = h('div', { class: `wn-box ${opts.mode}` }, opts.mode === 'camera' ? session.video : null, host, target, hud);
    view = { host, target, hud, box };
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

    const cat = cats[Math.floor(Math.random() * cats.length)];
    const others = pack.vocab.filter((v) => v.word && v.category && v.category.toLowerCase() !== cat);
    state = { cat, targets: shuffle(groups[cat]), others: shuffle(others), score: 0, lives: LIVES, over: false };
    const my = state;

    const api = {
      get running() {
        return Boolean(state) && !state.over && state === my;
      },
      get paused() {
        return frame.paused;
      },
      pickItem() {
        const isTarget = Math.random() < 0.5;
        const pool = isTarget ? state.targets : state.others;
        const item = pool[Math.floor(Math.random() * pool.length)];
        return item ? { word: item.word, target: isTarget } : null;
      },
      onSlice(good, word) {
        if (!api.running) return;
        if (good) {
          state.score += 1;
          playSound('correct');
          speak(word);
        } else {
          state.lives -= 1;
          playSound('wrong');
          view.box.classList.remove('hurt');
          void view.box.offsetWidth;
          view.box.classList.add('hurt');
        }
        renderHud();
        if (state.lives <= 0) endGame('No lives left');
      },
    };

    const loading = h('div', { class: 'sp-loading' }, 'Loading…');
    box.append(loading);
    phaser = await mountPhaser(host, makeNinjaScene, { api });
    if (state !== my) {
      phaser.game.destroy(true);
      return;
    }
    if (opts.mode === 'camera') {
      loading.textContent = 'Loading AI model…';
      try {
        // Nhận tối đa 4 người, bộ theo dõi chọn 2 bạn gần camera nhất (lớp đông phía sau không chém nhầm).
        detector ||= await createPoseDetector({ numPoses: 4 });
      } catch (err) {
        console.error(err);
        loading.textContent = '';
        loading.append(icon('alert', 40), h('strong', {}, 'Không nạp được model AI'), h('span', {}, 'Game chuyển sang chém bằng chuột / cảm ứng.'));
        loading.classList.add('error');
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    if (state !== my) return;
    loading.remove();
    target.textContent = ninjaTarget(cat).replace(/!$/, '').replace(/(\w+)$/, (m) => m.toUpperCase());
    renderHud();
    speak(ninjaTarget(cat));
    timer.start();
    const wait = () => {
      const sc = phaser && phaser.game.scene.getScene('main');
      if (sc && sc.sys.isActive()) window.__ninjaScene = sc;
      else if (phaser) setTimeout(wait, 50);
    };
    wait();
    if (detector && opts.mode === 'camera') {
      tracker = createPoseTracker({ maxPlayers: 2, smooth: 0.7, lostMs: 600 });
      trackLoop();
    }
  }

  function renderHud() {
    view.hud.textContent = '';
    view.hud.append(
      h('span', { class: 'wn-score', 'data-testid': 'wn-score' }, `Score ${state.score}`),
      h('span', { class: 'wn-lives', 'data-testid': 'wn-lives', 'data-lives': state.lives },
        Array.from({ length: LIVES }, (_, i) => h('span', { class: `wn-heart${i < state.lives ? '' : ' lost'}` }, '♥'))),
    );
  }

  // Theo dõi 2 cổ tay qua camera, đổi sang toạ độ game Phaser rồi đưa vào vệt chém.
  function trackLoop() {
    // Cổ tay: AI cho vị trí mới 15–30 lần/giây; mỗi khung hình (60 fps) con trỏ trượt dần tới đó
    // và vẽ vệt chém, nên vệt liền mạch thay vì nhảy cóc.
    const targets = new Map(); // khoá -> { x, y, at }
    const cursors = new Map(); // khoá -> { x, y }
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const sc = window.__ninjaScene;
      const v = session.video;
      if (!sc || !detector || !session.active || v.readyState < 2 || frame.paused) return;
      if (v.currentTime !== lastVideoTime) {
        lastVideoTime = v.currentTime;
        const res = detector.detect(v, now);
        if (res) {
          const box = view.box.getBoundingClientRect();
          const cv = phaser.game.canvas.getBoundingClientRect();
          const vw = v.videoWidth || 16;
          const vh = v.videoHeight || 9;
          const scale = Math.max(box.width / vw, box.height / vh); // video hiển thị kiểu cover
          const ox = box.left + (box.width - vw * scale) / 2;
          const oy = box.top + (box.height - vh * scale) / 2;
          tracker.update(res.landmarks || [], now).players.forEach((pl, i) => {
            if (!pl || !pl.fresh) return;
            [POSE.leftWrist, POSE.rightWrist].forEach((k) => {
              const p = pl.lm[k];
              if (!p || (p.visibility ?? 1) < 0.5) return;
              const sx = ox + (1 - p.x) * vw * scale;
              const sy = oy + p.y * vh * scale;
              targets.set(`w${i}-${k}`, {
                x: ((sx - cv.left) / cv.width) * phaser.game.scale.width,
                y: ((sy - cv.top) / cv.height) * phaser.game.scale.height,
                at: now,
              });
            });
          });
        }
      }
      targets.forEach((t, key) => {
        if (now - t.at > 400) { // mất dấu cổ tay: dừng vệt
          targets.delete(key);
          cursors.delete(key);
          return;
        }
        const c = cursors.get(key) || { x: t.x, y: t.y };
        c.x += (t.x - c.x) * 0.5;
        c.y += (t.y - c.y) * 0.5;
        cursors.set(key, c);
        sc.addPoint(key, c.x, c.y, sc.time.now, 0.9);
      });
    };
    raf = requestAnimationFrame(tick);
  }

  function endGame(reason) {
    if (!state || state.over) return;
    state.over = true;
    timer.stop();
    playSound(state.lives > 0 ? 'win' : 'wrong');
    speak(reason === "Time's up" ? line('timesUp') : line('tryAgain'));
    const score = state.score;
    setTimeout(() => {
      if (!view) return;
      teardown();
      setStage(resultsScreen({ title: `${reason}: ${score} point${score === 1 ? '' : 's'}`, ranking: [{ name: 'Ninja', index: 2, score }], unit: ' pts', onReplay: () => showSetup() }));
      if (score > 0) celebrate();
    }, 800);
  }

  showSetup();

  return {
    destroy() {
      teardown();
      session.stop();
      if (detector) detector.close();
      detector = null;
      view = null;
      state = null;
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
  theme: 'night',
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
