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

export function pop(el, scale = 1.12) {
  if (!el || reducedMotion()) return;
  gsap.fromTo(el, { scale }, { scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.4)', clearProps: 'transform' });
}

export function shake(el) {
  if (!el) return;
  if (reducedMotion()) return;
  gsap.fromTo(el, { x: -10 }, { x: 0, duration: 0.5, ease: 'elastic.out(1.2, 0.2)', clearProps: 'transform' });
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
    burst(el);
    pop(el);
    if (text) floatText(el, text);
  } else {
    shake(el);
    if (text) floatText(el, text, { color: '#ff5a00' });
  }
}

// Chuỗi trả lời đúng liên tiếp -> sự kiện 'streak' ở mốc 3, 5, 10.
let streak = 0;
bus.on('correct', () => {
  streak += 1;
  if ([3, 5, 10].includes(streak)) bus.emit('streak', { count: streak });
});
bus.on('wrong', () => (streak = 0));
bus.on('reset', () => (streak = 0));
