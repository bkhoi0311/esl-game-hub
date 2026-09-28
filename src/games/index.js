// Danh sách game. Thứ tự ở đây là thứ tự hiện trên menu chính.
import statueFreeze from './statue-freeze/index.js';
import simonPose from './simon-pose/index.js';
import headTilt from './head-tilt/index.js';
import wordNinja from './word-ninja/index.js';
import goldHeist from './gold-heist/index.js';
import impostor from './impostor/index.js';
import tugOfWar from './tug-of-war/index.js';
import whackWord from './whack-word/index.js';
import balloonPop from './balloon-pop/index.js';
import memoryMatch from './memory-match/index.js';
import ticTacToe from './tic-tac-toe/index.js';

export const GAMES = [
  statueFreeze, simonPose, headTilt, wordNinja,
  goldHeist, impostor, tugOfWar, whackWord, balloonPop, memoryMatch, ticTacToe,
];

export const GROUPS = [
  { id: 'camera', title: 'Vận động với camera', hint: 'Cả lớp đứng dậy, dùng camera.' },
  { id: 'class', title: 'Thi đấu cả lớp', hint: 'Chơi trên bảng tương tác, 2 học sinh lên bấm.' },
];

export function findGame(id) {
  return GAMES.find((g) => g.id === id) || null;
}
