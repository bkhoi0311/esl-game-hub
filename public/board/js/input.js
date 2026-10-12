// Pointer Events: mỗi pointerId một nét/phiên tẩy, gán vùng lúc down, chống lòng bàn tay, bộ canh pointer treo.
import { zoneAt } from './layout.js';
import {
  beginStroke, addPoint, addPointSplit, endStroke, eraseAt, newEraseSession, commitErase,
  toZoneUnits, zoneScale, zoneFull, touchZone,
} from './strokes.js';

export const PALM_MIN = 48;      // CSS px: điểm chạm có max(width,height) >= ngưỡng bị coi là lòng bàn tay
export const MAX_LIVE = 10;      // trần số nét đang vẽ toàn bảng
export const STALE_MS = 2000;    // pointer không có sự kiện quá lâu thì tự lưu và bỏ
export const ERASE_R = 18;       // bán kính tẩy (CSS px, chưa nhân s)

export function isPalm(e) {
  return e.pointerType === 'touch' && Math.max(e.width || 0, e.height || 0) >= PALM_MIN;
}

export function createInput({ el, board, getScale, render, diag, hooks, perf }) {
  const P = perf || {};
  const active = new Map(); // pointerId -> {kind:'draw'|'erase', zone, stroke|session, type, lastT}

  const rects = () => board.zones.map((z) => ({ id: z.id, ...z.rect }));

  function eraserIntent(zone, e) {
    return zone.tool === 'eraser' || (e.pointerType === 'pen' && (e.buttons & 32) !== 0);
  }

  function eraseHere(a, id, x, y) {
    const z = a.zone;
    const [ux, uy] = toZoneUnits(z, x, y);
    const rCss = ERASE_R * getScale();
    const hit = eraseAt(z, ux, uy, rCss / zoneScale(z), a.session);
    if (hit.length) { if (render.strokesRemoved) render.strokesRemoved(z, hit); else render.markDirty(z.id); }
    render.setRing(id, z, x, y, rCss);
  }

  function drawPoint(a, id, x, y, p, isPen, evtT) {
    const z = a.zone;
    const [ux, uy] = toZoneUnits(z, x, y);
    const res = addPointSplit(z, a.stroke, ux, uy, p, isPen, P.livePts, P.minStep);
    if (res.finished) render.strokeFinished(z, res.finished);
    if (res.stroke !== a.stroke) { a.stroke = res.stroke; }
    render.setLive(id, z, a.stroke, evtT);
  }

  function finish(id, how) {
    const a = active.get(id);
    if (!a) return;
    active.delete(id);
    diag.setActive(active.size);
    if (a.kind === 'erase') {
      commitErase(a.zone, a.session);
      render.clearRing(id);
      hooks.zoneChanged(a.zone);
      return;
    }
    render.clearLive(id);
    if (how === 'drop') return;
    if (how === 'cancel' && a.stroke.pts.length / 3 < 2) return;
    const full = zoneFull(a.zone);
    const s = endStroke(a.zone, a.stroke);
    if (s) render.strokeFinished(a.zone, s);
    else if (full && a.stroke.pts.length >= 3) hooks.toast('Vùng đã đầy, hãy xoá bớt.');
    hooks.zoneChanged(a.zone);
  }

  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button > 0) return;
    if (isPalm(e)) { diag.log('bỏ qua lòng bàn tay w' + e.width + ' h' + e.height); return; }
    if (active.has(e.pointerId)) finish(e.pointerId, 'up');
    if (active.size >= MAX_LIVE) return;
    const zr = zoneAt(rects(), e.clientX, e.clientY);
    const zone = board.zones[zr.id - 1];
    if (hooks.closeTray(zone.id)) return; // chạm này chỉ để đóng khay
    diag.down(e);
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* pointer giả không bắt được */ }
    touchZone(zone);
    const a = { zone, type: e.pointerType, lastT: performance.now() };
    if (eraserIntent(zone, e)) {
      a.kind = 'erase';
      a.session = newEraseSession();
      active.set(e.pointerId, a);
      eraseHere(a, e.pointerId, e.clientX, e.clientY);
    } else {
      if (zoneFull(zone)) { hooks.toast('Vùng đã đầy, hãy xoá bớt.'); return; }
      a.kind = 'draw';
      a.stroke = beginStroke(zone, { color: zone.color, size: zone.size });
      active.set(e.pointerId, a);
      const [ux, uy] = toZoneUnits(zone, e.clientX, e.clientY);
      addPoint(a.stroke, ux, uy, e.pressure, e.pointerType === 'pen', P.minStep);
      render.setLive(e.pointerId, zone, a.stroke, e.timeStamp);
    }
    diag.setActive(active.size);
    hooks.onSimul(diag.st.maxSimul);
  }

  function onMove(e) {
    const a = active.get(e.pointerId);
    if (!a) return;
    a.lastT = performance.now();
    diag.note(e);
    if (isPalm(e)) { finish(e.pointerId, 'drop'); diag.log('huỷ nét: lòng bàn tay'); return; }
    const t0 = performance.now();
    const list = (P.coal !== false && e.getCoalescedEvents) ? e.getCoalescedEvents() : [];
    const pts = list.length ? list : [e];
    const isPen = e.pointerType === 'pen';
    for (const p of pts) {
      if (a.kind === 'erase') eraseHere(a, e.pointerId, p.clientX, p.clientY);
      else drawPoint(a, e.pointerId, p.clientX, p.clientY, p.pressure, isPen, e.timeStamp);
    }
    if (P.predict && a.kind === 'draw' && e.getPredictedEvents && render.setPredict) {
      const pr = e.getPredictedEvents();
      const last = pr.length ? pr[pr.length - 1] : null;
      render.setPredict(e.pointerId, last ? toZoneUnits(a.zone, last.clientX, last.clientY) : null);
    }
    if (diag.moveStat) diag.moveStat(pts.length, performance.now() - t0, t0 - e.timeStamp);
  }

  function onUp(e) {
    if (!active.has(e.pointerId)) return;
    diag.up(e);
    if (active.size >= 2) hooks.onPairUp();
    finish(e.pointerId, 'up');
  }

  function onCancel(e) {
    const others = active.has(e.pointerId) && active.size > 1;
    diag.cancel(e, others);
    if (others && (e.pointerType === 'touch' || e.pointerType === 'pen')) hooks.onCancelWithOthers(diag.st.cancelsWithOthers);
    finish(e.pointerId, 'cancel');
  }

  function onLost(e) {
    if (!active.has(e.pointerId)) return;
    diag.lost(e);
    finish(e.pointerId, 'up');
  }

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  el.addEventListener('lostpointercapture', onLost);

  // Chặn cử chỉ của trình duyệt
  el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('dblclick', (e) => e.preventDefault());
  window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

  // Bộ canh pointer treo
  const guard = setInterval(() => {
    const now = performance.now();
    for (const [id, a] of Array.from(active)) {
      if (now - a.lastT > STALE_MS) { diag.log('pointer treo #' + id + ' → lưu'); finish(id, 'up'); }
    }
  }, 500);

  return {
    activeCount: () => active.size,
    cancelAll() { for (const id of Array.from(active.keys())) finish(id, 'drop'); },
    destroy() { clearInterval(guard); },
  };
}
