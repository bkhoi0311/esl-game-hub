// Lớp phủ Phaser trên hình camera của Statue Freeze: ô chuyển động đỏ phát sáng, tia lấp lánh khi đèn xanh,
// vạch quét khi đang đo nhiễu. Chỉ vẽ; logic phát hiện chuyển động nằm ở index.js (không dùng AI).
import { makeFxTextures } from '../shared/phaser-host.js';

export function makeStatueScene(Phaser) {
  return class StatueScene extends Phaser.Scene {
    init(data) {
      this.getState = data.getState;
      this.calm = data.calm;
      this.seen = new Set();
    }

    create() {
      makeFxTextures(this);
      this.cells = this.add.graphics();
      this.scan = this.add.graphics();
      this.sparkles = this.add.particles(0, 0, 'fx-star', {
        x: { min: 0, max: 2000 }, y: { min: 0, max: 1200 }, speedY: { min: -40, max: -10 }, scale: { start: 0.5, end: 0 },
        alpha: { start: 0.9, end: 0 }, lifespan: 1400, frequency: 90, blendMode: 'ADD', tint: [0x9dff9f, 0xffffff, 0xfff27a], emitting: false,
      });
      this.pops = this.add.particles(0, 0, 'fx-dot', {
        speed: { min: 60, max: 180 }, scale: { start: 0.7, end: 0 }, lifespan: 450, tint: [0xff4a2a, 0xffb199], emitting: false,
      });
    }

    update(time) {
      const st = this.getState();
      const W = this.scale.width;
      const H = this.scale.height;
      // Vùng hình thật của video (object-fit: contain) trong khung.
      const scale = Math.min(W / st.vw, H / st.vh);
      const dw = st.vw * scale;
      const dh = st.vh * scale;
      const ox = (W - dw) / 2;
      const oy = (H - dh) / 2;
      const cw = dw / st.cols;
      const ch = dh / st.rows;

      const green = st.phase === 'green';
      if (green && !this.calm && !this.sparkles.emitting) this.sparkles.start();
      if (!green && this.sparkles.emitting) this.sparkles.stop();

      this.scan.clear();
      if (st.phase === 'calibrate') {
        const x = ox + ((time / 1500) % 1) * dw;
        this.scan.fillStyle(0x7dfab6, 0.18).fillRect(x - 40, oy, 80, dh);
        this.scan.lineStyle(6, 0x7dfab6, 0.9).lineBetween(x, oy, x, oy + dh);
      }

      const g = this.cells;
      g.clear();
      if (st.phase !== 'red' && st.phase !== 'review') {
        this.seen.clear();
        return;
      }
      const pulse = this.calm ? 0.4 : 0.32 + Math.sin(time / 140) * 0.12;
      st.flagged.forEach((f, i) => {
        if (!f) return;
        const c = i % st.cols;
        const r = Math.floor(i / st.cols);
        const x = ox + c * cw;
        const y = oy + r * ch;
        g.fillStyle(0xff3d1f, pulse).fillRoundedRect(x + 3, y + 3, cw - 6, ch - 6, 10);
        g.lineStyle(5, 0xff3d1f, 0.95).strokeRoundedRect(x + 3, y + 3, cw - 6, ch - 6, 10);
        g.lineStyle(2, 0xffffff, 0.8).strokeRoundedRect(x + 8, y + 8, cw - 16, ch - 16, 8);
        if (!this.seen.has(i)) {
          this.seen.add(i);
          if (!this.calm) this.pops.explode(6, x + cw / 2, y + ch / 2);
        }
      });
    }
  };
}
