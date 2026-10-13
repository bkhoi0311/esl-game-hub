// Giao diện các công cụ Soạn nhanh (PLAN-SOANBAI mục C). Nạp lười từ editor.js bằng import().
// Panel chỉ nói chuyện với editor qua `api` (xem editor.js), không đụng DOM của editor.
import { h, openModal, toast, segmented, button } from '../ui.js';
import { icon } from '../icons.js';
import { downloadFile, normalizePack, validatePack } from '../content.js';
import { normKey, splitWordListEx } from './normalize.js';
import { loadBank, fillRows, lookup } from './wordbank.js';
import { QTYPES, SAFE_QTYPES, QTYPE_LABELS, QTYPE_SHORT, capacity, generateQuestions } from './qgen.js';
import { detectTable, parseDelimited } from './table.js';
import { decodeText } from './decode.js';
import { fetchSheetCsv, GsheetError } from './gsheet.js';
import { templateCsv, templateXlsx, TEMPLATE_NAMES } from './templates.js';
import { loadIndex, loadPack, LIB_THEMES, countByLevel, visibleLevels, filterPacks, levelTag } from './library.js';

const MAX_FILE = 5 * 1024 * 1024;
const MAX_VOCAB = 300;
const MAX_QUESTIONS = 200;
const MAX_FILL = 200;

// ---------- Tiện ích ----------

export function preload() {
  return loadBank().catch(() => null);
}

async function getBank() {
  try {
    return await loadBank();
  } catch (err) {
    console.error(err);
    toast('Không tải được kho từ. Tải lại trang (F5) rồi thử lại.', 'error', 6000);
    return null;
  }
}

const plural = (n, one) => `${n} ${one}`;

function note(text, cls) {
  return h('p', { class: `soan-note${cls ? ' ' + cls : ''}` }, text);
}

function check(label, checked, testId) {
  const input = h('input', { type: 'checkbox', checked, 'data-testid': testId });
  return { input, el: h('label', { class: 'soan-check' }, input, h('span', {}, label)) };
}

function modeSelect(testId, withSkip) {
  const opts = [
    h('option', { value: 'append' }, 'Thêm vào cuối'),
    h('option', { value: 'replace' }, 'Thay toàn bộ'),
  ];
  if (withSkip) opts.push(h('option', { value: 'skip' }, 'Không nhập'));
  return h('select', { 'data-testid': testId, 'aria-label': 'Cách thêm' }, opts);
}

function pinActions(modal) {
  modal.el.classList.add('modal-soan');
  return modal;
}

// ---------- (1) Điền từ danh sách ----------

export async function openFill(api, initialText) {
  const bank = await getBank();
  if (!bank) return;
  const area = h('textarea', {
    rows: 8, 'data-testid': 'fill-text', 'aria-label': 'Danh sách từ',
    placeholder: 'Mỗi dòng 1 từ, hoặc ngăn bằng dấu phẩy. Ví dụ:\napple, banana, orange\nice cream',
  });
  if (initialText) area.value = initialText;
  const mode = modeSelect('fill-mode', false);
  const only = check('Từ đã có trong bảng: chỉ điền ô còn trống (bỏ chọn = bỏ qua từ trùng)', true, 'fill-only-empty');
  const result = h('div', { class: 'soan-result', 'data-testid': 'fill-result', 'aria-live': 'polite' });

  const run = () => {
    const list = splitWordListEx(area.value, MAX_FILL);
    if (!list.words.length) {
      result.textContent = '';
      result.append(note('Hãy gõ ít nhất 1 từ tiếng Anh.', 'warn'));
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
    result.append(note(`Đã điền ${found}/${total} từ.`, 'ok'));
    if (missingWords.length) {
      result.append(note(`${plural(missingWords.length, 'từ')} chưa có trong kho: ${missingWords.join(', ')}. Hãy tự điền nghĩa cho các dòng có viền cam.`, 'warn'));
    }
    if (dupSkipped.length) result.append(note(`Bỏ qua ${plural(dupSkipped.length, 'từ trùng')}: ${dupSkipped.join(', ')}.`));
    const viaPlural = done.viaPlural.map((w) => { const e = lookup(bank, w); return e && normKey(e.word) !== normKey(w) ? `${w} → dùng nghĩa của ${e.word}` : null; }).filter(Boolean);
    if (viaPlural.length) result.append(note(viaPlural.join('; ') + '.'));
    if (list.truncated) result.append(note(`Chỉ lấy ${MAX_FILL} từ đầu tiên (danh sách có ${list.total} từ).`, 'warn'));
    return false;
  };

  const modal = openModal({
    title: 'Điền từ danh sách',
    wide: true,
    body: h('div', { class: 'soan-form' },
      h('p', { class: 'muted' }, 'Gõ từ tiếng Anh, máy tự điền nghĩa, nhóm và câu ví dụ từ kho có sẵn. Không cần mạng.'),
      area,
      h('div', { class: 'soan-row' }, h('label', { class: 'field' }, h('span', {}, 'Cách thêm'), mode)),
      only.el,
      result),
    actions: [
      { label: 'Điền từ kho', iconName: 'wand', variant: 'primary', attrs: { 'data-testid': 'fill-run' }, onClick: run },
      { label: 'Xong', iconName: 'check', attrs: { 'data-testid': 'fill-done' }, onClick: () => { api.scrollToVocab(); } },
    ],
  });
  pinActions(modal);
  area.focus();
}

// ---------- Tự điền ô trống (nút trong card Từ vựng) ----------

export async function autofillEmpty(api) {
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
  if (!filled && !missingCount) toast('Không có ô trống nào cần điền.', 'info');
  else toast(`Đã điền ${plural(filled, 'dòng')}.${missingCount ? ` ${plural(missingCount, 'từ')} chưa có trong kho (viền cam).` : ''}`, filled ? 'success' : 'info', 4500);
}

// ---------- (2) Tạo câu hỏi tự động ----------

export async function openQuestions(api) {
  const bank = await getBank();
  const vocab = api.getDraft().vocab;
  const meaningful = vocab.filter((v) => v.word && v.meaning).length;
  const cap = capacity(vocab, { bank, maxLevel: 'auto' });
  const checks = {};
  const list = h('div', { class: 'qtype-list', 'data-testid': 'qtype-list' });
  QTYPES.forEach((t) => {
    const off = !cap[t];
    // Mặc định chỉ chọn loại an toàn (letter, word, meaning, spell); fill và which giáo viên tự tick và nên xem lại.
    const safe = SAFE_QTYPES.indexOf(t) >= 0;
    const input = h('input', { type: 'checkbox', checked: !off && safe, disabled: off, 'data-testid': `qtype-${t}` });
    checks[t] = input;
    list.append(h('label', { class: `qtype-row${off ? ' off' : ''}` }, input,
      h('span', { class: 'qtype-name' }, QTYPE_LABELS[t],
        !off && !safe ? h('small', { class: 'qtype-warn', 'data-testid': `qtype-warn-${t}` }, 'Nên xem lại các câu loại này') : null),
      h('span', { class: 'qtype-cap' }, off ? cap.reasons[t] : `tối đa ${cap[t]}`)));
  });
  let count = 15;
  const counts = segmented([5, 10, 15, 20, 30].map((n) => ({ value: n, label: String(n) })), count, (v) => { count = v; }, 'q-count');
  const mode = modeSelect('q-mode', false);
  const result = h('div', { class: 'soan-result', 'data-testid': 'q-result', 'aria-live': 'polite' });
  const locked = meaningful < 3;

  const run = () => {
    const types = QTYPES.filter((t) => checks[t].checked && !checks[t].disabled);
    result.textContent = '';
    if (!types.length) {
      result.append(note('Hãy chọn ít nhất 1 loại câu hỏi.', 'warn'));
      return false;
    }
    const draft = api.getDraft();
    const existing = mode.value === 'append' ? draft.questions : [];
    const res = generateQuestions(draft.vocab, { types, count, seed: Date.now() & 0x7fffffff, existing, bank, maxLevel: 'auto', optionsPerQuestion: 3 });
    if (!res.questions.length) {
      result.append(note('Không tạo được câu nào. Hãy thêm nghĩa, câu ví dụ hoặc nhóm cho các từ rồi thử lại.', 'warn'));
      return false;
    }
    api.addQuestions(res.questions, mode.value);
    const parts = QTYPES.filter((t) => res.byType[t]).map((t) => `${res.byType[t]} ${QTYPE_SHORT[t]}`);
    result.append(note(`Đã tạo ${res.questions.length} câu: ${parts.join(', ')}.${res.skippedDup ? ` Bỏ ${res.skippedDup} câu trùng với câu đã có.` : ''}`, 'ok'));
    if (res.questions.length < count) result.append(note(`Chỉ tạo được ${res.questions.length}/${count} câu vì bảng từ chưa đủ dữ liệu.`));
    return false;
  };

  const modal = openModal({
    title: 'Tạo câu hỏi tự động',
    wide: true,
    body: h('div', { class: 'soan-form' },
      h('p', { class: 'muted' }, 'Máy sinh câu hỏi 3 đáp án từ bảng từ vựng. Bạn xem và sửa tay được ngay trong bảng câu hỏi.'),
      locked ? note('Cần ít nhất 3 từ có nghĩa.', 'warn') : null,
      list,
      h('div', { class: 'soan-row' },
        h('div', { class: 'field' }, h('span', {}, 'Số câu'), counts),
        h('label', { class: 'field' }, h('span', {}, 'Cách thêm'), h('span', {}, mode))),
      result),
    actions: [
      { label: 'Tạo câu hỏi', iconName: 'sparkles', variant: 'primary', attrs: { 'data-testid': 'q-run', disabled: locked }, onClick: run },
      { label: 'Xong', iconName: 'check', attrs: { 'data-testid': 'q-done' }, onClick: () => { api.scrollToQuestions(); } },
    ],
  });
  pinActions(modal);
}

// ---------- (4) Nhập file ----------

function previewTable(headers, rows) {
  return h('div', { class: 'soan-table-wrap' },
    h('table', { class: 'soan-table' },
      h('thead', {}, h('tr', {}, headers.map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, c)))))));
}

export async function openTemplates() {
  const get = async (kind) => {
    try {
      if (kind === 'xlsx') downloadFile(TEMPLATE_NAMES.xlsx, await templateXlsx(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      else downloadFile(TEMPLATE_NAMES[kind], templateCsv(kind), 'text/csv;charset=utf-8');
    } catch (err) {
      console.error(err);
      toast('Không tạo được file mẫu. Hãy thử file CSV.', 'error', 5000);
    }
  };
  const item = (kind, label, sub, testId) => h('button', { type: 'button', class: 'tpl-item', 'data-testid': testId, onClick: () => get(kind) },
    icon('download', 22), h('span', {}, h('strong', {}, label), h('small', {}, sub)));
  const modal = openModal({
    title: 'Tải file mẫu',
    body: h('div', { class: 'tpl-list' },
      item('xlsx', 'File mẫu Excel (.xlsx, 2 trang)', 'Trang Từ vựng + trang Câu hỏi + trang Hướng dẫn', 'tpl-xlsx'),
      item('vocab', 'File mẫu CSV – từ vựng', 'mau-tu-vung.csv (UTF-8, mở được bằng Excel)', 'tpl-vocab'),
      item('questions', 'File mẫu CSV – câu hỏi', 'mau-cau-hoi.csv (UTF-8, mở được bằng Excel)', 'tpl-questions')),
    actions: [{ label: 'Đóng', variant: 'ghost' }],
  });
  pinActions(modal);
}

const MSG_BIG = 'File lớn hơn 5 MB. Hãy xoá bớt dòng hoặc chia nhỏ.';
const MSG_EXT = 'Chỉ nhận file .csv, .txt hoặc .xlsx. File .xls cũ: mở bằng Excel rồi Lưu thành .xlsx.';
const MSG_EMPTY = 'Không tìm thấy dữ liệu. Dòng đầu nên là tiêu đề cột như file mẫu.';
const MSG_LEGACY = "File không lưu dạng UTF-8, chữ Việt có thể lỗi. Trong Excel chọn Lưu thành 'CSV UTF-8'.";

export async function openImport(api, file) {
  // state: kết quả đọc được
  let data = null; // { vocab: {items, errors, from}, questions: {...}, words: {items, from}, notes: [] }
  let busy = false;
  const err = h('div', { class: 'soan-error', 'data-testid': 'import-error', role: 'alert', hidden: true });
  const preview = h('div', { class: 'soan-preview', 'data-testid': 'import-preview', 'aria-live': 'polite' });
  const input = h('input', { type: 'file', accept: '.csv,.tsv,.txt,.xlsx', hidden: true, 'data-testid': 'import-file' });
  const zone = h('div', { class: 'dropzone', role: 'button', tabindex: 0, 'data-testid': 'import-drop' },
    icon('upload', 32),
    h('strong', {}, 'Kéo thả file vào đây hoặc bấm để chọn'),
    h('span', {}, 'CSV, TXT hoặc Excel (.xlsx), tối đa 5 MB'));
  const gsUrl = h('textarea', { rows: 2, 'data-testid': 'gs-url', 'aria-label': 'Link Google Sheet', placeholder: 'https://docs.google.com/spreadsheets/d/e/.../pubhtml' });
  const gsBtn = button({ label: 'Đọc link', iconName: 'link', attrs: { 'data-testid': 'gs-read' }, onClick: () => readLinks() });

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
      const tag = name ? `trang '${name}'` : from;
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
        out.notes.push(`Bỏ qua ${name ? `trang '${name}'` : from} (không nhận ra cột).`);
      }
    });
  };

  const finish = (out) => {
    if (!out.vocab && !out.questions && !out.words) {
      data = null;
      preview.textContent = '';
      showError(MSG_EMPTY);
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
    if (f.size > MAX_FILE) { showError(MSG_BIG); return; }
    if (['.csv', '.tsv', '.txt', '.xlsx'].indexOf(ext) < 0) { showError(MSG_EXT); return; }
    setBusy(true, 'Đang đọc file...');
    const out = { vocab: null, questions: null, words: null, notes: [] };
    try {
      const buf = await f.arrayBuffer();
      if (ext === '.xlsx') {
        const { readXlsx } = await import('./xlsx.js');
        const sheets = await readXlsx(new Uint8Array(buf), { maxRows: 2000 });
        const parts = sheets.map((s) => {
          if (s.truncated) out.notes.push(`Trang '${s.name}' có hơn 2000 dòng, chỉ đọc 2000 dòng đầu.`);
          return { name: s.name, table: detectTable(s.rows) };
        });
        absorb(parts, f.name, out);
      } else {
        const dec = decodeText(buf);
        if (dec.legacyEncoding) out.notes.push(MSG_LEGACY);
        absorb([{ name: '', table: detectTable(parseDelimited(dec.text)) }], f.name, out);
      }
    } catch (e) {
      if (!(e && e.code)) console.error(e);
      setBusy(false);
      preview.textContent = '';
      showError(e && e.code ? e.message : 'Không mở được file Excel (có thể bị khoá mật khẩu hoặc hỏng).');
      return;
    }
    setBusy(false);
    finish(out);
  };

  const readLinks = async () => {
    if (busy) return;
    const links = gsUrl.value.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    showError('');
    if (!links.length) { showError('Hãy dán link Google Sheet đã Xuất bản lên web.'); return; }
    setBusy(true, 'Đang đọc Google Sheet...');
    gsBtn.disabled = true;
    const out = { vocab: null, questions: null, words: null, notes: [] };
    try {
      const parts = [];
      for (let i = 0; i < links.length; i++) {
        const text = await fetchSheetCsv(links[i]);
        parts.push({ name: links.length > 1 ? `link ${i + 1}` : '', table: detectTable(parseDelimited(text)) });
      }
      absorb(parts, 'Google Sheet', out);
    } catch (e) {
      setBusy(false);
      gsBtn.disabled = false;
      preview.textContent = '';
      showError(e instanceof GsheetError ? e.message : 'Không đọc được link. Thử lại hoặc tải trang tính về dạng CSV rồi kéo thả vào đây.');
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
    if (vocabItems) msgs.push(`${vocabItems.length} ${d.words && !d.vocab ? 'từ tiếng Anh (chỉ có từ)' : 'từ vựng'} (${(d.vocab || d.words).from})`);
    if (d.questions) msgs.push(`${d.questions.items.length} câu hỏi (${d.questions.from})`);
    frag.push(h('p', { class: 'soan-summary', 'data-testid': 'import-summary' }, 'Đọc được ' + msgs.join(' và ') + '.'));
    const errors = [];
    if (d.vocab) errors.push(...d.vocab.errors);
    if (d.questions) errors.push(...d.questions.errors);
    // Kiểm bằng validatePack của ứng dụng để báo thêm lỗi nội dung.
    const pack = normalizePack({ vocab: vocabItems || [], questions: d.questions ? d.questions.items : [], teams: ['x', 'y'] });
    validatePack(pack).errors.forEach((e) => { if (errors.indexOf(e) < 0 && !/^Từ vựng dòng/.test(e)) errors.push(e); });
    if (errors.length) {
      const shown = errors.slice(0, 6);
      frag.push(h('ul', { class: 'soan-errors' }, shown.map((e) => h('li', {}, e)),
        errors.length > shown.length ? h('li', {}, `… và ${errors.length - shown.length} dòng khác`) : null));
    }
    d.notes.forEach((n) => frag.push(note(n, 'warn')));
    if (vocabItems) {
      if (vocabItems.length > MAX_VOCAB) frag.push(note(`Chỉ nhập ${MAX_VOCAB} từ đầu tiên (file có ${vocabItems.length} từ).`, 'warn'));
      frag.push(h('h3', {}, 'Từ vựng'),
        previewTable(['Từ', 'Nghĩa', 'Nhóm', 'Ví dụ'], vocabItems.slice(0, 5).map((v) => [v.word, v.meaning, v.category, v.example])));
      vMode = modeSelect('import-vocab-mode', true);
      frag.push(h('label', { class: 'field soan-inline' }, h('span', {}, 'Từ vựng'), vMode));
    } else vMode = null;
    if (d.questions) {
      if (d.questions.items.length > MAX_QUESTIONS) frag.push(note(`Chỉ nhập ${MAX_QUESTIONS} câu đầu tiên (file có ${d.questions.items.length} câu).`, 'warn'));
      frag.push(h('h3', {}, 'Câu hỏi'),
        previewTable(['Câu hỏi', 'A', 'B', 'C', 'Đúng'], d.questions.items.slice(0, 5).map((q) => [q.prompt, q.options[0], q.options[1], q.options[2], 'ABC'[q.answer]])));
      qMode = modeSelect('import-q-mode', true);
      frag.push(h('label', { class: 'field soan-inline' }, h('span', {}, 'Câu hỏi'), qMode));
    } else qMode = null;
    if (vocabItems) {
      autofill = check('Điền nghĩa, nhóm, ví dụ còn trống từ kho', true, 'import-autofill');
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
      toast('Chưa nhập gì: cả hai phần đang để "Không nhập".', 'info');
      return true;
    }
    toast(`Đã nhập ${[nv ? plural(nv, 'từ') : '', nq ? plural(nq, 'câu hỏi') : ''].filter(Boolean).join(', ')}.`, 'success', 4000);
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
    title: 'Nhập file',
    wide: true,
    onClose: () => {
      document.removeEventListener('dragover', stop);
      document.removeEventListener('drop', onDocDrop);
    },
    body: h('div', { class: 'soan-form' },
      zone, input,
      h('div', { class: 'soan-tpl-line' },
        h('button', { type: 'button', class: 'qt-link', 'data-testid': 'import-template', onClick: () => openTemplates() }, 'Tải file mẫu')),
      h('div', { class: 'soan-gs' },
        h('label', { class: 'field' }, h('span', {}, 'Hoặc dán link Google Sheet (đã Xuất bản lên web)'), gsUrl),
        gsBtn,
        h('p', { class: 'muted' }, 'Cần mạng. Trong Google Sheet: Tệp > Chia sẻ > Xuất bản lên web > chọn trang tính > CSV > Xuất bản. Mỗi trang tính 1 link; dán nhiều link, mỗi dòng 1 link.')),
      err, preview),
    actions: [
      { label: 'Đưa vào bảng', iconName: 'check', variant: 'primary', attrs: { 'data-testid': 'import-apply', disabled: true }, onClick: () => { apply().then((ok) => { if (ok) modal.close(); }); return false; } },
      { label: 'Đóng', variant: 'ghost' },
    ],
  });
  pinActions(modal);
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

export async function openLibrary(api) {
  let index;
  try {
    index = await loadIndex();
  } catch (e) {
    console.error(e);
    toast('Không tải được thư viện bài. Tải lại trang (F5) rồi thử lại.', 'error', 6000);
    return;
  }
  // Tab theo cấp (chỉ hiện cấp có gói). Tab mở lần trước được nhớ (localStorage, có thể bị chặn); lần đầu là A1 Movers.
  const counts = countByLevel(index);
  const tabs = visibleLevels(index).map((l) => Object.assign({}, l, { label: l.value === 'all' ? l.label : `${l.label} · ${counts[l.value]}` }));
  let saved = null;
  try { saved = localStorage.getItem(LIB_LEVEL_KEY); } catch (e) { /* bỏ qua */ }
  let level = tabs.some((t) => t.value === saved) ? saved : (tabs.some((t) => t.value === 'movers') ? 'movers' : 'all');
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
      toast('Không tải được bài này. Thử lại sau.', 'error', 5000);
      return;
    }
    const ask = openModal({
      title: `Dùng bài '${entry.title}'?`,
      body: h('div', {},
        h('p', {}, `${entry.words} từ, ${entry.questions} câu hỏi. Bạn chọn cách đưa vào:`),
        h('p', { class: 'muted' }, 'Nếu chọn "Thay bài đang soạn", nội dung hiện tại sẽ bị thay. Nên Lưu file .edu trước nếu muốn giữ lại. Tên đội hiện tại được giữ nguyên.')),
      actions: [
        { label: 'Hủy', variant: 'ghost' },
        { label: 'Chỉ thêm từ vựng và câu hỏi vào cuối', iconName: 'plus', attrs: { 'data-testid': 'lib-append' }, onClick: () => {
          api.addVocab(pack.vocab.map((v) => Object.assign({}, v)), 'append');
          api.addQuestions(pack.questions.map((q) => Object.assign({}, q, { options: q.options.slice() })), 'append');
          toast(`Đã thêm từ vựng và câu hỏi của bài ${entry.title}.`, 'success', 4000);
          api.scrollToVocab();
          lib.close();
        } },
        { label: 'Thay bài đang soạn', iconName: 'refresh', variant: 'primary', attrs: { 'data-testid': 'lib-replace' }, onClick: () => {
          const teams = api.getDraft().teams.slice();
          api.replacePack(Object.assign({}, pack, { teams: teams.length >= 2 ? teams : pack.teams }));
          toast(`Đã mở bài ${entry.title}. Bạn có thể sửa tuỳ ý.`, 'success', 4500);
          lib.close();
        } },
      ],
    });
    pinActions(ask);
  };

  const card = (x) => h('button', { type: 'button', class: 'lib-card', 'data-testid': 'lib-card', 'data-id': x.id, onClick: () => choose(x) },
    h('strong', { class: 'lib-title' }, x.title),
    h('span', { class: 'lib-vi' }, x.titleVi),
    h('span', { class: 'lib-count' }, `${x.words} từ · ${x.questions} câu hỏi`, h('span', { class: 'lib-level-tag' }, ' · ' + levelTag(x))),
    h('span', { class: 'lib-words' }, (x.preview || []).map((w) => h('em', {}, w))));

  const renderGrid = () => {
    grid.textContent = '';
    const items = filterPacks(index, { level, theme, q: query });
    if (!items.length) {
      grid.append(h('p', { class: 'soan-note lib-empty', 'data-testid': 'lib-empty' }, query.trim() ? `Không có bài khớp '${query.trim()}'.` : 'Chưa có bài cho lựa chọn này.'));
      return;
    }
    if (level === 'all') {
      // Tất cả chủ đề: nhóm theo cấp, gói chung ở cuối
      const groups = [];
      items.forEach((x) => {
        const key = x.general ? 'general' : x.level;
        let g = groups.find((y) => y.key === key);
        if (!g) { g = { key, label: x.general ? 'Chủ đề chung' : x.levelLabel, list: [] }; groups.push(g); }
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
    countEl.textContent = `${shown} bài`;
  };
  const countEl = h('span', { class: 'lib-found', 'aria-live': 'polite' }, '');

  const tabEls = tabs.map((t) => h('button', {
    type: 'button', class: 'btn lib-tab', 'data-value': t.value, 'data-testid': 'lib-tab', 'aria-pressed': String(t.value === level),
    onClick: () => {
      if (level === t.value) return;
      level = t.value;
      tabEls.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === level)));
      try { localStorage.setItem(LIB_LEVEL_KEY, level); } catch (e) { /* bỏ qua */ }
      renderGrid();
      const mb = grid.closest('.modal-body');
      if (mb) mb.scrollTop = 0;
    },
  }, t.label));
  const tabRow = h('div', { class: 'lib-tabs', role: 'group', 'data-testid': 'lib-level' }, tabEls);

  // Chip chủ đề: cách tìm trên bảng cảm ứng (không cần bàn phím ảo).
  const chipDefs = [{ value: '', label: 'Mọi chủ đề' }].concat(LIB_THEMES);
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
    'aria-label': 'Tìm bài', placeholder: 'Tìm bài: food, đồ ăn, animals… (gõ trên laptop)',
    onInput: (e) => { query = e.target.value; renderGrid(); },
  });
  renderGrid();
  const lib = openModal({
    title: 'Thư viện bài',
    wide: true,
    body: h('div', { class: 'soan-form lib-body' },
      h('div', { class: 'lib-bar' },
        tabRow,
        h('div', { class: 'lib-searchrow' }, search, countEl)),
      h('div', { class: 'lib-chips', 'data-testid': 'lib-chips' }, chipEls),
      h('p', { class: 'muted lib-note' }, 'Chọn một bài theo chủ đề rồi sửa tuỳ ý. Cấp độ dựa trên danh sách từ vựng Cambridge English (Starters, Movers, Flyers 2025; A2 Key; B1 Preliminary). Ứng dụng không liên kết với Cambridge.'),
      grid),
    actions: [{ label: 'Đóng', variant: 'ghost' }],
  });
  pinActions(lib);
}
