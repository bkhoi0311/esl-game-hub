// Điều phối "bảng thi đua có đề" (v2): nối trạng thái lớp học, thanh lớp, thẻ đề, đồng hồ, hộp thoại với bảng viết.
// main.js chỉ gọi vài hàm ở các khối có chú thích "// v2:".
import { fontMax, bandHeight } from './layout.js';
import { buildDeck } from './tasks.js';
import { createCards } from './cards.js';
import { createClassbar } from './classbar.js';
import { createTimer } from './timer.js';
import { PAPERS } from './sheets.js';
import { openTeamSheet, openScoreSheet } from './deck-sheets.js';
import { openDeckDialog } from './deck-dialog.js';
import * as C from './classroom.js';
import { t, lang, onLang } from './i18n.js';

const STORE = 'board.v2';
const KINDS = ['write', 'missing', 'mc'];
const TIMER_PARAM = { 0: ['off', 0], 30: ['down', 30], 60: ['down', 60], 90: ['down', 90], 120: ['down', 120], up: ['up', 0] };

export function createV2({ board, ui, strokes, relayout, test, query, tools }) {
  // strokes: { clearAll(), clearZone(zid) }  ·  relayout(): tính lại bố cục (dải đề xuất hiện / biến mất)
  const q = query || new URLSearchParams(location.search);
  const stage = document.getElementById('stage');
  let cls = restore() || C.createClassroom(board.zones.length);
  let curG = null;
  let lesson = null;          // bài đang mở từ link #L= (đã giải mã), hoặc null
  let packTeams = null;
  const sheets = tools.sheets;
  let lastLockToast = 0;

  /* ----- lưu tạm (sessionStorage, không lưu nét) ----- */
  function restore() {
    try {
      if (q.get('src')) return null;                // có src thì nạp đề theo link, bỏ bản lưu
      const raw = sessionStorage.getItem(STORE);
      const c = raw ? C.fromJSON(JSON.parse(raw)) : null;
      if (!c) return null;
      if (c.zones.length !== board.zones.length) C.setZoneCount(c, board.zones.length);
      return c;
    } catch (e) { return null; }
  }
  let persistT = 0;
  function persist() {
    clearTimeout(persistT);
    persistT = setTimeout(() => {
      try {
        // đề lấy từ link bài (#L=) không ghi vào storage: tải lại thì đọc lại từ hash
        // chưa có đề thì không ghi gì (test riêng tư P22: sessionStorage rỗng)
        if (!cls.deck || (cls.deck.source && cls.deck.source.type === 'lesson')) { if (sessionStorage.getItem(STORE) !== null) sessionStorage.removeItem(STORE); }
        else sessionStorage.setItem(STORE, JSON.stringify(C.toJSON(cls)));
      } catch (e) { /* bỏ qua */ }
    }, 500);
  }

  /* ----- đồng hồ ----- */
  let lastRun = false, lastEnded = false;
  const speed = test ? Number(q.get('timerSpeed')) || 1 : 1;
  const timer = createTimer({
    speed,
    onTick(st) {
      cls.timer.left = st.left; cls.timer.running = st.running;
      bar.tick(st);
      if (st.running !== lastRun) { lastRun = st.running; bar.update(cls, tstate()); }
    },
    onEnd() {
      C.endTimer(cls);
      lastRun = false;
      ui.toastKey('board.toast.timeUp', null, 3000);
      tools.beep();
      tools.timeup.show();
      refresh();
    },
  });
  const tstate = () => ({ mode: cls.timer.mode, total: cls.timer.total, left: cls.timer.left, running: cls.timer.running });

  /* ----- thẻ đề, thanh lớp ----- */
  const cards = createCards({
    overlay: document.getElementById('overlay'),
    actions: {
      team: (zid) => teamSheet(zid),
      prev: (zid) => { if (C.prevForZone(cls, zid)) { strokes.clearZone(zid); refresh(); } else ui.toastKey('board.toast.firstQ', { n: zid }); },
      next: (zid) => { if (C.nextForZone(cls, zid)) { strokes.clearZone(zid); refresh(); } else ui.toastKey('board.toast.noMore'); },
      verdict: (zid, v) => { C.setVerdict(cls, zid, v); refresh(); },
    },
  });
  let lastTimer = cls.timer.mode !== 'off' ? { mode: cls.timer.mode, total: cls.timer.total } : { mode: 'down', total: 60 };
  function timerSet(mode, sec) {
    if (mode !== 'off') lastTimer = { mode, total: sec };
    C.setTimerConfig(cls, mode, sec); timer.set(mode, sec); lastRun = false; tools.timeup.hide(); refresh();
  }
  const bar = createClassbar({
    tools,
    actions: {
      openDeck: () => openDeck(),
      sharedPrev: () => { if (C.prevShared(cls)) refresh(); },
      sharedNext: () => { if (C.nextShared(cls)) refresh(); else ui.toastKey('board.toast.noMore'); },
      timerSet,
      timerPower() { if (cls.timer.mode === 'off') timerSet(lastTimer.mode, lastTimer.total); else timerSet('off', 0); },
      timerToggle() {
        const st = timer.state();
        if (st.running) { timer.pause(); cls.timer.running = false; lastRun = false; refresh(); return; }
        tools.ensureAudio();
        C.startTimer(cls);
        tools.timeup.hide();
        timer.start();
        lastRun = true;
        refresh();
      },
      timerReset() { timer.reset(); C.resetTimer(cls); lastRun = false; tools.timeup.hide(); refresh(); },
      toggleAnswers: () => { C.setRevealed(cls, !cls.revealed); refresh(); },
      newRound: () => doNewRound(),
      openScore: () => scoreSheet(),
    },
  });
  document.body.insertBefore(bar.el, stage);
  timer.set(cls.timer.mode, cls.timer.total);

  function refresh() {
    if (!cls.zones.some((z) => z.locked)) tools.timeup.hide();
    bar.update(cls, tstate());
    cards.render(cls);
    persist();
  }

  function doNewRound() {
    const r = C.newRound(cls);
    timer.reset();
    lastRun = false;
    tools.timeup.hide();
    strokes.clearAll();
    if (r.end) ui.toastKey('board.toast.noMore');
    refresh();
  }

  /* ----- tấm: đội, nền, điểm ----- */
  function teamSheet(zid) { openTeamSheet(sheets, { cls, zid, packTeams, onChange: refresh }); }
  function scoreSheet() { openScoreSheet(sheets, { cls, ui, onReset() { C.resetScores(cls); refresh(); } }); }

  /* ----- nền viết: do tools.js giữ; v2 chỉ gắn trạng thái nền của từng vùng (cls.zones) vào đó ----- */
  tools.setPaperStore(cls.zones, persist);
  tools.onTimeupDismiss(() => { C.dismissTimeup(cls); refresh(); });
  tools.setCueLang(() => (cls.deck && cls.deck.lang === 'vi' ? 'vi' : 'en'));   // lời nhắc học sinh theo ngôn ngữ của đề
  const autoPaper = (paper) => tools.autoPaper(paper);
  const paintPapers = () => tools.paintPapers();

  /* ----- nạp đề ----- */
  async function loadPack(id) { return (await import('../packs/' + id + '.js')).default; }

  function paperFor(choice) {
    if (choice.paper && PAPERS.some((p) => p.key === choice.paper)) return choice.paper;
    if (choice.subject === 'math') {
      if (choice.mathType === 'graph-point') return 'axes';
      return choice.grade <= 3 ? 'oli' : 'grid';
    }
    if (choice.source.type === 'lib') {
      const lv = (choice.level || '');
      return lv === 'starters' || lv === 'movers' ? 'lines4' : 'blank';
    }
    return 'blank';
  }

  // choice: { subject, source: { type, id, title }, kind, mode, order, count, difficulty, grade, mathType, lang, timer: { mode, total }, paper?, seed? }
  async function loadChoice(choice) {
    let tasks = [], teams = null, title = choice.source.title || '', level = '';
    const seed = choice.seed || ((Date.now() & 0x7fffffff) || 1);
    if (choice.source.type === 'lib' || choice.source.type === 'lesson') {
      let pack;
      if (choice.source.type === 'lesson') {
        if (!lesson) { ui.toastKey('board.toast.noLesson'); return false; }
        pack = lesson.source;
      } else pack = await loadPack(choice.source.id);
      title = pack.title; teams = pack.teams; level = pack.level || '';
      tasks = buildDeck({ source: pack, kind: choice.kind, count: choice.count, order: choice.order, seed, difficulty: choice.difficulty || 1 });
      if (tasks.length && tasks.length < choice.count) ui.toastKey('board.toast.packShort', { n: tasks.length });
    } else if (choice.source.type === 'math') {
      const m = await import('./math/gen.js');
      const r = m.generateMath({ grade: choice.grade, type: choice.mathType, difficulty: choice.difficulty || 2, count: choice.count, seed, lang: choice.lang || 'vi', withOptions: false });
      tasks = r.tasks || r;
      if (r.short) ui.toastKey('board.toast.mathShort', { n: tasks.length });
    }
    if (!tasks.length) { ui.toastKey('board.toast.packEmpty'); return false; }
    if (board.zones.some((z) => z.strokes.length)) {
      const ok = await ui.confirm({ title: 'board.dlg.newDeck.title', body: 'board.dlg.newDeck.body', ok: 'common.start', cancel: 'common.cancel' });
      if (!ok) return false;
    }
    strokes.clearAll();
    packTeams = teams;
    autoPaper(paperFor(Object.assign({ level }, choice)));
    // deck.lang = ngôn ngữ của ĐỀ (quyết định lời nhắc học sinh): gói Anh luôn 'en'; Toán theo lời đề đã chọn.
    const deckLang = choice.source.type === 'math' ? (choice.lang === 'en' ? 'en' : 'vi') : 'en';
    C.applyDeck(cls, { source: Object.assign({}, choice.source, { title }), kind: choice.kind, tasks, mode: choice.mode, order: choice.order, seed, lang: deckLang },
      { teams, timer: choice.timer });
    timer.set(cls.timer.mode, cls.timer.total);
    lastRun = false;
    paintPapers();
    relayout();
    refresh();
    return true;
  }

  async function openDeck() {
    closeSheets();
    const choice = await openDeckDialog({ sheets, lesson: lesson ? { title: lesson.title } : null, prefill: lastPrefill });
    if (!choice) return;
    lastPrefill = { subject: choice.subject, packId: choice.source.id, kind: choice.kind === 'math' ? 'write' : choice.kind, grade: choice.grade, mathType: choice.mathType, difficulty: choice.difficulty, lang: choice.lang, mode: choice.mode, order: choice.order, count: choice.count, timer: choice.timer, langTouched: !!choice.langTouched };
    await loadChoice(choice);
  }
  let lastPrefill = null;
  function closeSheets() { sheets.close(); }

  /* ----- tham số URL (B.v) và link bài (#L=) ----- */
  async function start() {
    if (location.hash.indexOf('#L=') === 0) {
      try {
        const m = await import('./lesson.js');
        const r = await m.readLessonFromHash();
        if (r) lesson = r;
      } catch (e) { ui.toastKey('board.toast.badLink', null, 4000); }
    }
    const src = q.get('src');
    if (!src) return;
    const ch = await choiceFromParams(q);
    if (!ch) {
      if (src === 'lesson' && lesson) { lastPrefill = { subject: 'en', packId: 'lesson' }; await openDeck(); }
      return;
    }
    await loadChoice(ch);
  }
  async function choiceFromParams(p) {
    const src = p.get('src') || '';
    const num = (k, lo, hi, d) => { const v = parseInt(p.get(k), 10); return v >= lo && v <= hi ? v : d; };
    const mode = p.get('mode') === 'split' ? 'split' : 'common';
    let tm = TIMER_PARAM[p.get('timer')];
    if (!tm) tm = mode === 'split' ? ['off', 0] : ['down', 60];
    const base = { mode, order: p.get('order') === 'rand' ? 'rand' : 'seq', count: num('n', 1, 50, 10), timer: { mode: tm[0], total: tm[1] || 60 }, paper: p.get('paper') || '', seed: parseInt(p.get('seed'), 10) || 0, difficulty: num('d', 1, 3, 2) };
    if (src === 'math') {
      const grade = num('grade', 1, 12, 3);
      // Lời đề Toán: tham số `mlang` (KHÔNG dùng `lang`: ClassIn tự gắn lang=en vào mọi liên kết); thiếu thì theo ngôn ngữ giao diện.
      const ml = p.get('mlang') === 'en' ? 'en' : p.get('mlang') === 'vi' ? 'vi' : '';
      let mt = p.get('type') || '';
      try { const m = await import('./math/gen.js'); if (!m.MATH_TYPES[grade].some((x) => x.type === mt)) mt = m.MATH_TYPES[grade][0].type; } catch (e) { return null; }
      return Object.assign(base, { subject: 'math', source: { type: 'math', id: 'math-' + grade, title: t('board.deck.mathTitle', { n: grade }) }, kind: 'math', grade, mathType: mt, lang: ml || lang(), langTouched: !!ml });
    }
    const kind = KINDS.indexOf(p.get('kind')) >= 0 ? p.get('kind') : null;
    if (src === 'lesson') {
      if (!lesson || !kind) return null;
      return Object.assign(base, { subject: 'en', source: { type: 'lesson', id: 'lesson', title: lesson.title }, kind });
    }
    if (src.indexOf('lib:') === 0) {
      const id = src.slice(4);
      if (!/^[a-z0-9-]+$/.test(id)) return null;
      return Object.assign(base, { subject: 'en', source: { type: 'lib', id, title: '' }, kind: kind || 'write' });
    }
    return null;
  }

  // Thanh lớp: ngưỡng 1400 làm mặc định, nhưng bật thu gọn theo PHÉP ĐO khi chữ (tiếng Anh) làm thanh tràn.
  function fitBar() {
    const rootEl = document.documentElement;
    rootEl.classList.toggle('cb-compact', !!curG && curG.W < 1400);
    if (curG && curG.W >= 1400 && bar.el.scrollWidth > bar.el.clientWidth + 1) rootEl.classList.add('cb-compact');
  }
  // Đổi ngôn ngữ giao diện: chỉ chữ đổi (apply() của lõi đã dịch phần có data-i18n). Ở đây vẽ lại chữ do mã dựng (nhãn câu, điểm), đo lại thanh lớp.
  // KHÔNG sinh lại đề, KHÔNG đụng nét / canvas / đồng hồ.
  onLang(() => { refresh(); fitBar(); });

  /* ----- API cho main.js ----- */
  const api = {
    bandH: (s, stageH) => bandHeight(s, stageH, C.hasDeck(cls)),
    layout(g) {   // g = { bands, writes, top, s, W }
      curG = g;
      const n = board.zones.length;
      document.documentElement.style.setProperty('--band-h', (g.bands[0] ? g.bands[0].h : 0) + 'px');   // toast / banner nằm dưới dải đề
      cards.layout({ bands: g.bands, writes: g.writes, top: g.top, s: g.s, fm: fontMax(n, g.s), n });
      refresh();
      fitBar();
    },
    hasDeck: () => C.hasDeck(cls),
    isLocked: (zid) => C.isLocked(cls, zid),
    lockedTouch(zid) {
      const now = Date.now();
      if (cls.hidden && now - lastLockToast > 2500) { lastLockToast = now; ui.toastKey('board.toast.tapStart', null, 2000); }
    },
    // đổi số vùng (main đã dựng lại board.zones): đặt lại điểm, chia lại câu
    zoneCount(n) { C.setZoneCount(cls, n); tools.setPaperStore(cls.zones, persist); timer.reset(); lastRun = false; tools.timeup.hide(); closeSheets(); cards.closeZoom(); },
    start,
    escape() { if (sheets.isOpen()) { sheets.close(); return true; } if (cards.closeZoom()) return true; return bar.closePop(); },
    closeSheets,
    cls: () => cls,
    loadChoice, refresh,
  };
  if (test) window.__v2 = { state: () => C.toJSON(cls), load: loadChoice, cls: () => cls, bandH: () => (curG && curG.bands[0] ? curG.bands[0].h : 0), timer: () => timer.state() };
  return api;
}
