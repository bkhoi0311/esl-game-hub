// Danh sách game. Thứ tự ở đây là thứ tự hiện trên menu chính.
import statueFreeze from './statue-freeze/index.js';
import simonPose from './simon-pose/index.js';
import wordNinja from './word-ninja/index.js';
import goldHeist from './gold-heist/index.js';
import impostor from './impostor/index.js';
import tugOfWar from './tug-of-war/index.js';
import whackWord from './whack-word/index.js';
import balloonPop from './balloon-pop/index.js';
import memoryMatch from './memory-match/index.js';
import ticTacToe from './tic-tac-toe/index.js';
import sentenceRace from './sentence-race/index.js';
import { addStrings, t } from '../i18n/index.js';
import VI from '../i18n/strings/core.vi.js';

addStrings('core', VI);

export const GAMES = [
  statueFreeze, simonPose, wordNinja,
  goldHeist, impostor, tugOfWar, whackWord, balloonPop, memoryMatch, ticTacToe, sentenceRace,
];

// Nhóm game trên menu. title/hint là getter: dịch theo ngôn ngữ LÚC ĐỌC (không đóng băng ở cấp module).
export const GROUPS = [
  { id: 'camera', titleKey: 'hub.group.camera.title', hintKey: 'hub.group.camera.hint' },
  { id: 'class', titleKey: 'hub.group.class.title', hintKey: 'hub.group.class.hint' },
].map((g) => ({
  ...g,
  get title() { return t(g.titleKey); },
  get hint() { return t(g.hintKey); },
}));

export function findGame(id) {
  return GAMES.find((g) => g.id === id) || null;
}
