// Kho từ vựng (PLAN-SOANBAI mục A2, D5). Thuần trừ loadBank (nạp lười JSON bằng import()).
import { normKey, candidates } from './normalize.js';

const LV_FULL = { s: 'starters', m: 'movers', f: 'flyers', k: 'ket', p: 'pet', o: 'other' };

// json: { v, cols, rows } dạng cột (xem A2). Trả về kho: Map khoá chuẩn hoá -> entry + index phụ cho pl/alt.
export function buildBank(json) {
  const cols = (json && json.cols) || [];
  const idx = {};
  cols.forEach((c, i) => { idx[c] = i; });
  const map = new Map();
  const aux = new Map();
  const list = [];
  ((json && json.rows) || []).forEach((r) => {
    const word = String(r[idx.w] || '').trim();
    if (!word) return;
    const key = normKey(word);
    if (!key || map.has(key)) return;
    const lv = String(r[idx.lv] || 'o');
    const split = (v) => String(v || '').split('|').map((s) => s.trim()).filter(Boolean);
    const entry = {
      word,
      vi: String(r[idx.vi] || ''),
      pos: String(r[idx.pos] || ''),
      cat: String(r[idx.cat] || ''),
      lv,
      level: LV_FULL[lv] || 'other',
      ex: String(r[idx.ex] || ''),
      alt: split(r[idx.alt]),
      pl: split(r[idx.pl]),
      display: idx.d === undefined ? '' : String(r[idx.d] || ''),
    };
    map.set(key, entry);
    list.push(entry);
    entry.alt.concat(entry.pl).forEach((v) => {
      const k = normKey(v);
      if (k && !aux.has(k)) aux.set(k, key);
    });
  });
  // Biến thể trùng một từ có thật trong kho thì từ có thật thắng (không cho alt/pl che nó).
  map.forEach((_, k) => aux.delete(k));
  return { map, aux, list, size: map.size, version: (json && json.v) || 1 };
}

// Trả { entry, via } với via = 'exact' (khớp nguyên văn) | 'form' (số nhiều/chia từ) | 'alt' (pl/alt của kho); không có -> null.
export function lookupEx(bank, word) {
  if (!bank || !bank.map) return null;
  const key = normKey(word);
  if (!key) return null;
  const direct = bank.map.get(key);
  if (direct) return { entry: direct, via: 'exact' };
  const list = candidates(key, bank.aux);
  for (let i = 1; i < list.length; i++) {
    const e = bank.map.get(list[i]);
    if (e) return { entry: e, via: bank.aux.get(key) === list[i] ? 'alt' : 'form' };
  }
  return null;
}

export function lookup(bank, word) {
  const r = lookupEx(bank, word);
  return r ? r.entry : null;
}

const blank = (s) => !String(s == null ? '' : s).trim();

// rows: mảng vocab { word, meaning, category, example, image }. Không đổi mảng gốc.
// onlyEmpty (mặc định true): chỉ điền ô trống, không ghi đè.
export function fillRows(rows, bank, opts) {
  const onlyEmpty = !opts || opts.onlyEmpty !== false;
  const out = [];
  const missing = [];
  const missingIdx = [];
  const viaPlural = [];
  let filled = 0;
  (rows || []).forEach((row, i) => {
    const r = Object.assign({}, row);
    out.push(r);
    if (blank(r.word)) return;
    const needs = !onlyEmpty || blank(r.meaning) || blank(r.category) || blank(r.example);
    if (!needs) return;
    const hit = lookupEx(bank, r.word);
    if (!hit) {
      missing.push(String(r.word).trim());
      missingIdx.push(i);
      return;
    }
    const e = hit.entry;
    let changed = false;
    const put = (field, val) => {
      if (!val) return;
      if (onlyEmpty && !blank(r[field])) return;
      if (r[field] !== val) { r[field] = val; changed = true; }
    };
    put('meaning', e.vi);
    put('category', e.cat);
    put('example', e.ex);
    if (changed) filled++;
    if (hit.via !== 'exact') viaPlural.push(String(r.word).trim());
  });
  return { rows: out, filled, missing, missingIdx, viaPlural };
}

let bankPromise = null;

// Nạp lười; cache Promise. Lỗi mạng thì xoá cache để lần sau thử lại.
export function loadBank() {
  if (!bankPromise) {
    bankPromise = import('../../data/wordbank/words.json')
      .then((m) => buildBank(m.default || m))
      .catch((err) => { bankPromise = null; throw err; });
  }
  return bankPromise;
}
