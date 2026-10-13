// Chống bấm loạn cho game 2 bên chạm song song. Thuần JS, test bằng node --test.
// - Bấm SAI: bên đó bị khoá coolMs (không tính chạm nào).
// - Hai chạm được tính của cùng một bên phải cách nhau ≥ minGapMs (lòng bàn tay/2 ngón đập cùng lúc chỉ tính 1).
export const GUARD = { coolMs: 700, minGapMs: 120 };

export function createTapGuard({ sides = 2, coolMs = GUARD.coolMs, minGapMs = GUARD.minGapMs, enabled = true } = {}) {
  const coolUntil = new Array(sides).fill(0);
  const last = new Array(sides).fill(-Infinity);
  return {
    enabled,
    allow(side, now) {
      if (!enabled) return true;
      if (now < coolUntil[side]) return false;
      if (now - last[side] < minGapMs) return false;
      last[side] = now;
      return true;
    },
    wrong(side, now) {
      if (enabled) coolUntil[side] = now + coolMs;
      return coolUntil[side];
    },
    coolingUntil: (side) => coolUntil[side],
    reset() { coolUntil.fill(0); last.fill(-Infinity); },
  };
}
