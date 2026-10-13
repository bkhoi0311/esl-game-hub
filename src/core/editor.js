// Tab Soạn bài (giao diện tiếng Việt cho giáo viên).
// Sửa trực tiếp trong bảng, dán bảng từ Excel/Google Sheet, lưu thành file .edu cho ClassIn,
// xem video hướng dẫn, khôi phục nội dung mẫu.
import {
  LIMITS, getPack, lessonLink, normalizePack, resetToSample, saveEduFile,
  setPack, validatePack, encodeLesson, eduFileText, downloadFile, fileSlug,
} from './content.js';
import { speak } from './audio.js';
import { openGuide } from './guide.js';
import { TEAM_COLORS, button, confirmModal, h, openModal, toast } from './ui.js';
import { icon } from './icons.js';

import { parseTsv, rowsToVocab, rowsToQuestions } from './soanbai/table.js';

// Giữ tương thích: các hàm đọc bảng đã chuyển sang soanbai/table.js (thuần, test được bằng node).
export { parseTsv, rowsToVocab, rowsToQuestions } from './soanbai/table.js';

const VOCAB_COLS = ['word', 'meaning', 'category', 'example'];
const VOCAB_LABELS = { word: 'Từ (word)', meaning: 'Nghĩa (meaning)', category: 'Nhóm (category)', example: 'Câu ví dụ (example)' };

// ---------- Link bài học ----------

async function openLinkModal(pack) {
  const { errors } = validatePack(pack);
  if (errors.length) {
    toast(`Bài còn ${errors.length} lỗi, sửa xong mới lưu được. Ví dụ: ${errors[0]}`, 'error', 7000);
    return;
  }
  let url;
  try {
    url = await lessonLink(pack);
  } catch (err) {
    console.error(err);
    toast('Không tạo được link trên trình duyệt này. Hãy dùng Chrome hoặc Edge bản mới.', 'error', 6000);
    return;
  }
  const titleInput = h('input', { type: 'text', value: pack.title || 'ESL Game Hub', maxLength: 60, 'data-testid': 'edu-title' });
  const who = h('select', { 'data-testid': 'edu-who' },
    h('option', { value: 'false' }, 'Tất cả học sinh'),
    h('option', { value: 'true' }, 'Chỉ học sinh được cấp quyền'));
  const field = h('textarea', { class: 'link-field', readonly: true, rows: 3, value: url, 'data-testid': 'lesson-link', onFocus: (e) => e.target.select() });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      field.select();
      document.execCommand('copy');
    }
    toast('Đã sao chép link bài học.', 'success');
  };
  const saveEdu = async () => {
    try {
      const name = await saveEduFile(pack, { title: titleInput.value.trim(), authorizedOnly: who.value === 'true' });
      toast(`Đã lưu ${name}. Tải file này lên Cloud Drive ClassIn.`, 'success', 5000);
    } catch (err) {
      console.error(err);
      toast('Không lưu được file .edu.', 'error');
    }
  };
  // v2: link riêng cho Bảng nhiều người viết (bài đi theo phần sau dấu #, không gửi lên máy chủ)
  let boardUrl = '';
  try {
    boardUrl = new URL('board/?zones=3&src=lesson', location.href.split('#')[0]).href + '#L=' + await encodeLesson(pack);
  } catch (err) {
    console.error(err);
  }
  const saveBoardEdu = () => {
    try {
      const title = titleInput.value.trim() || pack.title || 'ESL Game Hub';
      const o = JSON.parse(eduFileText({ url: boardUrl, title: title + ' – Bảng', authorizedOnly: who.value === 'true' }));
      Object.assign(o, { uid: false, identity: false, nickname: false, size: '1280x720,960x540' });
      const name = `${fileSlug({ title })}-bang.edu`;
      downloadFile(name, JSON.stringify(o, null, 1).replace(/\n/g, '\r\n'), 'application/octet-stream');
      toast(`Đã lưu ${name}. Tải file này lên Cloud Drive ClassIn.`, 'success', 5000);
    } catch (err) {
      console.error(err);
      toast('Không lưu được file .edu cho Bảng.', 'error');
    }
  };
  const long = url.length > 2000 || boardUrl.length > 2000;
  openModal({
    title: 'Lưu bài cho ClassIn (.edu)',
    wide: true,
    body: h('div', { class: 'link-modal' },
      h('p', {}, h('strong', {}, pack.title || 'Bài chưa đặt tên'), ` · ${pack.vocab.length} từ, ${pack.questions.length} câu hỏi`),
      h('label', { class: 'field' }, h('span', {}, 'Tên hiện trên thanh tiêu đề ClassIn'), titleInput),
      h('label', { class: 'field' }, h('span', {}, 'Ai được tương tác với file .edu?'), who),
      h('ol', { class: 'link-steps' },
        h('li', {}, 'Bấm "Lưu file .edu": máy tải về 1 file .edu có sẵn bài này.'),
        h('li', {}, 'Trong Bảng đen: bấm biểu tượng đám mây, Upload, chọn file vừa lưu.'),
        h('li', {}, 'Trên màn hình lớp (cùng tài khoản): Tệp, Drive của tôi, bấm file của bài.')),
      h('details', { class: 'link-more' },
        h('summary', {}, `Hoặc dùng link (dài ${url.length} ký tự)`),
        field),
      h('p', { class: 'muted' }, 'File .edu và link chứa toàn bộ bài nên ai có file cũng xem được nội dung. Không ghi tên hay thông tin học sinh vào bài. Muốn sửa bài: mở file, vào Cài đặt, chọn "Sửa bài này".'),
      long ? h('p', { class: 'warn-text' }, 'Bài khá dài. Nếu ClassIn không mở được, hãy bớt câu hỏi hoặc tách thành 2 bài.') : null),
    actions: [
      { label: 'Mở thử', iconName: 'external', onClick: () => { window.open(url, '_blank', 'noopener'); return false; } },
      { label: 'Sao chép link', iconName: 'copy', onClick: () => { copy(); return false; } },
      boardUrl ? { label: 'Mở thử trên Bảng', iconName: 'external', attrs: { 'data-testid': 'open-board' }, onClick: () => { window.open(boardUrl, '_blank', 'noopener'); return false; } } : null,
      boardUrl ? { label: 'Lưu .edu cho Bảng nhiều người viết', iconName: 'download', attrs: { 'data-testid': 'save-edu-board' }, onClick: () => { saveBoardEdu(); return false; } } : null,
      { label: 'Lưu file .edu', iconName: 'download', variant: 'primary', attrs: { 'data-testid': 'save-edu' }, onClick: () => { saveEdu(); return false; } },
    ].filter(Boolean),
  });
}

// ---------- Tab Soạn bài ----------

export function mountEditor(root) {
  let draft = normalizePack(getPack());
  let saveTimer = null;
  let savedAt = null;
  const missing = new Set(); // dòng từ chưa có trong kho (chỉ tạm, không lưu vào bài)

  const status = h('span', { class: 'editor-status' });
  const issues = h('div', { class: 'editor-issues' });
  const vocabBody = h('tbody');
  const questionBody = h('tbody');
  const vocabCount = h('span', { class: 'count' });
  const questionCount = h('span', { class: 'count' });
  const teamsBox = h('div', { class: 'teams-edit' });

  // ----- Lưu tự động -----
  const commit = (immediate = false) => {
    clearTimeout(saveTimer);
    const run = () => {
      setPack(draft);
      savedAt = new Date();
      renderStatus();
    };
    if (immediate) run();
    else {
      status.textContent = 'Đang lưu...';
      saveTimer = setTimeout(run, 400);
    }
  };

  const renderStatus = () => {
    const { errors, warnings } = validatePack(normalizePack(draft));
    status.textContent = savedAt ? `Đã lưu tự động lúc ${savedAt.toLocaleTimeString('vi-VN')}` : 'Nội dung được lưu tự động trên máy này.';
    issues.textContent = '';
    if (!errors.length && !warnings.length) {
      issues.append(h('div', { class: 'issue ok' }, icon('circle-check', 20), 'Nội dung hợp lệ.'));
      return;
    }
    const list = [...errors.map((t) => ['error', t]), ...warnings.map((t) => ['warn', t])];
    const shown = list.slice(0, 6);
    issues.append(
      h(
        'details',
        { class: 'issue-box', open: errors.length > 0 },
        h('summary', {}, icon('alert', 20), `${errors.length} lỗi, ${warnings.length} lưu ý`),
        h('ul', {}, shown.map(([kind, t]) => h('li', { class: kind }, t))),
        list.length > shown.length ? h('p', { class: 'muted' }, `... và ${list.length - shown.length} mục khác.`) : null,
      ),
    );
  };

  // ----- Thông tin bài + đội -----
  const titleInput = h('input', {
    type: 'text', value: draft.title, placeholder: 'Ví dụ: Unit 5 - Food', 'data-testid': 'pack-title',
    onInput: (e) => { draft.title = e.target.value; commit(); },
  });
  const levelInput = h('input', {
    type: 'text', value: draft.level, placeholder: 'A2', class: 'short',
    onInput: (e) => { draft.level = e.target.value; commit(); },
  });

  const renderTeams = () => {
    teamsBox.textContent = '';
    draft.teams.forEach((name, i) => {
      teamsBox.append(
        h(
          'div',
          { class: 'team-edit', style: { '--team': TEAM_COLORS[i] } },
          h('input', {
            type: 'text', value: name, 'aria-label': `Tên đội ${i + 1}`,
            onInput: (e) => { draft.teams[i] = e.target.value; commit(); },
          }),
          draft.teams.length > LIMITS.minTeams
            ? button({ iconName: 'x', title: 'Xóa đội', variant: 'ghost', onClick: () => { draft.teams.splice(i, 1); renderTeams(); commit(); } })
            : null,
        ),
      );
    });
    if (draft.teams.length < LIMITS.maxTeams) {
      const defaults = ['Red', 'Blue', 'Green', 'Yellow'];
      teamsBox.append(
        button({
          label: 'Thêm đội', iconName: 'plus', variant: 'ghost',
          onClick: () => { draft.teams.push(defaults.find((d) => !draft.teams.includes(d)) || `Team ${draft.teams.length + 1}`); renderTeams(); commit(); },
        }),
      );
    }
  };

  // ----- Bảng từ vựng -----
  const cellInput = (obj, key, onPasteRows, onEdit) =>
    h('input', {
      type: 'text', value: obj[key] ?? '', 'aria-label': key,
      onInput: (e) => { obj[key] = key === 'category' ? e.target.value.toLowerCase() : e.target.value; if (onEdit) onEdit(); commit(); },
      onPaste: onPasteRows,
    });

  const renderVocab = () => {
    vocabBody.textContent = '';
    draft.vocab.forEach((v, i) => {
      // Dán nhiều dòng/cột vào 1 ô: điền bảng bắt đầu từ ô đó.
      const pasteAt = (col) => (e) => {
        const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
        if (!/[\t\n]/.test(text.trim())) return;
        e.preventDefault();
        pasteIntoVocab(i, col, parseTsv(text));
      };
      const clearMissing = () => {
        if (!missing.delete(v)) return;
        tr.classList.remove('row-missing');
        const tag = tr.querySelector('.missing-tag');
        if (tag) tag.remove();
      };
      const tr = h(
        'tr', { class: missing.has(v) ? 'row-missing' : '' },
        h('td', { class: 'num' }, i + 1),
        VOCAB_COLS.map((key, col) => h(
          'td', { class: `col-${key}` },
          cellInput(v, key, pasteAt(col), key === 'meaning' ? clearMissing : null),
          key === 'word' && missing.has(v) ? h('span', { class: 'missing-tag' }, 'chưa có trong kho') : null)),
        h(
          'td', { class: 'row-actions' },
          button({ iconName: 'volume', title: `Nghe "${v.word}"`, variant: 'ghost', onClick: () => speak(v.word, { manual: true }) }),
          button({ iconName: 'trash', title: 'Xóa dòng', variant: 'ghost', onClick: () => { missing.delete(v); draft.vocab.splice(i, 1); renderVocab(); commit(); } }),
        ),
      );
      vocabBody.append(tr);
    });
    const cats = new Set(draft.vocab.map((v) => v.category).filter(Boolean));
    vocabCount.textContent = `${draft.vocab.length} từ, ${cats.size} nhóm`;
  };

  const pasteIntoVocab = (startRow, startCol, rows) => {
    rows.forEach((r, k) => {
      const target = draft.vocab[startRow + k] || (draft.vocab[startRow + k] = { word: '', meaning: '', category: '', example: '', image: '' });
      r.forEach((val, c) => {
        const key = VOCAB_COLS[startCol + c];
        if (key) target[key] = key === 'category' ? val.toLowerCase() : val;
      });
    });
    renderVocab();
    commit();
    toast(`Đã dán ${rows.length} dòng vào bảng từ vựng.`, 'success');
  };

  // ----- Bảng câu hỏi -----
  const renderQuestions = () => {
    questionBody.textContent = '';
    draft.questions.forEach((q, i) => {
      const group = `q${i}-answer`;
      questionBody.append(
        h(
          'tr', {},
          h('td', { class: 'num' }, i + 1),
          h('td', { class: 'col-prompt' }, cellInput(q, 'prompt')),
          q.options.map((opt, k) =>
            h(
              'td', { class: 'col-option' },
              h(
                'label', { class: `option-cell${q.answer === k ? ' correct' : ''}`, title: 'Chọn làm đáp án đúng' },
                h('input', {
                  type: 'radio', name: group, checked: q.answer === k, 'aria-label': `Đáp án đúng ${'ABC'[k]}`,
                  onChange: () => { q.answer = k; renderQuestions(); commit(); },
                }),
                h('span', { class: 'option-key' }, 'ABC'[k]),
                h('input', {
                  type: 'text', value: opt, 'aria-label': `Đáp án ${'ABC'[k]}`,
                  onInput: (e) => { q.options[k] = e.target.value; commit(); },
                }),
              ),
            ),
          ),
          h(
            'td', { class: 'col-type' },
            h(
              'select', { onChange: (e) => { q.type = e.target.value; commit(); }, 'aria-label': 'Loại câu' },
              ['grammar', 'vocab'].map((t) => h('option', { value: t, selected: q.type === t }, t === 'grammar' ? 'Ngữ pháp' : 'Từ vựng')),
            ),
          ),
          h('td', { class: 'row-actions' },
            button({ iconName: 'trash', title: 'Xóa câu', variant: 'ghost', onClick: () => { draft.questions.splice(i, 1); renderQuestions(); commit(); } }),
          ),
        ),
      );
    });
    questionCount.textContent = draft.questions.length
      ? `${draft.questions.length} câu`
      : 'Chưa có câu nào: game sẽ tự sinh câu hỏi "chọn nghĩa đúng" từ từ vựng.';
  };

  // ----- Ô dán bảng -----
  const pastePanel = ({ kind, hint, sample }) => {
    const area = h('textarea', {
      rows: 4, placeholder: `Dán (Ctrl+V / Cmd+V) bảng từ Excel hoặc Google Sheet vào đây.\nVí dụ:\n${sample}`,
      'data-testid': `paste-${kind}`,
    });
    const mode = h(
      'select', { 'aria-label': 'Cách thêm', 'data-testid': `paste-${kind}-mode` },
      h('option', { value: 'append' }, 'Thêm vào cuối bảng'),
      h('option', { value: 'replace' }, 'Thay toàn bộ bảng'),
    );
    const apply = () => {
      const rows = parseTsv(area.value);
      const items = kind === 'vocab' ? rowsToVocab(rows) : rowsToQuestions(rows);
      if (!items.length) {
        toast('Không đọc được dòng nào. Kiểm tra lại bảng đã dán.', 'error');
        return;
      }
      const list = kind === 'vocab' ? draft.vocab : draft.questions;
      if (mode.value === 'replace') list.length = 0;
      list.push(...items);
      if (kind === 'vocab') renderVocab();
      else renderQuestions();
      commit(true);
      area.value = '';
      toast(`Đã thêm ${items.length} ${kind === 'vocab' ? 'từ' : 'câu hỏi'}.`, 'success');
    };
    return h(
      'details', { class: 'paste-panel' },
      h('summary', {}, icon('paste', 20), 'Dán bảng từ Excel / Google Sheet'),
      h('p', { class: 'muted' }, hint),
      area,
      h('div', { class: 'paste-actions' }, mode, button({ label: 'Đưa vào bảng', iconName: 'check', variant: 'primary', onClick: apply, attrs: { 'data-testid': `paste-${kind}-apply` } })),
    );
  };

  // ----- Lệnh hành động -----
  const commandsArea = h('textarea', {
    rows: 6, value: draft.actionCommands.join('\n'), 'data-testid': 'commands',
    placeholder: 'Mỗi dòng 1 lệnh, ví dụ:\nHop on one foot\nTouch your toes',
    onInput: (e) => { draft.actionCommands = e.target.value.split('\n'); commit(); },
  });

  // ----- Nút chính -----
  const reloadAll = () => {
    draft = normalizePack(getPack());
    missing.clear();
    titleInput.value = draft.title;
    levelInput.value = draft.level;
    commandsArea.value = draft.actionCommands.join('\n');
    renderTeams();
    renderVocab();
    renderQuestions();
    renderStatus();
  };

  const cleaned = () => {
    commit(true);
    return normalizePack(getPack());
  };

  const actions = h(
    'div', { class: 'editor-actions' },
    button({ label: 'Lưu file .edu', iconName: 'download', variant: 'primary', onClick: () => openLinkModal(cleaned()), attrs: { 'data-testid': 'make-link' } }),
    button({ label: 'Hướng dẫn (video)', iconName: 'play', onClick: () => openGuide(), attrs: { 'data-testid': 'open-guide' } }),
    button({
      label: 'Khôi phục nội dung mẫu', iconName: 'refresh', variant: 'ghost', attrs: { 'data-testid': 'reset-sample' },
      onClick: async () => {
        const ok = await confirmModal({
          title: 'Khôi phục nội dung mẫu',
          message: 'Toàn bộ nội dung đang soạn sẽ bị thay bằng bài mẫu "Unit 5 - Food". Nên bấm Lưu file .edu trước nếu muốn giữ lại.',
          okLabel: 'Khôi phục', danger: true,
        });
        if (!ok) return;
        resetToSample();
        reloadAll();
        toast('Đã khôi phục nội dung mẫu.', 'success');
      },
    }),
  );

  // ----- Soạn nhanh (công cụ nạp lười từ soanbai/panel.js) -----
  let panelPromise = null;
  const loadPanel = async (btn) => {
    const sub = btn ? btn.querySelector('.qt-sub, .btn-label') : null;
    const oldText = sub ? sub.textContent : '';
    if (btn) {
      btn.setAttribute('aria-busy', 'true');
      btn.classList.add('is-busy');
      btn.disabled = true;
      if (sub) sub.textContent = 'Đang tải kho từ...';
    }
    try {
      if (!panelPromise) panelPromise = import('./soanbai/panel.js');
      return await panelPromise;
    } catch (err) {
      console.error(err);
      panelPromise = null;
      toast('Không tải được công cụ. Tải lại trang (F5) rồi thử lại.', 'error', 6000);
      return null;
    } finally {
      if (btn) {
        btn.removeAttribute('aria-busy');
        btn.classList.remove('is-busy');
        btn.disabled = false;
        if (sub) sub.textContent = oldText;
      }
    }
  };
  const run = (name, btn, arg) => async () => {
    const m = await loadPanel(btn);
    if (m) {
      try {
        await m[name](api, arg);
      } catch (err) {
        console.error(err);
        toast('Công cụ gặp lỗi. Tải lại trang (F5) rồi thử lại.', 'error', 6000);
      }
    }
  };

  const api = {
    getDraft: () => draft,
    addVocab(items, mode) {
      if (mode === 'replace') { draft.vocab.length = 0; missing.clear(); }
      draft.vocab.push(...items);
      renderVocab();
      commit(true);
    },
    fillEmpty(updater) {
      const n = updater(draft.vocab);
      renderVocab();
      commit(true);
      return n;
    },
    addQuestions(items, mode) {
      if (mode === 'replace') draft.questions.length = 0;
      draft.questions.push(...items);
      renderQuestions();
      commit(true);
    },
    replacePack(pack) {
      setPack(normalizePack(pack));
      reloadAll();
    },
    markMissing(rows) {
      rows.forEach((r) => missing.add(r));
      renderVocab();
    },
    setMissing(rows) {
      missing.clear();
      rows.forEach((r) => missing.add(r));
    },
    scrollToVocab: () => view.querySelector('.vocab-table').closest('.editor-card').scrollIntoView({ block: 'start', behavior: 'smooth' }),
    scrollToQuestions: () => view.querySelector('.question-table').closest('.editor-card').scrollIntoView({ block: 'start', behavior: 'smooth' }),
  };

  const qtButton = (iconName, label, sub, testId, name) => {
    const b = h('button', { type: 'button', class: 'qt-btn', 'data-testid': testId },
      icon(iconName, 24), h('span', { class: 'qt-text' }, h('span', { class: 'qt-label' }, label), h('span', { class: 'qt-sub' }, sub)));
    b.addEventListener('click', run(name, b));
    return b;
  };
  const importBtn = qtButton('sheet', 'Nhập file', 'CSV, Excel, TXT, Google Sheet', 'qt-import', 'openImport');
  const templateLink = h('button', { type: 'button', class: 'qt-link', 'data-testid': 'qt-template' }, 'Tải file mẫu');
  templateLink.addEventListener('click', run('openTemplates', templateLink));
  const quickGrid = h('div', { class: 'qt-grid' },
    qtButton('wand', 'Điền từ danh sách', 'Gõ từ, máy điền nghĩa', 'qt-fill', 'openFill'),
    qtButton('sparkles', 'Tạo câu hỏi tự động', 'Sinh từ bảng từ vựng', 'qt-questions', 'openQuestions'),
    h('div', { class: 'qt-cell' }, importBtn, templateLink),
    qtButton('library', 'Thư viện bài', 'Starters, Movers, Flyers', 'qt-library', 'openLibrary'));

  const autofillBtn = button({ label: 'Tự điền ô trống', iconName: 'wand', variant: 'ghost', attrs: { 'data-testid': 'vocab-autofill' }, onClick: null });
  autofillBtn.addEventListener('click', run('autofillEmpty', autofillBtn));
  const autoQBtn = button({ label: 'Tạo câu hỏi tự động', iconName: 'sparkles', variant: 'ghost', attrs: { 'data-testid': 'questions-auto' }, onClick: null });
  autoQBtn.addEventListener('click', run('openQuestions', autoQBtn));

  // Kéo thả file CSV / Excel / TXT vào cả trang Soạn bài.
  const dropOverlay = h('div', { class: 'drop-overlay', 'data-testid': 'drop-overlay', hidden: true }, icon('upload', 40), h('strong', {}, 'Thả file CSV, Excel hoặc TXT vào đây'));
  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0;
  const onDragEnter = (e) => { if (hasFiles(e)) { dragDepth++; dropOverlay.hidden = false; } };
  const onDragOver = (e) => { if (hasFiles(e)) e.preventDefault(); };
  const onDragLeave = (e) => { if (hasFiles(e)) { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropOverlay.hidden = true; } };
  const onDrop = (e) => {
    dragDepth = 0;
    dropOverlay.hidden = true;
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    e.preventDefault();
    run('openImport', null, f)();
  };

  const section = (title, iconName, extra, ...body) =>
    h('section', { class: 'editor-card' }, h('header', {}, h('h2', {}, icon(iconName, 24), title), extra), ...body);

  const quickCard = section('Soạn nhanh', 'sparkles', null,
    h('p', { class: 'muted' }, 'Gõ danh sách từ tiếng Anh, máy tự điền nghĩa, nhóm, câu ví dụ. Không cần mạng.'),
    quickGrid);
  quickCard.setAttribute('data-testid', 'quick-tools');

  const view = h(
    'div', { class: 'editor' },
    h('div', { class: 'editor-top' },
      h('div', {}, h('h1', {}, 'Soạn bài'), status),
      actions),
    issues,
    quickCard,
    section('Thông tin bài', 'info', null,
      h('div', { class: 'field-row' },
        h('label', { class: 'field grow' }, h('span', {}, 'Tên bài'), titleInput),
        h('label', { class: 'field' }, h('span', {}, 'Trình độ'), levelInput)),
      h('div', { class: 'field' }, h('span', {}, 'Tên đội (2-4 đội)'), teamsBox)),
    section('Từ vựng', 'book-open', h('span', { class: 'head-extra' }, vocabCount, autofillBtn),
      pastePanel({
        kind: 'vocab',
        hint: 'Các cột theo thứ tự: word, meaning, category, example. Dòng tiêu đề (nếu có) sẽ tự nhận. Có thể dán thẳng vào 1 ô trong bảng.',
        sample: 'banana\tquả chuối\tfruit\tI eat a banana every morning.',
      }),
      h('div', { class: 'table-wrap' },
        h('table', { class: 'grid vocab-table', 'data-testid': 'vocab-table' },
          h('thead', {}, h('tr', {}, h('th', {}, '#'), VOCAB_COLS.map((c) => h('th', {}, VOCAB_LABELS[c])), h('th', {}, ''))),
          vocabBody)),
      button({ label: 'Thêm từ', iconName: 'plus', variant: 'ghost', onClick: () => {
        draft.vocab.push({ word: '', meaning: '', category: '', example: '', image: '' });
        renderVocab();
        vocabBody.lastElementChild.querySelector('input').focus();
      } })),
    section('Câu hỏi trắc nghiệm', 'help', h('span', { class: 'head-extra' }, questionCount, autoQBtn),
      pastePanel({
        kind: 'questions',
        hint: 'Các cột: câu hỏi, đáp án A, đáp án B, đáp án C, đáp án đúng (A/B/C), loại (grammar/vocab). Dùng ___ cho chỗ trống.',
        sample: 'She ___ rice every day.\teats\teat\teating\tA\tgrammar',
      }),
      h('div', { class: 'table-wrap' },
        h('table', { class: 'grid question-table' },
          h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Câu hỏi'), h('th', {}, 'Đáp án A'), h('th', {}, 'Đáp án B'), h('th', {}, 'Đáp án C'), h('th', {}, 'Loại'), h('th', {}, ''))),
          questionBody)),
      h('p', { class: 'muted' }, 'Bấm vào chấm tròn để chọn đáp án đúng (ô màu xanh).'),
      button({ label: 'Thêm câu hỏi', iconName: 'plus', variant: 'ghost', onClick: () => {
        draft.questions.push({ prompt: '', options: ['', '', ''], answer: 0, type: 'grammar' });
        renderQuestions();
        questionBody.lastElementChild.querySelector('input[type=text]').focus();
      } })),
    section('Lệnh hành động (Statue Freeze)', 'person-standing', null,
      h('p', { class: 'muted' }, 'Mỗi dòng 1 lệnh tiếng Anh, máy sẽ đọc to cho cả lớp.'),
      commandsArea),
  );

  view.append(dropOverlay);
  view.addEventListener('dragenter', onDragEnter);
  view.addEventListener('dragover', onDragOver);
  view.addEventListener('dragleave', onDragLeave);
  view.addEventListener('drop', onDrop);

  root.appendChild(view);
  renderTeams();
  renderVocab();
  renderQuestions();
  renderStatus();

  // Rảnh rỗi sau 1,5 giây: nạp sẵn công cụ và kho từ để bấm nút là chạy ngay (bị huỷ nếu rời tab sớm).
  let prefetchTimer = setTimeout(() => {
    prefetchTimer = null;
    const go = () => {
      if (!panelPromise) panelPromise = import('./soanbai/panel.js');
      panelPromise.then((m) => m.preload && m.preload()).catch(() => { panelPromise = null; });
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 3000 });
    else go();
  }, 1500);

  return () => {
    if (prefetchTimer) clearTimeout(prefetchTimer);
    // Rời tab: lưu ngay phần đang chờ.
    if (saveTimer) {
      clearTimeout(saveTimer);
      setPack(draft);
    }
    view.remove();
  };
}
