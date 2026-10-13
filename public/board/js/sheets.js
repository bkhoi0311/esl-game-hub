// Tấm (sheet) dùng chung của v2: khung hộp thoại, chọn đội, chọn nền, bảng điểm. PLAN-V2 mục C.5, C.6, C.7.
// Quy tắc chạm: chỉ <button> + pressable; nhóm chọn chỉ đổi class is-selected / aria-pressed, không dựng lại nút.
import { h, markSelected } from './dom.js';
import { pressable } from './ui.js';

export const PAPERS = [
  { key: 'blank', name: 'Trống' },
  { key: 'lines4', name: '4 dòng' },
  { key: 'oli', name: 'Ô li' },
  { key: 'grid', name: 'Lưới' },
  { key: 'axes', name: 'Trục toạ độ' },
];

// Khung: một tấm mỗi lúc. Trả { el, card, close }. opts: { testid, cls, title, modal (không đóng khi chạm nền) }
export function createSheets() {
  let cur = null;
  function close(result) {
    if (!cur) return;
    const c = cur; cur = null;
    c.el.remove();
    if (c.onClose) c.onClose(result);
  }
  function open(opts) {
    if (cur) close();
    const el = h('div', 'dim dim--below', null, { 'data-testid': opts.testid + '-dim' });
    const card = h('div', 'pane pane--sheet sheet ' + (opts.cls || ''), null, { 'data-testid': opts.testid, role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || '' });
    el.appendChild(card);
    el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    if (!opts.modal) pressable(el, (e) => { if (e.target === el) close(null); });
    document.body.appendChild(el);
    cur = { el, card, onClose: opts.onClose };
    return { el, card, close };
  }
  return { open, close, isOpen: () => !!cur };
}

// Hàng nhóm nút: [nhãn] [nút nút nút]. items: [{ v, text, testid, aria, html }]
export function groupRow(label, items, onPick, opts) {
  const o = opts || {};
  const row = h('div', 'drow' + (o.cls ? ' ' + o.cls : ''));
  if (label != null) row.appendChild(h('span', 'dlabel', label));
  const grp = h('div', 'dgroup', null, { role: 'group', 'aria-label': o.aria || label || '' });
  items.forEach((it) => {
    const b = h('button', 'dopt' + (it.cls ? ' ' + it.cls : ''), it.html != null ? it.html : null, { type: 'button', 'data-testid': it.testid, 'aria-pressed': 'false' });
    if (it.html == null) b.textContent = it.text;
    if (it.aria) b.setAttribute('aria-label', it.aria);
    b.dataset.v = String(it.v);
    if (it.style) b.style.cssText = it.style;
    pressable(b, () => onPick(it.v, b));
    grp.appendChild(b);
  });
  row.appendChild(grp);
  const ctl = {
    row, grp,
    set(v) { markSelected(grp, (b) => b.dataset.v === String(v)); },
  };
  return ctl;
}

/* ---------- chọn nền (C.7) ---------- */
// ctx: { cls: { zones: [{ id, paper }] }, theme, onTheme(key), onApply(zoneIds|'all', paperKey) }
export function openPaperSheet(sheets, ctx) {
  const { cls } = ctx;
  const sh = sheets.open({ testid: 'paper-sheet', cls: 'sheet--small', title: 'Nền viết' });
  const card = sh.card;
  card.appendChild(h('h2', 'sheet-title', 'Nền viết'));
  // Màu bảng: một màu cho cả bảng (PLAN-BOARD-V21 mục 2)
  let boardRow = null;
  if (ctx.onTheme) {
    const sw = (bg, ring) => '<span class="cswatch cswatch--board" style="background:' + bg + ';box-shadow:inset 0 0 0 2px ' + ring + '"></span>';
    boardRow = groupRow('Màu bảng', [
      { v: 'dark', text: '', html: sw('#121212', 'rgba(255,255,255,.45)') + '<span>Đen</span>', testid: 'board-dark', cls: 'dopt--board' },
      { v: 'light', text: '', html: sw('#FFFFFF', 'rgba(0,0,0,.35)') + '<span>Trắng</span>', testid: 'board-light', cls: 'dopt--board' },
    ], (v) => { ctx.onTheme(v); boardRow.set(v); }, { cls: 'drow--wrap' });
    boardRow.set(ctx.theme || 'dark');
    boardRow.row.appendChild(h('span', 'dhint', 'Áp cho cả bảng'));
    card.appendChild(boardRow.row);
  }
  let target = 'all';
  const tItems = [{ v: 'all', text: 'Tất cả vùng', testid: 'paper-target-all' }].concat(cls.zones.map((z) => ({ v: z.id, text: 'Vùng ' + z.id, testid: 'paper-target-' + z.id })));
  const tg = groupRow('Áp cho', tItems, (v) => { target = v; tg.set(v); refresh(); }, { cls: 'drow--wrap' });
  tg.set('all');
  const pg = groupRow('Nền', PAPERS.map((p) => ({ v: p.key, text: p.name, testid: 'paper-' + p.key })), (v) => {
    ctx.onApply(target, v); refresh();
  }, { cls: 'drow--wrap' });
  function refresh() {
    const ks = target === 'all' ? cls.zones.map((z) => z.paper) : [cls.zones[target - 1].paper];
    pg.set(ks.every((k) => k === ks[0]) ? ks[0] : '');
  }
  refresh();
  card.append(tg.row, pg.row);
  const actions = h('div', 'sheet-actions');
  const done = h('button', 'sbtn sbtn--primary', 'Xong', { type: 'button', 'data-testid': 'paper-done' });
  pressable(done, () => sh.close());
  actions.appendChild(done);
  card.appendChild(actions);
  return sh;
}

