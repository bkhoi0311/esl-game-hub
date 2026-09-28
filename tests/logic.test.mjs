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
