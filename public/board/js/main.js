// Khởi động: đọc tham số, nối các module.
import { BRAND } from './brand.js';
import { calcScale, computeZones, parseZones, splitBands, chromeLayout } from './layout.js';
import { createBoard, setZoneRects, clearZone, undo } from './strokes.js';
import { createTiledRenderer } from './render-tiles.js';
import { INK, parseInkOverrides, inkText } from './ink.js';
import { createInput } from './input.js';
import { createPalmFilter, parsePalmMode } from './palm.js';
import { createDiag } from './diag.js';
import { createUI } from './ui.js';
import { FEATURES } from './features.js';
import { createTools } from './tools.js';
import { parseTheme } from './theme.js';

const root = document.documentElement;
const q = new URLSearchParams(location.search);
const TEST = q.get('test') === '1';
const PALM = createPalmFilter({ mode: parsePalmMode(location.search), ua: navigator.userAgent });
const INKO = parseInkOverrides(location.search);   // chỉ có khoá khi test=1

// 1. thương hiệu (trước khi hiện giao diện, tránh nháy). Kính tắt hẳn: <html class="glass-lite perf-calm"> có sẵn trong index.html
const brand = Object.assign({}, BRAND);
if (TEST && q.get('brand') === 'text') brand.logo = false;
if (TEST && q.get('brand') === 'neutral') brand.wordmark = false;
root.style.setProperty('--accent', brand.accent);
root.style.setProperty('--accent-hover', brand.accentHover);
root.classList.add(!brand.wordmark ? 'brand-neutral' : brand.logo ? 'brand-logo' : 'brand-text');

// 2. dữ liệu + module
const board = createBoard(parseZones(q.get('zones')));
let S = 1, TOPH = 56, lastKey = '';
const forceRows = {};   // W -> true: thanh gộp không đủ chỗ ở bề ngang này, dùng hai hàng
// Phần Đề (v2.js) chỉ được tải khi FEATURES.deck bật: nạp động, không await ở mức tệp.
const NO_DECK = { bandH: () => 0, layout() {}, hasDeck: () => false, isLocked: () => false, lockedTouch() {}, zoneCount() {}, start() {}, escape: () => false };
let deck = NO_DECK;

const renderer = createTiledRenderer({ board, stage: document.getElementById('stage'), ink: INKO });

let ui;
const actions = {
  undo(zid) {
    const zone = board.zones[zid - 1];
    if (!zone) return;
    const a = undo(zone);
    if (!a) { ui.toast('Vùng ' + zid + ' không còn gì để hoàn tác.'); return; }
    renderer.markDirty(zid);
    ui.refreshZone(zone);
  },
  clearZone(zid) {
    const zone = board.zones[zid - 1];
    if (!zone || !clearZone(zone)) return;
    renderer.markDirty(zid);
    ui.refreshZone(zone);
    ui.toast('Đã xoá vùng ' + zid + '. Bấm Hoàn tác để lấy lại.');
  },
  clearAll() {
    for (const zone of board.zones) {
      if (clearZone(zone)) { renderer.markDirty(zone.id); }
    }
    ui.refreshAll();
  },
  async setZones(n) {
    if (n === board.zones.length) return;
    const deckOn = deck.hasDeck();   // có đề thì đặt lại điểm và chia lại câu
    if (deckOn || board.zones.some((z) => z.strokes.length)) {
      const ok = await ui.confirm({ title: 'Chia ' + n + ' vùng?', body: deckOn ? 'Đổi số vùng sẽ đặt lại điểm, chia lại câu và xoá toàn bộ nét hiện có.' : 'Đổi số vùng sẽ xoá toàn bộ nét hiện có.', ok: 'Đổi', cancel: 'Huỷ' });
      if (!ok) return;
    }
    input.cancelAll();
    board.zones = createBoard(n).zones;
    deck.zoneCount(n);
    tools.zoneCount(n);
    lastKey = '';
    relayout();
    renderer.markDirty();
    try {
      const u = new URL(location.href);
      u.searchParams.set('zones', String(n));
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) { /* bỏ qua */ }
  },
  undoNearest() {
    let best = null;
    for (const z of board.zones) if (z.lastUsed > 0 && (!best || z.lastUsed > best.lastUsed)) best = z;
    if (best) actions.undo(best.id);
  },
  escape() { if (deck.escape() || tools.escape()) return; if (diag.isOpen()) diag.setOpen(false); },   // v2: đóng tấm / phóng to / dãy giờ trước
};

ui = createUI({ board, brand, actions, getS: () => S });

// Công cụ luôn có: màu nền bảng, nền kẻ, đồng hồ (khi tắt Đề), lớp Hết giờ, Cắt màn hình
const tools = createTools({ board, ui, renderer, stage: document.getElementById('stage'), overlay: document.getElementById('overlay'), test: TEST, query: q, relayout: () => relayout(), liveStrokes: () => input.liveStrokes(),
  onFit() { const W = innerWidth; if (!forceRows[W] && tools.overflowed()) { forceRows[W] = true; lastKey = ''; relayout(); } } });

const diag = createDiag({
  onToast: (t) => ui.toast(t),
  getInfo: () => ({
    perf: renderer.perf(), k: renderer.k, canvas: renderer.canvasSize(), dpr: window.devicePixelRatio,
    maxTouchPoints: navigator.maxTouchPoints, W: innerWidth, H: innerHeight, s: S,
    search: location.search, ua: navigator.userAgent,
    inkText: inkText(renderer.k, INKO), canvasInfo: renderer.canvasInfo(), counters: renderer.counters(),
    physW: Math.round(innerWidth * (window.devicePixelRatio || 1)), physH: Math.round(innerHeight * (window.devicePixelRatio || 1)),
    palm: PALM.state(),
  }),
  onReset: () => renderer.resetPerf(),
});
document.getElementById('floaters').appendChild(diag.hud);
document.querySelector('[data-testid="brand-label"]').addEventListener('pointerdown', () => diag.labelClick());

// phát hiện "chỉ 1 pointer" (mục 3.1)
const WARN = 'Cửa sổ này có thể chỉ nhận 1 điểm chạm: mỗi lúc chỉ 1 người viết được. Xem Thông tin để biết cách khác.';
let provenMulti = false, toldMulti = false;
const evidenceMulti = () => provenMulti || (diag.st.maxSimul >= 2 && diag.st.cancelsWithOthers === 0);
function evalWarn() {
  if (evidenceMulti()) { ui.hideBanner(); return; }
  if (navigator.maxTouchPoints === 1 || diag.st.cancelsWithOthers >= 2) ui.showBanner(WARN);
}
const hooks = {
  isLocked: (zid) => deck.isLocked(zid) || tools.isLocked(zid),          // khoá vùng (Đề, Hết giờ)
  lockedTouch: (zid) => deck.lockedTouch(zid),
  closeTray: (zid) => ui.closeTray(zid),
  toast: (t) => ui.toast(t),
  onSimul(m) {
    if (m >= 2 && !toldMulti) { toldMulti = true; ui.toast('Đã nhận 2 người viết cùng lúc.'); }
    evalWarn();
  },
  zoneChanged: (zone) => ui.refreshZone(zone),
  onPairUp() { provenMulti = true; evalWarn(); },
  onCancelWithOthers() { evalWarn(); },
};

const input = createInput({
  el: document.getElementById('input-layer'), board, getScale: () => S, render: renderer, diag, hooks, ink: INKO, palm: PALM,
});

// 3. bố cục
function relayout() {
  const W = innerWidth, H = innerHeight, dpr = window.devicePixelRatio || 1;
  const ch = chromeLayout(W, H, FEATURES.deck, !!forceRows[W]);
  const sc = ch.s;
  const barH = ch.barH, top = ch.barH + ch.rowH;                       // thanh trên (+ thanh lớp / hàng công cụ)
  const bandH = deck.bandH(sc, H - top);                                // dải đề (0 khi chưa có đề)
  const key = [W, H, board.zones.length, dpr, bandH, barH, top].join('x');
  if (key === lastKey) return;
  lastKey = key;
  S = sc;
  TOPH = top;
  const rects = computeZones(W, H, board.zones.length, TOPH);
  const sp = splitBands(rects, bandH);                                // tách dải đề / vùng viết
  setZoneRects(board, sp.writes);
  root.style.setProperty('--bar-h', barH + 'px');
  root.classList.toggle('bar-merged', ch.merged);
  root.classList.toggle('bar-compact', ch.compact && !FEATURES.deck);
  renderer.resize(W, H - TOPH, { x: 0, y: TOPH }, dpr);
  ui.layout(sp.writes, S, TOPH, W);
  tools.mount(ch);
  tools.layout({ writes: sp.writes, top: TOPH, s: S, W });
  deck.layout({ bands: sp.bands, writes: sp.writes, top: TOPH, s: S, W });
  // bộ đo tràn: thanh gộp không đủ chỗ thì quay về hai hàng (nhớ theo bề ngang)
  if (ch.merged && !forceRows[W] && tools.overflowed()) { forceRows[W] = true; lastKey = ''; relayout(); }
}
if (parseTheme(q.get('bg')) === 'light') tools.setTheme('light', true);   // trước lần vẽ đầu
relayout();
if (FEATURES.deck) {
  import('./v2.js').then((m) => {
    deck = m.createV2({
      board, ui, tools, test: TEST, query: q, relayout: () => relayout(),
      strokes: {
        clearAll() { input.cancelAll(); for (const z of board.zones) if (clearZone(z)) renderer.markDirty(z.id); ui.refreshAll(); },
        clearZone(zid) { const z = board.zones[zid - 1]; if (z && clearZone(z)) { renderer.markDirty(zid); ui.refreshZone(z); } },
      },
    });
    lastKey = '';
    relayout();
    deck.start();   // nạp đề theo tham số URL / link bài (không chặn khởi động)
  }).catch(() => ui.toast('Không tải được phần Đề.'));
}
window.addEventListener('resize', () => { for (const k in forceRows) if (Number(k) !== innerWidth) delete forceRows[k]; relayout(); });
if (window.ResizeObserver) new ResizeObserver(relayout).observe(document.getElementById('stage'));

if (q.get('debug') === '1') diag.setOpen(true);
if (q.get('debug') === '2') diag.setMini(true);
evalWarn();

// 4. móc kiểm thử
if (TEST) {
  const ready = new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  window.__board = {
    ready,
    state() {
      return {
        zones: board.zones.map((z) => ({
          id: z.id, rect: z.rect, strokeCount: z.strokes.length, undoDepth: z.undo.length,
          tool: z.tool, color: z.color, size: z.size,
        })),
        active: input.activeCount(), maxSimul: diag.st.maxSimul, cancels: diag.st.cancels,
        warning: ui.bannerVisible(), hudOpen: diag.isOpen(), s: S, k: renderer.k,
        brand: { logo: brand.logo, wordmark: brand.wordmark },
        palm: PALM.state(), ink: { k: renderer.k, tile: INK.TILE, filter: !INKO.raw, raw: !!INKO.raw },
      };
    },
    lastStroke(zoneId) {
      const z = board.zones[zoneId - 1];
      const s = z.strokes[z.strokes.length - 1];
      return s ? { realPressure: s.realPressure, points: s.pts.length / 3, size: s.size, color: s.color } : null;
    },
    forceSlowFrames: (ms) => renderer.forceSlowFrames(ms),
    inkPixels: (id) => renderer.inkPixels(id),
    perf: () => renderer.perf(),
    resetPerf: () => renderer.resetPerf(),
    flush: () => renderer.flush(),
    counters: () => renderer.counters(),
    resetCounters: () => renderer.resetCounters(),
    pixelAt: (x, y) => renderer.pixelAt(x, y),
    redrawAll: () => renderer.markDirty(),
    canvasInfo: () => renderer.canvasInfo(),
    fillZone: (zid, n) => {
      const z = board.zones[zid - 1];
      for (let i = 0; i < n; i++) z.strokes.push({ id: -i - 1, zone: zid, color: '#FFFFFF', size: 2, pts: [10, 10, 0.5, 11, 11, 0.5], realPressure: false, bbox: { minX: 10, minY: 10, maxX: 11, maxY: 11 }, done: true, path: null });
    },
    zoneFullNow: (zid) => board.zones[zid - 1].strokes.length,
    theme: () => tools.theme(),
    setTheme: (t) => tools.setTheme(t),
    clock: () => { const c = tools.clock(); return c ? c.timer.state() : null; },
  };
}
