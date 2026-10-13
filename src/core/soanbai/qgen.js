// Sinh câu hỏi trắc nghiệm bằng luật từ bảng từ vựng (PLAN-SOANBAI mục D). Thuần: không DOM, không import content.js.
// Tất định theo seed. Chỉ dùng cú pháp có ở Chromium 84.
import { normKey, findWordInText, candidates as formCandidates } from './normalize.js';
import { phraseFor, groupOf, LEVEL_ORDER } from './categories.js';
import { lookup } from './wordbank.js';
import {
  KID_UNSAFE, noMeaningQ, display, isProper, isAbbrev, nearCat, closeCat, isGeneric, fillBlacklisted, meaningClash,
  isGenericWord, synClash, WHICH_CATS, noDistractorFill,
} from './qrules.js';
import { commonWords } from './commonwords.js';

export const QTYPES = ['fill', 'meaning', 'word', 'which', 'letter', 'spell'];
// Loại an toàn (đã qua duyệt REVIEW-LIBRARY): bật sẵn trong panel và dùng cho gói thư viện. fill / which cần giáo viên xem lại.
export const SAFE_QTYPES = ['letter', 'word', 'meaning', 'spell'];
// Gói thư viện: loại không an toàn (fill, which) chỉ chiếm tối đa vài câu mỗi gói và đã qua mọi luật của bộ sinh + audit.mjs.
export const LIBRARY_LIMITS = { fill: 2, which: 2 };
export const QTYPE_LABELS = {
  fill: 'Điền chỗ trống từ câu ví dụ',
  meaning: 'Chọn nghĩa đúng (từ → nghĩa)',
  word: 'Chọn từ đúng (nghĩa → từ)',
  which: 'Which one is a …?',
  letter: 'Chọn chữ cái còn thiếu',
  spell: 'Chọn cách viết đúng',
};
export const QTYPE_SHORT = {
  fill: 'điền chỗ trống', meaning: 'chọn nghĩa', word: 'chọn từ', which: 'Which one', letter: 'chữ còn thiếu', spell: 'chính tả',
};
const REASONS = {
  fill: 'Cần câu ví dụ có chứa từ (đúng 1 lần)',
  meaning: 'Cần ít nhất 3 từ có nghĩa khác nhau',
  word: 'Cần ít nhất 3 từ có nghĩa khác nhau',
  which: 'Cần từ thuộc nhóm tự nhiên (trái cây, con vật, nghề...) và ít nhất 2 nhóm khác loại',
  letter: 'Cần từ đơn 3-10 chữ cái',
  spell: 'Cần từ đơn từ 4 chữ cái trở lên',
};

// ---------- Số ngẫu nhiên tất định ----------

export function makeRng(seed) {
  let a = (Number(seed) || 0) >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

const lc = (s) => String(s == null ? '' : s).trim().toLowerCase();
const blank = (s) => !String(s == null ? '' : s).trim();

// ---------- Biến đổi dạng từ ----------

function suffixS(w) {
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh)$/.test(w)) return w + 'es';
  if (/^(potato|tomato|hero|echo)$/.test(w)) return w + 'es';
  return w + 's';
}
function doubles(w) {
  return w.length <= 4 && /^[^aeiou]*[aeiou][^aeiouwxy]$/.test(w);
}
function suffixIng(w) {
  if (/ie$/.test(w)) return w.slice(0, -2) + 'ying';
  if (/[^aeiou]e$/.test(w) && !/ee$/.test(w)) return w.slice(0, -1) + 'ing';
  if (doubles(w)) return w + w.slice(-1) + 'ing';
  return w + 'ing';
}
function suffixEd(w) {
  if (/e$/.test(w)) return w + 'd';
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ied';
  if (doubles(w)) return w + w.slice(-1) + 'ed';
  return w + 'ed';
}
const SUFFIX = { s: suffixS, ing: suffixIng, ed: suffixEd, base: (w) => w };

// Áp dạng kind lên vị trí pos ('first' | 'last') của từ/cụm từ.
function applyForm(word, kind, pos) {
  const toks = lc(word).split(/\s+/);
  const i = pos === 'last' ? toks.length - 1 : 0;
  toks[i] = SUFFIX[kind](toks[i]);
  return toks.join(' ');
}

// Xác định token trong câu là dạng nào của word: { kind, pos } hoặc null (bất quy tắc / không rõ).
function detectForm(word, token) {
  const t = lc(token).replace(/\s+/g, ' ');
  const poss = lc(word).indexOf(' ') < 0 ? ['first'] : ['first', 'last'];
  const kinds = ['base', 's', 'ing', 'ed'];
  for (let k = 0; k < kinds.length; k++) {
    for (let p = 0; p < poss.length; p++) {
      if (applyForm(word, kinds[k], poss[p]) === t) return { kind: kinds[k], pos: poss[p] };
    }
  }
  return null;
}

// ---------- Chuẩn bị dữ liệu ----------

function prepare(vocab, bank) {
  const seen = new Set();
  const items = [];
  (vocab || []).forEach((v) => {
    if (!v || blank(v.word)) return;
    const key = normKey(v.word);
    if (!key || seen.has(key)) return;
    seen.add(key);
    const word = String(v.word).trim();
    const entry = bank ? lookup(bank, word) : null;
    const category = lc(v.category) || (entry ? entry.cat : '');
    items.push({
      word,
      key,
      meaning: String(v.meaning == null ? '' : v.meaning).trim(),
      category: lc(v.category),
      example: String(v.example == null ? '' : v.example).trim(),
      pos: entry ? entry.pos : '',
      group: groupOf(category),
      cat: category,
      pl: entry ? entry.pl : [],
      alt: entry ? entry.alt : [],
      single: /^[a-z]+$/i.test(word),
    });
  });
  return items;
}

// Cấp tối đa của một bảng từ (theo kho): trả tên cấp ('starters'...'pet') hoặc null nếu không tra được từ nào có cấp.
export function maxLevelOf(vocab, bank) {
  let best = -1;
  let name = null;
  (vocab || []).forEach((v) => {
    if (!v || blank(v.word) || !bank) return;
    const e = lookup(bank, v.word);
    if (!e) return;
    const idx = LEVEL_ORDER[e.level];
    if (idx !== undefined && idx < LEVEL_ORDER.other && idx > best) { best = idx; name = e.level; }
  });
  return name;
}

// Cache theo (kho, cấp tối đa): kho ~3.600 mục, bankPool được gọi mỗi lượt sinh.
const POOL_CACHE = new WeakMap();

// maxLevel: tên cấp ('starters'...'pet') hoặc null (không lọc, như cũ). Mục có cấp cao hơn maxLevel không bao giờ làm nhiễu;
// mục 'other' (ngoài danh sách) chỉ dùng cho Starters/Movers/Flyers.
function bankPool(bank, maxLevel) {
  if (!bank || !bank.list) return [];
  const mk = maxLevel && LEVEL_ORDER[maxLevel] !== undefined ? maxLevel : '';
  let byLevel = POOL_CACHE.get(bank);
  if (!byLevel) { byLevel = new Map(); POOL_CACHE.set(bank, byLevel); }
  if (byLevel.has(mk)) return byLevel.get(mk);
  const maxIdx = mk ? LEVEL_ORDER[mk] : null;
  const pool = bank.list.filter((e) => {
    if (KID_UNSAFE.has(normKey(e.word))) return false;
    if (e.word.indexOf('(') >= 0) return false; // khoá có hậu tố nghĩa (it (subject), may (month)): hiển thị trùng từ khác, không làm nhiễu
    if (maxIdx === null) return true;
    const idx = LEVEL_ORDER[e.level] === undefined ? LEVEL_ORDER.other : LEVEL_ORDER[e.level];
    if (idx === LEVEL_ORDER.other) return maxIdx <= LEVEL_ORDER.flyers;
    return idx <= maxIdx;
  }).map((e) => ({
    word: e.word, key: normKey(e.word), meaning: e.vi, category: e.cat, cat: e.cat, group: groupOf(e.cat),
    pos: e.pos, lv: e.lv, level: e.level, fromBank: true, pl: e.pl, alt: e.alt,
  }));
  byLevel.set(mk, pool);
  return pool;
}

// Token trong các câu ví dụ của kho (tiếng Anh đơn giản mà trẻ gặp): coi như "từ có thật". Cache theo kho.
const EX_TOKENS = new WeakMap();
function exampleTokens(bank) {
  if (!bank || !bank.list) return null;
  let s = EX_TOKENS.get(bank);
  if (!s) {
    s = new Set();
    bank.list.forEach((e) => {
      String(e.ex || '').toLowerCase().split(/[^a-z]+/).forEach((t) => { if (t) s.add(t); });
      e.pl.concat(e.alt).forEach((v) => { if (/^[a-z]+$/.test(v)) s.add(v); });
    });
    EX_TOKENS.set(bank, s);
  }
  return s;
}

function makeCtx(vocab, rng, bank, maxLevel) {
  const items = prepare(vocab, bank);
  const ml = maxLevel === 'auto' ? maxLevelOf(vocab, bank) : (maxLevel || null);
  const known = new Set(items.map((i) => i.key));
  if (bank && bank.map) bank.map.forEach((_, k) => known.add(k));
  const ctx = {
    items, rng, bank, known, pool: null, usedWrong: {}, tokens: exampleTokens(bank), maxLevel: ml,
    // KET/PET: nhiễu cùng loại từ nhưng khác nhóm được ưu tiên (PLAN-LEVELS mục 6.2)
    hi: !!ml && LEVEL_ORDER[ml] >= LEVEL_ORDER.ket,
    getPool() { if (!this.pool) this.pool = bankPool(bank, ml); return this.pool; },
  };
  return ctx;
}

// "Có phải từ tiếng Anh viết đúng?": kho, vocab, token câu ví dụ, danh sách từ phổ biến nhúng sẵn, hoặc dạng biến đổi (s/es/ed/ing/bất quy tắc) của các từ đó.
function isRealWord(ctx, w) {
  const k = String(w).toLowerCase();
  if (!k) return false;
  const direct = (x) => ctx.known.has(x) || commonWords().has(x) || (ctx.tokens && ctx.tokens.has(x));
  if (direct(k)) return true;
  const forms = formCandidates(k, ctx.bank ? ctx.bank.aux : null);
  for (let i = 1; i < forms.length; i++) if (direct(forms[i])) return true;
  const stems = [];
  if (/ing$/.test(k) && k.length > 4) { const b = k.slice(0, -3); stems.push(b, b + 'e'); if (b.length > 2 && b[b.length - 1] === b[b.length - 2]) stems.push(b.slice(0, -1)); }
  if (/ed$/.test(k) && k.length > 3) { const b = k.slice(0, -2); stems.push(b, b + 'e', k.slice(0, -1)); if (b.length > 2 && b[b.length - 1] === b[b.length - 2]) stems.push(b.slice(0, -1)); if (/ied$/.test(k)) stems.push(k.slice(0, -3) + 'y'); }
  if (/er$/.test(k) && k.length > 3) stems.push(k.slice(0, -2), k.slice(0, -1));
  if (/ly$/.test(k) && k.length > 3) stems.push(k.slice(0, -2));
  for (let i = 0; i < stems.length; i++) if (stems[i].length >= 3 && direct(stems[i])) return true;
  return KID_UNSAFE.has(k);
}

// Xếp hạng ứng viên nhiễu: cùng pos trước, độ dài gần trước, trong cùng hạng xáo ngẫu nhiên.
function rank(cands, target, rng, getStr) {
  const len = getStr(target).length;
  const posT = target.pos;
  return shuffle(cands, rng)
    .map((c, i) => {
      const l = getStr(c).length;
      const lenOk = l >= len * 0.5 && l <= len * 2 + 1;
      // cụm nhiều chữ: ưu tiên nhiễu có cùng số chữ (PLAN-LEVELS 6.2)
      const tokPen = target.word && target.word.indexOf(' ') >= 0 && String(c.word || '').split(' ').length !== target.word.split(' ').length ? 1 : 0;
      const pen = (posT && c.pos && posT !== c.pos ? 2 : 0) + (lenOk ? 0 : 1) + tokPen;
      return { c, pen, i };
    })
    .sort((a, b) => a.pen - b.pen || a.i - b.i)
    .map((x) => x.c);
}

// Lọc dùng chung cho mọi nhiễu: từ không hợp trẻ, trùng/gần nghĩa với đáp án, từ bao của cùng nhóm.
function sharedOk(c, target) {
  if (!c.key) return true;
  if (KID_UNSAFE.has(c.key)) return false;
  if (!target || !target.key || c.key === target.key) return true;
  if (synClash(c.key, target.key)) return false;
  if ((isGenericWord(c.key) || isGenericWord(target.key)) && closeCat(c.cat || c.category, target.cat || target.category)) return false;
  return true;
}

// Chọn n giá trị nhiễu từ các tầng ứng viên. getStr: ứng viên -> chuỗi hiển thị. ok(chuỗi, ứng viên) -> bool.
// Lượt 1 bỏ nhiễu đã dùng >= 2 lần trong cùng lượt sinh; thiếu mới nới.
function pickFromTiers(tiers, n, target, ctx, getStr, ok) {
  for (let pass = 0; pass < 2; pass++) {
    const out = [];
    const used = new Set();
    for (let t = 0; t < tiers.length && out.length < n; t++) {
      const ranked = rank(tiers[t], target, ctx.rng, getStr);
      for (let i = 0; i < ranked.length && out.length < n; i++) {
        const s = getStr(ranked[i]);
        const k = lc(s);
        if (!k || used.has(k)) continue;
        if (!sharedOk(ranked[i], target)) continue;
        if (pass === 0 && (ctx.usedWrong[k] || 0) >= 2) continue;
        if (ok && !ok(s, ranked[i])) continue;
        used.add(k);
        out.push(s);
      }
    }
    if (out.length === n) {
      out.forEach((s) => { const k = lc(s); ctx.usedWrong[k] = (ctx.usedWrong[k] || 0) + 1; });
      return out;
    }
  }
  return null;
}

// Tầng nhiễu chung (cùng nhóm trong bảng -> cùng siêu nhóm -> bất kỳ trong bảng -> kho cùng cat -> kho cùng cấp).
// KET/PET (ctx.hi): nhiễu cùng loại từ nhưng khác nhóm đứng đầu; từ chức năng/trừu tượng chỉ lấy nhiễu cùng nhãn + loại từ.
function tiersFor(it, ctx, filterFn) {
  const others = ctx.items.filter((o) => o !== it && (!filterFn || filterFn(o)));
  const tiers = [];
  const itCat = it.cat || it.category;
  const samePos = (o) => !it.pos || !o.pos || o.pos === it.pos;
  const strictPos = (o) => !!it.pos && !!o.pos && o.pos === it.pos;
  const pool = ctx.bank ? ctx.getPool().filter((o) => o.key !== it.key && (!filterFn || filterFn(o))) : [];
  if (noDistractorFill(itCat)) {
    // function / abstract: meaning/word chỉ so với cùng nhãn + cùng loại từ
    tiers.push(others.filter((o) => (o.cat || o.category) === itCat && samePos(o)));
    tiers.push(pool.filter((o) => o.cat === itCat && samePos(o)));
  }
  if (ctx.hi && itCat) {
    const diffGroup = (o) => strictPos(o) && !!(o.cat || o.category) && groupOf(o.cat || o.category) !== it.group && !nearCat(o.cat || o.category, itCat) && !synClash(o.key, it.key) && !meaningClash(o.meaning, it.meaning);
    tiers.push(others.filter(diffGroup));
    tiers.push(pool.filter((o) => diffGroup(o) && !noDistractorFill(o.cat)));
    tiers.push(others.filter((o) => strictPos(o) && (o.cat || o.category) !== itCat));
    tiers.push(pool.filter((o) => strictPos(o) && o.cat !== itCat && !noDistractorFill(o.cat)));
  }
  if (it.category) tiers.push(others.filter((o) => o.category === it.category));
  if (it.group) tiers.push(others.filter((o) => o.group === it.group && o.category !== it.category));
  tiers.push(others);
  if (ctx.bank) {
    if (it.cat) tiers.push(pool.filter((o) => o.cat === it.cat));
    const entry = lookup(ctx.bank, it.word);
    if (entry) tiers.push(pool.filter((o) => o.lv === entry.lv));
    tiers.push(pool);
  }
  return tiers;
}

// ---------- Từng loại ----------

function genMeaning(it, ctx) {
  if (blank(it.meaning) || noMeaningQ(it.word)) return null;
  const mine = it.meaning;
  const wrong = pickFromTiers(tiersFor(it, ctx, (o) => !blank(o.meaning) && !noMeaningQ(o.word)), 2, it, ctx, (c) => c.meaning, (s) => !meaningClash(s, mine));
  if (!wrong) return null;
  return { prompt: `What does "${display(it.word)}" mean?`, correct: it.meaning, wrong };
}

function genWord(it, ctx) {
  if (blank(it.meaning) || noMeaningQ(it.word)) return null;
  const mine = lc(it.meaning);
  if (ctx.items.some((o) => o !== it && lc(o.meaning) === mine)) return null; // hai từ cùng nghĩa: mơ hồ
  const isPhrase = it.word.indexOf(' ') >= 0;
  const tiers = tiersFor(it, ctx, (o) => !noMeaningQ(o.word));
  if (isPhrase) tiers.unshift(ctx.items.filter((o) => o !== it && o.word.indexOf(' ') >= 0 && !noMeaningQ(o.word)));
  const wrong = pickFromTiers(tiers, 2, it, ctx, (c) => display(c.word),
    (s, c) => lc(s) !== lc(it.word) && lc(c.meaning) !== mine && !meaningClash(c.meaning, it.meaning));
  if (!wrong) return null;
  return { prompt: `Which word means "${it.meaning}"?`, correct: display(it.word), wrong };
}

const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function genFill(it, ctx) {
  const ex = it.example;
  if (!ex || ex.split(/\s+/).length < 4) return null;
  if (noDistractorFill(it.cat || it.category)) return null; // function / abstract: ô trống quá chung
  if (fillBlacklisted(it.key, ex)) return null;
  const hits = findWordInText(ex, it.word, { pl: it.pl, alt: it.alt });
  if (hits.length !== 1) return null;
  const hit = hits[0];
  const token = ex.substr(hit.index, hit.token.length);
  const prompt = ex.slice(0, hit.index) + '___' + ex.slice(hit.index + hit.token.length);
  const form = detectForm(it.word, token);
  if (!form) return null;
  const before = prompt.slice(0, prompt.indexOf('___')).trim();
  const atStart = !before || /[.!?]["')\]]*$/.test(before);
  // Chống lộ chữ hoa: token viết hoa giữa câu (danh từ riêng) thì bỏ câu, vì mọi nhiễu viết thường sẽ lộ đáp án.
  if (!atStart && /^[A-Z]/.test(token)) return null;
  const generic = isGeneric(prompt);
  // Không điền vào cụm động từ tách rời ("look it ___") và tính từ đứng sau "a ___ of".
  if (/\b(it|them|him|her|me|us)\s+___/i.test(prompt)) return null;
  if (it.pos === 'adj' && /\b(a|an)\s+___\s+(of|to|for|in|at|on)\b/i.test(prompt)) return null;
  const art = /\b(a|an)\s+___/i.exec(prompt);
  // Loại từ của nhiễu: câu khung chung hoặc đáp án là tính từ thì nhiễu phải KHÁC từ loại (chỉ một phương án đúng ngữ pháp).
  const answerPos = it.pos;
  const needDiffPos = !!answerPos && (generic || answerPos === 'adj');
  // Dạng số nhiều / -ing / -ed áp lên nhiễu khác từ loại ra chuỗi vô nghĩa ("bigs"): bỏ câu thay vì sinh nhiễu xấu.
  if (needDiffPos && form.kind !== 'base') return null;
  const posOk = (c) => {
    if (!needDiffPos) return true;
    if (!c.pos) return false;
    if (answerPos === 'adj') return c.pos === 'n' || c.pos === 'v';
    if (answerPos === 'n') return c.pos === 'v' || c.pos === 'adj';
    if (answerPos === 'v') return c.pos === 'n' || c.pos === 'adj';
    return c.pos === 'n' || c.pos === 'v' || c.pos === 'adj';
  };
  const itCat = it.cat || it.category;
  const notNear = (o) => {
    const oc = o.cat || o.category;
    if (!oc || !itCat) return !(o.group && it.group && o.group === it.group);
    return !closeCat(oc, itCat);
  };
  const lowerOk = (o) => atStart || (!isProper(o.word) && !isAbbrev(o.word));
  const accept = (o) => notNear(o) && posOk(o) && lowerOk(o) && !noDistractorFill(o.cat || o.category) && !(isAbbrev(o.word) && !isAbbrev(it.word));
  const others = ctx.items.filter((o) => o !== it && accept(o));
  const pool = ctx.bank ? ctx.getPool().filter((o) => o.key !== it.key && accept(o)) : [];
  const samePos = (o) => !it.pos || !o.pos || o.pos === it.pos;
  let tiers = [
    others.filter(samePos),
    others,
    pool.filter(samePos),
    pool,
  ];
  if (needDiffPos) tiers = [others, pool];
  const shape = (s) => {
    let f = applyForm(s, form.kind, form.pos === 'last' && s.indexOf(' ') >= 0 ? 'last' : 'first');
    if (atStart) f = capFirst(display(f));
    return f;
  };
  const want = lc(token);
  const base = (c) => c.word;
  const target = Object.assign({}, it, { pos: needDiffPos ? '' : it.pos });
  const pickWith = (articleFilter) => pickFromTiers(
    tiers, 2, target, ctx, (c) => shape(base(c)),
    (s, c) => lc(s) !== want && lc(c.word) !== lc(it.word) && !(c.pl || []).some((p) => lc(p) === want) &&
      (!articleFilter || articleFilter(s)),
  );
  let wrong = null;
  let finalPrompt = prompt;
  if (art) {
    const an = art[1].toLowerCase() === 'an';
    const vowel = (s) => /^[aeiou]/i.test(s);
    wrong = pickWith((s) => (an ? vowel(s) : !vowel(s)));
    if (!wrong) {
      wrong = pickWith(null);
      if (wrong) {
        const rep = art[1].charAt(0) === 'A' ? 'A/an' : 'a/an';
        finalPrompt = prompt.slice(0, art.index) + rep + prompt.slice(art.index + art[1].length);
      }
    }
  } else {
    wrong = pickWith(null);
  }
  if (!wrong) return null;
  let correct = token;
  if (atStart) correct = capFirst(correct);
  return { prompt: finalPrompt, correct, wrong };
}

function genWhich(it, ctx, cat) {
  // Chỉ nhóm tự nhiên (ranh giới rõ). house, space, fantasy, hobby, music, toy... tắt vì "Which one is ...?" dễ có hai đáp án đúng.
  if (!WHICH_CATS.has(cat)) return null;
  const g = groupOf(cat);
  const okCat = (c) => c && WHICH_CATS.has(c) && groupOf(c) !== g && !nearCat(c, cat);
  const okWord = (o) => !KID_UNSAFE.has(o.key) && !synClash(o.key, it.key);
  const others = ctx.items.filter((o) => o !== it && okCat(o.category) && okWord(o));
  const pick = [];
  const usedCats = {};
  shuffle(others, ctx.rng).forEach((o) => {
    if (pick.length < 2 && !usedCats[o.category]) { usedCats[o.category] = 1; pick.push(display(o.word)); }
  });
  if (pick.length < 2 && ctx.bank) {
    shuffle(ctx.getPool(), ctx.rng).forEach((o) => {
      if (pick.length < 2 && okCat(o.cat) && !usedCats[o.cat] && o.key !== it.key && okWord(o) &&
        !ctx.items.some((x) => x.key === o.key && x.category === cat)) {
        usedCats[o.cat] = 1;
        pick.push(display(o.word));
      }
    });
  }
  if (pick.length < 2) return null;
  return { prompt: `Which one is ${phraseFor(cat)}?`, correct: display(it.word), wrong: pick };
}

const VOWELS = 'aeiou';
const CONS_NEAR = {
  b: 'dp', d: 'btp', p: 'bd', m: 'n', n: 'm', c: 'ks', k: 'cs', s: 'ck', f: 'v', v: 'fw', g: 'j', j: 'g', t: 'd', l: 'r', r: 'l', w: 'v',
};
const CONS_ALL = 'bcdfghjklmnpqrstvwxz';

function genLetter(it, ctx) {
  if (!it.single || it.word.length < 3 || it.word.length > 10) return null;
  if (isAbbrev(it.word)) return null; // tv, dvd, ufo: đục chữ vô nghĩa
  const w = it.word.toLowerCase();
  const vowelIdx = [];
  for (let i = 0; i < w.length - 1; i++) if (VOWELS.indexOf(w[i]) >= 0) vowelIdx.push(i);
  let order = [];
  const inner = vowelIdx.filter((i) => i >= 1);
  if (w.length <= 3) {
    order = (w.length > 1 && VOWELS.indexOf(w[1]) >= 0 ? [1] : []).concat(vowelIdx);
  } else {
    order = shuffle(inner, ctx.rng).concat(shuffle(vowelIdx.filter((i) => i < 1), ctx.rng));
  }
  const cons = [];
  for (let i = 1; i < w.length - 1; i++) if (VOWELS.indexOf(w[i]) < 0) cons.push(i);
  order = order.concat(shuffle(cons, ctx.rng));
  for (let n = 0; n < order.length; n++) {
    const pos = order[n];
    const ch = w[pos];
    const isV = VOWELS.indexOf(ch) >= 0;
    let pool;
    if (isV) pool = shuffle(VOWELS.split('').filter((x) => x !== ch), ctx.rng);
    else {
      const near = (CONS_NEAR[ch] || '').split('');
      pool = shuffle(near, ctx.rng).concat(shuffle(CONS_ALL.split('').filter((x) => x !== ch && near.indexOf(x) < 0), ctx.rng));
    }
    const wrong = [];
    for (let i = 0; i < pool.length && wrong.length < 2; i++) {
      const cand = w.slice(0, pos) + pool[i] + w.slice(pos + 1);
      if (isRealWord(ctx, cand)) continue;
      wrong.push(pool[i]);
    }
    if (wrong.length < 2) continue;
    const shown = w.slice(0, pos) + '_' + w.slice(pos + 1);
    const hint = it.meaning ? ` (${it.meaning})` : '';
    return { prompt: `Find the missing letter: ${shown}${hint}`, correct: ch, wrong };
  }
  return null;
}

function spellVariants(w) {
  const out = [];
  const add = (v) => { if (v && v !== w && v.length >= 3 && out.indexOf(v) < 0) out.push(v); };
  for (let i = 1; i < w.length - 2; i++) if (w[i] !== w[i + 1]) add(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2));
  let hasDouble = false;
  for (let i = 0; i < w.length - 1; i++) {
    if (w[i] === w[i + 1]) { hasDouble = true; add(w.slice(0, i) + w.slice(i + 1)); }
  }
  if (!hasDouble) {
    for (let i = 1; i < w.length - 1; i++) if (VOWELS.indexOf(w[i]) < 0 && 'wxyhq'.indexOf(w[i]) < 0) add(w.slice(0, i) + w[i] + w.slice(i));
  }
  // Từ ngắn (<= 4 chữ): đổi nguyên âm dễ ra từ thật khác (desk -> disk, song -> sung); chỉ giữ phép o->u, i->y ở từ dài.
  const swaps = w.length <= 4 ? { i: 'y' } : { a: 'e', e: 'i', o: 'u', i: 'y' };
  for (let i = 1; i < w.length; i++) if (swaps[w[i]]) add(w.slice(0, i) + swaps[w[i]] + w.slice(i + 1));
  if (/[^aeiou]e$/.test(w) && w.length >= 5) add(w.slice(0, -1));
  return out;
}

function genSpell(it, ctx) {
  if (!it.single || it.word.length < 4) return null;
  if (isAbbrev(it.word)) return null;
  const w = it.word.toLowerCase();
  const cap = it.word.charAt(0) !== it.word.charAt(0).toLowerCase() || isProper(w);
  // Nhiễu phải là chuỗi KHÔNG phải từ tiếng Anh viết đúng (kho + câu ví dụ + danh sách phổ biến + dạng biến đổi).
  const variants = shuffle(spellVariants(w).filter((v) => !isRealWord(ctx, v)), ctx.rng);
  if (variants.length < 2) return null;
  const show = (s) => (cap ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const prompt = it.meaning ? `Which is the correct spelling? (${it.meaning})` : 'Which word is spelled correctly?';
  return { prompt, correct: display(w) === w ? show(w) : display(w), wrong: [show(variants[0]), show(variants[1])] };
}

// ---------- Khả năng ----------

function eligible(type, ctx) {
  const items = ctx.items;
  if (items.length < 3) return [];
  if (type === 'which') {
    return items.filter((it) => {
      if (!WHICH_CATS.has(it.category)) return false;
      const other = {};
      items.forEach((o) => { if (o !== it && WHICH_CATS.has(o.category) && groupOf(o.category) !== it.group && !nearCat(o.category, it.category)) other[o.category] = 1; });
      return Object.keys(other).length >= 2;
    });
  }
  return items;
}

function genOne(type, it, ctx) {
  if (type === 'fill') return genFill(it, ctx);
  if (type === 'meaning') return genMeaning(it, ctx);
  if (type === 'word') return genWord(it, ctx);
  if (type === 'which') return genWhich(it, ctx, it.category);
  if (type === 'letter') return genLetter(it, ctx);
  if (type === 'spell') return genSpell(it, ctx);
  return null;
}

// Tạo mọi ứng viên của 1 loại (mỗi từ tối đa 1 câu), thứ tự đã xáo.
function candidatesOf(type, ctx) {
  const list = shuffle(eligible(type, ctx), ctx.rng);
  const out = [];
  list.forEach((it) => {
    const q = genOne(type, it, ctx);
    if (q) out.push({ type, item: it, q });
  });
  return out;
}

export function capacity(vocab, opts) {
  const o = opts || {};
  const ctx = makeCtx(vocab, makeRng(12345), o.bank || null, o.maxLevel || null);
  const cap = {};
  const reasons = {};
  QTYPES.forEach((t) => {
    cap[t] = ctx.items.length < 3 ? 0 : candidatesOf(t, ctx).length;
    if (!cap[t]) reasons[t] = ctx.items.length < 3 ? 'Cần ít nhất 3 từ' : REASONS[t];
  });
  cap.reasons = reasons;
  return cap;
}

// ---------- Sinh ----------

function dupKey(prompt, correct) {
  return normKey(prompt) + '|' + normKey(correct);
}

// Hàm kiểm "từ tiếng Anh viết đúng?" cho script kiểm (audit.mjs): cùng luật với letter/spell.
export function makeRealWordCheck(vocab, bank) {
  const ctx = makeCtx(vocab, makeRng(1), bank || null);
  return (w) => isRealWord(ctx, w);
}

// opts.limits: { fill: 2, which: 2 } = tối đa số câu mỗi loại trong một lượt sinh.
export function generateQuestions(vocab, opts) {
  const o = opts || {};
  const types = (o.types && o.types.length ? o.types : QTYPES).filter((t) => QTYPES.indexOf(t) >= 0);
  const count = o.count == null ? 15 : o.count;
  const seed = o.seed == null ? Date.now() : o.seed;
  const rng = makeRng(seed);
  const ctx = makeCtx(vocab, rng, o.bank || null, o.maxLevel || null);
  const byType = {};
  QTYPES.forEach((t) => { byType[t] = 0; });
  const result = { questions: [], byType, kinds: [], skippedDup: 0 };
  if (ctx.items.length < 3 || count <= 0) return result;

  const existingKeys = new Set();
  (o.existing || []).forEach((q) => {
    if (q && q.options) existingKeys.add(dupKey(q.prompt, q.options[q.answer] || ''));
  });

  const lists = {};
  types.forEach((t, ti) => {
    ctx.rng = makeRng(seed * 31 + ti * 7919 + 1);
    lists[t] = candidatesOf(t, ctx);
  });
  ctx.rng = rng;
  const numCats = Math.max(1, new Set(ctx.items.map((i) => i.category).filter(Boolean)).size);
  const chosen = [];
  const usedKeys = new Set();
  const dupCounted = new Set();
  const perWord = {};
  const perCat = {};
  const idx = {};
  types.forEach((t) => { idx[t] = 0; });
  const whichCap = Math.ceil(count / numCats);
  const limits = o.limits || {};
  const taken = {};

  for (let maxPerWord = 1; maxPerWord <= 2 && chosen.length < count; maxPerWord++) {
    let progress = true;
    while (chosen.length < count && progress) {
      progress = false;
      for (let ti = 0; ti < types.length && chosen.length < count; ti++) {
        const t = types[ti];
        const list = lists[t];
        if (limits[t] != null && (taken[t] || 0) >= limits[t]) continue; // giới hạn số câu mỗi loại (vd thư viện: fill/which tối đa 2)
        while (idx[t] < list.length) {
          const cand = list[idx[t]];
          const wk = cand.item.key;
          if ((perWord[wk] || 0) >= maxPerWord) { idx[t]++; continue; }
          if (t === 'which' && maxPerWord === 1 && (perCat[cand.item.category] || 0) >= whichCap) { idx[t]++; continue; }
          idx[t]++;
          const key = dupKey(cand.q.prompt, cand.q.correct);
          if (existingKeys.has(key)) {
            if (!dupCounted.has(key)) { dupCounted.add(key); result.skippedDup++; }
            continue;
          }
          if (usedKeys.has(key)) continue;
          usedKeys.add(key);
          perWord[wk] = (perWord[wk] || 0) + 1;
          if (t === 'which') perCat[cand.item.category] = (perCat[cand.item.category] || 0) + 1;
          chosen.push(cand);
          taken[t] = (taken[t] || 0) + 1;
          progress = true;
          break;
        }
      }
    }
    // Lượt 2: cho phép lại các ứng viên bị bỏ qua vì đã dùng từ đó 1 lần.
    types.forEach((t) => { idx[t] = 0; });
    const done = new Set(chosen.map((c) => c.type + '|' + c.item.key));
    types.forEach((t) => { lists[t] = lists[t].filter((c) => !done.has(c.type + '|' + c.item.key)); });
  }

  // Thứ tự cuối: xáo, không để 2 câu cùng loại đứng liền nhau nếu tránh được.
  const order = shuffle(chosen, rng);
  for (let i = 1; i < order.length; i++) {
    if (order[i].type !== order[i - 1].type) continue;
    for (let j = i + 1; j < order.length; j++) {
      if (order[j].type !== order[i - 1].type) {
        const t = order[i]; order[i] = order[j]; order[j] = t;
        break;
      }
    }
  }
  // Vị trí đáp án đúng: chia nhóm 3, mỗi nhóm một hoán vị của [0,1,2].
  let perm = [];
  order.forEach((c) => {
    if (!perm.length) perm = shuffle([0, 1, 2], rng);
    const pos = perm.pop();
    const options = [];
    let w = 0;
    for (let k = 0; k < 3; k++) options.push(k === pos ? c.q.correct : c.q.wrong[w++]);
    result.questions.push({ prompt: c.q.prompt, options, answer: pos, type: 'vocab' });
    result.kinds.push(c.type);
    byType[c.type]++;
  });
  return result;
}
