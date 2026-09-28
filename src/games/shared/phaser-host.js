// Nạp Phaser 4 (tách gói riêng ở bản online) và gắn 1 game Phaser vào 1 khung HTML.
// Canvas trong suốt để nhìn thấy nền "thế giới" phía sau; nhiều ngón chạm cùng lúc.
import { reducedMotion } from '../../core/events.js';

let lib = null;
export async function loadPhaser() {
  lib ||= import('phaser').then((m) => m.default || m);
  return lib;
}

// Kích thước thiết kế của vùng chơi (tỉ lệ gần bằng vùng game trong khung A4).
export const DESIGN = { width: 1440, height: 800 };

// makeScene(Phaser) trả về class Scene. data được truyền vào init(data).
export async function mountPhaser(parent, makeScene, data = {}, size = DESIGN) {
  const Phaser = await loadPhaser();
  if (document.fonts && document.fonts.load) {
    await Promise.all([document.fonts.load('800 40px "Baloo 2"'), document.fonts.load('700 30px "Plus Jakarta Sans"')]).catch(() => {});
  }
  const Scene = makeScene(Phaser);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    transparent: true,
    width: size.width,
    height: size.height,
    banner: false,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 6 },
    render: { antialias: true },
  });
  game.scene.add('main', Scene, true, { ...data, calm: reducedMotion() });
  return { game, Phaser };
}

// Hoạ tiết vẽ bằng code (không cần file ảnh): hạt tròn, sao, tim.
export function makeFxTextures(scene) {
  const t = scene.textures;
  if (!t.exists('fx-dot')) {
    const g = scene.make.graphics({}, false);
    g.fillStyle(0xffffff).fillCircle(12, 12, 12).generateTexture('fx-dot', 24, 24).destroy();
  }
  if (!t.exists('fx-star')) {
    const g = scene.make.graphics({}, false);
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 7 : 16;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      pts.push({ x: 16 + Math.cos(a) * r, y: 16 + Math.sin(a) * r });
    }
    g.fillStyle(0xffffff).fillPoints(pts, true).generateTexture('fx-star', 32, 32).destroy();
  }
}

// Đổi toạ độ trong game Phaser -> toạ độ màn hình (cho test tự động).
export function toScreen(game, x, y) {
  const r = game.canvas.getBoundingClientRect();
  return { x: r.left + (x * r.width) / game.scale.width, y: r.top + (y * r.height) / game.scale.height };
}

export const FONT_EN = '"Baloo 2", "Plus Jakarta Sans", sans-serif';
export const INK = 0x1c1f25;
