// Logic thuần của Sentence Race (không DOM) để test bằng node --test. Đặc tả: PLAN-GAMES-V2.md mục 5.

export function shuffle(list, rand = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const MIN_SENTENCES = 6;
export const LENGTHS = { short: [3, 5], medium: [4, 7], long: [5, 9] };
const VI = /[À-ỹđĐ]/; // i18n-keep: có dấu tiếng Việt => không phải câu tiếng Anh (dữ liệu)

// "I eat a banana every morning." -> { tokens: ['I','eat','a','banana','every','morning'], end: '.' } | null
export function tokenize(sentence) {
  let s = String(sentence || '').replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
  if (!s || VI.test(s)) return null;
  let end = '.';
  const m = s.match(/[.?!]+$/);
  if (m) {
    end = m[0][0];
    s = s.slice(0, -m[0].length).trim();
  }
  const tokens = s.split(' ').filter(Boolean);
  if (tokens.length < 3 || tokens.length > 9 || tokens.some((t) => t.length > 14)) return null;
  return { tokens, end };
}

// Câu từ vocab.example, rồi từ câu hỏi có đúng 1 chỗ "___" (thay bằng đáp án đúng). Bỏ trùng (không phân biệt hoa thường).
export function sentencesFromPack(pack) {
  const out = [];
  const seen = new Set();
  const add = (text, source) => {
    const t = tokenize(text);
    if (!t) return;
    const key = `${t.tokens.join(' ').toLowerCase()}${t.end}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ text: String(text).trim(), tokens: t.tokens, end: t.end, source });
  };
  for (const v of (pack && pack.vocab) || []) if (v && v.example) add(v.example, 'example');
  for (const q of (pack && pack.questions) || []) {
    if (!q || typeof q.prompt !== 'string' || !Array.isArray(q.options)) continue;
    if ((q.prompt.match(/_{2,}/g) || []).length !== 1) continue;
    const ans = q.options[q.answer];
    if (!ans || VI.test(ans)) continue;
    add(q.prompt.replace(/_{2,}/, String(ans).trim()), 'question');
  }
  return out;
}

const inRange = (n, [a, b]) => n >= a && n <= b;

export function countsByLength(list) {
  const res = {};
  for (const k of Object.keys(LENGTHS)) res[k] = list.filter((s) => inRange(s.tokens.length, LENGTHS[k])).length;
  return res;
}

export function poolFor(list, lengthKey) {
  const r = LENGTHS[lengthKey] || LENGTHS.medium;
  return list.filter((s) => inRange(s.tokens.length, r));
}

// 'medium' nếu đủ MIN_SENTENCES, không thì mức có nhiều câu nhất.
export function bestLength(list) {
  const c = countsByLength(list);
  if (c.medium >= MIN_SENTENCES) return 'medium';
  return Object.keys(c).sort((a, b) => c[b] - c[a])[0];
}

// Thẻ của 1 câu. keepCaps=false: viết thường chữ đầu của từ ĐẦU câu, trừ "I" và "I'm/I've/I'll/I'd".
export function makeRound(item, { keepCaps = true, rand = Math.random } = {}) {
  const answer = item.tokens.map((t, i) => (i === 0 && !keepCaps && !/^I('|$)/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t));
  let order = shuffle(answer.map((_, i) => i), rand);
  // không để thẻ đã đúng thứ tự sẵn
  for (let k = 0; k < 10 && order.every((v, i) => answer[v] === answer[i]); k++) order = shuffle(order, rand);
  return { answer, end: item.end, tiles: order.map((i) => ({ id: i, text: answer[i] })) };
}

export const keyOf = (t) => t.toLowerCase();
// Thẻ trùng chữ (vd 2 chữ "the") bấm thẻ nào cũng đúng: so theo chữ, không theo id.
export function isNext(round, progress, text) {
  return progress < round.answer.length && keyOf(text) === keyOf(round.answer[progress]);
}
export function hintText(round, progress) {
  return round.answer[progress];
}
