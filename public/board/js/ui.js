// Giao diện: thanh trên, dock từng vùng, khay màu/cỡ, hộp thoại, toast, dải cảnh báo, bảng Thông tin.
import { icon } from './icons.js';
import { isHugePalm } from './palm.js';
import { FEATURES } from './features.js';
import { t, bind, apply, mountSwitch, withUi, lang } from './i18n.js';

// Bảng màu bút hiện tại. Mảng này được sửa tại chỗ khi đổi nền bảng (setPalette), nên nơi khác cứ import COLORS.
// Tên màu / cỡ nét hiển thị lấy từ danh mục chuỗi (board.color.*, board.size.*), không còn viết cứng ở đây.
export const COLORS = [
  { key: 'white', hex: '#FFFFFF' },
  { key: 'red', hex: '#FF4D4F' },
  { key: 'yellow', hex: '#FFD43B' },
  { key: 'green', hex: '#40C057' },
  { key: 'blue', hex: '#4DABF7' },
  { key: 'orange', hex: '#FF922B' },
];
export const SIZES = [
  { v: 5, k: 'thin', dot: 6 },
  { v: 10, k: 'medium', dot: 11 },
  { v: 20, k: 'thick', dot: 18 },
];
// Khoá chuỗi của một màu bút (Vàng đậm của nền Trắng có khoá riêng).
export const colorKey = (c) => 'board.color.' + (c.hex === '#E67700' ? 'yellowDark' : c.key);
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
      ? '<span class="tb-pill" data-testid="brand-pill"><i></i><span data-i18n="' + brand.labelKey + '"></span></span>'
      : '<span class="tb-sub" data-testid="brand-sub" data-i18n="board.tb.subNeutral"></span>';
    // Nút "Về màn chọn": chỉ có khi mở từ màn chọn của Hub (URL có from=hub)
    const backHtml = FROM_HUB
      ? '<button type="button" class="tbtn tbtn--icon tbtn--back" data-testid="back-hub" data-i18n-aria="board.tb.back">' + icon('chevron-left') + '</button><span class="tb-div tb-div--back"></span>'
      : '';
    topbar.innerHTML =
      '<div class="tb-left">' + backHtml + logoHtml + (brand.wordmark ? '<span class="tb-div"></span>' : '') +
      '<div class="tb-title" data-testid="brand-label">' +
      '<div class="tb-row"><span class="tb-name" data-i18n="common.boardName"></span>' + second + '</div>' +
      '<div class="tb-disc" data-testid="brand-disclaimer" data-i18n="' + brand.disclaimerKey + '"></div></div></div>' +
      '<div class="tb-mid" data-testid="tb-mid"></div>' +
      '<div class="tb-right"><div class="tb-lang" data-testid="tb-lang"></div><span class="tb-div tb-div--lang"></span><div class="seg" role="group" data-i18n-aria="board.tb.zonesGroup"></div>' +
      '<button type="button" class="tbtn tbtn--danger" data-testid="clear-all" data-i18n-aria="board.tb.clearAll">' + icon('trash-2') + '<span class="tb-label" data-i18n="board.tb.clearAll"></span></button>' +
      '<button type="button" class="tbtn tbtn--icon" data-testid="fullscreen" data-i18n-aria="board.tb.fullscreen">' + icon('maximize') + '</button>' +
      '<button type="button" class="tbtn tbtn--icon" data-testid="info" data-i18n-aria="board.tb.info">' + icon('info') + '</button></div>';
    const seg = $('.seg', topbar);
    for (let i = 1; i <= 4; i++) {
      const b = h('button', 'segbtn', String(i), { type: 'button', 'data-testid': 'zones-' + i });
      bind(b, 'board.tb.zonesBtn', { n: i }, 'aria-label');
      pressable(b, () => actions.setZones(i));
      seg.appendChild(b);
    }
    mountSwitch($('.tb-lang', topbar), { wire: (b, fn) => pressable(b, fn) });
    if (FROM_HUB) pressable($('[data-testid="back-hub"]', topbar), () => askBackHub());
    pressable($('[data-testid="clear-all"]', topbar), () => askClearAll());
    const fs = $('[data-testid="fullscreen"]', topbar);
    if (!document.fullscreenEnabled) fs.hidden = true;
    pressable(fs, toggleFullscreen);
    document.addEventListener('fullscreenchange', () => {
      const on = !!document.fullscreenElement;
      fs.innerHTML = icon(on ? 'minimize' : 'maximize');
      bind(fs, on ? 'board.tb.exitFullscreen' : 'board.tb.fullscreen', null, 'aria-label');
    });
    pressable($('[data-testid="info"]', topbar), showInfo);
    apply(topbar);
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
  function fsDenied() { toastKey('board.toast.fsDenied'); }

  async function askBackHub() {
    // Rời bảng là mất nét viết (bảng không lưu): hỏi lại nếu còn nét.
    let go = true;
    if (board.zones.some((z) => z.strokes.length)) {
      go = await confirmDialog({ title: 'board.dlg.back.title', body: 'board.dlg.back.body', ok: 'board.dlg.back.ok', cancel: 'board.dlg.back.cancel', danger: true });
    }
    if (go) location.href = withUi('../start/index.html', lang());
  }

  async function askClearAll() {
    const ok = await confirmDialog({ title: 'board.dlg.clearAll.title', body: 'board.dlg.clearAll.body', ok: 'board.tb.clearAll', cancel: 'common.cancel', danger: true });
    if (ok) actions.clearAll();
  }

  /* ---------- vùng: dock, khay, huy hiệu, khe ---------- */
  function dockBtn(zid, key, labelKey, ic, args) {
    const b = h('button', 'dbtn', icon(ic), { type: 'button', 'data-testid': 'z' + zid + '-' + key });
    bind(b, labelKey, args, 'aria-label');
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

    const pen = dockBtn(zid, 'pen', 'board.dock.pen', 'pen-line');
    pen.insertAdjacentHTML('beforeend', '<span class="pen-dot"></span>');
    const er = dockBtn(zid, 'eraser', 'board.dock.eraser', 'eraser');
    const un = dockBtn(zid, 'undo', 'board.dock.undo', 'undo-2');
    const cl = dockBtn(zid, 'clear', 'board.dock.clearZone', 'trash-2', { n: zid });
    const dock = h('div', 'pane pane--dock dock' + (wide ? ' dock--wide' : '') + (grid ? ' dock--grid' : ''), null, { 'data-testid': 'z' + zid + '-dock', role: 'toolbar' });
    bind(dock, 'board.dock.toolbar', { n: zid }, 'aria-label');
    const info = { wrap, dock, tray: null, open: false, timer: 0, wide, pen };

    const colorBtn = (c) => {
      const b = h('button', 'cdot', '<span style="background:' + c.hex + '"></span>', { type: 'button', 'data-testid': 'z' + zid + '-color-' + c.key });
      bind(b, colorKey(c), null, 'aria-label');
      b.dataset.hex = c.hex;
      b.dataset.idx = String(COLORS.indexOf(c));
      pressable(b, () => pick(zid, { color: b.dataset.hex }));   // đọc từ dataset: bảng màu đổi theo nền bảng
      return b;
    };
    const sizeBtn = (s) => {
      const b = h('button', 'sdot', '<span style="width:calc(' + s.dot + 'px * var(--s));height:calc(' + s.dot + 'px * var(--s))"></span>', { type: 'button', 'data-testid': 'z' + zid + '-size-' + s.v });
      bind(b, 'board.size.' + s.k, null, 'aria-label');
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
      const tray = h('div', 'pane pane--tray tray', null, { 'data-testid': 'z' + zid + '-tray', role: 'group' });
      bind(tray, 'board.dock.tray', { n: zid }, 'aria-label');
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
    pen.classList.toggle('ink-dark', zone.color === '#1C1C1E');
    const dot = $('.pen-dot', pen);
    const sz = SIZES.find((x) => x.v === zone.size) || SIZES[1];
    dot.style.background = zone.color;
    dot.style.width = dot.style.height = 'calc(' + Math.max(5, sz.dot * 0.6) + 'px * var(--s))';
    un.classList.toggle('is-disabled', zone.undo.length === 0);
    un.setAttribute('aria-disabled', zone.undo.length === 0 ? 'true' : 'false');
    u.wrap.querySelectorAll('.cdot').forEach((b) => {
      const on = b.dataset.hex === zone.color;
      b.classList.toggle('is-selected', on);
      b.classList.toggle('ink-dark', b.dataset.hex === '#1C1C1E');
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

  // Đổi bảng màu bút theo nền bảng: cập nhật nút màu tại chỗ (không dựng lại dock, giữ trạng thái khay).
  function setPalette(list) {
    COLORS.length = 0;
    list.forEach((c) => COLORS.push({ key: c.key, hex: c.hex }));
    for (const zid in zoneUI) {
      zoneUI[zid].wrap.querySelectorAll('.cdot').forEach((b) => {
        const c = COLORS[Number(b.dataset.idx)];
        if (!c) return;
        b.dataset.hex = c.hex;
        b.setAttribute('data-testid', 'z' + zid + '-color-' + c.key);
        bind(b, colorKey(c), null, 'aria-label');
        b.firstChild.style.background = c.hex;
      });
    }
    refreshAll();
  }

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

  // Toast theo khoá: ghi data-key để test kiểm theo khoá. Toast đang hiện không dịch lại khi đổi ngôn ngữ (chỉ sống 2,5 giây).
  function toastKey(key, params, ms) {
    toast(t(key, params), ms);
    toastEl.dataset.key = key;
  }

  function showBanner(key) {
    floaters.classList.add('has-banner');
    if (bannerEl) { bannerEl.hidden = false; return; }
    bannerEl = h('div', 'pane pane--banner banner', icon('triangle-alert') + '<span class="banner-text"></span>', { 'data-testid': 'banner', role: 'alert' });
    bind($('.banner-text', bannerEl), key);
    const x = h('button', 'tbtn tbtn--icon banner-x', icon('x'), { type: 'button', 'data-testid': 'banner-close' });
    bind(x, 'common.close', null, 'aria-label');
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
  // title/body/ok/cancel là KHOÁ chuỗi (không phải chữ đã dịch) nên hộp đang mở vẫn dịch lại được khi đổi ngôn ngữ. args: tham số cho title/body.
  function confirmDialog({ title, body, ok, cancel, danger, args }) {
    if (dialogEl) closeDialog(false);
    return new Promise((resolve) => {
      dialogResolve = resolve;
      dialogEl = h('div', 'dim', null, { 'data-testid': 'dialog-dim' });
      const card = h('div', 'pane pane--sheet sheet', '<h2 class="sheet-title"></h2><p class="sheet-body"></p><div class="sheet-actions"></div>', { 'data-testid': 'dialog', role: 'dialog', 'aria-modal': 'true' });
      bind($('.sheet-title', card), title, args);
      bind($('.sheet-body', card), body, args);
      const bc = h('button', 'sbtn sbtn--ghost', null, { type: 'button', 'data-testid': 'dialog-cancel' });
      const bo = h('button', 'sbtn ' + (danger ? 'sbtn--danger' : 'sbtn--primary'), null, { type: 'button', 'data-testid': 'dialog-ok' });
      bind(bc, cancel); bind(bo, ok);
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
    const D = FEATURES.deck;
    // Mỗi mục một khoá (không có HTML trong danh mục): dựng bằng DOM, đổi ngôn ngữ thì apply() dịch lại.
    const K = (tag, key, cls) => bind(h(tag, cls || null), key);
    const ul = (keys) => { const u = h('ul'); keys.forEach((k) => u.appendChild(K('li', k))); return u; };
    const how = ['board.info.how.pen'];
    if (D) how.push('board.info.how.deck', 'board.info.how.modes', 'board.info.how.answers');
    how.push('board.info.how.paper', 'board.info.how.clock', 'board.info.how.snip');
    const priv = [D ? 'board.info.priv1' : 'board.info.priv1b'];
    if (D) priv.push('board.info.priv2');
    priv.push('board.info.priv3');
    const head = h('div', 'info-head', logo);
    const title = h('h2', 'sheet-title');
    title.append(K('span', 'common.boardName'), document.createTextNode(' '), h('span', 'ver', 'v0.3'));
    head.appendChild(title);
    const c1 = h('div'), c2 = h('div');
    c1.append(K('h3', 'board.info.howTitle'), ul(how));
    if (D) c2.append(K('h3', 'board.info.srcTitle'), ul(['board.info.src1', 'board.info.src2']));
    const urlEl = h('p', 'info-url'); urlEl.textContent = url;
    c2.append(K('h3', 'board.info.oneTitle'), K('p', 'board.info.oneBody', 'sheet-body'), urlEl, K('h3', 'board.info.privTitle'), ul(priv));
    const cols = h('div', 'info-cols'); cols.append(c1, c2);
    const actions = h('div', 'sheet-actions');
    const x = h('button', 'sbtn sbtn--primary', null, { type: 'button', 'data-testid': 'info-close' });
    bind(x, 'common.close');
    pressable(x, closeInfo);
    actions.appendChild(x);
    card.append(head, K('p', 'board.info.lead', 'sheet-body'), cols, actions);
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
    refreshZone, refreshAll, refreshTopbar, setPalette,
    closeTray, closeAllTrays, toast, toastKey,
    showBanner, hideBanner, bannerVisible,
    confirm: confirmDialog,
    isDialogOpen: () => !!dialogEl || !!infoEl,
    showInfo,
    isWide: (zid) => !!(zoneUI[zid] && zoneUI[zid].wide),
  };
}
