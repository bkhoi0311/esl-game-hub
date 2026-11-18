// Theo dõi người chơi cho game camera khi lớp đông:
// - chỉ nhận người đứng trong "vùng chơi" (theo hình gương trên màn hình) và đủ gần camera;
// - ưu tiên người to nhất (gần camera nhất), người phía sau không được tính;
// - giữ đúng số Player 1/2/3 giữa các khung hình (ghép tối ưu toàn cục theo vị trí + vận tốc), không đổi số khi di chuyển;
// - khử trùng lặp: MediaPipe (numPoses > 1) đôi khi trả 2 bộ xương cho cùng một người -> gộp lại (dedupePeople);
// - làm mịn toạ độ (EMA thích ứng, hoặc One Euro khi filter: 'euro');
// - cho biết camera có thấy chân không (để bỏ lệnh cần chân khi học sinh chỉ lộ nửa người).
// Mỗi chỗ trả ra có id ổn định (để lớp vẽ vẽ theo id), fresh (khung này có dữ liệu mới), stale (quá staleMs không có dữ liệu mới: vẽ mờ).
// Tuỳ chọn mới (confirmFrames, exclusionK, jumpK, filter, ...) mặc định giữ hành vi cũ; Simon bật. Xem PLAN-SIMON-FIX.md.
// Thuần logic, không đụng DOM: test được bằng khung xương giả.
const vis = (p, min = 0.5) => Boolean(p) && (p.visibility ?? 1) >= min;

export function bodyInfo(lm) {
  const ls = lm[11];
  const rs = lm[12];
  if (!vis(ls) || !vis(rs)) return null;
  const size = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  const lh = lm[23];
  const rh = lm[24];
  const hips = vis(lh) && vis(rh);
  const cx = (ls.x + rs.x) / 2;
  const cy = hips ? (ls.y + rs.y + lh.y + rh.y) / 4 : (ls.y + rs.y) / 2;
  const legs = [25, 26, 27, 28].every((i) => vis(lm[i], 0.55) && lm[i].y < 0.99);
  return { cx, cy, sx: 1 - cx, size, legs };
}

// ---- (a) Khử trùng lặp: MediaPipe (numPoses > 1) có lúc trả 2 bộ xương cho CÙNG một người. ----
const KP = [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24];
export function poseQuality(lm) {
  return KP.reduce((s, i) => s + (lm[i] ? lm[i].visibility ?? 1 : 0), 0);
}
// Cùng một người: đầu (mũi) gần nhau < headK vai, HOẶC trung vị khoảng cách các điểm tương ứng < medK vai,
// HOẶC hộp thân (vai+hông) chồng IoU > iouMin. Hai người khác cỡ hẳn (người đứng sau) không gộp.
export function sameBody(a, b, { headK = 0.5, medK = 0.6, iouMin = 0.45 } = {}) {
  const sa = Math.hypot(a[11].x - a[12].x, a[11].y - a[12].y);
  const sb = Math.hypot(b[11].x - b[12].x, b[11].y - b[12].y);
  const sw = Math.max(sa, sb, 1e-3);
  if (Math.min(sa, sb) / sw < 0.45) return false;
  const ds = KP.filter((i) => vis(a[i]) && vis(b[i])).map((i) => Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y) / sw).sort((x, y) => x - y);
  if (ds.length < 3) return false;
  if (vis(a[0]) && vis(b[0]) && Math.hypot(a[0].x - b[0].x, a[0].y - b[0].y) / sw < headK) return true;
  if (ds[ds.length >> 1] < medK) return true;
  return torsoIoU(a, b) > iouMin;
}
function torsoBox(lm) {
  const pts = [11, 12, 23, 24].filter((i) => vis(lm[i])).map((i) => lm[i]);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
export function torsoIoU(a, b) {
  const A = torsoBox(a);
  const B = torsoBox(b);
  const iw = Math.max(0, Math.min(A[2], B[2]) - Math.max(A[0], B[0]));
  const ih = Math.max(0, Math.min(A[3], B[3]) - Math.max(A[1], B[1]));
  const u = (A[2] - A[0]) * (A[3] - A[1]) + (B[2] - B[0]) * (B[3] - B[1]) - iw * ih;
  return u > 1e-9 ? (iw * ih) / u : 0;
}
export function dedupePeople(list, opts) {
  const order = list.map((lm, i) => ({ lm, i, q: poseQuality(lm) })).sort((x, y) => y.q - x.q);
  const keep = [];
  for (const p of order) if (!keep.some((k) => sameBody(k.lm, p.lm, opts))) keep.push(p);
  return { list: keep.sort((x, y) => x.i - y.i).map((p) => p.lm), merged: list.length - keep.length };
}

// ---- (c) One Euro cho từng điểm (beta tính theo bề rộng vai nên đứng xa/gần như nhau). ----
const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
function euroLandmarks(prev, next, dtMs, size, { minCutoff = 1.0, betaSw = 1.2, dCutoff = 1.0 } = {}) {
  if (!prev || !prev.f) return { lm: next.map((p) => ({ ...p })), f: next.map((p) => ({ x: p.x, y: p.y, dx: 0, dy: 0 })) };
  const dt = Math.max(1, Math.min(200, dtMs)) / 1000;
  const beta = betaSw / Math.max(0.02, size);
  const ad = alpha(dCutoff, dt);
  const f = [];
  const lm = next.map((p, i) => {
    const q = prev.f[i] || { x: p.x, y: p.y, dx: 0, dy: 0 };
    const dx = q.dx + ((p.x - q.x) / dt - q.dx) * ad;
    const dy = q.dy + ((p.y - q.y) / dt - q.dy) * ad;
    const a = alpha(minCutoff + beta * Math.hypot(dx, dy), dt);
    const x = q.x + (p.x - q.x) * a;
    const y = q.y + (p.y - q.y) * a;
    f.push({ x, y, dx, dy });
    const pv = prev.lm[i] || p;
    return { x, y, z: p.z, visibility: (pv.visibility ?? 1) + ((p.visibility ?? 1) - (pv.visibility ?? 1)) * 0.5 };
  });
  return { lm, f };
}

function smoothLandmarks(prev, next, base) {
  if (!prev) return next.map((p) => ({ ...p }));
  return next.map((p, i) => {
    const q = prev[i] || p;
    const moved = Math.hypot(p.x - q.x, p.y - q.y);
    const a = Math.min(0.92, base + moved * 6);
    return {
      x: q.x + (p.x - q.x) * a,
      y: q.y + (p.y - q.y) * a,
      z: (q.z ?? 0) + ((p.z ?? 0) - (q.z ?? 0)) * a,
      visibility: (q.visibility ?? 1) + ((p.visibility ?? 1) - (q.visibility ?? 1)) * 0.5,
    };
  });
}

// Ghép tối ưu toàn cục (ít chỗ, ít ứng viên: duyệt hết). Ưu tiên ghép được NHIỀU cặp, rồi tổng khoảng cách nhỏ.
function bestAssign(nS, nC, cost, gate) {
  let best = { n: -1, sum: Infinity, a: [] };
  const a = Array(nS).fill(-1);
  const used = new Set();
  const rec = (si, n, sum) => {
    if (si === nS) {
      if (n > best.n || (n === best.n && sum < best.sum)) best = { n, sum, a: [...a] };
      return;
    }
    rec(si + 1, n, sum); // chỗ này không ghép
    for (let ci = 0; ci < nC; ci++) {
      const d = cost(si, ci);
      if (used.has(ci) || !(d < gate)) continue;
      used.add(ci);
      a[si] = ci;
      rec(si + 1, n + 1, sum + d);
      a[si] = -1;
      used.delete(ci);
    }
  };
  rec(0, 0, 0);
  return best.a;
}

export function createPoseTracker({
  maxPlayers = 3, zone = [0, 1], minSize = 0.05, lostMs = 900, smooth = 0.45, matchDist = 1.4, keepFrac = 0.6, legsMs = 800,
  // mới (mặc định = hành vi cũ, trừ dedupe):
  dedupe = true, confirmFrames = 1, pendingMs = 300, exclusionK = 0, jumpK = Infinity, filter = 'ema', staleMs = 250, euro = {},
} = {}) {
  let slots = Array(maxPlayers).fill(null);
  let nextId = 1;
  const cfg = { zone, minSize };
  let holding = false;
  let anchor = null;
  let joinLocked = false;
  let pending = []; // ứng viên chờ đủ confirmFrames khung mới được cấp chỗ
  const st = { raw: 0, kept: 0, merged: 0, mergedTotal: 0, excluded: 0, pending: 0, jumpRejected: 0, joins: 0, frames: 0 };
  const dist = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy) / Math.max(a.size, b.size);
  const fit = (s, c, now, reset) => {
    if (filter === 'euro') {
      const r = euroLandmarks(reset ? null : s.flt, c.lm, now - (s.lastSeen ?? now), c.info.size, euro);
      return { lm: r.lm, flt: r };
    }
    return { lm: smoothLandmarks(reset ? null : s.lm, c.lm, smooth) };
  };
  const snap = (others, now) => ({
    players: slots.map((s) => s && { ...s, stale: now - (s.lastFreshAt ?? now) > staleMs }),
    others,
  });

  return {
    setZone(z) { cfg.zone = z; },
    reset() { slots = Array(maxPlayers).fill(null); holding = false; anchor = null; pending = []; },
    hold(on) { holding = Boolean(on); },
    reanchor(tf = null) { holding = false; anchor = { tf }; },
    // (e) Khoá người chơi: không nhận người mới (Simon: trong lúc một lượt đang chấm).
    lockJoins(on) { joinLocked = Boolean(on); if (on) pending = []; },
    get holding() { return holding; },
    stats() { return { ...st, slots: slots.map((s) => (s ? { id: s.id, age: Math.round((s.lastSeen - s.since) / 100) / 10 } : null)) }; },
    update(list, now) {
      st.frames++;
      const raw = list || [];
      const dd = dedupe ? dedupePeople(raw) : { list: raw, merged: 0 };
      st.raw = raw.length; st.kept = dd.list.length; st.merged = dd.merged; st.mergedTotal += dd.merged;
      const people = dd.list.map((lm) => ({ lm, info: bodyInfo(lm) })).filter((p) => p.info);
      if (holding) {
        slots = slots.map((s) => s && { ...s, fresh: false, lastSeen: now, lastFreshAt: now });
        pending = [];
        return snap(people.map((p) => p.lm), now);
      }
      if (anchor) {
        // (giữ nguyên logic ghép lại sau đổi khung của bản cũ)
        const tf = anchor.tf;
        anchor = null;
        const held = slots.map((s, si) => ({ s, si })).filter((x) => x.s);
        const pool = people.filter((p) => p.info.size >= cfg.minSize * keepFrac).sort((a, b) => b.info.size - a.info.size).slice(0, held.length);
        const assign = new Map();
        if (!tf && pool.length === held.length) {
          const hs = [...held].sort((a, b) => a.s.sx - b.s.sx);
          const ps = [...pool].sort((a, b) => a.info.sx - b.info.sx);
          hs.forEach((h, i) => assign.set(h.si, ps[i]));
        } else {
          const pred = (s) => (tf ? { cx: s.cx + tf.k * (s.cx - 0.5) + tf.dx, cy: s.cy + tf.k * (s.cy - 0.5) + tf.dy, size: s.size * (1 + tf.k) } : s);
          const pairs = [];
          held.forEach(({ s, si }) => { const q = pred(s); pool.forEach((c, ci) => pairs.push({ si, ci, d: dist(c.info, q) })); });
          pairs.sort((a, b) => a.d - b.d);
          const usedC = new Set();
          for (const { si, ci, d } of pairs) {
            if (assign.has(si) || usedC.has(ci) || d > matchDist * 2.5) continue;
            assign.set(si, pool[ci]);
            usedC.add(ci);
          }
        }
        slots = slots.map((s, si) => {
          if (!s) return s;
          const c = assign.get(si);
          if (!c) return { ...s, fresh: false, lastSeen: now, lastFreshAt: now };
          return { ...s, ...c.info, legs: c.info.legs, legsMiss: 0, ...fit(s, c, now, true), vx: 0, vy: 0, lastSeen: now, lastFreshAt: now, fresh: true, jump: null };
        });
        const used = new Set([...assign.values()]);
        pending = [];
        return snap(people.filter((p) => !used.has(p)).map((p) => p.lm), now);
      }
      const [z0, z1] = cfg.zone;
      const cands = [];
      const others = [];
      people.forEach((p) => {
        const nearSlot = slots.some((s) => s && dist(p.info, s) < matchDist);
        const min = nearSlot ? cfg.minSize * keepFrac : cfg.minSize;
        if (p.info.sx >= z0 && p.info.sx <= z1 && p.info.size >= min) cands.push(p);
        else others.push(p.lm);
      });
      // (b) Dự đoán vị trí theo vận tốc rồi ghép tối ưu toàn cục.
      const pred = slots.map((s) => {
        if (!s) return null;
        const dt = Math.min(300, now - s.lastSeen);
        return { cx: s.cx + (s.vx || 0) * dt, cy: s.cy + (s.vy || 0) * dt, size: s.size };
      });
      const idx = slots.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
      const asg = bestAssign(idx.length, cands.length, (k, ci) => dist(cands[ci].info, pred[idx[k]]), matchDist);
      const usedSlot = new Set();
      const usedCand = new Set();
      // Chống "nhảy sang người khác": ứng viên nằm gần chỗ MỚI của một người khác (vừa ghép khung này) hơn là gần
      // chỗ dự đoán của chính mình => là mảnh/bản trùng của người kia; bỏ, để chỗ này giữ (mất tạm) thay vì nhảy.
      if (exclusionK > 0) asg.forEach((ci, k) => {
        if (ci < 0) return;
        const c = cands[ci];
        const own = dist(c.info, pred[idx[k]]);
        const steal = asg.some((cj, j) => j !== k && cj >= 0 && dist(c.info, cands[cj].info) < Math.min(own, exclusionK));
        if (steal) { asg[k] = -1; usedCand.add(ci); st.excluded++; }
      });
      asg.forEach((ci, k) => {
        if (ci < 0) return;
        const si = idx[k];
        const s = slots[si];
        const c = cands[ci];
        usedCand.add(ci);
        const d = dist(c.info, pred[si]);
        // (c) Từ chối cú nhảy lớn khi người cũ vừa mới thấy: phải lặp lại 2 khung liền mới nhận.
        if (d > jumpK && now - s.lastFreshAt < 200) {
          const j = s.jump && dist(c.info, s.jump) < 0.5 ? { ...c.info, n: s.jump.n + 1 } : { ...c.info, n: 1 };
          if (j.n < 2) {
            slots[si] = { ...s, jump: j };
            st.jumpRejected++;
            return; // không cập nhật, không phải "mất": giữ khung xương cũ thêm 1 khung
          }
        }
        usedSlot.add(si);
        const snapJump = d > jumpK;
        const legsMiss = c.info.legs ? 0 : s.legsMiss || now;
        const dtv = Math.max(1, now - s.lastSeen);
        const vx = snapJump ? 0 : ((s.vx || 0) * 0.6 + ((c.info.cx - s.cx) / dtv) * 0.4);
        const vy = snapJump ? 0 : ((s.vy || 0) * 0.6 + ((c.info.cy - s.cy) / dtv) * 0.4);
        slots[si] = { ...s, ...c.info, legs: c.info.legs || now - legsMiss < legsMs, legsMiss, ...fit(s, c, now, snapJump), vx, vy, lastSeen: now, lastFreshAt: now, fresh: true, jump: null };
      });

      // Ứng viên còn lại. Gần một người đang chơi (< exclusionK vai) => coi là phần thừa của người đó: bỏ, không vẽ.
      const rest = [];
      cands.forEach((c, ci) => {
        if (usedCand.has(ci)) return;
        if (exclusionK > 0 && slots.some((s) => s && dist(c.info, s) < exclusionK)) { st.excluded++; return; }
        rest.push(c);
      });
      // Chờ đủ confirmFrames khung (trong pendingMs giữa hai lần thấy) mới cấp chỗ mới.
      const ready = [];
      if (!joinLocked) {
        // ghép ứng viên với hàng chờ (gần nhất, mỗi mục 1 lần), mục không thấy quá pendingMs thì bỏ
        const pool = pending.filter((p) => now - p.last <= pendingMs);
        const next = [];
        rest.forEach((c) => {
          let bi = -1; let bd = matchDist;
          pool.forEach((p, i) => { if (p && dist(c.info, p) < bd) { bd = dist(c.info, p); bi = i; } });
          const prev = bi >= 0 ? pool[bi] : null;
          if (bi >= 0) pool[bi] = null;
          next.push({ ...c.info, n: prev ? prev.n + 1 : 1, last: now, c });
        });
        pending = [...next, ...pool.filter(Boolean).map((p) => ({ ...p, c: null }))];
        pending.filter((p) => p.c && p.n >= confirmFrames).forEach((p) => ready.push(p.c));
      }
      st.pending = pending.filter((p) => p.n < confirmFrames).length;
      const fresh = ready.sort((a, b) => b.info.size - a.info.size);
      const free = slots.map((s, i) => (s ? -1 : i)).filter((i) => i >= 0);
      const joining = fresh.slice(0, free.length).sort((a, b) => a.info.sx - b.info.sx);
      joining.forEach((c, k) => {
        st.joins++;
        slots[free[k]] = { id: nextId++, ...c.info, ...fit({}, c, now, true), vx: 0, vy: 0, lastSeen: now, lastFreshAt: now, since: now, fresh: true };
        pending = pending.filter((p) => p.c !== c);
      });
      rest.filter((c) => !joining.includes(c)).forEach((c) => others.push(c.lm));
      slots = slots.map((s, si) => {
        if (!s || usedSlot.has(si) || joining.some((c, k) => free[k] === si)) return s;
        if (now - s.lastSeen > lostMs) return null;
        return { ...s, fresh: false };
      });
      return snap(others, now);
    },
  };
}
