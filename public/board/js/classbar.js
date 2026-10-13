// Thanh lớp học (dải thứ hai dưới thanh trên, chỉ khi bật Đề): Chọn đề, Nền, Cắt | ‹ Câu 3/15 › | đồng hồ | Đáp án, Lượt mới, Điểm. PLAN-V2 mục C.1, PLAN-BOARD-V21 mục 3.4.
import { h } from './dom.js';
import { icon } from './icons.js';
import { pressable } from './ui.js';
import { createClockUI } from './clockui.js';
import { FEATURES } from './features.js';
import * as C from './classroom.js';

// actions: { openDeck, sharedPrev, sharedNext, timerSet(mode, sec), timerPower (bật/tắt), timerToggle (chạy/tạm dừng), timerReset, toggleAnswers, newRound, openScore }
// tools: nút Nền và Cắt dùng chung với thanh gộp (tools.js)
export function createClassbar({ actions, tools }) {
  const el = h('div', 'pane pane--bar', null, { id: 'classbar', 'data-testid': 'classbar', role: 'toolbar', 'aria-label': 'Thanh lớp học' });
  el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  const b = (cls, tid, ic, label, text) => {
    const x = h('button', 'cbtn ' + cls, icon(ic) + (text ? '<span class="cb-text">' + text + '</span>' : ''), { type: 'button', 'data-testid': tid, 'aria-label': label });
    return x;
  };
  const sep = () => h('i', 'cb-sep');
  const deck = b('', 'deck-open', 'book-open', 'Chọn đề', 'Chọn đề');
  const paper = tools.toolBtn('paper');
  const snip = FEATURES.snip ? tools.toolBtn('snip') : null;
  const prev = b('cbtn--sq', 'shared-prev', 'chevron-left', 'Câu trước', '');
  const label = h('span', 'cb-q', '', { 'data-testid': 'shared-label' });
  const next = b('cbtn--sq', 'shared-next', 'chevron-right', 'Câu tiếp', '');
  const nav = h('div', 'cb-grp cb-nav');
  nav.append(prev, label, next);
  const clk = createClockUI({ actions: { toggle: () => actions.timerPower(), startPause: () => actions.timerToggle(), reset: () => actions.timerReset(), set: (m, sec) => actions.timerSet(m, sec) } });
  tools.registerClockUI(clk);
  const ans = b('', 'answers-toggle', 'eye', 'Đáp án', 'Đáp án');
  const round = b('', 'new-round', 'refresh-cw', 'Lượt mới', 'Lượt mới');
  const score = b('', 'score-open', 'trophy', 'Bảng điểm', 'Điểm');
  const g1 = h('div', 'cb-grp'); g1.append(deck, paper); if (snip) g1.appendChild(snip);
  const g3 = h('div', 'cb-grp'); g3.appendChild(clk.el);
  const g4 = h('div', 'cb-grp cb-end'); g4.append(ans, round, score);
  const s1 = sep(), s2 = sep(), s3 = sep();
  el.append(g1, s1, nav, s2, g3, s3, g4);

  pressable(deck, () => actions.openDeck());
  pressable(prev, () => actions.sharedPrev());
  pressable(next, () => actions.sharedNext());
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
    clk.update(t);
    ans.classList.toggle('is-selected', !!cls.revealed);
    ans.setAttribute('aria-pressed', cls.revealed ? 'true' : 'false');
  }
  // chỉ cập nhật số giờ (mỗi giây) mà không chạm phần khác
  function tick(t) { clk.tick(t); }
  function closePop() { return clk.closeTray(); }
  return { el, update, tick, closePop };
}
