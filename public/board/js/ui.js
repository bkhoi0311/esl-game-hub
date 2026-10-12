// Giao diện: thanh trên, dock từng vùng, khay màu/cỡ, hộp thoại, toast, dải cảnh báo, bảng Thông tin.
import { icon } from './icons.js';
import { isHugePalm } from './palm.js';

export const COLORS = [
  { key: 'white', name: 'Trắng', hex: '#FFFFFF' },
  { key: 'red', name: 'Đỏ', hex: '#FF4D4F' },
  { key: 'yellow', name: 'Vàng', hex: '#FFD43B' },
  { key: 'green', name: 'Xanh lá', hex: '#40C057' },
  { key: 'blue', name: 'Xanh dương', hex: '#4DABF7' },
  { key: 'orange', name: 'Cam', hex: '#FF922B' },
];
export const SIZES = [
  { v: 5, name: 'Mảnh', dot: 6 },
  { v: 10, name: 'Vừa', dot: 11 },
  { v: 20, name: 'Đậm', dot: 18 },
];
const WIDE_MIN = 760;        // (đơn vị gốc, chia cho s): từ đây dock dạng rộng
const TRAY_IDLE_MS = 5000;

const $ = (sel, root) => (root || document).querySelector(sel);
function h(tag, cls, html, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

// Nút dùng pointerdown + pointerup cùng pointerId trên cùng nút (không dựa vào click).
export function pressable(el, fn) {
  let pid = null;
  el.addEventListener('pointerdown', (e) => {
    if (isHugePalm(e)) return; // nút luôn bấm được; chỉ bỏ qua chạm to bất thường
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pid = e.pointerId;
    el.classList.add('is-pressed');
  });
  const release = () => { el.classList.remove('is-pressed'); pid = null; };
  el.addEventListener('pointerup', (e) => {
    if (e.pointerId !== pid) return;
    const r = el.getBoundingClientRect();
    const inside = e.clientX >= r.left - 6 && e.clientX <= r.right + 6 && e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6;
    release();
    if (inside) fn(e);
  });
  el.addEventListener('pointercancel', release);
  el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') release(); });
  // bàn phím (Enter/Space sinh click với detail = 0)
  el.addEventListener('click', (e) => { if (e.detail === 0) fn(e); });
}

const FROM_HUB = new URLSearchParams(location.search).get('from') === 'hub';

export function createUI({ board, brand, actions, getS }) {
  const root = document.documentElement;
  const topbar = $('#topbar');
  const overlay = $('#overlay');
  const floaters = $('#floaters');
  const zoneUI = {};                 // zoneId -> {wrap, dock, tray, open, timer, wide}
  let toastEl = null, toastTimer = 0;
  let bannerEl = null;
  let dialogEl = null, dialogResolve = null;
  let infoEl = null;
  let curRects = [];
  let n = board.zones.length;

  /* ---------- thanh trên ---------- */
  function buildTopbar() {
    const logoHtml = !brand.wordmark ? '' :
      (brand.logo
        ? '<img class="logo-img" data-testid="brand-logo" src="./assets/classin-logo.png" alt="ClassIn" width="887" height="231">'
        : '<span class="brand-word" data-testid="brand-wordmark">ClassIn</span>');
    const second = brand.wordmark
      ? '<span class="tb-pill" data-testid="brand-pill"><i></i>' + brand.label + '</span>'
      : '<span class="tb-sub" data-testid="brand-sub">Công cụ bổ trợ cho ClassIn X</span>';
    // Nút "Về màn chọn": chỉ có khi mở từ màn chọn của Hub (URL có from=hub)
    const backHtml = FROM_HUB
      ? '<button type="button" class="tbtn tbtn--icon tbtn--back" data-testid="back-hub" aria-label="Về màn chọn">' + icon('chevron-left') + '</button><span class="tb-div tb-div--back"></span>'
      : '';
    topbar.innerHTML =
      '<div class="tb-left">' + backHtml + logoHtml + (brand.wordmark ? '<span class="tb-div"></span>' : '') +
      '<div class="tb-title" data-testid="brand-label">' +
      '<div class="tb-row"><span class="tb-name">Bảng nhiều người viết</span>' + second + '</div>' +
      '<div class="tb-disc" data-testid="brand-disclaimer">' + brand.disclaimer + '</div></div></div>' +
      '<div class="tb-right"><div class="seg" role="group" aria-label="Số vùng"></div>' +
      '<button type="button" class="tbtn tbtn--danger" data-testid="clear-all" aria-label="Xoá hết">' + icon('trash-2') + '<span class="tb-label">Xoá hết</span></button>' +
      '<button type="button" class="tbtn tbtn--icon" data-testid="fullscreen" aria-label="Toàn màn hình">' + icon('maximize') + '</button>' +
      '<button type="button" class="tbtn tbtn--icon" data-testid="info" aria-label="Thông tin">' + icon('info') + '</button></div>';
    const seg = $('.seg', topbar);
    for (let i = 1; i <= 4; i++) {
      const b = h('button', 'segbtn', String(i), { type: 'button', 'data-testid': 'zones-' + i, 'aria-label': 'Chia ' + i + ' vùng' });
      pressable(b, () => actions.setZones(i));
      seg.appendChild(b);
    }
    if (FROM_HUB) pressable($('[data-testid="back-hub"]', topbar), () => askBackHub());
    pressable($('[data-testid="clear-all"]', topbar), () => askClearAll());
    const fs = $('[data-testid="fullscreen"]', topbar);
    if (!document.fullscreenEnabled) fs.hidden = true;
    pressable(fs, toggleFullscreen);
    document.addEventListener('fullscreenchange', () => {
      const on = !!document.fullscreenElement;
      fs.innerHTML = icon(on ? 'minimize' : 'maximize');
      fs.setAttribute('aria-label', on ? 'Thoát toàn màn hình' : 'Toàn màn hình');
    });
    pressable($('[data-testid="info"]', topbar), showInfo);
    refreshTopbar();
  }

  function refreshTopbar() {
    for (let i = 1; i <= 4; i++) {
      const b = $('[data-testid="zones-' + i + '"]', topbar);
      const on = i === board.zones.length;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function toggleFullscreen() {
    try {
      const p = document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen();
      if (p && p.catch) p.catch(fsDenied);
    } catch (e) { fsDenied(); }
  }
  function fsDenied() { toast('Cửa sổ này không cho toàn màn hình. Hãy phóng to cửa sổ bằng thanh của ClassIn.'); }

  async function askBackHub() {
    // Rời bảng là mất nét viết (bảng không lưu): hỏi lại nếu còn nét.
    let go = true;
    if (board.zones.some((z) => z.strokes.length)) {
      go = await confirmDialog({ title: 'Về màn chọn?', body: 'Nét viết trên bảng sẽ mất.', ok: 'Rời bảng', cancel: 'Ở lại', danger: true });
    }
    if (go) location.href = '../start/index.html';
  }

  async function askClearAll() {
    const ok = await confirmDialog({ title: 'Xoá hết bảng?', body: 'Mọi vùng sẽ được xoá. Có thể hoàn tác từng vùng.', ok: 'Xoá hết', cancel: 'Huỷ', danger: true });
    if (ok) actions.clearAll();
  }

  /* ---------- vùng: dock, khay, huy hiệu, khe ---------- */
  function dockBtn(zid, key, label, ic) {
    const b = h('button', 'dbtn', icon(ic), { type: 'button', 'data-testid': 'z' + zid + '-' + key, 'aria-label': label });
    return b;
  }

  function buildZoneUI(z, rect, wide, grid) {
    const zid = z.id;
    const wrap = h('div', 'zone-ui');
    wrap.style.left = rect.x + 'px';
    wrap.style.top = rect.y - curTop + 'px';
    wrap.style.width = rect.w + 'px';
    wrap.style.height = rect.h + 'px';
    if (n >= 2) wrap.appendChild(h('div', 'zone-badge', String(zid), { 'data-testid': 'badge-' + zid }));

    const pen = dockBtn(zid, 'pen', 'Bút', 'pen-line');
    pen.insertAdjacentHTML('beforeend', '<span class="pen-dot"></span>');
    const er = dockBtn(zid, 'eraser', 'Tẩy', 'eraser');
    const un = dockBtn(zid, 'undo', 'Hoàn tác', 'undo-2');
    const cl = dockBtn(zid, 'clear', 'Xoá vùng ' + zid, 'trash-2');
    const dock = h('div', 'pane pane--dock dock' + (wide ? ' dock--wide' : '') + (grid ? ' dock--grid' : ''), null, { 'data-testid': 'z' + zid + '-dock', role: 'toolbar', 'aria-label': 'Công cụ vùng ' + zid });
    const info = { wrap, dock, tray: null, open: false, timer: 0, wide, pen };

    const colorBtn = (c) => {
      const b = h('button', 'cdot', '<span style="background:' + c.hex + '"></span>', { type: 'button', 'data-testid': 'z' + zid + '-color-' + c.key, 'aria-label': c.name });
      b.dataset.hex = c.hex;
      pressable(b, () => pick(zid, { color: c.hex }));
      return b;
    };
    const sizeBtn = (s) => {
      const b = h('button', 'sdot', '<span style="width:calc(' + s.dot + 'px * var(--s));height:calc(' + s.dot + 'px * var(--s))"></span>', { type: 'button', 'data-testid': 'z' + zid + '-size-' + s.v, 'aria-label': s.name });
      b.dataset.size = s.v;
      pressable(b, () => pick(zid, { size: s.v }));
      return b;
    };

    if (wide) {
      dock.append(pen, er, h('i', 'vr'));
      COLORS.forEach((c) => dock.appendChild(colorBtn(c)));
      dock.appendChild(h('i', 'vr'));
      SIZES.forEach((s) => dock.appendChild(sizeBtn(s)));
      dock.append(h('i', 'vr'), un, cl);
    } else {
      dock.append(pen, er, un, cl);
      const tray = h('div', 'pane pane--tray tray', null, { 'data-testid': 'z' + zid + '-tray', role: 'group', 'aria-label': 'Màu và cỡ nét vùng ' + zid });
      tray.hidden = true;
      COLORS.forEach((c) => tray.appendChild(colorBtn(c)));
      SIZES.forEach((s) => tray.appendChild(sizeBtn(s)));
      tray.addEventListener('pointerdown', () => armTrayTimer(zid));
      info.tray = tray;
      wrap.appendChild(tray);
    }
    wrap.appendChild(dock);

    pressable(pen, () => {
      const zone = board.zones[zid - 1];
      if (zone.tool === 'eraser') { zone.tool = 'pen'; closeTray(zid); refreshZone(zone); return; }
      if (info.wide) return;
      if (info.open) closeTray(zid); else openTray(zid);
    });
    pressable(er, () => { const zone = board.zones[zid - 1]; zone.tool = 'eraser'; closeTray(zid); refreshZone(zone); });
    pressable(un, () => actions.undo(zid));
    pressable(cl, () => actions.clearZone(zid));
    zoneUI[zid] = info;
    return wrap;
  }

  function pick(zid, change) {
    const zone = board.zones[zid - 1];
    Object.assign(zone, change);
    zone.tool = 'pen';
    closeTray(zid);
    refreshZone(zone);
  }

  let curTop = 0;
  function renderOverlay(rects, s, topH) {
    curTop = topH;
    curRects = rects;
    n = board.zones.length;
    for (const id in zoneUI) clearTimeout(zoneUI[id].timer);
    overlay.innerHTML = '';
    for (const k in zoneUI) delete zoneUI[k];
    // khe giữa các vùng
    for (let i = 0; i < rects.length - 1; i++) {
      const a = rects[i], b = rects[i + 1];
      const sep = h('div', 'zone-sep');
      if (b.x > a.x) { sep.style.left = a.x + a.w + 'px'; sep.style.top = a.y - topH + 'px'; sep.style.width = b.x - (a.x + a.w) + 'px'; sep.style.height = a.h + 'px'; }
      else { sep.style.left = a.x + 'px'; sep.style.top = a.y + a.h - topH + 'px'; sep.style.width = a.w + 'px'; sep.style.height = b.y - (a.y + a.h) + 'px'; }
      overlay.appendChild(sep);
    }
    for (const r of rects) {
      const z = board.zones[r.id - 1];
      const wide = r.w / s >= WIDE_MIN;
      const grid = !wide && r.w < Math.round(222 * s) + 16;
      overlay.appendChild(buildZoneUI(z, r, wide, grid));
      refreshZone(z);
    }
  }

  function refreshZone(zone) {
    const u = zoneUI[zone.id];
    if (!u) return;
    const q = (k) => $('[data-testid="z' + zone.id + '-' + k + '"]', u.wrap);
    const pen = q('pen'), er = q('eraser'), un = q('undo');
    pen.classList.toggle('is-active', zone.tool === 'pen');
    er.classList.toggle('is-active', zone.tool === 'eraser');
    pen.style.setProperty('--ink', zone.color);
    const dot = $('.pen-dot', pen);
    const sz = SIZES.find((x) => x.v === zone.size) || SIZES[1];
    dot.style.background = zone.color;
    dot.style.width = dot.style.height = 'calc(' + Math.max(5, sz.dot * 0.6) + 'px * var(--s))';
    un.classList.toggle('is-disabled', zone.undo.length === 0);
    un.setAttribute('aria-disabled', zone.undo.length === 0 ? 'true' : 'false');
    u.wrap.querySelectorAll('.cdot').forEach((b) => {
      const on = b.dataset.hex === zone.color;
      b.classList.toggle('is-selected', on);
      b.style.setProperty('--ink', b.dataset.hex);
    });
    u.wrap.querySelectorAll('.sdot').forEach((b) => {
      b.classList.toggle('is-selected', Number(b.dataset.size) === zone.size);
      b.style.setProperty('--ink', zone.color);
      b.firstChild.style.background = zone.color;
    });
  }
  function refreshAll() { board.zones.forEach(refreshZone); }

  function openTray(zid) {
    const u = zoneUI[zid];
    if (!u || !u.tray) return;
    u.open = true;
    u.tray.hidden = false;
    u.tray.classList.remove('open');
    requestAnimationFrame(() => { if (u.open) u.tray.classList.add('open'); });
    armTrayTimer(zid);
  }
  function armTrayTimer(zid) {
    const u = zoneUI[zid];
    if (!u) return;
    clearTimeout(u.timer);
    u.timer = setTimeout(() => closeTray(zid), TRAY_IDLE_MS);
  }
  // Trả true nếu khay của vùng đang mở và vừa được đóng.
  function closeTray(zid) {
    const u = zoneUI[zid];
    if (!u || !u.open) return false;
    u.open = false;
    clearTimeout(u.timer);
    u.tray.classList.remove('open');
    u.tray.hidden = true;
    return true;
  }
  function closeAllTrays() { let any = false; for (const id in zoneUI) any = closeTray(Number(id)) || any; return any; }

  /* ---------- toast, dải cảnh báo ---------- */
  function toast(text, ms) {
    if (!toastEl) {
      toastEl = h('div', 'pane pane--toast toast', null, { 'data-testid': 'toast', role: 'status' });
      floaters.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.hidden = false;
    toastEl.classList.remove('show');
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; toastEl.classList.remove('show'); }, ms || 2500);
  }

  function showBanner(text) {
    floaters.classList.add('has-banner');
    if (bannerEl) { bannerEl.hidden = false; return; }
    bannerEl = h('div', 'pane pane--banner banner', icon('triangle-alert') + '<span class="banner-text"></span>', { 'data-testid': 'banner', role: 'alert' });
    $('.banner-text', bannerEl).textContent = text;
    const x = h('button', 'tbtn tbtn--icon banner-x', icon('x'), { type: 'button', 'data-testid': 'banner-close', 'aria-label': 'Đóng' });
    pressable(x, hideBanner);
    bannerEl.appendChild(x);
    floaters.appendChild(bannerEl);
  }
  function hideBanner() { if (bannerEl) bannerEl.hidden = true; floaters.classList.remove('has-banner'); }
  const bannerVisible = () => !!bannerEl && !bannerEl.hidden;

  /* ---------- hộp thoại, bảng Thông tin ---------- */
  function closeDialog(result) {
    if (!dialogEl) return;
    dialogEl.remove();
    dialogEl = null;
    const r = dialogResolve; dialogResolve = null;
    if (r) r(result);
  }
  function confirmDialog({ title, body, ok, cancel, danger }) {
    if (dialogEl) closeDialog(false);
    return new Promise((resolve) => {
      dialogResolve = resolve;
      dialogEl = h('div', 'dim', null, { 'data-testid': 'dialog-dim' });
      const card = h('div', 'pane pane--sheet sheet', '<h2 class="sheet-title"></h2><p class="sheet-body"></p><div class="sheet-actions"></div>', { 'data-testid': 'dialog', role: 'dialog', 'aria-modal': 'true' });
      $('.sheet-title', card).textContent = title;
      $('.sheet-body', card).textContent = body;
      const bc = h('button', 'sbtn sbtn--ghost', cancel, { type: 'button', 'data-testid': 'dialog-cancel' });
      const bo = h('button', 'sbtn ' + (danger ? 'sbtn--danger' : 'sbtn--primary'), ok, { type: 'button', 'data-testid': 'dialog-ok' });
      pressable(bc, () => closeDialog(false));
      pressable(bo, () => closeDialog(true));
      $('.sheet-actions', card).append(bc, bo);
      dialogEl.appendChild(card);
      document.body.appendChild(dialogEl);
      bo.focus();
    });
  }

  function showInfo() {
    if (infoEl) return;
    infoEl = h('div', 'dim', null, { 'data-testid': 'info-dim' });
    const url = location.origin + location.pathname;
    const logo = brand.wordmark ? (brand.logo ? '<img class="logo-img info-logo" src="./assets/classin-logo.png" alt="ClassIn">' : '<span class="brand-word">ClassIn</span>') : '';
    const card = h('div', 'pane pane--sheet sheet sheet--info', null, { 'data-testid': 'info-panel', role: 'dialog', 'aria-modal': 'true' });
    card.innerHTML =
      '<div class="info-head">' + logo + '<h2 class="sheet-title">Bảng nhiều người viết <span class="ver">v0.2</span></h2></div>' +
      '<p class="sheet-body">Dành cho ClassIn X. Công cụ bổ trợ do ClassIn Việt Nam thử nghiệm, không phải tính năng chính thức của ClassIn.</p>' +
      '<div class="info-cols"><div><h3>Cách dùng</h3><ul><li>Mỗi vùng có thanh công cụ riêng ở dưới. Nhiều người viết cùng lúc được. Bấm Bút lần nữa để chọn màu và cỡ nét.</li>' +
      '<li>Bấm Chọn đề để lấy câu hỏi từ thư viện, từ bài soạn trong Hub hoặc đề Toán lớp 1 đến 12. Đề hiện ở đầu mỗi vùng.</li>' +
      '<li>Đề chung: mọi vùng cùng một câu. Chia câu: mỗi vùng một câu, có nút ‹ › riêng.</li>' +
      '<li>Bấm Đáp án rồi chấm ✓ ✗ cho từng vùng. Điểm xem bảng điểm. Lượt mới xoá nét, giữ điểm và sang câu kế.</li>' +
      '<li>Đồng hồ đếm ngược hoặc bấm giờ; hết giờ các vùng bị khoá. Nền viết: 4 dòng, ô li, lưới, trục toạ độ.</li></ul></div>' +
      '<div><h3>Nguồn đề</h3><ul><li>Gói thư viện là chủ đề tự soạn, không theo sách giáo khoa nào. Đề Toán do máy sinh theo luật, giáo viên nên xem lại trước giờ học.</li>' +
      '<li>Đề tự soạn trong Hub là trách nhiệm của giáo viên. Muốn dùng đề riêng: soạn trên laptop rồi bấm Lưu .edu cho Bảng nhiều người viết.</li></ul>' +
      '<h3>Nếu chỉ 1 người viết được</h3><p class="sheet-body">Mở địa chỉ dưới đây bằng Edge hoặc Chrome trên Windows của màn hình:</p><p class="info-url"></p>' +
      '<h3>Quyền riêng tư</h3><ul><li>Trang không gửi dữ liệu đi đâu. Nét vẽ mất khi đóng cửa sổ. Đề, điểm, tên đội chỉ nằm trong cửa sổ này (bộ nhớ phiên).</li>' +
      '<li>Link bài từ Hub chứa toàn bộ bài: không ghi tên học sinh vào bài.</li>' +
      '<li>ClassIn tự gắn mã trường, mã lớp vào địa chỉ trang. Máy chủ lưu trang (GitHub Pages) có thể ghi nhận địa chỉ này trong nhật ký truy cập. File .edu đã tắt gửi mã người dùng, tên và vai trò.</li></ul></div></div>' +
      '<div class="sheet-actions"></div>';
    $('.info-url', card).textContent = url;
    const x = h('button', 'sbtn sbtn--primary', 'Đóng', { type: 'button', 'data-testid': 'info-close' });
    pressable(x, closeInfo);
    $('.sheet-actions', card).appendChild(x);
    infoEl.appendChild(card);
    document.body.appendChild(infoEl);
    x.focus();
  }
  function closeInfo() { if (infoEl) { infoEl.remove(); infoEl = null; } }

  /* ---------- bàn phím ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (dialogEl) closeDialog(false);
      else if (infoEl) closeInfo();
      else if (!closeAllTrays()) actions.escape();
    } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      actions.undoNearest();
    }
  });

  buildTopbar();

  return {
    layout(rects, s, topH, W) {
      root.style.setProperty('--s', String(s));
      root.style.setProperty('--top-h', topH + 'px');
      root.classList.toggle('tb-compact', W < 1100);
      renderOverlay(rects, s, topH);
      refreshTopbar();
    },
    refreshZone, refreshAll, refreshTopbar,
    closeTray, closeAllTrays, toast,
    showBanner, hideBanner, bannerVisible,
    confirm: confirmDialog,
    isDialogOpen: () => !!dialogEl || !!infoEl,
    showInfo,
    isWide: (zid) => !!(zoneUI[zid] && zoneUI[zid].wide),
  };
}
