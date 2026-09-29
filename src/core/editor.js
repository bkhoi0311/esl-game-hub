// Tab Soạn bài (giao diện tiếng Việt cho giáo viên).
// Sửa trực tiếp trong bảng, dán bảng từ Excel/Google Sheet, lưu thành file .edu cho ClassIn,
// xem video hướng dẫn, khôi phục nội dung mẫu.
import {
  LIMITS, getPack, lessonLink, normalizePack, resetToSample, saveEduFile,
  setPack, validatePack,
} from './content.js';
import { speak } from './audio.js';
import { openGuide } from './guide.js';
import { TEAM_COLORS, button, confirmModal, h, openModal, toast } from './ui.js';
import { icon } from './icons.js';

const VOCAB_COLS = ['word', 'meaning', 'category', 'example'];
const VOCAB_LABELS = { word: 'Từ (word)', meaning: 'Nghĩa (meaning)', category: 'Nhóm (category)', example: 'Câu ví dụ (example)' };
const HEADER_ALIASES = {
  word: ['word', 'từ', 'tu', 'từ vựng', 'vocabulary'],
  meaning: ['meaning', 'nghĩa', 'nghia', 'vietnamese'],
  category: ['category', 'nhóm', 'nhom', 'group', 'topic'],
  example: ['example', 'ví dụ', 'vi du', 'câu ví dụ', 'sentence'],
};

// ---------- Đọc bảng dán từ Excel / Google Sheet (TSV, có hỗ trợ ô trong ngoặc kép) ----------

export function parseTsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
    } else if (c === '"' && cell === '') {
      quoted = true;
    } else if (c === '\t') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

function headerMap(firstRow) {
  const lower = firstRow.map((c) => c.toLowerCase());
  const map = {};
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = lower.findIndex((c) => aliases.includes(c));
    if (idx >= 0) map[key] = idx;
  }
  return 'word' in map ? map : null;
}

export function rowsToVocab(rows) {
  if (!rows.length) return [];
  const map = headerMap(rows[0]);
  const body = map ? rows.slice(1) : rows;
  const cols = map || { word: 0, meaning: 1, category: 2, example: 3 };
  return body
    .map((r) => ({
      word: r[cols.word] || '',
      meaning: cols.meaning != null ? r[cols.meaning] || '' : '',
      category: cols.category != null ? (r[cols.category] || '').toLowerCase() : '',
      example: cols.example != null ? r[cols.example] || '' : '',
      image: '',
    }))
    .filter((v) => v.word);
}

// Cột câu hỏi: prompt | đáp án A | đáp án B | đáp án C | đáp án đúng (A/B/C, 1/2/3 hoặc chính nội dung) | type
export function rowsToQuestions(rows) {
  if (!rows.length) return [];
  const first = rows[0].map((c) => c.toLowerCase());
  const body = first[0] === 'prompt' || first[0] === 'câu hỏi' || first[0] === 'question' ? rows.slice(1) : rows;
  return body
    .filter((r) => r[0])
    .map((r) => {
      const options = [r[1] || '', r[2] || '', r[3] || ''];
      const key = (r[4] || '').trim();
      let answer = 0;
      if (/^[abc]$/i.test(key)) answer = key.toUpperCase().charCodeAt(0) - 65;
      else if (/^[123]$/.test(key)) answer = Number(key) - 1;
      else if (key) answer = Math.max(0, options.findIndex((o) => o.toLowerCase() === key.toLowerCase()));
      return { prompt: r[0], options, answer, type: (r[5] || 'grammar').toLowerCase() };
    });
}

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
  const long = url.length > 2000;
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
      { label: 'Lưu file .edu', iconName: 'download', variant: 'primary', attrs: { 'data-testid': 'save-edu' }, onClick: () => { saveEdu(); return false; } },
    ],
  });
}

// ---------- Tab Soạn bài ----------

export function mountEditor(root) {
  let draft = normalizePack(getPack());
  let saveTimer = null;
  let savedAt = null;

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
  const cellInput = (obj, key, onPasteRows) =>
    h('input', {
      type: 'text', value: obj[key] ?? '', 'aria-label': key,
      onInput: (e) => { obj[key] = key === 'category' ? e.target.value.toLowerCase() : e.target.value; commit(); },
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
      vocabBody.append(
        h(
          'tr', {},
          h('td', { class: 'num' }, i + 1),
          VOCAB_COLS.map((key, col) => h('td', { class: `col-${key}` }, cellInput(v, key, pasteAt(col)))),
          h(
            'td', { class: 'row-actions' },
            button({ iconName: 'volume', title: `Nghe "${v.word}"`, variant: 'ghost', onClick: () => speak(v.word) }),
            button({ iconName: 'trash', title: 'Xóa dòng', variant: 'ghost', onClick: () => { draft.vocab.splice(i, 1); renderVocab(); commit(); } }),
          ),
        ),
      );
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

  const section = (title, iconName, extra, ...body) =>
    h('section', { class: 'editor-card' }, h('header', {}, h('h2', {}, icon(iconName, 24), title), extra), ...body);

  const view = h(
    'div', { class: 'editor' },
    h('div', { class: 'editor-top' },
      h('div', {}, h('h1', {}, 'Soạn bài'), status),
      actions),
    issues,
    section('Thông tin bài', 'info', null,
      h('div', { class: 'field-row' },
        h('label', { class: 'field grow' }, h('span', {}, 'Tên bài'), titleInput),
        h('label', { class: 'field' }, h('span', {}, 'Trình độ'), levelInput)),
      h('div', { class: 'field' }, h('span', {}, 'Tên đội (2-4 đội)'), teamsBox)),
    section('Từ vựng', 'book-open', vocabCount,
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
    section('Câu hỏi trắc nghiệm', 'help', questionCount,
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

  root.appendChild(view);
  renderTeams();
  renderVocab();
  renderQuestions();
  renderStatus();

  return () => {
    // Rời tab: lưu ngay phần đang chờ.
    if (saveTimer) {
      clearTimeout(saveTimer);
      setPack(draft);
    }
    view.remove();
  };
}
