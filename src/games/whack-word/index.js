// Whack-a-Word (Phaser 4) — chuột chũi ngoi lên cầm từ tiếng Anh; đập thật nhanh con có từ đúng với nghĩa tiếng Việt.
// 2 học sinh 2 nửa bảng, mỗi bên mục tiêu riêng. Đúng +1, sai -1. Búa vung theo chỗ chạm.
import { playSound, speak } from '../../core/audio.js';
import { shuffle } from '../../core/content.js';
import { line } from '../../core/voice-lines.js';
import { createPhaserDuel } from '../shared/duel-phaser.js';
import { DESIGN, FONT_EN, INK, makeFxTextures, toScreen } from '../shared/phaser-host.js';
import { nextTarget, pickMoleWord, usableWords } from './logic.js';

const COLS = 3;
const ROWS = 2;
const MAX_UP = 3;

const HOW_TO = {
  title: 'How to play',
  text: 'Read the Vietnamese word at the top.',
  steps: ['Whack the mole with the English word.', 'Right mole: +1 point.', 'Wrong mole: -1 point.'],
};

const MOLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 112">
  <path d="M14 112V58a46 46 0 0 1 92 0v54z" fill="#b07a4f" stroke="#1c1f25" stroke-width="5"/>
  <path d="M30 40q10-14 26-16" fill="none" stroke="#d9a57a" stroke-width="6" stroke-linecap="round"/>
  <ellipse cx="60" cy="80" rx="21" ry="15" fill="#f0cfa8"/>
  <circle cx="43" cy="57" r="7" fill="#1c1f25"/><circle cx="77" cy="57" r="7" fill="#1c1f25"/>
  <circle cx="45.5" cy="54.5" r="2.4" fill="#fff"/><circle cx="79.5" cy="54.5" r="2.4" fill="#fff"/>
  <ellipse cx="60" cy="70" rx="9" ry="6.5" fill="#fd3cc6" stroke="#1c1f25" stroke-width="3"/>
  <path d="M51 85q9 7 18 0" fill="none" stroke="#1c1f25" stroke-width="3.5" stroke-linecap="round"/>
  <rect x="55" y="86" width="10" height="8" rx="2" fill="#fff" stroke="#1c1f25" stroke-width="2"/>
  <circle cx="32" cy="74" r="6.5" fill="#fd3cc6" opacity=".35"/><circle cx="88" cy="74" r="6.5" fill="#fd3cc6" opacity=".35"/>
  <path d="M20 104q-8-10 4-14M100 104q8-10-4-14" fill="#9a6640" stroke="#1c1f25" stroke-width="3"/>
</svg>`;

const HAMMER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <rect x="52" y="44" width="16" height="72" rx="6" fill="#ff9800" stroke="#1c1f25" stroke-width="5"/>
  <rect x="14" y="8" width="92" height="44" rx="14" fill="#0c6bed" stroke="#1c1f25" stroke-width="5"/>
  <rect x="22" y="14" width="30" height="10" rx="5" fill="#fff" opacity=".5"/>
</svg>`;

// Phaser đọc data URI dạng base64.
const svgUrl = (s) => 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(s)));

function makeWhackScene(Phaser) {
  const W = DESIGN.width;
  const H = DESIGN.height;
  const LANE = W / 2;

  return class WhackScene extends Phaser.Scene {
    init(data) {
      this.api = data.api;
      this.calm = data.calm;
      this.words = usableWords(this.api.pack.vocab);
      this.sides = [];
      this.started = 0;
    }

    preload() {
      this.load.svg('mole', svgUrl(MOLE_SVG), { width: 180, height: 168 });
      this.load.svg('hammer', svgUrl(HAMMER_SVG), { width: 150, height: 150 });
    }

    create() {
      makeFxTextures(this);
      this.stars = this.add.particles(0, 0, 'fx-star', {
        speed: { min: 180, max: 420 }, scale: { start: 1, end: 0 }, rotate: { min: 0, max: 360 }, lifespan: 700, gravityY: 500,
        tint: [0xffd23f, 0xffffff, 0xfd3cc6, 0x00a2fd], emitting: false,
      }).setDepth(80);
      this.input.addPointer(4);

      const d = this.add.graphics().setDepth(1);
      d.lineStyle(6, 0xffffff, 0.8);
      for (let y = 10; y < H; y += 40) d.lineBetween(LANE, y, LANE, y + 22);

      [0, 1].forEach((i) => this.sides.push(this.buildSide(i)));
      this.input.on('pointerdown', (p) => this.swing(p.x, p.y));
      this.started = this.time.now;
    }

    buildSide(i) {
      const x0 = LANE * i;
      const color = Phaser.Display.Color.HexStringToColor(this.api.colors[i]).color;
      // Bảng mục tiêu (nghĩa tiếng Việt)
      const panel = this.add.graphics().setDepth(2);
      panel.fillStyle(0xffffff, 0.96).fillRoundedRect(x0 + 40, 18, LANE - 80, 132, 28);
      panel.lineStyle(6, color).strokeRoundedRect(x0 + 40, 18, LANE - 80, 132, 28);
      this.add.text(x0 + LANE / 2, 44, 'Find the English word for', { fontFamily: FONT_EN, fontSize: '28px', fontStyle: '700', color: '#6b6b6b' }).setOrigin(0.5).setDepth(3);
      const meaning = this.add.text(x0 + LANE / 2, 100, '', { fontFamily: '"Plus Jakarta Sans", sans-serif', fontSize: '50px', fontStyle: '800', color: '#1c1f25' }).setOrigin(0.5).setDepth(3);

      const holes = [];
      const top = 250;
      const rowH = (H - top - 20) / ROWS;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const hx = x0 + 40 + ((LANE - 80) / COLS) * (c + 0.5);
          const hy = top + rowH * (r + 0.72);
          const depth = 10 + r * 10;
          const back = this.add.graphics().setDepth(depth);
          back.fillStyle(0x3d2a1c).fillEllipse(hx, hy, 190, 62);
          back.lineStyle(5, INK).strokeEllipse(hx, hy, 190, 62);
          const mole = this.add.container(hx, hy + 8).setDepth(depth + 1);
          const body = this.add.image(0, 0, 'mole').setOrigin(0.5, 1);
          const signBg = this.add.graphics();
          const sign = this.add.text(0, -186, '', { fontFamily: FONT_EN, fontSize: '40px', fontStyle: '800', color: '#1c1f25' }).setOrigin(0.5);
          mole.add([body, signBg, sign]);
          mole.setScale(1, 0).setVisible(false);
          // Mép đất phía trước che chân chuột: tạo cảm giác chui lên từ hang.
          const front = this.add.graphics().setDepth(depth + 2);
          front.fillStyle(0x7a5236).fillEllipse(hx, hy + 18, 214, 44);
          front.lineStyle(5, INK).strokeEllipse(hx, hy + 18, 214, 44);
          front.fillStyle(0x9b6b47).fillEllipse(hx, hy + 12, 190, 26);
          const hit = this.add.zone(hx, hy - 90, 190, 200).setDepth(depth + 3).setInteractive({ useHandCursor: true });
          const slot = { hx, hy, mole, body, sign, signBg, item: null, hideAt: 0, hit: false };
          hit.on('pointerdown', () => this.whack(i, slot));
          holes.push(slot);
        }
      }
      const side = { i, holes, meaning, target: null, sinceTarget: 0, nextSpawn: this.time.now + 300 + i * 200 };
      this.setTarget(side, nextTarget(shuffle(this.words), null));
      return side;
    }

    setTarget(side, t) {
      side.target = t;
      side.sinceTarget = 0;
      side.meaning.setText(t.meaning);
      side.meaning.setFontSize(t.meaning.length > 16 ? '40px' : '50px');
      if (!this.calm) this.tweens.add({ targets: side.meaning, scale: { from: 0.6, to: 1 }, duration: 350, ease: 'Back.easeOut' });
    }

    drawSign(slot, fill) {
      const w = Math.max(slot.sign.width + 34, 90);
      slot.signBg.clear();
      slot.signBg.fillStyle(fill).fillRoundedRect(-w / 2, -216, w, 60, 18);
      slot.signBg.lineStyle(5, INK).strokeRoundedRect(-w / 2, -216, w, 60, 18);
      slot.signBg.fillStyle(0x8a5a36).fillRect(-5, -156, 10, 20);
    }

    stayMs() {
      const t = (this.time.now - this.started) / 1000;
      return Math.max(1200, 1900 - t * 12);
    }

    spawn(side) {
      const free = side.holes.filter((s) => !s.item);
      const up = side.holes.filter((s) => s.item);
      if (!free.length || up.length >= MAX_UP) return;
      const item = pickMoleWord(this.words, side.target, up.map((s) => s.item), side.sinceTarget);
      if (!item) return;
      side.sinceTarget = item === side.target ? 0 : side.sinceTarget + 1;
      const slot = free[Math.floor(Math.random() * free.length)];
      slot.item = item;
      slot.hit = false;
      slot.sign.setText(item.word).setColor('#1c1f25');
      this.drawSign(slot, 0xffe14d);
      slot.body.clearTint();
      slot.mole.setVisible(true).setAngle(0);
      slot.hideAt = this.time.now + this.stayMs();
      this.tweens.killTweensOf(slot.mole);
      this.tweens.add({ targets: slot.mole, scaleY: 1, scaleX: 1, duration: this.calm ? 80 : 260, ease: 'Back.easeOut' });
    }

    hide(slot) {
      slot.item = null;
      this.tweens.killTweensOf(slot.mole);
      this.tweens.add({ targets: slot.mole, scaleY: 0, duration: 160, ease: 'Quad.easeIn', onComplete: () => slot.mole.setVisible(false) });
    }

    swing(x, y) {
      if (this.calm) return;
      const hm = this.add.image(x + 60, y + 20, 'hammer').setOrigin(0.5, 0.95).setDepth(90).setAngle(40);
      this.tweens.add({ targets: hm, angle: -30, duration: 110, ease: 'Quad.easeIn', yoyo: false, onComplete: () => this.tweens.add({ targets: hm, alpha: 0, duration: 220, delay: 80, onComplete: () => hm.destroy() }) });
    }

    whack(i, slot) {
      if (!this.api.running || this.api.paused || !slot.item || slot.hit) return;
      const side = this.sides[i];
      const item = slot.item;
      slot.hit = true;
      const good = item === side.target;
      this.api.addScore(i, good ? 1 : -1);
      this.floatText(slot.hx, slot.hy - 240, good ? '+1' : '-1', good ? '#04bc09' : '#ff5a00');
      if (good) {
        playSound('correct');
        speak(item.word);
        slot.sign.setColor('#ffffff');
        this.drawSign(slot, 0x04bc09);
        this.stars.explode(this.calm ? 6 : 20, slot.hx, slot.hy - 120);
        this.setTarget(side, nextTarget(this.words, side.target));
      } else {
        playSound('wrong');
        slot.sign.setColor('#ffffff');
        this.drawSign(slot, 0xff5a00);
        slot.body.setTint(0xffb0a0);
      }
      this.tweens.killTweensOf(slot.mole);
      this.tweens.add({ targets: slot.mole, scaleY: 0.72, scaleX: 1.18, duration: 90, yoyo: true, ease: 'Quad.easeOut', onComplete: () => this.time.delayedCall(220, () => this.hide(slot)) });
    }

    floatText(x, y, text, color) {
      const t = this.add.text(x, y, text, { fontFamily: FONT_EN, fontSize: '64px', fontStyle: '800', color }).setOrigin(0.5).setStroke('#ffffff', 10).setDepth(95);
      this.tweens.add({ targets: t, y: y - 80, alpha: { from: 1, to: 0 }, scale: { from: 0.6, to: 1.2 }, duration: 800, ease: 'Back.easeOut', onComplete: () => t.destroy() });
    }

    update(time) {
      if (!this.api.running || this.api.paused) return;
      this.sides.forEach((side) => {
        side.holes.forEach((s) => {
          if (s.item && !s.hit && time >= s.hideAt) this.hide(s);
        });
        if (time >= side.nextSpawn) {
          this.spawn(side);
          side.nextSpawn = time + 520 + Math.random() * 380;
        }
      });
    }

    // Cho test tự động.
    targets(i) {
      const side = this.sides[i];
      return side.holes
        .filter((s) => s.item && !s.hit && s.mole.scaleY > 0.95)
        .map((s) => ({ ...toScreen(this.game, s.hx, s.hy - 90), word: s.item.word, target: s.item === side.target }));
    }
  };
}

let instance = null;

export default {
  id: 'whack-word',
  title: 'Whack-a-Word',
  needsCamera: false,
  minItems: { vocab: 6 },
  group: 'class',
  theme: 'garden',
  icon: 'hand',
  description: '2 học sinh thi đập chuột cầm từ tiếng Anh đúng nghĩa.',
  ready: true,
  checkContent: (pack) => (usableWords(pack.vocab).length >= 6 ? [] : ['Cần ít nhất 6 từ có cả nghĩa tiếng Việt.']),

  mount(rootEl, content) {
    instance = createPhaserDuel(rootEl, content, {
      id: 'whack-word',
      title: 'Whack-a-Word',
      howTo: HOW_TO,
      setupHint: 'Mỗi bên có mục tiêu riêng (nghĩa tiếng Việt), đập chuột cầm từ tiếng Anh đúng.',
      startLine: line('whackStart'),
      makeScene: makeWhackScene,
    });
  },

  unmount() {
    if (instance) instance.destroy();
    instance = null;
  },
};
