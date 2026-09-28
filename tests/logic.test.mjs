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

// ---------- Simon Says Pose (khung xương giả) ----------
import { POSES } from '../src/games/simon-pose/poses.js';

// Người đứng thẳng quay mặt vào camera. Ảnh GỐC (chưa lật gương): tay trái học sinh nằm bên PHẢI ảnh (x lớn).
function body(changes = {}) {
  const p = (x, y) => ({ x, y, visibility: 0.99 });
  const lm = Array.from({ length: 33 }, () => p(0.5, 0.5));
  Object.assign(lm, {
    0: p(0.5, 0.2), 11: p(0.58, 0.32), 12: p(0.42, 0.32), 13: p(0.6, 0.45), 14: p(0.4, 0.45),
    15: p(0.6, 0.56), 16: p(0.4, 0.56), 23: p(0.55, 0.6), 24: p(0.45, 0.6), 25: p(0.55, 0.75),
    26: p(0.45, 0.75), 27: p(0.55, 0.9), 28: p(0.45, 0.9),
  });
  for (const [k, v] of Object.entries(changes)) lm[k] = p(v[0], v[1]);
  return lm;
}
const matches = (lm) => POSES.filter((ps) => ps.check(lm)).map((ps) => ps.id);

test('Simon: đứng thẳng không khớp tư thế nào', () => {
  assert.deepEqual(matches(body()), []);
});
test('Simon: trái/phải theo học sinh (tay trái = điểm 15)', () => {
  assert.deepEqual(matches(body({ 15: [0.62, 0.1], 13: [0.62, 0.22] })), ['left-hand']);
  assert.deepEqual(matches(body({ 16: [0.38, 0.1], 14: [0.38, 0.22] })), ['right-hand']);
});
test('Simon: các tư thế khác', () => {
  assert.ok(matches(body({ 15: [0.62, 0.1], 16: [0.38, 0.1] })).includes('hands-up'));
  assert.deepEqual(matches(body({ 15: [0.8, 0.33], 16: [0.2, 0.33], 13: [0.69, 0.32], 14: [0.31, 0.32] })), ['t-pose']);
  assert.ok(matches(body({ 15: [0.53, 0.21] })).includes('touch-nose'));
  assert.ok(matches(body({ 15: [0.55, 0.15], 16: [0.45, 0.15], 13: [0.66, 0.25], 14: [0.34, 0.25] })).includes('hands-on-head'));
  assert.ok(matches(body({ 27: [0.55, 0.72], 25: [0.57, 0.66] })).includes('one-leg'));
  assert.ok(matches(body({ 23: [0.55, 0.72], 24: [0.45, 0.72], 25: [0.6, 0.76], 26: [0.4, 0.76] })).includes('squat'));
});

// ---------- Head Tilt ----------
import { createTiltTracker, rollDegrees, twoChoice } from '../src/games/head-tilt/logic.js';

const face = (lx, ly, rx, ry) => { const f = []; f[33] = { x: rx, y: ry }; f[263] = { x: lx, y: ly }; return f; };
test('Head Tilt: đầu thẳng = 0 độ, nghiêng theo hình gương', () => {
  // Ảnh gốc: mắt phải học sinh (33) ở x nhỏ. Lật gương: 33 sang bên phải màn hình.
  assert.ok(Math.abs(rollDegrees(face(0.6, 0.4, 0.4, 0.4))) < 1);
  // Mắt bên phải màn hình (33) thấp hơn => nghiêng về phải màn hình => dương.
  assert.ok(rollDegrees(face(0.6, 0.35, 0.4, 0.45)) > 15);
  assert.ok(rollDegrees(face(0.6, 0.45, 0.4, 0.35)) < -15);
});
test('Head Tilt: phải giữ 0.4 giây mới chọn, đầu thẳng không chọn', () => {
  const t = createTiltTracker();
  assert.equal(t.update(5, 0), null);
  assert.equal(t.update(3, 1000), null);
  assert.equal(t.update(20, 1100), null);
  assert.equal(t.update(20, 1300), null);
  assert.equal(t.update(20, 1550), 'right');
  assert.equal(t.update(-20, 1600), null);
});
test('Head Tilt: câu 3 đáp án -> đúng + 1 sai', () => {
  const q = { prompt: 'x', options: ['eats', 'eat', 'eating'], answer: 0 };
  for (let i = 0; i < 20; i++) {
    const c = twoChoice(q);
    assert.equal(c[c.correct], 'eats');
    assert.notEqual(c.left, c.right);
  }
});

// ---------- Word Ninja ----------
import { launchCard, segmentHitsRect, speedOf, stepCard } from '../src/games/word-ninja/logic.js';

test('Word Ninja: nhát chém cắt qua thẻ', () => {
  assert.ok(segmentHitsRect(0, 50, 200, 50, 100, 50, 40, 20));
  assert.ok(!segmentHitsRect(0, 0, 200, 0, 100, 50, 40, 20));
  assert.ok(segmentHitsRect(90, 0, 110, 100, 100, 50, 40, 20));
  assert.equal(speedOf({ x: 0, y: 0, t: 0 }, { x: 100, y: 0, t: 100 }), 1000);
});
test('Word Ninja: thẻ bay lên rồi rơi xuống trong khung', () => {
  const c = launchCard({ word: 'tea' }, 1000, 600, () => 0.5);
  let minY = c.y;
  for (let i = 0; i < 300; i++) { stepCard(c, 1 / 60); minY = Math.min(minY, c.y); }
  assert.ok(minY > 0 && minY < 600 * 0.5, `đỉnh ${minY}`);
  assert.ok(c.y > 600, 'thẻ phải rơi ra khỏi màn hình');
});

// ---------- Tic-Tac-Toe ----------
import { outcome } from '../src/games/tic-tac-toe/logic.js';

test('Tic-Tac-Toe: thắng hàng/cột/chéo, hoà, chưa xong', () => {
  const n = null;
  assert.deepEqual(outcome([0, 0, 0, n, 1, 1, n, n, n]), { winner: 0, line: [0, 1, 2] });
  assert.deepEqual(outcome([1, 0, n, 1, 0, n, 1, n, n]), { winner: 1, line: [0, 3, 6] });
  assert.deepEqual(outcome([0, 1, 1, n, 0, n, n, n, 0]).line, [0, 4, 8]);
  assert.deepEqual(outcome([0, 1, 0, 0, 1, 1, 1, 0, 0]), { draw: true });
  assert.equal(outcome([0, n, n, n, 1, n, n, n, n]), null);
});

// ---------- Memory Match ----------
import { buildDeck, isMatch, maxPairs } from '../src/games/memory-match/logic.js';

test('Memory Match: mỗi cặp gồm 1 thẻ từ + 1 thẻ nghĩa, không trùng', () => {
  const deck = buildDeck(sample.vocab, 8);
  assert.equal(deck.length, 16);
  for (let p = 0; p < 8; p++) {
    const cards = deck.filter((c) => c.pair === p);
    assert.deepEqual(cards.map((c) => c.kind).sort(), ['meaning', 'word']);
    assert.ok(isMatch(cards[0], cards[1]));
  }
  assert.equal(new Set(deck.map((c) => c.text.toLowerCase())).size, 16);
  assert.ok(!isMatch(deck[0], deck[0]));
  assert.equal(maxPairs(sample.vocab), 24);
});

// ---------- Whack-a-Word ----------
import { pickMoleWord, usableWords } from '../src/games/whack-word/logic.js';

test('Whack-a-Word: từ mục tiêu xuất hiện ít nhất mỗi 3 con, không trùng trên bảng', () => {
  const words = usableWords(sample.vocab);
  const target = words[0];
  let since = 0;
  let onBoard = [];
  for (let i = 0; i < 300; i++) {
    const w = pickMoleWord(words, target, onBoard, since);
    assert.ok(w, 'phải chọn được từ');
    assert.ok(!onBoard.includes(w), 'trùng từ đang trên bảng');
    since = w === target ? 0 : since + 1;
    assert.ok(since <= 2, 'mục tiêu vắng quá lâu');
    onBoard = w === target ? [] : [...onBoard, w].slice(-2);
  }
});
