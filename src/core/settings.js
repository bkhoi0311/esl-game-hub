// Cài đặt của giáo viên (âm thanh, TTS, camera). Lưu trong trình duyệt của máy đang dùng.
const KEY = 'eslhub.settings';

const DEFAULTS = {
  sound: true,
  ttsRate: 0.9, // 0.5 - 1.5
  accent: 'en-US', // 'en-US' | 'en-GB'
  cameraId: '',
  voiceMode: 'omni', // 'omni' = giọng OmniVoice thu sẵn (thiếu thì giọng máy) | 'web' = chỉ giọng máy
};

let settings = load();
const listeners = new Set();

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getSettings() {
  return settings;
}

export function updateSettings(patch) {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // bỏ qua: vẫn dùng được trong phiên hiện tại
  }
  listeners.forEach((fn) => fn(settings));
  return settings;
}

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
