// Khởi động: đọc tham số, nối các module.
import { BRAND } from './brand.js';
import { calcScale, topHeight, computeZones, parseZones } from './layout.js';
import { createBoard, setZoneRects, clearZone, undo } from './strokes.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createDiag } from './diag.js';
import { createGlass } from './glass.js';
import { createUI } from './ui.js';

const root = document.documentElement;
const q = new URLSearchParams(location.search);
const TEST = q.get('test') === '1';

// 1. thương hiệu + kính (trước khi hiện giao diện, tránh nháy)
const brand = Object.assign({}, BRAND);
if (TEST && q.get('brand') === 'text') brand.logo = false;
if (TEST && q.get('brand') === 'neutral') brand.wordmark = false;
root.style.setProperty('--accent', brand.accent);
root.style.setProperty('--accent-hover', brand.accentHover);
root.classList.add(!brand.wordmark ? 'brand-neutral' : brand.logo ? 'brand-logo' : 'brand-text');
const glass = createGlass(location.search);

// 2. dữ liệu + module
const board = createBoard(parseZones(q.get('zones')));
let S = 1, TOPH = 56, lastKey = '';

const renderer = createRenderer({
  board, ink: document.getElementById('ink'), live: document.getElementById('live'),
  onWindow: (st) => glass.onWindow(st),
});

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
    if (board.zones.some((z) => z.strokes.length)) {
      const ok = await ui.confirm({ title: 'Chia ' + n + ' vùng?', body: 'Đổi số vùng sẽ xoá toàn bộ nét hiện có.', ok: 'Đổi', cancel: 'Huỷ' });
      if (!ok) return;
    }
    input.cancelAll();
    board.zones = createBoard(n).zones;
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
  escape() { if (diag.isOpen()) diag.setOpen(false); },
};

ui = createUI({ board, brand, actions, getS: () => S });

const diag = createDiag({
  onToast: (t) => ui.toast(t),
  getInfo: () => ({
    perf: renderer.perf(), k: renderer.k, canvas: renderer.canvasSize(), dpr: window.devicePixelRatio,
    maxTouchPoints: navigator.maxTouchPoints, W: innerWidth, H: innerHeight, s: S,
    glassText: glass.text(), search: location.search, ua: navigator.userAgent,
  }),
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
  el: document.getElementById('input-layer'), board, getScale: () => S, render: renderer, diag, hooks,
});

// 3. bố cục
function relayout() {
  const W = innerWidth, H = innerHeight, dpr = window.devicePixelRatio || 1;
  const key = [W, H, board.zones.length, dpr].join('x');
  if (key === lastKey) return;
  lastKey = key;
  S = calcScale(W, H);
  TOPH = topHeight(S);
  const rects = computeZones(W, H, board.zones.length, TOPH);
  setZoneRects(board, rects);
  renderer.resize(W, H - TOPH, { x: 0, y: TOPH }, dpr);
  ui.layout(rects, S, TOPH, W);
}
relayout();
window.addEventListener('resize', relayout);
if (window.ResizeObserver) new ResizeObserver(relayout).observe(document.getElementById('stage'));

if (q.get('debug') === '1') diag.setOpen(true);
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
        glass: glass.state.mode, glassReason: glass.state.reason,
        brand: { logo: brand.logo, wordmark: brand.wordmark },
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
  };
}
