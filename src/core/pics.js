// Hình cho từ vựng: học sinh nhìn hình để hiểu nghĩa, KHÔNG hiện tiếng Việt.
// Kho: src/data/pics.json (từ -> mã emoji Noto, hình ở public/pics/emoji_u<mã>.svg, Apache 2.0; hoặc "#20" = chữ số to).
// Từ không vẽ được (because, already...): dùng câu ví dụ tiếng Anh đục lỗ "I have ___ friends." thay cho hình.
// Ảnh giáo viên tự gắn (v.image, link http) được ưu tiên.
import PICS from '../data/pics.json';
import { h } from './ui.js';
import { getQuestions } from './content.js';

const BASE = `${import.meta.env.BASE_URL}pics/`;

// Chữ có dấu tiếng Việt, so theo mã ký tự (không viết thẳng chữ Việt: bộ quét i18n coi là chuỗi chưa dịch).
const VI_RANGES = [[0xc0, 0xc3], [0xc8, 0xca], [0xcc, 0xcd], [0xd2, 0xd5], [0xd9, 0xda], [0xdd, 0xdd], [0xe0, 0xe3], [0xe8, 0xea],
  [0xec, 0xed], [0xf2, 0xf5], [0xf9, 0xfa], [0xfd, 0xfd], [0x102, 0x103], [0x110, 0x111], [0x128, 0x129], [0x168, 0x169],
  [0x1a0, 0x1a1], [0x1af, 0x1b0], [0x1ea0, 0x1ef9]];
export function hasVietnamese(s) {
  for (const ch of String(s || '')) {
    const c = ch.codePointAt(0);
    if (c >= 0xc0 && VI_RANGES.some(([a, b]) => c >= a && c <= b)) return true;
  }
  return false;
}

const norm = (w) => String(w || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Mã hình của 1 từ (thử cả dạng bỏ chú thích "(month)", số nhiều -s/-es), hoặc null.
function picCode(word) {
  const k = norm(word);
  if (!k) return null;
  const tries = [k, k.replace(/\s*\(.*?\)\s*/g, ''), k.replace(/es$/, ''), k.replace(/s$/, ''), k.replace(/ies$/, 'y')];
  for (const c of tries) if (PICS[c]) return PICS[c];
  return null;
}

// Câu ví dụ đục lỗ chỗ có từ (cả dạng -s/-ed/-ing), hoặc null nếu câu không chứa từ.
export function clozeOf(word, example) {
  const w = String(word || '').trim().replace(/\s*\(.*?\)\s*/g, '');
  const ex = String(example || '').trim();
  if (!w || !ex || hasVietnamese(ex)) return null;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const forms = [new RegExp(`\\b${esc(w)}(?:s|es|ed|d|ing|'s)?\\b`, 'i')];
  if (w.length > 4) forms.push(new RegExp(`\\b${esc(w.slice(0, -1))}\\w*\\b`, 'i'));
  for (const re of forms) if (re.test(ex)) return ex.replace(re, '___');
  return null;
}

// { type: 'img', src, hint? } | { type: 'digits', text } | { type: 'cloze', text } | null
// Mã có dấu "~" = hình dễ nhầm (father 👨, fantastic 🤩): luôn kèm câu gợi ý đục lỗ (hint); không có câu thì chỉ dùng câu/bỏ.
export function picOf(item) {
  const v = typeof item === 'string' ? { word: item } : item || {};
  if (/^https?:\/\//i.test(v.image || '')) return { type: 'img', src: v.image };
  const code = picCode(v.word);
  const text = clozeOf(v.word, v.example);
  if (code && code[0] === '#') return { type: 'digits', text: code.slice(1) };
  if (code && code[0] === '~') return text ? { type: 'img', src: `${BASE}emoji_u${code.slice(1)}.svg`, hint: text } : null;
  if (code) return { type: 'img', src: `${BASE}emoji_u${code}.svg` };
  return text ? { type: 'cloze', text } : null;
}

// Có hình thật (ảnh / chữ số), không phải câu đục lỗ.
export const isPicture = (p) => Boolean(p && p.type !== 'cloze');

// Phần tử DOM hiển thị hình (dùng chung cho mọi game DOM).
export function picNode(pic, cls = '') {
  if (!pic) return null;
  if (pic.type === 'img' && pic.hint) {
    return h('span', { class: `pic pic-hinted ${cls}` },
      h('img', { class: 'pic-img', src: pic.src, alt: '', draggable: false }), h('span', { class: 'pic-hint' }, pic.hint));
  }
  if (pic.type === 'img') return h('img', { class: `pic pic-img ${cls}`, src: pic.src, alt: '', draggable: false });
  if (pic.type === 'digits') return h('span', { class: `pic pic-digits ${cls}` }, pic.text);
  return h('span', { class: `pic pic-cloze ${cls}` }, pic.text);
}

// ---------- Câu hỏi: đổi câu có tiếng Việt sang câu hình (gói cũ, link cũ, câu Soạn bài sinh ra) ----------

const lc = (s) => norm(s);

// Trả về câu đã đổi, hoặc null nếu không đổi được (câu bị bỏ, không cho học sinh thấy tiếng Việt).
// Câu hình có thêm q.pic = từ tiếng Anh để game vẽ hình (picOf(q.pic)).
export function studentQuestion(q, vocab = []) {
  if (!q) return null;
  const byMeaning = new Map();
  const byWord = new Map();
  vocab.forEach((v) => {
    if (v.meaning) byMeaning.set(lc(v.meaning), v);
    if (v.word) byWord.set(lc(v.word), v);
  });
  const itemOf = (w) => byWord.get(lc(w)) || { word: w };
  const viText = (s) => hasVietnamese(s) || byMeaning.has(lc(s));
  const out = { ...q, options: [...q.options] };

  // Câu hình: "What is this?" + hình; từ không vẽ được thì câu đục lỗ làm đề.
  const asPicture = (word) => {
    const pic = picOf(itemOf(word));
    if (!pic) return null;
    if (pic.hint) { out.prompt = pic.hint; out.pic = word; out.picBare = true; } // hình nhỏ + câu gợi ý làm đề
    else if (isPicture(pic)) { out.prompt = 'What is this?'; out.pic = word; } else { out.prompt = pic.text; delete out.pic; }
    return out;
  };

  let m = /^What does "(.+)" mean\?$/.exec(q.prompt);
  if (m && q.options.some(viText)) {
    const word = m[1];
    // Đáp án nhiễu tiếng Việt -> từ tiếng Anh có nghĩa đó; thiếu thì lấy từ khác trong bài.
    const used = new Set([lc(word)]);
    const spare = vocab.filter((v) => v.word && !used.has(lc(v.word)));
    out.options = q.options.map((o, i) => {
      if (i === q.answer) return word;
      let w = byMeaning.get(lc(o))?.word;
      if (!w || used.has(lc(w))) w = (spare.find((v) => !used.has(lc(v.word))) || {}).word;
      if (w) used.add(lc(w));
      return w || '';
    });
    if (out.options.some((o) => !o)) return null;
    return asPicture(word);
  }
  m = /^Which word means "(.+)"\?$/.exec(q.prompt);
  if (m) {
    const word = byMeaning.get(lc(m[1]))?.word || q.options[q.answer];
    return asPicture(word);
  }
  m = /^(Find the missing letter: (\S+))\s*\((.+)\)$/.exec(q.prompt);
  if (m) {
    out.prompt = m[1];
    const pic = picOf(itemOf(m[2].replace('_', q.options[q.answer] || '')));
    if (isPicture(pic)) out.pic = m[2].replace('_', q.options[q.answer]);
    return out;
  }
  m = /^Which is the correct spelling\? \((.+)\)$/.exec(q.prompt);
  if (m) {
    out.prompt = 'Which word is spelled correctly?';
    if (isPicture(picOf(itemOf(q.options[q.answer])))) out.pic = q.options[q.answer];
    return out;
  }
  if (hasVietnamese(q.prompt) || q.options.some((o) => hasVietnamese(o))) return null;
  return out;
}

// Câu hỏi cho học sinh của 1 bài: không còn tiếng Việt.
export function studentQuestions(pack) {
  return getQuestions(pack).map((q) => studentQuestion(q, pack.vocab)).filter(Boolean);
}

// Hình trên đề câu hỏi: câu có q.picBare (đề đã là câu gợi ý) thì chỉ vẽ hình, không lặp câu.
export function questionPic(q) {
  if (!q || !q.pic) return null;
  const pic = picOf(q.pic);
  if (!pic) return null;
  return picNode(q.picBare ? { ...pic, hint: undefined } : pic, 'q-pic');
}
