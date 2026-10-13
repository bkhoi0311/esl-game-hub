// Tấm (sheet) dùng chung của v2: khung hộp thoại, chọn đội, chọn nền, bảng điểm. PLAN-V2 mục C.5, C.6, C.7.
// Quy tắc chạm: chỉ <button> + pressable; nhóm chọn chỉ đổi class is-selected / aria-pressed, không dựng lại nút.
import { h, markSelected } from './dom.js';
import { pressable } from './ui.js';
import { bind, apply } from './i18n.js';

// Tên hiển thị: khoá board.paper.<key>
export const PAPERS = [
  { key: 'blank' },
  { key: 'lines4' },
  { key: 'oli' },
  { key: 'grid' },
  { key: 'axes' },
];

// Khung: một tấm mỗi lúc. Trả { el, card, close }. opts: { testid, cls, titleKey (khoá chuỗi cho aria-label), modal (không đóng khi chạm nền) }
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
    const card = h('div', 'pane pane--sheet sheet ' + (opts.cls || ''), null, { 'data-testid': opts.testid, role: 'dialog', 'aria-modal': 'true' });
    if (opts.titleKey) bind(card, opts.titleKey, null, 'aria-label');
    el.appendChild(card);
    el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    if (!opts.modal) pressable(el, (e) => { if (e.target === el) close(null); });
    document.body.appendChild(el);
    cur = { el, card, onClose: opts.onClose };
    return { el, card, close };
  }
  return { open, close, isOpen: () => !!cur };
}

// Hàng nhóm nút: [nhãn] [nút nút nút]. label: KHOÁ chuỗi của nhãn (hoặc null). o.ariaKey: khoá aria của nhóm (mặc định = label).
// items: [{ v, key, args (khoá chuỗi + tham số) | text (chữ thô, như số 1..12 / tên bộ đội), testid, ariaKey, ariaArgs, html (có thể chứa data-i18n) }]
export function groupRow(label, items, onPick, opts) {
  const o = opts || {};
  const row = h('div', 'drow' + (o.cls ? ' ' + o.cls : ''));
  if (label != null) { const l = h('span', 'dlabel'); bind(l, label); row.appendChild(l); }
  const grp = h('div', 'dgroup', null, { role: 'group' });
  if (o.ariaKey || label) bind(grp, o.ariaKey || label, null, 'aria-label');
  items.forEach((it) => {
    const b = h('button', 'dopt' + (it.cls ? ' ' + it.cls : ''), it.html != null ? it.html : null, { type: 'button', 'data-testid': it.testid, 'aria-pressed': 'false' });
    if (it.html != null) apply(b);
    else if (it.key) bind(b, it.key, it.args);
    else b.textContent = it.text;
    if (it.ariaKey) bind(b, it.ariaKey, it.ariaArgs, 'aria-label');
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
  const sh = sheets.open({ testid: 'paper-sheet', cls: 'sheet--small', titleKey: 'board.cb.paperAria' });
  const card = sh.card;
  card.appendChild(bind(h('h2', 'sheet-title'), 'board.cb.paperAria'));
  // Màu bảng: một màu cho cả bảng (PLAN-BOARD-V21 mục 2)
  let boardRow = null;
  if (ctx.onTheme) {
    const sw = (bg, ring) => '<span class="cswatch cswatch--board" style="background:' + bg + ';box-shadow:inset 0 0 0 2px ' + ring + '"></span>';
    boardRow = groupRow('board.sheet.boardColor', [
      { v: 'dark', html: sw('#121212', 'rgba(255,255,255,.45)') + '<span data-i18n="board.theme.dark"></span>', testid: 'board-dark', cls: 'dopt--board' },
      { v: 'light', html: sw('#FFFFFF', 'rgba(0,0,0,.35)') + '<span data-i18n="board.theme.light"></span>', testid: 'board-light', cls: 'dopt--board' },
    ], (v) => { ctx.onTheme(v); boardRow.set(v); }, { cls: 'drow--wrap' });
    boardRow.set(ctx.theme || 'dark');
    boardRow.row.appendChild(bind(h('span', 'dhint'), 'board.sheet.boardHint'));
    card.appendChild(boardRow.row);
  }
  let target = 'all';
  const tItems = [{ v: 'all', key: 'board.sheet.allZones', testid: 'paper-target-all' }].concat(cls.zones.map((z) => ({ v: z.id, key: 'board.sheet.zone', args: { n: z.id }, testid: 'paper-target-' + z.id })));
  const tg = groupRow('board.sheet.applyTo', tItems, (v) => { target = v; tg.set(v); refresh(); }, { cls: 'drow--wrap' });
  tg.set('all');
  const pg = groupRow('board.sheet.paper', PAPERS.map((p) => ({ v: p.key, key: 'board.paper.' + p.key, testid: 'paper-' + p.key })), (v) => {
    ctx.onApply(target, v); refresh();
  }, { cls: 'drow--wrap' });
  function refresh() {
    const ks = target === 'all' ? cls.zones.map((z) => z.paper) : [cls.zones[target - 1].paper];
    pg.set(ks.every((k) => k === ks[0]) ? ks[0] : '');
  }
  refresh();
  card.append(tg.row, pg.row);
  const actions = h('div', 'sheet-actions');
  const done = bind(h('button', 'sbtn sbtn--primary', null, { type: 'button', 'data-testid': 'paper-done' }), 'common.done');
  pressable(done, () => sh.close());
  actions.appendChild(done);
  card.appendChild(actions);
  return sh;
}

