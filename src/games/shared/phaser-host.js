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
// size = 'resize': canvas phủ kín khung, toạ độ = điểm ảnh CSS của khung.
export async function mountPhaser(parent, makeScene, data = {}, size = DESIGN) {
  const Phaser = await loadPhaser();
  if (document.fonts && document.fonts.load) {
    await Promise.all([document.fonts.load('800 40px "Baloo 2"'), document.fonts.load('700 30px "Plus Jakarta Sans"')]).catch(() => {});
  }
  // Trình duyệt vẽ WebGL bằng CPU (vd ClassIn nhúng không có tăng tốc GPU): vẽ ở 2/3 độ phân giải
  // (ít hơn ~55% điểm ảnh) rồi phóng to; camera thu nhỏ nên toạ độ trong game vẫn là 1440x800.
  const lowRes = size !== 'resize' && softwareGL() ? 2 / 3 : 1;
  const Base = makeScene(Phaser);
  const Scene = lowRes === 1 ? Base : class LowResScene extends Base {
    create(...args) {
      this.cameras.main.setZoom(lowRes).centerOn(size.width / 2, size.height / 2);
      return super.create ? super.create(...args) : undefined;
    }
  };
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    transparent: true,
    width: size === 'resize' ? parent.clientWidth || 800 : Math.round(size.width * lowRes),
    height: size === 'resize' ? parent.clientHeight || 450 : Math.round(size.height * lowRes),
    banner: false,
    scale: size === 'resize' ? { mode: Phaser.Scale.RESIZE } : { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 6 },
    // antialias (MSAA) rất nặng khi trình duyệt không có GPU (ClassIn nhúng có thể vẽ bằng CPU); ảnh vẫn mịn nhờ lọc tuyến tính.
    render: { antialias: false, powerPreference: 'high-performance' },
  });
  game.scene.add('main', Scene, true, { ...data, calm: reducedMotion() });
  if (lowRes !== 1) game.__worldWidth = size.width; // cho toScreen() và game camera
  return { game, Phaser };
}

// Có đang vẽ WebGL bằng CPU không (SwiftShader / "software" / llvmpipe). Đo 1 lần.
let soft = null;
export function softwareGL() {
  if (soft !== null) return soft;
  soft = false;
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const name = gl ? String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : '';
    soft = /swiftshader|software|llvmpipe|basic render/i.test(name);
    const lose = gl && gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
  } catch {
    soft = false;
  }
  return soft;
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

// Vẽ 1 lần thành ảnh (texture). Graphics của Phaser bị vẽ lại từ đầu ở MỌI khung hình,
// nên hình tĩnh (hang, bảng, dây bóng...) phải "nướng" thành ảnh để máy yếu không bị giật.
export function bake(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  draw(g);
  g.generateTexture(key, Math.ceil(w), Math.ceil(h));
  g.destroy();
  return key;
}

// Kho chữ bay ("+1", "-1"...) tạo sẵn và dùng lại: mỗi lần tạo chữ mới là 1 lần vẽ + tải ảnh lên GPU.
export function textPool(scene, labels, { size = 64, depth = 95, count = 6 } = {}) {
  const pool = {};
  Object.entries(labels).forEach(([text, color]) => {
    pool[text] = Array.from({ length: count }, () =>
      scene.add.text(0, 0, text, { fontFamily: FONT_EN, fontSize: `${size}px`, fontStyle: '800', color })
        .setOrigin(0.5).setStroke('#ffffff', 10).setDepth(depth).setVisible(false));
  });
  return (x, y, text) => {
    const list = pool[text];
    if (!list) return;
    const t = list.find((o) => !o.visible) || list[0];
    scene.tweens.killTweensOf(t);
    t.setPosition(x, y).setScale(0.6).setAlpha(1).setVisible(true);
    scene.tweens.add({ targets: t, y: y - 80, alpha: 0, scale: 1.2, duration: 750, ease: 'Back.easeOut', onComplete: () => t.setVisible(false) });
  };
}

// Đổi toạ độ trong game Phaser -> toạ độ màn hình (cho test tự động).
export function toScreen(game, x, y) {
  const r = game.canvas.getBoundingClientRect();
  const k = game.__worldWidth ? game.__worldWidth / game.scale.width : 1; // vẽ thu nhỏ (máy không có GPU)
  return { x: r.left + (x * r.width) / (game.scale.width * k), y: r.top + (y * r.height) / (game.scale.height * k) };
}

export const FONT_EN = '"Baloo 2", "Plus Jakarta Sans", sans-serif';
export const INK = 0x1c1f25;
