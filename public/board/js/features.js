// Cờ tính năng của Bảng. Bật lại phần Đề: đổi DEFAULTS.deck thành true, hoặc thêm ?deck=1 vào URL.
export const DEFAULTS = { deck: false, snip: true };
export function readFeatures(search, hash) {
  const q = new URLSearchParams(search || '');
  const f = Object.assign({}, DEFAULTS);
  const d = q.get('deck');
  if (d === '1') f.deck = true;
  else if (d === '0') f.deck = false;
  else if (q.get('src')) f.deck = true;   // ?src=lib:... / math vẫn mở đề
  if (q.get('snip') === '0') f.snip = false;
  return f;
}
export const FEATURES = typeof location === 'undefined' ? Object.assign({}, DEFAULTS) : readFeatures(location.search, location.hash);
