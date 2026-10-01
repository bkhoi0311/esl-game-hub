// Hiệu ứng "juice" dùng chung cho các game HTML: nổ sao/tim, chữ bay, nảy, rung, pháo giấy.
// Tôn trọng prefers-reduced-motion. Game Phaser dùng hiệu ứng riêng của Phaser.
import { gsap } from 'gsap';
import confetti from 'canvas-confetti';
import { bus, reducedMotion } from './events.js';
import { playSound } from './audio.js';

const COLORS = ['#ffd23f', '#04bc09', '#00a2fd', '#fd3cc6', '#ff9800', '#bbee23'];
const SHAPES = {
  star: '<svg viewBox="0 0 24 24"><path d="M12 1.5l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.6l-6.4 3.5L7 14l-5.3-5 7.2-.9z" fill="currentColor" stroke="#1c1f25" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 21s-8.5-5.3-8.5-11.2A4.8 4.8 0 0 1 12 6.6a4.8 4.8 0 0 1 8.5 3.2C20.5 15.7 12 21 12 21z" fill="currentColor" stroke="#1c1f25" stroke-width="1.6"/></svg>',
  dot: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="currentColor" stroke="#1c1f25" stroke-width="1.6"/></svg>',
};

let layer = null;
function fxLayer() {
  if (!layer || !layer.isConnected) {
    layer = document.createElement('div');
    layer.className = 'fx-layer';
    document.body.appendChild(layer);
  }
  return layer;
}

export function centerOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// Nổ hạt tại (x, y) toạ độ màn hình, hoặc tại tâm phần tử.
export function burst(at, { count = 16, shapes = ['star', 'dot', 'heart'], colors = COLORS, spread = 1 } = {}) {
  const { x, y } = at instanceof Element ? centerOf(at) : at;
  const calm = reducedMotion();
  const n = calm ? Math.min(6, count) : count;
  const unit = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const host = fxLayer();
  for (let i = 0; i < n; i++) {
    const p = document.createElement('span');
    p.className = 'fx-p';
    p.innerHTML = SHAPES[shapes[i % shapes.length]];
    p.style.color = colors[i % colors.length];
    const s = (0.9 + Math.random() * 1.1) * unit;
    p.style.width = p.style.height = `${s}px`;
    p.style.left = `${x - s / 2}px`;
    p.style.top = `${y - s / 2}px`;
    host.appendChild(p);
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
    const d = (3 + Math.random() * 5) * unit * spread;
    gsap.fromTo(p, { scale: 0.2, opacity: 1, rotation: 0 }, {
      x: Math.cos(a) * d,
      y: Math.sin(a) * d - (calm ? 0 : unit * 1.5),
      scale: 1,
      rotation: calm ? 0 : (Math.random() - 0.5) * 360,
      duration: 0.55 + Math.random() * 0.3,
      ease: 'power3.out',
      onComplete: () => gsap.to(p, { opacity: 0, y: `+=${unit}`, duration: 0.3, onComplete: () => p.remove() }),
    });
  }
}

// Chữ bay lên ("+1", "Great!").
export function floatText(at, text, { color = '#04bc09' } = {}) {
  const { x, y } = at instanceof Element ? centerOf(at) : at;
  const t = document.createElement('span');
  t.className = 'fx-text en';
  t.textContent = text;
  t.style.color = color;
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
  fxLayer().appendChild(t);
  gsap.fromTo(t, { y: 0, scale: 0.4, opacity: 0 }, { y: -60, scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(2.5)', onComplete: () => gsap.to(t, { opacity: 0, y: -90, duration: 0.4, delay: 0.25, onComplete: () => t.remove() }) });
}

// Nảy 3 nhịp: lấy đà (co 0.94) -> nảy (1.12) -> lắng (elastic). Bấm liên tục thì tween mới thay tween cũ.
export function pop(el, scale = 1.12) {
  if (!el || reducedMotion()) return;
  gsap.timeline({ defaults: { overwrite: 'auto' }, onComplete: () => gsap.set(el, { clearProps: 'scale' }) })
    .to(el, { scale: 0.94, duration: 0.07, ease: 'power1.in' })
    .to(el, { scale, duration: 0.18, ease: 'back.out(3)' })
    .to(el, { scale: 1, duration: 0.4, ease: 'elastic.out(1, 0.5)' });
}

// Rung nhẹ khi sai: biên độ giảm dần 8 -> 0 px trong ~360 ms (không giật, không chặn lần bấm sau).
export function shake(el) {
  if (!el) return;
  if (reducedMotion()) return;
  const unit = (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16;
  gsap.to(el, { keyframes: { x: [0, 8, -7, 5, -3, 1, 0].map((v) => v * unit) }, duration: 0.36, ease: 'none', overwrite: 'auto', onComplete: () => gsap.set(el, { clearProps: 'x' }) });
}

// Bắn pháo giấy (chỉ dùng cho khoảnh khắc lớn: thắng, xong màn).
export function celebrate(origin = { x: 0.5, y: 0.6 }) {
  confetti({ particleCount: 150, spread: 95, origin, colors: COLORS, disableForReducedMotion: true });
}

// Phản hồi nhanh cho 1 lần trả lời: âm thanh (kèm sự kiện cho mascot) + hiệu ứng tại phần tử.
export function feedback(ok, el, { text, sound = true } = {}) {
  if (sound) playSound(ok ? 'correct' : 'wrong');
  if (!el) return;
  if (ok) {
    // Chuỗi đúng: nổ to và xa hơn mỗi bậc, dừng tăng ở bậc 5.
    const level = Math.min(streak, 5);
    burst(el, { count: 14 + level * 5, spread: 1 + level * 0.12 });
    pop(el);
    if (text) floatText(el, text);
  } else {
    shake(el);
    if (text) floatText(el, text, { color: '#c25700' });
  }
}

// Khoảnh khắc chuỗi đúng (hiếm, nên làm lớn): chữ nảy từng ký tự + tia sáng + pháo hạt, ~1,6 s.
// Không chặn thao tác (pointer-events: none) để đội còn lại vẫn chơi tiếp được.
export function streakMoment(count) {
  const calm = reducedMotion();
  const host = fxLayer();
  const word = `${count} in a row!`;
  const box = document.createElement('div');
  box.className = 'fx-streak en';
  box.innerHTML = `<span class="fx-rays"></span><span class="fx-streak-text">${[...word].map((c) => `<b>${c === ' ' ? '&nbsp;' : c}</b>`).join('')}</span>`;
  host.appendChild(box);
  const letters = box.querySelectorAll('b');
  const done = () => box.remove();
  if (calm) {
    gsap.fromTo(box, { opacity: 0 }, { opacity: 1, duration: 0.2, yoyo: true, repeat: 1, repeatDelay: 1.2, onComplete: done });
    return;
  }
  const r = box.getBoundingClientRect();
  gsap.timeline({ onComplete: done })
    .fromTo(box.querySelector('.fx-rays'), { scale: 0.4, opacity: 0, rotation: -20 }, { scale: 1, opacity: 1, rotation: 20, duration: 1.4, ease: 'power2.out' }, 0)
    .fromTo(letters, { y: 40, scale: 0.4, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(3)', stagger: 0.035 }, 0.05)
    .add(() => {
      burst({ x: r.left + r.width * 0.2, y: r.top + r.height / 2 }, { count: 18, spread: 1.3 });
      burst({ x: r.left + r.width * 0.8, y: r.top + r.height / 2 }, { count: 18, spread: 1.3 });
    }, 0.3)
    .to(box, { opacity: 0, scale: 0.96, duration: 0.3, ease: 'power2.in' }, 1.3);
}

// Rời game: xoá ngay mọi hạt, chữ bay, khoảnh khắc chuỗi đúng và pháo giấy còn đang chạy.
export function clearFx() {
  if (layer) {
    gsap.killTweensOf(layer.querySelectorAll('*'));
    layer.textContent = '';
  }
  confetti.reset();
  streak = 0;
}

// Game 2 bé chơi song song (Balloon Pop, Whack-a-Word, Tug of War): "chuỗi đúng" chung không có nghĩa
// và hiệu ứng lớn mỗi 3/5/10 lần đúng làm game giật -> tắt khi game đó đang mở.
let streakEnabled = true;
export function setStreakEnabled(on) {
  streakEnabled = on;
  streak = 0;
}

// Chuỗi trả lời đúng liên tiếp -> sự kiện 'streak' ở mốc 3, 5, 10.
let streak = 0;
bus.on('correct', (data) => {
  if (!streakEnabled || (data && data.duel)) return;
  streak += 1;
  if ([3, 5, 10].includes(streak)) {
    bus.emit('streak', { count: streak });
    playSound('streak');
    streakMoment(streak);
  }
});
bus.on('wrong', () => (streak = 0));
bus.on('reset', () => (streak = 0));
