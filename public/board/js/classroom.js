// Trạng thái lớp học của bảng v2: đề, câu của từng vùng, chấm, điểm, đội, đồng hồ (THUẦN, không DOM). PLAN-V2 mục D.2.
export const TEAM_COLORS = ['#FF4D4F', '#4DABF7', '#40C057', '#FF922B'];
export const PERMS = [[0, 1, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];   // đảo A/B/C theo vùng ở Đề chung
const IDENT = [0, 1, 2];

function newZone(i) {
  return {
    id: i, task: null, history: [], verdict: null, score: 0, judged: 0,
    team: 'Team ' + i, color: TEAM_COLORS[(i - 1) % TEAM_COLORS.length],
    paper: 'blank', paperManual: false, locked: false, shown: false, optOrder: IDENT.slice(),
  };
}

export function createClassroom(nZones) {
  const zones = [];
  for (let i = 1; i <= nZones; i++) zones.push(newZone(i));
  return {
    deck: null, shared: 0, used: new Set(), zones, revealed: false, hidden: false,
    timer: { mode: 'off', total: 60, left: 60, running: false }, round: 1,
  };
}

export const hasDeck = (cls) => !!(cls.deck && cls.deck.tasks.length);
export const total = (cls) => (cls.deck ? cls.deck.tasks.length : 0);
export const isCommon = (cls) => !!cls.deck && cls.deck.mode === 'common';
export const zoneOf = (cls, zid) => cls.zones[zid - 1];
export function taskIndex(cls, zid) { const z = zoneOf(cls, zid); return z ? z.task : null; }
export function taskOf(cls, zid) {
  const z = zoneOf(cls, zid);
  return z && cls.deck && z.task != null ? cls.deck.tasks[z.task] || null : null;
}

function updateOrders(cls) {
  cls.zones.forEach((z, i) => {
    const t = cls.deck && z.task != null ? cls.deck.tasks[z.task] : null;
    z.optOrder = t && t.options && isCommon(cls) ? PERMS[i % PERMS.length].slice() : IDENT.slice();
  });
}

function computeHidden(cls) { return isCommon(cls) && cls.timer.mode === 'down'; }

function clearJudging(cls) {
  cls.revealed = false;
  cls.zones.forEach((z) => { z.verdict = null; z.shown = false; });
}

// Nạp đề mới. opts: { teams: [tên], timer: { mode, total }, paper }
export function applyDeck(cls, deck, opts) {
  const o = opts || {};
  cls.deck = deck;
  cls.deckSeq = (cls.deckSeq || 0) + 1;   // đổi đề: thẻ phải vẽ lại dù chỉ số câu không đổi
  cls.shared = 0;
  cls.used = new Set();
  cls.round = 1;
  cls.zones.forEach((z, i) => {
    z.history = []; z.score = 0; z.judged = 0; z.locked = false; z.verdict = null; z.shown = false;
    z.task = null;
    if (o.teams && o.teams.length) z.team = o.teams[i] || 'Team ' + (i + 1);
  });
  cls.revealed = false;
  if (o.timer) cls.timer = { mode: o.timer.mode, total: o.timer.total, left: o.timer.total, running: false };
  if (deck.mode === 'common') cls.zones.forEach((z) => { z.task = deck.tasks.length ? 0 : null; });
  else cls.zones.forEach((z, i) => { if (i < deck.tasks.length) { z.task = i; z.history = [i]; cls.used.add(i); } });
  cls.hidden = computeHidden(cls);
  updateOrders(cls);
}

// ----- đổi câu -----
export function nextShared(cls) {
  if (!isCommon(cls) || cls.shared + 1 >= total(cls)) return false;
  cls.shared++;
  cls.zones.forEach((z) => { z.task = cls.shared; });
  clearJudging(cls);
  updateOrders(cls);
  return true;
}
export function prevShared(cls) {
  if (!isCommon(cls) || cls.shared <= 0) return false;
  cls.shared--;
  cls.zones.forEach((z) => { z.task = cls.shared; });
  clearJudging(cls);
  updateOrders(cls);
  return true;
}
function firstUnused(cls) {
  for (let i = 0; i < total(cls); i++) if (!cls.used.has(i)) return i;
  return -1;
}
// Chia câu: vùng sang câu chưa dùng kế tiếp. false nếu hết câu.
export function nextForZone(cls, zid) {
  if (!cls.deck || isCommon(cls)) return false;
  const z = zoneOf(cls, zid);
  const k = firstUnused(cls);
  if (!z || k < 0) return false;
  cls.used.add(k);
  z.history.push(k);
  z.task = k;
  z.verdict = null; z.shown = false;
  updateOrders(cls);
  return true;
}
export function prevForZone(cls, zid) {
  if (!cls.deck || isCommon(cls)) return false;
  const z = zoneOf(cls, zid);
  if (!z || z.history.length < 2) return false;
  z.history.pop();
  z.task = z.history[z.history.length - 1];
  z.verdict = null; z.shown = false;
  updateOrders(cls);
  return true;
}

// Lượt mới: giữ điểm, xoá kết quả chấm, tắt đáp án, đặt lại đồng hồ, sang câu kế. Trả { end } (true: hết đề, giữ câu cuối).
export function newRound(cls) {
  let moved = 0;
  if (cls.deck) {
    if (isCommon(cls)) { if (nextShared(cls)) moved = 1; }
    else cls.zones.forEach((z) => { if (nextForZone(cls, z.id)) moved++; });
  }
  clearJudging(cls);
  cls.round++;
  resetTimer(cls);
  return { end: !!cls.deck && moved === 0 };
}

// ----- đáp án, chấm -----
export function setRevealed(cls, on) {
  cls.revealed = !!on;
  cls.zones.forEach((z) => { z.shown = !!on && z.task != null; });
}

// Mỗi lượt mỗi vùng chỉ có một kết quả: null | true | false. Bấm lại cùng nút thì bỏ chấm. Điểm = số lượt đúng.
export function setVerdict(cls, zid, v) {
  const z = zoneOf(cls, zid);
  if (!z || z.task == null) return;
  const prev = z.verdict;
  if (prev === v) {
    z.verdict = null; z.judged--;
    if (v === true) z.score--;
  } else {
    if (prev === null) z.judged++;
    if (prev === true) z.score--;
    z.verdict = v;
    if (v === true) z.score++;
  }
}

export function totals(cls) {
  const rows = cls.zones.map((z) => ({ id: z.id, team: z.team, color: z.color, score: z.score, judged: z.judged }));
  rows.sort((a, b) => (b.score - a.score) || (a.id - b.id));
  const top = rows.length ? rows[0].score : 0;
  rows.forEach((r, i) => { r.rank = i > 0 && r.score === rows[i - 1].score ? rows[i - 1].rank : i + 1; r.leader = top > 0 && r.score === top; });
  return { rows, leaders: rows.filter((r) => r.leader).map((r) => r.id), top };
}
export function resetScores(cls) { cls.zones.forEach((z) => { z.score = 0; z.judged = 0; z.verdict = null; }); }

// ----- số vùng -----
export function setZoneCount(cls, n) {
  while (cls.zones.length < n) cls.zones.push(newZone(cls.zones.length + 1));
  cls.zones.length = n;
  cls.zones.forEach((z) => { z.score = 0; z.judged = 0; z.verdict = null; z.shown = false; z.locked = false; z.history = []; z.task = null; });
  cls.revealed = false;
  cls.used = new Set();
  if (cls.deck) {
    const d = cls.deck;
    if (d.mode === 'common') cls.zones.forEach((z) => { z.task = d.tasks.length ? Math.min(cls.shared, d.tasks.length - 1) : null; });
    else cls.zones.forEach((z, i) => { if (i < d.tasks.length) { z.task = i; z.history = [i]; cls.used.add(i); } });
    cls.hidden = computeHidden(cls);
  }
  cls.timer.left = cls.timer.total; cls.timer.running = false;
  updateOrders(cls);
}

// ----- đồng hồ (trạng thái; vòng đếm thật nằm ở timer.js) -----
export function setTimerConfig(cls, mode, sec) {
  const total_ = mode === 'down' ? sec : 0;
  cls.timer = { mode, total: mode === 'down' ? sec : mode === 'up' ? 0 : cls.timer.total, left: total_, running: false };
  if (mode === 'off') cls.timer.left = cls.timer.total;
  cls.zones.forEach((z) => { z.locked = false; });
  cls.hidden = !!cls.deck && computeHidden(cls);
}
export function resetTimer(cls) {
  cls.timer.left = cls.timer.mode === 'down' ? cls.timer.total : cls.timer.mode === 'up' ? 0 : cls.timer.total;
  cls.timer.running = false;
  cls.zones.forEach((z) => { z.locked = false; });
  cls.hidden = !!cls.deck && computeHidden(cls);
}
export function startTimer(cls) {
  cls.hidden = false;
  cls.zones.forEach((z) => { z.locked = false; });
  cls.timer.running = true;
}
export function endTimer(cls) {
  cls.timer.left = 0; cls.timer.running = false;
  cls.zones.forEach((z) => { z.locked = true; });
}
// Chạm để bỏ màn Hết giờ: mở khoá các vùng. Không đổi `hidden`, không đổi đồng hồ (vẫn 00:00).
export function dismissTimeup(cls) { cls.zones.forEach((z) => { z.locked = false; }); }
export function isLocked(cls, zid) {
  const z = zoneOf(cls, zid);
  return !!z && (z.locked || (cls.hidden && !!cls.deck));
}

// ----- lưu tạm (sessionStorage) -----
export function toJSON(cls) {
  return JSON.parse(JSON.stringify({
    v: 1, deck: cls.deck, shared: cls.shared, used: Array.from(cls.used), zones: cls.zones, revealed: cls.revealed,
    hidden: cls.hidden, timer: Object.assign({}, cls.timer, { running: false, left: cls.timer.mode === 'down' ? cls.timer.total : cls.timer.mode === 'up' ? 0 : cls.timer.total }), round: cls.round,
  }));
}
export function fromJSON(o) {
  try {
    if (!o || o.v !== 1 || !Array.isArray(o.zones) || !o.zones.length) return null;
    const cls = createClassroom(o.zones.length);
    cls.deck = o.deck && Array.isArray(o.deck.tasks) ? o.deck : null;
    cls.shared = o.shared | 0;
    cls.used = new Set(o.used || []);
    cls.zones = o.zones.map((z, i) => Object.assign(newZone(i + 1), z));
    cls.revealed = !!o.revealed;
    cls.hidden = !!o.hidden;
    cls.timer = Object.assign(cls.timer, o.timer || {});
    cls.round = o.round | 0 || 1;
    return cls;
  } catch (e) { return null; }
}
