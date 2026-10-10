// Luật chống câu mơ hồ cho bộ sinh câu hỏi (REVIEW-LIBRARY mục c, đợt 4). Module thuần, chỉ dữ liệu + hàm nhỏ.
// Dùng chung cho qgen.js và tools/library/audit.mjs.
import { groupOf } from './categories.js';
import { normKey } from './normalize.js';

// R0.1 Từ không hợp với trẻ: không bao giờ làm đáp án nhiễu (vẫn được là đáp án nếu giáo viên tự nhập).
export const KID_UNSAFE = new Set(['blood', 'axe', 'danger', 'beer', 'wine', 'god', 'gun', 'kill', 'die', 'dead', 'knife', 'hubby']);

// R0.2 Danh từ riêng / viết tắt: kho lưu viết thường nên cần ép chữ hoa khi hiển thị.
export const PROPER = {
  christmas: 'Christmas', easter: 'Easter', halloween: 'Halloween', santa: 'Santa', 'new year': 'New Year', 'father christmas': 'Father Christmas',
  earth: 'Earth', tv: 'TV', dvd: 'DVD', ufo: 'UFO', english: 'English', pe: 'PE',
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
  january: 'January', february: 'February', march: 'March', april: 'April', may: 'May', june: 'June', july: 'July', august: 'August',
  september: 'September', october: 'October', november: 'November', december: 'December',
};
export function display(word) {
  const k = String(word == null ? '' : word).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PROPER, k) ? PROPER[k] : String(word == null ? '' : word);
}
export function isProper(word) {
  return Object.prototype.hasOwnProperty.call(PROPER, String(word == null ? '' : word).trim().toLowerCase());
}
// Viết tắt in hoa hoàn toàn (tv, dvd, ufo, pe): không dùng cho câu chữ còn thiếu.
export function isAbbrev(word) {
  const k = String(word == null ? '' : word).trim().toLowerCase();
  return isProper(k) && PROPER[k] === PROPER[k].toUpperCase() && k.length <= 3;
}

// R1.1 Ma trận nhóm láng giềng (mức cat): hai cat trong cùng một tập là "hàng xóm", nhiễu fill/which không được lấy.
export const NEAR_SETS = [
  ['plant', 'nature', 'weather'],
  ['transport', 'place', 'space'],
  ['weather', 'time', 'nature'],
  ['toy', 'hobby', 'sport', 'music', 'celebration', 'tech'],
  ['house', 'hobby', 'music', 'school', 'thing'],
  ['animal', 'bird', 'insect', 'sea-animal', 'fruit', 'food', 'meal', 'vegetable', 'drink', 'plant', 'fantasy'],
  ['clothes', 'thing', 'school', 'house', 'tech', 'toy'],
  ['color', 'describe', 'feeling', 'weather', 'shape', 'time'],
  ['place', 'house', 'school', 'nature'],
  ['action', 'hobby', 'sport', 'music'],
  ['fantasy', 'people', 'job', 'family'],
];
export function nearCat(a, b) {
  const x = String(a || '').toLowerCase();
  const y = String(b || '').toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  for (let i = 0; i < NEAR_SETS.length; i++) {
    if (NEAR_SETS[i].indexOf(x) >= 0 && NEAR_SETS[i].indexOf(y) >= 0) return true;
  }
  return false;
}
// Cùng siêu nhóm hoặc hàng xóm.
export function closeCat(a, b) {
  if (!a || !b) return false;
  const ga = groupOf(a);
  return (ga && ga === groupOf(b)) || nearCat(a, b);
}

// R1.2 Câu khung chung: ô trống có thể thay bằng rất nhiều từ cùng loại.
export function isGeneric(prompt) {
  const p = String(prompt || '').trim();
  const words = p.split(/\s+/).length;
  if (words <= 6 && /\b(like|likes|love|loves|have|has|see|sees|want|wants|this is|that is|it is|here is|there is)\b/i.test(p)) return true;
  const subj = /^(the|this|that|my|her|his|our|a|an|these|those|your|their)\s+___\s+(is|are|has|have|was|were)\b(.*)$/i.exec(p);
  if (subj && subj[3].trim().split(/\s+/).filter(Boolean).length <= 5) return true;
  if (/\b(is|are|am|was|were)\s+___(\s+(today|now|again))?\s*[.!?]?$/i.test(p)) return true;
  if (/___\s+and\s+\w+\s*[.!?]?$/i.test(p) || /\band\s+___\s*[.!?]?$/i.test(p)) return true;
  if (/\b(in|on|at|under|near|behind|by)\s+the\s+___\s*[.!?]?$/i.test(p) && words <= 7) return true;
  if (/\b(play|plays)\s+(the\s+)?___/i.test(p)) return true;
  if (/\bthere\s+(is|are)\s+an?\s+___/i.test(p)) return true;
  if (/\b(has|have)\s+an?\s+___\s+in\b/i.test(p)) return true;
  if (/\b(buys?|bought)\s+an?\s+___/i.test(p)) return true;
  if (/\b(is|are)\s+(very|so|too|really)\s+___/i.test(p)) return true;
  return false;
}

// R1.5 Danh sách đen: [từ, mảnh câu ví dụ (chữ thường)]; mảnh rỗng = mọi câu ví dụ.
export const FILL_BLACK = [
  ['cards', 'we play cards on rainy days'], ['chess', 'we play chess at the club'], ['beach', 'we play on the beach'],
  ['cave', 'a bat sleeps in the cave'], ['mountain', 'the mountain is covered with snow'], ['dirty', 'my shoes are dirty'],
  ['weak', 'the old dog is weak'], ['drawing', 'this drawing is for my mum'], ['game', ''],
  ['swimming pool', 'the swimming pool is cool and clean'], ['road', 'the road is long and quiet'], ['fish', 'there is a fish in the bowl'],
  ['apple', 'she has an apple in her bag'], ['hot dog', 'she buys a hot dog at the park'], ['cloudy', 'it is cloudy today'],
  ['puppy', 'the puppy is very small'], ['easter', ''], ['santa', ''],
];
export function fillBlacklisted(key, example) {
  const ex = String(example || '').toLowerCase();
  for (let i = 0; i < FILL_BLACK.length; i++) {
    const b = FILL_BLACK[i];
    if (b[0] === key && (!b[1] || ex.indexOf(b[1]) >= 0)) return true;
  }
  return false;
}

// R2.1 Từ chỉ loại tiếng Việt: bỏ ở đầu nghĩa trước khi so sánh.
const CLASSIFIERS = ['con', 'cái', 'quả', 'chiếc', 'bông', 'ngọn', 'khu', 'đôi', 'tấm', 'cục', 'quyển', 'món', 'bức', 'người', 'chú', 'lính', 'cây', 'củ', 'trái', 'hòn', 'tảng', 'bộ', 'môn', 'võ'];
export function stripClassifier(meaning) {
  const m = String(meaning == null ? '' : meaning).trim().toLowerCase().replace(/\s+/g, ' ');
  const sp = m.indexOf(' ');
  if (sp > 0 && CLASSIFIERS.indexOf(m.slice(0, sp)) >= 0) return m.slice(sp + 1);
  return m;
}
// Hai nghĩa "va nhau": rỗng, bằng nhau hoặc chứa nhau (sau khi bỏ từ chỉ loại).
export function meaningClash(a, b) {
  const x = stripClassifier(a);
  const y = stripClassifier(b);
  return !x || !y || x === y || x.indexOf(y) >= 0 || y.indexOf(x) >= 0;
}

// R2.2 Từ bao (hypernym): không đặt cạnh từ cụ thể cùng nhóm/gần nhóm.
export const GENERIC_WORDS = new Set(['bird', 'animal', 'fish', 'insect', 'toy', 'game', 'hobby', 'food', 'fruit', 'drink', 'music', 'picture', 'sport', 'job', 'place', 'plant', 'tree', 'flower', 'thing', 'brush', 'phone', 'chicken', 'meal', 'vegetable', 'clothes', 'vehicle', 'building', 'shop', 'weather', 'colour', 'color', 'shape', 'number']);
export function isGenericWord(key) {
  return GENERIC_WORDS.has(String(key || ''));
}

// R2.3 Nhóm gần nghĩa: không để hai từ cùng nhóm trong một câu.
export const SYN_GROUPS = [
  ['tired', 'sleepy'], ['scared', 'afraid', 'worried', 'frightened'], ['jacket', 'coat'], ['present', 'gift'], ['phone', 'mobile phone'],
  ['get up', 'wake up'], ['picture', 'painting', 'drawing'], ['forest', 'jungle', 'wood'], ['shop', 'market', 'supermarket', 'store'],
  ['film', 'video', 'movie'], ['chicken', 'hen', 'rooster'], ['cup', 'glass', 'mug'], ['plate', 'bowl', 'dish'], ['town', 'city', 'village'],
  ['road', 'street'], ['ship', 'boat'], ['computer', 'laptop'], ['big', 'tall', 'large'], ['small', 'short', 'little'], ['happy', 'excited', 'glad'],
  ['sad', 'sorry', 'unhappy'], ['quick', 'fast'], ['ill', 'sick'], ['gray', 'grey'], ['sofa', 'armchair', 'couch'], ['trousers', 'jeans', 'pants'],
  ['rabbit', 'bunny'], ['dog', 'puppy'], ['cat', 'kitten'], ['sea', 'ocean'], ['lake', 'river', 'pond'], ['hill', 'mountain'], ['plane', 'aeroplane', 'airplane'],
  ['tv', 'television'], ['car', 'taxi'], ['bike', 'bicycle'], ['mum', 'mother', 'mom'], ['dad', 'father'], ['clever', 'smart'], ['unhappy', 'sad'],
];
const SYN_MAP = (() => {
  const m = new Map();
  SYN_GROUPS.forEach((g, i) => g.forEach((w) => { const k = normKey(w); if (!m.has(k)) m.set(k, i); }));
  return m;
})();
export function synOf(key) {
  const v = SYN_MAP.get(normKey(key));
  return v === undefined ? -1 : v;
}
export function synClash(a, b) {
  const x = synOf(a);
  return x >= 0 && x === synOf(b);
}

// R3 Chỉ các nhóm tự nhiên mới sinh câu "Which one is ...?".
export const WHICH_CATS = new Set(['fruit', 'vegetable', 'drink', 'animal', 'bird', 'insect', 'sea-animal', 'body', 'clothes', 'transport', 'job', 'color', 'number', 'sport', 'family']);
