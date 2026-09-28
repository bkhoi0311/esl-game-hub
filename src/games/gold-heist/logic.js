// Luật Gold Heist (thuần logic, không đụng DOM — để test được).

// Các loại rương. weight: tỉ lệ mặc định (giáo viên chỉnh được).
export const CHESTS = {
  plus10: { label: '+10', weight: 20 },
  plus20: { label: '+20', weight: 16 },
  plus30: { label: '+30', weight: 10 },
  double: { label: 'x2', weight: 10 },
  lose10: { label: '-10', weight: 14 },
  steal20: { label: 'Steal 20', weight: 16 },
  swap: { label: 'Swap', weight: 10 },
};

export function defaultWeights() {
  return Object.fromEntries(Object.entries(CHESTS).map(([k, v]) => [k, v.weight]));
}

// "Cướp" chỉ khi có đội khác đang có vàng; "Đổi" chỉ khi có đội khác số vàng khác mình.
export function availableChests(gold, team, weights) {
  const others = gold.filter((_, i) => i !== team);
  return Object.keys(CHESTS).filter((k) => {
    if (!(weights[k] > 0)) return false;
    if (k === 'steal20') return others.some((g) => g > 0);
    if (k === 'swap') return others.some((g) => g !== gold[team]);
    return true;
  });
}

function pickWeighted(keys, weights, rand) {
  const total = keys.reduce((s, k) => s + weights[k], 0);
  let r = rand() * total;
  for (const k of keys) {
    r -= weights[k];
    if (r < 0) return k;
  }
  return keys[keys.length - 1];
}

// 3 rương úp cho lượt này.
export function dealChests(gold, team, weights, rand = Math.random) {
  let keys = availableChests(gold, team, weights);
  if (!keys.length) keys = ['plus10'];
  return [0, 1, 2].map(() => pickWeighted(keys, weights, rand));
}

// Rương cần chọn đội đích?
export function needsTarget(kind) {
  return kind === 'steal20' || kind === 'swap';
}

// Đội có thể chọn làm đích.
export function validTargets(gold, team, kind) {
  return gold
    .map((g, i) => i)
    .filter((i) => i !== team && (kind === 'steal20' ? gold[i] > 0 : gold[i] !== gold[team]));
}

// Áp dụng rương. Trả về mảng vàng mới (không bao giờ âm) và mô tả tiếng Anh.
export function applyChest(gold, team, kind, target = -1, names = []) {
  const next = [...gold];
  const me = names[team] || `Team ${team + 1}`;
  const them = names[target] || `Team ${target + 1}`;
  let text = '';
  switch (kind) {
    case 'plus10':
    case 'plus20':
    case 'plus30': {
      const n = Number(CHESTS[kind].label.slice(1));
      next[team] += n;
      text = `+${n} gold`;
      break;
    }
    case 'double':
      next[team] *= 2;
      text = next[team] ? `Double gold` : `Double of 0 is 0`;
      break;
    case 'lose10':
      next[team] = Math.max(0, next[team] - 10);
      text = `Lose 10 gold`;
      break;
    case 'steal20': {
      const n = Math.min(20, next[target]);
      next[target] -= n;
      next[team] += n;
      text = `${me} steals ${n} gold from ${them}`;
      break;
    }
    case 'swap':
      [next[team], next[target]] = [next[target], next[team]];
      text = `${me} swaps gold with ${them}`;
      break;
    default:
      break;
  }
  return { gold: next.map((g) => Math.max(0, g)), text };
}
