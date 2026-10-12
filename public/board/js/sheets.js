// Tấm (sheet) dùng chung của v2: khung hộp thoại, chọn đội, chọn nền, bảng điểm. PLAN-V2 mục C.5, C.6, C.7.
// Quy tắc chạm: chỉ <button> + pressable; nhóm chọn chỉ đổi class is-selected / aria-pressed, không dựng lại nút.
import { h, markSelected } from './dom.js';
import { pressable } from './ui.js';
import { COLORS } from './ui.js';
import * as C from './classroom.js';

export const PAPERS = [
  { key: 'blank', name: 'Trống' },
  { key: 'lines4', name: '4 dòng' },
  { key: 'oli', name: 'Ô li' },
  { key: 'grid', name: 'Lưới' },
  { key: 'axes', name: 'Trục toạ độ' },
];
export const NAME_SETS = [
  { key: 'team', name: 'Team 1–4', names: ['Team 1', 'Team 2', 'Team 3', 'Team 4'] },
  { key: 'colors', name: 'Red / Blue / Green / Yellow', names: ['Red', 'Blue', 'Green', 'Yellow'] },
  { key: 'animals', name: 'Tigers / Pandas / Eagles / Dolphins', names: ['Tigers', 'Pandas', 'Eagles', 'Dolphins'] },
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

/* ---------- chọn đội (C.6) ---------- */
// ctx: { cls, zid, packTeams, onChange() } ; áp tên theo bộ cho mọi vùng, màu chỉ cho vùng zid
export function openTeamSheet(sheets, ctx) {
  const { cls, zid } = ctx;
  const sh = sheets.open({ testid: 'team-sheet', cls: 'sheet--small', title: 'Đội vùng ' + zid });
  const card = sh.card;
  card.appendChild(h('h2', 'sheet-title', 'Đội vùng ' + zid));
  const sets = NAME_SETS.slice();
  if (ctx.packTeams && ctx.packTeams.length) sets.push({ key: 'pack', name: 'Tên trong gói: ' + ctx.packTeams.join(' / '), names: ctx.packTeams });
  const names = groupRow('Bộ tên', sets.map((s) => ({ v: s.key, text: s.name, testid: 'team-set-' + s.key })), (v) => {
    const set = sets.find((x) => x.key === v);
    cls.zones.forEach((z, i) => { z.team = set.names[i] || 'Team ' + (i + 1); });
    names.set(v); ctx.onChange();
  }, { cls: 'drow--wrap' });
  const cur = cls.zones[zid - 1];
  const matching = sets.find((s) => cls.zones.every((z, i) => z.team === (s.names[i] || 'Team ' + (i + 1))));
  names.set(matching ? matching.key : '');
  const cols = COLORS.filter((c) => c.key !== 'white');
  const colors = groupRow('Màu', cols.map((c) => ({ v: c.hex, text: '', html: '<span class="cswatch" style="background:' + c.hex + '"></span>', testid: 'team-color-' + c.key, aria: c.name, cls: 'dopt--sq' })), (v) => {
    cur.color = v; colors.set(v); ctx.onChange();
  });
  colors.set(cur.color);
  card.append(names.row, colors.row);
  const actions = h('div', 'sheet-actions');
  const done = h('button', 'sbtn sbtn--primary', 'Xong', { type: 'button', 'data-testid': 'team-done' });
  pressable(done, () => sh.close());
  actions.appendChild(done);
  card.appendChild(actions);
  return sh;
}

/* ---------- chọn nền (C.7) ---------- */
// ctx: { cls, onApply(zoneIds|'all', paperKey) }
export function openPaperSheet(sheets, ctx) {
  const { cls } = ctx;
  const sh = sheets.open({ testid: 'paper-sheet', cls: 'sheet--small', title: 'Nền viết' });
  const card = sh.card;
  card.appendChild(h('h2', 'sheet-title', 'Nền viết'));
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

/* ---------- bảng điểm (C.5) ---------- */
// ctx: { cls, ui, onReset() }
export function openScoreSheet(sheets, ctx) {
  const { cls } = ctx;
  const sh = sheets.open({ testid: 'score-sheet', cls: 'sheet--small', title: 'Bảng điểm' });
  const card = sh.card;
  card.appendChild(h('h2', 'sheet-title', 'Bảng điểm'));
  const list = h('div', 'score-list', null, { 'data-testid': 'score-list' });
  const t = C.totals(cls);
  const single = cls.zones.length === 1;
  t.rows.forEach((r) => {
    const row = h('div', 'score-row', null, { 'data-testid': 'score-row-' + r.id });
    row.append(h('span', 'score-rank', String(r.rank)));
    const dot = h('i', 'chip-dot'); dot.style.background = r.color;
    row.appendChild(dot);
    const nm = h('span', 'score-name'); nm.textContent = r.team;
    row.appendChild(nm);
    if (r.leader && !single) row.appendChild(h('span', 'score-flag', 'Dẫn đầu'));
    const pts = h('b', 'score-pts', single ? r.score + '/' + r.judged + ' đúng' : String(r.score));
    row.appendChild(pts);
    list.appendChild(row);
  });
  card.appendChild(list);
  const actions = h('div', 'sheet-actions');
  const reset = h('button', 'sbtn sbtn--ghost', 'Đặt lại điểm', { type: 'button', 'data-testid': 'score-reset' });
  const done = h('button', 'sbtn sbtn--primary', 'Đóng', { type: 'button', 'data-testid': 'score-close' });
  pressable(reset, async () => {
    const ok = await ctx.ui.confirm({ title: 'Đặt lại điểm?', body: 'Điểm của mọi đội về 0.', ok: 'Đặt lại', cancel: 'Giữ', danger: true });
    if (ok) { ctx.onReset(); sh.close(); }
  });
  pressable(done, () => sh.close());
  actions.append(reset, done);
  card.appendChild(actions);
  return sh;
}
