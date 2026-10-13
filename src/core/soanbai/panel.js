// Giao diện các công cụ Soạn nhanh (PLAN-SOANBAI mục C). Nạp lười từ editor.js bằng import().
// Panel chỉ nói chuyện với editor qua `api` (xem editor.js), không đụng DOM của editor.
import { h, openModal, toast, segmented, button } from '../ui.js';
import { icon } from '../icons.js';
import { downloadFile, normalizePack, validatePack } from '../content.js';
import { normKey, splitWordListEx } from './normalize.js';
import { loadBank, fillRows, lookup } from './wordbank.js';
import { QTYPES, SAFE_QTYPES, qtypeLabel, qtypeShort, capacity, generateQuestions } from './qgen.js';
import { detectTable, parseDelimited } from './table.js';
import { decodeText } from './decode.js';
import { fetchSheetCsv, GsheetError } from './gsheet.js';
import { templateCsv, templateXlsx, TEMPLATE_NAMES } from './templates.js';
import { loadIndex, loadPack, LIB_THEMES, countByLevel, visibleLevels, filterPacks, levelTag } from './library.js';
import { catLabel } from './categories.js';
import { t, bind, lang, ensureEn, addStrings } from '../../i18n/index.js';
import VI from '../../i18n/strings/soanbai.vi.js';

addStrings('soanbai', VI);

const MAX_FILE = 5 * 1024 * 1024;
const MAX_VOCAB = 300;
const MAX_QUESTIONS = 200;
const MAX_FILL = 200;

// ---------- Tiện ích ----------

// Nạp chuỗi EN của khu vực Soạn bài (chunk lười soanbai.en) trước khi dựng bất kỳ hộp nào. VI: không làm gì.
async function ready() {
  try {
    await ensureEn('soanbai');
  } catch (err) {
    console.error(err);
  }
}

export function preload() {
  return Promise.all([ready(), loadBank().catch(() => null)]).then((r) => r[1]);
}

// Gắn khoá vào hộp (tiêu đề, nút, nhãn đóng) để đổi ngôn ngữ khi hộp đang mở mà không dựng lại (không mất dữ liệu đang nhập).
// titleKey: khoá tiêu đề; actionKeys: khoá nhãn các nút ở chân hộp theo thứ tự; refresh: hàm cập nhật phần động (chạy khi đổi ngôn ngữ).
function live(modal, titleKey, actionKeys, refresh) {
  if (titleKey) {
    const h2 = modal.el.querySelector('.modal-head h2');
    if (h2) bind(h2, titleKey);
    bind(modal.el, titleKey, null, 'aria-label');
  }
  const x = modal.el.querySelector('.modal-head .btn');
  if (x) { bind(x, 'common.close', null, 'title'); bind(x, 'common.close', null, 'aria-label'); }
  modal.el.querySelectorAll('.modal-actions .btn').forEach((b, i) => {
    const k = actionKeys[i];
    if (!k) return;
    bind(b, k, null, 'title');
    bind(b, k, null, 'aria-label');
    const sp = b.querySelector('span');
    if (sp) bind(sp, k);
  });
  if (refresh) {
    // Lắng nghe thẻ <html lang> (lõi đặt mỗi lần đổi ngôn ngữ) thay cho onLang: danh sách listener của lõi bị lặp trực tiếp
    // nên một listener tự gỡ khi đang phát (editor/main dựng lại trang) làm bỏ sót listener đứng sau.
    const mo = new MutationObserver(() => {
      if (!modal.el.isConnected) { mo.disconnect(); return; }
      refresh();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }
  return modal;
}

// Phần tử chữ gắn khoá (tự đổi khi đổi ngôn ngữ).
const tx = (tag, attrs, key, params) => bind(h(tag, attrs), key, params);

async function getBank() {
  try {
    return await loadBank();
  } catch (err) {
    console.error(err);
    toast(t('sb.bank.loadFail'), 'error', 6000);
    return null;
  }
}

function note(text, cls) {
  return h('p', { class: `soan-note${cls ? ' ' + cls : ''}` }, text);
}

function check(labelKey, checked, testId) {
  const input = h('input', { type: 'checkbox', checked, 'data-testid': testId });
  return { input, el: h('label', { class: 'soan-check' }, input, tx('span', {}, labelKey)) };
}

function modeSelect(testId, withSkip) {
  const opts = [
    tx('option', { value: 'append' }, 'sb.mode.append'),
    tx('option', { value: 'replace' }, 'sb.mode.replace'),
  ];
  if (withSkip) opts.push(tx('option', { value: 'skip' }, 'sb.mode.skip'));
  return bind(h('select', { 'data-testid': testId }, opts), 'sb.mode.aria', null, 'aria-label');
}

function pinActions(modal) {
  modal.el.classList.add('modal-soan');
  return modal;
}

// ---------- (1) Điền từ danh sách ----------

export async function openFill(api, initialText) {
  await ready();
  const bank = await getBank();
  if (!bank) return;
  const area = h('textarea', {
    rows: 8, 'data-testid': 'fill-text', placeholder: t('sb.fill.placeholder'),
  });
  bind(area, 'sb.fill.listAria', null, 'aria-label');
  if (initialText) area.value = initialText;
  const mode = modeSelect('fill-mode', false);
  const only = check('sb.fill.onlyEmpty', true, 'fill-only-empty');
  const result = h('div', { class: 'soan-result', 'data-testid': 'fill-result', 'aria-live': 'polite' });

  const run = () => {
    const list = splitWordListEx(area.value, MAX_FILL);
    if (!list.words.length) {
      result.textContent = '';
      result.append(note(t('sb.fill.needWord'), 'warn'));
      return false;
    }
    const replaceAll = mode.value === 'replace';
    const draftRows = replaceAll ? [] : api.getDraft().vocab;
    const index = new Map();
    draftRows.forEach((r) => { const k = normKey(r.word); if (k && !index.has(k)) index.set(k, r); });
    const fresh = [];
    const dupRows = [];
    const dupSkipped = [];
    list.words.forEach((w) => {
      const row = index.get(normKey(w));
      if (row) {
        if (only.input.checked) dupRows.push(row);
        else dupSkipped.push(w);
      } else {
        fresh.push({ word: w, meaning: '', category: '', example: '', image: '' });
      }
    });
    const done = fillRows(fresh, bank, { onlyEmpty: true });
    const missingWords = done.missing.slice();
    const missingRows = done.missingIdx.map((i) => done.rows[i]);
    let found = done.rows.length - done.missing.length;
    if (replaceAll) api.addVocab(done.rows, 'replace');
    else if (done.rows.length) api.addVocab(done.rows, 'append');
    if (dupRows.length) {
      api.fillEmpty(() => {
        const filledDup = fillRows(dupRows, bank, { onlyEmpty: true });
        dupRows.forEach((row, i) => Object.assign(row, filledDup.rows[i]));
        filledDup.missing.forEach((w, k) => { missingWords.push(w); missingRows.push(dupRows[filledDup.missingIdx[k]]); });
        found += dupRows.length - filledDup.missing.length;
        return filledDup.filled;
      });
    }
    api.markMissing(missingRows);
    const total = done.rows.length + dupRows.length;
    result.textContent = '';
    result.append(note(t('sb.fill.done', { found, total }), 'ok'));
    if (missingWords.length) {
      result.append(note(t('sb.fill.missing', { n: missingWords.length, words: missingWords.join(', ') }), 'warn'));
    }
    if (dupSkipped.length) result.append(note(t('sb.fill.dupSkipped', { n: dupSkipped.length, words: dupSkipped.join(', ') })));
    const viaPlural = done.viaPlural.map((w) => { const e = lookup(bank, w); return e && normKey(e.word) !== normKey(w) ? t('sb.fill.viaPlural', { w, word: e.word }) : null; }).filter(Boolean);
    if (viaPlural.length) result.append(note(viaPlural.join('; ') + '.'));
    if (list.truncated) result.append(note(t('sb.fill.truncated', { max: MAX_FILL, total: list.total }), 'warn'));
    return false;
  };

  const modal = openModal({
    title: t('sb.fill.title'),
    wide: true,
    body: h('div', { class: 'soan-form' },
      tx('p', { class: 'muted' }, 'sb.fill.lead'),
      area,
      h('div', { class: 'soan-row' }, h('label', { class: 'field' }, tx('span', {}, 'sb.mode.aria'), mode)),
      only.el,
      result),
    actions: [
      { label: t('sb.fill.run'), iconName: 'wand', variant: 'primary', attrs: { 'data-testid': 'fill-run' }, onClick: run },
      { label: t('common.done'), iconName: 'check', attrs: { 'data-testid': 'fill-done' }, onClick: () => { api.scrollToVocab(); } },
    ],
  });
  pinActions(modal);
  live(modal, 'sb.fill.title', ['sb.fill.run', 'common.done'], () => { area.placeholder = t('sb.fill.placeholder'); });
  area.focus();
}

// ---------- Tự điền ô trống (nút trong card Từ vựng) ----------

export async function autofillEmpty(api) {
  await ready();
  const bank = await getBank();
  if (!bank) return;
  let missingCount = 0;
  const filled = api.fillEmpty((vocab) => {
    const res = fillRows(vocab, bank, { onlyEmpty: true });
    res.rows.forEach((r, i) => Object.assign(vocab[i], r));
    missingCount = res.missing.length;
    api.setMissing(res.missingIdx.map((i) => vocab[i]));
    return res.filled;
  });
  if (!filled && !missingCount) toast(t('sb.autofill.none'), 'info');
  else toast(`${t('sb.autofill.done', { n: filled })}${missingCount ? ' ' + t('sb.autofill.missing', { n: missingCount }) : ''}`, filled ? 'success' : 'info', 4500);
}

// ---------- (2) Tạo câu hỏi tự động ----------

export async function openQuestions(api) {
  await ready();
  const bank = await getBank();
  const vocab = api.getDraft().vocab;
  const meaningful = vocab.filter((v) => v.word && v.meaning).length;
  const cap = capacity(vocab, { bank, maxLevel: 'auto' });
  const checks = {};
  const list = h('div', { class: 'qtype-list', 'data-testid': 'qtype-list' });
  const rowRefs = [];
  QTYPES.forEach((ty) => {
    const off = !cap[ty];
    // Mặc định chỉ chọn loại an toàn (letter, word, meaning, spell); fill và which giáo viên tự tick và nên xem lại.
    const safe = SAFE_QTYPES.indexOf(ty) >= 0;
    const input = h('input', { type: 'checkbox', checked: !off && safe, disabled: off, 'data-testid': `qtype-${ty}` });
    checks[ty] = input;
    const name = h('span', { class: 'qtype-name' }, qtypeLabel(ty),
      !off && !safe ? tx('small', { class: 'qtype-warn', 'data-testid': `qtype-warn-${ty}` }, 'sb.q.reviewType') : null);
    const capEl = h('span', { class: 'qtype-cap' }, off ? cap.reasons[ty] : t('sb.q.max', { n: cap[ty] }));
    rowRefs.push({ ty, off, name, capEl });
    list.append(h('label', { class: `qtype-row${off ? ' off' : ''}` }, input, name, capEl));
  });
  // Đổi ngôn ngữ khi hộp đang mở: chỉ thay chữ, giữ nguyên ô đã tick.
  const refreshRows = () => {
    const cap2 = capacity(vocab, { bank, maxLevel: 'auto' });
    rowRefs.forEach((r) => {
      r.name.firstChild.textContent = qtypeLabel(r.ty);
      r.capEl.textContent = r.off ? cap2.reasons[r.ty] : t('sb.q.max', { n: cap2[r.ty] });
    });
  };
  let count = 15;
  const counts = segmented([5, 10, 15, 20, 30].map((n) => ({ value: n, label: String(n) })), count, (v) => { count = v; }, 'q-count');
  const mode = modeSelect('q-mode', false);
  const result = h('div', { class: 'soan-result', 'data-testid': 'q-result', 'aria-live': 'polite' });
  const locked = meaningful < 3;

  const run = () => {
    const types = QTYPES.filter((ty) => checks[ty].checked && !checks[ty].disabled);
    result.textContent = '';
    if (!types.length) {
      result.append(note(t('sb.q.needType'), 'warn'));
      return false;
    }
    const draft = api.getDraft();
    const existing = mode.value === 'append' ? draft.questions : [];
    const res = generateQuestions(draft.vocab, { types, count, seed: Date.now() & 0x7fffffff, existing, bank, maxLevel: 'auto', optionsPerQuestion: 3 });
    if (!res.questions.length) {
      result.append(note(t('sb.q.none'), 'warn'));
      return false;
    }
    api.addQuestions(res.questions, mode.value);
    const parts = QTYPES.filter((ty) => res.byType[ty]).map((ty) => `${res.byType[ty]} ${qtypeShort(ty)}`);
    result.append(note(`${t('sb.q.done', { n: res.questions.length, parts: parts.join(', ') })}${res.skippedDup ? ' ' + t('sb.q.dupSkipped', { n: res.skippedDup }) : ''}`, 'ok'));
    if (res.questions.length < count) result.append(note(t('sb.q.partial', { made: res.questions.length, count })));
    return false;
  };

  const modal = openModal({
    title: t('sb.q.title'),
    wide: true,
    body: h('div', { class: 'soan-form' },
      tx('p', { class: 'muted' }, 'sb.q.lead'),
      locked ? bind(note('', 'warn'), 'sb.q.needMeanings') : null,
      list,
      h('div', { class: 'soan-row' },
        h('div', { class: 'field' }, tx('span', {}, 'sb.q.count'), counts),
        h('label', { class: 'field' }, tx('span', {}, 'sb.mode.aria'), h('span', {}, mode))),
      result),
    actions: [
      { label: t('sb.q.run'), iconName: 'sparkles', variant: 'primary', attrs: { 'data-testid': 'q-run', disabled: locked }, onClick: run },
      { label: t('common.done'), iconName: 'check', attrs: { 'data-testid': 'q-done' }, onClick: () => { api.scrollToQuestions(); } },
    ],
  });
  pinActions(modal);
  live(modal, 'sb.q.title', ['sb.q.run', 'common.done'], refreshRows);
}

// ---------- (4) Nhập file ----------

function previewTable(headers, rows) {
  return h('div', { class: 'soan-table-wrap' },
    h('table', { class: 'soan-table' },
      h('thead', {}, h('tr', {}, headers.map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', { 'data-i18n-data': '' }, c)))))));
}

export async function openTemplates() {
  await ready();
  const get = async (kind) => {
    try {
      if (kind === 'xlsx') downloadFile(TEMPLATE_NAMES.xlsx, await templateXlsx(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      else downloadFile(TEMPLATE_NAMES[kind], templateCsv(kind), 'text/csv;charset=utf-8');
    } catch (err) {
      console.error(err);
      toast(t('sb.tpl.fail'), 'error', 5000);
    }
  };
  const item = (kind, labelKey, sub, testId) => h('button', { type: 'button', class: 'tpl-item', 'data-testid': testId, onClick: () => get(kind) },
    icon('download', 22), h('span', {}, tx('strong', {}, labelKey), sub.key ? tx('small', {}, sub.key, sub.params) : h('small', {}, sub.text)));
  const csvSub = (file) => ({ key: 'sb.tpl.csvDesc', params: { file } });
  const modal = openModal({
    title: t('sb.tpl.title'),
    body: h('div', { class: 'tpl-list' },
      item('xlsx', 'sb.tpl.xlsx', { key: 'sb.tpl.xlsxDesc' }, 'tpl-xlsx'),
      item('vocab', 'sb.tpl.csvVocab', csvSub(TEMPLATE_NAMES.vocab), 'tpl-vocab'),
      item('questions', 'sb.tpl.csvQ', csvSub(TEMPLATE_NAMES.questions), 'tpl-questions')),
    actions: [{ label: t('common.close'), variant: 'ghost' }],
  });
  pinActions(modal);
  live(modal, 'sb.tpl.title', ['common.close']);
}

export async function openImport(api, file) {
  await ready();
  // state: kết quả đọc được
  let data = null; // { vocab: {items, errors, from}, questions: {...}, words: {items, from}, notes: [] }
  let busy = false;
  const err = h('div', { class: 'soan-error', 'data-testid': 'import-error', role: 'alert', hidden: true });
  const preview = h('div', { class: 'soan-preview', 'data-testid': 'import-preview', 'aria-live': 'polite' });
  const input = h('input', { type: 'file', accept: '.csv,.tsv,.txt,.xlsx', hidden: true, 'data-testid': 'import-file' });
  const zone = h('div', { class: 'dropzone', role: 'button', tabindex: 0, 'data-testid': 'import-drop' },
    icon('upload', 32),
    tx('strong', {}, 'sb.imp.drop'),
    tx('span', {}, 'sb.imp.dropHint'));
  const gsUrl = h('textarea', { rows: 2, 'data-testid': 'gs-url', 'aria-label': 'Link Google Sheet', placeholder: 'https://docs.google.com/spreadsheets/d/e/.../pubhtml' }); // i18n-keep: tên dịch vụ + mẫu URL
  const gsBtn = button({ label: t('sb.imp.readLink'), iconName: 'link', attrs: { 'data-testid': 'gs-read' }, onClick: () => readLinks() });
  bind(gsBtn.querySelector('span'), 'sb.imp.readLink');
  bind(gsBtn, 'sb.imp.readLink', null, 'title');
  bind(gsBtn, 'sb.imp.readLink', null, 'aria-label');

  const showError = (msg) => {
    err.hidden = !msg;
    err.textContent = '';
    if (msg) String(msg).split('\n').forEach((line) => err.append(h('p', {}, line)));
  };
  const setBusy = (on, label) => {
    busy = on;
    zone.classList.toggle('busy', on);
    if (label) preview.textContent = label;
  };

  const absorb = (parts, from, out) => {
    // parts: [{ name, table }] -> gộp vào out
    const single = parts.length === 1;
    parts.forEach(({ name, table }) => {
      // tag là hàm: tên trang dịch lúc hiển thị (đổi ngôn ngữ khi hộp mở vẫn đúng)
      const tag = () => (name ? t('sb.imp.sheetTag', { name }) : from);
      if (table.kind === 'vocab') {
        out.vocab = out.vocab || { items: [], errors: [], from: tag };
        out.vocab.items.push(...table.items);
        out.vocab.errors.push(...table.errors);
      } else if (table.kind === 'questions') {
        out.questions = out.questions || { items: [], errors: [], from: tag };
        out.questions.items.push(...table.items);
        out.questions.errors.push(...table.errors);
      } else if (table.kind === 'wordlist' && single) {
        out.words = { items: table.items, from: tag };
      } else {
        out.notes.push(() => t('sb.imp.skipSheet', { what: tag() }));
      }
    });
  };

  const finish = (out) => {
    if (!out.vocab && !out.questions && !out.words) {
      data = null;
      preview.textContent = '';
      showError(t('sb.imp.noData'));
      return;
    }
    data = out;
    showError('');
    renderPreview();
  };

  const handleFile = async (f) => {
    if (busy || !f) return;
    showError('');
    preview.textContent = '';
    data = null;
    updateApply();
    const lower = String(f.name || '').toLowerCase();
    const ext = lower.slice(lower.lastIndexOf('.'));
    if (f.size > MAX_FILE) { showError(t('sb.imp.tooBig')); return; }
    if (['.csv', '.tsv', '.txt', '.xlsx'].indexOf(ext) < 0) { showError(t('sb.imp.badType')); return; }
    setBusy(true, t('sb.imp.reading'));
    const out = { vocab: null, questions: null, words: null, notes: [] };
    try {
      const buf = await f.arrayBuffer();
      if (ext === '.xlsx') {
        const { readXlsx } = await import('./xlsx.js');
        const sheets = await readXlsx(new Uint8Array(buf), { maxRows: 2000 });
        const parts = sheets.map((s) => {
          if (s.truncated) out.notes.push(() => t('sb.imp.sheetTruncated', { name: s.name }));
          return { name: s.name, table: detectTable(s.rows) };
        });
        absorb(parts, f.name, out);
      } else {
        const dec = decodeText(buf);
        if (dec.legacyEncoding) out.notes.push(() => t('sb.imp.notUtf8'));
        absorb([{ name: '', table: detectTable(parseDelimited(dec.text)) }], f.name, out);
      }
    } catch (e) {
      if (!(e && e.code)) console.error(e);
      setBusy(false);
      preview.textContent = '';
      showError(e && e.code ? e.message : t('sb.xlsx.openFail'));
      return;
    }
    setBusy(false);
    finish(out);
  };

  const readLinks = async () => {
    if (busy) return;
    const links = gsUrl.value.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    showError('');
    if (!links.length) { showError(t('sb.gs.needLink')); return; }
    setBusy(true, t('sb.gs.reading'));
    gsBtn.disabled = true;
    const out = { vocab: null, questions: null, words: null, notes: [] };
    try {
      const parts = [];
      for (let i = 0; i < links.length; i++) {
        const text = await fetchSheetCsv(links[i]);
        parts.push({ name: links.length > 1 ? `link ${i + 1}` : '', table: detectTable(parseDelimited(text)) });
      }
      absorb(parts, 'Google Sheet', out); // i18n-keep: tên dịch vụ
    } catch (e) {
      setBusy(false);
      gsBtn.disabled = false;
      preview.textContent = '';
      showError(e instanceof GsheetError ? e.message : t('sb.gs.readFail'));
      return;
    }
    gsBtn.disabled = false;
    setBusy(false);
    finish(out);
  };

  // ----- Xem trước -----
  let vMode;
  let qMode;
  let autofill;
  const renderPreview = () => {
    preview.textContent = '';
    const d = data;
    const frag = [];
    let vocabItems = null;
    if (d.vocab) vocabItems = d.vocab.items;
    else if (d.words) vocabItems = d.words.items.map((w) => ({ word: w, meaning: '', category: '', example: '', image: '' }));
    const msgs = [];
    if (vocabItems) msgs.push(t(d.words && !d.vocab ? 'sb.imp.sumWords' : 'sb.imp.sumVocab', { n: vocabItems.length, from: (d.vocab || d.words).from() }));
    if (d.questions) msgs.push(t('sb.imp.sumQuestions', { n: d.questions.items.length, from: d.questions.from() }));
    frag.push(h('p', { class: 'soan-summary', 'data-testid': 'import-summary' }, t('sb.imp.summary', { list: msgs.join(t('sb.and')) })));
    const errors = [];
    if (d.vocab) errors.push(...d.vocab.errors);
    if (d.questions) errors.push(...d.questions.errors);
    // Kiểm bằng validatePack của ứng dụng để báo thêm lỗi nội dung.
    const pack = normalizePack({ vocab: vocabItems || [], questions: d.questions ? d.questions.items : [], teams: ['x', 'y'] });
    // Lỗi dòng từ vựng đã được bảng báo riêng: lọc theo loại (errorRows), không dò chữ hiển thị.
    const vp = validatePack(pack);
    vp.errors.forEach((e, i) => { if (errors.indexOf(e) < 0 && vp.errorRows[i] !== 'vocab') errors.push(e); });
    if (errors.length) {
      const shown = errors.slice(0, 6);
      frag.push(h('ul', { class: 'soan-errors' }, shown.map((e) => h('li', {}, e)),
        errors.length > shown.length ? h('li', {}, t('sb.imp.moreRows', { n: errors.length - shown.length })) : null));
    }
    d.notes.forEach((n) => frag.push(note(n(), 'warn')));
    if (vocabItems) {
      if (vocabItems.length > MAX_VOCAB) frag.push(note(t('sb.imp.vocabTruncated', { max: MAX_VOCAB, n: vocabItems.length }), 'warn'));
      frag.push(h('h3', {}, t('sb.imp.vocab')),
        previewTable([t('sb.col.word'), t('sb.col.meaning'), t('sb.col.category'), t('sb.col.example')], vocabItems.slice(0, 5).map((v) => [v.word, v.meaning, v.category, v.example])));
      vMode = modeSelect('import-vocab-mode', true);
      frag.push(h('label', { class: 'field soan-inline' }, h('span', {}, t('sb.imp.vocab')), vMode));
    } else vMode = null;
    if (d.questions) {
      if (d.questions.items.length > MAX_QUESTIONS) frag.push(note(t('sb.imp.qTruncated', { max: MAX_QUESTIONS, n: d.questions.items.length }), 'warn'));
      frag.push(h('h3', {}, t('sb.imp.questions')),
        previewTable([t('sb.col.prompt'), 'A', 'B', 'C', t('sb.col.correct')], d.questions.items.slice(0, 5).map((q) => [q.prompt, q.options[0], q.options[1], q.options[2], 'ABC'[q.answer]])));
      qMode = modeSelect('import-q-mode', true);
      frag.push(h('label', { class: 'field soan-inline' }, h('span', {}, t('sb.imp.questions')), qMode));
    } else qMode = null;
    if (vocabItems) {
      autofill = check('sb.imp.autofill', true, 'import-autofill');
      frag.push(autofill.el);
    } else autofill = null;
    preview.append(...frag);
    updateApply();
  };

  const updateApply = () => {
    const b = modal.el.querySelector('[data-testid="import-apply"]');
    if (b) b.disabled = !data;
  };

  const apply = async () => {
    if (!data) return false;
    const d = data;
    let nv = 0;
    let nq = 0;
    let vocabItems = null;
    if (d.vocab) vocabItems = d.vocab.items;
    else if (d.words) vocabItems = d.words.items.map((w) => ({ word: w, meaning: '', category: '', example: '', image: '' }));
    if (vocabItems && vMode && vMode.value !== 'skip') {
      let rows = vocabItems.slice(0, MAX_VOCAB).map((v) => Object.assign({}, v));
      let missingRows = [];
      if (autofill && autofill.input.checked) {
        const bank = await getBank();
        if (bank) {
          const res = fillRows(rows, bank, { onlyEmpty: true });
          rows = res.rows;
          missingRows = res.missingIdx.map((i) => rows[i]);
        }
      }
      api.addVocab(rows, vMode.value);
      api.markMissing(missingRows);
      nv = rows.length;
    }
    if (d.questions && qMode && qMode.value !== 'skip') {
      const items = d.questions.items.slice(0, MAX_QUESTIONS);
      api.addQuestions(items, qMode.value);
      nq = items.length;
    }
    if (!nv && !nq) {
      toast(t('sb.imp.nothing'), 'info');
      return true;
    }
    toast(t('sb.imp.done', { list: [nv ? t('cnt.words', { n: nv }) : '', nq ? t('cnt.questions', { n: nq }) : ''].filter(Boolean).join(', ') }), 'success', 4000);
    if (nv) api.scrollToVocab();
    return true;
  };

  // Kéo thả bên trong modal (tránh trình duyệt mở file ra khi thả hụt vùng).
  const stop = (e) => { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) e.preventDefault(); };
  const onDocDrop = (e) => {
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  };
  document.addEventListener('dragover', stop);
  document.addEventListener('drop', onDocDrop);

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  zone.addEventListener('dragover', () => zone.classList.add('over'));
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', () => zone.classList.remove('over'));
  input.addEventListener('change', () => { const f = input.files && input.files[0]; if (f) handleFile(f); input.value = ''; });

  const modal = openModal({
    title: t('sb.imp.title'),
    wide: true,
    onClose: () => {
      document.removeEventListener('dragover', stop);
      document.removeEventListener('drop', onDocDrop);
    },
    body: h('div', { class: 'soan-form' },
      zone, input,
      h('div', { class: 'soan-tpl-line' },
        h('button', { type: 'button', class: 'qt-link', 'data-testid': 'import-template', onClick: () => openTemplates() }, t('sb.tpl.title'))),
      h('div', { class: 'soan-gs' },
        h('label', { class: 'field' }, tx('span', {}, 'sb.gs.or'), gsUrl),
        gsBtn,
        tx('p', { class: 'muted' }, 'sb.gs.help')),
      err, preview),
    actions: [
      { label: t('sb.imp.run'), iconName: 'check', variant: 'primary', attrs: { 'data-testid': 'import-apply', disabled: true }, onClick: () => { apply().then((ok) => { if (ok) modal.close(); }); return false; } },
      { label: t('common.close'), variant: 'ghost' },
    ],
  });
  pinActions(modal);
  // Đổi ngôn ngữ khi hộp đang mở: dựng lại bản xem trước từ dữ liệu đã đọc, giữ lựa chọn "cách thêm" và ô tick.
  live(modal, 'sb.imp.title', ['sb.imp.run', 'common.close'], () => {
    if (!data) return;
    const keep = { v: vMode && vMode.value, q: qMode && qMode.value, a: autofill && autofill.input.checked };
    renderPreview();
    if (vMode && keep.v) vMode.value = keep.v;
    if (qMode && keep.q) qMode.value = keep.q;
    if (autofill && keep.a != null) autofill.input.checked = keep.a;
  });
  if (file) handleFile(file);
}

// ---------- (5) Thư viện bài ----------

const LIB_LEVEL_KEY = 'esl.soanbai.libLevel';

// CSS riêng của Thư viện bài, nạp một lần (tương thích Chromium 109: flex/grid cố định, không color-mix, không aspect-ratio).
function injectLibStyle() {
  if (document.getElementById('lib-style')) return;
  const st = document.createElement('style');
  st.id = 'lib-style';
  st.textContent = `
.lib-bar { position: sticky; top: 0; z-index: 2; display: grid; gap: 0.6rem; padding: 0.3rem 0 0.6rem; background: rgba(246, 246, 248, 0.97); border-radius: 0 0 1rem 1rem; }
.lib-tabs, .lib-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.lib-tab { min-height: 48px; padding: 0 0.8rem; border-radius: 999px; font-size: 0.95rem; }
.lib-chip { min-height: 46px; padding: 0 0.85rem; border-radius: 999px; font-size: 0.92rem; }
.lib-tab[aria-pressed='true'], .lib-chip[aria-pressed='true'] { background: var(--green, #2f9e44); border-color: var(--green-dark, #237a34); color: #fff; }
.lib-searchrow { display: flex; align-items: center; gap: 0.8rem; }
.lib-search { flex: 1 1 auto; min-height: 56px; padding: 0 1rem; font-size: 1.05rem; min-width: 0; }
.lib-found { flex: none; color: var(--ink-muted, #667); font-weight: 700; }
.lib-chips { margin-top: 0.2rem; }
.lib-note { margin: 0 0 0.6rem; font-size: 0.9rem; }
.lib-group { grid-column: 1 / -1; margin: 0.4rem 0 0; font-size: 1.05rem; }
.lib-empty { grid-column: 1 / -1; }
`;
  document.head.appendChild(st);
}

// Tên cấp hiển thị: cấp "other" lưu 'Mở rộng' trong dữ liệu gói, giao diện lấy theo ngôn ngữ.
const levelName = (x) => (x.level === 'other' ? t('level.other') : x.levelLabel);

export async function openLibrary(api) {
  await ready();
  let index;
  try {
    index = await loadIndex();
  } catch (e) {
    console.error(e);
    toast(t('sb.lib.loadFail'), 'error', 6000);
    return;
  }
  // Tab theo cấp (chỉ hiện cấp có gói). Tab mở lần trước được nhớ (localStorage, có thể bị chặn); lần đầu là A1 Movers.
  const counts = countByLevel(index);
  const tabs = visibleLevels(index);
  const tabLabel = (l) => (l.value === 'all' ? l.label : `${l.label} · ${counts[l.value]}`);
  let saved = null;
  try { saved = localStorage.getItem(LIB_LEVEL_KEY); } catch (e) { /* bỏ qua */ }
  let level = tabs.some((tb) => tb.value === saved) ? saved : (tabs.some((tb) => tb.value === 'movers') ? 'movers' : 'all');
  let theme = '';
  let query = '';
  injectLibStyle();
  const grid = h('div', { class: 'lib-grid', 'data-testid': 'lib-grid' });

  const choose = async (entry) => {
    let pack;
    try {
      pack = await loadPack(entry.id);
    } catch (e) {
      console.error(e);
      toast(t('sb.lib.packFail'), 'error', 5000);
      return;
    }
    const ask = openModal({
      title: t('sb.lib.useTitle', { title: entry.title }),
      body: h('div', {},
        tx('p', {}, 'sb.lib.useBody', { counts: `${t('cnt.words', { n: entry.words })}, ${t('cnt.questions', { n: entry.questions })}` }),
        tx('p', { class: 'muted' }, 'sb.lib.useWarn')),
      actions: [
        { label: t('ui.cancel'), variant: 'ghost' },
        { label: t('sb.lib.append'), iconName: 'plus', attrs: { 'data-testid': 'lib-append' }, onClick: () => {
          api.addVocab(pack.vocab.map((v) => Object.assign({}, v)), 'append');
          api.addQuestions(pack.questions.map((q) => Object.assign({}, q, { options: q.options.slice() })), 'append');
          toast(t('sb.lib.appended', { title: entry.title }), 'success', 4000);
          api.scrollToVocab();
          lib.close();
        } },
        { label: t('sb.lib.replace'), iconName: 'refresh', variant: 'primary', attrs: { 'data-testid': 'lib-replace' }, onClick: () => {
          const teams = api.getDraft().teams.slice();
          api.replacePack(Object.assign({}, pack, { teams: teams.length >= 2 ? teams : pack.teams }));
          toast(t('sb.lib.opened', { title: entry.title }), 'success', 4500);
          lib.close();
        } },
      ],
    });
    pinActions(ask);
    live(ask, null, ['ui.cancel', 'sb.lib.append', 'sb.lib.replace']);
    const askTitle = ask.el.querySelector('.modal-head h2');
    if (askTitle) {
      bind(askTitle, 'sb.lib.useTitle', { title: entry.title });
      bind(ask.el, 'sb.lib.useTitle', { title: entry.title }, 'aria-label');
    }
  };

  const card = (x) => h('button', { type: 'button', class: 'lib-card', 'data-testid': 'lib-card', 'data-id': x.id, onClick: () => choose(x) },
    h('strong', { class: 'lib-title' }, x.title),
    // Tên tiếng Việt chỉ hiện ở giao diện VI (EN: tên gói tiếng Anh là đủ).
    lang() === 'en' ? null : h('span', { class: 'lib-vi' }, x.titleVi),
    h('span', { class: 'lib-count' }, `${t('cnt.words', { n: x.words })} · ${t('cnt.questions', { n: x.questions })}`, h('span', { class: 'lib-level-tag' }, ' · ' + levelTag(x))),
    h('span', { class: 'lib-words', 'data-i18n-data': '' }, (x.preview || []).map((w) => h('em', {}, w))));

  const renderGrid = () => {
    grid.textContent = '';
    const items = filterPacks(index, { level, theme, q: query });
    if (!items.length) {
      grid.append(h('p', { class: 'soan-note lib-empty', 'data-testid': 'lib-empty' }, query.trim() ? t('sb.lib.noMatch', { q: query.trim() }) : t('sb.lib.empty')));
      return;
    }
    if (level === 'all') {
      // Tất cả chủ đề: nhóm theo cấp, gói chung ở cuối
      const groups = [];
      items.forEach((x) => {
        const key = x.general ? 'general' : x.level;
        let g = groups.find((y) => y.key === key);
        if (!g) { g = { key, label: x.general ? t('sb.lib.general') : levelName(x), list: [] }; groups.push(g); }
        g.list.push(x);
      });
      groups.forEach((g) => {
        grid.append(h('h3', { class: 'lib-group' }, `${g.label} · ${g.list.length}`));
        g.list.forEach((x) => grid.append(card(x)));
      });
    } else {
      items.forEach((x) => grid.append(card(x)));
    }
    const shown = grid.querySelectorAll('.lib-card').length;
    countEl.textContent = t('sb.lib.count', { n: shown });
  };
  const countEl = h('span', { class: 'lib-found', 'aria-live': 'polite' }, '');

  const tabEls = tabs.map((tb) => h('button', {
    type: 'button', class: 'btn lib-tab', 'data-value': tb.value, 'data-testid': 'lib-tab', 'aria-pressed': String(tb.value === level),
    onClick: () => {
      if (level === tb.value) return;
      level = tb.value;
      tabEls.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === level)));
      try { localStorage.setItem(LIB_LEVEL_KEY, level); } catch (e) { /* bỏ qua */ }
      renderGrid();
      const mb = grid.closest('.modal-body');
      if (mb) mb.scrollTop = 0;
    },
  }, tabLabel(tb)));
  const tabRow = h('div', { class: 'lib-tabs', role: 'group', 'data-testid': 'lib-level' }, tabEls);

  // Chip chủ đề: cách tìm trên bảng cảm ứng (không cần bàn phím ảo).
  const chipDefs = [{ value: '', get label() { return t('sb.lib.anyTopic'); } }].concat(LIB_THEMES);
  const chipEls = chipDefs.map((c) => h('button', {
    type: 'button', class: 'btn lib-chip', 'data-value': c.value, 'data-testid': 'lib-chip', 'aria-pressed': String(c.value === theme),
    onClick: () => {
      theme = c.value;
      chipEls.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === theme)));
      renderGrid();
    },
  }, c.label));
  // Ô gõ chỉ dành cho laptop (màn Soạn bài). Trên bảng ClassIn dùng chip ở trên.
  const search = h('input', {
    type: 'text', class: 'lib-search', 'data-testid': 'lib-search', autocomplete: 'off', spellcheck: 'false',
    placeholder: t('sb.lib.searchPh'),
    onInput: (e) => { query = e.target.value; renderGrid(); },
  });
  bind(search, 'sb.lib.search', null, 'aria-label');
  renderGrid();
  const lib = openModal({
    title: t('sb.lib.title'),
    wide: true,
    body: h('div', { class: 'soan-form lib-body' },
      h('div', { class: 'lib-bar' },
        tabRow,
        h('div', { class: 'lib-searchrow' }, search, countEl)),
      h('div', { class: 'lib-chips', 'data-testid': 'lib-chips' }, chipEls),
      tx('p', { class: 'muted lib-note' }, 'sb.lib.note'),
      grid),
    actions: [{ label: t('common.close'), variant: 'ghost' }],
  });
  pinActions(lib);
  // Đổi ngôn ngữ khi thư viện đang mở: đổi chữ tab, chip, ô tìm và dựng lại lưới; giữ cấp, chủ đề và từ đang tìm.
  live(lib, 'sb.lib.title', ['common.close'], () => {
    tabEls.forEach((b, i) => { b.textContent = tabLabel(tabs[i]); });
    chipEls.forEach((b, i) => { b.textContent = chipDefs[i].label; });
    search.placeholder = t('sb.lib.searchPh');
    renderGrid();
  });
}
