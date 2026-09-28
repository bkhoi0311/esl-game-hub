// Test logic thuần của các game (không cần trình duyệt). Chạy: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyChest, availableChests, dealChests, defaultWeights, validTargets } from '../src/games/gold-heist/logic.js';

// ---------- Gold Heist ----------

test('Gold Heist: vàng không bao giờ âm', () => {
  const w = defaultWeights();
  for (let run = 0; run < 2000; run++) {
    let gold = [0, 0, 0];
    for (let turn = 0; turn < 20; turn++) {
      const team = turn % 3;
      const kinds = dealChests(gold, team, w);
      const kind = kinds[Math.floor(Math.random() * 3)];
      const targets = validTargets(gold, team, kind);
      const target = targets.length ? targets[0] : -1;
      if ((kind === 'steal20' || kind === 'swap') && target < 0) assert.fail(`rương ${kind} xuất hiện khi không có đội đích`);
      gold = applyChest(gold, team, kind, target).gold;
      assert.ok(gold.every((g) => g >= 0 && Number.isInteger(g)), `vàng âm: ${gold}`);
    }
  }
});

test('Gold Heist: mất 10 vàng khi đang có 4 thì về 0', () => {
  assert.deepEqual(applyChest([4, 30], 0, 'lose10').gold, [0, 30]);
});

test('Gold Heist: cướp tối đa bằng số vàng đội kia có', () => {
  assert.deepEqual(applyChest([0, 12], 0, 'steal20', 1).gold, [12, 0]);
  assert.deepEqual(applyChest([5, 50], 0, 'steal20', 1).gold, [25, 30]);
});

test('Gold Heist: "cướp"/"đổi" chỉ khả dụng khi có đội khác phù hợp', () => {
  const w = defaultWeights();
  assert.ok(!availableChests([0, 0], 0, w).includes('steal20'), 'không đội nào có vàng thì không được cướp');
  assert.ok(!availableChests([10, 10], 0, w).includes('swap'), 'bằng vàng nhau thì không được đổi');
  assert.ok(availableChests([0, 10], 0, w).includes('steal20'));
  assert.ok(availableChests([0, 10], 0, w).includes('swap'));
  assert.deepEqual(validTargets([10, 0, 20], 0, 'steal20'), [2]);
  assert.deepEqual(validTargets([10, 10, 20], 0, 'swap'), [2]);
});

test('Gold Heist: đổi vàng', () => {
  assert.deepEqual(applyChest([5, 40, 7], 0, 'swap', 1).gold, [40, 5, 7]);
});

// ---------- Impostor Word ----------
import { checkContent as impostorCheck, explain, makeRound } from '../src/games/impostor/logic.js';
import { readFileSync } from 'node:fs';

const sample = JSON.parse(readFileSync(new URL('../src/data/sample-food-a2.json', import.meta.url)));

test('Impostor: không bao giờ có 2 từ khác nhóm, không lặp tổ hợp', () => {
  const used = new Set();
  let rounds = 0;
  for (;;) {
    const r = makeRound(sample.vocab, used);
    if (!r) break;
    rounds++;
    assert.equal(r.cards.length, 5);
    const odd = r.cards.filter((c) => c.category !== r.major);
    assert.equal(odd.length, 1, 'phải có đúng 1 từ khác nhóm');
    assert.equal(r.cards.filter((c) => c.impostor).length, 1);
    assert.ok(odd[0].impostor);
    if (rounds > 3000) break;
  }
  assert.equal(used.size, rounds, 'tổ hợp bị lặp');
  assert.ok(rounds > 50);
});

test('Impostor: báo thiếu nhóm rõ ràng', () => {
  const v = (word, category) => ({ word, category });
  assert.equal(impostorCheck(sample.vocab).length, 0);
  const one = impostorCheck([v('a', 'fruit'), v('b', 'fruit'), v('c', 'fruit'), v('d', 'fruit')]);
  assert.ok(one.length && /2 nhóm/.test(one[0]));
  const short = impostorCheck([v('a', 'fruit'), v('b', 'fruit'), v('c', 'fruit'), v('d', 'fruit'), v('e', 'drink'), v('f', 'drink')]);
  assert.ok(short.some((m) => /"drink" cần thêm 2 từ/.test(m)), short.join(' | '));
  assert.equal(makeRound([v('a', 'fruit'), v('b', 'fruit'), v('c', 'fruit'), v('d', 'fruit'), v('e', 'drink')]), null);
});

test('Impostor: câu giải thích', () => {
  assert.equal(explain('drink', 'fruit'), '4 are drinks, 1 is a fruit.');
  assert.equal(explain('vegetable', 'meal'), '4 are vegetables, 1 is a meal.');
  assert.equal(explain('dish', 'apple'), '4 are dishes, 1 is an apple.');
});

// ---------- Spell Grid ----------
import { eligibleWords, mergeKeyStates, scoreGuess, wordScore } from '../src/games/wordle/logic.js';

const cells = (g, a) => scoreGuess(g, a).map((r) => ({ correct: 'G', present: 'Y', absent: '-' })[r]).join('');

test('Spell Grid: tô màu cơ bản', () => {
  assert.equal(cells('bread', 'bread'), 'GGGGG');
  assert.equal(cells('drake', 'bread'), 'YGY-Y');
  assert.equal(cells('xxxxx', 'bread'), '-----');
});

test('Spell Grid: xử lý đúng chữ lặp', () => {
  // Từ bí mật "apple" có 2 chữ p.
  assert.equal(cells('puppy', 'apple'), 'Y-G--'); // 3 chữ p đoán, chỉ 2 được tô
  assert.equal(cells('paper', 'apple'), 'YYGY-');
  assert.equal(cells('llama', 'apple'), 'Y-Y--'); // apple chỉ có 1 l, 1 a
  assert.equal(cells('eerie', 'apple'), '----G'); // e cuối đúng chỗ, e đầu không được vàng thêm
  assert.equal(cells('apple', 'paper'), 'YYG-Y');
  assert.equal(cells('ppppp', 'apple'), '-GG--');
});

test('Spell Grid: bàn phím giữ màu tốt nhất', () => {
  let k = mergeKeyStates({}, 'puppy', scoreGuess('puppy', 'apple'));
  assert.equal(k.p, 'correct');
  assert.equal(k.u, 'absent');
  k = mergeKeyStates(k, 'plate', scoreGuess('plate', 'apple'));
  assert.equal(k.p, 'correct', 'không được hạ từ xanh xuống vàng');
});

test('Spell Grid: chỉ lấy từ 4-6 chữ, không dấu cách', () => {
  const words = eligibleWords([{ word: 'Bread' }, { word: 'ice cream' }, { word: 'tea' }, { word: 'banana' }, { word: 'lemonade' }, { word: 'bread' }, { word: 'phở' }]);
  assert.deepEqual(words.map((w) => w.word), ['bread', 'banana']);
});

test('Spell Grid: điểm', () => {
  assert.equal(wordScore(1, true, false), 60);
  assert.equal(wordScore(6, true, true), 0);
  assert.equal(wordScore(3, false, false), 0);
});
