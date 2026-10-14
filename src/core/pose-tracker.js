// Theo dõi người chơi cho game camera khi lớp đông:
// - chỉ nhận người đứng trong "vùng chơi" (theo hình gương trên màn hình) và đủ gần camera;
// - ưu tiên người to nhất (gần camera nhất), người phía sau không được tính;
// - giữ đúng số Player 1/2/3 giữa các khung hình (ghép theo vị trí thân người), không đổi số khi di chuyển;
// - làm mịn toạ độ (EMA thích ứng: đứng yên thì mịn, cử động nhanh thì bám kịp);
// - cho biết camera có thấy chân không (để bỏ lệnh cần chân khi học sinh chỉ lộ nửa người).
// Thuần logic, không đụng DOM: test được bằng khung xương giả.

const vis = (p, min = 0.5) => Boolean(p) && (p.visibility ?? 1) >= min;

// Thông tin thân người từ 33 điểm MediaPipe Pose. x theo ảnh gốc (chưa lật gương).
export function bodyInfo(lm) {
  const ls = lm[11];
  const rs = lm[12];
  if (!vis(ls) || !vis(rs)) return null;
  const size = Math.hypot(ls.x - rs.x, ls.y - rs.y); // bề rộng vai: càng to càng gần camera
  const lh = lm[23];
  const rh = lm[24];
  const hips = vis(lh) && vis(rh);
  const cx = (ls.x + rs.x) / 2;
  const cy = hips ? (ls.y + rs.y + lh.y + rh.y) / 4 : (ls.y + rs.y) / 2;
  const legs = [25, 26, 27, 28].every((i) => vis(lm[i], 0.55) && lm[i].y < 0.99);
  return { cx, cy, sx: 1 - cx, size, legs };
}

function smoothLandmarks(prev, next, base) {
  if (!prev) return next.map((p) => ({ ...p }));
  return next.map((p, i) => {
    const q = prev[i] || p;
    const moved = Math.hypot(p.x - q.x, p.y - q.y);
    const a = Math.min(0.92, base + moved * 6); // cử động nhanh -> bám nhanh hơn
    return {
      x: q.x + (p.x - q.x) * a,
      y: q.y + (p.y - q.y) * a,
      z: (q.z ?? 0) + ((p.z ?? 0) - (q.z ?? 0)) * a,
      visibility: (q.visibility ?? 1) + ((p.visibility ?? 1) - (q.visibility ?? 1)) * 0.5,
    };
  });
}

// zone: [trái, phải] theo toạ độ màn hình gương 0..1. minSize: bề rộng vai tối thiểu (lọc người đứng quá xa).
// keepFrac: người đang chơi chỉ bị bỏ khi vai < keepFrac*minSize (camera S1 thu nhỏ khung không làm mất người). legsMs: báo "không thấy chân"
// chỉ khi mất chân liên tục legsMs. hold(true): camera đang đổi khung, giữ nguyên mọi chỗ, không nhận người mới. reanchor(tf): ghép lại sau khi
// khung ổn định (tf = { k, dx, dy } theo toạ độ chuẩn hoá ảnh gốc, hoặc null). Xem PLAN-S1-REFRAME.md.
export function createPoseTracker({ maxPlayers = 3, zone = [0, 1], minSize = 0.05, lostMs = 900, smooth = 0.45, matchDist = 1.4, keepFrac = 0.6, legsMs = 800 } = {}) {
  let slots = Array(maxPlayers).fill(null);
  let nextId = 1;
  const cfg = { zone, minSize };
  let holding = false;
  let anchor = null; // { tf } chờ ghép lại ở lần update kế tiếp

  return {
    setZone(z) {
      cfg.zone = z;
    },
    reset() {
      slots = Array(maxPlayers).fill(null);
      holding = false;
      anchor = null;
    },
    hold(on) {
      holding = Boolean(on);
    },
    reanchor(tf = null) {
      holding = false;
      anchor = { tf };
    },
    get holding() {
      return holding;
    },
    // list: mảng landmarks (mỗi phần tử 33 điểm). Trả về { players: [slot|null ...], others: [landmarks ...] }.
    update(list, now) {
      const people = (list || []).map((lm) => ({ lm, info: bodyInfo(lm) })).filter((p) => p.info);
      if (holding) {
        // Camera đang đổi khung: không chấm, không đổi chỗ; vẽ mọi người dạng mờ.
        slots = slots.map((s) => s && { ...s, fresh: false, lastSeen: now });
        return { players: slots.map((s) => s && { ...s }), others: people.map((p) => p.lm) };
      }
      if (anchor) {
        const tf = anchor.tf;
        anchor = null;
        const held = slots.map((s, si) => ({ s, si })).filter((x) => x.s);
        const pool = people.filter((p) => p.info.size >= cfg.minSize * keepFrac).sort((a, b) => b.info.size - a.info.size).slice(0, held.length);
        const assign = new Map();
        if (!tf && pool.length === held.length) {
          // Dời / phóng giữ thứ tự trái -> phải: ghép theo thứ tự.
          const hs = [...held].sort((a, b) => a.s.sx - b.s.sx);
          const ps = [...pool].sort((a, b) => a.info.sx - b.info.sx);
          hs.forEach((h, i) => assign.set(h.si, ps[i]));
        } else {
          // Dự đoán chỗ mới theo phép biến đổi của camera (nếu có) rồi ghép gần nhất, nới ngưỡng.
          const pred = (s) => (tf ? { cx: s.cx + tf.k * (s.cx - 0.5) + tf.dx, cy: s.cy + tf.k * (s.cy - 0.5) + tf.dy, size: s.size * (1 + tf.k) } : s);
          const pairs = [];
          held.forEach(({ s, si }) => {
            const q = pred(s);
            pool.forEach((c, ci) => pairs.push({ si, ci, d: Math.hypot(c.info.cx - q.cx, c.info.cy - q.cy) / Math.max(q.size, c.info.size) }));
          });
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
          if (!c) return { ...s, fresh: false, lastSeen: now };
          return { ...s, ...c.info, legs: c.info.legs, legsMiss: 0, lm: smoothLandmarks(null, c.lm, smooth), lastSeen: now, fresh: true };
        });
        const used = new Set([...assign.values()]);
        return { players: slots.map((s) => s && { ...s }), others: people.filter((p) => !used.has(p)).map((p) => p.lm) };
      }
      const [z0, z1] = cfg.zone;
      const cands = [];
      const others = [];
      people.forEach((p) => {
        // Người mới phải đủ minSize; người đang chơi (gần một chỗ đang giữ) chỉ cần keepFrac*minSize.
        const nearSlot = slots.some((s) => s && Math.hypot(p.info.cx - s.cx, p.info.cy - s.cy) / Math.max(s.size, p.info.size) < matchDist);
        const min = nearSlot ? cfg.minSize * keepFrac : cfg.minSize;
        if (p.info.sx >= z0 && p.info.sx <= z1 && p.info.size >= min) cands.push(p);
        else others.push(p.lm);
      });

      // Ghép người đang theo dõi với ứng viên gần nhất (khoảng cách chia bề rộng vai).
      const pairs = [];
      slots.forEach((s, si) => {
        if (!s) return;
        cands.forEach((c, ci) => {
          const d = Math.hypot(c.info.cx - s.cx, c.info.cy - s.cy) / Math.max(s.size, c.info.size);
          if (d < matchDist) pairs.push({ si, ci, d });
        });
      });
      pairs.sort((a, b) => a.d - b.d);
      const usedSlot = new Set();
      const usedCand = new Set();
      for (const { si, ci } of pairs) {
        if (usedSlot.has(si) || usedCand.has(ci)) continue;
        usedSlot.add(si);
        usedCand.add(ci);
        const s = slots[si];
        const c = cands[ci];
        const legsMiss = c.info.legs ? 0 : s.legsMiss || now;
        slots[si] = { ...s, ...c.info, legs: c.info.legs || now - legsMiss < legsMs, legsMiss, lm: smoothLandmarks(s.lm, c.lm, smooth), lastSeen: now, fresh: true };
      }

      // Ứng viên mới: người to (gần) nhất trước, rồi xếp vào chỗ trống theo thứ tự trái -> phải.
      const fresh = cands.filter((_, ci) => !usedCand.has(ci)).sort((a, b) => b.info.size - a.info.size);
      const free = slots.map((s, i) => (s ? -1 : i)).filter((i) => i >= 0);
      const joining = fresh.slice(0, free.length).sort((a, b) => a.info.sx - b.info.sx);
      joining.forEach((c, k) => {
        slots[free[k]] = { id: nextId++, ...c.info, lm: smoothLandmarks(null, c.lm, smooth), lastSeen: now, since: now, fresh: true };
      });
      fresh.slice(free.length).forEach((c) => others.push(c.lm));

      // Người không thấy trong khung này: giữ chỗ ngắn (mất nhận diện chớp nhoáng), quá lâu thì bỏ.
      slots = slots.map((s, si) => {
        if (!s || usedSlot.has(si) || joining.some((c, k) => free[k] === si)) return s;
        if (now - s.lastSeen > lostMs) return null;
        return { ...s, fresh: false };
      });
      return { players: slots.map((s) => s && { ...s }), others };
    },
  };
}
