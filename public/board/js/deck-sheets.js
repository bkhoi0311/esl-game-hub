// Tấm của phần Đề (chỉ tải khi bật Đề): chọn đội, bảng điểm. Tách từ sheets.js để khi tắt Đề không kéo classroom.js.
import { h } from './dom.js';
import { pressable, COLORS, colorKey } from './ui.js';
import { bind } from './i18n.js';
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
  const sh = sheets.open({ testid: 'team-sheet', cls: 'sheet--small' });
  bind(sh.card, 'board.card.team', { n: zid }, 'aria-label');
  const card = sh.card;
  card.appendChild(bind(h('h2', 'sheet-title'), 'board.card.team', { n: zid }));
  const sets = NAME_SETS.slice();
  // Tên bộ đội (Team 1–4, Red / Blue…, tên trong gói) là dữ liệu: không dịch. Chỉ nút "Tên trong gói" có phần nhãn dịch được.
  if (ctx.packTeams && ctx.packTeams.length) sets.push({ key: 'pack', packKey: 'board.sheet.packNames', args: { names: ctx.packTeams.join(' / ') }, names: ctx.packTeams });
  const names = groupRow('board.sheet.nameSet', sets.map((s) => (s.packKey ? { v: s.key, key: s.packKey, args: s.args, testid: 'team-set-' + s.key } : { v: s.key, text: s.name, testid: 'team-set-' + s.key })), (v) => {
    const set = sets.find((x) => x.key === v);
    cls.zones.forEach((z, i) => { z.team = set.names[i] || 'Team ' + (i + 1); });
    names.set(v); ctx.onChange();
  }, { cls: 'drow--wrap' });
  const cur = cls.zones[zid - 1];
  const matching = sets.find((s) => cls.zones.every((z, i) => z.team === (s.names[i] || 'Team ' + (i + 1))));
  names.set(matching ? matching.key : '');
  const cols = COLORS.filter((c, i) => i > 0);
  const colors = groupRow('board.sheet.color', cols.map((c) => ({ v: c.hex, html: '<span class="cswatch" style="background:' + c.hex + '"></span>', testid: 'team-color-' + c.key, ariaKey: colorKey(c), cls: 'dopt--sq' })), (v) => {
    cur.color = v; colors.set(v); ctx.onChange();
  });
  colors.set(cur.color);
  card.append(names.row, colors.row);
  const actions = h('div', 'sheet-actions');
  const done = bind(h('button', 'sbtn sbtn--primary', null, { type: 'button', 'data-testid': 'team-done' }), 'common.done');
  pressable(done, () => sh.close());
  actions.appendChild(done);
  card.appendChild(actions);
  return sh;
}

/* ---------- bảng điểm (C.5) ---------- */
// ctx: { cls, ui, onReset() }
export function openScoreSheet(sheets, ctx) {
  const { cls } = ctx;
  const sh = sheets.open({ testid: 'score-sheet', cls: 'sheet--small', titleKey: 'board.cb.scoreAria' });
  const card = sh.card;
  card.appendChild(bind(h('h2', 'sheet-title'), 'board.cb.scoreAria'));
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
    if (r.leader && !single) row.appendChild(bind(h('span', 'score-flag'), 'board.score.leader'));
    const pts = h('b', 'score-pts');
    if (single) bind(pts, 'board.score.correct', { s: r.score, j: r.judged }); else pts.textContent = String(r.score);
    row.appendChild(pts);
    list.appendChild(row);
  });
  card.appendChild(list);
  const actions = h('div', 'sheet-actions');
  const reset = bind(h('button', 'sbtn sbtn--ghost', null, { type: 'button', 'data-testid': 'score-reset' }), 'board.score.reset');
  const done = bind(h('button', 'sbtn sbtn--primary', null, { type: 'button', 'data-testid': 'score-close' }), 'common.close');
  pressable(reset, async () => {
    const ok = await ctx.ui.confirm({ title: 'board.dlg.resetScore.title', body: 'board.dlg.resetScore.body', ok: 'board.dlg.resetScore.ok', cancel: 'board.dlg.resetScore.cancel', danger: true });
    if (ok) { ctx.onReset(); sh.close(); }
  });
  pressable(done, () => sh.close());
  actions.append(reset, done);
  card.appendChild(actions);
  return sh;
}
