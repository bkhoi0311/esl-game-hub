// Tic-Tac-Toe Quiz (thuần logic).
export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

// board: mảng 9 ô, mỗi ô null | 0 | 1. Trả về { winner, line } | { draw: true } | null.
export function outcome(board) {
  for (const l of LINES) {
    const [a, b, c] = l;
    if (board[a] !== null && board[a] === board[b] && board[a] === board[c]) return { winner: board[a], line: l };
  }
  return board.every((x) => x !== null) ? { draw: true } : null;
}
