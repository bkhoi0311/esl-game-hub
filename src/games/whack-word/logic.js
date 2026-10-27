// Whack-a-Word (thuần logic): chọn từ mục tiêu và từ cho chuột ngoi lên.

// Từ dùng được: có từ tiếng Anh và có hình (picFn(v) khác null: ảnh, chữ số hoặc câu đục lỗ), không trùng.
// Trả về bản sao từ kèm v.pic. picFn truyền từ ngoài vào để logic chạy được trong Node.
export function usableWords(vocab, picFn = () => null) {
  const seen = new Set();
  const out = [];
  vocab.forEach((v) => {
    const key = (v.word || '').trim().toLowerCase();
    if (!key || seen.has(key)) return;
    const pic = picFn(v);
    if (!pic) return;
    seen.add(key);
    out.push({ ...v, pic });
  });
  return out;
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
