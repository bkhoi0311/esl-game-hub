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
export function createPoseTracker({ maxPlayers = 3, zone = [0, 1], minSize = 0.05, lostMs = 900, smooth = 0.45, matchDist = 1.4 } = {}) {
  let slots = Array(maxPlayers).fill(null);
  let nextId = 1;
  const cfg = { zone, minSize };

  return {
    setZone(z) {
      cfg.zone = z;
    },
    reset() {
      slots = Array(maxPlayers).fill(null);
    },
    // list: mảng landmarks (mỗi phần tử 33 điểm). Trả về { players: [slot|null ...], others: [landmarks ...] }.
    update(list, now) {
      const people = (list || []).map((lm) => ({ lm, info: bodyInfo(lm) })).filter((p) => p.info);
      const [z0, z1] = cfg.zone;
      const cands = [];
      const others = [];
      people.forEach((p) => {
        if (p.info.sx >= z0 && p.info.sx <= z1 && p.info.size >= cfg.minSize) cands.push(p);
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
        slots[si] = { ...s, ...c.info, lm: smoothLandmarks(s.lm, c.lm, smooth), lastSeen: now, fresh: true };
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
