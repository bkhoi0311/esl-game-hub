// Sinh tools/wordbank/in/new-XX.txt cho các từ MỚI (chưa có trong kho) theo bảng phần 3.1 của PLAN-LEVELS (25 phần).
// Thứ tự: movers (2) -> starters (2) -> sets (1) -> flyers (3) -> ket (5) -> pet (12).
// Mỗi dòng (TAB): word, kpos, level, sense, alt(|), pl, display, cpos. Chỉ có từ, loại từ, cấp và ghi chú ngắn của danh sách: không có câu/định nghĩa.
// Dùng: node tools/wordbank/levels/split-new.mjs [--dry]    (chạy lại sau khi Opus quyết ambiguous/fixups: số phần giữ nguyên, nội dung chia lại)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, matchWord } from './relevel.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const wb = path.join(here, '..');
export const PLAN_PARTS = [['movers', 2], ['starters', 2], ['sets', 1], ['flyers', 3], ['ket', 5], ['pet', 12]];

export function coveredLemmas(khoEntries, idx) {
  const cov = new Set();
  khoEntries.forEach((e) => { const m = matchWord(e, idx); if (m) cov.add(m.lemma.word); });
  return cov;
}

export function newItems(levelsDoc, khoEntries) {
  const idx = buildIndex(levelsDoc);
  const cov = coveredLemmas(khoEntries, idx);
  const out = { movers: [], starters: [], flyers: [], ket: [], pet: [], sets: [] };
  (levelsDoc.words || []).forEach((w) => {
    if (cov.has(w.word)) return;
    const low = (w.senses || []).filter((s) => s.level === w.level);
    const notes = [];
    const cpos = [];
    low.forEach((s) => { if (s.note && notes.indexOf(s.note) < 0) notes.push(s.note); s.cpos.forEach((p) => { if (cpos.indexOf(p) < 0) cpos.push(p); }); });
    out[w.level].push({ word: w.word, kpos: w.kpos, level: w.level, sense: notes.join('; ').replace(/\t/g, ' '), alt: w.alts, pl: w.pl || '', display: w.display || '', cpos: cpos.join('+'), theme: (w.themes && w.themes[0]) || '' });
  });
  (levelsDoc.sets || []).forEach((s) => {
    if (cov.has(s.word)) return;
    // bộ từ: coi như level thật để check, nhưng nằm trong phần "sets"
    out.sets.push({ word: s.word, kpos: s.kpos, level: s.level, sense: s.note || '', alt: s.alts || [], pl: '', display: s.display || '', cpos: s.pos, theme: s.cat });
  });
  Object.keys(out).forEach((k) => out[k].sort((a, b) => (a.theme < b.theme ? -1 : a.theme > b.theme ? 1 : a.word < b.word ? -1 : a.word > b.word ? 1 : 0)));
  return out;
}

export function chunk(arr, n) {
  const size = Math.ceil(arr.length / n) || 1;
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(arr.slice(i * size, (i + 1) * size));
  return parts;
}

export function toLine(x) {
  return [x.word, x.kpos, x.level, x.sense, (x.alt || []).join('|'), x.pl, x.display, x.cpos].join('\t');
}

function readKho() {
  const dir = path.join(wb, 'parts');
  const all = [];
  fs.readdirSync(dir).filter((f) => /^(part|new)-\d\d\.json$/.test(f)).sort().forEach((f) => all.push(...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))));
  return all;
}

function main() {
  const dry = process.argv.includes('--dry');
  const levels = JSON.parse(fs.readFileSync(path.join(wb, 'src', 'levels.json'), 'utf8'));
  // Từ đã soạn ở new-NN thì không chia lại (an toàn khi chạy lại giữa chừng): chỉ tính phần part-NN cũ làm "đã có".
  const kho = readKho().filter(Boolean);
  const items = newItems(levels, kho);
  const inDir = path.join(wb, 'in');
  if (!dry) fs.readdirSync(inDir).filter((f) => /^new-\d\d\.txt$/.test(f)).forEach((f) => fs.unlinkSync(path.join(inDir, f)));
  let n = 0;
  const summary = {};
  PLAN_PARTS.forEach(([lv, parts]) => {
    chunk(items[lv], parts).forEach((slice, i) => {
      n++;
      const name = `new-${String(n).padStart(2, '0')}.txt`;
      if (!dry) fs.writeFileSync(path.join(inDir, name), slice.map(toLine).join('\n') + '\n');
      summary[lv] = (summary[lv] || []).concat([`${name} (${slice.length})`]);
    });
  });
  const counts = Object.fromEntries(Object.keys(items).map((k) => [k, items[k].length]));
  console.log(`${dry ? '[dry] ' : ''}Từ MỚI cần soạn theo cấp:`, JSON.stringify(counts), 'tổng', Object.values(counts).reduce((a, b) => a + b, 0));
  Object.entries(summary).forEach(([k, v]) => console.log(`  ${k}: ${v.join(', ')}`));
  console.log(`Số phần: ${n} (plan: 25)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
