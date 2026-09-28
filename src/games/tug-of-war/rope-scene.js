// Dải kéo co (Phaser 4): 2 bạn nhỏ áo màu đội kéo dây, nghiêng người khi kéo, bụi tung; bên thắng nhảy mừng.
import { FONT_EN, INK, makeFxTextures } from '../shared/phaser-host.js';

export const ROPE_SIZE = { width: 1440, height: 230 };

export function makeRopeScene(Phaser) {
  const W = ROPE_SIZE.width;
  const H = ROPE_SIZE.height;
  const CX = W / 2;
  const GROUND = H - 34;

  return class RopeScene extends Phaser.Scene {
    init(data) {
      this.teams = data.teams;
      this.colors = data.colors.map((c) => Phaser.Display.Color.HexStringToColor(c).color);
      this.steps = data.steps;
      this.calm = data.calm;
      this.stepPx = (W * 0.3) / this.steps;
      this.pos = 0;
    }

    create() {
      makeFxTextures(this);
      const g = this.add.graphics();
      // Mặt đất + vạch giữa + 2 vạch thắng
      g.fillStyle(0x7fd36a).fillRoundedRect(20, GROUND - 6, W - 40, 40, 20);
      g.lineStyle(4, INK).strokeRoundedRect(20, GROUND - 6, W - 40, 40, 20);
      g.lineStyle(6, 0xffffff, 0.9).lineBetween(CX, 20, CX, GROUND + 30);
      [-1, 1].forEach((s) => {
        const x = CX + s * this.stepPx * this.steps;
        g.fillStyle(this.colors[s < 0 ? 0 : 1]).fillRoundedRect(x - 7, 14, 14, GROUND + 18, 7);
        g.lineStyle(3, INK).strokeRoundedRect(x - 7, 14, 14, GROUND + 18, 7);
      });
      for (let k = -this.steps + 1; k < this.steps; k++) {
        if (!k) continue;
        g.fillStyle(0xffffff, 0.8).fillCircle(CX + k * this.stepPx, GROUND + 14, 5);
      }

      // Nhóm di chuyển theo dây: dây + cờ + 2 bạn nhỏ
      this.group = this.add.container(0, 0);
      const rope = this.add.graphics();
      const ry = 118;
      rope.lineStyle(20, 0x7a4d17).lineBetween(250, ry, W - 250, ry);
      rope.lineStyle(12, 0xd9a15a).lineBetween(250, ry, W - 250, ry);
      rope.lineStyle(3, 0x9b6a2a, 0.9);
      for (let x = 260; x < W - 250; x += 22) rope.lineBetween(x, ry - 5, x + 10, ry + 5);
      this.flag = this.add.container(CX, ry);
      const fg = this.add.graphics();
      fg.lineStyle(5, INK).lineBetween(0, 0, 0, -78);
      fg.fillStyle(0xff3d3d).fillTriangle(2, -78, 2, -46, 46, -62);
      fg.lineStyle(4, INK).strokeTriangle(2, -78, 2, -46, 46, -62);
      fg.fillStyle(0xffd23f).fillRoundedRect(-18, -16, 36, 32, 8);
      fg.lineStyle(4, INK).strokeRoundedRect(-18, -16, 36, 32, 8);
      this.flag.add(fg);
      this.kids = [this.makeKid(215, ry, 0, 1), this.makeKid(W - 215, ry, 1, -1)];
      this.group.add([rope, this.flag, ...this.kids.map((k) => k.c)]);

      this.dust = this.add.particles(0, 0, 'fx-dot', {
        speed: { min: 60, max: 180 }, angle: { min: 200, max: 340 }, scale: { start: 0.9, end: 0 }, lifespan: 500,
        tint: [0xd9b88a, 0xc79d63, 0xffffff], emitting: false,
      });
      this.stars = this.add.particles(0, 0, 'fx-star', {
        speed: { min: 150, max: 380 }, scale: { start: 1, end: 0 }, rotate: { min: 0, max: 360 }, lifespan: 900, gravityY: 300,
        tint: [0xffd23f, 0xfd3cc6, 0x04bc09, 0x00a2fd], emitting: false,
      });
      this.kids.forEach((k, i) => {
        this.add.text(i ? W - 34 : 34, 70, this.teams[i], { fontFamily: FONT_EN, fontSize: '38px', fontStyle: '800', color: '#ffffff' })
          .setOrigin(i ? 1 : 0, 0.5).setStroke(Phaser.Display.Color.IntegerToColor(this.colors[i]).rgba, 9);
      });
    }

    // Bạn nhỏ vẽ bằng code: đầu, tóc, áo màu đội, tay nắm dây, chân.
    makeKid(x, ry, i, dir) {
      const c = this.add.container(x, ry);
      const g = this.add.graphics();
      const col = this.colors[i];
      // chân
      g.lineStyle(12, INK).lineBetween(-6 * dir, 34, -24 * dir, 76);
      g.lineBetween(10 * dir, 34, 0, 78);
      g.lineStyle(7, 0x3a5bd9).lineBetween(-6 * dir, 34, -24 * dir, 76);
      g.lineBetween(10 * dir, 34, 0, 78);
      g.fillStyle(INK).fillEllipse(-28 * dir, 80, 26, 12).fillEllipse(-2 * dir, 82, 26, 12);
      // thân
      g.fillStyle(col).fillRoundedRect(-22, -20, 44, 58, 16);
      g.lineStyle(5, INK).strokeRoundedRect(-22, -20, 44, 58, 16);
      // tay nắm dây
      g.lineStyle(12, INK).lineBetween(0, -4, 40 * dir, 2);
      g.lineStyle(7, 0xffc98f).lineBetween(0, -4, 40 * dir, 2);
      g.fillStyle(0xffc98f).fillCircle(42 * dir, 2, 9);
      g.lineStyle(4, INK).strokeCircle(42 * dir, 2, 9);
      // đầu
      g.fillStyle(0xffc98f).fillCircle(0, -48, 28);
      g.lineStyle(5, INK).strokeCircle(0, -48, 28);
      g.fillStyle(i ? 0x6b4226 : 0x2b2b2b).fillEllipse(-4 * dir, -68, 58, 26);
      g.fillStyle(INK).fillCircle(8 * dir, -48, 4).fillCircle(20 * dir, -48, 4);
      g.lineStyle(4, INK).beginPath();
      g.arc(14 * dir, -38, 8, 0.2, Math.PI - 0.2);
      g.strokePath();
      g.fillStyle(0xff7aa8, 0.6).fillCircle(24 * dir, -38, 5);
      c.add(g);
      return { c, g, baseX: x, dir };
    }

    // pos âm = kéo về trái. who: bên vừa kéo (0/1) để tạo dáng.
    setPos(pos, who) {
      this.pos = pos;
      const x = pos * this.stepPx;
      this.tweens.add({ targets: this.group, x, duration: this.calm ? 120 : 420, ease: 'Back.easeOut' });
      if (who == null) return;
      const kid = this.kids[who];
      this.tweens.add({ targets: kid.c, angle: -18 * kid.dir, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
      this.dust.explode(this.calm ? 4 : 14, kid.baseX + x - 20 * kid.dir, GROUND);
    }

    win(side) {
      const kid = this.kids[side];
      const loser = this.kids[1 - side];
      this.stars.explode(this.calm ? 8 : 40, kid.baseX + this.group.x, 70);
      this.tweens.add({ targets: kid.c, y: kid.c.y - 40, duration: 260, yoyo: true, repeat: 4, ease: 'Quad.easeOut' });
      this.tweens.add({ targets: loser.c, angle: 70 * loser.dir, y: loser.c.y + 30, duration: 500, ease: 'Bounce.easeOut' });
    }
  };
}
