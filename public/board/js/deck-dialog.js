// Hộp thoại "Chọn đề" (PLAN-V2 mục C.2). Không cuộn: danh sách dài chia trang bằng nút ‹ ›.
// openDeckDialog(ctx) -> Promise<choice|null>
//   ctx: { sheets, prefill?: {...} }
//   choice: { subject:'en'|'math', source:{type,id,title}, kind, grade, mathType, difficulty, lang, langTouched, mode, order, count, timer:{mode,total} }
//   lang = lời đề Toán: mặc định theo ngôn ngữ giao diện, giáo viên vẫn đổi riêng được (langTouched = đã tự chọn thì giữ lựa chọn đó).
import { h, markSelected } from './dom.js';
import { pressable } from './ui.js';
import { groupRow } from './sheets.js';
import { bind, bindPair, lang, t } from './i18n.js';

const PAGE_PACKS = 8, PAGE_TYPES = 8;
const KIND = ['write', 'missing', 'mc'];   // khoá chuỗi board.deck.kind.<k>
// [mode, giây, khoá chuỗi, tham số]
const TIMERS = [['off', 0, 'board.timer.off'], ['down', 30, 'board.timer.sec', { n: 30 }], ['down', 60, 'board.timer.sec', { n: 60 }], ['down', 90, 'board.timer.sec', { n: 90 }], ['down', 120, 'board.timer.min', { n: 2 }], ['up', 0, 'board.timer.up']];
const LEVEL = { starters: 'Starters', movers: 'Movers', flyers: 'Flyers' };
const timerKey = (t) => t.mode + ':' + t.total;

export function defaultChoice(ctx) {
  return {
    subject: 'en', packId: null, kind: 'write', grade: 3, mathType: null, difficulty: 2, lang: lang(), langTouched: false,
    mode: 'common', order: 'seq', count: 10, timer: { mode: 'down', total: 60 },
  };
}

export async function openDeckDialog(ctx) {
  const st = Object.assign(defaultChoice(ctx), ctx.prefill || {});
  if (!st.langTouched) st.lang = lang();
  st.timer = Object.assign({}, st.timer);
  let catalog = [];
  try { catalog = (await import('../packs/catalog.js')).default; } catch (e) { catalog = []; }
  let MT = null;   // MATH_TYPES nạp lười khi mở mục Toán
  const cards = [];
  catalog.forEach((c) => cards.push(c));
  if (!st.packId || !cards.some((c) => c.id === st.packId)) st.packId = cards.length ? cards[0].id : null;

  return new Promise((resolve) => {
    let done = false;
    const sh = ctx.sheets.open({
      testid: 'deck-dialog', cls: 'sheet--deck', titleKey: 'board.deck.title', modal: true,
      onClose: () => { document.removeEventListener('keydown', onKey); if (!done) { done = true; resolve(null); } },
    });
    const card = sh.card;
    const finish = (v) => { if (done) return; done = true; sh.close(); resolve(v); };

    /* --- tiêu đề + Môn --- */
    const head = h('div', 'drow dhead');
    head.appendChild(bind(h('h2', 'sheet-title'), 'board.deck.title'));
    const subj = groupRow(null, [{ v: 'en', key: 'board.deck.subjEn', testid: 'deck-subject-en' }, { v: 'math', key: 'board.deck.subjMath', testid: 'deck-subject-math' }], (v) => setSubject(v), { ariaKey: 'board.deck.subject' });
    head.appendChild(subj.row);
    card.appendChild(head);

    /* --- Tiếng Anh --- */
    const secEn = h('div', 'dsec');
    const packGrid = bind(h('div', 'dgrid dgrid--packs', null, { role: 'group' }), 'board.deck.packs', null, 'aria-label');
    const packBtns = cards.map((c, i) => {
      const lv = LEVEL[c.level] || c.level || '';
      const b = h('button', 'dcard', null, { type: 'button', 'data-testid': 'deck-pack-' + c.id, 'aria-pressed': 'false' });
      // Gói thư viện: VI hiện title (đậm) + titleVi (dòng phụ); EN ẩn dòng phụ bằng CSS.
      const t1 = h('b', null); if (c.titleKey) bind(t1, c.titleKey); else t1.textContent = c.title;
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
    const packSide = h('div', 'dside'); packSide.appendChild(bind(h('span', 'dlabel'), 'board.deck.packs')); packSide.appendChild(packPager.el);
    packRow.append(packSide, packGrid);
    const kindG = groupRow('board.deck.kind', KIND.map((k) => ({ v: k, key: 'board.deck.kind.' + k, testid: 'deck-kind-' + k })), (v) => { st.kind = v; kindG.set(v); });
    secEn.append(packRow, kindG.row);
    card.appendChild(secEn);

    /* --- Toán --- */
    const secMath = h('div', 'dsec');
    secMath.hidden = true;
    const gradeG = groupRow('board.deck.grade', Array.from({ length: 12 }, (_, i) => ({ v: i + 1, text: String(i + 1), testid: 'deck-grade-' + (i + 1), cls: 'dopt--sq' })), (v) => { st.grade = v; st.mathType = null; gradeG.set(v); syncTypes(true); });   // đổi lớp: chọn lại dạng đầu của lớp
    const typeGrid = bind(h('div', 'dgrid dgrid--types', null, { role: 'group' }), 'board.deck.mathType', null, 'aria-label');
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
    const typeSide = h('div', 'dside'); typeSide.appendChild(bind(h('span', 'dlabel'), 'board.deck.mathType')); typeSide.appendChild(typePager.el);
    typeRow.append(typeSide, typeGrid);
    const diffG = groupRow('board.deck.diff', [1, 2, 3].map((x) => ({ v: x, key: 'board.deck.diff.' + x, testid: 'deck-diff-' + x })), (v) => { st.difficulty = v; diffG.set(v); });
    // hai nút lời đề giữ tên tự gọi "Tiếng Việt" / "English" ở cả hai ngôn ngữ giao diện
    const langG = groupRow('board.deck.promptLang', ['vi', 'en'].map((x) => ({ v: x, key: 'lang.' + x, testid: 'deck-lang-' + x })), (v) => { st.lang = v; st.langTouched = true; langG.set(v); });
    const dl = h('div', 'drow2'); dl.append(diffG.row, langG.row);
    secMath.append(gradeG.row, typeRow, dl);
    card.appendChild(secMath);

    /* --- Cách chơi --- */
    const modeG = groupRow('board.deck.mode', ['common', 'split'].map((x) => ({ v: x, key: 'board.deck.mode.' + x, testid: 'deck-mode-' + x })), (v) => {
      st.mode = v; modeG.set(v);
      if (v === 'split') { st.timer = { mode: 'off', total: 60 }; timerG.set(timerKey(st.timer)); }
    });
    const orderG = groupRow('board.deck.order', ['seq', 'rand'].map((x) => ({ v: x, key: 'board.deck.order.' + x, testid: 'deck-order-' + x })), (v) => { st.order = v; orderG.set(v); });
    const countG = groupRow('board.deck.count', [5, 10, 15, 20].map((n) => ({ v: n, text: String(n), testid: 'deck-count-' + n, cls: 'dopt--sq' })), (v) => { st.count = v; countG.set(v); });
    const timerG = groupRow('board.deck.timer', TIMERS.map((x) => ({ v: x[0] + ':' + x[1], key: x[2], args: x[3], testid: 'deck-timer-' + (x[0] === 'down' ? x[1] : x[0] === 'up' ? 'up' : '0') })), (v) => {
      const p = v.split(':'); st.timer = { mode: p[0], total: Number(p[1]) }; timerG.set(v);
    });
    const r1 = h('div', 'drow2'); r1.append(modeG.row, orderG.row);
    const r2 = h('div', 'drow2'); r2.append(countG.row, timerG.row);
    card.append(r1, r2);

    /* --- hành động --- */
    const note = h('div', 'dnote', '', { 'data-testid': 'deck-note' });
    const actions = h('div', 'sheet-actions');
    const cancel = bind(h('button', 'sbtn sbtn--ghost', null, { type: 'button', 'data-testid': 'deck-cancel' }), 'common.cancel');
    const ok = bind(h('button', 'sbtn sbtn--primary', null, { type: 'button', 'data-testid': 'deck-ok' }), 'board.deck.ok');
    // note: thông báo theo khoá (đổi ngôn ngữ thì dịch lại); key rỗng = xoá
    const setNote = (key) => { if (key) bind(note, key); else { note.removeAttribute('data-i18n'); note.textContent = ''; } };
    pressable(cancel, () => finish(null));
    pressable(ok, () => {
      if (st.subject === 'en' && !st.packId) { setNote('board.deck.noPacks'); return; }
      if (st.subject === 'math' && !st.mathType) { setNote('board.deck.pickType'); return; }
      const pack = cards.find((c) => c.id === st.packId);
      finish({
        subject: st.subject,
        source: st.subject === 'en'
          ? { type: 'lib', id: st.packId, title: pack ? pack.title : '' }
          : { type: 'math', id: 'math-' + st.grade + '-' + st.mathType, title: t('board.deck.mathTitle', { n: st.grade }) },
        kind: st.subject === 'en' ? st.kind : 'math',
        grade: st.grade, mathType: st.mathType, difficulty: st.difficulty, lang: st.lang, langTouched: !!st.langTouched,
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
        import('./math/gen.js').then((m) => { MT = m.MATH_TYPES; buildTypes(); syncTypes(true); }).catch(() => { setNote('board.deck.mathLoadFail'); });
      } else if (v === 'math') syncTypes(false);
    }
    function buildTypes() {
      const seen = {};
      for (let g = 1; g <= 12; g++) (MT[g] || []).forEach((x) => { if (!seen[x.type]) seen[x.type] = x; });
      typeBtns = Object.keys(seen).map((k) => {
        const b = h('button', 'dcard dcard--type', null, { type: 'button', 'data-testid': 'deck-type-' + k, 'aria-pressed': 'false' });
        bindPair(b, { vi: seen[k].labelVi, en: seen[k].labelEn || seen[k].labelVi }); b.dataset.v = k;
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
  const prev = bind(h('button', 'dopt dopt--sq', '‹', { type: 'button', 'data-testid': testid + '-prev' }), 'board.deck.pagePrev', null, 'aria-label');
  const next = bind(h('button', 'dopt dopt--sq', '›', { type: 'button', 'data-testid': testid + '-next' }), 'board.deck.pageNext', null, 'aria-label');
  const label = h('span', 'dpager-l', '1/1', { 'data-testid': testid + '-label' });
  pressable(prev, onPrev); pressable(next, onNext);
  el.append(prev, label, next);
  return { el, prev, next, label };
}
