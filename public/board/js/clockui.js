// Cụm đồng hồ có biểu tượng: [⏱ bật/tắt] [mm:ss] [▶/❚❚] [↺] + khay chọn giờ. Chỉ trình bày, không giữ trạng thái giờ. PLAN-BOARD-V21 mục 3.
// Dùng chung cho 2 chế độ: Đề tắt (tools.js) và Đề bật (classbar.js). Không animation: nhấp nháy bằng đổi class mỗi giây.
import { h, markSelected } from './dom.js';
import { icon } from './icons.js';
import { pressable } from './ui.js';
import { fmtClock } from './timer.js';

const SETS = [['30', 'down', 30, '30 giây'], ['60', 'down', 60, '60 giây'], ['90', 'down', 90, '90 giây'], ['120', 'down', 120, '2 phút'], ['up', 'up', 0, 'Bấm giờ']];

// actions: { toggle(), startPause(), reset(), set(mode, sec) }
export function createClockUI({ actions }) {
  const el = h('div', 'clk', null, { 'data-testid': 'clock-ui' });
  const toggle = h('button', 'cbtn cbtn--sq clk-toggle', icon('timer'), { type: 'button', 'data-testid': 'timer-toggle', 'aria-pressed': 'false', 'aria-label': 'Bật đồng hồ' });
  const display = h('button', 'cbtn cb-clock clk-display', '00:00', { type: 'button', 'data-testid': 'timer-display', 'aria-label': 'Đồng hồ: chọn thời gian' });
  const start = h('button', 'cbtn cbtn--primary clk-start', icon('play'), { type: 'button', 'data-testid': 'timer-start', 'aria-label': 'Bắt đầu' });
  const reset = h('button', 'cbtn cbtn--sq clk-reset', icon('rotate-ccw'), { type: 'button', 'data-testid': 'timer-reset', 'aria-label': 'Đặt lại đồng hồ' });
  el.append(toggle, display, start, reset);

  const tray = h('div', 'pane pane--tray clk-tray', null, { 'data-testid': 'timer-pop', role: 'group', 'aria-label': 'Chọn thời gian' });
  tray.hidden = true;
  const row1 = h('div', 'clk-row');
  SETS.forEach((q) => {
    const x = h('button', 'cbtn cbtn--pop', q[3], { type: 'button', 'data-testid': 'timer-set-' + q[0], 'aria-pressed': 'false' });
    x.dataset.mode = q[1]; x.dataset.sec = String(q[2]);
    pressable(x, () => { closeTray(); actions.set(q[1], q[2]); });
    row1.appendChild(x);
  });
  const row2 = h('div', 'clk-row');
  const popStart = h('button', 'cbtn cbtn--primary', icon('play') + '<span>Bắt đầu</span>', { type: 'button', 'data-testid': 'timer-pop-start' });
  const popReset = h('button', 'cbtn', icon('rotate-ccw') + '<span>Đặt lại</span>', { type: 'button', 'data-testid': 'timer-pop-reset' });
  const popOff = h('button', 'cbtn', 'Tắt đồng hồ', { type: 'button', 'data-testid': 'timer-set-off' });
  pressable(popStart, () => { closeTray(); actions.startPause(); });
  pressable(popReset, () => { closeTray(); actions.reset(); });
  pressable(popOff, () => { closeTray(); actions.set('off', 0); });
  row2.append(popStart, popReset, popOff);
  tray.append(row1, row2);
  el.appendChild(tray);

  let lastMode = 'off', blink = false;
  function openTray() { tray.hidden = false; }
  function closeTray() { const was = !tray.hidden; tray.hidden = true; return was; }

  pressable(toggle, () => {
    const wasOff = lastMode === 'off';
    actions.toggle();
    if (wasOff) openTray(); else closeTray();
  });
  pressable(display, () => { tray.hidden = !tray.hidden; });
  pressable(start, () => { closeTray(); actions.startPause(); });
  pressable(reset, () => { closeTray(); actions.reset(); });
  // chạm ra ngoài khay thì đóng (nút ⏱ tự xử lý sau đó)
  document.addEventListener('pointerdown', (e) => { if (!tray.hidden && !tray.contains(e.target) && !display.contains(e.target)) closeTray(); }, true);

  function paintTime(t) {
    display.textContent = fmtClock(t.left);
    const warn = t.mode === 'down' && t.left <= 10 && t.left > 0 && t.running;
    const end = t.mode === 'down' && t.left === 0;
    display.classList.toggle('is-warn', warn);
    display.classList.toggle('is-end', end);
    if (warn) { blink = !blink; } else blink = false;
    display.classList.toggle('is-blink', warn && blink);
  }
  // t = { mode, total, left, running }
  function update(t) {
    lastMode = t.mode;
    const on = t.mode !== 'off';
    toggle.classList.toggle('is-on', on);
    toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    toggle.setAttribute('aria-label', on ? 'Tắt đồng hồ' : 'Bật đồng hồ');
    el.classList.toggle('is-off', !on);
    display.hidden = !on; start.hidden = !on; reset.hidden = !on;
    if (!on) closeTray();
    blink = false;
    paintTime(t);
    start.innerHTML = icon(t.running ? 'pause' : 'play');
    start.setAttribute('aria-label', t.running ? 'Tạm dừng' : 'Bắt đầu');
    popStart.innerHTML = icon(t.running ? 'pause' : 'play') + '<span>' + (t.running ? 'Tạm dừng' : 'Bắt đầu') + '</span>';
    markSelected(row1, (x) => x.dataset.mode === t.mode && (t.mode !== 'down' || Number(x.dataset.sec) === t.total));
  }
  // mỗi giây: chỉ đổi chữ và class của số giờ
  function tick(t) { paintTime(t); }
  return { el, tray, update, tick, openTray, closeTray, isOpen: () => !tray.hidden };
}
