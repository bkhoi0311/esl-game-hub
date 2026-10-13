// Lớp phủ Phaser trên hình camera của Statue Freeze: ô chuyển động đỏ phát sáng, ô vàng "đang chuyển động" (để chỉnh độ nhạy),
// ô xám (vùng luôn nhấp nháy bị bỏ qua), vạch chia 2 đội, tia lấp lánh khi đèn xanh, vạch quét khi đang đo nhiễu. Chỉ vẽ; logic phát hiện chuyển động nằm ở index.js (không dùng AI).
import { PERF } from '../../core/perf.js';
import { makeFxTextures } from '../shared/phaser-host.js';

export function makeStatueScene(Phaser) {
  return class StatueScene extends Phaser.Scene {
    init(data) {
      this.getState = data.getState;
      this.calm = data.calm;
      this.teams = data.teams || [];
      this.still = this.calm || PERF.name === 'lite'; // lite / giảm chuyển động: ô đỏ tĩnh, không hạt, chỉ vẽ lại khi dữ liệu đổi
      this.lastKey = '';
      this.seen = new Set();
    }

    create() {
      makeFxTextures(this);
      this.under = this.add.graphics();
      this.cells = this.add.graphics();
      this.scan = this.add.graphics();
      this.divider = this.add.graphics();
      this.labels = this.teams.map((name, i) => this.add.text(0, 0, name, {
        fontFamily: '"Baloo 2", "Plus Jakarta Sans", sans-serif', fontSize: '26px', fontStyle: '800', color: '#ffffff',
        backgroundColor: 'rgba(28,31,37,0.7)', padding: { x: 12, y: 4 },
      }).setOrigin(i ? 1 : 0, 0).setVisible(false));
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
      if (green && !this.still && !this.sparkles.emitting) this.sparkles.start();
      if (!green && this.sparkles.emitting) this.sparkles.stop();

      this.scan.clear();
      if (st.phase === 'calibrate') {
        const x = ox + ((time / 1500) % 1) * dw;
        this.scan.fillStyle(0x7dfab6, 0.18).fillRect(x - 40, oy, 80, dh);
        this.scan.lineStyle(6, 0x7dfab6, 0.9).lineBetween(x, oy, x, oy + dh);
      }

      // Ô chỉ vẽ lại khi dữ liệu đổi (lite / giảm chuyển động) hoặc mỗi khung khi ô đỏ nhấp nháy.
      const showCells = st.phase === 'red' || st.phase === 'review';
      const animate = showCells && !this.still;
      const key = `${st.version}|${st.phase}|${st.lanes}|${W}|${H}|${dw | 0}`;
      if (animate || key !== this.lastKey) {
        this.lastKey = key;
        this.drawCells(st, { ox, oy, dw, dh, cw, ch, time, showCells });
      }
      if (!showCells) this.seen.clear();
    }

    drawCells(st, { ox, oy, dw, dh, cw, ch, time, showCells }) {
      const u = this.under;
      const g = this.cells;
      const d = this.divider;
      u.clear();
      g.clear();
      d.clear();
      // Vùng luôn nhấp nháy (màn hình, quạt): xám, bị bỏ qua khi đo.
      if (st.phase !== 'calibrate' && st.masked) {
        st.masked.forEach((m, i) => {
          if (!m) return;
          const c = i % st.cols;
          const r = Math.floor(i / st.cols);
          u.fillStyle(0x6b7280, 0.3).fillRoundedRect(ox + c * cw + 3, oy + r * ch + 3, cw - 6, ch - 6, 8);
        });
      }
      // Ô vàng: đang chuyển động (chưa tính lỗi). Giáo viên chỉnh độ nhạy tới khi lúc cả lớp đứng yên thì hết vàng.
      if (showCells && st.live) {
        st.live.forEach((l, i) => {
          if (!l || (st.flagged && st.flagged[i])) return;
          const c = i % st.cols;
          const r = Math.floor(i / st.cols);
          u.fillStyle(0xffd23f, 0.28).fillRoundedRect(ox + c * cw + 3, oy + r * ch + 3, cw - 6, ch - 6, 10);
        });
      }
      // Vạch chia 2 đội (nét đứt) + tên đội.
      this.labels.forEach((t) => t.setVisible(false));
      if (st.lanes === 2) {
        const mx = ox + dw / 2;
        d.lineStyle(4, 0xffffff, 0.75);
        for (let y = oy; y < oy + dh; y += 32) d.lineBetween(mx, y, mx, Math.min(oy + dh, y + 18));
        this.labels.forEach((t, i) => t.setPosition(i ? ox + dw - 10 : ox + 10, oy + 8).setVisible(true));
      }
      if (!showCells) return;
      const pulse = this.still ? 0.4 : 0.32 + Math.sin(time / 140) * 0.12;
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
          if (!this.still) this.pops.explode(6, x + cw / 2, y + ch / 2);
        }
      });
    }
  };
}
