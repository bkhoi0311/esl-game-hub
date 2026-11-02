// Thư viện tư thế cố định cho Simon Says Pose. Chỉ gồm tư thế nhận diện ổn định bằng vị trí tương đối các điểm.
// Toạ độ MediaPipe: x,y trong 0..1, y hướng xuống. "left" = bên trái CỦA HỌC SINH (không phụ thuộc hình gương).
import { POSE as P } from '../../core/vision.js';
import { SIMON_POSES, simonCommand } from '../../core/voice-lines.js';

const vis = (p, min = 0.5) => p && (p.visibility ?? 1) >= min;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function frame(lm) {
  const ls = lm[P.leftShoulder];
  const rs = lm[P.rightShoulder];
  if (!vis(ls) || !vis(rs)) return null;
  const sw = Math.max(0.04, dist(ls, rs)); // bề rộng vai làm thước đo
  return { ls, rs, sw, nose: lm[P.nose], lw: lm[P.leftWrist], rw: lm[P.rightWrist], le: lm[P.leftElbow], re: lm[P.rightElbow] };
}

const raised = (w, f) => vis(w) && vis(f.nose) && w.y < f.nose.y;

// Đầu ngón tay (MediaPipe Pose 33 điểm): ngón trỏ 19/20, ngón cái 21/22. Cổ tay nằm dưới cằm khi ngón chạm mũi,
// nên đo chạm bằng cổ tay bắt bé phải đưa tay cao quá mũi. Thêm điểm ước lượng: cổ tay kéo dài theo cẳng tay.
const HAND = { left: { index: 19, thumb: 21 }, right: { index: 20, thumb: 22 } };
function handPoints(lm, side, w, e) {
  const pts = [lm[HAND[side].index], lm[HAND[side].thumb], w];
  if (vis(w, 0.3) && vis(e, 0.3)) pts.push({ x: w.x + (w.x - e.x) * 0.45, y: w.y + (w.y - e.y) * 0.45, visibility: Math.min(w.visibility ?? 1, e.visibility ?? 1) });
  return pts.filter((p) => vis(p, 0.3));
}
const lowered = (w, s, f) => !vis(w) || w.y > s.y - 0.1 * f.sw;

export const POSES = [
  {
    id: 'left-hand', text: SIMON_POSES['left-hand'],
    check(lm) {
      const f = frame(lm);
      return Boolean(f) && raised(f.lw, f) && lowered(f.rw, f.rs, f);
    },
  },
  {
    id: 'right-hand', text: SIMON_POSES['right-hand'],
    check(lm) {
      const f = frame(lm);
      return Boolean(f) && raised(f.rw, f) && lowered(f.lw, f.ls, f);
    },
  },
  {
    id: 'hands-up', text: SIMON_POSES['hands-up'],
    check(lm) {
      const f = frame(lm);
      return Boolean(f) && raised(f.lw, f) && raised(f.rw, f);
    },
  },
  {
    id: 'hands-on-head', text: SIMON_POSES['hands-on-head'],
    check(lm) {
      const f = frame(lm);
      if (!f || !vis(f.lw) || !vis(f.rw) || !vis(f.nose)) return false;
      const near = (w) => Math.abs(w.x - f.nose.x) < 1.0 * f.sw && w.y < f.nose.y + 0.15 * f.sw && w.y > f.nose.y - 1.1 * f.sw;
      const elbowsUp = vis(f.le) && vis(f.re) && f.le.y < f.ls.y + 0.25 * f.sw && f.re.y < f.rs.y + 0.25 * f.sw;
      return near(f.lw) && near(f.rw) && elbowsUp;
    },
  },
  {
    id: 't-pose', text: SIMON_POSES['t-pose'],
    check(lm) {
      const f = frame(lm);
      if (!f || !vis(f.lw) || !vis(f.rw)) return false;
      const flat = (w, s) => Math.abs(w.y - s.y) < 0.45 * f.sw;
      const wide = Math.abs(f.lw.x - f.rw.x) > 2.4 * f.sw;
      return flat(f.lw, f.ls) && flat(f.rw, f.rs) && wide;
    },
  },
  {
    id: 'touch-nose', text: SIMON_POSES['touch-nose'],
    check(lm) {
      const f = frame(lm);
      if (!f || !vis(f.nose, 0.3)) return false;
      // Tay phải đưa lên mặt (cổ tay cao hơn ngực) và một đầu ngón / điểm ước lượng sát mũi.
      const touch = (side, w, e, s) => vis(w, 0.3) && w.y < s.y + 0.35 * f.sw
        && handPoints(lm, side, w, e).some((p) => dist(p, f.nose) < 0.45 * f.sw);
      return touch('left', f.lw, f.le, f.ls) || touch('right', f.rw, f.re, f.rs);
    },
  },
  {
    id: 'one-leg', text: SIMON_POSES['one-leg'],
    check(lm) {
      const la = lm[P.leftAnkle];
      const ra = lm[P.rightAnkle];
      const lh = lm[P.leftHip];
      const lk = lm[P.leftKnee];
      if (!vis(la) || !vis(ra) || !vis(lh) || !vis(lk)) return false;
      const leg = Math.max(0.05, dist(lh, lk) + dist(lk, la));
      return Math.abs(la.y - ra.y) > 0.22 * leg;
    },
  },
  {
    id: 'squat', text: SIMON_POSES['squat'],
    check(lm) {
      const pts = [P.leftHip, P.rightHip, P.leftKnee, P.rightKnee, P.leftAnkle, P.rightAnkle].map((i) => lm[i]);
      if (!pts.every((p) => vis(p, 0.4))) return false;
      const [lh, rh, lk, rk, la, ra] = pts;
      const hipY = (lh.y + rh.y) / 2;
      const kneeY = (lk.y + rk.y) / 2;
      const ankleY = (la.y + ra.y) / 2;
      return kneeY - hipY < 0.55 * (ankleY - kneeY);
    },
  },
];

export function commandText(pose, simonSays) {
  return simonCommand(pose.text, simonSays);
}
