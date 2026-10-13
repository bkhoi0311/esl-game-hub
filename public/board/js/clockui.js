// Cụm đồng hồ có biểu tượng: [⏱ bật/tắt] [mm:ss] [▶/❚❚] [↺] + khay chọn giờ. Chỉ trình bày, không giữ trạng thái giờ. PLAN-BOARD-V21 mục 3.
// Dùng chung cho 2 chế độ: Đề tắt (tools.js) và Đề bật (classbar.js). Không animation: nhấp nháy bằng đổi class mỗi giây.
import { h, markSelected } from './dom.js';
import { icon } from './icons.js';
import { pressable } from './ui.js';
import { fmtClock } from './timer.js';
import { bind } from './i18n.js';

// [testid, mode, giây, khoá chuỗi, tham số]
const SETS = [['30', 'down', 30, 'board.timer.sec', { n: 30 }], ['60', 'down', 60, 'board.timer.sec', { n: 60 }], ['90', 'down', 90, 'board.timer.sec', { n: 90 }], ['120', 'down', 120, 'board.timer.min', { n: 2 }], ['up', 'up', 0, 'board.timer.up', null]];

// actions: { toggle(), startPause(), reset(), set(mode, sec) }
export function createClockUI({ actions }) {
  const el = h('div', 'clk', null, { 'data-testid': 'clock-ui' });
  const toggle = h('button', 'cbtn cbtn--sq clk-toggle', icon('timer'), { type: 'button', 'data-testid': 'timer-toggle', 'aria-pressed': 'false' });
  bind(toggle, 'board.clk.on', null, 'aria-label');
  const display = h('button', 'cbtn cb-clock clk-display', '00:00', { type: 'button', 'data-testid': 'timer-display' });
  bind(display, 'board.cb.clockAria', null, 'aria-label');
  const start = h('button', 'cbtn cbtn--primary clk-start', icon('play'), { type: 'button', 'data-testid': 'timer-start' });
  bind(start, 'common.start', null, 'aria-label');
  const reset = h('button', 'cbtn cbtn--sq clk-reset', icon('rotate-ccw'), { type: 'button', 'data-testid': 'timer-reset' });
  bind(reset, 'board.cb.reset', null, 'aria-label');
  el.append(toggle, display, start, reset);

  const tray = h('div', 'pane pane--tray clk-tray', null, { 'data-testid': 'timer-pop', role: 'group' });
  bind(tray, 'board.cb.popAria', null, 'aria-label');
  tray.hidden = true;
  const row1 = h('div', 'clk-row');
  SETS.forEach((q) => {
    const x = h('button', 'cbtn cbtn--pop', null, { type: 'button', 'data-testid': 'timer-set-' + q[0], 'aria-pressed': 'false' });
    bind(x, q[3], q[4]);
    x.dataset.mode = q[1]; x.dataset.sec = String(q[2]);
    pressable(x, () => { closeTray(); actions.set(q[1], q[2]); });
    row1.appendChild(x);
  });
  const row2 = h('div', 'clk-row');
  const popStart = h('button', 'cbtn cbtn--primary', icon('play') + '<span></span>', { type: 'button', 'data-testid': 'timer-pop-start' });
  const popStartT = popStart.querySelector('span');
  bind(popStartT, 'common.start');
  const popReset = h('button', 'cbtn', icon('rotate-ccw') + '<span></span>', { type: 'button', 'data-testid': 'timer-pop-reset' });
  bind(popReset.querySelector('span'), 'board.clk.resetShort');
  const popOff = h('button', 'cbtn', null, { type: 'button', 'data-testid': 'timer-set-off' });
  bind(popOff, 'board.clk.off');
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
    bind(toggle, on ? 'board.clk.off' : 'board.clk.on', null, 'aria-label');
    el.classList.toggle('is-off', !on);
    display.hidden = !on; start.hidden = !on; reset.hidden = !on;
    if (!on) closeTray();
    blink = false;
    paintTime(t);
    start.innerHTML = icon(t.running ? 'pause' : 'play');
    bind(start, t.running ? 'board.cb.pause' : 'common.start', null, 'aria-label');
    popStart.firstChild.outerHTML = icon(t.running ? 'pause' : 'play');
    bind(popStartT, t.running ? 'board.cb.pause' : 'common.start');
    markSelected(row1, (x) => x.dataset.mode === t.mode && (t.mode !== 'down' || Number(x.dataset.sec) === t.total));
  }
  // mỗi giây: chỉ đổi chữ và class của số giờ
  function tick(t) { paintTime(t); }
  return { el, tray, update, tick, openTray, closeTray, isOpen: () => !tray.hidden };
}
