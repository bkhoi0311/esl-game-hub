// Kiểm chéo parser YL (PLAN-LEVELS 2.1 bước 5): đếm mục trong 3 danh sách RIÊNG từng cấp (không có đuôi S/M/F)
// và so tập headword với danh sách gộp. Chênh lệch phải bằng 0 sau fixups.
import { YL_POS, parseEntry } from './parse-yl.mjs';

const POSSET = new Set(YL_POS);
const NOTE2 = /^(?:of)$/;
const norm = (s) => String(s).replace(/[’‘]/g, "'");

// Tách dòng rời không có đuôi cấp: mỗi mục kết thúc ở cụm loại từ (n, n + v, adj + excl ...), có thể kèm "of place|of time".
function splitByPos(line) {
  const toks = line.trim().split(/\s+/);
  const cells = [];
  let cur = [];
  for (let i = 0; i < toks.length; i++) {
    cur.push(toks[i]);
    if (POSSET.has(toks[i]) && toks[i - 1] !== '+' && cur.length > 1) {
      // gom tiếp "+ pos"
      while (toks[i + 1] === '+' && POSSET.has(toks[i + 2])) { cur.push(toks[i + 1], toks[i + 2]); i += 2; }
      if (NOTE2.test(toks[i + 1] || '') && /^(place|time)$/.test(toks[i + 2] || '')) { cur.push(toks[i + 1], toks[i + 2]); i += 2; }
      cells.push(cur.join(' '));
      cur = [];
    }
  }
  if (cur.length) cells.push({ incomplete: cur.join(' ') });
  return cells;
}

export function listHeads(text) {
  const lines = String(text).split(/\r?\n/);
  const out = { S: [], M: [], F: [] };
  let lv = null;
  let stop = false;
  const pending = ['', '', '', '', '', ''];
  const take = (col, c) => {
    pending[col] = pending[col] ? pending[col] + ' ' + c : c;
    const p = pending[col];
    if (/\s(?:adj|adv|conj|det|dis|excl|int|n|poss|prep|pron|v)(?:\s*\+\s*\w+)*(?:\sof\s(?:place|time))?$/.test(p) && lv) {
      const e = parseEntry(p + ' ' + lv);
      if (e && !e.noPos) { out[lv].push(e.head); pending[col] = ''; }
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const t = norm(lines[i]).trim();
    let m;
    if ((m = /^(?:\d+\s+)?(Pre A1 Starters|A1 Movers|A2 Flyers) A.Z wordlist(?:\s+\d+)?$/.exec(t))) { lv = { 'Pre A1 Starters': 'S', 'A1 Movers': 'M', 'A2 Flyers': 'F' }[m[1]]; stop = false; continue; }
    if (/alphabetic vocabulary list/.test(t) && !/A.Z wordlist/.test(t)) { lv = null; }
    if (!lv) continue;
    if (t === 'Names' || /^(Numbers|Letters & numbers)$/.test(t)) { stop = true; continue; }
    if (stop || !t || /^\|\s*:?-+/.test(t) || /Grammatical key|^[A-Z]$/.test(t) || /^(adj|adv|conj|det|dis|excl|int|n|poss|prep|pron|v)\s{2}\S/.test(t)) continue;
    if (t.startsWith('|')) {
      t.split('|').slice(1, -1).map((c) => c.trim()).forEach((c, col) => { if (c && !/^(adj|adv|conj|det|dis|excl|int|n|poss|prep|pron|v)\s{2}\S|no words at this level/.test(c)) take(col, c); });
    } else {
      let col = 0;
      splitByPos(t).forEach((c) => {
        if (typeof c === 'string') take(col, c);
        else pending[col] = pending[col] ? pending[col] + ' ' + c.incomplete : c.incomplete;
        col++;
      });
    }
  }
  return out;
}

const key = (h) => h.toLowerCase().replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').replace(/[….]+/g, '...').trim();

export function crossCheckYL(text, entries, names) {
  const lists = listHeads(text);
  const nm = new Set([].concat(...Object.values(names || {})).map((n) => key(n)));
  const res = {};
  const code = { starters: 'S', movers: 'M', flyers: 'F' };
  ['S', 'M', 'F'].forEach((c) => {
    const lvName = Object.keys(code).find((k) => code[k] === c);
    const a = new Map();
    lists[c].forEach((h) => { if (!nm.has(key(h))) a.set(key(h), (a.get(key(h)) || 0) + 1); });
    const b = new Map();
    entries.filter((e) => e.level === lvName && !(e.pos.length === 1 && e.pos[0] === 'n' && nm.has(key(e.head)))).forEach((e) => b.set(key(e.head), (b.get(key(e.head)) || 0) + 1));
    const onlyList = [...a.keys()].filter((k) => !b.has(k));
    const onlyCombined = [...b.keys()].filter((k) => !a.has(k));
    res[c] = { list: [...a.values()].reduce((x, y) => x + y, 0), combined: [...b.values()].reduce((x, y) => x + y, 0), onlyList, onlyCombined };
  });
  return res;
}
