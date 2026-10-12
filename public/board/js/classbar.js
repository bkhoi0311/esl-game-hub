// Thanh lớp học (dải thứ hai dưới thanh trên): Chọn đề, Nền | ‹ Câu 3/15 › | đồng hồ | Đáp án, Lượt mới, Điểm. PLAN-V2 mục C.1.
import { h, markSelected } from './dom.js';
import { icon } from './icons.js';
import { pressable } from './ui.js';
import { fmtClock } from './timer.js';
import * as C from './classroom.js';

const QUICK = [['30', 'down', 30], ['60', 'down', 60], ['90', 'down', 90], ['120', 'down', 120], ['up', 'up', 0], ['off', 'off', 0]];
const QUICK_LABEL = { 30: '30', 60: '60', 90: '90', 120: '120', up: 'Bấm giờ', off: 'Tắt' };

// actions: { openDeck, openPaper, sharedPrev, sharedNext, timerSet(mode, sec), timerToggle, timerReset, toggleAnswers, newRound, openScore }
export function createClassbar({ actions }) {
  const el = h('div', 'pane pane--bar', null, { id: 'classbar', 'data-testid': 'classbar', role: 'toolbar', 'aria-label': 'Thanh lớp học' });
  el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  const b = (cls, tid, ic, label, text) => {
    const x = h('button', 'cbtn ' + cls, icon(ic) + (text ? '<span class="cb-text">' + text + '</span>' : ''), { type: 'button', 'data-testid': tid, 'aria-label': label });
    return x;
  };
  const sep = () => h('i', 'cb-sep');
  const deck = b('', 'deck-open', 'book-open', 'Chọn đề', 'Chọn đề');
  const paper = b('', 'paper-open', 'grid-3x3', 'Nền viết', 'Nền');
  const prev = b('cbtn--sq', 'shared-prev', 'chevron-left', 'Câu trước', '');
  const label = h('span', 'cb-q', '', { 'data-testid': 'shared-label' });
  const next = b('cbtn--sq', 'shared-next', 'chevron-right', 'Câu tiếp', '');
  const nav = h('div', 'cb-grp cb-nav');
  nav.append(prev, label, next);
  const clock = h('button', 'cbtn cb-clock', '', { type: 'button', 'data-testid': 'timer-display', 'aria-label': 'Đồng hồ: chọn thời gian' });
  const start = b('cbtn--primary', 'timer-start', 'play', 'Bắt đầu', '');
  const reset = b('cbtn--sq', 'timer-reset', 'rotate-ccw', 'Đặt lại đồng hồ', '');
  const ans = b('', 'answers-toggle', 'eye', 'Đáp án', 'Đáp án');
  const round = b('', 'new-round', 'refresh-cw', 'Lượt mới', 'Lượt mới');
  const score = b('', 'score-open', 'trophy', 'Bảng điểm', 'Điểm');
  const g1 = h('div', 'cb-grp'); g1.append(deck, paper);
  const g3 = h('div', 'cb-grp'); g3.append(clock, start, reset);
  const g4 = h('div', 'cb-grp cb-end'); g4.append(ans, round, score);
  const s1 = sep(), s2 = sep(), s3 = sep();
  el.append(g1, s1, nav, s2, g3, s3, g4);

  // dãy chọn nhanh thời gian (mở khi bấm vào số giờ)
  const pop = h('div', 'pane pane--tray cb-pop', null, { 'data-testid': 'timer-pop', role: 'group', 'aria-label': 'Chọn thời gian' });
  pop.hidden = true;
  QUICK.forEach((q) => {
    const x = h('button', 'cbtn cbtn--pop', QUICK_LABEL[q[0]], { type: 'button', 'data-testid': 'timer-set-' + q[0] });
    x.dataset.mode = q[1]; x.dataset.sec = String(q[2]);
    pressable(x, () => { pop.hidden = true; actions.timerSet(q[1], q[2]); });
    pop.appendChild(x);
  });
  el.appendChild(pop);

  pressable(deck, () => actions.openDeck());
  pressable(paper, () => actions.openPaper());
  pressable(prev, () => actions.sharedPrev());
  pressable(next, () => actions.sharedNext());
  pressable(clock, () => { pop.hidden = !pop.hidden; });
  pressable(start, () => { pop.hidden = true; actions.timerToggle(); });
  pressable(reset, () => { pop.hidden = true; actions.timerReset(); });
  pressable(ans, () => actions.toggleAnswers());
  pressable(round, () => actions.newRound());
  pressable(score, () => actions.openScore());

  // cls: trạng thái lớp; t: trạng thái đồng hồ { mode, total, left, running }
  function update(cls, t) {
    const has = C.hasDeck(cls), common = has && C.isCommon(cls);
    nav.hidden = !common; s2.hidden = !common;
    ans.hidden = !has; round.hidden = !has; score.hidden = !has; s3.hidden = !has;
    if (common) {
      label.textContent = 'Câu ' + (cls.shared + 1) + '/' + C.total(cls);
      prev.classList.toggle('is-disabled', cls.shared <= 0);
      next.classList.toggle('is-disabled', cls.shared + 1 >= C.total(cls));
    }
    const m = t.mode;
    clock.textContent = m === 'off' ? 'Đồng hồ: Tắt' : fmtClock(t.left);
    clock.classList.toggle('is-off', m === 'off');
    clock.classList.toggle('is-warn', m === 'down' && t.left <= 10 && t.left > 0 && t.running);
    clock.classList.toggle('is-end', m === 'down' && t.left === 0);
    start.hidden = m === 'off'; reset.hidden = m === 'off';
    start.innerHTML = icon(t.running ? 'pause' : 'play') + '<span class="cb-text">' + (t.running ? 'Tạm dừng' : 'Bắt đầu') + '</span>';
    start.setAttribute('aria-label', t.running ? 'Tạm dừng' : 'Bắt đầu');
    ans.classList.toggle('is-selected', !!cls.revealed);
    ans.setAttribute('aria-pressed', cls.revealed ? 'true' : 'false');
    markSelected(pop, (x) => x.dataset.mode === m && (m !== 'down' || Number(x.dataset.sec) === t.total));
  }
  // chỉ cập nhật số giờ (mỗi giây) mà không chạm phần khác
  function tick(t) {
    clock.textContent = t.mode === 'off' ? 'Đồng hồ: Tắt' : fmtClock(t.left);
    clock.classList.toggle('is-warn', t.mode === 'down' && t.left <= 10 && t.left > 0 && t.running);
    clock.classList.toggle('is-end', t.mode === 'down' && t.left === 0);
  }
  // chạm ra ngoài thì đóng dãy chọn giờ
  document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !pop.contains(e.target) && !clock.contains(e.target)) pop.hidden = true; }, true);
  function closePop() { const was = !pop.hidden; pop.hidden = true; return was; }
  return { el, update, tick, closePop };
}
