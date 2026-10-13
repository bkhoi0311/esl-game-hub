// Tấm của phần Đề (chỉ tải khi bật Đề): chọn đội, bảng điểm. Tách từ sheets.js để khi tắt Đề không kéo classroom.js.
import { h } from './dom.js';
import { pressable, COLORS } from './ui.js';
import { groupRow } from './sheets.js';
import * as C from './classroom.js';

export const NAME_SETS = [
  { key: 'team', name: 'Team 1–4', names: ['Team 1', 'Team 2', 'Team 3', 'Team 4'] },
  { key: 'colors', name: 'Red / Blue / Green / Yellow', names: ['Red', 'Blue', 'Green', 'Yellow'] },
  { key: 'animals', name: 'Tigers / Pandas / Eagles / Dolphins', names: ['Tigers', 'Pandas', 'Eagles', 'Dolphins'] },
];

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
  const cols = COLORS.filter((c, i) => i > 0);
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
