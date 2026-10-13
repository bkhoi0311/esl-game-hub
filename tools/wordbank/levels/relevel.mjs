// Gắn lại cấp chính xác cho các từ cũ trong tools/wordbank/parts/part-*.json (PLAN-LEVELS mục 2.5).
//   cấp = cấp THẤP NHẤT mà từ có trong danh sách Cambridge (levels.json); không có trong danh sách => 'other'.
//   levelCheck=false khi đã chắc. Từ trùng ứng viên MẬP MỜ (ambiguous.json chưa quyết) thì giữ cấp cũ, levelCheck=true, chờ quyết.
// Dùng: node tools/wordbank/levels/relevel.mjs [--dry] [--apply-senses]   (mặc định ghi vào parts/ và review/relevel.json, review/sense-review.tsv)
//   Quyết định nghĩa theo cấp nằm ở fixups.json "senses" (PLAN-LEVELS 2.4, 2.5 bước 4):
//     keep    = giữ nghĩa kho; relabel = đổi nghĩa theo sense cấp thấp nhất. Trường vi/pos/cat/ex/img/note có trong quyết định
//     được ghi đè vào parts khi chạy với --apply-senses (idempotent). Cấp LUÔN là cấp thấp nhất (không có lựa chọn nâng cấp,
//     vì check.mjs và tests/levels.test.mjs đòi level = cấp thấp nhất của danh sách).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wb = path.join(here, '..');
const ORDER = ['starters', 'movers', 'flyers', 'ket', 'pet', 'other'];

export function buildIndex(levelsDoc) {
  const exact = new Map();
  const viaAlt = new Map();
  (levelsDoc.words || []).forEach((w) => {
    exact.set(w.word, w);
    w.alts.forEach((a) => { if (!viaAlt.has(a)) viaAlt.set(a, w); });
    if (w.pl && !viaAlt.has(w.pl)) viaAlt.set(w.pl, w);
  });
  (levelsDoc.sets || []).forEach((s) => { if (!exact.has(s.word)) exact.set(s.word, Object.assign({ senses: [{ level: s.level, pos: [s.pos], note: s.note || '' }], pos: [s.pos], lists: ['sets'] }, s)); });
  return { exact, viaAlt };
}

// Trả { lemma, via } hoặc null.
export function matchWord(entry, idx) {
  const w = entry.word;
  if (idx.exact.has(w)) return { lemma: idx.exact.get(w), via: 'exact' };
  if (idx.viaAlt.has(w)) return { lemma: idx.viaAlt.get(w), via: 'alt' };
  // kho có alt/pl trỏ về một lemma
  const own = (entry.alt || []).concat(entry.pl ? [entry.pl] : []);
  for (let i = 0; i < own.length; i++) {
    if (idx.exact.has(own[i])) return { lemma: idx.exact.get(own[i]), via: 'own-alt' };
  }
  // dạng số nhiều thường
  const cand = [];
  if (/[^aeiou]ies$/.test(w)) cand.push(w.slice(0, -3) + 'y');
  if (/(s|x|z|ch|sh|o)es$/.test(w)) cand.push(w.slice(0, -2));
  if (/s$/.test(w)) cand.push(w.slice(0, -1));
  if (/ves$/.test(w)) cand.push(w.slice(0, -3) + 'f', w.slice(0, -3) + 'fe');
  for (let i = 0; i < cand.length; i++) if (idx.exact.has(cand[i])) return { lemma: idx.exact.get(cand[i]), via: 'plural' };
  return null;
}

export function heldWords(ambiguous) {
  const s = new Set();
  (ambiguous || []).filter((a) => !a.decision).forEach((a) => {
    s.add(String(a.word || '').toLowerCase());
    String(a.candidate || '').toLowerCase().split(/[^a-z']+/).forEach((t) => { if (t.length >= 3) s.add(t); });
  });
  return s;
}

const SENSE_FIELDS = ['vi', 'pos', 'cat', 'ex', 'img', 'note'];

export function loadSenseFix(fixups) {
  return (fixups && fixups.senses) || {};
}

export function relevelEntries(entries, idx, held, senseFix, opts) {
  const sf = senseFix || {};
  const applyFields = !!(opts && opts.applySenses);
  const changes = [];
  const warnings = [];
  const sense = [];
  const unmatched = [];
  const holdList = [];
  entries.forEach((e) => {
    const m = matchWord(e, idx);
    const oldLevel = e.level;
    if (m) {
      const lem = m.lemma;
      const dec = m.via === 'exact' ? sf[e.word] : null;
      e.level = lem.level;
      e.levelCheck = false;
      if (dec && applyFields) {
        SENSE_FIELDS.forEach((k) => { if (dec[k] !== undefined) e[k] = dec[k]; });
      }
      if (lem.pos && lem.pos.length && e.pos && ['n', 'v', 'adj', 'adv', 'prep', 'pron'].indexOf(e.pos) >= 0 && lem.pos.indexOf(e.pos) < 0 && m.via === 'exact') {
        warnings.push({ word: e.word, khoPos: e.pos, listPos: lem.pos.join('+') });
      }
      const sn = lem.senses || [];
      // Cần Opus xem khi: (a) nghĩa kho thuộc loại từ KHÔNG nằm ở sense cấp thấp nhất; hoặc (b) các sense khác cấp có ghi chú nghĩa khác nhau.
      const lowSenses = sn.filter((x) => x.level === lem.level);
      const lowPos = new Set([].concat(...lowSenses.map((x) => x.pos)));
      const posMismatch = m.via === 'exact' && sn.length > 1 && lowPos.size > 0 && ['n', 'v', 'adj', 'adv'].indexOf(e.pos) >= 0 && !lowPos.has(e.pos);
      const noted = sn.filter((x) => x.note);
      const noteClash = m.via === 'exact' && noted.length > 0 && new Set(sn.map((x) => x.level)).size > 1 && new Set(sn.map((x) => x.note || '')).size > 1;
      if (posMismatch || noteClash) {
        sense.push({ word: e.word, vi: e.vi, pos: e.pos, khoLevel: oldLevel, listLevel: lem.level, senses: sn.map((x) => `${x.level}:${x.pos.join('+')}${x.note ? ':' + x.note : ''}`).join(' / '), why: posMismatch ? 'pos' : 'note', decision: dec ? dec.action : '' });
      }
    } else if (held.has(e.word)) {
      e.levelCheck = true;
      holdList.push(e.word);
      return;
    } else {
      e.level = 'other';
      e.levelCheck = false;
      const tag = 'ngoài danh sách Cambridge';
      if (!String(e.note || '').includes(tag)) e.note = e.note ? e.note + '; ' + tag : tag;
      unmatched.push(e.word);
    }
    if (e.level !== oldLevel) changes.push({ word: e.word, old: oldLevel, new: e.level, via: m ? m.via : 'none' });
  });
  return { changes, warnings, sense, unmatched, holdList };
}

function main() {
  const dry = process.argv.includes('--dry');
  const applySenses = process.argv.includes('--apply-senses');
  const levels = JSON.parse(fs.readFileSync(path.join(wb, 'src', 'levels.json'), 'utf8'));
  const senseFix = loadSenseFix(JSON.parse(fs.readFileSync(path.join(here, 'fixups.json'), 'utf8')));
  let ambiguous = [];
  const ap = path.join(wb, 'ambiguous.json');
  if (fs.existsSync(ap)) ambiguous = JSON.parse(fs.readFileSync(ap, 'utf8'));
  const idx = buildIndex(levels);
  const held = heldWords(ambiguous);
  const partsDir = path.join(wb, 'parts');
  const files = fs.readdirSync(partsDir).filter((f) => /^part-\d\d\.json$/.test(f)).sort();
  const all = { changes: [], warnings: [], sense: [], unmatched: [], holdList: [] };
  const matrix = {};
  let total = 0;
  files.forEach((f) => {
    const p = path.join(partsDir, f);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const r = relevelEntries(data, idx, held, senseFix, { applySenses });
    Object.keys(all).forEach((k) => all[k].push(...r[k]));
    total += data.length;
    r.changes.forEach((c) => { const k = c.old + ' -> ' + c.new; matrix[k] = (matrix[k] || 0) + 1; });
    if (!dry) fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
  });
  const dist = {};
  files.forEach((f) => JSON.parse(fs.readFileSync(path.join(partsDir, f), 'utf8')).forEach((e) => { dist[e.level] = (dist[e.level] || 0) + 1; }));
  if (!dry) {
    fs.mkdirSync(path.join(wb, 'review'), { recursive: true });
    // Chạy lại khi không còn gì để đổi (idempotent) thì GIỮ nhật ký đổi cấp của lần chạy đầu.
    const logPath = path.join(wb, 'review', 'relevel.json');
    let prev = null;
    if (fs.existsSync(logPath)) { try { prev = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch (e) { prev = null; } }
    const keep = all.changes.length === 0 && prev && prev.changed > 0;
    fs.writeFileSync(logPath, JSON.stringify({ at: new Date().toISOString(), total, changed: keep ? prev.changed : all.changes.length, matrix: keep ? prev.matrix : matrix, unmatchedOther: all.unmatched.length ? all.unmatched : (prev ? prev.unmatchedOther : []), heldForAmbiguous: all.holdList, posWarnings: all.warnings, changes: keep ? prev.changes : all.changes }, null, 1) + '\n');
    const tsv = ['word\tvi\tpos\tkhoLevel\tlistLevel\twhy\tsenses\tdecision'].concat(all.sense.map((s) => [s.word, s.vi, s.pos, s.khoLevel, s.listLevel, s.why, s.senses, s.decision].join('\t')));
    fs.writeFileSync(path.join(wb, 'review', 'sense-review.tsv'), tsv.join('\n') + '\n');
  }
  console.log(`${dry ? '[dry] ' : ''}Relevel ${total} mục trong ${files.length} phần: đổi cấp ${all.changes.length}, không có trong danh sách (other) ${all.unmatched.length}, giữ chờ quyết mập mờ ${all.holdList.length}.`);
  console.log('Phân bố cấp mới:', JSON.stringify(dist));
  console.log('Cũ -> mới:');
  Object.entries(matrix).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  const undecided = all.sense.filter((x) => !x.decision).length;
  console.log(`Cảnh báo loại từ khác danh sách: ${all.warnings.length}; từ cần duyệt nghĩa theo cấp (sense-review): ${all.sense.length} (chưa quyết ${undecided})${applySenses ? '; đã áp fixups.senses' : ''}`);
  if (all.holdList.length) console.log('Giữ chờ:', all.holdList.join(', '));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
