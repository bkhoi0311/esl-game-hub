// Vẽ: 2 canvas (#ink nét xong, #live nét đang vẽ), một vòng rAF duy nhất, Path2D cache, cắt theo vùng.
import { getStroke } from '../vendor/perfect-freehand.mjs';
import { zoneScale } from './strokes.js';

const BOARD_RGB = [18, 18, 18]; // --board #121212
const BOARD_CSS = '#121212';

export function outlineToSvgPath(points) {
  const len = points.length;
  if (len < 4) return '';
  const avg = (a, b) => (a + b) / 2;
  let a = points[0], b = points[1];
  const c = points[2];
  let d = 'M' + a[0].toFixed(2) + ',' + a[1].toFixed(2) + ' Q' + b[0].toFixed(2) + ',' + b[1].toFixed(2) + ' ' +
    avg(b[0], c[0]).toFixed(2) + ',' + avg(b[1], c[1]).toFixed(2) + ' T';
  for (let i = 2, max = len - 1; i < max; i++) {
    a = points[i]; b = points[i + 1];
    d += avg(a[0], b[0]).toFixed(2) + ',' + avg(a[1], b[1]).toFixed(2) + ' ';
  }
  return d + 'Z';
}

export function freehandOptions(stroke, last) {
  const real = stroke.realPressure;
  return {
    size: stroke.size, thinning: real ? 0.6 : 0.2, smoothing: 0.5, streamline: real ? 0.3 : 0.45,
    simulatePressure: !real, last,
    start: { taper: 0, cap: true }, end: { taper: 0, cap: true },
  };
}

export function toPoints(pts) {
  const out = new Array(pts.length / 3);
  for (let i = 0, j = 0; i < pts.length; i += 3, j++) out[j] = [pts[i], pts[i + 1], pts[i + 2]];
  return out;
}

export function buildPath(stroke, last, cnt) {
  if (cnt) { cnt.getStroke++; cnt.pfPts += stroke.pts.length / 3; }
  const outline = getStroke(toPoints(stroke.pts), freehandOptions(stroke, last));
  return new Path2D(outlineToSvgPath(outline));
}

export const BOARD_COLOR = BOARD_CSS;
export const BOARD_COLOR_RGB = BOARD_RGB;
const DEFAULT_PERF = { kCap: 2, desync: true, liveClear: 'zone', predict: false };

export const p95 = (arr) => {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
};

export function createRenderer({ board, ink, live, perf, onWindow }) {
  const P = Object.assign({}, DEFAULT_PERF, perf || {});
  const inkCtx = ink.getContext('2d', { alpha: false, desynchronized: !!P.desync });
  const liveCtx = live.getContext('2d', { desynchronized: !!P.desync });
  const bbox = P.liveClear === 'bbox';
  const newCnt = () => ({ getStroke: 0, pfPts: 0, frames: 0, dirtyCss: 0, lat: [], t0: performance.now() });
  let cnt = newCnt();
  let prevRects = [];               // chế độ bbox: hình chữ nhật (px backing) đã vẽ trên #live ở khung trước
  let k = 1, origin = { x: 0, y: 0 }, cssW = 0, cssH = 0;
  const dirty = new Set();          // zoneId cần vẽ lại trên #ink
  const finished = [];              // nét vừa xong cần vẽ thêm
  const liveMap = new Map();        // pointerId -> {zone, stroke}
  const rings = new Map();          // pointerId -> {zone, x, y, r}
  let prevLiveZones = new Set();
  let raf = 0, lastT = 0, fakeExtra = 0, scheduled = false;
  // perf
  let drawMs = [], intervals = [], fpsFrames = [], fps = 0;
  let win = { start: 0, ints: [], last: 0 };

  function resize(w, h, originXY, dpr) {
    cssW = w; cssH = h; origin = originXY;
    k = Math.min(dpr || 1, P.kCap || 2);
    if (w * h * k * k > 3840 * 2160) k = Math.sqrt((3840 * 2160) / (w * h));
    for (const c of [ink, live]) {
      c.style.width = w + 'px'; c.style.height = h + 'px';
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    }
    prevRects = [];
    prevLiveZones = new Set();
    markDirty();
  }

  function markDirty(zoneId) {
    if (zoneId == null) for (const z of board.zones) dirty.add(z.id);
    else dirty.add(zoneId);
    requestFrame();
  }

  function clipZone(ctx, z) {
    const r = z.rect;
    ctx.beginPath();
    ctx.rect(k * (r.x - origin.x), k * (r.y - origin.y), k * r.w, k * r.h);
    ctx.clip();
  }

  function fillStroke(ctx, z, stroke, path) {
    const sc = zoneScale(z);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    clipZone(ctx, z);
    ctx.setTransform(k * sc, 0, 0, k * sc, k * (z.rect.x - origin.x), k * (z.rect.y - origin.y));
    ctx.fillStyle = stroke.color;
    ctx.fill(path);
    ctx.restore();
  }

  function pathOf(stroke) {
    if (!stroke.path) stroke.path = buildPath(stroke, true, cnt);
    return stroke.path;
  }

  function redrawZone(z) {
    const r = z.rect;
    inkCtx.setTransform(1, 0, 0, 1, 0, 0);
    inkCtx.fillStyle = BOARD_CSS;
    inkCtx.fillRect(Math.floor(k * (r.x - origin.x)), Math.floor(k * (r.y - origin.y)), Math.ceil(k * r.w) + 1, Math.ceil(k * r.h) + 1);
    for (const s of z.strokes) fillStroke(inkCtx, z, s, pathOf(s));
  }

  function drawRing(v) {
    liveCtx.save();
    liveCtx.setTransform(1, 0, 0, 1, 0, 0);
    clipZone(liveCtx, v.zone);
    liveCtx.setTransform(k, 0, 0, k, 0, 0);
    liveCtx.beginPath();
    liveCtx.arc(v.x - origin.x, v.y - origin.y, v.r, 0, Math.PI * 2);
    liveCtx.fillStyle = 'rgba(255,255,255,.10)';
    liveCtx.fill();
    liveCtx.lineWidth = 1.5;
    liveCtx.strokeStyle = 'rgba(255,255,255,.5)';
    liveCtx.stroke();
    liveCtx.restore();
  }

  function clearLiveZone(z) {
    const r = z.rect;
    liveCtx.setTransform(1, 0, 0, 1, 0, 0);
    liveCtx.clearRect(Math.floor(k * (r.x - origin.x)), Math.floor(k * (r.y - origin.y)), Math.ceil(k * r.w) + 1, Math.ceil(k * r.h) + 1);
  }

  // Hình chữ nhật px backing bao nét (kèm điểm dự đoán) cộng lề, giao với vùng.
  function liveRectOf(z, stroke, extra) {
    const b = stroke.bbox;
    if (!(b.minX <= b.maxX)) return null;
    const sc = zoneScale(z);
    let minX = b.minX, minY = b.minY, maxX = b.maxX, maxY = b.maxY;
    if (extra) {
      if (extra[0] < minX) minX = extra[0]; if (extra[0] > maxX) maxX = extra[0];
      if (extra[1] < minY) minY = extra[1]; if (extra[1] > maxY) maxY = extra[1];
    }
    const pad = 0.85 * stroke.size * sc + 2;
    return cssToBacking(z, z.rect.x - origin.x + sc * minX - pad, z.rect.y - origin.y + sc * minY - pad,
      z.rect.x - origin.x + sc * maxX + pad, z.rect.y - origin.y + sc * maxY + pad);
  }

  // CSS (gốc #stage) -> hộp px backing làm tròn ra ngoài, giao với vùng z.
  function cssToBacking(z, x0, y0, x1, y1) {
    const zr = z.rect;
    const zx0 = Math.floor(k * (zr.x - origin.x)), zy0 = Math.floor(k * (zr.y - origin.y));
    const zx1 = Math.ceil(k * (zr.x - origin.x + zr.w)) + 1, zy1 = Math.ceil(k * (zr.y - origin.y + zr.h)) + 1;
    const X0 = Math.max(zx0, Math.floor(k * x0) - 1), Y0 = Math.max(zy0, Math.floor(k * y0) - 1);
    const X1 = Math.min(zx1, Math.ceil(k * x1) + 1), Y1 = Math.min(zy1, Math.ceil(k * y1) + 1);
    if (X1 <= X0 || Y1 <= Y0) return null;
    return { x: X0, y: Y0, w: X1 - X0, h: Y1 - Y0 };
  }

  const rectCss = (r) => (r.w * r.h) / (k * k);

  function pathForLive(v) {
    if (v.pred && P.predict) {
      const s = v.stroke;
      const tmp = { pts: s.pts.concat([v.pred[0], v.pred[1], 0.5]), size: s.size, realPressure: s.realPressure };
      return buildPath(tmp, false, cnt);
    }
    return buildPath(v.stroke, false, cnt);
  }

  function frame(t) {
    raf = 0; scheduled = false;
    const t0 = performance.now();
    // 1. vùng bẩn
    const redrawn = new Set();
    for (const id of dirty) {
      const z = board.zones[id - 1];
      if (!z) continue;
      redrawZone(z); redrawn.add(id); cnt.dirtyCss += z.rect.w * z.rect.h;
    }
    dirty.clear();
    // 2. nét vừa xong
    for (const f of finished.splice(0)) {
      if (redrawn.has(f.zone.id)) continue;
      if (f.zone.strokes.indexOf(f.stroke) < 0) continue; // đã bị tẩy/hoàn tác ngay
      fillStroke(inkCtx, f.zone, f.stroke, pathOf(f.stroke));
      const fr = liveRectOf(f.zone, f.stroke);
      if (fr) cnt.dirtyCss += rectCss(fr);
    }
    // 3. live
    if (bbox) {
      for (const r of prevRects) liveCtx.clearRect(r.x, r.y, r.w, r.h);
      for (const r of prevRects) cnt.dirtyCss += rectCss(r);
      const rects = [];
      for (const v of liveMap.values()) {
        if (v.stroke.pts.length < 3) continue;
        const r = liveRectOf(v.zone, v.stroke, P.predict ? v.pred : null);
        if (r) { rects.push(r); cnt.dirtyCss += rectCss(r); }
        fillStroke(liveCtx, v.zone, v.stroke, pathForLive(v));
      }
      for (const v of rings.values()) {
        const r = cssToBacking(v.zone, v.x - origin.x - v.r - 2, v.y - origin.y - v.r - 2, v.x - origin.x + v.r + 2, v.y - origin.y + v.r + 2);
        if (r) { rects.push(r); cnt.dirtyCss += rectCss(r); }
        drawRing(v);
      }
      prevRects = rects;
    } else {
      const curZones = new Set();
      for (const v of liveMap.values()) curZones.add(v.zone.id);
      for (const v of rings.values()) curZones.add(v.zone.id);
      for (const id of prevLiveZones) clearLiveZone(board.zones[id - 1]);
      for (const id of curZones) if (!prevLiveZones.has(id)) clearLiveZone(board.zones[id - 1]);
      const cleared = new Set(prevLiveZones);
      for (const id of curZones) cleared.add(id);
      for (const id of cleared) { const zz = board.zones[id - 1]; if (zz) cnt.dirtyCss += zz.rect.w * zz.rect.h; }
      for (const v of liveMap.values()) {
        if (v.stroke.pts.length < 3) continue;
        fillStroke(liveCtx, v.zone, v.stroke, pathForLive(v));
      }
      for (const v of rings.values()) drawRing(v);
      prevLiveZones = curZones;
    }
    // 4. đo
    const t1 = performance.now();
    cnt.frames++;
    for (const v of liveMap.values()) {
      if (v.pendT) { const d = t1 - v.pendT; if (d >= 0 && d < 10000) { cnt.lat.push(d); if (cnt.lat.length > 240) cnt.lat.shift(); } v.pendT = 0; }
    }
    drawMs.push(t1 - t0); if (drawMs.length > 240) drawMs.shift();
    if (lastT) {
      const iv = t - lastT + fakeExtra;
      intervals.push(iv); if (intervals.length > 240) intervals.shift();
      fpsFrames.push(t); while (fpsFrames.length && t - fpsFrames[0] > 1000) fpsFrames.shift();
      fps = fakeExtra ? 1000 / Math.max(1, avg(intervals.slice(-20))) : fpsFrames.length;
      if (liveMap.size > 0) windowSample(t, iv);
    }
    lastT = t;
    // 5. tiếp tục khi còn việc; rảnh thì dừng
    if (liveMap.size > 0 || rings.size > 0 || dirty.size > 0 || finished.length > 0 || prevRects.length > 0 || prevLiveZones.size > 0) requestFrame();
    else lastT = 0;
  }

  function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }

  function windowSample(t, iv) {
    if (win.last && t - win.last > 400) win = { start: t, ints: [], last: 0 };
    if (!win.start) win.start = t;
    win.ints.push(iv); win.last = t;
    if (t - win.start >= 2000 && win.ints.length >= 20) {
      const stats = { p95: p95(win.ints), fps: 1000 / avg(win.ints), n: win.ints.length };
      win = { start: t, ints: [], last: t };
      if (onWindow) onWindow(stats);
    }
  }

  function requestFrame() {
    if (scheduled) return;
    scheduled = true;
    raf = requestAnimationFrame(frame);
  }

  return {
    resize, markDirty, requestFrame,
    get k() { return k; },
    canvasSize() { return [ink.width, ink.height]; },
    strokeFinished(zone, stroke) { finished.push({ zone, stroke }); requestFrame(); },
    setLive(pid, zone, stroke, evtT) {
      const v = liveMap.get(pid);
      if (v) { v.zone = zone; v.stroke = stroke; if (!v.pendT && evtT) v.pendT = evtT; }
      else liveMap.set(pid, { zone, stroke, pendT: evtT || 0, pred: null });
      requestFrame();
    },
    setPredict(pid, pt) { const v = liveMap.get(pid); if (v) v.pred = pt; },
    clearLive(pid) { liveMap.delete(pid); requestFrame(); },
    setRing(pid, zone, x, y, r) { rings.set(pid, { zone, x, y, r }); requestFrame(); },
    clearRing(pid) { rings.delete(pid); requestFrame(); },
    perf() {
      return {
        avgMs: avg(drawMs), p95Ms: p95(drawMs), fps: Math.round(fps), frames: drawMs.length,
        intervalP95: p95(intervals),
      };
    },
    resetPerf() { drawMs = []; intervals = []; fpsFrames = []; fps = 0; win = { start: 0, ints: [], last: 0 }; cnt = newCnt(); },
    counters() {
      const lat = cnt.lat;
      return {
        getStroke: cnt.getStroke, pfPts: cnt.pfPts, frames: cnt.frames, sinceMs: performance.now() - cnt.t0,
        dirtyCssPerFrame: cnt.frames ? cnt.dirtyCss / cnt.frames : 0, dirtyCssTotal: cnt.dirtyCss,
        latAvg: avg(lat), latP95: p95(lat), latN: lat.length,
      };
    },
    resetCounters() { cnt = newCnt(); },
    canvasInfo() {
      return { count: 2, w: ink.width, h: ink.height, mp: (2 * ink.width * ink.height) / 1e6, desc: '2 x ' + ink.width + 'x' + ink.height };
    },
    pixelAt(xCss, yCss) {
      const x = Math.floor(k * (xCss - origin.x)), y = Math.floor(k * (yCss - origin.y));
      if (x < 0 || y < 0 || x >= ink.width || y >= ink.height) return [0, 0, 0];
      const l = liveCtx.getImageData(x, y, 1, 1).data;
      if (l[3] > 200) return [l[0], l[1], l[2]];
      const d = inkCtx.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2]];
    },
    liveNonEmpty() {
      const d = liveCtx.getImageData(0, 0, live.width, live.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true;
      return false;
    },
    forceSlowFrames(ms) { fakeExtra = ms; },
    flush() {
      return new Promise((res) => {
        requestFrame();
        requestAnimationFrame(() => requestAnimationFrame(() => res()));
      });
    },
    inkPixels(zoneId) {
      const z = board.zones[zoneId - 1];
      const r = z.rect;
      const x = Math.max(0, Math.floor(k * (r.x - origin.x))), y = Math.max(0, Math.floor(k * (r.y - origin.y)));
      const w = Math.min(ink.width - x, Math.ceil(k * r.w)), h = Math.min(ink.height - y, Math.ceil(k * r.h));
      if (w <= 0 || h <= 0) return 0;
      const d = inkCtx.getImageData(x, y, w, h).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (Math.abs(d[i] - BOARD_RGB[0]) > 24 || Math.abs(d[i + 1] - BOARD_RGB[1]) > 24 || Math.abs(d[i + 2] - BOARD_RGB[2]) > 24) n++;
      }
      return n;
    },
  };
}
