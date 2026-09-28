// Word Ninja (Phaser 4): thẻ từ bay theo đường cong, vệt kiếm phát sáng, thẻ bị chém tách đôi bay ra 2 bên.
// Nhận nét chém từ chuột/cảm ứng (tự xử lý) và từ cổ tay qua camera (addPoint gọi từ ngoài).
import { DESIGN, FONT_EN, makeFxTextures, toScreen } from '../shared/phaser-host.js';
import { launchCard, segmentHitsRect, speedOf, stepCard } from './logic.js';

const SPAWN_MS = 1000;
const TRAIL_MS = 180;
const CARD_COLORS = ['#fff4c2', '#dcfbfe', '#ffe3f6', '#e3eeff', '#e9fbd0'];

// Vẽ thẻ từ lên canvas 2D rồi đưa vào Phaser làm texture (chữ tròn Baloo 2).
function cardCanvas(word, color) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = `800 54px ${FONT_EN}`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(word).width + 72);
  const h = 104;
  c.width = w;
  c.height = h;
  const r = 30;
  const path = (y0, hh) => {
    ctx.beginPath();
    ctx.moveTo(r, y0);
    ctx.arcTo(w - 3, y0, w - 3, y0 + hh, r);
    ctx.arcTo(w - 3, y0 + hh, 3, y0 + hh, r);
    ctx.arcTo(3, y0 + hh, 3, y0, r);
    ctx.arcTo(3, y0, w - 3, y0, r);
    ctx.closePath();
  };
  path(3, h - 6);
  ctx.fillStyle = '#1c1f25';
  ctx.fill();
  path(3, h - 16);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#1c1f25';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(r, 12, w * 0.35, 8);
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1c1f25';
  ctx.fillText(word, w / 2, h / 2 - 4);
  return c;
}

export function makeNinjaScene(Phaser) {
  const W = DESIGN.width;
  const H = DESIGN.height;

  return class NinjaScene extends Phaser.Scene {
    init(data) {
      this.api = data.api;
      this.calm = data.calm;
      this.cards = [];
      this.blades = new Map();
      this.nextSpawn = 0;
      this.texN = 0;
    }

    create() {
      makeFxTextures(this);
      this.trail = this.add.graphics().setDepth(40);
      this.stars = this.add.particles(0, 0, 'fx-star', {
        speed: { min: 200, max: 520 }, scale: { start: 1.1, end: 0 }, rotate: { min: 0, max: 360 }, lifespan: 700, gravityY: 500,
        tint: [0xffd23f, 0xffffff, 0x04bc09, 0x00e1f3], emitting: false,
      }).setDepth(50);
      this.sparks = this.add.particles(0, 0, 'fx-dot', {
        speed: { min: 20, max: 80 }, scale: { start: 0.5, end: 0 }, lifespan: 260, blendMode: 'ADD', tint: 0x9ff6ff, emitting: false,
      }).setDepth(41);
      this.input.addPointer(4);
      this.input.on('pointerdown', (p) => this.blades.set(`p${p.id}`, [{ x: p.x, y: p.y, t: this.time.now }]));
      this.input.on('pointermove', (p) => {
        if (p.isDown && this.blades.has(`p${p.id}`)) this.addPoint(`p${p.id}`, p.x, p.y, this.time.now, 0.45);
      });
      this.input.on('pointerup', (p) => this.blades.delete(`p${p.id}`));
    }

    spawn() {
      const item = this.api.pickItem();
      if (!item) return;
      const key = `card-${this.texN++}`;
      const cv = cardCanvas(item.word, CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)]);
      this.textures.addCanvas(key, cv);
      const img = this.add.image(0, 0, key).setDepth(20);
      const card = launchCard({ ...item, key, img, w: cv.width, h: cv.height }, W, H);
      this.cards.push(card);
    }

    // Thêm 1 điểm vào vệt chém; minSpeed tính theo chiều cao màn hình mỗi giây.
    addPoint(id, x, y, t, minSpeed) {
      const trail = this.blades.get(id) || [];
      const prev = trail[trail.length - 1];
      trail.push({ x, y, t });
      while (trail.length > 12) trail.shift();
      this.blades.set(id, trail);
      if (!this.calm) this.sparks.explode(2, x, y);
      if (!prev || !this.api.running || this.api.paused) return;
      if (speedOf(prev, { x, y, t }) < minSpeed * H) return;
      for (const c of this.cards) {
        if (c.sliced || c.gone) continue;
        if (segmentHitsRect(prev.x, prev.y, x, y, c.x, c.y, c.w, c.h)) this.slice(c, Math.atan2(y - prev.y, x - prev.x));
      }
    }

    slice(c, angle) {
      c.sliced = true;
      const good = c.target;
      c.img.setVisible(false);
      const halves = [0, 1].map((k) => {
        const hImg = this.add.image(c.x, c.y, c.key).setDepth(25).setRotation(c.img.rotation);
        hImg.setCrop(k ? c.w / 2 : 0, 0, c.w / 2, c.h);
        if (!good) hImg.setTint(0xff9a8a);
        return hImg;
      });
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      let left = 2;
      halves.forEach((hImg, k) => {
        const s = k ? 1 : -1;
        this.tweens.add({
          targets: hImg, x: c.x + nx * 140 * s + c.vx * 0.3, y: c.y + ny * 140 * s + 220, angle: hImg.angle + 50 * s,
          alpha: 0, duration: 750, ease: 'Quad.easeIn',
          onComplete: () => {
            hImg.destroy();
            // Xoá ảnh thẻ khi cả 2 nửa đã bay xong.
            if (--left === 0 && this.textures.exists(c.key)) this.textures.remove(c.key);
          },
        });
      });
      this.floatText(c.x, c.y - 50, good ? '+1' : '-1', good ? '#04bc09' : '#ff5a00');
      if (good) this.stars.explode(this.calm ? 6 : 24, c.x, c.y);
      else if (!this.calm) this.cameras.main.shake(140, 0.005);
      this.api.onSlice(good, c.word);
    }

    floatText(x, y, text, color) {
      const t = this.add.text(x, y, text, { fontFamily: FONT_EN, fontSize: '72px', fontStyle: '800', color }).setOrigin(0.5).setStroke('#ffffff', 12).setDepth(60);
      this.tweens.add({ targets: t, y: y - 90, alpha: { from: 1, to: 0 }, scale: { from: 0.6, to: 1.2 }, duration: 800, ease: 'Back.easeOut', onComplete: () => t.destroy() });
    }

    update(time, delta) {
      this.drawTrails(time);
      if (!this.api.running || this.api.paused) return;
      const dt = Math.min(delta, 50) / 1000;
      if (time >= this.nextSpawn) {
        this.spawn();
        this.nextSpawn = time + SPAWN_MS;
      }
      this.cards.forEach((c) => {
        if (c.sliced) return;
        stepCard(c, dt);
        c.img.setPosition(c.x, c.y).setRotation(c.angle);
        if (c.y > H + 140 && c.vy > 0) c.gone = true;
      });
      this.cards = this.cards.filter((c) => {
        if (c.sliced) {
          c.img.destroy();
          return false;
        }
        if (c.gone) {
          c.img.destroy();
          this.textures.remove(c.key);
          return false;
        }
        return true;
      });
    }

    drawTrails(time) {
      const g = this.trail;
      g.clear();
      for (const [id, trail] of this.blades) {
        const fresh = trail.filter((p) => time - p.t < TRAIL_MS);
        if (fresh.length < 2) {
          if (id.startsWith('w') && trail.length && time - trail[trail.length - 1].t > 1000) this.blades.delete(id);
          continue;
        }
        for (const [width, color, alpha] of [[34, 0x00e1f3, 0.25], [18, 0x9ff6ff, 0.55], [7, 0xffffff, 1]]) {
          g.lineStyle(width, color, alpha);
          g.beginPath();
          g.moveTo(fresh[0].x, fresh[0].y);
          fresh.slice(1).forEach((p) => g.lineTo(p.x, p.y));
          g.strokePath();
        }
      }
    }

    // Cho test tự động: toạ độ màn hình của các thẻ đang bay.
    targets() {
      return this.cards.filter((c) => !c.sliced && c.y > 80 && c.y < H - 80).map((c) => ({ ...toScreen(this.game, c.x, c.y), target: c.target, word: c.word }));
    }
  };
}
