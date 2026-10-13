// Chính sách giọng đọc theo game. Thuần JS để test bằng node --test.
// Game thi đấu: học sinh bấm liên tục, đọc từ mỗi lần bấm gây ồn, nên mặc định KHÔNG đọc (chỉ âm hiệu + điểm).
export const QUIET_GAMES = new Set([
  'gold-heist', 'impostor', 'tug-of-war', 'whack-word', 'balloon-pop', 'memory-match', 'tic-tac-toe',
  'sentence-race', 'word-ninja',
]);

// options.manual: người dùng tự bấm nút loa ⇒ luôn đọc.
export function speechAllowed(gameId, settings = {}, options = {}) {
  if (options.manual) return true;
  if (!gameId || !QUIET_GAMES.has(gameId)) return true;
  return settings.readAloud === 'on';
}
