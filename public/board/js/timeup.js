// Lớp "Time’s up!" khi hết giờ + chạm để bỏ. Dùng chung 2 chế độ (Đề tắt / Đề bật). PLAN-BOARD-V21 mục 4.
// Bắt chạm ở pha capture của document: chạm vào vùng viết bị nuốt (không ra nét), sau 600 ms ân hạn thì bỏ lớp phủ.
import { h } from './dom.js';

export const GRACE_MS = 600;
export const SWALLOW_MS = 250;   // sau khi bỏ lớp, nuốt thêm chạm trong vùng viết (ngón thứ hai chạm cùng lúc)

export function createTimeup({ overlay, onDismiss, now }) {
  const clock = now || (() => performance.now());
  let root = null, els = [];
  let visible = false, t0 = 0, swallowUntil = 0, listening = false;

  function onCap(e) {
    const inBoard = !!(e.target && e.target.closest && e.target.closest('#input-layer'));
    const tm = clock();
    if (visible) {
      if (inBoard) e.stopPropagation();
      if (tm - t0 >= GRACE_MS) { hide(); if (onDismiss) onDismiss(); }
    } else if (tm < swallowUntil) {
      if (inBoard) e.stopPropagation();
    } else { detach(); }
  }
  function attach() { if (!listening) { listening = true; document.addEventListener('pointerdown', onCap, true); } }
  function detach() { if (listening) { listening = false; document.removeEventListener('pointerdown', onCap, true); } }

  // writes: vùng viết [{ id, x, y, w, h }]; top: gốc của #overlay. Gắn lại sau mỗi lần ui.layout (nó xoá #overlay).
  function layout(writes, top) {
    if (root) root.remove();
    root = h('div', 'locks', null, { 'data-testid': 'locks' });
    els = writes.map((w) => {
      const e = h('div', 'zone-lock', '<span class="zl-t">Time’s up!</span><span class="zl-s">Chạm để viết tiếp</span>', { 'data-testid': 'z' + w.id + '-lock' });
      e.style.left = w.x + 'px'; e.style.top = (w.y - top) + 'px'; e.style.width = w.w + 'px'; e.style.height = w.h + 'px';
      e.hidden = !visible;
      root.appendChild(e);
      return e;
    });
    overlay.appendChild(root);
  }
  function show() {
    visible = true; t0 = clock(); swallowUntil = 0;
    els.forEach((e) => { e.hidden = false; });
    attach();
  }
  function hide() {
    if (!visible) return;
    visible = false;
    swallowUntil = clock() + SWALLOW_MS;
    els.forEach((e) => { e.hidden = true; });
    setTimeout(() => { if (!visible && clock() >= swallowUntil) detach(); }, SWALLOW_MS + 20);
  }
  return { layout, show, hide, visible: () => visible, isLocked: () => visible };
}
