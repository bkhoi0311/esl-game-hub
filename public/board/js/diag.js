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

export function createDiag({ getInfo, onToast }) {
  const st = {
    active: 0, maxSimul: 0, cancels: 0, cancelsWithOthers: 0, lostCaptures: 0,
    types: { touch: 0, pen: 0, mouse: 0, other: 0 },
    last: { type: '-', p: 0, w: 0, h: 0 },
  };
  const ring = [];
  const t0 = performance.now();
  let hudOpen = false, timer = 0, clicks = [];

  const hud = document.createElement('div');
  hud.className = 'pane pane--hud';
  hud.id = 'hud';
  hud.hidden = true;
  hud.setAttribute('data-testid', 'hud');
  hud.innerHTML =
    '<div class="hud-head"><strong>Chẩn đoán</strong>' +
    '<span class="hud-actions"><button type="button" class="hud-btn" data-testid="hud-copy">Sao chép</button>' +
    '<button type="button" class="hud-btn" data-testid="hud-close" aria-label="Đóng">Đóng</button></span></div>' +
    '<pre class="hud-pre" data-testid="hud-text"></pre>' +
    '<textarea class="hud-copybox" data-testid="hud-copybox" hidden readonly></textarea>';
  const pre = hud.querySelector('.hud-pre');
  const copyBox = hud.querySelector('.hud-copybox');

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function log(msg) {
    const t = ((performance.now() - t0) / 1000).toFixed(2);
    ring.push(t + 's ' + msg);
    if (ring.length > 40) ring.shift();
  }

  function typeKey(t) { return t === 'touch' || t === 'pen' || t === 'mouse' ? t : 'other'; }

  function build() {
    const i = getInfo();
    const f = (n, d) => (typeof n === 'number' ? n.toFixed(d) : '-');
    const lines = [
      'Đang chạm: ' + st.active,
      'Nhiều nhất cùng lúc: ' + st.maxSimul,
      'pointercancel: ' + st.cancels + ' (khi có ngón khác: ' + st.cancelsWithOthers + ') · mất capture: ' + st.lostCaptures,
      'Loại pointer: touch ' + st.types.touch + ' · pen ' + st.types.pen + ' · mouse ' + st.types.mouse,
      'Gần nhất: ' + st.last.type + ' · áp lực ' + f(st.last.p, 2) + ' · w ' + f(st.last.w, 1) + ' · h ' + f(st.last.h, 1),
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
    if (v) { refresh(); timer = setInterval(refresh, 250); }
  }

  hud.querySelector('[data-testid="hud-close"]').addEventListener('click', () => setOpen(false));
  hud.querySelector('[data-testid="hud-copy"]').addEventListener('click', async () => {
    const text = build();
    try {
      await navigator.clipboard.writeText(text);
      if (onToast) onToast('Đã sao chép số liệu chẩn đoán.');
    } catch (e) {
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
    setOpen,
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
