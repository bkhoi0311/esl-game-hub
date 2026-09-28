// Luật Spell Grid (thuần logic).

export const MAX_TRIES = 6;
export const MIN_LEN = 4;
export const MAX_LEN = 6;

// Chỉ lấy từ 4-6 chữ cái a-z, không dấu cách.
export function eligibleWords(vocab) {
  const seen = new Set();
  const list = [];
  for (const v of vocab) {
    const word = (v.word || '').trim().toLowerCase();
    if (!/^[a-z]+$/.test(word) || word.length < MIN_LEN || word.length > MAX_LEN || seen.has(word)) continue;
    seen.add(word);
    list.push({ ...v, word });
  }
  return list;
}

// Tô màu 1 lượt đoán. Xử lý đúng chữ lặp:
// lượt 1 đánh dấu chữ đúng chỗ; lượt 2 chỉ tô vàng khi chữ đó còn "dư" trong từ bí mật.
export function scoreGuess(guess, answer) {
  const g = guess.toLowerCase();
  const a = answer.toLowerCase();
  const result = Array(g.length).fill('absent');
  const left = {};
  for (let i = 0; i < a.length; i++) {
    if (g[i] === a[i]) result[i] = 'correct';
    else left[a[i]] = (left[a[i]] || 0) + 1;
  }
  for (let i = 0; i < g.length; i++) {
    if (result[i] === 'correct') continue;
    if (left[g[i]] > 0) {
      result[i] = 'present';
      left[g[i]] -= 1;
    }
  }
  return result;
}

const RANK = { absent: 1, present: 2, correct: 3 };

// Màu bàn phím: giữ trạng thái tốt nhất đã biết của mỗi chữ.
export function mergeKeyStates(keys, guess, result) {
  const next = { ...keys };
  [...guess.toLowerCase()].forEach((ch, i) => {
    if (!next[ch] || RANK[result[i]] > RANK[next[ch]]) next[ch] = result[i];
  });
  return next;
}

// Điểm 1 từ: đoán đúng ở lượt n được (7 - n) x 10; dùng gợi ý bị trừ 20. Không âm.
export function wordScore(triesUsed, solved, usedHint) {
  if (!solved) return 0;
  return Math.max(0, (MAX_TRIES + 1 - triesUsed) * 10 - (usedHint ? 20 : 0));
}
