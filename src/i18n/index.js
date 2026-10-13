// API song ngữ cho Hub. KHÔNG chạm window lúc import: module thuần (qgen, content, libfilter...) vẫn chạy trong Node test.
// Trình duyệt: ủy thác cho lõi window.I18N (public/i18n/i18n.js, nạp qua virtual:i18n-core trong boot.js).
// Node (không window): tra bảng VI đã đăng ký bằng addStrings, nên test cũ vẫn thấy đúng chuỗi Việt.
// Xem BUILD-NOTES-I18N-HUB.md (thư mục dự án) về quy ước khoá, quyền sở hữu từ điển và cách thử ?ui=en.
// Khoá chung của lõi (public/i18n/i18n.js) để Node test không trả về tên khoá.
const VI = { 'common.close': 'Đóng', 'common.cancel': 'Huỷ', 'common.done': 'Xong', 'common.start': 'Bắt đầu' }; // i18n-keep: bản sao khoá lõi cho Node
const areas = new Set();
const enLoaded = new Set();
const pending = {};
const core = () => (typeof window !== 'undefined' && window.I18N) || null;

function fmt(v, p) {
  if (v && typeof v === 'object') v = p && p.n === 1 ? v.one : v.other;
  if (typeof v !== 'string') return v;
  return v.replace(/\{(\w+)\}/g, (m, k) => (p && p[k] != null ? String(p[k]) : m));
}

// Đăng ký từ điển VI của một khu vực (idempotent). Gọi ở đầu tệp dùng nó: addStrings('core', CORE_VI).
export function addStrings(area, vi) {
  areas.add(area);
  Object.assign(VI, vi);
  const c = core();
  if (c) c.add({ vi });
}

// boot.js gọi sau khi lõi đã chạy: đẩy các khoá VI đăng ký trước khi lõi có mặt.
export function syncCore() {
  const c = core();
  if (c) c.add({ vi: VI });
}

export function t(key, params) {
  const c = core();
  if (c) return c.t(key, params);
  const v = VI[key];
  return v == null ? key : fmt(v, params);
}
// Dịch sang ngôn ngữ chỉ định (không đổi ngôn ngữ hiện tại). Node chỉ có VI.
export function tIn(l, key, params) {
  const c = core();
  if (c) return c.tIn(l, key, params);
  const v = VI[key];
  return v == null ? key : fmt(v, params);
}
export function lang() { const c = core(); return c ? c.lang() : 'vi'; }
export function onLang(fn) { const c = core(); return c ? c.onLang(fn) : () => {}; }
export function bind(el, key, params, attr) {
  const c = core();
  if (c) return c.bind(el, key, params, attr);
  el.textContent = t(key, params);
  return el;
}
export function withUi(href) { const c = core(); return c ? c.withUi(href) : href; }
export function fmtTime(d) { return d.toLocaleTimeString(lang() === 'en' ? 'en-US' : 'vi-VN'); }

// Chunk EN: import() có literal để Vite tách chunk (bản offline 1 tệp tự gộp vào trong).
// 'main' = en-main (mọi khu vực nằm trong bundle chính); 'soanbai' = soanbai.en (đi cùng lúc nạp panel Soạn bài).
const LOADERS = {
  main: () => import('./en-main.js'),
  soanbai: () => import('./strings/soanbai.en.js'),
};
const chunkOf = (area) => (area === 'soanbai' ? 'soanbai' : 'main');
function loadEn(chunk) {
  if (enLoaded.has(chunk)) return Promise.resolve();
  pending[chunk] = pending[chunk] || LOADERS[chunk]()
    .then((m) => { core().add({ en: m.default }); enLoaded.add(chunk); })
    .finally(() => { delete pending[chunk]; });
  return pending[chunk];
}
// Gọi (await) trước khi dựng phần thuộc khu vực nạp lười (panel Soạn bài). Đang VI: không làm gì.
export function ensureEn(area) { return lang() === 'en' ? loadEn(chunkOf(area)) : Promise.resolve(); }
// Nạp EN của mọi khu vực đã đăng ký (khi bấm cờ EN).
export function preloadEn() {
  const s = new Set(['main']);
  areas.forEach((a) => s.add(chunkOf(a)));
  return Promise.all([...s].map(loadEn));
}

// Công tắc 2 cờ: dùng mountSwitch của lõi, chỉ đổi cách bấm: nạp EN xong mới đổi (không có lúc nửa Việt nửa Anh).
export function mountLangSwitch(host, { cls, onFail } = {}) {
  return core().mountSwitch(host, {
    cls,
    wire: (b, go) => b.addEventListener('click', async (e) => {
      e.preventDefault();
      const code = b.getAttribute('lang');
      if (code === lang()) return;
      if (code === 'en') {
        try { await preloadEn(); } catch (err) { console.error(err); if (onFail) onFail(); return; }
      }
      go();
    }),
  });
}
