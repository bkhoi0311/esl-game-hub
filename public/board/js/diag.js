// HUD chẩn đoán: số liệu pointer, hiệu năng, tham số ClassIn (che giá trị cá nhân), nhật ký 40 sự kiện.
const SHOWN = ['deviceType', 'lang', 'identity'];                                  // hiện giá trị
const MASKED = ['uid', 'nickname', 'initiatorUid', 'schoolId', 'courseId', 'classId']; // chỉ hiện có/không

export function describeParams(search) {
  const q = new URLSearchParams(search);
  const parts = [];
  for (const k of SHOWN) parts.push(q.has(k) ? k + '=' + q.get(k) : k + ' không');
  for (const k of MASKED) parts.push(k + ' ' + (q.has(k) ? 'có' : 'không'));
  return parts.join(' · ');
}

function gpuInfo() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return 'không có WebGL (có thể CEF tắt GPU ⇒ ghép lớp phần mềm)';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    return r + (/swiftshader|llvmpipe|software|basic render/i.test(r) ? ' (PHẦN MỀM)' : '');
  } catch (e) { return 'lỗi đọc GPU'; }
}

const avgOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const p95Of = (a) => {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
};
const vn = (n, d) => (typeof n === 'number' && isFinite(n) ? n.toFixed(d).replace('.', ',') : '-');

export function createDiag({ getInfo, onToast, onReset }) {
  const st = {
    active: 0, maxSimul: 0, cancels: 0, cancelsWithOthers: 0, lostCaptures: 0,
    types: { touch: 0, pen: 0, mouse: 0, other: 0 },
    last: { type: '-', p: 0, w: 0, h: 0 },
  };
  const ring = [];
  const t0 = performance.now();
  let hudOpen = false, timer = 0, clicks = [];
  let mv = [];                         // mẫu pointermove: {t, n, ms, age}
  let idle = null, probing = false;    // kết quả nút "Đo 3 s"
  let gpu = null, mini = null, miniTimer = 0;

  const hud = document.createElement('div');
  hud.className = 'pane pane--hud';
  hud.id = 'hud';
  hud.hidden = true;
  hud.setAttribute('data-testid', 'hud');
  hud.innerHTML =
    '<div class="hud-head"><strong>Chẩn đoán</strong>' +
    '<span class="hud-actions"><button type="button" class="hud-btn" data-testid="hud-probe">Đo 3 s</button>' +
    '<button type="button" class="hud-btn" data-testid="hud-reset">Đặt lại</button>' +
    '<button type="button" class="hud-btn" data-testid="hud-copy">Sao chép</button>' +
    '<button type="button" class="hud-btn" data-testid="hud-close" aria-label="Đóng">Đóng</button></span></div>' +
    '<pre class="hud-pre" data-testid="hud-text"></pre>';
  const pre = hud.querySelector('.hud-pre');
  let copyBox = null; // tạo khi cần: trang bảng không có ô nhập chữ nào để bàn phím ảo của màn cảm ứng không tự hiện

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function log(msg) {
    const t = ((performance.now() - t0) / 1000).toFixed(2);
    ring.push(t + 's ' + msg);
    if (ring.length > 40) ring.shift();
  }

  function typeKey(t) { return t === 'touch' || t === 'pen' || t === 'mouse' ? t : 'other'; }

  // Thống kê pointermove trong cửa sổ 2 s gần nhất.
  function moveStats() {
    const now = performance.now();
    const w = mv.filter((m) => now - m.t <= 2000);
    if (!w.length) return null;
    const span = w.length >= 2 ? Math.max(0.1, (w[w.length - 1].t - w[0].t) / 1000) : 2;
    let pts = 0;
    for (const m of w) pts += m.n;
    const ms = w.map((m) => m.ms);
    const age = w.map((m) => m.age).filter((a) => a >= 0 && a <= 10000);
    return {
      perSec: w.length / span, ptsPerSec: pts / span, msAvg: avgOf(ms), msP95: p95Of(ms),
      ageAvg: avgOf(age), ageP95: p95Of(age),
    };
  }

  function summary(i) {
    const c = i.counters || {};
    const mp = (c.dirtyCssPerFrame || 0) / 1e6;
    return { c, mp, mpPhys: (mp * i.dpr * i.dpr) };
  }

  function build() {
    const i = getInfo();
    const m = moveStats();
    const { c, mp, mpPhys } = summary(i);
    if (gpu == null) gpu = gpuInfo();
    const f = (n, d) => (typeof n === 'number' ? n.toFixed(d) : '-');
    const lines = [
      'Đang chạm: ' + st.active,
      'Nhiều nhất cùng lúc: ' + st.maxSimul,
      'pointercancel: ' + st.cancels + ' (khi có ngón khác: ' + st.cancelsWithOthers + ') · mất capture: ' + st.lostCaptures,
      'Loại pointer: touch ' + st.types.touch + ' · pen ' + st.types.pen + ' · mouse ' + st.types.mouse,
      'Gần nhất: ' + st.last.type + ' · áp lực ' + f(st.last.p, 2) + ' · w ' + f(st.last.w, 1) + ' · h ' + f(st.last.h, 1),
      'Hồ sơ: ' + (i.profile || '-'),
      'Canvas: ' + (i.canvasInfo ? i.canvasInfo.desc + ' = ' + vn(i.canvasInfo.mp, 2) + ' MP' : '-') + ' · màn vật lý ' + i.physW + 'x' + i.physH + ' · DPR ' + i.dpr,
      'Khung khi vẽ: ' + i.perf.fps + ' fps · khoảng p95 ' + vn(i.perf.intervalP95, 1) + ' ms · nhàn rỗi (Đo 3 s): ' +
        (probing ? 'đang đo…' : idle ? Math.round(idle.fps) + ' fps p95 ' + vn(idle.p95, 0) + ' ms' : 'chưa đo'),
      'JS vẽ/khung: avg ' + vn(i.perf.avgMs, 2) + ' ms · p95 ' + vn(i.perf.p95Ms, 2) + ' ms · getStroke ' +
        vn(c.frames ? c.getStroke / c.frames : 0, 2) + '/khung (tổng ' + (c.getStroke || 0) + ') · điểm PF ' + vn(c.frames ? c.pfPts / c.frames : 0, 0) + '/khung',
      'pointermove: ' + (m ? vn(m.perSec, 0) + '/s · điểm gộp ' + vn(m.ptsPerSec, 0) + '/s · xử lý avg ' + vn(m.msAvg, 2) + ' ms · p95 ' + vn(m.msP95, 2) +
        ' ms · tuổi sự kiện avg ' + vn(m.ageAvg, 0) + ' · p95 ' + vn(m.ageP95, 0) + ' ms' : '(chưa có dữ liệu)'),
      'Trễ sự kiện→khung: avg ' + vn(c.latAvg || 0, 0) + ' ms · p95 ' + vn(c.latP95 || 0, 0) + ' ms · vẽ lại/khung ' + vn(mp, 2) + ' MP CSS (≈ ' + vn(mpPhys, 1) + ' MP vật lý)',
      'GPU: ' + gpu,
      'FPS ' + i.perf.fps + ' · vẽ avg ' + f(i.perf.avgMs, 2) + ' ms · p95 ' + f(i.perf.p95Ms, 2) + ' ms',
      'DPR ' + i.dpr + ' · k ' + f(i.k, 2) + ' · canvas ' + i.canvas[0] + 'x' + i.canvas[1],
      'maxTouchPoints ' + i.maxTouchPoints + ' · cửa sổ ' + i.W + 'x' + i.H + ' · s ' + f(i.s, 2),
      i.glassText,
      'Tham số: ' + describeParams(i.search),
      'UA: ' + i.ua,
      '--- nhật ký ---',
    ].concat(ring.length ? ring.slice().reverse() : ['(trống)']);
    return lines.join('\n');
  }

  function refresh() { if (hudOpen) pre.textContent = build(); }

  function setOpen(v) {
    hudOpen = v;
    hud.hidden = !v;
    clearInterval(timer);
    if (v) { refresh(); timer = setInterval(refresh, getInfo().calm ? 1000 : 250); }
  }

  // Đo nhịp khung lúc nhàn rỗi: vòng rAF riêng 3 s.
  function probe() {
    if (probing) return;
    probing = true;
    const ts = [];
    const t0p = performance.now();
    const tick = (t) => {
      ts.push(t);
      if (performance.now() - t0p < 3000) { requestAnimationFrame(tick); return; }
      const iv = [];
      for (let j = 1; j < ts.length; j++) iv.push(ts[j] - ts[j - 1]);
      idle = { fps: ts.length / 3, p95: p95Of(iv) };
      probing = false;
      refresh();
    };
    requestAnimationFrame(tick);
    refresh();
  }
  hud.querySelector('[data-testid="hud-probe"]').addEventListener('click', probe);
  hud.querySelector('[data-testid="hud-reset"]').addEventListener('click', () => {
    mv = [];
    if (onReset) onReset();
    refresh();
  });

  function miniText() {
    const i = getInfo();
    const m = moveStats();
    const { c, mp } = summary(i);
    return i.perfName + ' · ' + i.perf.fps + 'fps p95 ' + vn(i.perf.intervalP95, 0) + 'ms · mv ' + (m ? vn(m.perSec, 0) : '-') + '/s · trễ ' +
      vn(c.latAvg || 0, 0) + '/' + vn(c.latP95 || 0, 0) + 'ms · JS ' + vn(i.perf.avgMs, 1) + 'ms · ' + vn(mp, 2) + 'MP/khung · k' + vn(i.k, 2);
  }
  function setMini(v) {
    clearInterval(miniTimer);
    if (!v) { if (mini) mini.hidden = true; return; }
    if (!mini) {
      mini = document.createElement('div');
      mini.className = 'hud-mini';
      mini.setAttribute('data-testid', 'hud-mini');
      document.body.appendChild(mini);
    }
    mini.hidden = false;
    mini.textContent = miniText();
    miniTimer = setInterval(() => { mini.textContent = miniText(); }, 1000);
  }

  hud.querySelector('[data-testid="hud-close"]').addEventListener('click', () => setOpen(false));
  hud.querySelector('[data-testid="hud-copy"]').addEventListener('click', async () => {
    const text = build();
    try {
      await navigator.clipboard.writeText(text);
      if (onToast) onToast('Đã sao chép số liệu chẩn đoán.');
    } catch (e) {
      if (!copyBox) {
        copyBox = document.createElement('textarea');
        copyBox.className = 'hud-copybox';
        copyBox.setAttribute('data-testid', 'hud-copybox');
        copyBox.setAttribute('readonly', '');
        copyBox.setAttribute('inputmode', 'none');
        hud.appendChild(copyBox);
      }
      copyBox.hidden = false;
      copyBox.value = text;
      copyBox.focus();
      copyBox.select();
      if (onToast) onToast('Không sao chép tự động được. Hãy chép chữ đang chọn.');
    }
  });

  return {
    hud, st,
    log,
    isOpen: () => hudOpen,
    setOpen, setMini,
    moveStat(n, ms, age) {
      mv.push({ t: performance.now(), n, ms, age });
      if (mv.length > 600) mv.shift();
    },
    toggle: () => setOpen(!hudOpen),
    // bấm 5 lần trong 3 giây vào nhãn
    labelClick() {
      const now = performance.now();
      clicks = clicks.filter((t) => now - t < 3000);
      clicks.push(now);
      if (clicks.length >= 5) { clicks = []; setOpen(!hudOpen); }
    },
    setActive(n) {
      st.active = n;
      if (n > st.maxSimul) st.maxSimul = n;
    },
    down(e) {
      st.types[typeKey(e.pointerType)]++;
      this.note(e);
      log('down ' + e.pointerType + '#' + e.pointerId + ' ' + Math.round(e.clientX) + ',' + Math.round(e.clientY));
    },
    note(e) {
      st.last = { type: e.pointerType, p: e.pressure, w: e.width, h: e.height };
    },
    up(e, why) { log((why || 'up') + ' ' + e.pointerType + '#' + e.pointerId); },
    cancel(e, others) {
      st.cancels++;
      if (others) st.cancelsWithOthers++;
      log('CANCEL ' + e.pointerType + '#' + e.pointerId);
    },
    lost(e) { st.lostCaptures++; log('lostcapture #' + e.pointerId); },
    text: build,
    refresh,
  };
}
