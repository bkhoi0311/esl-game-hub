// Đọc bảng (dán từ Excel, CSV, TSV, TXT, trang XLSX) thành từ vựng / câu hỏi (PLAN-SOANBAI D5, E1, E2).
// Module thuần: không DOM, không import content.js. Là module DUY NHẤT của soanbai/ được nạp tĩnh vào bundle chính
// (editor.js re-export), nên giữ nhỏ gọn.
import { splitWordListEx } from './normalize.js';
import { t, addStrings } from '../../i18n/index.js';
import VI from '../../i18n/strings/sbmain.vi.js';

addStrings('sbmain', VI);

const VOCAB_KEYS = ['word', 'meaning', 'category', 'example'];

// Khoá tiêu đề: bỏ dấu, chữ thường, bỏ phần trong ngoặc, gộp khoảng trắng.
function hkey(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[:*_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const ALIASES = {
  word: ['word', 'words', 'tu', 'tu vung', 'vocabulary', 'vocab', 'english', 'tieng anh', 'tu tieng anh'],
  meaning: ['meaning', 'nghia', 'vi', 'vietnamese', 'tieng viet', 'nghia tieng viet', 'translation'],
  category: ['category', 'nhom', 'group', 'topic', 'chu de'],
  example: ['example', 'vi du', 'cau vi du', 'sentence', 'example sentence'],
  prompt: ['prompt', 'question', 'questions', 'cau hoi'],
  answer: ['answer', 'dap an', 'dap an dung', 'correct', 'correct answer', 'right answer', 'key'],
  type: ['type', 'loai', 'loai cau'],
};
const OPT_ALIASES = [
  ['option a', 'dap an a', 'answer a', 'a', 'choice a', 'lua chon a', 'option 1', 'dap an 1', 'answer 1'],
  ['option b', 'dap an b', 'answer b', 'b', 'choice b', 'lua chon b', 'option 2', 'dap an 2', 'answer 2'],
  ['option c', 'dap an c', 'answer c', 'c', 'choice c', 'lua chon c', 'option 3', 'dap an 3', 'answer 3'],
];

// ---------- Đọc văn bản thành bảng ----------

// Đọc bảng ngăn bằng tab (dán từ Excel / Google Sheet), hỗ trợ ô trong ngoặc kép.
export function parseTsv(text) {
  return parseWith(text, '\t');
}

function parseWith(text, delim) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = String(text == null ? '' : text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
    } else if (c === '"' && cell === '') {
      quoted = true;
    } else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

// Đếm dấu ngăn mỗi dòng (bỏ phần trong ngoặc kép) trên tối đa 10 dòng đầu.
function sniffDelimiter(text) {
  const src = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = [];
  let counts = { '\t': 0, ';': 0, ',': 0 };
  let quoted = false;
  let any = false;
  for (let i = 0; i < src.length && lines.length < 10; i++) {
    const c = src[i];
    if (c === '"') {
      if (quoted && src[i + 1] === '"') i++;
      else quoted = !quoted;
      any = true;
    } else if (!quoted && c === '\n') {
      if (any) lines.push(counts);
      counts = { '\t': 0, ';': 0, ',': 0 };
      any = false;
    } else if (!quoted && counts[c] !== undefined) {
      counts[c]++;
      any = true;
    } else if (c !== ' ' && c !== '\n') {
      any = true;
    }
  }
  if (any) lines.push(counts);
  let best = null;
  let bestScore = 0;
  ['\t', ';', ','].forEach((d) => {
    const freq = {};
    lines.forEach((l) => { if (l[d] > 0) freq[l[d]] = (freq[l[d]] || 0) + 1; });
    let score = 0;
    Object.keys(freq).forEach((k) => { if (freq[k] > score) score = freq[k]; });
    if (score > bestScore) { best = d; bestScore = score; }
  });
  return best;
}

// Đọc văn bản CSV/TSV/TXT: tự đoán dấu ngăn (tab > ; > ,). Không có dấu ngăn: mỗi dòng 1 ô.
export function parseDelimited(text) {
  const d = sniffDelimiter(text);
  return parseWith(text, d || '\u0000');
}

// ---------- Nhận diện cột ----------

function headerColumns(first) {
  const keys = first.map(hkey);
  const map = {};
  const find = (list) => keys.findIndex((k, i) => list.indexOf(k) >= 0 && !Object.keys(map).some((m) => map[m] === i));
  Object.keys(ALIASES).forEach((name) => {
    const i = find(ALIASES[name]);
    if (i >= 0) map[name] = i;
  });
  const opts = [];
  OPT_ALIASES.forEach((list) => {
    const i = keys.findIndex((k, idx) => list.indexOf(k) >= 0 && !Object.keys(map).some((m) => map[m] === idx) && opts.indexOf(idx) < 0);
    if (i >= 0) opts.push(i);
  });
  return { map, opts, hits: Object.keys(map).length + opts.length };
}

function isQuestionHeader(hc) {
  return 'prompt' in hc.map && hc.opts.length >= 3;
}
function isVocabHeader(hc) {
  return 'word' in hc.map;
}

function answerIndex(key, options) {
  const k = String(key == null ? '' : key).trim();
  if (!k) return -1;
  if (/^[abc]$/i.test(k)) return k.toUpperCase().charCodeAt(0) - 65;
  if (/^[123]$/.test(k)) return Number(k) - 1;
  const low = k.toLowerCase();
  return options.findIndex((o) => o.toLowerCase() === low);
}

// ---------- Từ vựng ----------

export function rowsToVocab(rows) {
  return vocabFromRows(rows, 0).items;
}

function vocabFromRows(rows, offset) {
  const out = { items: [], errors: [], header: false };
  if (!rows.length) return out;
  const hc = headerColumns(rows[0]);
  const hasHeader = isVocabHeader(hc);
  const body = hasHeader ? rows.slice(1) : rows;
  const cols = hasHeader ? hc.map : { word: 0, meaning: 1, category: 2, example: 3 };
  out.header = hasHeader;
  body.forEach((r, i) => {
    const line = i + 1 + (hasHeader ? 1 : 0) + (offset || 0);
    const word = r[cols.word] || '';
    if (!word) {
      if (r.some(Boolean)) out.errors.push(t('sbm.row.noWord', { line }));
      return;
    }
    out.items.push({
      word,
      meaning: cols.meaning != null ? r[cols.meaning] || '' : '',
      category: cols.category != null ? (r[cols.category] || '').toLowerCase() : '',
      example: cols.example != null ? r[cols.example] || '' : '',
      image: '',
    });
  });
  return out;
}

// ---------- Câu hỏi ----------

// Cột câu hỏi: prompt | đáp án A | B | C | đáp án đúng (A/B/C, 1/2/3 hoặc nội dung) | type
export function rowsToQuestions(rows) {
  return questionsFromRows(rows, 0, false).items;
}

function questionsFromRows(rows, offset, strict) {
  const out = { items: [], errors: [], header: false };
  if (!rows.length) return out;
  const hc = headerColumns(rows[0]);
  let hasHeader = isQuestionHeader(hc);
  let cols;
  if (hasHeader) {
    const opts = hc.opts.slice(0, 3);
    const nextCol = Math.max.apply(null, opts) + 1;
    cols = {
      prompt: hc.map.prompt,
      opts,
      answer: hc.map.answer != null ? hc.map.answer : nextCol,
      type: hc.map.type != null ? hc.map.type : nextCol + 1,
    };
  } else {
    // Tương thích cũ: ô đầu là "prompt" / "câu hỏi" / "question" thì bỏ dòng đó.
    const first = hkey(rows[0][0]);
    hasHeader = ALIASES.prompt.indexOf(first) >= 0;
    cols = { prompt: 0, opts: [1, 2, 3], answer: 4, type: 5 };
  }
  out.header = hasHeader;
  (hasHeader ? rows.slice(1) : rows).forEach((r, i) => {
    const line = i + 1 + (hasHeader ? 1 : 0) + (offset || 0);
    const prompt = r[cols.prompt] || '';
    if (!prompt) {
      if (r.some(Boolean)) out.errors.push(t('sbm.row.noPrompt', { line }));
      return;
    }
    const options = cols.opts.map((c) => (c != null ? r[c] || '' : ''));
    let answer = answerIndex(cols.answer != null ? r[cols.answer] : '', options);
    if (strict) {
      const missing = options.findIndex((o) => !o);
      if (missing >= 0) {
        out.errors.push(t('sbm.row.noOption', { line, letter: 'ABC'[missing] }));
        return;
      }
      if (answer < 0) {
        out.errors.push(t('sbm.row.noAnswer', { line }));
        return;
      }
    }
    if (answer < 0) answer = 0;
    out.items.push({
      prompt,
      options,
      answer,
      type: ((cols.type != null && r[cols.type]) || 'grammar').toLowerCase(),
    });
  });
  return out;
}

// ---------- Nhận diện loại bảng ----------

const HAS_VIET = /[^\u0000-\u007f]/;

// rows: mảng hàng (mảng ô). Trả { kind: 'vocab'|'questions'|'wordlist'|'none', items, errors, header }.
// wordlist: items là mảng chuỗi (chỉ có từ tiếng Anh, đi luồng "Điền từ từ kho").
export function detectTable(rows) {
  const all = (rows || []).map((r) => r || []);
  const nonBlank = (r) => r.some((c) => String(c || '').trim());
  const lead = all.findIndex(nonBlank);
  if (lead < 0) return { kind: 'none', items: [], errors: [], header: false };
  const data = all.slice(lead); // giữ dòng trống để số dòng báo lỗi khớp với file
  const dense = data.filter(nonBlank);
  const hc = headerColumns(data[0]);
  if (isQuestionHeader(hc)) {
    const q = questionsFromRows(data, lead, true);
    return { kind: 'questions', items: q.items, errors: q.errors, header: true };
  }
  if (isVocabHeader(hc)) {
    const v = vocabFromRows(data, lead);
    return { kind: 'vocab', items: v.items, errors: v.errors, header: true };
  }
  // Không có tiêu đề: nhận theo thứ tự cột.
  const wide = dense.filter((r) => r.length >= 5).length;
  if (wide >= Math.ceil(dense.length / 2)) {
    const hit = dense.filter((r) => {
      const key = String(r[4] || '').trim();
      return /^[abc123]$/i.test(key) || (key && [r[1], r[2], r[3]].some((o) => String(o || '').trim().toLowerCase() === key.toLowerCase()));
    }).length;
    if (hit >= Math.ceil(dense.length / 2)) {
      const q = questionsFromRows(data, lead, true);
      return { kind: 'questions', items: q.items, errors: q.errors, header: false };
    }
  }
  const multi = dense.filter((r) => r.filter(Boolean).length >= 2);
  const viet = multi.filter((r) => HAS_VIET.test(r[1] || '')).length;
  if (multi.length && viet >= Math.ceil(multi.length / 2)) {
    const v = vocabFromRows(data, lead);
    return { kind: 'vocab', items: v.items, errors: v.errors, header: false };
  }
  const text = dense.map((r) => r.join('\n')).join('\n');
  const list = splitWordListEx(text, 100000);
  if (!list.words.length) return { kind: 'none', items: [], errors: [], header: false };
  return { kind: 'wordlist', items: list.words, errors: [], header: false };
}

export { VOCAB_KEYS };
