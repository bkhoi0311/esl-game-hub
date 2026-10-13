// Gộp 3 danh sách Cambridge thành tools/wordbank/src/levels.json (PLAN-LEVELS mục 2.3, 2.4). Tất định.
// Đầu ra (đều KHÔNG commit): tools/wordbank/src/levels.json, tools/wordbank/ambiguous.json (gitignore), tools/wordbank/levels-lock.json (merge.mjs sinh).
// Dùng: node tools/wordbank/levels/build-levels.mjs [--accept-suggested] [--quiet]
//   --accept-suggested: chỉ để ĐO số liệu nếu chấp nhận mọi gợi ý (không dùng làm kết quả chính; mặc định bảo thủ: bỏ qua mục mập mờ).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYL } from './parse-yl.mjs';
import { parseKP } from './parse-kp.mjs';
import { normalizeHead } from './normalize-head.mjs';
import { buildSets } from './sets.mjs';
import { crossCheckYL } from './crosscheck.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const LEVEL_ORDER = ['starters', 'movers', 'flyers', 'ket', 'pet'];
export const PLAN_TARGETS = { starters: 471, movers: 360, flyers: 481, ket: 595, pet: 1404 };
const POS_MAP = {
  n: 'n', 'n pl': 'n', abbrev: 'n', pl: 'n', sing: 'n', v: 'v', 'phr v': 'v', adj: 'adj', adv: 'adv', prep: 'prep', pron: 'pron',
  'prep phr': 'phr', phr: 'phr', excl: 'phr', exclam: 'phr', det: 'other', int: 'other', poss: 'other', dis: 'other', conj: 'other', mv: 'other', av: 'other', title: 'other',
};
const FN_POS = new Set(['det', 'pron', 'conj', 'prep', 'poss', 'int', 'dis', 'mv', 'av', 'prep phr']);
const lvIdx = (l) => LEVEL_ORDER.indexOf(l);

export function mapPos(cpos) {
  const out = [];
  (cpos || []).forEach((p) => { const m = POS_MAP[p] || 'other'; if (out.indexOf(m) < 0) out.push(m); });
  return out;
}

// raw: [{ list, level, head, pos:[Cambridge], note, alts:[], line, provisional }]
export function mergeEntries(raws, fixups) {
  const fx = fixups || {};
  const map = new Map();
  const problems = [];
  raws.forEach((r) => {
    const nh = normalizeHead(r.head, fx);
    nh.problems.forEach((p) => problems.push(`${r.list} dòng ${r.line}: ${p}`));
    if (nh.skip || !nh.word) return;
    let e = map.get(nh.word);
    if (!e) {
      e = { word: nh.word, level: r.level, pos: [], kpos: '', alts: [], pl: '', display: '', phrv: false, senses: [], themes: [], fn: false, lists: [], lines: [] };
      map.set(nh.word, e);
    }
    nh.alts.concat(r.alts || []).forEach((a) => { const x = String(a).toLowerCase(); if (x && x !== e.word && e.alts.indexOf(x) < 0) e.alts.push(x); });
    if (nh.pl && !e.pl) e.pl = nh.pl;
    if (nh.display && !e.display) e.display = nh.display;
    if ((r.pos || []).indexOf('phr v') >= 0) e.phrv = true;
    const note = [r.note, nh.note].filter(Boolean).join('; ');
    const mp = mapPos(r.pos);
    const same = e.senses.find((s) => s.level === r.level && s.note === note);
    if (same) { mp.forEach((p) => { if (same.pos.indexOf(p) < 0) same.pos.push(p); }); r.pos.forEach((p) => { if (same.cpos.indexOf(p) < 0) same.cpos.push(p); }); }
    else e.senses.push({ level: r.level, pos: mp, cpos: (r.pos || []).slice(), note });
    if (e.lists.indexOf(r.list) < 0) e.lists.push(r.list);
    if (r.provisional) e.provisional = true;
    e.lines.push(`${r.list}:${r.line}`);
  });
  const words = [...map.values()];
  const lemmaSet = new Set(words.map((w) => w.word));
  words.forEach((e) => {
    e.level = e.senses.reduce((m, s) => (lvIdx(s.level) < lvIdx(m) ? s.level : m), e.senses[0].level);
    const low = e.senses.filter((s) => s.level === e.level);
    low.forEach((s) => s.pos.forEach((p) => { if (e.pos.indexOf(p) < 0) e.pos.push(p); }));
    e.kpos = e.pos[0] || 'other';
    const cp = [];
    low.forEach((s) => s.cpos.forEach((p) => { if (cp.indexOf(p) < 0) cp.push(p); }));
    e.fn = cp.length > 0 && cp.every((p) => FN_POS.has(p));
    e.alts = e.alts.filter((a) => !lemmaSet.has(a));
    if (e.pl === e.word) e.pl = e.word;
  });
  words.sort((a, b) => (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
  return { words, problems };
}

export function buildLevels(src, fixups, opts) {
  const fx = fixups || {};
  const o = opts || {};
  const yl = parseYL(src.yl, fx.yl);
  const ket = parseKP(src.ket, { level: 'ket', fixups: fx.kp });
  const pet = parseKP(src.pet, { level: 'pet', fixups: fx.kp });
  const raws = [];
  const nameKeys = new Set();
  ['S', 'M', 'F'].forEach((c) => yl.names[c].forEach((n) => nameKeys.add(n.toLowerCase().replace(/[’‘]/g, "'"))));
  let namesRemoved = 0;
  yl.entries.forEach((e) => {
    const k = e.head.toLowerCase();
    if (e.pos.length === 1 && e.pos[0] === 'n' && nameKeys.has(k)) { namesRemoved++; return; }
    raws.push({ list: 'yl', level: e.level, head: e.head, pos: e.pos, note: e.note, alts: [], line: e.line });
  });
  [[ket, 'ket'], [pet, 'pet']].forEach(([r, lv]) => {
    r.entries.forEach((e) => raws.push({ list: lv, level: lv, head: e.head, pos: e.pos, note: '', alts: e.alts || [], line: e.line }));
    if (o.acceptSuggested) r.suspects.filter((s) => s.hint.suggest === 'accept').forEach((s) => raws.push({ list: lv, level: lv, head: s.hint.word, pos: s.pos, note: '', alts: s.alts, line: s.line, provisional: true }));
  });
  const merged = mergeEntries(raws, fx);
  const wordSet = new Set(merged.words.map((w) => w.word));
  merged.words.forEach((w) => w.alts.concat(w.pl ? [w.pl] : []).forEach((a) => wordSet.add(a)));
  const sets = buildSets(wordSet);
  const counts = {};
  LEVEL_ORDER.forEach((l) => { counts[l] = merged.words.filter((w) => w.level === l).length; });
  const fnCounts = {};
  LEVEL_ORDER.forEach((l) => { fnCounts[l] = merged.words.filter((w) => w.level === l && w.fn).length; });
  const suspects = [];
  [[ket, 'ket'], [pet, 'pet']].forEach(([r, lv]) => r.suspects.forEach((s) => suspects.push(Object.assign({ list: lv }, s))));
  const stats = {
    lemmas: merged.words.length, byLevel: counts, functionWords: fnCounts, sets: sets.length,
    rawYL: yl.rawCount, entriesYL: yl.entries.length, namesRemoved, entriesKET: ket.entries.length, entriesPET: pet.entries.length,
    suspectsKET: ket.suspects.length, suspectsPET: pet.suspects.length, acceptSuggested: !!o.acceptSuggested,
    multiList: merged.words.filter((w) => w.lists.length > 1).length,
    multiPos: merged.words.filter((w) => w.pos.length > 1).length,
    phrasalVerbs: merged.words.filter((w) => w.phrv).length,
    multiWord: merged.words.filter((w) => w.word.indexOf(' ') >= 0).length,
  };
  const problems = [].concat(yl.problems.map((p) => 'yl: ' + p), ket.problems.map((p) => 'ket: ' + p), pet.problems.map((p) => 'pet: ' + p), merged.problems);
  return { doc: { v: 1, stats, names: yl.names, sets, words: merged.words }, suspects, problems };
}

export function suspectsToJson(suspects) {
  return suspects.map((s) => ({
    id: `${s.list}:${s.id}`, word: s.hint.word, candidate: s.candidate, source: s.list === 'ket' ? 'a2-key-2020.md' : 'b1-preliminary.md', line: s.line,
    pos: s.pos, context: s.context, suggest: s.hint.suggest, decision: null,
  }));
}

export function printReport(stats, log) {
  const L = log || console.log;
  L('Đối chiếu số lemma mỗi cấp (thấp nhất) với plan (±1%):');
  LEVEL_ORDER.forEach((l) => {
    const got = stats.byLevel[l];
    const want = PLAN_TARGETS[l];
    const pct = ((got - want) / want * 100).toFixed(1);
    L(`  ${l.padEnd(9)} parser ${String(got).padStart(5)} | plan ${String(want).padStart(5)} | lệch ${pct}%${Math.abs(got - want) / want <= 0.01 ? '  OK' : ''}`);
  });
  L(`  Tổng lemma ${stats.lemmas} (plan 3311); bộ từ sets ${stats.sets}; tên riêng loại ${stats.namesRemoved}`);
  L(`  YL: ${stats.rawYL} mục thô (plan 1407), ${stats.entriesYL} sau fixups; KET ${stats.entriesKET} mục + ${stats.suspectsKET} mập mờ; PET ${stats.entriesPET} mục + ${stats.suspectsPET} mập mờ`);
  L(`  Nhiều danh sách ${stats.multiList}, nhiều loại từ ${stats.multiPos}, cụm động từ ${stats.phrasalVerbs}, cụm nhiều chữ ${stats.multiWord}, từ chức năng ${JSON.stringify(stats.functionWords)}`);
}

export function loadFixups() {
  return JSON.parse(fs.readFileSync(path.join(here, 'fixups.json'), 'utf8'));
}

function main() {
  const argv = process.argv.slice(2);
  const srcDir = path.join(here, '..', 'src');
  const read = (f) => fs.readFileSync(path.join(srcDir, f), 'utf8');
  const src = { yl: read('starters-movers-flyers-2025.md'), ket: read('a2-key-2020.md'), pet: read('b1-preliminary.md') };
  const fx = loadFixups();
  const r = buildLevels(src, fx, { acceptSuggested: argv.includes('--accept-suggested') });
  if (!argv.includes('--accept-suggested')) {
    fs.writeFileSync(path.join(srcDir, 'levels.json'), JSON.stringify(r.doc));
    fs.writeFileSync(path.join(here, '..', 'ambiguous.json'), JSON.stringify(suspectsToJson(r.suspects), null, 1) + '\n');
    console.log(`Đã ghi tools/wordbank/src/levels.json (${r.doc.words.length} lemma) và tools/wordbank/ambiguous.json (${r.suspects.length} mục mập mờ chờ quyết định).`);
  }
  printReport(r.doc.stats);
  // Kiểm chéo với 3 danh sách riêng từng cấp (không có đuôi S/M/F). Bộ tách của danh sách riêng đơn giản hơn nên còn vài chênh lệch do cách tách ô, không phải lỗi parser chính.
  const cc = crossCheckYL(src.yl, parseYL(src.yl, fx.yl).entries, r.doc.names);
  console.log('Kiểm chéo YL (danh sách riêng | danh sách gộp, không tính tên riêng):', ['S', 'M', 'F'].map((c) => `${c} ${cc[c].list}|${cc[c].combined} (chỉ riêng ${cc[c].onlyList.length}, chỉ gộp ${cc[c].onlyCombined.length})`).join('; '));
  if (r.suspects.length) console.log(`Mập mờ chờ quyết định (bỏ qua theo quy tắc bảo thủ): KET ${r.doc.stats.suspectsKET}, PET ${r.doc.stats.suspectsPET}; gợi ý nhận: ${r.suspects.filter((s) => s.hint.suggest === 'accept').length}. Ghi quyết định vào fixups.json -> kp.decide["<ket|pet>:<id>"].`);
  if (r.problems.length) {
    console.log(`\n${r.problems.length} vấn đề cần fixups:`);
    r.problems.slice(0, 80).forEach((p) => console.log('  - ' + p));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
