// Hộp thoại "Chọn đề" (PLAN-V2 mục C.2). Không cuộn: danh sách dài chia trang bằng nút ‹ ›.
// openDeckDialog(ctx) -> Promise<choice|null>
//   ctx: { sheets, lesson: { title, vocab, questions } | null, prefill?: {...} }
//   choice: { subject:'en'|'math', source:{type,id,title}, kind, grade, mathType, difficulty, lang, mode, order, count, timer:{mode,total} }
import { h, markSelected } from './dom.js';
import { pressable } from './ui.js';
import { groupRow } from './sheets.js';

const PAGE_PACKS = 8, PAGE_TYPES = 8;
const KIND = [['write', 'Viết từ'], ['missing', 'Chữ còn thiếu'], ['mc', 'Trắc nghiệm']];
const TIMERS = [['off', 0, 'Tắt'], ['down', 30, '30 giây'], ['down', 60, '60 giây'], ['down', 90, '90 giây'], ['down', 120, '2 phút'], ['up', 0, 'Bấm giờ']];
const LEVEL = { starters: 'Starters', movers: 'Movers', flyers: 'Flyers' };
const timerKey = (t) => t.mode + ':' + t.total;

export function defaultChoice(ctx) {
  return {
    subject: 'en', packId: ctx && ctx.lesson ? 'lesson' : null, kind: 'write', grade: 3, mathType: null, difficulty: 2, lang: 'vi',
    mode: 'common', order: 'seq', count: 10, timer: { mode: 'down', total: 60 },
  };
}

export async function openDeckDialog(ctx) {
  const st = Object.assign(defaultChoice(ctx), ctx.prefill || {});
  st.timer = Object.assign({}, st.timer);
  let catalog = [];
  try { catalog = (await import('../packs/catalog.js')).default; } catch (e) { catalog = []; }
  let MT = null;   // MATH_TYPES nạp lười khi mở mục Toán
  const cards = [];
  if (ctx.lesson) cards.push({ id: 'lesson', title: 'Bài đang mở', titleVi: ctx.lesson.title || '', level: '', lesson: true });
  catalog.forEach((c) => cards.push(c));
  if (!st.packId || !cards.some((c) => c.id === st.packId)) st.packId = cards.length ? cards[0].id : null;

  return new Promise((resolve) => {
    let done = false;
    const sh = ctx.sheets.open({
      testid: 'deck-dialog', cls: 'sheet--deck', title: 'Chọn đề', modal: true,
      onClose: () => { document.removeEventListener('keydown', onKey); if (!done) { done = true; resolve(null); } },
    });
    const card = sh.card;
    const finish = (v) => { if (done) return; done = true; sh.close(); resolve(v); };

    /* --- tiêu đề + Môn --- */
    const head = h('div', 'drow dhead');
    head.appendChild(h('h2', 'sheet-title', 'Chọn đề'));
    const subj = groupRow(null, [{ v: 'en', text: 'Tiếng Anh', testid: 'deck-subject-en' }, { v: 'math', text: 'Toán', testid: 'deck-subject-math' }], (v) => setSubject(v), { aria: 'Môn' });
    head.appendChild(subj.row);
    card.appendChild(head);

    /* --- Tiếng Anh --- */
    const secEn = h('div', 'dsec');
    const packGrid = h('div', 'dgrid dgrid--packs', null, { role: 'group', 'aria-label': 'Gói bài' });
    const packBtns = cards.map((c, i) => {
      const lv = LEVEL[c.level] || c.level || '';
      const b = h('button', 'dcard' + (c.lesson ? ' dcard--lesson' : ''), null, { type: 'button', 'data-testid': 'deck-pack-' + c.id, 'aria-pressed': 'false' });
      const t1 = h('b', null); t1.textContent = c.title;
      const t2 = h('span', 'dcard-vi'); t2.textContent = c.titleVi;
      b.append(t1, t2);
      if (lv) { const t3 = h('em', null); t3.textContent = lv; b.appendChild(t3); }
      b.dataset.v = c.id; b.dataset.i = String(i);
      pressable(b, () => { st.packId = c.id; markSelected(packGrid, (x) => x.dataset.v === st.packId); });
      packGrid.appendChild(b);
      return b;
    });
    let packPage = 0;
    const packPages = Math.max(1, Math.ceil(cards.length / PAGE_PACKS));
    const packPager = pager('deck-page', () => { packPage = Math.max(0, packPage - 1); showPacks(); }, () => { packPage = Math.min(packPages - 1, packPage + 1); showPacks(); });
    function showPacks() {
      packBtns.forEach((b, i) => { b.hidden = Math.floor(i / PAGE_PACKS) !== packPage; });
      packPager.label.textContent = (packPage + 1) + '/' + packPages;
      packPager.prev.classList.toggle('is-disabled', packPage === 0);
      packPager.next.classList.toggle('is-disabled', packPage >= packPages - 1);
    }
    const packRow = h('div', 'drow drow--grid');
    const packSide = h('div', 'dside'); packSide.appendChild(h('span', 'dlabel', 'Gói bài')); packSide.appendChild(packPager.el);
    packRow.append(packSide, packGrid);
    const kindG = groupRow('Loại câu', KIND.map((k) => ({ v: k[0], text: k[1], testid: 'deck-kind-' + k[0] })), (v) => { st.kind = v; kindG.set(v); });
    secEn.append(packRow, kindG.row);
    card.appendChild(secEn);

    /* --- Toán --- */
    const secMath = h('div', 'dsec');
    secMath.hidden = true;
    const gradeG = groupRow('Lớp', Array.from({ length: 12 }, (_, i) => ({ v: i + 1, text: String(i + 1), testid: 'deck-grade-' + (i + 1), cls: 'dopt--sq' })), (v) => { st.grade = v; st.mathType = null; gradeG.set(v); syncTypes(true); });   // đổi lớp: chọn lại dạng đầu của lớp
    const typeGrid = h('div', 'dgrid dgrid--types', null, { role: 'group', 'aria-label': 'Dạng bài' });
    let typeBtns = [], typePage = 0, typeList = [];
    const typePager = pager('deck-tpage', () => { typePage = Math.max(0, typePage - 1); showTypes(); }, () => { typePage = Math.min(Math.ceil(typeList.length / PAGE_TYPES) - 1, typePage + 1); showTypes(); });
    function showTypes() {
      const pages = Math.max(1, Math.ceil(typeList.length / PAGE_TYPES));
      typePage = Math.min(typePage, pages - 1);
      const shown = new Set(typeList.slice(typePage * PAGE_TYPES, typePage * PAGE_TYPES + PAGE_TYPES).map((x) => x.type));
      typeBtns.forEach((b) => { b.hidden = !shown.has(b.dataset.v); });
      typePager.label.textContent = (typePage + 1) + '/' + pages;
      typePager.prev.classList.toggle('is-disabled', typePage === 0);
      typePager.next.classList.toggle('is-disabled', typePage >= pages - 1);
      typePager.el.hidden = pages <= 1;
    }
    function syncTypes(resetPage) {
      if (!MT) return;
      typeList = MT[st.grade] || [];
      if (!typeList.some((x) => x.type === st.mathType)) st.mathType = typeList.length ? typeList[0].type : null;
      if (resetPage) typePage = Math.max(0, Math.floor(typeList.findIndex((x) => x.type === st.mathType) / PAGE_TYPES));
      markSelected(typeGrid, (b) => b.dataset.v === st.mathType);
      // xếp lại thứ tự thẻ theo danh sách của lớp (dạng của chính lớp đứng đầu)
      const byType = {};
      typeBtns.forEach((b) => { byType[b.dataset.v] = b; });
      typeList.forEach((x) => { if (byType[x.type]) typeGrid.appendChild(byType[x.type]); });
      showTypes();
    }
    const typeRow = h('div', 'drow drow--grid');
    const typeSide = h('div', 'dside'); typeSide.appendChild(h('span', 'dlabel', 'Dạng bài')); typeSide.appendChild(typePager.el);
    typeRow.append(typeSide, typeGrid);
    const diffG = groupRow('Độ khó', [[1, 'Dễ'], [2, 'Vừa'], [3, 'Khó']].map((x) => ({ v: x[0], text: x[1], testid: 'deck-diff-' + x[0] })), (v) => { st.difficulty = v; diffG.set(v); });
    const langG = groupRow('Lời đề', [['vi', 'Tiếng Việt'], ['en', 'English']].map((x) => ({ v: x[0], text: x[1], testid: 'deck-lang-' + x[0] })), (v) => { st.lang = v; langG.set(v); });
    const dl = h('div', 'drow2'); dl.append(diffG.row, langG.row);
    secMath.append(gradeG.row, typeRow, dl);
    card.appendChild(secMath);

    /* --- Cách chơi --- */
    const modeG = groupRow('Chế độ', [['common', 'Đề chung'], ['split', 'Chia câu']].map((x) => ({ v: x[0], text: x[1], testid: 'deck-mode-' + x[0] })), (v) => {
      st.mode = v; modeG.set(v);
      if (v === 'split') { st.timer = { mode: 'off', total: 60 }; timerG.set(timerKey(st.timer)); }
    });
    const orderG = groupRow('Thứ tự', [['seq', 'Lần lượt'], ['rand', 'Ngẫu nhiên']].map((x) => ({ v: x[0], text: x[1], testid: 'deck-order-' + x[0] })), (v) => { st.order = v; orderG.set(v); });
    const countG = groupRow('Số câu', [5, 10, 15, 20].map((n) => ({ v: n, text: String(n), testid: 'deck-count-' + n, cls: 'dopt--sq' })), (v) => { st.count = v; countG.set(v); });
    const timerG = groupRow('Đồng hồ', TIMERS.map((x) => ({ v: x[0] + ':' + x[1], text: x[2], testid: 'deck-timer-' + (x[0] === 'down' ? x[1] : x[0] === 'up' ? 'up' : '0') })), (v) => {
      const p = v.split(':'); st.timer = { mode: p[0], total: Number(p[1]) }; timerG.set(v);
    });
    const r1 = h('div', 'drow2'); r1.append(modeG.row, orderG.row);
    const r2 = h('div', 'drow2'); r2.append(countG.row, timerG.row);
    card.append(r1, r2);

    /* --- hành động --- */
    const note = h('div', 'dnote', '', { 'data-testid': 'deck-note' });
    const actions = h('div', 'sheet-actions');
    const cancel = h('button', 'sbtn sbtn--ghost', 'Huỷ', { type: 'button', 'data-testid': 'deck-cancel' });
    const ok = h('button', 'sbtn sbtn--primary', 'Dùng đề này', { type: 'button', 'data-testid': 'deck-ok' });
    pressable(cancel, () => finish(null));
    pressable(ok, () => {
      if (st.subject === 'en' && !st.packId) { note.textContent = 'Chưa có gói bài nào.'; return; }
      if (st.subject === 'math' && !st.mathType) { note.textContent = 'Hãy chọn dạng bài.'; return; }
      const pack = cards.find((c) => c.id === st.packId);
      finish({
        subject: st.subject,
        source: st.subject === 'en'
          ? { type: pack && pack.lesson ? 'lesson' : 'lib', id: st.packId, title: pack ? (pack.lesson ? pack.titleVi : pack.title) : '' }
          : { type: 'math', id: 'math-' + st.grade + '-' + st.mathType, title: 'Toán lớp ' + st.grade },
        kind: st.subject === 'en' ? st.kind : 'math',
        grade: st.grade, mathType: st.mathType, difficulty: st.difficulty, lang: st.lang,
        mode: st.mode, order: st.order, count: st.count, timer: Object.assign({}, st.timer),
        seed: 0,
      });
    });
    actions.append(cancel, ok);
    card.append(note, actions);

    /* --- trạng thái --- */
    function setSubject(v) {
      st.subject = v; subj.set(v);
      secEn.hidden = v !== 'en'; secMath.hidden = v !== 'math';
      if (v === 'math' && !MT) {
        import('./math/gen.js').then((m) => { MT = m.MATH_TYPES; buildTypes(); syncTypes(true); }).catch(() => { note.textContent = 'Chưa nạp được đề Toán.'; });
      } else if (v === 'math') syncTypes(false);
    }
    function buildTypes() {
      const seen = {};
      for (let g = 1; g <= 12; g++) (MT[g] || []).forEach((x) => { if (!seen[x.type]) seen[x.type] = x; });
      typeBtns = Object.keys(seen).map((k) => {
        const b = h('button', 'dcard dcard--type', null, { type: 'button', 'data-testid': 'deck-type-' + k, 'aria-pressed': 'false' });
        b.textContent = seen[k].labelVi; b.dataset.v = k;
        pressable(b, () => { st.mathType = k; markSelected(typeGrid, (x) => x.dataset.v === st.mathType); });
        typeGrid.appendChild(b);
        return b;
      });
    }
    subj.set(st.subject); kindG.set(st.kind); gradeG.set(st.grade); diffG.set(st.difficulty); langG.set(st.lang);
    modeG.set(st.mode); orderG.set(st.order); countG.set(st.count); timerG.set(timerKey(st.timer));
    markSelected(packGrid, (x) => x.dataset.v === st.packId);
    packPage = Math.max(0, Math.floor(cards.findIndex((c) => c.id === st.packId) / PAGE_PACKS));
    showPacks();
    setSubject(st.subject);
    document.addEventListener('keydown', onKey);
    function onKey(e) { if (e.key === 'Escape') finish(null); }
  });
}

function pager(testid, onPrev, onNext) {
  const el = h('div', 'dpager');
  const prev = h('button', 'dopt dopt--sq', '‹', { type: 'button', 'data-testid': testid + '-prev', 'aria-label': 'Trang trước' });
  const next = h('button', 'dopt dopt--sq', '›', { type: 'button', 'data-testid': testid + '-next', 'aria-label': 'Trang sau' });
  const label = h('span', 'dpager-l', '1/1', { 'data-testid': testid + '-label' });
  pressable(prev, onPrev); pressable(next, onNext);
  el.append(prev, label, next);
  return { el, prev, next, label };
}
