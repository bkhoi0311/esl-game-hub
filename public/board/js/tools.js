// Công cụ luôn có (kể cả khi tắt Đề): màu nền bảng, nền kẻ từng vùng, đồng hồ (khi tắt Đề), lớp Hết giờ, nút Cắt, gắn cụm nút lên thanh.
// PLAN-BOARD-V21 mục 1.4, 2, 3, 4, 6.
import { h } from './dom.js';
import { icon } from './icons.js';
import { pressable } from './ui.js';
import { FEATURES } from './features.js';
import { createSheets, openPaperSheet as openPaperSheetUI } from './sheets.js';
import { applyPaper } from './paper.js';
import { BOARDS, PALETTES, inkMap, remapInk, parseTheme } from './theme.js';
import { createTimer } from './timer.js';
import { createClockUI } from './clockui.js';
import { createTimeup } from './timeup.js';
import { bind } from './i18n.js';

const TIMER_PARAM = { 0: ['off', 0], 30: ['down', 30], 60: ['down', 60], 90: ['down', 90], 120: ['down', 120], up: ['up', 0] };

// deps: { board, ui, renderer, liveStrokes(), stage, overlay, test, query, relayout() }
export function createTools(deps) {
  const { board, ui, renderer, stage, overlay, test, query } = deps;
  const q = query || new URLSearchParams(location.search);
  const sheets = createSheets();
  const root = document.documentElement;

  /* ----- âm báo ----- */
  let audio = null;
  function ensureAudio() {
    try { if (!audio) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) audio = new AC(); } if (audio && audio.state === 'suspended') audio.resume(); } catch (e) { audio = null; }
  }
  function beep() {
    try {
      if (!audio) return;
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 880; o.type = 'sine';
      g.gain.setValueAtTime(0.25, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.3);
      o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.3);
    } catch (e) { /* im lặng khi lỗi */ }
  }

  /* ----- lớp Hết giờ ----- */
  let onDismissHook = null;
  let cueLang = () => 'en';   // ngôn ngữ lời nhắc học sinh trên lớp Hết giờ: theo ngôn ngữ của đề (v2 đăng ký); chưa có đề thì luôn tiếng Anh như trước
const timeup = createTimeup({ overlay, onDismiss: () => { if (onDismissHook) onDismissHook(); }, cueLang: () => cueLang() });

  /* ----- nền kẻ từng vùng (lớp tĩnh trong #stage) ----- */
  // paperStore: mảng { id, paper, paperManual }. Khi bật Đề, v2 gắn cls.zones vào đây (setPaperStore).
  let paperStore = board.zones.map((z) => ({ id: z.id, paper: 'blank', paperManual: false }));
  let paperEls = {};
  let curG = null;
  let onPaperChange = null;
  function buildPapers(g) {
    for (const k in paperEls) paperEls[k].remove();
    paperEls = {};
    g.writes.forEach((w) => {
      const el = document.createElement('div');
      el.className = 'paper'; el.setAttribute('data-testid', 'z' + w.id + '-paper');
      el.style.left = w.x + 'px'; el.style.top = (w.y - g.top) + 'px'; el.style.width = w.w + 'px'; el.style.height = w.h + 'px';
      stage.appendChild(el);
      paperEls[w.id] = el;
    });
    paintPapers();
  }
  function paintPapers() {
    if (!curG) return;
    curG.writes.forEach((w) => {
      const el = paperEls[w.id];
      const z = paperStore[w.id - 1];
      if (el && z) applyPaper(el, z.paper, w, curG.s, theme);
    });
  }
  function autoPaper(paper) { paperStore.forEach((z) => { if (!z.paperManual) z.paper = paper; }); }
  function setPaperStore(arr, onChange) { paperStore = arr; onPaperChange = onChange || null; paintPapers(); }

  /* ----- màu nền bảng ----- */
  let theme = 'dark';
  function setTheme(t, silent) {
    t = parseTheme(t);
    if (t === theme) return false;
    const old = theme;
    theme = t;
    remapInk(board, inkMap(old, t), deps.liveStrokes ? deps.liveStrokes() : null);
    renderer.setBoardColor(BOARDS[t].bg, BOARDS[t].rgb);
    ui.setPalette(PALETTES[t]);
    root.setAttribute('data-board', t);
    paintPapers();
    if (!silent) {
      try {
        const u = new URL(location.href);
        if (t === 'light') u.searchParams.set('bg', 'light'); else u.searchParams.delete('bg');
        history.replaceState(null, '', u.pathname + u.search + u.hash);
      } catch (e) { /* bỏ qua */ }
    }
    return true;
  }

  /* ----- tấm Nền ----- */
  function openPaperSheet() {
    sheets.close();
    openPaperSheetUI(sheets, {
      cls: { zones: paperStore },
      theme,
      onTheme: (t) => setTheme(t),
      onApply(target, kind) {
        const ids = target === 'all' ? paperStore.map((z) => z.id) : [target];
        ids.forEach((id) => { const z = paperStore[id - 1]; if (z) { z.paper = kind; z.paperManual = true; } });
        paintPapers();
        if (onPaperChange) onPaperChange();
      },
    });
  }

  /* ----- Cắt màn hình (nạp lười) ----- */
  let snipMod = null, snipBusy = false;
  async function openSnip() {
    if (snipBusy) return;
    snipBusy = true;
    try {
      sheets.close(); clockUIs.forEach((c) => c.closeTray());
      if (!snipMod) snipMod = await import('./snip.js');
      snipMod.startSnip({ renderer, board, ui, getTheme: () => theme, getPapers: () => paperStore, getScale: () => (curG ? curG.s : 1), test });
    } catch (e) { ui.toastKey('board.toast.snipOpenFail'); } finally { snipBusy = false; }
  }

  /* ----- nút công cụ (dùng cho cụm trên thanh và cho thanh lớp khi bật Đề) ----- */
  function toolBtn(kind) {
    const spec = kind === 'paper'
      ? { tid: 'paper-open', ic: 'grid-3x3', label: 'board.cb.paperAria', text: 'board.cb.paper', fn: openPaperSheet }
      : { tid: 'snip-open', ic: 'scissors', label: 'board.tool.snipAria', text: 'board.tool.snip', fn: openSnip };
    const b = h('button', 'cbtn tt-btn', icon(spec.ic) + '<span class="cb-text"></span>', { type: 'button', 'data-testid': spec.tid });
    bind(b, spec.label, null, 'aria-label');
    bind(b.querySelector('.cb-text'), spec.text);
    pressable(b, spec.fn);
    return b;
  }
  const clockUIs = [];

  /* ----- đồng hồ khi tắt Đề ----- */
  let cluster = null, clock = null;
  const clockState = { last: { mode: 'down', total: 60 } };
  if (!FEATURES.deck) {
    const speed = test ? Number(q.get('timerSpeed')) || 1 : 1;
    let lastRun = false;
    const timer = createTimer({
      speed,
      onTick(st) {
        ui2.tick(st);
        if (st.running !== lastRun) { lastRun = st.running; ui2.update(st); }
      },
      onEnd() {
        lastRun = false;
        ui2.update(timer.state());
        ui.toastKey('board.toast.timeUp', null, 3000);
        beep();
        timeup.show();
      },
    });
    const actions = {
      toggle() {
        const st = timer.state();
        if (st.mode === 'off') { timer.set(clockState.last.mode, clockState.last.total); }
        else { timer.set('off', 0); timeup.hide(); }
        lastRun = false; ui2.update(timer.state()); fit();
      },
      set(mode, sec) {
        if (mode !== 'off') clockState.last = { mode, total: sec };
        timer.set(mode, sec); timeup.hide(); lastRun = false; ui2.update(timer.state()); fit();
      },
      startPause() {
        const st = timer.state();
        if (st.mode === 'off') return;
        if (st.running) { timer.pause(); lastRun = false; ui2.update(timer.state()); return; }
        ensureAudio(); timeup.hide();
        timer.start(); lastRun = true; ui2.update(timer.state());
      },
      reset() { timer.reset(); timeup.hide(); lastRun = false; ui2.update(timer.state()); },
    };
    const fit = () => { if (deps.onFit) deps.onFit(); };   // cụm đổi bề rộng (bật / tắt đồng hồ): đo lại tràn của thanh gộp
    const ui2 = createClockUI({ actions });
    clockUIs.push(ui2);
    clock = { timer, ui: ui2 };
    ui2.update(timer.state());
    const tp = q.get('timer');
    if (tp != null && TIMER_PARAM[tp]) { const m = TIMER_PARAM[tp]; if (m[0] !== 'off') clockState.last = { mode: m[0], total: m[1] || 60 }; timer.set(m[0], m[1]); ui2.update(timer.state()); }

    cluster = h('div', 'tools-grp', null, { 'data-testid': 'tools-grp' });
    const sep = h('i', 'cb-sep');
    const kids = [toolBtn('paper')];
    if (FEATURES.snip) kids.push(toolBtn('snip'));
    kids.push(sep, ui2.el);
    kids.forEach((k) => cluster.appendChild(k));
  }

  /* ----- hàng công cụ thứ hai (cửa sổ hẹp) ----- */
  let toolrow = null;
  function ensureToolrow() {
    if (toolrow) return toolrow;
    toolrow = h('div', 'pane pane--bar', null, { id: 'toolrow', 'data-testid': 'toolrow', role: 'toolbar' });
    bind(toolrow, 'board.tools.bar', null, 'aria-label');
    toolrow.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    document.body.insertBefore(toolrow, stage);
    return toolrow;
  }

  // Gắn cụm vào thanh gộp hoặc hàng thứ hai. ch = chromeLayout(...)
  function mount(ch) {
    if (!cluster) return;
    const host = ch.merged ? document.querySelector('[data-testid="tb-mid"]') : ensureToolrow();
    if (cluster.parentNode !== host) { clockUIs.forEach((c) => c.closeTray()); host.appendChild(cluster); }
    if (toolrow) toolrow.hidden = ch.merged;
  }
  // Bộ đo tràn: thanh gộp không đủ chỗ?
  function overflowed() {
    if (!cluster || !cluster.parentNode || cluster.parentNode.getAttribute('data-testid') !== 'tb-mid') return false;
    const left = document.querySelector('.tb-left'), mid = cluster.parentNode, bar = document.getElementById('topbar');
    return left.scrollWidth > left.clientWidth + 1 || mid.scrollWidth > mid.clientWidth + 1 || bar.scrollWidth > bar.clientWidth + 1;
  }

  /* ----- bố cục ----- */
  // g = { writes, top, s, W }; gọi sau ui.layout (ui.layout xoá #overlay)
  function layout(g) {
    curG = g;
    buildPapers(g);
    timeup.layout(g.writes, g.top);
  }

  function zoneCount(n) {   // sửa tại chỗ để giữ nguyên mảng nếu v2 đã gắn cls.zones vào
    while (paperStore.length < n) paperStore.push({ id: paperStore.length + 1, paper: 'blank', paperManual: false });
    paperStore.length = n;
    paperStore.forEach((z, i) => { z.id = i + 1; });
    timeup.hide();
  }
  function escape() {
    if (sheets.isOpen()) { sheets.close(); return true; }
    let any = false;
    clockUIs.forEach((c) => { any = c.closeTray() || any; });
    if (snipMod && snipMod.isOpen && snipMod.isOpen()) { snipMod.cancel(); return true; }
    return any;
  }

  const api = {
    sheets, timeup, ensureAudio, beep, toolBtn, mount, overflowed, layout, escape, zoneCount,
    autoPaper, paintPapers, openPaperSheet, openSnip, setPaperStore, getPaperStore: () => paperStore,
    setTheme, theme: () => theme,
    registerClockUI(c) { clockUIs.push(c); },
    onTimeupDismiss(fn) { onDismissHook = fn; },
    setCueLang(fn) { cueLang = fn; },
    isLocked: () => timeup.isLocked(),
    clock: () => clock,
  };
  return api;
}
