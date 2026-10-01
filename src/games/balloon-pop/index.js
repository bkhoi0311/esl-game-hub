// Balloon Pop (Phaser 4) — bóng bay chữ bay lên ở 2 nửa bảng; bấm nổ bóng thuộc nhóm yêu cầu (vd "Pop only DRINKS").
// Nhóm mục tiêu đổi mỗi 20 giây. Đúng +1, sai -1. 2 học sinh chạm cùng lúc không chặn nhau.
import { playSound, speak } from '../../core/audio.js';
import { bus } from '../../core/events.js';
import { balloonTarget } from '../../core/voice-lines.js';
import { createPhaserDuel } from '../shared/duel-phaser.js';
import { DESIGN, FONT_EN, INK, makeFxTextures, toScreen } from '../shared/phaser-host.js';
import { playableCategories } from '../word-ninja/logic.js';

const TARGET_MS = 20000;
const COLORS = [0xfd3cc6, 0x04bc09, 0xffd23f, 0x00a2fd, 0xff9800, 0xa26bff, 0x00d9e8];
const MAX_PER_SIDE = 7;

const HOW_TO = {
  title: 'How to play',
  text: 'Pop only the balloons in the target group.',
  steps: ['Tap a balloon to pop it.', 'Right group: +1 point.', 'Wrong group: -1 point.'],
};

function makeBalloonScene(Phaser, shared) {
  const W = DESIGN.width;
  const H = DESIGN.height;
  const LANE = W / 2;

  return class BalloonScene extends Phaser.Scene {
    init(data) {
      this.api = data.api;
      this.calm = data.calm;
      this.balloons = [];
      this.nextSpawn = [0, 350];
      this.started = 0;
    }

    create() {
      makeFxTextures(this);
      COLORS.forEach((c, i) => {
        if (this.textures.exists(`balloon-${i}`)) return;
        const g = this.make.graphics({}, false);
        g.fillStyle(c).fillEllipse(70, 70, 120, 136);
        g.lineStyle(6, INK).strokeEllipse(70, 70, 120, 136);
        g.fillStyle(0xffffff, 0.55).fillEllipse(44, 38, 24, 40);
        g.fillStyle(c).fillTriangle(58, 146, 82, 146, 70, 134);
        g.lineStyle(5, INK).strokeTriangle(58, 146, 82, 146, 70, 134);
        g.generateTexture(`balloon-${i}`, 140, 152).destroy();
      });

      // Vạch chia 2 bên + tên đội ở đáy mỗi bên
      const d = this.add.graphics();
      d.lineStyle(6, 0xffffff, 0.8);
      for (let y = 10; y < H; y += 40) d.lineBetween(LANE, y, LANE, y + 22);
      this.api.teams.forEach((name, i) => {
        this.add.text(LANE * i + LANE / 2, H - 36, name, { fontFamily: FONT_EN, fontSize: '44px', fontStyle: '800', color: '#ffffff' })
          .setOrigin(0.5).setAlpha(0.9).setStroke(this.api.colors[i], 10);
      });

      this.stars = this.add.particles(0, 0, 'fx-star', {
        speed: { min: 200, max: 480 }, scale: { start: 1.1, end: 0 }, rotate: { min: 0, max: 360 },
        lifespan: 750, gravityY: 400, emitting: false,
      }).setDepth(50);
      this.dots = this.add.particles(0, 0, 'fx-dot', {
        speed: { min: 120, max: 360 }, scale: { start: 0.8, end: 0 }, lifespan: 600, emitting: false,
        tint: [0xffffff, 0xffd23f],
      }).setDepth(49);
      this.input.addPointer(4);
      this.started = this.time.now;
    }

    spawn(side) {
      const cat = shared.cat;
      if (!cat) return;
      const vocab = this.api.pack.vocab.filter((v) => v.word && v.category);
      const wantTarget = Math.random() < 0.45;
      const pool = vocab.filter((v) => (v.category.toLowerCase() === cat) === wantTarget);
      const item = pool[Math.floor(Math.random() * pool.length)];
      if (!item || this.balloons.filter((b) => b.side === side && !b.done).length >= MAX_PER_SIDE) return;

      const ci = Math.floor(Math.random() * COLORS.length);
      const x = LANE * side + 90 + Math.random() * (LANE - 180);
      const c = this.add.container(x, H + 110).setDepth(10);
      const string = this.add.graphics();
      string.lineStyle(3, INK, 0.9);
      string.beginPath();
      string.moveTo(0, 76);
      string.lineTo(-6, 110);
      string.lineTo(4, 140);
      string.lineTo(-2, 170);
      string.strokePath();
      const img = this.add.image(0, 0, `balloon-${ci}`).setInteractive({ useHandCursor: true });
      const label = this.add.text(0, -2, item.word, { fontFamily: FONT_EN, fontSize: '34px', fontStyle: '800', color: '#1c1f25' }).setOrigin(0.5);
      const bg = this.add.graphics();
      const bw = Math.max(label.width + 26, 70);
      bg.fillStyle(0xffffff, 0.95).fillRoundedRect(-bw / 2, -26, bw, 50, 16);
      bg.lineStyle(4, INK).strokeRoundedRect(-bw / 2, -26, bw, 50, 16);
      c.add([string, img, bg, label]);
      const t = (this.time.now - this.started) / 1000;
      // Bay hết màn hình trong ~4,8 s lúc đầu, nhanh dần tới ~3,2 s (trước: 7,5 s, các bé thấy quá chậm).
      const b = { c, img, item, side, color: COLORS[ci], speed: (H + 300) / Math.max(3.2, 4.8 - t * 0.03), phase: Math.random() * 6, baseX: x, done: false };
      img.on('pointerdown', () => this.pop(b));
      this.balloons.push(b);
      if (!this.calm) this.tweens.add({ targets: c, scale: { from: 0.6, to: 1 }, duration: 350, ease: 'Back.easeOut' });
    }

    pop(b) {
      if (b.done || !this.api.running || this.api.paused) return;
      b.done = true;
      const good = b.item.category.toLowerCase() === shared.cat;
      this.api.addScore(b.side, good ? 1 : -1);
      const { x, y } = b.c;
      this.floatText(x, y - 40, good ? '+1' : '-1', good ? '#04bc09' : '#ff5a00');
      if (good) {
        playSound('pop');
        bus.emit('correct', { duel: true }); // 2 bé chơi song song: không tính "chuỗi đúng" chung
        speak(b.item.word, { priority: 'low' }); // đang đọc câu khác thì bỏ qua, không chồng giọng
        this.stars.setParticleTint(b.color);
        this.stars.explode(this.calm ? 6 : 14, x, y);
        this.dots.explode(this.calm ? 3 : 8, x, y);
        this.tweens.add({ targets: b.c, scale: 1.4, alpha: 0, duration: 170, ease: 'Quad.easeOut', onComplete: () => b.c.destroy() });
      } else {
        playSound('wrong');
        b.img.setTint(0x9aa3ad);
        this.tweens.add({
          targets: b.c, x: x + 14, duration: 60, yoyo: true, repeat: 3,
          onComplete: () => this.tweens.add({ targets: b.c, y: H + 220, angle: 40, alpha: 0.4, duration: 900, ease: 'Quad.easeIn', onComplete: () => b.c.destroy() }),
        });
      }
    }

    floatText(x, y, text, color) {
      const t = this.add.text(x, y, text, { fontFamily: FONT_EN, fontSize: '64px', fontStyle: '800', color }).setOrigin(0.5).setStroke('#ffffff', 10).setDepth(60);
      this.tweens.add({ targets: t, y: y - 90, alpha: { from: 1, to: 0 }, scale: { from: 0.6, to: 1.2 }, duration: 800, ease: 'Back.easeOut', onComplete: () => t.destroy() });
    }

    update(time, delta) {
      if (!this.api.running || this.api.paused) return;
      const dt = Math.min(delta, 50) / 1000;
      [0, 1].forEach((side) => {
        if (time >= this.nextSpawn[side]) {
          this.spawn(side);
          this.nextSpawn[side] = time + 550 + Math.random() * 350;
        }
      });
      this.balloons.forEach((b) => {
        if (b.done) return;
        b.c.y -= b.speed * dt;
        b.c.x = b.baseX + Math.sin(time / 600 + b.phase) * 14;
        b.c.angle = Math.sin(time / 500 + b.phase) * 4;
        if (b.c.y < -200) {
          b.done = true;
          b.c.destroy();
        }
      });
      this.balloons = this.balloons.filter((b) => !b.done || b.c.active);
    }

    // Cho test tự động: toạ độ màn hình của các bóng còn bay ở 1 bên.
    targets(side) {
      return this.balloons
        .filter((b) => !b.done && b.side === side && b.c.y > 60 && b.c.y < H - 60)
        .map((b) => ({ ...toScreen(this.game, b.c.x, b.c.y - 30), word: b.item.word, cat: b.item.category.toLowerCase() }));
    }
  };
}

let instance = null;

export default {
  id: 'balloon-pop',
  title: 'Balloon Pop',
  needsCamera: false,
  minItems: { vocab: 8 },
  group: 'class',
  theme: 'sky',
  icon: 'search',
  description: '2 học sinh thi bấm nổ bóng bay có từ đúng nhóm.',
  ready: true,
  checkContent(pack) {
    const n = Object.keys(playableCategories(pack.vocab)).length;
    return n >= 2 ? [] : [`Cần ít nhất 2 nhóm từ, mỗi nhóm ít nhất 3 từ (hiện có ${n} nhóm đủ).`];
  },

  mount(rootEl, content) {
    const shared = { cat: null };
    const cats = Object.keys(playableCategories(content.vocab));
    const setTarget = (api) => {
      const choices = cats.filter((c) => c !== shared.cat);
      shared.cat = choices[Math.floor(Math.random() * choices.length)] || cats[0];
      const text = balloonTarget(shared.cat);
      api.setBanner(text.replace(/!$/, '').replace(/(\w+)$/, (m) => m.toUpperCase()));
      speak(text);
    };
    instance = createPhaserDuel(rootEl, content, {
      id: 'balloon-pop',
      title: 'Balloon Pop',
      howTo: HOW_TO,
      banner: true,
      setupHint: `Nhóm mục tiêu đổi mỗi 20 giây. Nhóm dùng trong game: ${cats.join(', ')}.`,
      makeScene: (Phaser) => makeBalloonScene(Phaser, shared),
      onRoundStart(api) {
        shared.cat = null;
        setTarget(api);
        const again = () => {
          if (!api.running) return;
          setTarget(api);
          api.later(again, TARGET_MS);
        };
        api.later(again, TARGET_MS);
      },
    });
  },

  unmount() {
    if (instance) instance.destroy();
    instance = null;
  },
};
