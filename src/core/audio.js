// Âm thanh dùng chung: đọc tiếng Anh (Web Speech API) và âm hiệu đúng/sai/thắng.
// Âm hiệu tổng hợp bằng Web Audio nên không cần file âm thanh, chạy được offline.
import { getSettings } from './settings.js';

// ---------- TTS ----------

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

export function ttsSupported() {
  return Boolean(synth && window.SpeechSynthesisUtterance);
}

// Danh sách giọng nạp bất đồng bộ trên Chrome: chờ tối đa 1.5 giây.
function loadVoices() {
  if (!ttsSupported()) return Promise.resolve([]);
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener('voiceschanged', done);
      clearTimeout(timer);
      resolve(synth.getVoices());
    };
    const timer = setTimeout(done, 1500);
    synth.addEventListener('voiceschanged', done);
  });
}

export async function getEnglishVoices() {
  const voices = await loadVoices();
  return voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
}

export async function hasEnglishVoice() {
  return (await getEnglishVoices()).length > 0;
}

// Ưu tiên giọng đúng accent (en-US / en-GB), rồi đến bất kỳ giọng tiếng Anh nào.
async function pickVoice(accent) {
  const voices = await getEnglishVoices();
  const norm = (lang) => lang.replace('_', '-').toLowerCase();
  const exact = voices.filter((v) => norm(v.lang) === accent.toLowerCase());
  const pool = exact.length ? exact : voices;
  return pool.find((v) => v.localService) || pool[0] || null;
}

export function stopSpeaking() {
  if (ttsSupported()) synth.cancel();
}

// Đọc 1 câu tiếng Anh. Luôn resolve (kể cả khi máy không có giọng), trả về true nếu đã đọc.
export async function speak(text, options = {}) {
  if (!ttsSupported() || !text) return false;
  const { ttsRate, accent } = getSettings();
  const voice = await pickVoice(options.accent || accent);
  if (!voice) return false;

  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = options.rate ?? ttsRate;
  u.pitch = 1;

  return new Promise((resolve) => {
    // Phòng trường hợp trình duyệt không bắn sự kiện end.
    const fallback = setTimeout(() => resolve(true), 1000 + text.length * 120);
    const finish = () => {
      clearTimeout(fallback);
      resolve(true);
    };
    u.onend = finish;
    u.onerror = finish;
    synth.speak(u);
  });
}

// ---------- Âm hiệu ----------

let ctx = null;

function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(ac, { freq, start, dur, type = 'sine', gain = 0.2, slideTo }) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

const SOUNDS = {
  correct: (ac, t) => {
    tone(ac, { freq: 660, start: t, dur: 0.12, type: 'triangle' });
    tone(ac, { freq: 990, start: t + 0.1, dur: 0.2, type: 'triangle' });
  },
  wrong: (ac, t) => {
    tone(ac, { freq: 220, start: t, dur: 0.35, type: 'sawtooth', gain: 0.12, slideTo: 140 });
  },
  win: (ac, t) => {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone(ac, { freq: f, start: t + i * 0.12, dur: i === 3 ? 0.45 : 0.14, type: 'triangle' }),
    );
  },
  tick: (ac, t) => tone(ac, { freq: 1200, start: t, dur: 0.05, type: 'square', gain: 0.06 }),
  pop: (ac, t) => tone(ac, { freq: 400, start: t, dur: 0.12, type: 'sine', slideTo: 900 }),
};

export function playSound(name) {
  if (!getSettings().sound || !SOUNDS[name]) return;
  const ac = audioCtx();
  if (!ac) return;
  SOUNDS[name](ac, ac.currentTime + 0.01);
}
