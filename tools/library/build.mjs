// Ghép tools/library/topics.json với kho từ -> src/data/library/packs/<id>.json + src/data/library/index.json
// (PLAN-SOANBAI mục A5). Điều kiện mỗi gói sai thì DỪNG, không ghi gì.
// Dùng: node tools/library/build.mjs [--topics <file>] [--bank <words.json>] [--out <thư mục>]
// Nguồn gói: tools/library/topics.json (31 gói "Chủ đề chung", không có `level`) + MỌI tệp tools/library/topics/<cấp>.json
// (mỗi cấp một tệp: movers, starters, flyers, ket, pet; bỏ qua *.draft.json). Định dạng (PLAN-LEVELS 5.3):
//   { id: 'm-pets-farm', level: 'movers', title, titleVi, words: [...], actionCommands: [...], qskip: [] }
// `qskip` = chỉ số câu (0..14 trong 15 câu sinh ra) bị loại tay sau khi duyệt, nên build lại ra y hệt, không sửa packs bằng tay.
// Gói có `level` kiểm luật 5.2: mọi từ có trong kho, không function/abstract, không từ cấp cao hơn cấp gói, >=60% từ đúng cấp,
// 'other' tối đa 2 từ (chỉ S/M/F), 12-20 từ, trong một cấp mỗi từ tối đa 2 gói. Gói chung chỉ kiểm luật chung; nhãn cấp là
// cấp chiếm đa số (chỉ là gợi ý). Câu fill/which không qua audit thì bị loại (không báo lỗi); loại khác vi phạm thì dừng.
// Câu hỏi do qgen.js sinh (15 câu, seed = hash(id)), rồi mỗi gói qua normalizePack/validatePack của content.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildBank, lookup } from '../../src/core/soanbai/wordbank.js';
import { LEVEL_LABEL, LEVEL_ORDER } from '../../src/core/soanbai/categories.js';
import { KID_UNSAFE } from '../../src/core/soanbai/qrules.js';
import { generateQuestions, SAFE_QTYPES, LIBRARY_LIMITS } from '../../src/core/soanbai/qgen.js';
import { auditQuestion, auditActions, makeAuditEnv, classify } from './audit.mjs';
import { loadContent } from './content-node.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const topicsFile = opt('--topics', null);
const bankFile = opt('--bank', path.join(here, '../../src/data/wordbank/words.json'));
const outDir = opt('--out', path.join(here, '../../src/data/library'));

const ORDER = ['starters', 'movers', 'flyers', 'ket', 'pet', 'other'];
// Thứ tự cấp trong index.json / giao diện: Movers, Starters, Flyers, KET, PET; gói chung (không cấp) ở cuối.
const TAB_ORDER = ['movers', 'starters', 'flyers', 'ket', 'pet'];
const WANT_Q = 15;
const MIN_Q = 12;

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
// Đợt 4: câu loại an toàn (letter, word, meaning, spell) là chính; fill/which tối đa LIBRARY_LIMITS câu và phải qua audit.
// Thiếu câu (<MIN_Q) thì sinh lại chỉ với loại an toàn (tối đa 2 câu mỗi từ do qgen đảm bảo).
async function makeQuestions(vocab, id, bank, env, bad, level, qskip) {
  const seed = hash(id);
  const drop = [];
  const seenPrompt = new Set();
  const pass = (qs) => qs.filter((q, i) => {
    const pk = q.prompt.trim().toLowerCase();
    if (seenPrompt.has(pk)) { drop.push(`${id} câu ${i + 1} bị loại: trùng câu hỏi "${q.prompt}"`); return false; }
    seenPrompt.add(pk);
    const rules = auditQuestion(q, env);
    if (!rules.length) return true;
    const kind = classify(q.prompt);
    if (kind === 'fill' || kind === 'which') { drop.push(`${id} câu ${i + 1} (${kind}) bị loại: ${rules.join('; ')}`); return false; }
    bad(`câu ${i + 1} (${kind}) vi phạm audit: ${rules.join('; ')}`);
    return true;
  });
  let qs = pass(generateQuestions(vocab, { count: WANT_Q, seed, bank, limits: LIBRARY_LIMITS, maxLevel: level }).questions);
  if (qs.length < MIN_Q) { seenPrompt.clear(); qs = pass(generateQuestions(vocab, { count: WANT_Q, seed, bank, types: SAFE_QTYPES, maxLevel: level }).questions); }
  // qskip: chỉ số trong danh sách câu đã sinh/lọc (thứ tự tất định) bị loại tay
  const skip = new Set(qskip || []);
  qs = qs.filter((_, i) => !skip.has(i));
  drop.forEach((m) => console.log('  (lọc) ' + m));
  return qs;
}

function majorityLevel(entries) {
  const c = {};
  entries.forEach((e) => { const l = ORDER.indexOf(e.level) >= 0 && e.level !== 'ket' && e.level !== 'pet' && e.level !== 'other' ? e.level : null; if (l) c[l] = (c[l] || 0) + 1; });
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

function readTopics() {
  if (topicsFile) return JSON.parse(fs.readFileSync(topicsFile, 'utf8'));
  const list = [];
  const old = path.join(here, 'topics.json');
  const dir = path.join(here, 'topics');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('.draft.json')).sort() : [];
  files.forEach((f) => {
    const arr = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    arr.forEach((t) => { t._src = 'topics/' + f; list.push(t); });
  });
  if (fs.existsSync(old)) JSON.parse(fs.readFileSync(old, 'utf8')).forEach((t) => { t._src = 'topics.json'; list.push(t); });
  return list;
}

async function main() {
  const content = await loadContent();
  const topics = readTopics();
  const bank = buildBank(JSON.parse(fs.readFileSync(bankFile, 'utf8')));
  const env = makeAuditEnv(bank);
  const packs = [];
  const problems = [];
  const ids = new Set();
  const useCount = {}; // cấp -> từ -> số gói
  for (const t of topics) {
    const bad = (m) => problems.push(`${t.id || '?'}: ${m}`);
    if (!t.id || ids.has(t.id)) { bad('id thiếu/trùng'); continue; }
    ids.add(t.id);
    const declared = t.level || null;
    if (declared && !TAB_ORDER.includes(declared)) bad(`level "${declared}" không hợp lệ`);
    if (declared && !t.id.startsWith(declared[0] + '-')) bad(`id phải bắt đầu bằng "${declared[0]}-"`);
    if (declared && (!t.title || t.title.length > 28)) bad('title cần 1-28 ký tự');
    if (declared && (!t.titleVi || t.titleVi.length > 32)) bad('titleVi cần 1-32 ký tự');
    const vocab = [];
    const entries = [];
    (t.words || []).forEach((w) => {
      const e = lookup(bank, w);
      if (!e) { bad(`từ "${w}" không có trong kho`); return; }
      if (vocab.some((v) => v.word === e.word)) { bad(`từ "${w}" bị lặp`); return; }
      if (t.level && KID_UNSAFE.has(e.word)) bad(`từ "${w}" nhạy cảm (KID_UNSAFE)`);
      entries.push(e);
      vocab.push({ word: e.word, meaning: e.vi, category: e.cat, example: e.ex, image: '' });
    });
    const level = declared || majorityLevel(entries);
    if (declared) {
      // luật 5.2
      const lv = LEVEL_ORDER[declared];
      const own = entries.filter((e) => e.level === declared).length;
      let other = 0;
      entries.forEach((e) => {
        if (e.level === 'other') other++;
        else if (LEVEL_ORDER[e.level] > lv) bad(`"${e.word}" cấp ${e.level} cao hơn cấp gói ${declared}`);
        if (e.cat === 'function' || e.cat === 'abstract') bad(`"${e.word}" là ${e.cat} (không đưa vào gói chủ đề)`);
        const uc = useCount[declared] || (useCount[declared] = {});
        if (e.level === declared) uc[e.word] = (uc[e.word] || 0) + 1;
      });
      if (entries.length && own / entries.length < 0.6) bad(`chỉ ${own}/${entries.length} từ đúng cấp ${declared} (cần >=60%)`);
      if (other > 2 || (other && !['starters', 'movers', 'flyers'].includes(declared))) bad(`${other} từ "other" (tối đa 2, chỉ S/M/F)`);
    }
    t.level = declared;
    const pack = {
      title: t.title, level: LEVEL_LABEL[level], vocab,
      questions: [], actionCommands: t.actionCommands || [], teams: ['Red', 'Blue'],
    };
    if (vocab.length >= 3) pack.questions = await makeQuestions(vocab, t.id, bank, env, bad, level, t.qskip);
    auditActions(pack.actionCommands).forEach((m) => bad('actionCommands: ' + m));
    const errs = validate(pack, t, 0);
    const chk = content.validatePack(content.normalizePack(pack));
    chk.errors.forEach((m) => errs.push('validatePack: ' + m));
    chk.warnings.forEach((m) => errs.push('validatePack (cảnh báo): ' + m));
    errs.forEach(bad);
    t._eff = level;
    packs.push({ t, pack });
  }
  Object.keys(useCount).forEach((lv) => Object.keys(useCount[lv]).forEach((w) => {
    if (useCount[lv][w] > 2) problems.push(`${lv}: từ "${w}" nằm ${useCount[lv][w]} gói (tối đa 2 trong một cấp)`);
  }));
  if (problems.length) {
    problems.forEach((p) => console.error('LỖI    ' + p));
    console.error(`\n${problems.length} lỗi. Không ghi gì.`);
    process.exit(1);
  }
  // Thứ tự: Movers, Starters, Flyers, KET, PET (theo thứ tự tệp trong mỗi cấp), rồi gói chung.
  const rank = (t) => (t.level ? TAB_ORDER.indexOf(t.level) : TAB_ORDER.length);
  packs.sort((a, b) => rank(a.t) - rank(b.t) || topics.indexOf(a.t) - topics.indexOf(b.t));
  fs.mkdirSync(path.join(outDir, 'packs'), { recursive: true });
  for (const f of fs.readdirSync(path.join(outDir, 'packs'))) if (f.endsWith('.json')) fs.unlinkSync(path.join(outDir, 'packs', f));
  const index = packs.map(({ t, pack }) => {
    fs.writeFileSync(path.join(outDir, 'packs', t.id + '.json'), JSON.stringify(pack, null, 2) + '\n');
    const item = { id: t.id, level: t._eff, levelLabel: LEVEL_LABEL[t._eff], series: t.series || '', title: t.title, titleVi: t.titleVi || '' };
    if (!t.level) item.general = true;
    Object.assign(item, { words: pack.vocab.length, questions: pack.questions.length, preview: pack.vocab.slice(0, 4).map((v) => v.word), kw: pack.vocab.map((v) => v.word).join(' ') });
    return item;
  });
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index) + '\n');
  console.log(`Đã ghi ${index.length} gói vào ${path.relative(process.cwd(), outDir)}`);
  // Bảng phủ theo cấp (từ có nội dung = không function/abstract)
  TAB_ORDER.forEach((lv) => {
    const mine = packs.filter((p) => p.t.level === lv);
    if (!mine.length) return;
    const cov = new Set();
    mine.forEach(({ pack }) => pack.vocab.forEach((v) => cov.add(v.word)));
    const need = bank.list.filter((e) => e.level === lv && e.cat !== 'function' && e.cat !== 'abstract');
    const got = need.filter((e) => cov.has(e.word)).length;
    console.log(`  ${lv}: ${mine.length} gói, phủ ${got}/${need.length} = ${(got / need.length * 100).toFixed(1)}%`);
  });
  console.log(`  chung: ${packs.filter((p) => !p.t.level).length} gói`);
}

main().catch((e) => { console.error(e); process.exit(1); });
