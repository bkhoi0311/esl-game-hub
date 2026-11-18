// Mascot Hải Âu ClassIn. Tâm trạng: idle, menu, happy, win, sad, wow, think, end. Nhún nhẹ; thumb khi đúng, ối khi sai (nghe kênh sự kiện).
import { gsap } from 'gsap';
import { bus, reducedMotion } from './events.js';
import { PERF } from './perf.js';

// Hình Hải Âu ClassIn chính thức (webp trong suốt, giữ nguyên: không đổi màu, không lật, không kéo méo).
import dung from '../assets/mascot/dung.webp';
import chao from '../assets/mascot/chao.webp';
import thumb from '../assets/mascot/thumb.webp';
import nhay from '../assets/mascot/nhay.webp';
import oi from '../assets/mascot/oi.webp';
import cui from '../assets/mascot/cui.webp';
import thinking from '../assets/mascot/thinking.webp';

const POSES = { dung, chao, thumb, nhay, oi, cui, thinking };
// Tâm trạng cũ -> dáng mới.
const MOOD_POSE = { idle: 'dung', menu: 'chao', wave: 'chao', happy: 'thumb', streak: 'thumb', win: 'nhay', cheer: 'nhay', sad: 'oi', wrong: 'oi', wow: 'nhay', end: 'cui', thanks: 'cui', think: 'thinking', loading: 'thinking' };

// URL ảnh theo tâm trạng (dùng cho <img src>, Phaser load.image...).
export function mascotDataUrl(mood = 'idle') {
  return POSES[MOOD_POSE[mood] || mood] || dung;
}

// Giữ API cũ: trả chuỗi <img> thay cho SVG.
export function mascotSvg(mood = 'idle', { size = 200 } = {}) {
  return `<img src="${mascotDataUrl(mood)}" alt="" width="${size}" height="${size}" draggable="false" style="object-fit:contain">`;
}

// Mascot trong trang. options.react: tự phản ứng theo kênh sự kiện.
export function createMascot({ size = '6rem', mood = 'idle', react = true, bubble = true } = {}) {
  const el = document.createElement('div');
  el.className = 'mascot';
  el.style.setProperty('--size', size);
  const body = document.createElement('div');
  body.className = 'mascot-body';
  const say = document.createElement('div');
  say.className = 'mascot-say en';
  say.hidden = true;
  el.append(body);
  if (bubble) el.append(say);

  let current = null;
  let moodTimer = 0;
  let sayTimer = 0;
  const offs = [];
  const calm = reducedMotion();

  const render = (m) => {
    if (m === current) return;
    current = m;
    body.innerHTML = '';
    const img = document.createElement('img');
    img.src = mascotDataUrl(m);
    img.alt = '';
    img.draggable = false;
    body.append(img);
  };
  render(mood);

  // Hồ sơ lite (ClassIn X): không nhún lặp vô hạn (giữ giao diện đứng yên). wave/cheer/sad/wow vẫn chạy khi có sự kiện.
  const loop = PERF.idle && !calm;
  const idle = !loop ? null : gsap.to(body, { y: -3, duration: 1.2, yoyo: true, repeat: -1, ease: 'sine.inOut' });


  const api = {
    el,
    setMood(m, ms = 0) {
      clearTimeout(moodTimer);
      render(m);
      if (ms) moodTimer = setTimeout(() => render('idle'), ms);
    },
    say(text, ms = 2200) {
      if (!bubble) return;
      clearTimeout(sayTimer);
      say.textContent = text;
      say.hidden = false;
      gsap.fromTo(say, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(2.5)' });
      if (ms) sayTimer = setTimeout(() => (say.hidden = true), ms);
    },
    cheer() {
      api.setMood('thumb', 1600);
      if (calm) return;
      gsap.timeline()
        .to(body, { y: -16, duration: 0.2, ease: 'power2.out' })
        .to(body, { y: 0, duration: 0.25, ease: 'bounce.out' });
    },
    sad() {
      api.setMood('sad', 1500);
      if (calm) return;
      gsap.fromTo(body, { y: 4 }, { y: 0, duration: 0.5, ease: 'power2.out' });
    },
    wow() {
      api.setMood('win', 1400);
      if (!calm) gsap.fromTo(body, { y: 0 }, { y: -18, duration: 0.2, yoyo: true, repeat: 1, ease: 'power2.out' });
    },
    wave() {
      api.setMood('menu', 2200);
      if (!calm) gsap.fromTo(body, { y: 0 }, { y: -8, duration: 0.25, yoyo: true, repeat: 3, ease: 'sine.inOut' });
    },
    destroy() {
      clearTimeout(moodTimer);
      clearTimeout(sayTimer);
      if (idle) idle.kill();
      gsap.killTweensOf([body, say]);
      offs.forEach((f) => f());
      el.remove();
    },
  };

  if (react) {
    const cheers = ['Yay!', 'Great!', 'Super!', 'Well done!', 'Awesome!'];
    // 2 bé bấm liên tục: tối đa 1 lần phản ứng mỗi 0,7 s, không hiện bong bóng chữ (đỡ giật, đỡ rối mắt).
    let lastReact = 0;
    const throttled = () => {
      const now = performance.now();
      if (now - lastReact < 700) return true;
      lastReact = now;
      return false;
    };
    offs.push(bus.on('correct', (data) => {
      if (throttled()) return;
      api.cheer();
      if (!data.duel && Math.random() < 0.35) api.say(cheers[Math.floor(Math.random() * cheers.length)], 1200);
    }));
    offs.push(bus.on('wrong', (data) => {
      if (throttled()) return;
      api.sad();
      if (!data.duel && Math.random() < 0.3) api.say('Oops!', 1000);
    }));
    offs.push(bus.on('win', () => {
      api.setMood('win', 2600);
      if (!calm) gsap.fromTo(body, { y: 0 }, { y: -22, duration: 0.25, yoyo: true, repeat: 3, ease: 'power2.out' });
      api.say('Hooray!', 2000);
    }));
    offs.push(bus.on('streak', ({ count }) => {
      api.wow();
      api.say(`${count} in a row!`, 1600);
    }));
  }
  return api;
}
