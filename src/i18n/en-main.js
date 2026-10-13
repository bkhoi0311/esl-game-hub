// Chunk lười "en-main": tiếng Anh của mọi khu vực nằm trong bundle chính. Chỉ nạp khi giao diện là EN.
// Thêm khu vực mới (nạp cùng bundle chính) thì thêm một dòng import + một dòng trong object.
import core from './strings/core.en.js';
import menuSettings from './strings/menu-settings.en.js';
import editor from './strings/editor.en.js';
import sbmain from './strings/sbmain.en.js';
import gamesDuel from './strings/games-duel.en.js';
import cameraGuide from './strings/camera-guide.en.js';

export default { ...core, ...menuSettings, ...editor, ...sbmain, ...gamesDuel, ...cameraGuide };
