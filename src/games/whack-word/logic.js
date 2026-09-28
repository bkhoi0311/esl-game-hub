// Whack-a-Word (thuần logic): chọn từ mục tiêu và từ cho chuột ngoi lên.

// Từ dùng được: có cả từ tiếng Anh và nghĩa tiếng Việt, không trùng.
export function usableWords(vocab) {
  const seen = new Set();
  return vocab.filter((v) => {
    const key = (v.word || '').trim().toLowerCase();
    if (!key || !(v.meaning || '').trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Mục tiêu tiếp theo, khác mục tiêu vừa xong.
export function nextTarget(words, prev, rand = Math.random) {
  const pool = words.filter((w) => w !== prev);
  return pool[Math.floor(rand() * pool.length)] || words[0];
}

// Chọn từ cho 1 con chuột mới. Đảm bảo từ mục tiêu xuất hiện đủ thường xuyên:
// nếu mục tiêu chưa có trên bảng và đã ra `sinceTarget` con không phải mục tiêu, bắt buộc ra mục tiêu.
export function pickMoleWord(words, target, onBoard, sinceTarget, rand = Math.random) {
  const targetUp = onBoard.includes(target);
  if (!targetUp && (sinceTarget >= 2 || rand() < 0.4)) return target;
  const pool = words.filter((w) => w !== target && !onBoard.includes(w));
  return pool.length ? pool[Math.floor(rand() * pool.length)] : targetUp ? null : target;
}
