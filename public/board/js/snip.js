// Cắt màn hình: chọn vùng bằng một ngón, dựng ảnh PNG từ các lát canvas + lớp kẻ, xem trước, Sao chép / Lưu tệp / Xem to.
// Nạp lười (import() khi chạm nút Cắt lần đầu), không đụng vòng khung của renderer. PLAN-BOARD-V21 mục 5.
// Dải đề (khi bật Đề) KHÔNG được vẽ vào ảnh: chỉ có vùng viết (lát canvas + lớp kẻ + khe giữa các vùng).
import { h } from './dom.js';
import { icon } from './icons.js';
import { pressable } from './ui.js';
import { paperSVG } from './paper.js';
import { GAP } from './layout.js';

// 'full': hiện Sao chép + Lưu tệp + Xem to. 'view': kết quả mở thẳng chế độ Xem to kèm hướng dẫn Chụp màn hình của ClassIn.
// Đổi một dòng này sau khi có kết quả trang thử snip-test.html trên ClassIn X thật.
export const SNIP_MODE = 'full';
const MAX_MP = 8e6;            // trần số điểm ảnh của ảnh ra
const MIN_SIDE = 40;           // (nhân s) nhỏ hơn thì coi như chạm nhầm
const SEP = { dark: '#2C2C2E', light: '#D1D1D6' };
const MSG = {
  copied: 'Đã sao chép ảnh. Bấm Ctrl+V để dán vào bảng ClassIn hoặc ứng dụng khác.',
  copyFail: 'Cửa sổ này không cho sao chép ảnh. Bấm Xem to, rồi dùng nút Chụp màn hình (biểu tượng chiếc kéo) trên thanh công cụ của ClassIn.',
  saved: 'Nếu không thấy tệp trong thư mục Tải về, cửa sổ này không cho lưu tệp. Hãy dùng Sao chép hoặc Chụp màn hình của ClassIn.',
  buildFail: 'Không tạo được ảnh. Hãy thử chọn vùng nhỏ hơn.',
  view: 'Dùng nút Chụp màn hình (biểu tượng chiếc kéo) trên thanh công cụ của ClassIn để lấy ảnh này.',
};

let cur = null;   // phiên đang mở: { cancel() }
export const isOpen = () => !!cur;
export function cancel() { if (cur) cur.cancel(); }

// ---------- dựng ảnh ----------
// rect: hộp theo toạ độ trang { x, y, w, h }. ctx: { renderer, board, papers() -> [{paper}], scale, theme }
export async function composeSnip(rect, ctx) {
  const { renderer, board } = ctx;
  await renderer.flush();
  let q = Math.min(renderer.k || 1, 2);
  while (rect.w * rect.h * q * q > MAX_MP && q > 0.25) q *= 0.9;
  const W = Math.max(1, Math.round(rect.w * q)), H = Math.max(1, Math.round(rect.h * q));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.fillStyle = renderer.bg; g.fillRect(0, 0, W, H);
  const o = renderer.origin;
  const sx0 = rect.x - o.x, sy0 = rect.y - o.y;
  // 1. lát canvas (mực)
  for (const tl of renderer.tilesIn(sx0, sy0, sx0 + rect.w, sy0 + rect.h)) {
    const ix0 = Math.max(sx0, tl.x), iy0 = Math.max(sy0, tl.y), ix1 = Math.min(sx0 + rect.w, tl.x + tl.w), iy1 = Math.min(sy0 + rect.h, tl.y + tl.h);
    if (ix1 <= ix0 || iy1 <= iy0) continue;
    const kx = tl.canvas.width / tl.w, ky = tl.canvas.height / tl.h;
    g.drawImage(tl.canvas, (ix0 - tl.x) * kx, (iy0 - tl.y) * ky, (ix1 - ix0) * kx, (iy1 - iy0) * ky, (ix0 - sx0) * q, (iy0 - sy0) * q, (ix1 - ix0) * q, (iy1 - iy0) * q);
  }
  // 2. lớp kẻ của từng vùng (SVG data: không làm bẩn canvas), vẽ TRÊN mực như trên màn hình
  const papers = ctx.papers();
  for (const z of board.zones) {
    const kind = papers[z.id - 1] && papers[z.id - 1].paper;
    if (!kind || kind === 'blank') continue;
    const r = z.rect;
    const ix0 = Math.max(rect.x, r.x), iy0 = Math.max(rect.y, r.y), ix1 = Math.min(rect.x + rect.w, r.x + r.w), iy1 = Math.min(rect.y + rect.h, r.y + r.h);
    if (ix1 <= ix0 || iy1 <= iy0) continue;
    const img = new Image();
    img.src = 'data:image/svg+xml,' + encodeURIComponent(paperSVG(kind, r.w, r.h, ctx.scale, ctx.theme));
    await img.decode();
    g.drawImage(img, ix0 - r.x, iy0 - r.y, ix1 - ix0, iy1 - iy0, (ix0 - rect.x) * q, (iy0 - rect.y) * q, (ix1 - ix0) * q, (iy1 - iy0) * q);
  }
  // 3. khe giữa các vùng
  g.fillStyle = SEP[ctx.theme] || SEP.dark;
  const zs = board.zones;
  for (let i = 0; i < zs.length - 1; i++) {
    const a = zs[i].rect, b = zs[i + 1].rect;
    const gap = b.x > a.x ? { x: a.x + a.w, y: a.y, w: b.x - (a.x + a.w), h: a.h } : { x: a.x, y: a.y + a.h, w: a.w, h: b.y - (a.y + a.h) };
    if (gap.w <= 0 || gap.h <= 0) gap.w = gap.w <= 0 ? GAP : gap.w;
    const ix0 = Math.max(rect.x, gap.x), iy0 = Math.max(rect.y, gap.y), ix1 = Math.min(rect.x + rect.w, gap.x + gap.w), iy1 = Math.min(rect.y + rect.h, gap.y + gap.h);
    if (ix1 > ix0 && iy1 > iy0) g.fillRect((ix0 - rect.x) * q, (iy0 - rect.y) * q, (ix1 - ix0) * q, (iy1 - iy0) * q);
  }
  const blob = await new Promise((ok, no) => { try { cv.toBlob((b) => (b ? ok(b) : no(new Error('toBlob null'))), 'image/png'); } catch (e) { no(e); } });
  return { blob, w: W, h: H, q };
}

const stamp = () => { const d = new Date(), p = (n) => (n < 10 ? '0' : '') + n; return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()); };

// ---------- giao diện ----------
// deps: { renderer, board, ui, getTheme(), getPapers(), getScale(), stage, test }
export function startSnip(deps) {
  if (cur) cur.cancel();
  const { renderer, board, ui } = deps;
  const root = document.documentElement;
  const s = deps.getScale();
  const top = parseFloat(getComputedStyle(root).getPropertyValue('--top-h')) || 0;
  const layer = h('div', 'snip-layer', null, { id: 'snip-layer', 'data-testid': 'snip-layer' });
  layer.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  const hint = h('div', 'pane snip-hint', '<span class="snip-msg">Kéo một ngón để chọn vùng cần cắt</span>', { 'data-testid': 'snip-hint' });
  const bAll = h('button', 'cbtn', 'Cả bảng', { type: 'button', 'data-testid': 'snip-all' });
  const bCancel = h('button', 'cbtn', 'Huỷ', { type: 'button', 'data-testid': 'snip-cancel' });
  hint.append(bAll, bCancel);
  const box = h('div', 'snip-box', null, { 'data-testid': 'snip-box' }); box.hidden = true;
  const bar = h('div', 'pane snip-confirm', null, { 'data-testid': 'snip-confirm' }); bar.hidden = true;
  const bOk = h('button', 'cbtn cbtn--primary', icon('check') + '<span>Cắt vùng này</span>', { type: 'button', 'data-testid': 'snip-ok' });
  const bRedo = h('button', 'cbtn', 'Chọn lại', { type: 'button', 'data-testid': 'snip-redo' });
  const bCancel2 = h('button', 'cbtn', 'Huỷ', { type: 'button', 'data-testid': 'snip-cancel2' });
  bar.append(bOk, bRedo, bCancel2);
  layer.append(box, hint, bar);
  document.body.appendChild(layer);

  let phase = 'select', pid = null, p0 = null, sel = null, urlToRevoke = null, result = null, fullEl = null;
  const W = innerWidth, H = innerHeight;
  const clamp = (x, y) => [Math.max(0, Math.min(W, x)), Math.max(top, Math.min(H, y))];
  const rectOf = (a, b) => ({ x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) });
  function paintBox(r) {
    box.hidden = !r;
    if (!r) return;
    box.style.left = r.x + 'px'; box.style.top = (r.y - top) + 'px'; box.style.width = r.w + 'px'; box.style.height = r.h + 'px';
  }
  function placeConfirm(r) {
    bar.hidden = false;
    const bh = bar.offsetHeight || 80 * s, bw = bar.offsetWidth || 460 * s;
    let y = r.y + r.h + 12 * s;
    if (y + bh > H) y = r.y - bh - 12 * s;
    if (y < top) y = Math.min(H - bh - 8, Math.max(top + 8, r.y + r.h - bh - 8));
    const x = Math.max(8, Math.min(W - bw - 8, r.x + r.w / 2 - bw / 2));
    bar.style.left = x + 'px'; bar.style.top = (y - top) + 'px';
  }
  function toSelect() {
    phase = 'select'; sel = null; paintBox(null); bar.hidden = true; hint.hidden = false;
  }
  function close() {
    document.removeEventListener('keydown', onKey, true);
    if (fullEl) { fullEl.remove(); fullEl = null; }
    layer.remove();
    if (urlToRevoke) { const u = urlToRevoke; urlToRevoke = null; setTimeout(() => URL.revokeObjectURL(u), 10000); }
    cur = null;
  }
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  cur = { cancel: close };

  layer.addEventListener('pointerdown', (e) => {
    if (phase !== 'select' && phase !== 'confirm') return;
    if (e.target.closest && e.target.closest('.pane')) return;       // nút trong viên hướng dẫn / thanh xác nhận
    if (pid != null) return;                                          // chỉ nhận ngón đầu
    pid = e.pointerId;
    try { layer.setPointerCapture(pid); } catch (_) { /* pointer giả */ }
    if (phase === 'confirm') toSelect();
    p0 = clamp(e.clientX, e.clientY);
    sel = rectOf(p0, p0);
    paintBox(sel);
    hint.hidden = true;
  });
  layer.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    sel = rectOf(p0, clamp(e.clientX, e.clientY));
    paintBox(sel);
  });
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    if (e.type === 'pointerup') sel = rectOf(p0, clamp(e.clientX, e.clientY));
    if (!sel || sel.w < MIN_SIDE * s || sel.h < MIN_SIDE * s) { toSelect(); return; }   // chạm nhầm: giữ chế độ chọn
    paintBox(sel);
    phase = 'confirm';
    placeConfirm(sel);
  };
  layer.addEventListener('pointerup', end);
  layer.addEventListener('pointercancel', end);

  pressable(bCancel, close); pressable(bCancel2, close);
  pressable(bRedo, toSelect);
  pressable(bAll, () => { sel = { x: 0, y: top, w: W, h: H - top }; build(); });
  pressable(bOk, () => { if (sel) build(); });

  async function build() {
    phase = 'busy';
    bar.hidden = true; hint.hidden = true;
    let out;
    try {
      out = await composeSnip(sel, { renderer, board, papers: deps.getPapers, scale: s, theme: deps.getTheme() });
    } catch (e) {
      ui.toast(MSG.buildFail, 4000);
      toSelect();
      return;
    }
    layer.hidden = true;
    showResult(out);
  }

  // ---------- kết quả ----------
  function showResult(out) {
    const url = URL.createObjectURL(out.blob);
    urlToRevoke = url;
    result = out;
    if (deps.test) window.__snip = { w: out.w, h: out.h, q: out.q, bytes: out.blob.size };
    const dim = h('div', 'dim dim--below snip-dim', null, { 'data-testid': 'snip-result-dim' });
    const card = h('div', 'pane pane--sheet sheet snip-card', null, { 'data-testid': 'snip-result', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Ảnh đã cắt' });
    const wrap = h('div', 'snip-imgwrap');
    const img = h('img', 'snip-img', null, { 'data-testid': 'snip-img', alt: 'Ảnh đã cắt' });
    img.src = url;
    wrap.appendChild(img);
    const status = h('p', 'snip-status', SNIP_MODE === 'view' ? MSG.view : 'Ảnh đã cắt ' + out.w + 'x' + out.h + '. Bấm Sao chép, hoặc Xem to rồi dùng Chụp màn hình của ClassIn.', { 'data-testid': 'snip-status', role: 'status' });
    const acts = h('div', 'snip-actions');
    const canCopy = !!(navigator.clipboard && navigator.clipboard.write && typeof window.ClipboardItem !== 'undefined');
    const bCopy = h('button', 'cbtn cbtn--primary', icon('copy') + '<span>Sao chép ảnh</span>', { type: 'button', 'data-testid': 'snip-copy' });
    const bSave = h('button', 'cbtn', icon('download') + '<span>Lưu tệp PNG</span>', { type: 'button', 'data-testid': 'snip-save' });
    const bFull = h('button', 'cbtn', icon('maximize') + '<span>Xem to</span>', { type: 'button', 'data-testid': 'snip-full' });
    const bClose = h('button', 'cbtn', 'Đóng', { type: 'button', 'data-testid': 'snip-close' });
    if (SNIP_MODE !== 'view') { if (canCopy) acts.appendChild(bCopy); acts.appendChild(bSave); }
    acts.append(bFull, bClose);
    card.append(wrap, status, acts);
    dim.appendChild(card);
    document.body.appendChild(dim);
    const closeAll = () => { dim.remove(); close(); };
    cur = { cancel: closeAll };
    pressable(bClose, closeAll);
    pressable(bCopy, async () => {
      try {
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': out.blob })]);
        status.textContent = MSG.copied; status.className = 'snip-status is-good';
      } catch (e) { status.textContent = MSG.copyFail; status.className = 'snip-status is-bad'; }
    });
    pressable(bSave, () => {
      try {
        const a = document.createElement('a');
        a.href = url; a.download = 'bang-' + stamp() + '.png'; a.style.display = 'none';
        document.body.appendChild(a); a.click(); a.remove();
      } catch (e) { /* bỏ qua */ }
      status.textContent = MSG.saved; status.className = 'snip-status';
    });
    pressable(bFull, () => openFull(url, dim));
    if (SNIP_MODE === 'view') openFull(url, dim);
  }
  function openFull(url, dim) {
    if (fullEl) return;
    fullEl = h('div', 'snip-full', null, { 'data-testid': 'snip-fullview' });
    const im = h('img', 'snip-fullimg', null, { alt: 'Ảnh đã cắt, xem to' });
    im.src = url;
    const tip = h('div', 'snip-fulltip', MSG.view + ' Chạm để thoát.');
    fullEl.append(im, tip);
    fullEl.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    pressable(fullEl, () => { if (fullEl) { fullEl.remove(); fullEl = null; } });
    document.body.appendChild(fullEl);
  }
}
