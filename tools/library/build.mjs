// Ghép tools/library/topics.json với kho từ -> src/data/library/packs/<id>.json + src/data/library/index.json
// (PLAN-SOANBAI mục A5). Điều kiện mỗi gói sai thì DỪNG, không ghi gì.
// Dùng: node tools/library/build.mjs [--topics <file>] [--bank <words.json>] [--out <thư mục>]
// Gói gom theo CHỦ ĐỀ. `level` trong topics.json là tuỳ chọn; nếu thiếu, nhãn cấp (starters/movers/flyers) lấy theo
// cấp chiếm đa số trong gói (chỉ là gợi ý, cấp trong kho do AI tự gán nên không hứa chuẩn Cambridge).
// Câu hỏi do qgen.js sinh (15 câu, seed = hash(id)), rồi mỗi gói qua normalizePack/validatePack của content.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildBank, lookup } from '../../src/core/soanbai/wordbank.js';
import { generateQuestions, SAFE_QTYPES, LIBRARY_LIMITS } from '../../src/core/soanbai/qgen.js';
import { auditQuestion, auditActions, makeAuditEnv, classify } from './audit.mjs';
import { loadContent } from './content-node.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const topicsFile = opt('--topics', path.join(here, 'topics.json'));
const bankFile = opt('--bank', path.join(here, '../../src/data/wordbank/words.json'));
const outDir = opt('--out', path.join(here, '../../src/data/library'));

const LEVEL_LABEL = { starters: 'Pre A1 Starters', movers: 'A1 Movers', flyers: 'A2 Flyers' };
const ORDER = ['starters', 'movers', 'flyers', 'ket', 'other'];
const WANT_Q = 15;
const MIN_Q = 12;

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
// Đợt 4: câu loại an toàn (letter, word, meaning, spell) là chính; fill/which tối đa LIBRARY_LIMITS câu và phải qua audit.
// Thiếu câu (<MIN_Q) thì sinh lại chỉ với loại an toàn (tối đa 2 câu mỗi từ do qgen đảm bảo).
async function makeQuestions(vocab, id, bank, env, bad) {
  const seed = hash(id);
  let qs = generateQuestions(vocab, { count: WANT_Q, seed, bank, limits: LIBRARY_LIMITS }).questions;
  if (qs.length < MIN_Q) qs = generateQuestions(vocab, { count: WANT_Q, seed, bank, types: SAFE_QTYPES }).questions;
  qs.forEach((q, i) => {
    const rules = auditQuestion(q, env);
    if (rules.length) bad(`câu ${i + 1} (${classify(q.prompt)}) vi phạm audit: ${rules.join('; ')}`);
  });
  return qs;
}

function majorityLevel(entries) {
  const c = {};
  entries.forEach((e) => { const l = ORDER.indexOf(e.level) >= 0 && e.level !== 'ket' && e.level !== 'other' ? e.level : null; if (l) c[l] = (c[l] || 0) + 1; });
  let best = 'starters', n = -1;
  ['starters', 'movers', 'flyers'].forEach((l) => { if ((c[l] || 0) > n) { best = l; n = c[l] || 0; } });
  return best;
}

function validate(pack, topic, levelIdx) {
  const errs = [];
  const n = pack.vocab.length;
  if (n < 12 || n > 20) errs.push(`${n} từ (cần 12-20)`);
  const cats = {};
  pack.vocab.forEach((v) => { cats[v.category] = (cats[v.category] || 0) + 1; });
  if (Object.values(cats).filter((c) => c >= 4).length < 1) errs.push('cần >=1 category có >=4 từ: ' + JSON.stringify(cats));
  if (new Set(pack.vocab.map((v) => v.meaning)).size < 6) errs.push('cần >=6 nghĩa khác nhau');
  if (pack.questions.length < MIN_Q) errs.push(`${pack.questions.length} câu hỏi (cần >=${MIN_Q})`);
  pack.questions.forEach((q, i) => {
    const o = q.options || [];
    const norm = o.map((x) => String(x).trim().toLowerCase());
    if (o.length !== 3 || new Set(norm).size !== 3 || norm.some((x) => !x)) errs.push(`câu ${i + 1}: cần 3 phương án khác nhau, không rỗng`);
    if (!(q.answer >= 0 && q.answer < 3)) errs.push(`câu ${i + 1}: answer ngoài 0-2`);
    if (!q.prompt || !String(q.prompt).trim()) errs.push(`câu ${i + 1}: prompt rỗng`);
  });
  const ac = pack.actionCommands.length;
  if (ac < 4 || ac > 8) errs.push(`${ac} actionCommands (cần 4-8)`);
  if (pack.actionCommands.some((a) => /[^\x20-\x7e]/.test(a))) errs.push('actionCommands phải là tiếng Anh (ASCII)');
  void topic; void levelIdx;
  return errs;
}

async function main() {
  const content = await loadContent();
  const topics = JSON.parse(fs.readFileSync(topicsFile, 'utf8'));
  const bank = buildBank(JSON.parse(fs.readFileSync(bankFile, 'utf8')));
  const env = makeAuditEnv(bank);
  const packs = [];
  const problems = [];
  const ids = new Set();
  for (const t of topics) {
    const bad = (m) => problems.push(`${t.id || '?'}: ${m}`);
    if (!t.id || ids.has(t.id)) { bad('id thiếu/trùng'); continue; }
    ids.add(t.id);
    const vocab = [];
    const entries = [];
    (t.words || []).forEach((w) => {
      const e = lookup(bank, w);
      if (!e) { bad(`từ "${w}" không có trong kho`); return; }
      if (vocab.some((v) => v.word === e.word)) { bad(`từ "${w}" bị lặp`); return; }
      entries.push(e);
      vocab.push({ word: e.word, meaning: e.vi, category: e.cat, example: e.ex, image: '' });
    });
    const level = t.level || majorityLevel(entries);
    t.level = level;
    const pack = {
      title: t.title, level: LEVEL_LABEL[level], vocab,
      questions: [], actionCommands: t.actionCommands || [], teams: ['Red', 'Blue'],
    };
    if (vocab.length >= 3) pack.questions = await makeQuestions(vocab, t.id, bank, env, bad);
    auditActions(pack.actionCommands).forEach((m) => bad('actionCommands: ' + m));
    const errs = validate(pack, t, 0);
    const chk = content.validatePack(content.normalizePack(pack));
    chk.errors.forEach((m) => errs.push('validatePack: ' + m));
    chk.warnings.forEach((m) => errs.push('validatePack (cảnh báo): ' + m));
    errs.forEach(bad);
    packs.push({ t, pack });
  }
  if (problems.length) {
    problems.forEach((p) => console.error('LỖI    ' + p));
    console.error(`\n${problems.length} lỗi. Không ghi gì.`);
    process.exit(1);
  }
  fs.mkdirSync(path.join(outDir, 'packs'), { recursive: true });
  for (const f of fs.readdirSync(path.join(outDir, 'packs'))) if (f.endsWith('.json')) fs.unlinkSync(path.join(outDir, 'packs', f));
  const index = packs.map(({ t, pack }) => {
    fs.writeFileSync(path.join(outDir, 'packs', t.id + '.json'), JSON.stringify(pack, null, 2) + '\n');
    return { id: t.id, level: t.level, series: t.series || '', title: t.title, titleVi: t.titleVi || '', words: pack.vocab.length, questions: pack.questions.length, preview: pack.vocab.slice(0, 6).map((v) => v.word) };
  });
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  console.log(`Đã ghi ${index.length} gói vào ${path.relative(process.cwd(), outDir)}`);
  index.forEach((x) => console.log(`  ${x.id}: ${x.words} từ, ${x.questions} câu`));
}

main().catch((e) => { console.error(e); process.exit(1); });
