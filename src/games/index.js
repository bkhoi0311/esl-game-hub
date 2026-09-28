// Danh sách 9 game. Thứ tự ở đây là thứ tự hiện trên menu chính.
import statueFreeze from './statue-freeze/index.js';
import simonPose from './simon-pose/index.js';
import headTilt from './head-tilt/index.js';
import wordNinja from './word-ninja/index.js';
import goldHeist from './gold-heist/index.js';
import impostor from './impostor/index.js';
import wordle from './wordle/index.js';
import tugOfWar from './tug-of-war/index.js';
import drawGuess from './draw-guess/index.js';

export const GAMES = [
  statueFreeze, simonPose, headTilt, wordNinja,
  goldHeist, impostor, wordle, tugOfWar, drawGuess,
];

export const GROUPS = [
  { id: 'camera', title: 'Vận động với camera', hint: 'Cả lớp đứng dậy, dùng camera góc rộng.' },
  { id: 'class', title: 'Thi đấu cả lớp', hint: 'Chơi trên màn hình tương tác, không cần camera.' },
];

export function findGame(id) {
  return GAMES.find((g) => g.id === id) || null;
}
