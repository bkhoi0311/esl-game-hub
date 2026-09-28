// Mascot "Lumi": bạn nhỏ tròn màu xanh ClassIn, có mầm lá trên đầu. Vẽ bằng SVG (không cần file ảnh).
// Tâm trạng: idle, happy, sad, wow, think. Tự chớp mắt, thở nhẹ; reo khi đúng, buồn khi sai (nghe kênh sự kiện).
import { gsap } from 'gsap';
import { bus, reducedMotion } from './events.js';

const INK = '#1c1f25';

// Chuỗi SVG (dùng cả cho Phaser: load.svg từ data URI).
export function mascotSvg(mood = 'idle', { size = 200 } = {}) {
  const eyes = {
    idle: `<g class="m-eyes-open">
        <ellipse cx="78" cy="104" rx="13" ry="16" fill="#fff" stroke="${INK}" stroke-width="4"/>
        <ellipse cx="122" cy="104" rx="13" ry="16" fill="#fff" stroke="${INK}" stroke-width="4"/>
        <circle class="m-pupil" cx="81" cy="107" r="7.5" fill="${INK}"/><circle class="m-pupil" cx="125" cy="107" r="7.5" fill="${INK}"/>
        <circle cx="84" cy="103" r="2.8" fill="#fff"/><circle cx="128" cy="103" r="2.8" fill="#fff"/>
      </g>`,
    happy: `<path d="M65 108q13-16 26 0M109 108q13-16 26 0" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`,
    sad: `<path d="M66 100q12 10 24 4M110 104q12 6 24-4" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
        <path d="M70 114q-5 10 0 14q5-4 0-14z" fill="#6cc7ff" stroke="${INK}" stroke-width="2.5"/>`,
    wow: `<circle cx="78" cy="103" r="14" fill="#fff" stroke="${INK}" stroke-width="4"/><circle cx="122" cy="103" r="14" fill="#fff" stroke="${INK}" stroke-width="4"/>
        <circle cx="78" cy="103" r="6" fill="${INK}"/><circle cx="122" cy="103" r="6" fill="${INK}"/>`,
    think: `<ellipse cx="78" cy="104" rx="13" ry="16" fill="#fff" stroke="${INK}" stroke-width="4"/>
        <ellipse cx="122" cy="104" rx="13" ry="16" fill="#fff" stroke="${INK}" stroke-width="4"/>
        <circle cx="83" cy="98" r="7" fill="${INK}"/><circle cx="127" cy="98" r="7" fill="${INK}"/>`,
  };
  const mouth = {
    idle: `<path d="M88 132q12 10 24 0" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
    happy: `<path d="M82 128q18 26 36 0z" fill="#ff5a7a" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/><path d="M92 140q8 5 16 0" fill="#ffb3c1"/>`,
    sad: `<path d="M88 140q12-10 24 0" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
    wow: `<ellipse cx="100" cy="136" rx="9" ry="11" fill="#ff5a7a" stroke="${INK}" stroke-width="5"/>`,
    think: `<path d="M90 136h18" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
  };
  const arms = mood === 'happy'
    ? `<g class="m-arm-l"><path d="M40 118q-22-16-20-40" fill="none" stroke="${INK}" stroke-width="14" stroke-linecap="round"/><path d="M40 118q-22-16-20-40" fill="none" stroke="#39d153" stroke-width="7" stroke-linecap="round"/></g>
       <g class="m-arm-r"><path d="M160 118q22-16 20-40" fill="none" stroke="${INK}" stroke-width="14" stroke-linecap="round"/><path d="M160 118q22-16 20-40" fill="none" stroke="#39d153" stroke-width="7" stroke-linecap="round"/></g>`
    : `<g class="m-arm-l"><path d="M40 128q-18 6-24 24" fill="none" stroke="${INK}" stroke-width="14" stroke-linecap="round"/><path d="M40 128q-18 6-24 24" fill="none" stroke="#39d153" stroke-width="7" stroke-linecap="round"/></g>
       <g class="m-arm-r"><path d="M160 128q18 6 24 24" fill="none" stroke="${INK}" stroke-width="14" stroke-linecap="round"/><path d="M160 128q18 6 24 24" fill="none" stroke="#39d153" stroke-width="7" stroke-linecap="round"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${size}" height="${size}" aria-hidden="true">
    <defs>
      <radialGradient id="lumi-body" cx="40%" cy="30%" r="75%">
        <stop offset="0" stop-color="#8af59a"/><stop offset=".55" stop-color="#2fd24a"/><stop offset="1" stop-color="#04a809"/>
      </radialGradient>
    </defs>
    <ellipse cx="100" cy="190" rx="52" ry="7" fill="#000" opacity=".12"/>
    <ellipse cx="76" cy="180" rx="16" ry="9" fill="#0a8a0f" stroke="${INK}" stroke-width="4"/>
    <ellipse cx="124" cy="180" rx="16" ry="9" fill="#0a8a0f" stroke="${INK}" stroke-width="4"/>
    ${arms}
    <g class="m-sprout">
      <path d="M100 46q-2-16 4-26" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
      <path d="M103 24q-22-14-34 2q18 10 34-2z" fill="#bbee23" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M104 22q18-18 34-6q-14 16-34 6z" fill="#7fe04a" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    </g>
    <path d="M100 42c42 0 66 34 66 76c0 40-28 62-66 62s-66-22-66-62c0-42 24-76 66-76z" fill="url(#lumi-body)" stroke="${INK}" stroke-width="5"/>
    <ellipse cx="100" cy="152" rx="36" ry="22" fill="#fff" opacity=".22"/>
    <path d="M58 70q10-14 26-18" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".55"/>
    <ellipse cx="60" cy="124" rx="11" ry="7" fill="#ff7aa8" opacity=".6"/>
    <ellipse cx="140" cy="124" rx="11" ry="7" fill="#ff7aa8" opacity=".6"/>
    <g class="m-face">${eyes[mood] || eyes.idle}<g class="m-blink" opacity="0"><path d="M65 106h26M109 106h26" stroke="${INK}" stroke-width="6" stroke-linecap="round"/></g>${mouth[mood] || mouth.idle}</g>
  </svg>`;
}

export function mascotDataUrl(mood = 'idle') {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(mascotSvg(mood, { size: 256 }));
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
  let blinkTimer = 0;
  const offs = [];
  const calm = reducedMotion();

  const render = (m) => {
    if (m === current) return;
    current = m;
    body.innerHTML = mascotSvg(m);
  };
  render(mood);

  const idle = calm ? null : gsap.to(body, { scaleY: 0.97, scaleX: 1.02, y: 2, transformOrigin: '50% 100%', duration: 1.1, yoyo: true, repeat: -1, ease: 'sine.inOut' });

  const blink = () => {
    const b = body.querySelector('.m-blink');
    const open = body.querySelector('.m-eyes-open');
    if (b && open) {
      open.setAttribute('opacity', '0');
      b.setAttribute('opacity', '1');
      setTimeout(() => {
        open.removeAttribute('opacity');
        b.setAttribute('opacity', '0');
      }, 140);
    }
    blinkTimer = setTimeout(blink, 2200 + Math.random() * 2600);
  };
  blinkTimer = setTimeout(blink, 1500);

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
      api.setMood('happy', 1600);
      if (calm) return;
      gsap.timeline()
        .to(body, { y: -26, scaleY: 1.06, scaleX: 0.95, duration: 0.2, ease: 'power2.out' })
        .to(body, { y: 0, scaleY: 0.92, scaleX: 1.08, duration: 0.18, ease: 'power2.in' })
        .to(body, { scaleY: 1, scaleX: 1, duration: 0.25, ease: 'elastic.out(1, 0.4)' });
      gsap.fromTo(body, { rotation: -8 }, { rotation: 0, duration: 0.6, ease: 'elastic.out(1, 0.3)' });
    },
    sad() {
      api.setMood('sad', 1500);
      if (calm) return;
      gsap.fromTo(body, { x: -5 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.2)' });
    },
    wow() {
      api.setMood('wow', 1200);
      if (!calm) gsap.fromTo(body, { scale: 0.85 }, { scale: 1, duration: 0.5, ease: 'back.out(3)' });
    },
    wave() {
      api.setMood('happy', 1400);
      if (!calm) gsap.fromTo(body, { rotation: -10 }, { rotation: 10, duration: 0.18, yoyo: true, repeat: 5, transformOrigin: '50% 90%', onComplete: () => gsap.set(body, { rotation: 0 }) });
    },
    destroy() {
      clearTimeout(moodTimer);
      clearTimeout(sayTimer);
      clearTimeout(blinkTimer);
      if (idle) idle.kill();
      gsap.killTweensOf([body, say]);
      offs.forEach((f) => f());
      el.remove();
    },
  };

  if (react) {
    const cheers = ['Yay!', 'Great!', 'Super!', 'Well done!', 'Awesome!'];
    offs.push(bus.on('correct', () => {
      api.cheer();
      if (Math.random() < 0.35) api.say(cheers[Math.floor(Math.random() * cheers.length)], 1200);
    }));
    offs.push(bus.on('wrong', () => {
      api.sad();
      if (Math.random() < 0.3) api.say('Oops!', 1000);
    }));
    offs.push(bus.on('win', () => {
      api.cheer();
      api.say('Hooray!', 2000);
    }));
    offs.push(bus.on('streak', ({ count }) => {
      api.wow();
      api.say(`${count} in a row!`, 1600);
    }));
  }
  return api;
}
