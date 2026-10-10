// Chuẩn hoá khi tra từ (PLAN-SOANBAI mục A7). Module thuần, không DOM, không import content.js.
// Chỉ dùng cú pháp có ở Chromium 84 (không ??=, replaceAll, .at()...).

const IRREGULAR = {
  children: 'child', men: 'man', women: 'woman', people: 'person', feet: 'foot', teeth: 'tooth',
  mice: 'mouse', geese: 'goose', knives: 'knife', leaves: 'leaf', wolves: 'wolf',
};

const PREFIXES = ['a ', 'an ', 'the ', 'to '];

export function normKey(s) {
  let t = String(s == null ? '' : s).normalize('NFC').toLowerCase();
  t = t.replace(/[’‘]/g, "'");
  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(/^[.,;:!?"()\s]+|[.,;:!?"()\s]+$/g, '');
  for (let i = 0; i < PREFIXES.length; i++) {
    if (t.indexOf(PREFIXES[i]) === 0 && t.length > PREFIXES[i].length) {
      t = t.slice(PREFIXES[i].length).trim();
      break;
    }
  }
  return t;
}

// Danh sách khoá thử tra, theo thứ tự ưu tiên. aux: Map (khoá biến thể → từ gốc) dựng từ pl/alt của kho.
export function candidates(key, aux) {
  const k = normKey(key);
  const out = [];
  const add = (c) => { if (c && out.indexOf(c) < 0) out.push(c); };
  if (!k) return out;
  add(k);
  if (Object.prototype.hasOwnProperty.call(IRREGULAR, k)) add(IRREGULAR[k]);
  if (/[^aeiou]ies$/.test(k) && k.length > 4) add(k.slice(0, -3) + 'y');
  if (/ves$/.test(k) && k.length > 4) {
    add(k.slice(0, -3) + 'f');
    add(k.slice(0, -3) + 'fe');
  }
  if (/(s|x|z|ch|sh|o)es$/.test(k)) add(k.slice(0, -2));
  if (/s$/.test(k) && !/ss$/.test(k) && k.length > 2) add(k.slice(0, -1));
  if (aux && typeof aux.get === 'function') {
    const a = aux.get(k);
    if (a) add(a);
  }
  return out;
}

// Tách danh sách từ dán vào: theo xuống dòng, dấu phẩy, chấm phẩy, tab.
export function splitWordListEx(text, max) {
  const limit = max || 200;
  const seen = new Set();
  const words = [];
  let total = 0;
  String(text == null ? '' : text).split(/[\r\n,;\t]+/).forEach((raw) => {
    let t = raw.replace(/^\s*(?:\d+\s*[.)]|[-•–—*])\s*/, '').trim();
    if (!t) return;
    const k = normKey(t);
    if (!k || seen.has(k)) return;
    seen.add(k);
    total++;
    if (words.length < limit) words.push(t);
  });
  return { words, truncated: total > limit, total };
}

export function splitWordList(text, max) {
  return splitWordListEx(text, max).words;
}

// ---- Dạng từ trong câu (dùng cho script kiểm, qgen "fill") ----
function inflectToken(w) {
  const out = [w, w + 's'];
  if (/(s|x|z|ch|sh|o)$/.test(w)) out.push(w + 'es');
  if (/[^aeiou]y$/.test(w)) out.push(w.slice(0, -1) + 'ies', w.slice(0, -1) + 'ied', w + 'ing');
  else if (/e$/.test(w)) out.push(w + 'd', w.slice(0, -1) + 'ing');
  else {
    out.push(w + 'ed', w + 'ing');
    if (/[^aeiou][aeiou][bdgklmnprt]$/.test(w)) out.push(w + w.slice(-1) + 'ed', w + w.slice(-1) + 'ing');
  }
  if (/fe?$/.test(w)) out.push(w.replace(/fe?$/, 'ves'));
  return out;
}

// Tất cả dạng chấp nhận được của từ/cụm từ + pl/alt (mảng hoặc chuỗi "a|b").
export function wordForms(word, extras) {
  const w = String(word || '').trim().toLowerCase();
  const set = [];
  const add = (x) => { if (x && set.indexOf(x) < 0) set.push(x); };
  if (!w) return set;
  const toks = w.split(' ');
  if (toks.length === 1) inflectToken(w).forEach(add);
  else {
    const last = toks.length - 1;
    inflectToken(toks[last]).forEach((f) => add(toks.slice(0, last).concat(f).join(' ')));
    inflectToken(toks[0]).forEach((f) => add([f].concat(toks.slice(1)).join(' ')));
  }
  [].concat(extras && extras.pl || [], extras && extras.alt || []).forEach((e) => {
    String(e || '').split('|').forEach((p) => add(p.trim().toLowerCase()));
  });
  return set;
}

// Tìm các lần từ xuất hiện trong câu (biên từ, không phân biệt hoa thường). Trả [{ index, token }].
export function findWordInText(text, word, extras) {
  const forms = wordForms(word, extras).sort((a, b) => b.length - a.length);
  if (!forms.length) return [];
  const esc = forms.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'));
  const re = new RegExp("(^|[^A-Za-z'])(" + esc.join('|') + ")(?![A-Za-z])", 'gi');
  const s = String(text || '');
  const hits = [];
  let m;
  while ((m = re.exec(s))) {
    hits.push({ index: m.index + m[1].length, token: m[2] });
    re.lastIndex = m.index + m[1].length + m[2].length;
  }
  return hits;
}
