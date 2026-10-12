// Thẻ đề: dải đầu mỗi vùng (không nhận nét), nút ‹ › ✓ ✗, phóng to đề, lớp khoá hết giờ. PLAN-V2 mục C.3.
// DOM nằm trong #overlay (do ui.layout dựng lại mỗi lần bố cục, nên layout() gắn lại gốc). Không đo theo khung hình:
// chỉ đo (fitText) lúc đổi câu / đổi bố cục / bật tắt đáp án.
import { h } from './dom.js';
import { icon } from './icons.js';
import { pressable } from './ui.js';
import { renderRuns, hasMath } from './math/render.js';
import * as C from './classroom.js';

// Co chữ: bắt đầu từ max, giảm `step` px cho đến khi vừa (tối đa maxLines dòng với chữ thường), không nhỏ hơn min.
export function fitText(el, o) {
  const step = o.step || 2;
  let size = Math.max(o.min, o.max);
  for (;;) {
    el.style.fontSize = size + 'px';
    let fits = el.scrollHeight <= el.clientHeight;
    if (fits && o.maxLines && !o.free) fits = el.scrollHeight <= o.maxLines * size * 1.2 + 3;
    if (fits || size <= o.min) break;
    size -= step;
  }
  return size;
}

const LETTERS = ['A', 'B', 'C'];

export function createCards({ overlay, actions }) {
  const root = h('div', 'cards', null, { 'data-testid': 'cards' });
  const Z = {};            // zid -> phần tử của thẻ
  let G = null;            // bố cục hiện tại { bands, writes, top, s, fm, n }
  let zoomZid = 0;
  let lastCls = null;
  const sig = {};          // zid -> chữ ký lần vẽ trước (bỏ qua đo lại khi không đổi)
  const prevScore = {};

  function posBox(el, r, top) {
    el.style.left = r.x + 'px'; el.style.top = (r.y - top) + 'px';
    el.style.width = r.w + 'px'; el.style.height = r.h + 'px';
  }
  const btn = (cls, ic, label, tid) => h('button', cls, icon(ic), { type: 'button', 'aria-label': label, 'data-testid': tid });

  function buildBand(zid, b) {
    const band = h('div', 'band', null, { 'data-testid': 'z' + zid + '-card' });
    posBox(band, b, G.top);
    band.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    const bar = h('div', 'band-bar');
    const main = h('div', 'band-main');
    const head = h('div', 'band-head');
    const chip = h('button', 'chip', '<i class="chip-dot"></i><span class="chip-name"></span><b class="chip-score"></b>', { type: 'button', 'data-testid': 'z' + zid + '-team', 'aria-label': 'Đội vùng ' + zid });
    const q = h('span', 'band-q', '', { 'data-testid': 'z' + zid + '-q' });
    head.append(chip, q);
    const zoom = btn('band-zoom', 'maximize-2', 'Phóng to đề vùng ' + zid, 'z' + zid + '-zoom');
    const body = h('div', 'band-body');
    const prompt = h('div', 'band-prompt', null, { 'data-testid': 'z' + zid + '-prompt' });
    const opts = h('div', 'band-opts', null, { 'data-testid': 'z' + zid + '-opts' });
    const ans = h('div', 'band-ans', null, { 'data-testid': 'z' + zid + '-ans' });
    body.append(prompt, opts, ans);
    main.append(head, zoom, body);
    const side = h('div', 'band-side');
    const prev = btn('sbtn2 sb-prev', 'chevron-left', 'Câu trước vùng ' + zid, 'z' + zid + '-prev');
    const next = btn('sbtn2 sb-next', 'chevron-right', 'Câu tiếp vùng ' + zid, 'z' + zid + '-next');
    const ok = btn('sbtn2 sb-ok', 'check', 'Đúng vùng ' + zid, 'z' + zid + '-ok');
    const no = btn('sbtn2 sb-no', 'x', 'Sai vùng ' + zid, 'z' + zid + '-no');
    side.append(prev, next, ok, no);
    band.append(bar, main, side);
    pressable(chip, () => actions.team(zid));
    pressable(zoom, () => openZoom(zid));
    pressable(prev, () => actions.prev(zid));
    pressable(next, () => actions.next(zid));
    pressable(ok, () => actions.verdict(zid, true));
    pressable(no, () => actions.verdict(zid, false));
    Z[zid] = Object.assign(Z[zid] || {}, { band, bar, chip, q, zoom, body, prompt, opts, ans, side, prev, next, ok, no,
      dot: chip.querySelector('.chip-dot'), name: chip.querySelector('.chip-name'), score: chip.querySelector('.chip-score') });
    root.appendChild(band);
  }

  // g = { bands, writes, top, s, fm, n }
  function layout(g) {
    G = g;
    closeZoomNow();
    root.innerHTML = '';
    for (const k in Z) delete Z[k];
    for (const k in sig) delete sig[k];
    g.bands.forEach((b, i) => {
      const zid = b.id;
      Z[zid] = {};
      if (b.h > 0) buildBand(zid, b);
      const w = g.writes[i];
      const lock = h('div', 'zone-lock', '<span>Time’s up!</span>', { 'data-testid': 'z' + zid + '-lock' });
      posBox(lock, w, g.top);
      lock.hidden = true;
      root.appendChild(lock);
      Z[zid].lock = lock;
      const full = { x: b.x, y: b.h > 0 ? b.y : w.y, w: b.w, h: (b.h > 0 ? b.h : 0) + w.h };
      const zl = h('div', 'zoomlayer', '<div class="zl-body"><div class="zl-prompt"></div><div class="zl-opts"></div><div class="zl-ans"></div></div>', { 'data-testid': 'z' + zid + '-zoomlayer' });
      posBox(zl, full, g.top);
      zl.hidden = true;
      zl.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
      pressable(zl, () => closeZoomNow());
      root.appendChild(zl);
      Z[zid].zl = zl; Z[zid].zlBody = zl.firstChild;
    });
    // khe giữa các dải
    for (let i = 0; i < g.bands.length - 1; i++) {
      const a = g.bands[i], b = g.bands[i + 1];
      if (a.h <= 0) continue;
      const sep = h('div', 'zone-sep');
      if (b.x > a.x) { sep.style.left = a.x + a.w + 'px'; sep.style.top = (a.y - g.top) + 'px'; sep.style.width = (b.x - (a.x + a.w)) + 'px'; sep.style.height = a.h + 'px'; }
      else { sep.style.left = a.x + 'px'; sep.style.top = (a.y + a.h - g.top) + 'px'; sep.style.width = a.w + 'px'; sep.style.height = (b.y - (a.y + a.h)) + 'px'; }
      root.appendChild(sep);
    }
    overlay.appendChild(root);
  }

  /* ----- vẽ nội dung một thẻ (dải hoặc lớp phóng to) ----- */
  function paintBody(parts, cls, zone, o) {
    const task = C.taskOf(cls, zone.id);
    const s = G.s;
    const { prompt, opts, ans } = parts;
    prompt.textContent = ''; opts.textContent = ''; ans.textContent = '';
    prompt.classList.remove('ready');
    opts.classList.remove('opts--cols'); opts.hidden = true; ans.hidden = true;
    if (!task) { prompt.textContent = '—'; prompt.style.fontSize = o.max + 'px'; return; }
    if (cls.hidden) {
      prompt.textContent = 'Get ready…';
      prompt.classList.add('ready');
      fitText(prompt, { max: o.max, min: o.min, maxLines: 1 });
      return;
    }
    const secPx = Math.round(Math.min(o.sec[1], Math.max(o.sec[0], o.max * 0.55)));
    renderRuns(task.prompt, prompt, { gap: task.kind !== 'math' });
    const free = hasMath(task.prompt);
    if (task.options) {
      const order = zone.optOrder || [0, 1, 2];
      const right = order.indexOf(task.answerIndex);
      for (let k = 0; k < 3; k++) {
        const sp = h('span', 'opt' + (zone.shown && k === right ? ' ok' : ''));
        sp.appendChild(h('b', null, LETTERS[k] + '.'));
        renderRuns(task.options[order[k]], sp);
        opts.appendChild(sp);
      }
      opts.hidden = false; opts.style.fontSize = secPx + 'px';
      if (opts.scrollWidth > opts.clientWidth + 1) opts.classList.add('opts--cols');
    }
    if (zone.shown) {
      const vi = task.lang === 'vi';
      ans.appendChild(h('b', null, vi ? 'Đáp án: ' : 'Answer: '));
      if (task.options) {
        const k = (zone.optOrder || [0, 1, 2]).indexOf(task.answerIndex);
        ans.appendChild(document.createTextNode(LETTERS[k] + '. '));
      }
      renderRuns(task.answer, ans);
      ans.hidden = false; ans.style.fontSize = secPx + 'px';
    }
    fitText(prompt, { max: o.max, min: o.min, maxLines: o.maxLines, free });
  }

  function zoneSig(cls, zone) {
    return [zone.task, cls.deckSeq || 0, cls.hidden, zone.shown, zone.optOrder.join(''), G.n, G.s, zoneBandId()].join('|');
  }
  const zoneBandId = () => G.bands[0] ? G.bands[0].h + 'x' + G.bands[0].w : '';

  function render(cls) {
    lastCls = cls;
    if (!G) return;
    cls.zones.forEach((zone) => {
      const e = Z[zone.id];
      if (!e) return;
      // khoá hết giờ (có hay không có dải đề)
      e.lock.hidden = !zone.locked;
      if (!e.band) return;
      e.bar.style.background = zone.color;
      e.dot.style.background = zone.color;
      const single = cls.zones.length === 1;
      e.name.textContent = single ? '' : zone.team;
      e.name.hidden = single;
      const sc = single ? zone.score + '/' + zone.judged + ' đúng' : String(zone.score);
      if (e.score.textContent !== sc) {
        e.score.textContent = sc;
        if (prevScore[zone.id] != null && prevScore[zone.id] !== zone.score) {
          e.score.classList.remove('pop'); void e.score.offsetWidth; e.score.classList.add('pop');
        }
      }
      prevScore[zone.id] = zone.score;
      const total = C.total(cls);
      e.q.textContent = zone.task == null ? '' : 'Q ' + (zone.task + 1) + '/' + total;
      e.q.hidden = !!cls.hidden;
      // cột phải: ‹ › (Chia câu) hoặc ✓ ✗ (sau khi bấm Đáp án)
      const split = !C.isCommon(cls);
      const judge = zone.shown && !cls.hidden;
      const nav = split && !zone.shown && !cls.hidden;
      e.prev.hidden = !nav; e.next.hidden = !nav;
      e.ok.hidden = !judge; e.no.hidden = !judge;
      e.side.hidden = !(nav || judge);
      e.band.classList.toggle('has-side', nav || judge);
      e.prev.classList.toggle('is-disabled', zone.history.length < 2);
      e.ok.classList.toggle('is-on', zone.verdict === true);
      e.no.classList.toggle('is-on', zone.verdict === false);
      e.ok.setAttribute('aria-pressed', zone.verdict === true ? 'true' : 'false');
      e.no.setAttribute('aria-pressed', zone.verdict === false ? 'true' : 'false');
      e.zoom.hidden = !!cls.hidden || zone.task == null;
      const sg = zoneSig(cls, zone) + '|' + (e.side.hidden ? 0 : 1);
      if (sig[zone.id] !== sg) {
        sig[zone.id] = sg;
        paintBody(e, cls, zone, { max: G.fm, min: Math.round(20 * G.s), sec: [Math.round(16 * G.s), Math.round(26 * G.s)], maxLines: 2 });
      }
      if (zoomZid === zone.id) paintZoom(cls, zone);
    });
  }

  /* ----- phóng to đề ----- */
  function paintZoom(cls, zone) {
    const e = Z[zone.id];
    if (!e || !e.zl) return;
    const b = e.zlBody;
    paintBody({ prompt: b.firstChild, opts: b.children[1], ans: b.children[2] }, cls, zone,
      { max: G.fm * 2, min: Math.round(20 * G.s), sec: [Math.round(24 * G.s), Math.round(52 * G.s)], maxLines: 4 });
  }
  function openZoom(zid) {
    const e = Z[zid];
    if (!e || !e.zl || !lastCls) return;
    closeZoomNow();
    zoomZid = zid;
    e.zl.hidden = false;
    paintZoom(lastCls, lastCls.zones[zid - 1]);
  }
  function closeZoomNow() {
    if (!zoomZid) return false;
    const e = Z[zoomZid];
    zoomZid = 0;
    if (e && e.zl) e.zl.hidden = true;
    return true;
  }

  return { root, layout, render, closeZoom: closeZoomNow, zoomOpen: () => zoomZid, els: Z };
}
