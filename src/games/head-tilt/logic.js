// Head Tilt Quiz: tính góc nghiêng đầu từ 2 khoé mắt ngoài (MediaPipe Face Landmarker điểm 33 và 263).

export const TILT_DEG = 15;
export const HOLD_MS = 400;

// Góc nghiêng theo hình GƯƠNG trên màn hình, đơn vị độ.
// Dương = đầu nghiêng về phía PHẢI màn hình, âm = về phía TRÁI màn hình.
export function rollDegrees(landmarks) {
  const a = landmarks[33];
  const b = landmarks[263];
  if (!a || !b) return 0;
  // Lật gương: x' = 1 - x. Lấy mắt nằm bên trái màn hình làm gốc.
  let p = { x: 1 - a.x, y: a.y };
  let q = { x: 1 - b.x, y: b.y };
  if (p.x > q.x) [p, q] = [q, p];
  const deg = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
  // Mắt bên phải màn hình thấp hơn (y lớn hơn) => đầu ngả sang phải màn hình.
  return deg;
}

// Theo dõi giữ nghiêng: trả về 'left' | 'right' khi giữ quá ngưỡng đủ lâu, ngược lại null.
export function createTiltTracker({ threshold = TILT_DEG, holdMs = HOLD_MS } = {}) {
  let side = null;
  let since = 0;
  return {
    update(deg, now) {
      const s = deg > threshold ? 'right' : deg < -threshold ? 'left' : null;
      if (s !== side) {
        side = s;
        since = now;
        return null;
      }
      return s && now - since >= holdMs ? s : null;
    },
    reset() {
      side = null;
      since = 0;
    },
  };
}

// Câu 3 đáp án -> chỉ lấy đáp án đúng + 1 đáp án sai, đặt ngẫu nhiên trái/phải.
export function twoChoice(q, rand = Math.random) {
  const wrongs = q.options.filter((_, i) => i !== q.answer && q.options[i]);
  const wrong = wrongs[Math.floor(rand() * wrongs.length)];
  const right = q.options[q.answer];
  return rand() < 0.5 ? { left: right, right: wrong, correct: 'left' } : { left: wrong, right: right, correct: 'right' };
}
