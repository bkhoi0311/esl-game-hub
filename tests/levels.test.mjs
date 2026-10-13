// Test pipeline cấp độ (PLAN-LEVELS mục 7.1). Chạy: node --test tests/levels.test.mjs
// Không phụ thuộc tệp có bản quyền: parser chạy trên fixture tự viết ở tests/fixtures/levels/.
// Các test "dữ liệu thật" tự bỏ qua khi tools/wordbank/src/levels.json không có (ví dụ trên CI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseYL, parseEntry, splitFreeLine } from '../tools/wordbank/levels/parse-yl.mjs';
import { parseKP } from '../tools/wordbank/levels/parse-kp.mjs';
import { normalizeHead } from '../tools/wordbank/levels/normalize-head.mjs';
import { buildLevels, mergeEntries, mapPos } from '../tools/wordbank/levels/build-levels.mjs';
import { buildSets } from '../tools/wordbank/levels/sets.mjs';
import { buildIndex, matchWord, relevelEntries, heldWords } from '../tools/wordbank/levels/relevel.mjs';
import { newItems, chunk, toLine, PLAN_PARTS } from '../tools/wordbank/levels/split-new.mjs';
import { checkEntries, loadCopyIndex, copyHit, EX_LIMITS, readInFile } from '../tools/wordbank/check.mjs';
import { CATEGORIES, LEVELS, LEVEL_CODES, LEVEL_ORDER, LEVEL_LABEL, catAllowsPos, WHICH_CATS, isKnownCategory } from '../src/core/soanbai/categories.js';
import { noDistractorFill, nearCat, synClash, KID_UNSAFE, isGeneric } from '../src/core/soanbai/qrules.js';
import { buildBank } from '../src/core/soanbai/wordbank.js';
import { generateQuestions, maxLevelOf } from '../src/core/soanbai/qgen.js';

const fixDir = new URL('./fixtures/levels/', import.meta.url);
const fix = (f) => fs.readFileSync(new URL(f, fixDir), 'utf8');
const here = fileURLToPath(new URL('..', import.meta.url));
const wbDir = here + 'tools/wordbank/';
const levelsPath = wbDir + 'src/levels.json';
const hasLevels = fs.existsSync(levelsPath);

// ---------- parse-yl (fixture) ----------

test('parse-yl: ô gãy cùng cột, dòng rời có 2 dấu cách, đuôi S/M/F, tên riêng', () => {
  const fx = { posOverride: { 'a.m.': 'adv' } };
  const r = parseYL(fix('yl.md'), fx);
  assert.deepEqual(r.problems, []);
  assert.equal(r.rawCount, 31);
  const by = (head, level) => r.entries.find((e) => e.head === head && (!level || e.level === level));
  // ô gãy cùng cột: "bat (as sports" + "equipment) n S"
  assert.ok(by('bat (as sports equipment)'));
  assert.equal(by('bat (as sports equipment)').level, 'starters');
  // dòng rời, 2 dấu cách đánh dấu ô chưa xong: "dear (as in Dear Harry)" + "adj F" ở hàng sau
  assert.ok(by('dear (as in Dear Harry)', 'flyers'));
  assert.deepEqual(by('dear (as in Dear Harry)').pos, ['adj']);
  assert.ok(by('difficult', 'movers') && by('down', 'movers'));
  // loại từ ghép
  assert.deepEqual(by('all').pos, ['adj', 'adv', 'det', 'pron']);
  assert.deepEqual(by('answer').pos, ['n', 'v']);
  // cùng từ ở 2 cấp
  assert.equal(r.entries.filter((e) => e.head === 'drive').length, 2);
  assert.deepEqual(r.entries.filter((e) => e.head === 'drive').map((e) => e.level).sort(), ['movers', 'starters']);
  // poss không biến adj thành ghi chú
  assert.equal(by('my').note, '');
  assert.deepEqual(by('my').pos, ['poss']);
  // tên riêng
  assert.deepEqual(r.names.S, ['Alex', 'Ann/Anna']);
  assert.deepEqual(r.names.M, ['Zoe', 'Fred']);
  assert.deepEqual(r.names.F, ['Betty', 'Emma']);
});

test('parse-yl: parseEntry và splitFreeLine', () => {
  const e = parseEntry('at prep of place S');
  assert.deepEqual([e.head, e.pos, e.note, e.level], ['at', ['prep'], 'of place', 'starters']);
  assert.equal(parseEntry('colour (US color) n + v S').head, 'colour (US color)');
  assert.equal(parseEntry('fish (s + pl) n S').head, 'fish (s + pl)');
  assert.equal(parseEntry('no pos here S').noPos, true);
  const cells = splitFreeLine('fair adj M file n (as in open and close  flat (US apartment) n S Friday n M');
  assert.equal(cells.length, 4);
  assert.deepEqual(cells.map((c) => c.done), [true, false, true, true]);
});

// ---------- parse-kp (fixture) ----------

test('parse-kp: headword, loại từ, nhãn sau ví dụ, chữ cái phân nhóm, Anh-Mỹ', () => {
  const r = parseKP(fix('ket.md'), { level: 'ket' });
  const heads = r.entries.map((e) => e.head);
  assert.deepEqual(heads, ['allow', 'a/an', 'all the time', 'alone', 'about', 'biscuit', 'barbecue/barbeque', 'mobile (phone)', 'all right/alright', 'design (PLANNING)', 'design (DRAWING)', 'give', 'bank']);
  // câu ví dụ có dấu kết câu + nhãn loại từ => KHÔNG tạo mục; headword sau câu ví dụ thì nhận
  assert.ok(!heads.some((h) => /about £3|tea was|money in/.test(h)));
  assert.deepEqual(r.entries.find((e) => e.head === 'biscuit').alts, ['cookie']);
  assert.deepEqual(r.entries.find((e) => e.head === 'about').pos, ['adv', 'prep']);
});

test('parse-kp: mục mập mờ KHÔNG đoán: bỏ qua, ghi suspects kèm gợi ý; fixups.decide quyết', () => {
  const r = parseKP(fix('ket.md'), { level: 'ket' });
  assert.deepEqual(r.suspects.map((s) => s.candidate), ['a book about animals', 'a language class cook']);
  assert.ok(!r.entries.some((e) => /animals|cook$/.test(e.head)));
  assert.ok(r.suspects.every((s) => s.hint && ['accept', 'reject'].includes(s.hint.suggest) && s.context));
  const d = parseKP(fix('ket.md'), { level: 'ket', fixups: { decide: { 'ket:12': 'reject', 'ket:15': 'cook' } } });
  assert.equal(d.suspects.length, 0);
  assert.ok(d.entries.some((e) => e.head === 'cook' && e.viaFixup));
  assert.ok(!d.entries.some((e) => /animals/.test(e.head)));
  const p = parseKP(fix('pet.md'), { level: 'pet' });
  assert.equal(p.suspects.length, 1);
  assert.equal(p.suspects[0].hint.word, 'advert');
  assert.deepEqual(p.entries.map((e) => e.head), ['adult', 'a/an', 'advanced', 'about', 'allow', 'bank']);
});

// ---------- normalize-head ----------

test('normalize-head: lemma, biến thể Anh-Mỹ, tuỳ chọn, gạch chéo, số nhiều', () => {
  const n = (h, fx) => normalizeHead(h, fx);
  assert.deepEqual([n('apartment (UK flat)').word, n('apartment (UK flat)').alts], ['apartment', ['flat']]);
  assert.deepEqual(n('candy (UK sweet(s))').alts, ['sweet', 'sweets']);
  assert.deepEqual([n('film (US movie) star').word, n('film (US movie) star').alts], ['film star', ['movie star']]);
  assert.equal(n('fish (s + pl)').pl, 'fish');
  assert.deepEqual([n('child/children').word, n('child/children').pl], ['child', 'children']);
  assert.deepEqual([n('blond(e)').word, n('blond(e)').alts], ['blond', ['blonde']]);
  assert.deepEqual([n('have (got) to').word, n('have (got) to').alts], ['have to', ['have got to']]);
  assert.deepEqual([n('city/town centre').word, n('city/town centre').alts], ['city centre', ['town centre']]);
  assert.deepEqual([n('take a photo/picture').word, n('take a photo/picture').alts], ['take a photo', ['take a picture']]);
  assert.deepEqual(n('centimetre (cm)').alts, ['cm']);
  assert.equal(n('design (PLANNING)').word, 'design');
  assert.equal(n('Monday').display, 'Monday');
  assert.equal(n('TV').display, 'TV');
  assert.deepEqual([n('a/an').word, n('a/an').alts], ['a', ['an']]);
  assert.equal(n('wake (up)', { heads: { 'wake (up)': { word: 'wake up', alts: ['wake'] } } }).word, 'wake up');
  assert.equal(n('as … as').word, 'as ... as');
});

test('build-levels: gộp 3 danh sách, cấp thấp nhất, loại tên riêng, bộ từ, mập mờ chưa quyết', () => {
  const src = { yl: fix('yl.md'), ket: fix('ket.md'), pet: fix('pet.md') };
  const fx = { yl: { posOverride: { 'a.m.': 'adv' } }, kp: {}, heads: {} };
  const r = buildLevels(src, fx);
  const w = (word) => r.doc.words.find((x) => x.word === word);
  // cấp thấp nhất: allow KET, bank KET, about KET, a/an: det Starters (YL) & KET & PET
  assert.equal(w('a').level, 'starters');
  assert.deepEqual(w('a').lists.sort(), ['ket', 'pet', 'yl'].sort());
  assert.equal(w('allow').level, 'ket');
  assert.equal(w('bank').level, 'ket');
  assert.equal(w('bank').lists.length, 2);
  assert.equal(w('drive').level, 'starters');
  assert.equal(w('drive').senses.length, 2);
  assert.deepEqual(w('drive').pos, ['v']);
  assert.deepEqual(w('child').pl, 'children');
  assert.equal(w('fish').pl, 'fish');
  // tên riêng bị loại
  assert.ok(!w('alex') && !w('zoe') && !w('ann'));
  assert.equal(r.doc.stats.namesRemoved, 3);
  // chức năng
  assert.equal(w('a').fn, true);
  assert.equal(w('answer').fn, false);
  // cấp thấp nhất cho mọi mục là một trong 5 cấp
  r.doc.words.forEach((x) => assert.ok(['starters', 'movers', 'flyers', 'ket', 'pet'].includes(x.level), x.word));
  // mục mập mờ KHÔNG vào levels, nằm trong suspects
  assert.ok(!w('cook') && !w('advert'));
  assert.equal(r.suspects.length, 3);
  assert.deepEqual(r.suspects.map((s) => s.list), ['ket', 'ket', 'pet']);
  // alts trùng lemma khác bị bỏ (apartment/flat): flat không phải lemma ở fixture nên giữ
  assert.deepEqual(w('apartment').alts, ['flat']);
  // sets: số có sẵn, không trùng lemma
  assert.ok(r.doc.sets.some((s) => s.word === 'twelve' && s.level === 'starters'));
  assert.ok(r.doc.sets.some((s) => s.word === 'brazilian' && s.level === 'ket' && s.kpos === 'adj'));
  assert.ok(!r.doc.sets.some((s) => r.doc.words.some((x) => x.word === s.word)));
  // quyết định fixups làm lemma xuất hiện
  const r2 = buildLevels(src, Object.assign({}, fx, { kp: { decide: { 'ket:15': 'cook', 'ket:12': 'reject', 'pet:8': 'accept' } } }));
  assert.equal(r2.doc.words.find((x) => x.word === 'cook').level, 'ket');
  assert.equal(r2.doc.words.find((x) => x.word === 'advert').level, 'pet');
  assert.equal(r2.suspects.length, 0);
});

test('build-levels: tất định (chạy 2 lần ra giống nhau); mapPos', () => {
  const src = { yl: fix('yl.md'), ket: fix('ket.md'), pet: fix('pet.md') };
  const fx = { yl: { posOverride: { 'a.m.': 'adv' } }, kp: {}, heads: {} };
  assert.equal(JSON.stringify(buildLevels(src, fx).doc), JSON.stringify(buildLevels(src, fx).doc));
  assert.deepEqual(mapPos(['n', 'phr v', 'det', 'exclam']), ['n', 'v', 'other', 'phr']);
  const m = mergeEntries([{ list: 'yl', level: 'movers', head: 'tidy', pos: ['adj'], note: '', alts: [], line: 1 }, { list: 'ket', level: 'ket', head: 'tidy', pos: ['v'], note: '', alts: [], line: 2 }]);
  assert.equal(m.words.length, 1);
  assert.deepEqual([m.words[0].level, m.words[0].pos], ['movers', ['adj']]);
});

// ---------- relevel ----------

function miniDoc() {
  return buildLevels({ yl: fix('yl.md'), ket: fix('ket.md'), pet: fix('pet.md') }, { yl: { posOverride: { 'a.m.': 'adv' } }, kp: {}, heads: {} }).doc;
}

test('relevel: cấp thấp nhất, số nhiều/alt, ngoài danh sách = other, mập mờ giữ nguyên chờ quyết', () => {
  const doc = miniDoc();
  const idx = buildIndex(doc);
  const mk = (word, level, extra) => Object.assign({ word, vi: 'x', pos: 'n', cat: 'thing', level, ex: 'x', img: '', alt: [], pl: '', check: false, levelCheck: true, skip: false, note: '' }, extra || {});
  const entries = [mk('drive', 'ket', { pos: 'v' }), mk('children', 'flyers'), mk('flat', 'movers'), mk('unicorn', 'movers'), mk('bank', 'starters'), mk('twelve', 'ket', { pos: 'num' }), mk('animals', 'movers')];
  const held = heldWords([{ word: 'animals', candidate: 'a book about animals', decision: null }]);
  const r = relevelEntries(entries, idx, held);
  const get = (w) => entries.find((e) => e.word === w);
  assert.equal(get('drive').level, 'starters');
  assert.equal(get('children').level, 'starters'); // qua pl của "child"
  assert.equal(get('flat').level, 'starters'); // qua alt của "apartment"
  assert.equal(get('bank').level, 'ket');
  assert.equal(get('twelve').level, 'starters'); // bộ từ
  assert.equal(get('unicorn').level, 'other');
  assert.ok(/ngoài danh sách Cambridge/.test(get('unicorn').note));
  assert.equal(get('animals').levelCheck, true); // giữ chờ quyết
  assert.equal(get('animals').level, 'movers');
  entries.filter((e) => e.word !== 'animals').forEach((e) => assert.equal(e.levelCheck, false, e.word));
  assert.ok(r.changes.length >= 5 && r.holdList.length === 1);
  assert.equal(matchWord(mk('teeth', 'x'), idx).lemma.word, 'tooth');
  assert.equal(matchWord(mk('unicorn', 'x'), idx), null);
});

// ---------- split-new ----------

test('split-new: từ mới theo cấp, 25 phần theo thứ tự, định dạng 8 cột', () => {
  assert.deepEqual(PLAN_PARTS.map((p) => p[0]), ['movers', 'starters', 'sets', 'flyers', 'ket', 'pet']);
  assert.equal(PLAN_PARTS.reduce((a, p) => a + p[1], 0), 25);
  const doc = miniDoc();
  const kho = [{ word: 'drive', alt: [], pl: '' }, { word: 'children', alt: [], pl: '' }, { word: 'twelve', alt: [], pl: '' }];
  const items = newItems(doc, kho);
  assert.ok(!items.starters.some((x) => x.word === 'drive' || x.word === 'child'));
  assert.ok(!items.sets.some((x) => x.word === 'twelve'));
  assert.ok(items.ket.some((x) => x.word === 'bank'));
  const line = toLine(items.ket.find((x) => x.word === 'about'));
  assert.equal(line.split('\t').length, 8);
  assert.equal(line.split('\t')[2], 'ket');
  const parts = chunk(Array.from({ length: 10 }, (_, i) => i), 3);
  assert.deepEqual(parts.map((p) => p.length), [4, 4, 2]);
  assert.equal(chunk([], 2).length, 2);
});

// ---------- check.mjs mở rộng ----------

const goodEntry = (o) => Object.assign({ word: 'borrow', vi: 'mượn', pos: 'v', cat: 'daily', level: 'flyers', ex: 'Can I borrow your pencil, please?', img: '', alt: [], pl: '', display: '', sense: '', check: false, levelCheck: false, skip: false, note: '' }, o || {});

test('check: cat đúng loại từ, độ dài ex theo cấp (lỗi ở new-NN), cấp theo danh sách', () => {
  const rows = [{ word: 'borrow', pos: 'v', level: 'flyers', sense: '', alt: [], pl: '', display: '', isNew: true }];
  const doc = { v: 1, stats: {}, names: {}, sets: [], words: [{ word: 'borrow', level: 'flyers', pos: ['v'], alts: [], pl: '', senses: [{ level: 'flyers', pos: ['v'], cpos: ['v'], note: '' }], lists: ['yl'] }, { word: 'mind', level: 'movers', pos: ['n'], alts: [], pl: '', senses: [], lists: ['yl'] }] };
  const env = { idx: buildIndex(doc), held: new Set(), copy: null, lock: null, source: 'test' };
  const ok = checkEntries([goodEntry()], rows, 'new-01', env);
  assert.deepEqual(ok.errors, []);
  // sai nhãn loại từ: daily chỉ cho v
  assert.ok(checkEntries([goodEntry({ cat: 'abstract' })], rows, 'new-01', env).errors.some((e) => /chỉ dùng cho loại từ n/.test(e)));
  assert.equal(catAllowsPos('daily', 'n'), false);
  // ex quá 12 từ ở flyers
  const longEx = 'Can I borrow your pencil and your pen and your ruler from you please now?';
  assert.ok(checkEntries([goodEntry({ ex: longEx })], rows, 'new-01', env).errors.some((e) => /cấp flyers cần 4-12/.test(e)));
  // part-NN cũ: chỉ lưu ý, không lỗi
  const legacy = checkEntries([goodEntry({ level: 'starters', ex: 'Can I borrow your red pencil and blue pen, please today?' })], null, 'part-01', { idx: null });
  assert.equal(legacy.errors.length, 0);
  assert.ok(legacy.notes.some((n) => /ngoài giới hạn cấp starters/.test(n)));
  // đổi cấp so với in-file
  assert.ok(checkEntries([goodEntry({ level: 'movers' })], rows, 'new-01', env).errors.some((e) => /khác in-file/.test(e)));
  // cấp khác cấp thấp nhất trong danh sách
  assert.ok(checkEntries([goodEntry({ level: 'ket' })], null, 'part-01', env).errors.some((e) => /cấp thấp nhất trong danh sách "flyers"/.test(e)));
  // từ không có trong danh sách mà cấp khác other
  assert.ok(checkEntries([goodEntry({ word: 'zzzword', ex: 'The zzzword is on the big table.', level: 'ket' })], null, 'part-01', env).errors.some((e) => /phải là "other"/.test(e)));
  assert.equal(checkEntries([goodEntry({ word: 'zzzword', ex: 'The zzzword is on the big table.', level: 'other', cat: 'thing', pos: 'n' })], null, 'part-01', env).errors.length, 0);
  // levelCheck:true ở new-NN là lỗi
  assert.ok(checkEntries([goodEntry({ levelCheck: true })], rows, 'new-01', env).errors.some((e) => /levelCheck luôn false/.test(e)));
});

test('check: chặn chép ví dụ Cambridge (≥6 từ liền) bằng tệp nguồn cục bộ; không có tệp thì bỏ qua', () => {
  const copy = loadCopyIndex(fileURLToPath(fixDir));
  assert.ok(copy && copy.grams.size > 0);
  assert.ok(copyHit('My little sister has a red bicycle and a green hat.', copy));
  assert.ok(copyHit('Tom said my little sister has a red bicycle today.', copy)); // 6 từ liền
  assert.equal(copyHit('My sister has a red bicycle.', copy), null);
  assert.equal(copyHit('Please close the window before you leave the room tonight', copy) !== null, true);
  const env = { idx: null, held: new Set(), copy };
  const r = checkEntries([goodEntry({ word: 'hat', vi: 'cái mũ', pos: 'n', cat: 'clothes', level: 'ket', ex: 'My little sister has a red bicycle and a green hat.' })], null, 'new-09', env);
  assert.ok(r.errors.some((e) => /chép ví dụ Cambridge/.test(e)));
  const noSrc = loadCopyIndex(fileURLToPath(new URL('./nonexistent/', import.meta.url)));
  assert.equal(noSrc, null);
  assert.equal(copyHit('anything at all goes here today', noSrc), null);
  assert.ok(EX_LIMITS.pet[1] === 14 && EX_LIMITS.starters[2] === 55);
});

test('check: readInFile new-NN đọc đủ 8 cột', () => {
  const tmp = fileURLToPath(new URL('./tmp-new-99.txt', fixDir));
  const p = tmp.replace('tmp-new-99.txt', 'new-99.txt');
  fs.writeFileSync(p, 'at\tprep\tstarters\tof place\t@\t\t\tprep\nchild\tn\tstarters\t\t\tchildren\tChild\tn\n');
  try {
    const rows = readInFile(p);
    assert.deepEqual(rows[0], { word: 'at', pos: 'prep', level: 'starters', sense: 'of place', alt: ['@'], pl: '', display: '', cpos: 'prep', isNew: true });
    assert.equal(rows[1].pl, 'children');
    assert.equal(rows[1].display, 'Child');
  } finally { fs.unlinkSync(p); }
});

// ---------- categories / qrules ----------

test('categories: 58 nhãn, cấp pet, pos cho phép, which mở rộng', () => {
  assert.equal(Object.keys(CATEGORIES).length, 58);
  const added = ['health', 'material', 'subject', 'study', 'work', 'money', 'travel', 'media', 'environment', 'measure', 'country', 'nationality', 'abstract', 'character', 'opinion', 'manner', 'motion', 'speech', 'mind', 'daily', 'function'];
  assert.equal(added.length, 21);
  added.forEach((k) => { assert.ok(isKnownCategory(k), k); assert.ok(CATEGORIES[k].pos && CATEGORIES[k].pos.length, k); assert.ok(CATEGORIES[k].phrase && CATEGORIES[k].group && CATEGORIES[k].vi, k); });
  assert.deepEqual(LEVELS, ['starters', 'movers', 'flyers', 'ket', 'pet', 'other']);
  assert.equal(LEVEL_CODES.pet, 'p');
  assert.deepEqual(Object.keys(LEVEL_ORDER), LEVELS);
  assert.equal(LEVEL_LABEL.pet, 'B1 Preliminary (PET)');
  ['material', 'subject', 'measure', 'country'].forEach((k) => assert.ok(WHICH_CATS.has(k), k));
  ['abstract', 'function', 'health', 'daily'].forEach((k) => assert.ok(!WHICH_CATS.has(k), k));
  assert.ok(catAllowsPos('motion', 'v') && !catAllowsPos('motion', 'n'));
  assert.ok(catAllowsPos('nationality', 'adj') && catAllowsPos('nationality', 'n'));
  assert.ok(catAllowsPos('function', 'prep') && catAllowsPos('function', 'other'));
  assert.ok(catAllowsPos('fruit', 'n') && catAllowsPos('fruit', 'adj')); // nhãn cũ không giới hạn loại từ
  assert.ok(!catAllowsPos('zzz', 'n'));
  assert.ok(noDistractorFill('function') && noDistractorFill('abstract') && !noDistractorFill('animal'));
  assert.ok(nearCat('health', 'body') && nearCat('travel', 'place') && nearCat('speech', 'mind'));
  assert.ok(!nearCat('motion', 'speech') && !nearCat('speech', 'daily') && !nearCat('motion', 'mind'));
  assert.ok(synClash('begin', 'start') && synClash('rubbish', 'garbage') && synClash('lorry', 'truck'));
  ['crime', 'prison', 'arrest', 'thief'].forEach((w) => assert.ok(KID_UNSAFE.has(w), w));
  assert.equal(isGeneric('She is very ___.'), true);
  assert.equal(isGeneric('I feel ___ when I wake up late.'), true);
});

// ---------- qgen: lọc theo cấp ----------

function levelBank() {
  const rows = [];
  const add = (w, vi, pos, cat, lv, ex) => rows.push([w, vi, pos, cat, lv, ex, '', '', '']);
  // Starters (s): 8 danh từ ở 4 nhóm
  [['cat', 'con mèo', 'animal'], ['dog', 'con chó', 'animal'], ['apple', 'quả táo', 'fruit'], ['pear', 'quả lê', 'fruit'], ['bus', 'xe buýt', 'transport'], ['car', 'xe hơi', 'transport'], ['hat', 'cái mũ', 'clothes'], ['shoe', 'chiếc giày', 'clothes']].forEach(([w, vi, c], i) => add(w, vi, 'n', c, 's', `We see the ${w} near home ${i}.`));
  // KET (k) và PET (p): nhiều danh từ/tính từ/động từ ở nhiều nhóm
  const nounsK = [['ticket', 'tấm vé', 'travel'], ['passport', 'hộ chiếu', 'travel'], ['bank', 'ngân hàng', 'money'], ['salary', 'tiền lương', 'money'], ['cotton', 'vải bông', 'material'], ['leather', 'da thuộc', 'material'], ['maths', 'môn toán', 'subject'], ['history', 'môn lịch sử', 'subject']];
  nounsK.forEach(([w, vi, c]) => add(w, vi, 'n', c, 'k', `I think about the ${w} every single day.`));
  const nounsP = [['pollution', 'ô nhiễm', 'environment'], ['recycling', 'tái chế', 'environment'], ['headache', 'cơn đau đầu', 'health'], ['vaccine', 'vắc xin', 'health'], ['interview', 'phỏng vấn', 'work'], ['career', 'sự nghiệp', 'work']];
  nounsP.forEach(([w, vi, c]) => add(w, vi, 'n', c, 'p', `The ${w} was a big topic in class.`));
  const adjK = [['careful', 'cẩn thận', 'character'], ['polite', 'lịch sự', 'character'], ['awful', 'tồi tệ', 'opinion'], ['lovely', 'đáng yêu', 'opinion'], ['upset', 'buồn bã', 'feeling'], ['nervous', 'lo lắng', 'feeling']];
  adjK.forEach(([w, vi, c]) => add(w, vi, 'adj', c, 'k', `She felt very ${w} on that day.`));
  const vK = [['borrow', 'mượn', 'daily'], ['repair', 'sửa chữa', 'daily'], ['explain', 'giải thích', 'speech'], ['whisper', 'thì thầm', 'speech'], ['remember', 'nhớ', 'mind'], ['decide', 'quyết định', 'mind'], ['hurry', 'vội vã', 'motion'], ['wander', 'đi lang thang', 'motion']];
  vK.forEach(([w, vi, c]) => add(w, vi, 'v', c, 'k', `They like to ${w} in the evening.`));
  return buildBank({ v: 1, cols: ['w', 'vi', 'pos', 'cat', 'lv', 'ex', 'alt', 'pl', 'd'], rows });
}

test('qgen: maxLevel=starters không bao giờ trả nhiễu cấp KET/PET (200 seed); capacity/maxLevelOf', () => {
  const bank = levelBank();
  const vocab = ['cat', 'apple', 'bus', 'hat', 'dog'].map((w) => ({ word: w, meaning: bank.map.get(w).vi, category: bank.map.get(w).cat, example: bank.map.get(w).ex }));
  assert.equal(maxLevelOf(vocab, bank), 'starters');
  assert.equal(maxLevelOf([{ word: 'ticket' }], bank), 'ket');
  assert.equal(maxLevelOf([{ word: 'zzz' }], bank), null);
  const byVi = new Map();
  const byWord = new Map();
  bank.list.forEach((e) => { byVi.set(e.vi, e); byWord.set(e.word, e); });
  let count = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const res = generateQuestions(vocab, { seed, count: 12, bank, maxLevel: 'starters', types: ['meaning', 'word', 'fill', 'which'] });
    res.questions.forEach((q) => {
      q.options.forEach((o) => {
        const e = byVi.get(o) || byWord.get(String(o).toLowerCase());
        if (e) { count++; assert.ok(['starters', 'movers', 'flyers'].includes(e.level), `seed ${seed}: nhiễu cấp ${e.level}: ${o}`); }
      });
    });
  }
  assert.ok(count > 200, 'có đủ phương án để kiểm (' + count + ')');
  // đối chứng: bảng có 1 từ Starters cùng nhãn "animal" với các từ KET/PET; không lọc thì nhiễu KET xuất hiện, lọc maxLevel=starters thì không
  const bank2 = buildBank({ v: 1, cols: ['w', 'vi', 'pos', 'cat', 'lv', 'ex', 'alt', 'pl', 'd'], rows: [
    ['cat', 'con mèo', 'n', 'animal', 's', 'The cat is on the bed today.', '', '', ''],
    ['dog', 'con chó', 'n', 'animal', 's', 'The dog runs in the park.', '', '', ''],
    ['pear', 'quả lê', 'n', 'fruit', 's', 'I eat a pear after lunch.', '', '', ''],
    ['wolf', 'con sói', 'n', 'animal', 'k', 'The wolf lives in a forest far away.', '', '', ''],
    ['dolphin', 'cá heo', 'n', 'sea-animal', 'k', 'A dolphin can swim very fast.', '', '', ''],
    ['eagle', 'chim đại bàng', 'n', 'bird', 'p', 'An eagle flies high above the hills.', '', '', ''],
  ] });
  const v2 = [{ word: 'cat', meaning: 'con mèo', category: 'animal' }, { word: 'rabbit' }, { word: 'mouse' }];
  const byVi2 = new Map(bank2.list.map((e) => [e.vi, e]));
  let highFree = 0;
  let highCut = 0;
  for (let seed = 1; seed <= 120; seed++) {
    generateQuestions(v2, { seed, count: 6, bank: bank2, types: ['meaning'] }).questions.forEach((q) => q.options.forEach((o) => { const e = byVi2.get(o); if (e && (e.level === 'ket' || e.level === 'pet')) highFree++; }));
    generateQuestions(v2, { seed, count: 6, bank: bank2, types: ['meaning'], maxLevel: 'starters' }).questions.forEach((q) => q.options.forEach((o) => { const e = byVi2.get(o); if (e && (e.level === 'ket' || e.level === 'pet')) highCut++; }));
  }
  assert.ok(highFree > 0, 'đối chứng: không lọc cấp thì có nhiễu KET/PET');
  assert.equal(highCut, 0);
  const auto = generateQuestions(vocab, { seed: 5, count: 10, bank, maxLevel: 'auto', types: ['meaning'] });
  auto.questions.forEach((q) => q.options.forEach((o) => { const e = byVi.get(o); if (e) assert.equal(e.level, 'starters'); }));
});

test('qgen: KET/PET nhiễu cùng loại từ (≥90%), khác nhóm khi kho đủ ứng viên', () => {
  const bank = levelBank();
  const sameLevel = (w) => bank.map.get(w);
  const vocab = ['ticket', 'bank', 'cotton', 'careful', 'borrow', 'remember', 'awful', 'hurry'].map((w) => ({ word: w, meaning: sameLevel(w).vi, category: sameLevel(w).cat, example: sameLevel(w).ex }));
  assert.equal(maxLevelOf(vocab, bank), 'ket');
  const byVi = new Map();
  const byWord = new Map();
  bank.list.forEach((e) => { byVi.set(e.vi, e); byWord.set(e.word, e); });
  let total = 0;
  let samePos = 0;
  let sameGroup = 0;
  const answerOf = (q) => q.options[q.answer];
  for (let seed = 1; seed <= 60; seed++) {
    const res = generateQuestions(vocab, { seed, count: 8, bank, maxLevel: 'ket', types: ['meaning', 'word'] });
    res.questions.forEach((q) => {
      const ans = byVi.get(answerOf(q)) || byWord.get(String(answerOf(q)).toLowerCase());
      q.options.forEach((o, i) => {
        if (i === q.answer) return;
        const e = byVi.get(o) || byWord.get(String(o).toLowerCase());
        if (!e || !ans) return;
        total++;
        if (e.pos === ans.pos) samePos++;
        if (CATEGORIES[e.cat].group === CATEGORIES[ans.cat].group) sameGroup++;
      });
    });
  }
  assert.ok(total > 100, 'đủ mẫu ' + total);
  assert.ok(samePos / total >= 0.9, `nhiễu cùng loại từ ${(samePos / total * 100).toFixed(1)}%`);
  assert.ok(sameGroup / total <= 0.2, `nhiễu cùng nhóm ${(sameGroup / total * 100).toFixed(1)}% (ưu tiên khác nhóm)`);
});

// ---------- dữ liệu thật (chỉ khi có tệp cục bộ) ----------

test('dữ liệu thật: levels.json đúng số lemma của plan (S/M/F ±1%), mập mờ chưa quyết nằm trong ambiguous.json', { skip: !hasLevels }, () => {
  const d = JSON.parse(fs.readFileSync(levelsPath, 'utf8'));
  const plan = { starters: 471, movers: 360, flyers: 481 };
  for (const [lv, n] of Object.entries(plan)) {
    const got = d.stats.byLevel[lv];
    assert.ok(Math.abs(got - n) / n <= 0.01, `${lv}: ${got} so với ${n}`);
  }
  // KET/PET: bảo thủ bỏ mục mập mờ nên thấp hơn plan tối đa ~4%
  assert.ok(Math.abs(d.stats.byLevel.ket - 595) / 595 <= 0.04, 'ket ' + d.stats.byLevel.ket);
  assert.ok(Math.abs(d.stats.byLevel.pet - 1404) / 1404 <= 0.04, 'pet ' + d.stats.byLevel.pet);
  assert.equal(d.stats.rawYL >= 1407 && d.stats.rawYL <= 1408, true, 'YL mục thô ' + d.stats.rawYL);
  assert.equal(d.names.S.length + d.names.M.length + d.names.F.length, 51);
  const amb = JSON.parse(fs.readFileSync(wbDir + 'ambiguous.json', 'utf8'));
  assert.equal(amb.length, d.stats.suspectsKET + d.stats.suspectsPET);
  amb.forEach((a) => assert.ok(a.id && a.candidate && a.source && a.line && a.context && ['accept', 'reject'].includes(a.suggest), a.id));
  // mỗi lemma có đúng 1 mục, lemma hợp lệ
  const seen = new Set();
  d.words.forEach((w) => { assert.ok(!seen.has(w.word), 'trùng ' + w.word); seen.add(w.word); assert.ok(/^[a-zé0-9][a-zé0-9 '.@()-]*$/.test(w.word) || /\.\.\./.test(w.word), w.word); });
});

test('dữ liệu thật: kho parts nhất quán (cat/pos/level, levelCheck chỉ còn mục chờ mập mờ, không trùng word)', () => {
  const dir = wbDir + 'parts/';
  const all = [];
  fs.readdirSync(dir).filter((f) => /^(part|new)-\d\d\.json$/.test(f)).forEach((f) => all.push(...JSON.parse(fs.readFileSync(dir + f, 'utf8'))));
  assert.ok(all.length >= 1161);
  const seen = new Set();
  all.forEach((e) => {
    assert.ok(!seen.has(e.word), 'trùng word ' + e.word);
    seen.add(e.word);
    assert.ok(LEVELS.includes(e.level), e.word + ' level ' + e.level);
    assert.ok(isKnownCategory(e.cat), e.word + ' cat ' + e.cat);
    if (!e.skip) assert.ok(catAllowsPos(e.cat, e.pos), `${e.word}: cat ${e.cat} không hợp pos ${e.pos}`);
  });
  const pending = all.filter((e) => e.levelCheck === true);
  if (hasLevels && fs.existsSync(wbDir + 'ambiguous.json')) {
    const held = heldWords(JSON.parse(fs.readFileSync(wbDir + 'ambiguous.json', 'utf8')));
    pending.forEach((e) => assert.ok(held.has(e.word), `${e.word}: levelCheck:true nhưng không thuộc mục mập mờ`));
  }
  // cấp trong parts khớp danh sách (khi có levels.json)
  if (hasLevels) {
    const idx = buildIndex(JSON.parse(fs.readFileSync(levelsPath, 'utf8')));
    all.filter((e) => !e.levelCheck).forEach((e) => {
      const m = matchWord(e, idx);
      if (m) assert.equal(e.level, m.lemma.level, e.word);
      else assert.equal(e.level, 'other', e.word);
    });
  }
});

test('dữ liệu thật: words.json cột + kích thước (thô ≤420 KB, gzip ≤120 KB), cấp p hợp lệ', () => {
  const wp = here + 'src/data/wordbank/words.json';
  const text = fs.readFileSync(wp, 'utf8');
  const j = JSON.parse(text);
  assert.deepEqual(j.cols.slice(0, 8), ['w', 'vi', 'pos', 'cat', 'lv', 'ex', 'alt', 'pl']);
  assert.ok(Buffer.byteLength(text) <= 420 * 1024, 'thô ' + Buffer.byteLength(text));
  assert.ok(zlib.gzipSync(text).length <= 120 * 1024, 'gzip ' + zlib.gzipSync(text).length);
  const lvIdx = j.cols.indexOf('lv');
  const catIdx = j.cols.indexOf('cat');
  j.rows.forEach((r) => { assert.ok('smfkpo'.includes(r[lvIdx]), r[0]); assert.ok(isKnownCategory(r[catIdx]), r[0]); });
  const bank = buildBank(j);
  assert.equal(bank.size, j.rows.length);
  assert.ok(bank.list.every((e) => LEVELS.includes(e.level)));
});

// ---------- Đợt 2 (ghép kho): matcher, trùng khoá, may, NO_MEANING_Q, tự điền ----------

import { findWordInText, wordForms } from '../src/core/soanbai/normalize.js';
import { foldKey, dupKey, checkAll } from '../tools/wordbank/check.mjs';
import { NO_MEANING_Q, noMeaningQ } from '../src/core/soanbai/qrules.js';
import { fillRows, lookup } from '../src/core/soanbai/wordbank.js';

const realWords = () => JSON.parse(fs.readFileSync(here + 'src/data/wordbank/words.json', 'utf8'));

test('findWordInText: chỗ trống "as ... as", somebody/someone/something, hậu tố nghĩa (month)', () => {
  assert.equal(findWordInText('I can run as fast as my brother.', 'as ... as').length, 1);
  assert.equal(findWordInText('I like cats and dogs.', 'as ... as').length, 0);
  assert.equal(findWordInText('I will give you a call after school.', 'give somebody a call', { alt: ['give somebody a ring'] }).length, 1);
  assert.equal(findWordInText('Please give the new teacher a ring.', 'give somebody a call', { alt: ['give somebody a ring'] }).length, 1);
  // chính từ somebody / something vẫn là từ thường, chỉ khớp 1 lần mỗi chỗ
  assert.equal(findWordInText('I want something to drink.', 'something').length, 1);
  assert.equal(findWordInText('I think someone is at the door.', 'someone').length, 1);
  assert.ok(wordForms('may (month)').indexOf('may') >= 0);
  assert.equal(findWordInText('The flowers come out in May.', 'may (month)').length, 1);
  assert.equal(findWordInText('We have an IT lesson on Tuesday.', 'it (subject)', { alt: ['information technology'] }).length, 1);
});

test('check: khoá chuẩn hoá bỏ dấu, cặp số ít/số nhiều cùng nghĩa là LỖI khi có mục mới, cặp cũ chỉ là lưu ý', () => {
  assert.equal(dupKey('Café'), dupKey('cafe'));
  assert.equal(foldKey('meatballs'), foldKey('meatball'));
  assert.equal(foldKey('olives'), foldKey('olive'));
  const mk = (word, vi, pos) => ({ word, vi, pos, cat: 'food', level: 'starters', ex: 'We eat ' + word + ' at home.', img: '', alt: [], pl: '', display: '', sense: '', check: false, levelCheck: false, skip: false, note: '' });
  const tmp = fs.mkdtempSync(here + 'tests/.tmp-dup-');
  try {
    const inDir = tmp + '/in';
    const pDir = tmp + '/parts';
    fs.mkdirSync(inDir); fs.mkdirSync(pDir);
    const write = (name, entries) => {
      fs.writeFileSync(inDir + '/' + name + '.txt', entries.map((e) => (/^new-/.test(name) ? [e.word, e.pos, e.level, '', '', '', '', e.pos].join('\t') : e.word + '\tx')).join('\n') + '\n');
      fs.writeFileSync(pDir + '/' + name + '.json', JSON.stringify(entries, null, 2));
    };
    write('part-01', [mk('meatball', 'thịt viên', 'n'), mk('bat', 'gậy đánh bóng', 'n')]);
    write('new-01', [mk('meatballs', 'thịt viên', 'n'), mk('bats', 'con dơi', 'n')]);
    const r = checkAll({ inDir, partsDir: pDir, env: null });
    assert.ok(r.errors.some((e) => /meatball.*meatballs|meatballs.*meatball/.test(e)), r.errors.join('\n'));
    assert.ok(!r.errors.some((e) => /bats/.test(e)), 'nghĩa khác nhau thì không coi là trùng');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('nhãn manner cho phép loại từ phr (README thống nhất với check.mjs)', () => {
  assert.ok(catAllowsPos('manner', 'phr') && catAllowsPos('manner', 'adv') && !catAllowsPos('manner', 'n'));
  const readme = fs.readFileSync(wbDir + 'README-AGENT-LEVELS.md', 'utf8');
  assert.ok(/\| `manner` \| Cách thức \| adv phr \|/.test(readme));
  assert.ok(!/police caught/i.test(readme), 'README không còn câu mẫu cụ thể để agent chép');
});

test('dữ liệu thật đợt 2: parser fixups (iced tea, it/IT, may, town/city centre, wetsuit, efficient) và không còn khoá trùng', () => {
  const bank = buildBank(realWords());
  const get = (w) => lookup(bank, w);
  ['dj during', 'suprising', 'something efficient', 'wetsuit suit', 'ing tea', 'town centre', 'cafe', 'a little', 'pajamas', 'yogurt'].forEach((w) => {
    const e = bank.map.get(w);
    assert.ok(!e, w + ' phải được loại hoặc gộp thành alt');
  });
  assert.equal(get('iced tea').vi, 'trà đá');
  assert.equal(get('wetsuit').vi, 'bộ đồ lặn');
  assert.ok(get('efficient'));
  assert.equal(get('town centre').word, 'city centre');
  assert.equal(get('cafe').word, 'café');
  assert.equal(get('a little').word, 'little');
  assert.equal(get('few').word, 'a few');
  assert.equal(get('pajamas').word, 'pyjamas');
  assert.equal(get('yogurt').word, 'yoghurt');
  const it = bank.map.get('it');
  assert.equal(it.pos, 'pron');
  assert.equal(it.display, '');
  assert.deepEqual(it.alt, []);
  assert.equal(bank.map.get('it (subject)').display, 'IT');
  assert.equal(bank.map.get('at').alt.length, 0);
  assert.equal(bank.map.get('get on').alt.length, 0);
  const may = bank.map.get('may');
  assert.equal(may.vi, 'có thể');
  assert.equal(may.level, 'flyers');
  assert.equal(bank.map.get('may (month)').display, 'May');
  const r = checkAll();
  assert.deepEqual(r.errors, []);
});

test('NO_MEANING_Q: a/an/the/be/like/cross/shall/would không ra câu hỏi nghĩa, cũng không làm nhiễu, vẫn tự điền được', () => {
  ['a', 'an', 'the', 'be', 'like', 'cross', 'shall', 'would'].forEach((w) => assert.ok(NO_MEANING_Q.has(w) && noMeaningQ(w), w));
  assert.ok(!noMeaningQ('banana'));
  const bank = buildBank(realWords());
  const fw = ['a', 'an', 'the', 'be', 'like', 'cross', 'shall', 'would'];
  const content = ['banana', 'apple', 'dog', 'cat', 'horse', 'chair', 'table', 'book'];
  const vocab = fw.concat(content).map((w) => { const e = bank.map.get(w); assert.ok(e, w + ' phải có trong kho'); return { word: w, meaning: e.vi, category: e.cat, example: e.ex, image: '' }; });
  const meanings = new Set(fw.map((w) => bank.map.get(w).vi));
  for (let seed = 1; seed <= 60; seed++) {
    generateQuestions(vocab, { types: ['meaning', 'word'], count: 30, seed, bank }).questions.forEach((q) => {
      fw.forEach((w) => assert.ok(!new RegExp('"' + w + '"', 'i').test(q.prompt), 'hỏi nghĩa của từ chức năng: ' + q.prompt));
      q.options.forEach((o, i) => { if (i !== q.answer) assert.ok(!fw.includes(String(o).toLowerCase()) && !(q.prompt.startsWith('What does') && meanings.has(o) && !content.some((c) => bank.map.get(c).vi === o)), 'nhiễu là từ chức năng: ' + o); });
    });
  }
  // vẫn nằm trong kho để tự điền
  const f = fillRows([{ word: 'the', meaning: '', category: '', example: '', image: '' }], bank);
  assert.equal(f.missing.length, 0);
  assert.ok(f.rows[0].meaning);
});

test('tự điền với kho mới: apple, banana, borrow, achieve, ambition, zebra; quarrel (ngoài danh sách Cambridge) và từ vô nghĩa báo thiếu', () => {
  const bank = buildBank(realWords());
  const rows = ['apple', 'banana', 'borrow', 'achieve', 'ambition', 'zebra', 'quarrel', 'qwertyuiop'].map((w) => ({ word: w, meaning: '', category: '', example: '', image: '' }));
  const r = fillRows(rows, bank);
  assert.deepEqual(r.missing, ['quarrel', 'qwertyuiop']);
  const lv = (w) => lookup(bank, w).level;
  assert.equal(lv('apple'), 'starters');
  assert.equal(lv('banana'), 'starters');
  assert.equal(lv('borrow'), 'flyers');
  assert.equal(lv('achieve'), 'pet');
  assert.equal(lv('cafeteria'), 'ket');
  assert.equal(lv('ambition'), 'pet');
  assert.equal(lv('zebra'), 'starters');
  r.rows.slice(0, 6).forEach((x) => { assert.ok(x.meaning && x.category && x.example, x.word); });
});

// ---------- Đợt 3: gói thư viện theo cấp (PLAN-LEVELS 5.2, 5.3, 5.6) ----------

import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { lookup as lookupWord } from '../src/core/soanbai/wordbank.js';
import { auditActions } from '../tools/library/audit.mjs';
import { foldText, filterPacks, visibleLevels, countByLevel, levelTag, LIB_LEVELS } from '../src/core/soanbai/libfilter.js';

const libDir = here + 'src/data/library/';
const topicsDir = here + 'tools/library/topics/';
const levelFiles = fs.existsSync(topicsDir) ? fs.readdirSync(topicsDir).filter((f) => f.endsWith('.json') && !f.endsWith('.draft.json')).sort() : [];
const realBank = () => buildBank(JSON.parse(fs.readFileSync(here + 'src/data/wordbank/words.json', 'utf8')));
const TAB_ORDER = ['movers', 'starters', 'flyers', 'ket', 'pet'];

test('gói theo cấp: luật 5.2 (từ có trong kho, 12-20 từ, đúng cấp, không function/abstract, other <=2, tối đa 2 gói/từ trong cấp)', () => {
  assert.ok(levelFiles.length >= 2, 'cần ít nhất movers.json và starters.json');
  const bank = realBank();
  const ids = new Set();
  const useBy = {};
  levelFiles.forEach((f) => {
    const topics = JSON.parse(fs.readFileSync(topicsDir + f, 'utf8'));
    topics.forEach((t) => {
      const lv = t.level;
      assert.ok(TAB_ORDER.includes(lv), 'cấp lạ: ' + t.id);
      assert.ok(f.startsWith(lv), `${t.id} nằm sai tệp ${f}`);
      const use = (useBy[lv] = useBy[lv] || {});
      assert.ok(!ids.has(t.id), 'trùng id ' + t.id);
      ids.add(t.id);
      assert.ok(t.id.startsWith(lv[0] + '-'), t.id + ' tiền tố cấp');
      assert.ok(t.title && t.title.length <= 28 && t.titleVi && t.titleVi.length <= 32, t.id + ' tên');
      assert.ok(Array.isArray(t.qskip), t.id + ' qskip');
      assert.ok(t.words.length >= 12 && t.words.length <= 20, `${t.id}: ${t.words.length} từ`);
      assert.equal(new Set(t.words).size, t.words.length, t.id + ' lặp từ');
      let own = 0, other = 0;
      t.words.forEach((w) => {
        const e = lookupWord(bank, w);
        assert.ok(e, `${t.id}: "${w}" không có trong kho`);
        assert.ok(LEVEL_ORDER[e.level] <= LEVEL_ORDER[lv] || e.level === 'other', `${t.id}: "${w}" cấp ${e.level} cao hơn ${lv}`);
        assert.ok(e.cat !== 'function' && e.cat !== 'abstract', `${t.id}: "${w}" là ${e.cat}`);
        assert.ok(!KID_UNSAFE.has(e.word), `${t.id}: "${w}" nhạy cảm`);
        if (e.level === lv) { own++; use[e.word] = (use[e.word] || 0) + 1; }
        if (e.level === 'other') other++;
      });
      assert.ok(own / t.words.length >= 0.6, `${t.id}: chỉ ${own}/${t.words.length} đúng cấp`);
      assert.ok(other <= 2, t.id + ' quá nhiều từ other');
      assert.deepEqual(auditActions(t.actionCommands), [], t.id + ' actionCommands');
      assert.ok(t.actionCommands.length >= 4 && t.actionCommands.length <= 8, t.id + ' số lệnh');
    });
  });
  Object.keys(useBy).forEach((lv) => Object.keys(useBy[lv]).forEach((w) => assert.ok(useBy[lv][w] <= 2, `${lv}: "${w}" nằm ${useBy[lv][w]} gói`)));
});

test('gói theo cấp: phủ >=90% từ có nội dung của cấp và đủ số gói (tính theo trường level)', () => {
  const bank = realBank();
  const EXPECT = { movers: 24, starters: 24, flyers: 32, ket: 38, pet: 109 };
  const all = levelFiles.flatMap((f) => JSON.parse(fs.readFileSync(topicsDir + f, 'utf8')));
  Object.keys(EXPECT).forEach((lv) => {
    const topics = all.filter((t) => t.level === lv);
    assert.equal(topics.length, EXPECT[lv], `${lv} phải có ${EXPECT[lv]} gói`);
    const cov = new Set();
    topics.forEach((t) => t.words.forEach((w) => cov.add(lookupWord(bank, w).word)));
    const need = bank.list.filter((e) => e.level === lv && e.cat !== 'function' && e.cat !== 'abstract');
    const got = need.filter((e) => cov.has(e.word)).length;
    assert.ok(got / need.length >= 0.9, `${lv}: phủ ${got}/${need.length}`);
  });
});

test('index.json: có cấp, nhãn cấp, kw, số lượng; thứ tự Movers, Starters, Flyers, KET, PET rồi gói chung; mọi gói có tệp', () => {
  const index = JSON.parse(fs.readFileSync(libDir + 'index.json', 'utf8'));
  const rank = (x) => (x.general ? 9 : TAB_ORDER.indexOf(x.level));
  for (let i = 1; i < index.length; i++) assert.ok(rank(index[i - 1]) <= rank(index[i]), `thứ tự sai ở ${index[i].id}`);
  index.forEach((x) => {
    assert.ok(LEVEL_LABEL[x.level] && x.levelLabel === LEVEL_LABEL[x.level], x.id + ' levelLabel');
    assert.ok(x.kw && x.kw.split(' ').length >= 12, x.id + ' kw');
    assert.equal(x.preview.length, 4, x.id + ' preview');
    const pack = JSON.parse(fs.readFileSync(libDir + 'packs/' + x.id + '.json', 'utf8'));
    assert.equal(pack.vocab.length, x.words);
    assert.equal(pack.questions.length, x.questions);
    assert.equal(pack.level, LEVEL_LABEL[x.level]);
  });
  const c = countByLevel(index);
  const allT = levelFiles.flatMap((f) => JSON.parse(fs.readFileSync(topicsDir + f, 'utf8')));
  TAB_ORDER.forEach((lv) => assert.equal(c[lv] || 0, allT.filter((t) => t.level === lv).length, lv));
  assert.equal(index.filter((x) => x.general).length, 31);
  const idxText = JSON.stringify(index);
  assert.ok(idxText.length < 140 * 1024, 'index.json quá lớn (thô ' + idxText.length + ')');
  assert.ok(zlib.gzipSync(idxText).length <= 30 * 1024, 'index.json gzip quá lớn (' + zlib.gzipSync(idxText).length + ')');
});

test('gói theo cấp: không có nhiễu cấp cao hơn cấp gói (LV1) và câu hỏi hợp lệ', () => {
  const bank = realBank();
  const index = JSON.parse(fs.readFileSync(libDir + 'index.json', 'utf8')).filter((x) => !x.general);
  assert.ok(index.length >= 227);
  index.forEach((x) => {
    const pack = JSON.parse(fs.readFileSync(libDir + 'packs/' + x.id + '.json', 'utf8'));
    assert.ok(pack.questions.length >= 12, x.id + ' ít câu');
    pack.questions.forEach((q, i) => {
      assert.equal(new Set(q.options.map((o) => o.toLowerCase())).size, 3, `${x.id} câu ${i + 1} trùng phương án`);
      if (/^What does /.test(q.prompt)) return; // phương án là nghĩa tiếng Việt (có thể trùng chữ Anh như "tin")
      q.options.forEach((o) => {
        const e = bank.map.get(o.toLowerCase());
        if (e && e.level !== 'other') assert.ok(LEVEL_ORDER[e.level] <= LEVEL_ORDER[x.level], `${x.id} câu ${i + 1}: phương án "${o}" cấp ${e.level} > ${x.level}`);
      });
    });
    const counts = [0, 0, 0];
    pack.questions.forEach((q) => { counts[q.answer]++; });
    assert.ok(Math.max(...counts) <= Math.ceil(pack.questions.length * 0.6), x.id + ' lệch vị trí đáp án');
  });
});

test('build.mjs: tất định (build 2 lần ra y hệt) và qskip được áp', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-'));
  const run = (args) => spawnSync(process.execPath, [here + 'tools/library/build.mjs', ...args], { encoding: 'utf8' });
  const a = run(['--out', tmp + '/a']);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(fs.readFileSync(tmp + '/a/index.json', 'utf8'), fs.readFileSync(libDir + 'index.json', 'utf8'));
  const idx = JSON.parse(fs.readFileSync(libDir + 'index.json', 'utf8'));
  ['m-pets-farm', 'animals'].forEach((id) => assert.equal(fs.readFileSync(tmp + `/a/packs/${id}.json`, 'utf8'), fs.readFileSync(libDir + `packs/${id}.json`, 'utf8'), id + ' khác'));
  assert.equal(idx.length, fs.readdirSync(tmp + '/a/packs').length);
  // qskip: cùng gói, bỏ câu số 0 -> ít hơn đúng 1 câu
  const base = JSON.parse(fs.readFileSync(topicsDir + 'movers.json', 'utf8')).find((t) => t.id === 'm-pets-farm');
  const mk = (qskip) => { const f = tmp + `/t-${qskip.length}.json`; fs.writeFileSync(f, JSON.stringify([Object.assign({}, base, { qskip })])); return f; };
  const r0 = run(['--topics', mk([]), '--out', tmp + '/b']);
  const r1 = run(['--topics', mk([0]), '--out', tmp + '/c']);
  assert.equal(r0.status, 0, r0.stderr);
  assert.equal(r1.status, 0, r1.stderr);
  const q0 = JSON.parse(fs.readFileSync(tmp + '/b/packs/m-pets-farm.json', 'utf8')).questions;
  const q1 = JSON.parse(fs.readFileSync(tmp + '/c/packs/m-pets-farm.json', 'utf8')).questions;
  assert.equal(q1.length, q0.length - 1);
  assert.deepEqual(q1, q0.slice(1));
  // luật 5.2 bị chặn: từ cấp cao hơn cấp gói
  const bad = Object.assign({}, base, { words: base.words.slice(0, 14).concat(['ambition']), qskip: [] });
  fs.writeFileSync(tmp + '/bad.json', JSON.stringify([bad]));
  const rb = run(['--topics', tmp + '/bad.json', '--out', tmp + '/d']);
  assert.equal(rb.status, 1);
  assert.ok(/cao hơn cấp gói/.test(rb.stderr), rb.stderr);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('library.js: bỏ dấu, lọc theo tab/chip/ô tìm, tab chỉ hiện khi có gói', () => {
  assert.equal(foldText('Đồ ăn và Đồ uống'), 'do an va do uong');
  const index = JSON.parse(fs.readFileSync(libDir + 'index.json', 'utf8'));
  const tabs = visibleLevels(index).map((l) => l.value);
  assert.equal(tabs[0], 'all');
  assert.deepEqual(tabs.slice(1), TAB_ORDER.filter((l) => index.some((x) => !x.general && x.level === l)));
  assert.deepEqual(visibleLevels([{ id: 'x', level: 'flyers', general: true }]).map((l) => l.value), ['all']);
  assert.ok(LIB_LEVELS.map((l) => l.value).join() === 'all,movers,starters,flyers,ket,pet');
  const movers = filterPacks(index, { level: 'movers' });
  assert.ok(movers.length >= 24 && movers.every((x) => x.level === 'movers' && !x.general));
  assert.equal(filterPacks(index, { level: 'all' }).length, index.length);
  ['food', 'đồ ăn', 'do an'].forEach((q) => assert.ok(filterPacks(index, { level: 'movers', q }).some((x) => x.id === 'm-food-drink'), q));
  assert.ok(filterPacks(index, { level: 'starters', q: 'kitten' }).length === 0);
  assert.ok(filterPacks(index, { level: 'movers', q: 'kitten' }).some((x) => x.id === 'm-pets-farm'), 'tìm theo từ trong gói (kw)');
  assert.ok(filterPacks(index, { level: 'movers', theme: 'animal' }).every((x) => /animal|pet|farm|dong vat|thu/.test(foldText(x.title + ' ' + x.titleVi))));
  assert.equal(levelTag(index.find((x) => x.id === 'm-food-drink')), 'A1 Movers');
  assert.ok(levelTag(index.find((x) => x.general)).startsWith('gợi ý '));
});
