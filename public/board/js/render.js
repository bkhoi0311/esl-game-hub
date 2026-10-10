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

function freehandOptions(stroke, last) {
  const real = stroke.realPressure;
  return {
    size: stroke.size, thinning: real ? 0.6 : 0.2, smoothing: 0.5, streamline: real ? 0.3 : 0.45,
    simulatePressure: !real, last,
    start: { taper: 0, cap: true }, end: { taper: 0, cap: true },
  };
}

function toPoints(pts) {
  const out = new Array(pts.length / 3);
  for (let i = 0, j = 0; i < pts.length; i += 3, j++) out[j] = [pts[i], pts[i + 1], pts[i + 2]];
  return out;
}

function buildPath(stroke, last) {
  const outline = getStroke(toPoints(stroke.pts), freehandOptions(stroke, last));
  return new Path2D(outlineToSvgPath(outline));
}

const p95 = (arr) => {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
};

export function createRenderer({ board, ink, live, onWindow }) {
  const inkCtx = ink.getContext('2d', { alpha: false, desynchronized: true });
  const liveCtx = live.getContext('2d', { desynchronized: true });
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
    k = Math.min(dpr || 1, 2);
    if (w * h * k * k > 3840 * 2160) k = Math.sqrt((3840 * 2160) / (w * h));
    for (const c of [ink, live]) {
      c.style.width = w + 'px'; c.style.height = h + 'px';
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    }
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
    if (!stroke.path) stroke.path = buildPath(stroke, true);
    return stroke.path;
  }

  function redrawZone(z) {
    const r = z.rect;
    inkCtx.setTransform(1, 0, 0, 1, 0, 0);
    inkCtx.fillStyle = BOARD_CSS;
    inkCtx.fillRect(Math.floor(k * (r.x - origin.x)), Math.floor(k * (r.y - origin.y)), Math.ceil(k * r.w) + 1, Math.ceil(k * r.h) + 1);
    for (const s of z.strokes) fillStroke(inkCtx, z, s, pathOf(s));
  }

  function clearLiveZone(z) {
    const r = z.rect;
    liveCtx.setTransform(1, 0, 0, 1, 0, 0);
    liveCtx.clearRect(Math.floor(k * (r.x - origin.x)), Math.floor(k * (r.y - origin.y)), Math.ceil(k * r.w) + 1, Math.ceil(k * r.h) + 1);
  }

  function frame(t) {
    raf = 0; scheduled = false;
    const t0 = performance.now();
    // 1. vùng bẩn
    const redrawn = new Set();
    for (const id of dirty) { redrawZone(board.zones[id - 1]); redrawn.add(id); }
    dirty.clear();
    // 2. nét vừa xong
    for (const f of finished.splice(0)) {
      if (redrawn.has(f.zone.id)) continue;
      if (f.zone.strokes.indexOf(f.stroke) < 0) continue; // đã bị tẩy/hoàn tác ngay
      fillStroke(inkCtx, f.zone, f.stroke, pathOf(f.stroke));
    }
    // 3. live
    const curZones = new Set();
    for (const v of liveMap.values()) curZones.add(v.zone.id);
    for (const v of rings.values()) curZones.add(v.zone.id);
    for (const id of prevLiveZones) clearLiveZone(board.zones[id - 1]);
    for (const id of curZones) if (!prevLiveZones.has(id)) clearLiveZone(board.zones[id - 1]);
    for (const v of liveMap.values()) {
      if (v.stroke.pts.length < 3) continue;
      fillStroke(liveCtx, v.zone, v.stroke, buildPath(v.stroke, false));
    }
    for (const v of rings.values()) {
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
    prevLiveZones = curZones;
    // 4. đo
    const t1 = performance.now();
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
    if (liveMap.size > 0 || rings.size > 0 || dirty.size > 0 || finished.length > 0) requestFrame();
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
    setLive(pid, zone, stroke) { liveMap.set(pid, { zone, stroke }); requestFrame(); },
    clearLive(pid) { liveMap.delete(pid); requestFrame(); },
    setRing(pid, zone, x, y, r) { rings.set(pid, { zone, x, y, r }); requestFrame(); },
    clearRing(pid) { rings.delete(pid); requestFrame(); },
    perf() {
      return {
        avgMs: avg(drawMs), p95Ms: p95(drawMs), fps: Math.round(fps), frames: drawMs.length,
        intervalP95: p95(intervals),
      };
    },
    resetPerf() { drawMs = []; intervals = []; fpsFrames = []; fps = 0; win = { start: 0, ints: [], last: 0 }; },
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
