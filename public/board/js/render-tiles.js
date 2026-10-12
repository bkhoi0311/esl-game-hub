// Vẽ gia tăng theo lát (PLAN-PERF C9/C10 + PLAN-INK): không có canvas riêng cho nét đang vẽ; mỗi khung chỉ nối đoạn mới
// lên các lát canvas bị chạm. Hình lúc vẽ và lúc chốt là CÙNG một hàm (drawInk) của CÙNG dữ liệu; chỉ khác thon cuối + closeTail.
//
// Khử răng cưa / ranh giới lát (PLAN-INK 2.4.5):
//  (a) k = DPR (tối đa 3) => mỗi lát có bw = round(CSS x k) khớp đúng điểm ảnh vật lý, trình duyệt không phóng => không nhoè;
//  (b) lát nằm ở toạ độ CSS nguyên, tc*k nguyên (vòng căn), gốc vùng nguyên => cùng một nét được raster y hệt ở 2 lát kề nhau;
//  (c) không dùng imageSmoothing (chỉ vẽ path); không cần dịch nửa điểm ảnh (nét đầu tròn, cong);
//  (d) màu bảng màu là đục (#RRGGBB) nên các lượt/đoạn chồng nhau không tạo vệt đậm - KHÔNG thêm màu có alpha nếu chưa sửa sang tô một path.
import { zoneScale, smoothSegments } from './strokes.js';
import { INK, cumLengths, widthRuns, tailBox } from './ink.js';

export const BOARD_COLOR = '#121212';
export const BOARD_COLOR_RGB = [18, 18, 18];
export const p95 = (arr) => {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
};

const TWO_PI = Math.PI * 2;
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export function createTiledRenderer({ board, stage, ink }) {
  const INKO = ink || {};
  const RAW = !!INKO.raw;
  const host = document.createElement('div');
  host.id = 'tiles';
  stage.insertBefore(host, stage.firstChild);

  let k = 1, origin = { x: 0, y: 0 }, cssW = 0, cssH = 0;
  let Tw = 0, Th = 0, cols = 0, rows = 0;
  let tiles = [];
  const liveMap = new Map();     // pid -> { zone, stroke, drawn, pendT, rect (CSS stage) }
  const wipe = [];               // hộp CSS cần vẽ lại do nét live bị bỏ / tách
  const finishedQ = [];
  const keptDrawn = new WeakMap();   // nét -> số điểm đã vẽ live lúc nhả tay (để vẽ nốt phần chưa kịp vẽ)
  const dirtyZones = new Set();
  const dirtyRects = [];
  const rings = new Map();       // pid -> { zone, x, y, r }
  const ringEls = new Map();     // pid -> { el, key }
  let raf = 0, lastT = 0, fakeExtra = 0, scheduled = false;
  let drawMs = [], intervals = [], fpsFrames = [], fps = 0;
  const newCnt = () => ({ frames: 0, dirtyCss: 0, lat: [], t0: performance.now(), tiles: 0, finalTiles: 0 });
  let cnt = newCnt();

  // ---------- bố cục lát ----------
  function resize(w, h, originXY, dpr) {
    cssW = w; cssH = h; origin = originXY;
    k = RAW ? (INKO.k || 1) : (INKO.k || Math.min(dpr || 1, INK.K_MAX));
    if (w * h * k * k > INK.MAX_BACKING_PX) k = Math.sqrt(INK.MAX_BACKING_PX / (w * h));
    let tc = INK.TILE;
    for (let i = 0; i < 8 && Math.abs(tc * k - Math.round(tc * k)) > 1e-6; i++) tc++; // lát thẳng hàng điểm ảnh
    Tw = Th = tc;
    cols = Math.max(1, Math.ceil(w / Tw)); rows = Math.max(1, Math.ceil(h / Th));
    while (host.firstChild) host.removeChild(host.firstChild);
    tiles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * Tw, y = r * Th;
        const tw = Math.min(Tw, w - x), th = Math.min(Th, h - y);
        const cv = document.createElement('canvas');
        cv.style.left = x + 'px'; cv.style.top = y + 'px'; cv.style.width = tw + 'px'; cv.style.height = th + 'px';
        cv.width = Math.max(1, Math.round(tw * k)); cv.height = Math.max(1, Math.round(th * k));
        host.appendChild(cv);
        tiles.push({ x, y, w: tw, h: th, c: cv, ctx: cv.getContext('2d', { alpha: false }), bw: cv.width, bh: cv.height, col: c, row: r });
      }
    }
    // nét live đang có: vẽ lại từ đầu trên lưới mới
    for (const v of liveMap.values()) { v.drawn = 0; v.rect = null; }
    markDirty();
  }

  function tilesFor(x0, y0, x1, y1) {
    const c0 = Math.max(0, Math.floor(x0 / Tw)), c1 = Math.min(cols - 1, Math.floor(x1 / Tw));
    const r0 = Math.max(0, Math.floor(y0 / Th)), r1 = Math.min(rows - 1, Math.floor(y1 / Th));
    const out = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push(tiles[r * cols + c]);
    return out;
  }

  const zoneStageRect = (z) => ({ x: z.rect.x - origin.x, y: z.rect.y - origin.y, w: z.rect.w, h: z.rect.h });
  const zoneCss = (z) => { const r = zoneStageRect(z); return { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h }; };

  function strokeCssRect(z, s) {
    const b = s.bbox;
    if (!b || !(b.minX <= b.maxX)) return null;
    const sc = zoneScale(z), pad = 0.85 * s.size * sc + 2;
    const ox = z.rect.x - origin.x, oy = z.rect.y - origin.y;
    return { x0: ox + sc * b.minX - pad, y0: oy + sc * b.minY - pad, x1: ox + sc * b.maxX + pad, y1: oy + sc * b.maxY + pad };
  }

  const overlap = (r, t) => r.x0 < t.x + t.w && r.x1 > t.x && r.y0 < t.y + t.h && r.y1 > t.y;
  const union = (a, b) => (!a ? b : { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });

  function addRectTiles(set, r) {
    if (!r) return;
    for (const t of tilesFor(r.x0, r.y0, r.x1, r.y1)) set.add(t);
  }

  // ---------- vẽ lên lát ----------
  function withZoneOnTile(ctx, tile, z, fn) {
    const r = zoneStageRect(z);
    const ix0 = Math.max(r.x, tile.x), iy0 = Math.max(r.y, tile.y);
    const ix1 = Math.min(r.x + r.w, tile.x + tile.w), iy1 = Math.min(r.y + r.h, tile.y + tile.h);
    if (ix1 <= ix0 || iy1 <= iy0) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.rect(k * (ix0 - tile.x), k * (iy0 - tile.y), k * (ix1 - ix0), k * (iy1 - iy0));
    ctx.clip();
    const sc = zoneScale(z);
    ctx.setTransform(k * sc, 0, 0, k * sc, k * (r.x - tile.x), k * (r.y - tile.y)); // đơn vị vùng -> px lát
    fn(ctx, 1 / (sc * k * INK.WIDTH_QUANT));                                         // q: độ dày lượng tử (đv vùng)
    ctx.restore();
  }

  function segPath(segs) {
    const p = new Path2D();
    for (const g of segs) { p.moveTo(g[0], g[1]); p.quadraticCurveTo(g[2], g[3], g[4], g[5]); }
    return p;
  }
  function dot(ctx, s, r) {
    ctx.beginPath();
    ctx.arc(s.pts[0], s.pts[1], r == null ? s.size / 2 : r, 0, TWO_PI);
    ctx.fillStyle = s.color;
    ctx.fill();
  }
  // chấm đầu nét đang vẽ: cùng độ dày với điểm đầu của đường (thon đầu), để lúc chốt không phình/hụt
  function liveDotR(s) {
    if (RAW) return s.size / 2;
    const wf = s.pts[2] > 0 ? s.pts[2] : 1;
    return s.size * wf * (s.contStart ? 1 : INK.TAPER.startMin) / 2;
  }
  // Các lượt cùng độ dày (đã tạo Path2D) cho điểm [from, to). q: độ dày lượng tử (đv vùng).
  function inkRuns(s, from, to, closeTail, fin, q) {
    s.cum = cumLengths(s.pts, s.cum);
    const seg = smoothSegments(s.pts, from, to, closeTail);
    if (RAW) return [{ w: s.size, path: segPath(seg.segs) }];
    return widthRuns(s, seg.segs, from, fin, q).map((r) => ({ w: r.w, path: segPath(r.segs) }));
  }
  function paintRuns(ctx, s, runs) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = s.color;
    for (const r of runs) { ctx.lineWidth = r.w; ctx.stroke(r.path); }
  }
  // Một hàm duy nhất cho nét đang vẽ, nét chốt và phần nối thêm.
  function drawInk(ctx, s, from, to, closeTail, fin, q) {
    if (s.pts.length < 6) { dot(ctx, s); return; }
    paintRuns(ctx, s, inkRuns(s, from, to, closeTail, fin, q));
  }
  function drawFinal(ctx, s, q) { drawInk(ctx, s, 1, s.pts.length / 3, true, true, q); }
  function drawLiveFull(ctx, v, q) {
    if (v.drawn < 2) { dot(ctx, v.stroke, liveDotR(v.stroke)); return; }
    drawInk(ctx, v.stroke, 1, v.drawn, false, false, q);
  }

  function redrawTile(tile) {
    const ctx = tile.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BOARD_COLOR;
    ctx.fillRect(0, 0, tile.bw, tile.bh);
    for (const z of board.zones) {
      const zr = zoneStageRect(z);
      if (zr.x >= tile.x + tile.w || zr.x + zr.w <= tile.x || zr.y >= tile.y + tile.h || zr.y + zr.h <= tile.y) continue;
      withZoneOnTile(ctx, tile, z, (c, q) => {
        for (const s of z.strokes) {
          const r = strokeCssRect(z, s);
          if (r && overlap(r, tile)) drawFinal(c, s, q);
        }
        // phần nét đang vẽ của các ngón khác trong lát này (bắt buộc: lát vừa bị tô lại)
        for (const v of liveMap.values()) {
          if (v.zone === z && v.drawn >= 1 && v.rect && overlap(v.rect, tile)) drawLiveFull(c, v, q);
        }
      });
    }
  }

  // Hộp CSS của phần sẽ đổi khi chốt nét: đuôi (thon cuối + closeTail) + các điểm chưa kịp vẽ live. Nét <= 2 điểm: cả nét.
  function boxCss(z, s, b) {
    const sc = zoneScale(z), pad = 0.85 * s.size * sc + 2;
    const ox = z.rect.x - origin.x, oy = z.rect.y - origin.y;
    return { x0: ox + sc * b.minX - pad, y0: oy + sc * b.minY - pad, x1: ox + sc * b.maxX + pad, y1: oy + sc * b.maxY + pad };
  }
  function finalRect(f) {
    const s = f.stroke, n = s.pts.length / 3;
    if (n <= 2) return strokeCssRect(f.zone, s);
    const tb = tailBox(s);
    const d = keptDrawn.get(s);
    keptDrawn.delete(s);
    if (d != null && d < n) {                       // điểm chưa kịp vẽ live
      for (let i = Math.max(0, d - 1); i < n; i++) {
        const x = s.pts[i * 3], y = s.pts[i * 3 + 1];
        if (x < tb.minX) tb.minX = x; if (y < tb.minY) tb.minY = y; if (x > tb.maxX) tb.maxX = x; if (y > tb.maxY) tb.maxY = y;
      }
    }
    return boxCss(f.zone, s, tb);
  }

  // ---------- vòng khung ----------
  function frame(t) {
    raf = 0; scheduled = false;
    const t0 = performance.now();
    let worked = false;
    const touched = new Set();
    const redrawSet = new Set();
    for (const id of dirtyZones) { const z = board.zones[id - 1]; if (z) addRectTiles(redrawSet, zoneCss(z)); }
    dirtyZones.clear();
    for (const r of dirtyRects) addRectTiles(redrawSet, r);
    dirtyRects.length = 0;
    for (const f of finishedQ.splice(0)) {
      if (f.zone.strokes.indexOf(f.stroke) < 0) continue; // đã bị tẩy/hoàn tác ngay
      const own = new Set();
      addRectTiles(own, finalRect(f));
      cnt.finalTiles += own.size;
      for (const tl of own) redrawSet.add(tl);
    }
    for (const r of wipe) addRectTiles(redrawSet, r);
    wipe.length = 0;
    for (const tile of redrawSet) { redrawTile(tile); touched.add(tile); worked = true; }

    // nét đang vẽ: chỉ nối đoạn mới
    for (const v of liveMap.values()) {
      const pts = v.stroke.pts, n = pts.length / 3;
      if (n < 1 || n <= v.drawn) continue;
      const z = v.zone, sc = zoneScale(z), s = v.stroke;
      const isDot = v.drawn === 0;
      const from = Math.max(1, v.drawn);
      const seg = n >= 2 ? smoothSegments(pts, from, n, false) : { segs: [] };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      if (isDot) { minX = maxX = pts[0]; minY = maxY = pts[1]; }
      if (seg.segs.length) {
        minX = Math.min(minX, seg.minX); minY = Math.min(minY, seg.minY);
        maxX = Math.max(maxX, seg.maxX); maxY = Math.max(maxY, seg.maxY);
      }
      if (minX <= maxX) {
        const pad = s.size / 2 + 1.5 / sc;
        const ox = z.rect.x - origin.x, oy = z.rect.y - origin.y;
        const rect = { x0: ox + sc * (minX - pad), y0: oy + sc * (minY - pad), x1: ox + sc * (maxX + pad), y1: oy + sc * (maxY + pad) };
        let runs = null;
        if (seg.segs.length) runs = inkRuns(s, from, n, false, false, 1 / (sc * k * INK.WIDTH_QUANT));
        const dr = isDot ? liveDotR(s) : 0;
        for (const tile of tilesFor(rect.x0, rect.y0, rect.x1, rect.y1)) {
          withZoneOnTile(tile.ctx, tile, z, (c) => {
            if (isDot) dot(c, s, dr);
            if (runs) paintRuns(c, s, runs);
          });
          touched.add(tile);
        }
        v.rect = union(v.rect, rect);
        worked = true;
      }
      v.drawn = n;
    }

    // vòng tẩy (div, chỉ đổi transform khi khác)
    for (const [pid, v] of rings) {
      let e = ringEls.get(pid);
      if (!e) {
        const el = document.createElement('div');
        el.className = 'erase-ring';
        stage.appendChild(el);
        e = { el, key: '' };
        ringEls.set(pid, e);
      }
      const key = Math.round(v.x - origin.x) + ',' + Math.round(v.y - origin.y) + ',' + v.r;
      if (e.key !== key) {
        e.key = key;
        const d = 2 * v.r;
        e.el.style.width = d + 'px'; e.el.style.height = d + 'px';
        e.el.style.transform = 'translate(' + (v.x - origin.x - v.r) + 'px,' + (v.y - origin.y - v.r) + 'px)';
      }
      e.el.hidden = false;
    }
    for (const [pid, e] of ringEls) if (!rings.has(pid)) e.el.hidden = true;

    // đo
    const t1 = performance.now();
    if (worked) {
      cnt.frames++;
      cnt.tiles += touched.size;
      for (const tile of touched) cnt.dirtyCss += tile.w * tile.h;
      for (const v of liveMap.values()) {
        if (v.pendT) { const d = t1 - v.pendT; if (d >= 0 && d < 10000) { cnt.lat.push(d); if (cnt.lat.length > 240) cnt.lat.shift(); } v.pendT = 0; }
      }
      drawMs.push(t1 - t0); if (drawMs.length > 240) drawMs.shift();
    }
    if (lastT) {
      const iv = t - lastT + fakeExtra;
      intervals.push(iv); if (intervals.length > 240) intervals.shift();
      fpsFrames.push(t); while (fpsFrames.length && t - fpsFrames[0] > 1000) fpsFrames.shift();
      fps = fakeExtra ? 1000 / Math.max(1, avg(intervals.slice(-20))) : fpsFrames.length;
    }
    lastT = t;
    if (liveMap.size > 0 || rings.size > 0 || dirtyZones.size > 0 || dirtyRects.length > 0 || finishedQ.length > 0 || wipe.length > 0) requestFrame();
    else lastT = 0;
  }

  function requestFrame() {
    if (scheduled) return;
    scheduled = true;
    raf = requestAnimationFrame(frame);
  }

  function markDirty(zoneId) {
    if (zoneId == null) for (const z of board.zones) dirtyZones.add(z.id);
    else dirtyZones.add(zoneId);
    requestFrame();
  }

  function readInk(tile, ix0, iy0, ix1, iy1) {
    // vùng giao (px lát) -> đếm điểm khác nền
    const x = Math.max(0, Math.floor(k * (ix0 - tile.x))), y = Math.max(0, Math.floor(k * (iy0 - tile.y)));
    const w = Math.min(tile.bw - x, Math.ceil(k * (ix1 - tile.x)) - x), h = Math.min(tile.bh - y, Math.ceil(k * (iy1 - tile.y)) - y);
    if (w <= 0 || h <= 0) return 0;
    const d = tile.ctx.getImageData(x, y, w, h).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - BOARD_COLOR_RGB[0]) > 24 || Math.abs(d[i + 1] - BOARD_COLOR_RGB[1]) > 24 || Math.abs(d[i + 2] - BOARD_COLOR_RGB[2]) > 24) n++;
    }
    return n;
  }

  return {
    resize, markDirty, requestFrame,
    get k() { return k; },
    canvasSize() { return [Math.round(cssW * k), Math.round(cssH * k)]; },
    canvasInfo() {
      let mp = 0;
      for (const t of tiles) mp += t.bw * t.bh;
      return { count: tiles.length, w: Math.round(cssW * k), h: Math.round(cssH * k), mp: mp / 1e6,
        desc: tiles.length + ' lát ' + Tw + ' px (k ' + String(Math.round(k * 100) / 100).replace('.', ',') + ')' };
    },
    strokeFinished(zone, stroke) {
      finishedQ.push({ zone, stroke });
      requestFrame();
    },
    strokesRemoved(z, list) {
      for (const s of list) { const r = strokeCssRect(z, s); if (r) dirtyRects.push(r); }
      requestFrame();
    },
    setLive(pid, zone, stroke, evtT) {
      let v = liveMap.get(pid);
      if (v && v.stroke !== stroke) {       // tách nét: nét cũ đã được strokeFinished riêng
        if (v.rect) wipe.push(v.rect);
        v.stroke = stroke; v.zone = zone; v.drawn = 0; v.rect = null;
      } else if (!v) {
        v = { zone, stroke, drawn: 0, pendT: 0, rect: null };
        liveMap.set(pid, v);
      }
      if (!v.pendT && evtT) v.pendT = evtT;
      requestFrame();
    },
    // keep = nét sẽ được lưu (strokeFinished ngay sau): hình live đã đúng nên không xoá cả hộp, chỉ vẽ lại đuôi.
    clearLive(pid, keep) {
      const v = liveMap.get(pid);
      if (v && keep) keptDrawn.set(v.stroke, v.drawn);
      else if (v && v.rect) wipe.push(v.rect);
      liveMap.delete(pid);
      requestFrame();
    },
    setRing(pid, zone, x, y, r) { rings.set(pid, { zone, x, y, r }); requestFrame(); },
    clearRing(pid) { rings.delete(pid); requestFrame(); },
    perf() {
      return { avgMs: avg(drawMs), p95Ms: p95(drawMs), fps: Math.round(fps), frames: drawMs.length, intervalP95: p95(intervals) };
    },
    resetPerf() { drawMs = []; intervals = []; fpsFrames = []; fps = 0; cnt = newCnt(); },
    counters() {
      const lat = cnt.lat;
      return {
        frames: cnt.frames, finalTiles: cnt.finalTiles, sinceMs: performance.now() - cnt.t0,
        dirtyCssPerFrame: cnt.frames ? cnt.dirtyCss / cnt.frames : 0, dirtyCssTotal: cnt.dirtyCss,
        tilesPerFrame: cnt.frames ? cnt.tiles / cnt.frames : 0,
        latAvg: avg(lat), latP95: p95(lat), latN: lat.length,
      };
    },
    resetCounters() { cnt = newCnt(); },
    forceSlowFrames(ms) { fakeExtra = ms; },
    flush() {
      return new Promise((res) => {
        requestFrame();
        requestAnimationFrame(() => requestAnimationFrame(() => res()));
      });
    },
    inkPixels(zoneId) {
      const z = board.zones[zoneId - 1];
      const r = zoneStageRect(z);
      let n = 0;
      for (const tile of tilesFor(r.x, r.y, r.x + r.w, r.y + r.h)) {
        const ix0 = Math.max(r.x, tile.x), iy0 = Math.max(r.y, tile.y);
        const ix1 = Math.min(r.x + r.w, tile.x + tile.w), iy1 = Math.min(r.y + r.h, tile.y + tile.h);
        if (ix1 > ix0 && iy1 > iy0) n += readInk(tile, ix0, iy0, ix1, iy1);
      }
      return n;
    },
    pixelAt(xCss, yCss) {
      const sx = xCss - origin.x, sy = yCss - origin.y;
      const found = tilesFor(sx, sy, sx, sy)[0];
      if (!found || sx < 0 || sy < 0 || sx >= cssW || sy >= cssH) return [0, 0, 0];
      const px = Math.min(found.bw - 1, Math.floor(k * (sx - found.x))), py = Math.min(found.bh - 1, Math.floor(k * (sy - found.y)));
      const d = found.ctx.getImageData(px, py, 1, 1).data;
      return [d[0], d[1], d[2]];
    },
  };
}
