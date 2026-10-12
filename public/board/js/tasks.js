// Sinh câu cho bảng từ gói thư viện (THUẦN, không DOM). PLAN-V2 mục B.0, B.i.
// Task: { id, kind: 'write'|'missing'|'mc'|'math', lang, prompt:[Run], options:[[Run]x3]|null, answer:[Run], answerIndex|null, meta }
// Run: { t:'text'|'hint'|'mask'|'blank'|'frac'|'sup'|'sub'|'sqrt'|'var'|'int', ... }

// Số ngẫu nhiên tất định (chép từ src/core/soanbai/qgen.js)
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

export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

const T = (v) => ({ t: 'text', v: String(v) });
const VOWELS = 'aeiou';

// Che chữ: trả { text: 'b _ e a d', hidden: [vị trí], count }. Ưu tiên nguyên âm, không quá 40% số chữ.
export function maskWord(word, difficulty, rng) {
  const letters = word.split('');
  const want = difficulty >= 3 ? 3 : difficulty === 2 ? 2 : 1;
  const count = Math.max(1, Math.min(want, Math.floor(letters.length * 0.4)));
  const idx = letters.map((_, i) => i);
  const vow = shuffle(idx.filter((i) => VOWELS.indexOf(letters[i].toLowerCase()) >= 0), rng);
  const con = shuffle(idx.filter((i) => VOWELS.indexOf(letters[i].toLowerCase()) < 0), rng);
  const hidden = vow.concat(con).slice(0, count).sort((a, b) => a - b);
  const text = letters.map((ch, i) => (hidden.indexOf(i) >= 0 ? '_' : ch)).join(' ');
  return { text, hidden, count };
}

// Đảo phương án; trả bản sao của câu với options và answerIndex mới.
export function shuffleOptions(task, rng) {
  if (!task.options) return task;
  const order = shuffle(task.options.map((_, i) => i), rng);
  return Object.assign({}, task, {
    options: order.map((i) => task.options[i]),
    answerIndex: order.indexOf(task.answerIndex),
  });
}

function prefixOf(source) { return source.id === 'lesson' ? 'lesson' : 'lib:' + source.id; }

const WORD_RE = /^[a-z]+(?:[ -][a-z]+){0,2}$/i;
const SINGLE_RE = /^[a-z]{3,10}$/i;

function eligible(source, kind) {
  if (kind === 'mc') return (source.questions || []).filter((q) => q.o && q.o.length === 3 && (q.a === 0 || q.a === 1 || q.a === 2));
  const v = (source.vocab || []).filter((x) => x.w && x.m);
  if (kind === 'write') return v.filter((x) => WORD_RE.test(x.w.trim()));
  if (kind === 'missing') return v.filter((x) => SINGLE_RE.test(x.w.trim()));
  return [];
}

// Số câu tối đa của (gói, loại) để giao diện báo "Gói này chỉ có N câu loại này".
export function deckCapacity(source, kind) {
  const seen = new Set();
  const list = eligible(source, kind);
  if (kind === 'mc') return list.length;
  list.forEach((x) => seen.add(x.w.trim().toLowerCase()));
  return seen.size;
}

// buildDeck({ source, kind, count, order, seed, difficulty }) -> Task[] (không trùng id; ít hơn count nếu gói không đủ)
export function buildDeck({ source, kind, count = 10, order = 'seq', seed = 1, difficulty = 1 }) {
  const rng = makeRng(seed);
  const pre = prefixOf(source);
  const list = eligible(source, kind);
  const tasks = [];
  const ids = new Set();
  const push = (task) => { if (!ids.has(task.id)) { ids.add(task.id); tasks.push(task); } };
  if (kind === 'mc') {
    list.forEach((q) => {
      const idx = (source.questions || []).indexOf(q);
      push({
        id: pre + ':mc:' + idx, kind: 'mc', lang: 'en', prompt: [T(q.p)], options: q.o.map((o) => [T(o)]),
        answer: [T(q.o[q.a])], answerIndex: q.a, meta: { pack: source.id, level: source.level || '' },
      });
    });
  } else {
    list.forEach((x) => {
      const w = x.w.trim(), key = w.toLowerCase();
      const meta = { pack: source.id, level: source.level || '', category: x.c || '' };
      if (kind === 'write') {
        push({ id: pre + ':write:' + key, kind: 'write', lang: 'en', prompt: [T('Write the word:'), { t: 'hint', v: x.m }], options: null, answer: [T(w)], answerIndex: null, meta });
      } else {
        const m = maskWord(w, difficulty, makeRng(hashStr(key) + (seed >>> 0)));
        push({
          id: pre + ':missing:' + key, kind: 'missing', lang: 'en',
          prompt: [T('Write the whole word:'), { t: 'mask', v: m.text }, { t: 'hint', v: x.m }],
          options: null, answer: [T(w)], answerIndex: null, meta: Object.assign(meta, { masked: m.count }),
        });
      }
    });
  }
  let out = order === 'rand' ? shuffle(tasks, rng) : tasks;
  if (kind === 'mc') out = out.map((t) => shuffleOptions(t, rng));
  return out.slice(0, Math.max(0, count));
}

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// Chuyển Run thành chuỗi thuần (chống trùng, kiểm thử, aria-label): phân số 3/4, mũ x^2, căn √3
const wrap = (s) => (/^[0-9A-Za-z√.,−]+$/.test(s) ? s : '(' + s + ')');
export function runsText(runs) {
  const one = (r) => {
    switch (r.t) {
      case 'frac': return wrap(runsText(r.n)) + '/' + wrap(runsText(r.d));
      case 'sup': return runsText(r.b) + '^' + wrap(runsText(r.e));
      case 'sub': return '_' + wrap(String(r.v));
      case 'sqrt': return '√' + wrap(runsText(r.v));
      case 'blank': return '?';
      case 'int': return '∫[' + runsText(r.lo) + ',' + runsText(r.hi) + ']';
      default: return r.v == null ? '' : String(r.v);
    }
  };
  return (runs || []).map(one).join('');
}
