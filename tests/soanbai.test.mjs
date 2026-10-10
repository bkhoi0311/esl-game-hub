// Test thuần cho tab Soạn bài (PLAN-SOANBAI mục F1). Chạy: node --test tests/soanbai.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normKey, candidates, splitWordList, splitWordListEx, wordForms, findWordInText } from '../src/core/soanbai/normalize.js';
import { CATEGORIES, phraseFor, groupOf, isKnownCategory } from '../src/core/soanbai/categories.js';
import { buildBank, lookup, lookupEx, fillRows } from '../src/core/soanbai/wordbank.js';

const readJson = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const mini = readJson('./fixtures/soanbai/words-mini.json');
const bank = buildBank(mini);

// ---------- categories ----------

test('categories: bảng A3 đủ 37 nhãn, phrase/group hợp lệ', () => {
  assert.equal(Object.keys(CATEGORIES).length, 37);
  for (const [k, c] of Object.entries(CATEGORIES)) {
    assert.ok(c.phrase && c.group && c.vi, k);
    assert.equal(k, k.toLowerCase());
  }
  assert.equal(phraseFor('fruit'), 'a fruit');
  assert.equal(groupOf('fruit'), 'food');
  assert.equal(groupOf('animal'), groupOf('bird'));
  assert.equal(phraseFor('Insect '), 'an insect');
  assert.equal(phraseFor('gadget'), 'a gadget');
  assert.equal(phraseFor('item'), 'an item');
  assert.equal(groupOf('zzz'), 'custom:zzz');
  assert.ok(isKnownCategory('Sea-Animal'));
  assert.ok(!isKnownCategory('zzz'));
});

// ---------- normalize ----------

test('normalize: normKey', () => {
  assert.equal(normKey(' Apples. '), 'apples');
  assert.equal(normKey('the ice cream'), 'ice cream');
  assert.equal(normKey('An  Apple'), 'apple');
  assert.equal(normKey('to run'), 'run');
  assert.equal(normKey('"Hello!"'), 'hello');
  assert.equal(normKey('don\u2019t'), "don't");
  assert.equal(normKey('a'), 'a');
  assert.equal(normKey(null), '');
});

test('normalize: candidates (bất quy tắc, -ies, -ves, -es, -s, ss)', () => {
  assert.ok(candidates('children').includes('child'));
  assert.ok(candidates('boxes').includes('box'));
  assert.ok(candidates('leaves').includes('leaf'));
  assert.ok(candidates('knives').includes('knife'));
  assert.ok(candidates('strawberries').includes('strawberry'));
  assert.ok(candidates('apples').includes('apple'));
  assert.ok(candidates('potatoes').includes('potato'));
  assert.equal(candidates('glass').includes('glas'), false);
  assert.deepEqual(candidates('glass'), ['glass']);
  assert.equal(candidates('apples')[0], 'apples');
  assert.ok(candidates('colour', new Map([['colour', 'color']])).includes('color'));
  assert.deepEqual(candidates(''), []);
});

test('normalize: splitWordList', () => {
  assert.deepEqual(splitWordList('1. apple\n2) banana, cat;dog\n\napple'), ['apple', 'banana', 'cat', 'dog']);
  assert.deepEqual(splitWordList('- ice cream\n\u2022 the Ice Cream\nzebra\t lion'), ['ice cream', 'zebra', 'lion']);
  const big = Array.from({ length: 250 }, (_, i) => 'w' + i).join('\n');
  const r = splitWordListEx(big);
  assert.equal(r.words.length, 200);
  assert.equal(r.truncated, true);
  assert.equal(r.total, 250);
  assert.equal(splitWordListEx('a\nb').truncated, false);
});

test('normalize: wordForms / findWordInText', () => {
  assert.ok(wordForms('box').includes('boxes'));
  assert.ok(wordForms('strawberry').includes('strawberries'));
  assert.ok(wordForms('make').includes('making'));
  assert.ok(wordForms('run').includes('running'));
  assert.ok(wordForms('knife').includes('knives'));
  assert.ok(wordForms('mouse', { pl: 'mice' }).includes('mice'));
  assert.ok(wordForms('get up').includes('gets up'));
  assert.equal(findWordInText('I like Apples and an apple.', 'apple').length, 2);
  assert.equal(findWordInText('The cat is a catalogue.', 'cat').length, 1);
  assert.equal(findWordInText('Mice like cheese.', 'mouse', { pl: 'mice' })[0].token, 'Mice');
  assert.equal(findWordInText('I love ice cream.', 'ice cream').length, 1);
  assert.equal(findWordInText('Nothing here.', 'apple').length, 0);
});

// ---------- wordbank ----------

test('wordbank: buildBank từ fixture', () => {
  assert.equal(bank.size, 40);
  const cats = new Set(bank.list.map((e) => e.cat));
  assert.ok(cats.size >= 6);
  assert.equal(lookup(bank, 'banana').vi, 'quả chuối');
  assert.equal(lookup(bank, 'banana').level, 'starters');
  assert.equal(lookup(bank, 'banana').lv, 's');
});

test('wordbank: lookup qua chuẩn hoá, số nhiều, pl, alt', () => {
  assert.equal(lookup(bank, ' Apples. ').word, 'apple');
  assert.equal(lookup(bank, 'children').word, 'child');
  assert.equal(lookup(bank, 'wolves').word, 'wolf');
  assert.equal(lookup(bank, 'knives').word, 'knife');
  assert.equal(lookup(bank, 'strawberries').word, 'strawberry');
  assert.equal(lookup(bank, 'boxes').word, 'box');
  assert.equal(lookup(bank, 'the ice cream').word, 'ice cream');
  assert.equal(lookup(bank, 'feet').word, 'foot');
  assert.equal(lookup(bank, 'pajamas').word, 'pyjamas');
  assert.equal(lookup(bank, 'mum').word, 'mother');
  assert.equal(lookup(bank, 'glass').word, 'glass');
  assert.equal(lookup(bank, 'dress').word, 'dress');
  assert.equal(lookup(bank, 'zebra'), null);
  assert.equal(lookup(bank, ''), null);
  assert.equal(lookupEx(bank, 'apple').via, 'exact');
  assert.equal(lookupEx(bank, 'apples').via, 'form');
  assert.equal(lookupEx(bank, 'pajamas').via, 'alt');
});

test('wordbank: fillRows chỉ điền ô trống, không ghi đè', () => {
  const rows = [
    { word: 'apple', meaning: '', category: '', example: '', image: '' },
    { word: 'banana', meaning: 'chuối của tôi', category: '', example: 'Mine.', image: '' },
    { word: 'zebra', meaning: '', category: '', example: '', image: '' },
    { word: '', meaning: '', category: '', example: '', image: '' },
  ];
  const copy = JSON.parse(JSON.stringify(rows));
  const r = fillRows(rows, bank);
  assert.deepEqual(rows, copy, 'không đổi mảng gốc');
  assert.equal(r.rows[0].meaning, 'quả táo');
  assert.equal(r.rows[0].category, 'fruit');
  assert.equal(r.rows[0].example, 'She has an apple in her bag.');
  assert.equal(r.rows[1].meaning, 'chuối của tôi');
  assert.equal(r.rows[1].example, 'Mine.');
  assert.equal(r.rows[1].category, 'fruit');
  assert.equal(r.rows[2].meaning, '');
  assert.equal(r.filled, 2);
  assert.deepEqual(r.missing, ['zebra']);
  assert.deepEqual(r.missingIdx, [2]);
  assert.deepEqual(r.viaPlural, []);
});

test('wordbank: fillRows viaPlural và onlyEmpty=false', () => {
  const rows = [
    { word: 'Apples', meaning: '', category: '', example: '', image: '' },
    { word: 'children', meaning: 'x', category: 'y', example: 'z', image: '' },
    { word: 'cat', meaning: 'x', category: 'y', example: 'z', image: '' },
  ];
  const a = fillRows(rows, bank);
  assert.deepEqual(a.viaPlural, ['Apples']);
  assert.equal(a.rows[0].meaning, 'quả táo');
  assert.equal(a.rows[1].meaning, 'x');
  assert.equal(a.filled, 1);
  assert.deepEqual(a.missing, []);
  const b = fillRows(rows, bank, { onlyEmpty: false });
  assert.equal(b.rows[1].meaning, 'đứa trẻ');
  assert.equal(b.rows[2].meaning, 'con mèo');
  assert.equal(b.filled, 3);
  assert.deepEqual(b.viaPlural, ['Apples', 'children']);
});

// ---------- dữ liệu kho (chạy khi file tồn tại) ----------

const wordsPath = new URL('../src/data/wordbank/words.json', import.meta.url);
test('dữ liệu: words.json hợp lệ cột, mỗi ex chứa từ', { skip: !fs.existsSync(wordsPath) }, () => {
  const j = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));
  assert.deepEqual(j.cols, ['w', 'vi', 'pos', 'cat', 'lv', 'ex', 'alt', 'pl']);
  const seen = new Set();
  for (const r of j.rows) {
    assert.equal(r.length, j.cols.length, r[0]);
    assert.ok(!seen.has(r[0]), 'trùng ' + r[0]);
    seen.add(r[0]);
    assert.ok('smfko'.includes(r[4]) && r[4].length === 1, r[0] + ' lv');
    assert.equal(findWordInText(r[5], r[0], { pl: r[7], alt: r[6] }).length, 1, `${r[0]}: "${r[5]}"`);
  }
});

// ---------- C4: table / decode ----------

import { parseTsv, parseDelimited, rowsToVocab, rowsToQuestions, detectTable } from '../src/core/soanbai/table.js';
import { decodeText } from '../src/core/soanbai/decode.js';

test('table: parseTsv cũ vẫn đúng (ngoặc kép, xuống dòng trong ô)', () => {
  assert.deepEqual(parseTsv('a\tb\n"x\ty"\t"he said ""hi"""\n'), [['a', 'b'], ['x\ty', 'he said "hi"']]);
  assert.deepEqual(parseTsv('a\tb\r\n\r\nc\td'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(parseTsv('"line1\nline2"\tz'), [['line1\nline2', 'z']]);
});

test('table: parseDelimited đoán dấu ngăn, BOM, ngoặc kép', () => {
  assert.deepEqual(parseDelimited('word,meaning\ncat,con mèo\n'), [['word', 'meaning'], ['cat', 'con mèo']]);
  assert.deepEqual(parseDelimited('﻿word;meaning\ncat;con mèo'), [['word', 'meaning'], ['cat', 'con mèo']]);
  assert.deepEqual(parseDelimited('word\tmeaning\ncat\tcon mèo'), [['word', 'meaning'], ['cat', 'con mèo']]);
  assert.deepEqual(parseDelimited('w,m\n"a, b","x\ny"\n'), [['w', 'm'], ['a, b', 'x\ny']]);
  assert.deepEqual(parseDelimited('apple\nbanana\ncat'), [['apple'], ['banana'], ['cat']]);
  // tab thắng khi hoà
  assert.deepEqual(parseDelimited('a\tb,c\nd\te,f'), [['a', 'b,c'], ['d', 'e,f']]);
  assert.deepEqual(parseDelimited('a,b\r\nc,d\re,f'), [['a', 'b'], ['c', 'd'], ['e', 'f']]);
});

test('table: decodeText UTF-8, BOM, windows-1258, UTF-16', () => {
  const enc = (s) => new TextEncoder().encode(s);
  assert.deepEqual(decodeText(enc('quả chuối')), { text: 'quả chuối', legacyEncoding: false });
  const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc('xin chào')]);
  assert.deepEqual(decodeText(withBom), { text: 'xin chào', legacyEncoding: false });
  // "cá" trong windows-1258: 63 E1
  const legacy = decodeText(new Uint8Array([0x63, 0xe1]));
  assert.equal(legacy.legacyEncoding, true);
  assert.equal(legacy.text, 'cá');
  const u16 = new Uint8Array([0xff, 0xfe, 0x61, 0x00, 0x62, 0x00]);
  assert.equal(decodeText(u16).text, 'ab');
});

test('table: nhận diện tiêu đề tiếng Việt có/không dấu', () => {
  const a = detectTable([['Từ', 'Nghĩa', 'Nhóm', 'Ví dụ'], ['cat', 'con mèo', 'animal', 'The cat runs.']]);
  assert.equal(a.kind, 'vocab');
  assert.equal(a.header, true);
  assert.deepEqual(a.items[0], { word: 'cat', meaning: 'con mèo', category: 'animal', example: 'The cat runs.', image: '' });
  const b = detectTable([['tu vung', 'nghia', 'chu de'], ['dog', 'con chó', 'Animal']]);
  assert.equal(b.kind, 'vocab');
  assert.equal(b.items[0].category, 'animal');
  const c = detectTable([['Câu hỏi', 'Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án đúng', 'Loại'], ['She ___ rice.', 'eats', 'eat', 'eating', 'B', 'vocab']]);
  assert.equal(c.kind, 'questions');
  assert.deepEqual(c.items[0], { prompt: 'She ___ rice.', options: ['eats', 'eat', 'eating'], answer: 1, type: 'vocab' });
  const d = detectTable([['prompt', 'option A', 'option B', 'option C', 'answer (A/B/C)', 'type'], ['Q?', 'x', 'y', 'z', 'c', 'grammar']]);
  assert.equal(d.kind, 'questions');
  assert.equal(d.items[0].answer, 2);
  const e = detectTable([['question', 'a', 'b', 'c', 'answer'], ['Q?', 'x', 'y', 'z', 'y']]);
  assert.equal(e.items[0].answer, 1);
});

test('table: không tiêu đề -> theo thứ tự; wordlist; lỗi dòng', () => {
  const q = detectTable([['She ___ rice.', 'eats', 'eat', 'eating', 'A', 'grammar'], ['Q2 ___', 'a', 'b', 'c', '3']]);
  assert.equal(q.kind, 'questions');
  assert.equal(q.items.length, 2);
  assert.equal(q.items[1].answer, 2);
  const v = detectTable([['banana', 'quả chuối', 'fruit', 'I eat a banana.'], ['carrot', 'cà rốt']]);
  assert.equal(v.kind, 'vocab');
  assert.equal(v.items.length, 2);
  const w = detectTable([['apple'], ['banana'], ['ice cream']]);
  assert.equal(w.kind, 'wordlist');
  assert.deepEqual(w.items, ['apple', 'banana', 'ice cream']);
  const w2 = detectTable([['apple', 'banana', 'orange']]);
  assert.equal(w2.kind, 'wordlist');
  assert.deepEqual(w2.items, ['apple', 'banana', 'orange']);
  const err = detectTable([['word', 'meaning'], ['cat', 'con mèo'], ['', 'chó'], ['bird', '']]);
  assert.equal(err.items.length, 2);
  assert.deepEqual(err.errors, ['Dòng 3: thiếu từ']);
  const qerr = detectTable([['prompt', 'A', 'B', 'C', 'answer'], ['Q?', 'x', 'y', '', 'A'], ['', 'x', 'y', 'z', 'A'], ['Q3?', 'x', 'y', 'z', 'W']]);
  assert.equal(qerr.items.length, 0);
  assert.equal(qerr.errors.length, 3);
  assert.equal(detectTable([]).kind, 'none');
  assert.equal(detectTable([[''], ['']]).kind, 'none');
});

test('table: rowsToVocab / rowsToQuestions tương thích cũ', () => {
  assert.equal(rowsToVocab([['word', 'meaning', 'category', 'example'], ['cat', 'mèo', 'Animal', 'x']])[0].category, 'animal');
  assert.equal(rowsToVocab([['cat', 'mèo']]).length, 1);
  assert.equal(rowsToVocab([]).length, 0);
  const qs = rowsToQuestions([['prompt', 'a', 'b', 'c', 'd', 'e'], ['Q', 'one', 'two', 'three', '2', '']]);
  assert.equal(qs.length, 1);
  assert.equal(qs[0].answer, 1);
  assert.equal(qs[0].type, 'grammar');
  assert.equal(rowsToQuestions([['Q', 'a', 'b', 'c', 'two']])[0].answer, 0);
  assert.equal(rowsToQuestions([['Q', 'one', 'two', 'three', 'TWO']])[0].answer, 1);
});

// ---------- C5: qgen ----------

import { QTYPES, capacity, generateQuestions, makeRng } from '../src/core/soanbai/qgen.js';

const sampleFood = readJson('../src/data/sample-food-a2.json');
const miniVocab = bank.list.map((e) => ({ word: e.word, meaning: e.vi, category: e.cat, example: e.ex, image: '' }));
const OPTS = 3; // = LIMITS.optionsPerQuestion trong content.js (Playwright kiểm validatePack thật)

function checkQuestion(q, label) {
  assert.equal(q.options.length, OPTS, label);
  const norm = q.options.map((o) => String(o).trim().toLowerCase());
  assert.ok(norm.every(Boolean), label + ' phương án rỗng');
  assert.equal(new Set(norm).size, OPTS, label + ' trùng phương án: ' + JSON.stringify(q.options));
  assert.ok(q.answer >= 0 && q.answer < OPTS, label);
  assert.ok(q.prompt.trim(), label);
  assert.equal(q.type, 'vocab');
}

test('qgen: 200 seed, mọi câu hợp lệ (vocab mini + bài mẫu)', () => {
  for (let seed = 1; seed <= 200; seed++) {
    for (const vocab of [miniVocab, sampleFood.vocab]) {
      const r = generateQuestions(vocab, { count: 15, seed, bank });
      assert.ok(r.questions.length >= 8, `seed ${seed}: chỉ ${r.questions.length} câu`);
      const prompts = new Set();
      r.questions.forEach((q, i) => {
        checkQuestion(q, `seed ${seed} câu ${i}`);
        const key = q.prompt + '|' + q.options[q.answer];
        assert.ok(!prompts.has(key), 'trùng câu ' + key);
        prompts.add(key);
      });
      assert.equal(r.kinds.length, r.questions.length);
    }
  }
});

test('qgen: fill có ___ đúng 1 lần, không lộ đáp án, a/an, dạng số nhiều', () => {
  let fills = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = generateQuestions(miniVocab, { types: ['fill'], count: 15, seed, bank });
    r.questions.forEach((q) => {
      fills++;
      assert.equal(q.prompt.split('___').length - 1, 1, q.prompt);
      const ans = q.options[q.answer];
      assert.ok(!q.prompt.toLowerCase().includes(ans.toLowerCase()), 'lộ đáp án: ' + q.prompt);
      const m = /\b(a|an)\s+___/i.exec(q.prompt);
      if (m) {
        const wantVowel = m[1].toLowerCase() === 'an';
        q.options.forEach((o) => assert.equal(/^[aeiou]/i.test(o), wantVowel, `${q.prompt} -> ${o}`));
      }
    });
  }
  assert.ok(fills > 500);
  // "The strawberries are red and sweet." -> nhiễu cũng ở dạng số nhiều (-s)
  const sv = [
    { word: 'strawberry', meaning: 'dâu', category: 'fruit', example: 'The strawberries in my garden are red.' },
    { word: 'apple', meaning: 'táo', category: 'fruit', example: 'She has an apple in her bag.' },
    { word: 'cat', meaning: 'mèo', category: 'animal', example: 'The cat sleeps on the sofa.' },
    { word: 'dog', meaning: 'chó', category: 'animal', example: 'My dog runs in the park.' },
    { word: 'hat', meaning: 'mũ', category: 'clothes', example: 'I wear a hat on sunny days.' },
  ];
  let seen = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const r = generateQuestions(sv, { types: ['fill'], count: 5, seed, bank });
    r.questions.filter((q) => q.prompt.startsWith('The ___ in my garden')).forEach((q) => {
      seen++;
      q.options.forEach((o) => assert.ok(/(s|es)$/.test(o) && o !== 'strawbery', `số nhiều: ${o}`));
    });
  }
  assert.ok(seen > 0);
});

test('qgen: which không có nhiễu cùng siêu nhóm', () => {
  const group = (w) => groupOf((miniVocab.find((v) => v.word === w) || {}).category);
  let n = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = generateQuestions(miniVocab, { types: ['which'], count: 10, seed, bank });
    r.questions.forEach((q) => {
      n++;
      const g = group(q.options[q.answer]);
      q.options.forEach((o, i) => { if (i !== q.answer) assert.notEqual(group(o), g, q.prompt + ' ' + o); });
    });
  }
  assert.ok(n > 300);
  // một siêu nhóm duy nhất (bài mẫu food) -> không có câu which
  assert.equal(generateQuestions(sampleFood.vocab, { types: ['which'], count: 5, seed: 1 }).questions.length, 0);
});

test('qgen: letter / spell không tạo từ thật', () => {
  const real = new Set(bank.map.keys());
  sampleFood.vocab.forEach((v) => real.add(v.word.toLowerCase()));
  const all = miniVocab.concat(sampleFood.vocab);
  for (let seed = 1; seed <= 100; seed++) {
    generateQuestions(all, { types: ['letter'], count: 10, seed }).questions.forEach((q) => {
      const m = /: (\S+?)( \(|$)/.exec(q.prompt);
      assert.ok(m && m[1].includes('_'), q.prompt);
      q.options.forEach((o, i) => {
        assert.match(o, /^[a-z]$/);
        const word = m[1].replace('_', o);
        if (i === q.answer) assert.ok(real.has(word), 'đáp án đúng phải là từ thật: ' + word);
        else assert.ok(!real.has(word), 'nhiễu là từ thật: ' + word);
      });
    });
    generateQuestions(all, { types: ['spell'], count: 10, seed }).questions.forEach((q) => {
      q.options.forEach((o, i) => {
        if (i === q.answer) assert.ok(real.has(o.toLowerCase()), o);
        else assert.ok(!real.has(o.toLowerCase()), 'nhiễu là từ thật: ' + o);
      });
    });
  }
});

test('qgen: không trùng với existing, tất định theo seed, vị trí đáp án cân bằng', () => {
  const first = generateQuestions(miniVocab, { count: 15, seed: 7, bank });
  const second = generateQuestions(miniVocab, { count: 15, seed: 7, bank, existing: first.questions });
  const keys = new Set(first.questions.map((q) => q.prompt + '|' + q.options[q.answer]));
  second.questions.forEach((q) => assert.ok(!keys.has(q.prompt + '|' + q.options[q.answer]), 'trùng ' + q.prompt));
  assert.ok(second.skippedDup > 0);
  assert.deepEqual(generateQuestions(miniVocab, { count: 15, seed: 7, bank }), first);
  assert.notDeepEqual(generateQuestions(miniVocab, { count: 15, seed: 8, bank }).questions, first.questions);
  const pos = [0, 0, 0];
  for (let seed = 1; seed <= 200; seed++) generateQuestions(miniVocab, { count: 15, seed, bank }).questions.forEach((q) => pos[q.answer]++);
  const total = pos[0] + pos[1] + pos[2];
  pos.forEach((p, i) => assert.ok(p / total >= 0.25 && p / total <= 0.42, `vị trí ${i}: ${(p / total).toFixed(2)}`));
});

test('qgen: không để 2 câu cùng loại liền nhau khi tránh được; byType khớp', () => {
  const r = generateQuestions(miniVocab, { count: 20, seed: 3, bank });
  let adj = 0;
  for (let i = 1; i < r.kinds.length; i++) if (r.kinds[i] === r.kinds[i - 1]) adj++;
  assert.ok(adj <= 1, 'cạnh nhau ' + adj);
  const sum = Object.values(r.byType).reduce((a, b) => a + b, 0);
  assert.equal(sum, r.questions.length);
});

test('qgen: dưới 3 từ -> 0 câu, capacity có lý do; capacity theo dữ liệu', () => {
  const tiny = [{ word: 'cat', meaning: 'mèo', category: 'animal', example: '' }, { word: 'dog', meaning: 'chó', category: 'animal', example: '' }];
  const r = generateQuestions(tiny, { count: 10, seed: 1, bank });
  assert.equal(r.questions.length, 0);
  const c = capacity(tiny, { bank });
  QTYPES.forEach((t) => { assert.equal(c[t], 0); assert.ok(c.reasons[t]); });
  const c2 = capacity(sampleFood.vocab, { bank }); // fill cần kho để lấy nhiễu khác nhóm láng giềng
  assert.ok(c2.meaning >= 20 && c2.word >= 20 && c2.fill >= 10);
  assert.equal(c2.which, 0);
  assert.ok(c2.reasons.which);
  const noEx = capacity(sampleFood.vocab.map((v) => ({ ...v, example: '' })));
  assert.equal(noEx.fill, 0);
  assert.ok(noEx.reasons.fill);
  assert.ok(capacity(miniVocab, { bank }).which > 10);
  assert.equal(makeRng(5)(), makeRng(5)());
});

test('qgen: count lớn hơn khả năng thì tự giảm', () => {
  const small = sampleFood.vocab.slice(0, 4);
  const r = generateQuestions(small, { count: 30, seed: 2, types: ['meaning', 'word'] });
  assert.ok(r.questions.length > 0 && r.questions.length <= 8);
});

// ---------- C7: xlsx, templates ----------

import { readXlsx, writeXlsx, crc32, zipEntries } from '../src/core/soanbai/xlsx.js';
import { templateCsv, templateXlsx, TEMPLATE_VOCAB, TEMPLATE_QUESTIONS, rowsToCsv } from '../src/core/soanbai/templates.js';
import { toCsvUrl, fetchSheetCsv, GsheetError } from '../src/core/soanbai/gsheet.js';

test('xlsx: crc32 đúng giá trị chuẩn', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('xlsx: ghi rồi đọc lại vòng tròn (ô trống giữa, chữ Việt, & < >)', async () => {
  const sheets = [
    { name: 'Từ vựng', rows: [['word', 'meaning', '', 'example'], ['cat', 'con mèo', '', 'Tom & Jerry <3 "cats"'], [], ['', 'chỉ cột B']] },
    { name: 'Q&A', rows: [['a'], ['  spaced  ', "it's"]] },
  ];
  const bytes = writeXlsx(sheets);
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(zipEntries(bytes).size, 7);
  const back = await readXlsx(bytes);
  assert.equal(back.length, 2);
  assert.equal(back[0].name, 'Từ vựng');
  assert.deepEqual(back[0].rows[0], ['word', 'meaning', '', 'example']);
  assert.deepEqual(back[0].rows[1], ['cat', 'con mèo', '', 'Tom & Jerry <3 "cats"']);
  assert.deepEqual(back[0].rows[2], []);
  assert.deepEqual(back[0].rows[3], ['', 'chỉ cột B']);
  assert.equal(back[1].name, 'Q&A');
  assert.deepEqual(back[1].rows[1], ['spaced', "it's"]);
});

test('xlsx: đọc file có deflate + sharedStrings (tạo bằng zlib), tham chiếu ô lệch cột', async () => {
  const zlib = await import('node:zlib');
  const enc = new TextEncoder();
  const files = {
    'xl/workbook.xml': '<workbook xmlns:r="x"><sheets><sheet name="Sheet &amp; One" sheetId="1" r:id="rId9"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Target="worksheets/data.xml" Id="rId9" Type="t"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>word</t></si><si><r><t>quả </t></r><r><t>táo</t></r></si><si><t>apple</t><rPh><t>XX</t></rPh></si></sst>',
    'xl/worksheets/data.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
      '<row r="3"><c r="B3" t="inlineStr"><is><t>x</t></is></c><c r="D3"><v>42</v></c><c r="E3" t="str"><v>f</v></c><c r="A3" s="1"/></row>' +
      '<row r="4"><c r="A4" t="s"><v>2</v></c></row></sheetData></worksheet>',
  };
  const chunks = [];
  const central = [];
  let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(enc.encode(text));
    const comp = zlib.deflateRawSync(raw);
    const nm = Buffer.from(name);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc32(raw), 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
    chunks.push(lh, nm, comp);
    central.push({ nm, comp, raw, off });
    off += 30 + nm.length + comp.length;
  }
  const cdStart = off;
  for (const c of central) {
    const h = Buffer.alloc(46);
    h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(8, 10); h.writeUInt32LE(c.comp.length, 20); h.writeUInt32LE(c.raw.length, 24);
    h.writeUInt16LE(c.nm.length, 28); h.writeUInt32LE(c.off, 42);
    chunks.push(h, c.nm);
    off += 46 + c.nm.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(off - cdStart, 12); end.writeUInt32LE(cdStart, 16);
  chunks.push(end);
  const sheets = await readXlsx(new Uint8Array(Buffer.concat(chunks)));
  assert.equal(sheets[0].name, 'Sheet & One');
  assert.deepEqual(sheets[0].rows[0], ['word', '', 'quả táo']);
  assert.deepEqual(sheets[0].rows[2], ['', 'x', '', '42', 'f']);
  assert.deepEqual(sheets[0].rows[3], ['apple']);
});

test('xlsx: file hỏng / không phải zip -> lỗi tiếng Việt', async () => {
  await assert.rejects(() => readXlsx(new Uint8Array([1, 2, 3, 4, 5])), /Không mở được file Excel/);
  const good = writeXlsx([{ name: 'a', rows: [['x']] }]);
  const cut = good.slice(0, 60);
  await assert.rejects(() => readXlsx(cut), /Không mở được file Excel/);
});

test('templates: xlsx mẫu 3 trang đọc lại khớp; detectTable nhận ra', async () => {
  const bytes = await templateXlsx();
  const sheets = await readXlsx(bytes);
  assert.deepEqual(sheets.map((s) => s.name), ['Từ vựng', 'Câu hỏi', 'Hướng dẫn']);
  assert.deepEqual(sheets[0].rows, TEMPLATE_VOCAB);
  assert.deepEqual(sheets[1].rows, TEMPLATE_QUESTIONS);
  const v = detectTable(sheets[0].rows);
  assert.equal(v.kind, 'vocab');
  assert.equal(v.items.length, 3);
  const q = detectTable(sheets[1].rows);
  assert.equal(q.kind, 'questions');
  assert.equal(q.items.length, 3);
  assert.equal(q.errors.length, 0);
  assert.notEqual(detectTable(sheets[2].rows).kind, 'vocab');
});

test('templates: csv có BOM, đọc lại bằng parseDelimited + detectTable', () => {
  const v = templateCsv('vocab');
  assert.equal(v.charCodeAt(0), 0xfeff);
  const back = detectTable(parseDelimited(decodeText(new TextEncoder().encode(v)).text));
  assert.equal(back.kind, 'vocab');
  assert.equal(back.items[0].meaning, 'quả chuối');
  const q = detectTable(parseDelimited(templateCsv('questions')));
  assert.equal(q.kind, 'questions');
  assert.equal(q.items[2].answer, 1);
  assert.equal(rowsToCsv([['a,b', 'c"d', 'e\nf']]), '"a,b","c""d","e\nf"\r\n');
});

// ---------- C8: gsheet ----------

test('gsheet: toCsvUrl 4 dạng link + link sai', () => {
  assert.equal(toCsvUrl('https://docs.google.com/spreadsheets/d/e/2PACX-abc/pubhtml'), 'https://docs.google.com/spreadsheets/d/e/2PACX-abc/pub?output=csv');
  assert.equal(toCsvUrl('https://docs.google.com/spreadsheets/d/e/2PACX-abc/pubhtml?gid=123&single=true'), 'https://docs.google.com/spreadsheets/d/e/2PACX-abc/pub?output=csv&gid=123');
  const keep = 'https://docs.google.com/spreadsheets/d/e/2PACX-abc/pub?gid=5&single=true&output=csv';
  assert.equal(toCsvUrl(keep), keep);
  assert.equal(toCsvUrl('https://docs.google.com/spreadsheets/d/1AbC_dEf/edit#gid=77'), 'https://docs.google.com/spreadsheets/d/1AbC_dEf/gviz/tq?tqx=out:csv&gid=77');
  assert.equal(toCsvUrl('https://docs.google.com/spreadsheets/d/1AbC_dEf/edit?usp=sharing'), 'https://docs.google.com/spreadsheets/d/1AbC_dEf/gviz/tq?tqx=out:csv');
  for (const bad of ['', 'abc', 'https://example.com/spreadsheets/d/x/edit', 'https://docs.google.com/document/d/x/edit']) {
    assert.throws(() => toCsvUrl(bad), (e) => e instanceof GsheetError && /không phải link Google Sheet/.test(e.message), bad);
  }
});

test('gsheet: fetchSheetCsv xử lý HTML đăng nhập, 404, mạng, hết giờ', async () => {
  const link = 'https://docs.google.com/spreadsheets/d/e/PUB/pubhtml';
  const ok = await fetchSheetCsv(link, { fetchImpl: async () => new Response('word,meaning\ncat,mèo\n') });
  assert.equal(ok, 'word,meaning\ncat,mèo\n');
  await assert.rejects(() => fetchSheetCsv(link, { fetchImpl: async () => new Response('<!DOCTYPE html><html>', { status: 200 }) }), /chưa công khai/);
  await assert.rejects(() => fetchSheetCsv(link, { fetchImpl: async () => new Response('x', { status: 403 }) }), /chưa công khai/);
  await assert.rejects(() => fetchSheetCsv(link, { fetchImpl: async () => new Response('x', { status: 404 }) }), /không đúng hoặc trang tính đã bị xoá/);
  await assert.rejects(() => fetchSheetCsv(link, { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), /Không kết nối được Google/);
  await assert.rejects(() => fetchSheetCsv(link, {
    timeoutMs: 20,
    fetchImpl: (u, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' })))),
  }), /quá lâu/);
});

// ---------- C12: dữ liệu thật (kho + thư viện) ----------

import { loadContent } from '../tools/library/content-node.mjs';
import { buildBank as buildRealBank, lookup as lookupReal } from '../src/core/soanbai/wordbank.js';

const REAL_WORDS = new URL('../src/data/wordbank/words.json', import.meta.url);
const LIB_DIR = new URL('../src/data/library/', import.meta.url);

test('kho thật: 1100+ từ, không còn cờ giả', () => {
  const raw = fs.readFileSync(REAL_WORDS, 'utf8');
  assert.ok(!raw.includes('_fake'), 'còn cờ _fake');
  const realBank = buildRealBank(JSON.parse(raw));
  assert.ok(realBank.size >= 1100, 'chỉ ' + realBank.size + ' từ');
  realBank.list.forEach((e) => {
    assert.ok(e.word && e.vi && e.cat, 'thiếu cột: ' + e.word);
    assert.ok(e.ex && findWordInText(e.ex, e.word, { pl: e.pl, alt: e.alt }).length >= 1, 'ví dụ không chứa từ: ' + e.word);
  });
});

test('thư viện thật: mọi gói hợp lệ, từ có trong kho, câu hỏi đúng', async () => {
  const content = await loadContent();
  const realBank = buildRealBank(JSON.parse(fs.readFileSync(REAL_WORDS, 'utf8')));
  const index = JSON.parse(fs.readFileSync(new URL('index.json', LIB_DIR), 'utf8'));
  assert.ok(index.length >= 24, 'chỉ ' + index.length + ' gói');
  assert.ok(!JSON.stringify(index).includes('GIẢ'));
  const ids = new Set();
  for (const meta of index) {
    assert.ok(!ids.has(meta.id), 'trùng id ' + meta.id);
    ids.add(meta.id);
    const raw = fs.readFileSync(new URL(`packs/${meta.id}.json`, LIB_DIR), 'utf8');
    assert.ok(!raw.includes('GIẢ'));
    const pack = JSON.parse(raw);
    const norm = content.normalizePack(pack);
    const chk = content.validatePack(norm);
    assert.deepEqual(chk.errors, [], meta.id + ' errors');
    assert.deepEqual(chk.warnings, [], meta.id + ' warnings');
    assert.ok(pack.vocab.length >= 12 && pack.vocab.length <= 20, meta.id + ' số từ ' + pack.vocab.length);
    assert.equal(meta.words, pack.vocab.length);
    assert.equal(meta.questions, pack.questions.length);
    assert.ok(pack.questions.length >= 12, meta.id + ' ít câu');
    assert.ok(pack.actionCommands.length >= 4 && pack.actionCommands.length <= 8, meta.id + ' actionCommands');
    assert.ok(pack.actionCommands.every((a) => /^[\x20-\x7e]+$/.test(a)), meta.id + ' actionCommands phải tiếng Anh');
    assert.ok(new Set(pack.vocab.map((v) => v.meaning)).size >= 6, meta.id + ' ít nghĩa khác nhau');
    pack.vocab.forEach((v) => assert.ok(lookupReal(realBank, v.word), `${meta.id}: "${v.word}" không có trong kho`));
    pack.questions.forEach((q, i) => {
      const lab = `${meta.id} câu ${i + 1}`;
      assert.equal(q.options.length, 3, lab);
      const low = q.options.map((o) => String(o).trim().toLowerCase());
      assert.equal(new Set(low).size, 3, lab + ' trùng đáp án ' + JSON.stringify(q.options));
      assert.ok(low.every(Boolean), lab);
      assert.ok(q.answer >= 0 && q.answer < 3 && q.options[q.answer], lab + ' answer');
    });
    const counts = [0, 0, 0];
    pack.questions.forEach((q) => { counts[q.answer]++; });
    assert.ok(Math.max(...counts) <= Math.ceil(pack.questions.length * 0.6), meta.id + ' lệch vị trí đáp án ' + counts);
  }
});

test('thư viện thật: sinh lại bằng build.mjs cho cùng kết quả (seed cố định)', async () => {
  const { generateQuestions: gen, LIBRARY_LIMITS } = await import('../src/core/soanbai/qgen.js');
  const realBank = buildRealBank(JSON.parse(fs.readFileSync(REAL_WORDS, 'utf8')));
  const meta = JSON.parse(fs.readFileSync(new URL('index.json', LIB_DIR), 'utf8'))[0];
  const pack = JSON.parse(fs.readFileSync(new URL(`packs/${meta.id}.json`, LIB_DIR), 'utf8'));
  let h = 2166136261;
  for (let i = 0; i < meta.id.length; i++) { h ^= meta.id.charCodeAt(i); h = Math.imul(h, 16777619); }
  const again = gen(pack.vocab, { count: 15, seed: h >>> 0, bank: realBank, limits: LIBRARY_LIMITS }).questions;
  assert.deepEqual(again, pack.questions);
});

// ---------- Đợt 4: luật chống câu mơ hồ (REVIEW-LIBRARY mục c) ----------

import { SAFE_QTYPES, LIBRARY_LIMITS } from '../src/core/soanbai/qgen.js';
import { KID_UNSAFE, PROPER, display, meaningClash, stripClassifier, isGeneric, nearCat, synClash, WHICH_CATS, fillBlacklisted } from '../src/core/soanbai/qrules.js';
import { phraseFor as phraseForCat } from '../src/core/soanbai/categories.js';
import { commonWords } from '../src/core/soanbai/commonwords.js';
import { auditQuestion, auditActions, makeAuditEnv, classify } from '../tools/library/audit.mjs';

test('qrules: từ chỉ loại, khung chung, láng giềng, đồng nghĩa, chữ hoa', () => {
  assert.equal(stripClassifier('cái bàn chải'), 'bàn chải');
  assert.ok(meaningClash('cái bàn chải', 'bàn chải đánh răng'));
  assert.ok(meaningClash('trò chơi', 'trò chơi điện tử'));
  assert.ok(meaningClash('rừng', 'rừng rậm'));
  assert.ok(meaningClash('con cú', 'con cú'));
  assert.ok(!meaningClash('con mèo', 'con chó'));
  assert.ok(isGeneric('This ___ is for my mum.'));
  assert.ok(isGeneric('My shoes are ___.'));
  assert.ok(isGeneric('We play ___ on rainy days.'));
  assert.ok(!isGeneric('The farmer feeds the hungry cows every morning at the farm.'));
  assert.ok(nearCat('plant', 'nature') && nearCat('toy', 'hobby') && nearCat('transport', 'space') && !nearCat('animal', 'clothes'));
  assert.ok(synClash('tired', 'sleepy') && synClash('Jacket', 'coat') && !synClash('cat', 'dog'));
  assert.equal(display('christmas'), 'Christmas');
  assert.equal(display('tv'), 'TV');
  assert.equal(display('cat'), 'cat');
  assert.ok(KID_UNSAFE.has('beer') && KID_UNSAFE.has('god') && KID_UNSAFE.has('blood'));
  assert.ok(fillBlacklisted('cards', 'We play cards on rainy days.') && !fillBlacklisted('cards', 'He deals the cards.'));
  assert.ok(commonWords().has('beer') && commonWords().has('sung') && commonWords().has('paste'));
  assert.deepEqual(SAFE_QTYPES, ['letter', 'word', 'meaning', 'spell']);
});

test('qgen đợt 4: 150 seed bảng trộn, mọi loại qua audit cơ học (0 vi phạm), không nhiễu không hợp trẻ', async () => {
  const realBank = buildRealBank(JSON.parse(fs.readFileSync(REAL_WORDS, 'utf8')));
  const env = makeAuditEnv(realBank);
  const mixed = realBank.list.map((e) => ({ word: e.word, meaning: e.vi, category: e.cat, example: e.ex, image: '' }));
  const kinds = {};
  for (let seed = 1; seed <= 150; seed++) {
    const rng = makeRng(seed * 977);
    const vocab = mixed.map((x) => ({ x, r: rng() })).sort((a, b) => a.r - b.r).slice(0, 24).map((o) => o.x);
    generateQuestions(vocab, { count: 40, seed, bank: realBank }).questions.forEach((q) => {
      const t = classify(q.prompt);
      kinds[t] = (kinds[t] || 0) + 1;
      const rules = auditQuestion(q, env);
      assert.deepEqual(rules, [], `${q.prompt} [${q.options.join(' / ')}]`);
      q.options.forEach((o, i) => { if (i !== q.answer && t !== 'meaning') assert.ok(!KID_UNSAFE.has(o.toLowerCase()), 'nhiễu không hợp trẻ: ' + o); });
    });
  }
  ['fill', 'meaning', 'word', 'which', 'letter', 'spell'].forEach((t) => assert.ok(kinds[t] > 50, t + ' quá ít: ' + kinds[t]));
});

test('qgen đợt 4: which chỉ ở nhóm tự nhiên; spell/letter không ra từ có thật (beer, god, sung, paste, disk)', () => {
  const realBank = buildRealBank(JSON.parse(fs.readFileSync(REAL_WORDS, 'utf8')));
  const mixed = realBank.list.map((e) => ({ word: e.word, meaning: e.vi, category: e.cat, example: e.ex, image: '' }));
  const allowedPhrases = new Set([...WHICH_CATS].map((c) => phraseForCat(c)));
  for (let seed = 1; seed <= 60; seed++) {
    generateQuestions(mixed, { types: ['which'], count: 30, seed, bank: realBank }).questions.forEach((q) => {
      const phrase = /^Which one is (.*)\?$/.exec(q.prompt)[1];
      assert.ok(allowedPhrases.has(phrase), 'nhóm không tự nhiên: ' + phrase);
    });
  }
  const bad = new Set(['beer', 'god', 'sung', 'paste', 'disk', 'hubby']);
  const pick = (w) => mixed.filter((v) => v.word === w);
  for (let seed = 1; seed <= 120; seed++) {
    const r = generateQuestions(pick('bear').concat(pick('good'), pick('song'), pick('pasta'), pick('desk'), pick('hobby')), { types: ['spell'], count: 10, seed, bank: realBank });
    r.questions.forEach((q) => q.options.forEach((o, i) => { if (i !== q.answer) assert.ok(!bad.has(o.toLowerCase()) && !commonWords().has(o.toLowerCase()), 'nhiễu spell là từ thật: ' + o); }));
  }
});

test('thư viện thật đợt 4: audit cơ học 0 vi phạm, actionCommands sạch, fill/which đúng giới hạn', () => {
  const realBank = buildRealBank(JSON.parse(fs.readFileSync(REAL_WORDS, 'utf8')));
  const env = makeAuditEnv(realBank);
  const dir = new URL('packs/', LIB_DIR);
  let n = 0;
  fs.readdirSync(dir).filter((f) => f.endsWith('.json')).forEach((f) => {
    const pack = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
    const cnt = {};
    pack.questions.forEach((q, i) => {
      n++;
      assert.deepEqual(auditQuestion(q, env), [], `${f}#${i + 1} ${q.prompt}`);
      const t = classify(q.prompt);
      cnt[t] = (cnt[t] || 0) + 1;
    });
    assert.ok((cnt.fill || 0) <= LIBRARY_LIMITS.fill && (cnt.which || 0) <= LIBRARY_LIMITS.which, f + ' vượt giới hạn fill/which');
    assert.deepEqual(auditActions(pack.actionCommands), [], f + ' actionCommands');
  });
  assert.ok(n >= 31 * 12);
});

test('panel: mặc định chỉ chọn loại an toàn, fill/which có chú thích', () => {
  const src = fs.readFileSync(new URL('../src/core/soanbai/panel.js', import.meta.url), 'utf8');
  assert.ok(src.includes('SAFE_QTYPES.indexOf(t) >= 0'));
  assert.ok(src.includes('Nên xem lại các câu loại này'));
});
