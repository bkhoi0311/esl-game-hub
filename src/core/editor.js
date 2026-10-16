// Tab Soạn bài (giao diện tiếng Việt cho giáo viên).
// Sửa trực tiếp trong bảng, dán bảng từ Excel/Google Sheet, lưu thành file .edu cho ClassIn,
// xem video hướng dẫn, khôi phục nội dung mẫu.
import {
  LIMITS, getPack, startLink, normalizePack, resetToSample, saveEduFile,
  setPack, validatePack,
} from './content.js';
import { speak } from './audio.js';
import { openGuide } from './guide.js';
import { TEAM_COLORS, button, confirmModal, h, openModal, toast } from './ui.js';
import { icon } from './icons.js';
import { t, addStrings, onLang, fmtTime } from '../i18n/index.js';
import VI from '../i18n/strings/editor.vi.js';

addStrings('editor', VI);

import { parseTsv, rowsToVocab, rowsToQuestions } from './soanbai/table.js';

// Giữ tương thích: các hàm đọc bảng đã chuyển sang soanbai/table.js (thuần, test được bằng node).
export { parseTsv, rowsToVocab, rowsToQuestions } from './soanbai/table.js';

const VOCAB_COLS = ['word', 'meaning', 'category', 'example'];
const vocabLabel = (c) => ({ word: t('ed.col.word'), meaning: t('ed.col.meaning'), category: t('ed.col.category'), example: t('ed.col.example') })[c];

// ---------- Link bài học ----------

async function openLinkModal(pack) {
  const { errors } = validatePack(pack);
  if (errors.length) {
    toast(t('ed.link.hasErrors', { n: errors.length, first: errors[0] }), 'error', 7000);
    return;
  }
  let url;
  try {
    url = await startLink(pack);
  } catch (err) {
    console.error(err);
    toast(t('ed.link.unsupported'), 'error', 6000);
    return;
  }
  const titleInput = h('input', { type: 'text', value: pack.title || 'ESL Game Hub', maxLength: 60, 'data-testid': 'edu-title' });
  const who = h('select', { 'data-testid': 'edu-who' },
    h('option', { value: 'false' }, t('ed.edu.allStudents')),
    h('option', { value: 'true' }, t('ed.edu.authorized')));
  const field = h('textarea', { class: 'link-field', readonly: true, rows: 3, value: url, 'data-testid': 'lesson-link', onFocus: (e) => e.target.select() });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      field.select();
      document.execCommand('copy');
    }
    toast(t('ed.link.copied'), 'success');
  };
  const saveEdu = async () => {
    try {
      const name = await saveEduFile(pack, { title: titleInput.value.trim(), authorizedOnly: who.value === 'true' });
      toast(t('ed.edu.saved', { name }), 'success', 5000);
    } catch (err) {
      console.error(err);
      toast(t('ed.edu.saveFail'), 'error');
    }
  };
  const long = url.length > 2000;
  openModal({
    title: t('ed.edu.title'),
    wide: true,
    body: h('div', { class: 'link-modal' },
      h('p', {}, h('strong', {}, pack.title || t('hub.pack.untitled')), ` · ${t('cnt.words', { n: pack.vocab.length })}, ${t('ed.q.count', { n: pack.questions.length })}`),
      h('label', { class: 'field' }, h('span', {}, t('ed.edu.nameHint')), titleInput),
      h('label', { class: 'field' }, h('span', {}, t('ed.edu.who')), who),
      h('ol', { class: 'link-steps' },
        h('li', {}, t('ed.edu.step1')),
        h('li', {}, t('ed.edu.step2')),
        h('li', {}, t('ed.edu.step3'))),
      h('details', { class: 'link-more' },
        h('summary', {}, t('ed.link.or', { n: url.length })),
        field),
      h('p', { class: 'muted' }, t('ed.edu.privacy')),
      long ? h('p', { class: 'warn-text' }, t('ed.link.long')) : null),
    actions: [
      { label: t('ed.link.try'), iconName: 'external', onClick: () => { window.open(url, '_blank', 'noopener'); return false; } },
      { label: t('ed.link.copy'), iconName: 'copy', onClick: () => { copy(); return false; } },
      { label: t('ed.edu.save'), iconName: 'download', variant: 'primary', attrs: { 'data-testid': 'save-edu' }, onClick: () => { saveEdu(); return false; } },
    ],
  });
}

// ---------- Tab Soạn bài ----------

// Đổi ngôn ngữ giao diện: dựng lại màn Soạn bài, giữ nguyên dữ liệu đang nhập (draft), vị trí cuộn và các hộp đang mở.
// main.js cũng dựng lại cả trang (route) khi đổi ngôn ngữ: ta để lại `carryOver` cho lần dựng đó nhặt; nếu không ai dựng lại thì tự dựng.
let carryOver = null;

export function mountEditor(root) {
  let cur = buildEditor(root, null);
  let gone = false;
  const off = onLang((l, changed) => {
    if (changed === false) return;
    const keep = cur.snapshot();
    const y = window.scrollY;
    carryOver = keep;
    queueMicrotask(() => {
      if (gone || carryOver !== keep) return; // đã có lần dựng khác nhặt
      carryOver = null;
      cur.dispose();
      cur = buildEditor(root, keep);
      window.scrollTo(0, y);
    });
  });
  return () => { gone = true; off(); cur.dispose(); };
}

function buildEditor(root, carry) {
  if (!carry && carryOver) carry = carryOver;
  carryOver = null;
  let draft = carry ? carry.draft : normalizePack(getPack());
  let saveTimer = null;
  let savedAt = carry ? carry.savedAt : null;
  const missing = carry ? carry.missing : new Set(); // dòng từ chưa có trong kho (chỉ tạm, không lưu vào bài)

  const status = h('span', { class: 'editor-status' });
  const issues = h('div', { class: 'editor-issues' });
  const vocabBody = h('tbody', { 'data-i18n-data': '' });
  const questionBody = h('tbody', { 'data-i18n-data': '' });
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
      status.textContent = t('ed.status.saving');
      saveTimer = setTimeout(run, 400);
    }
  };

  const renderStatus = () => {
    const { errors, warnings } = validatePack(normalizePack(draft));
    status.textContent = savedAt ? t('ed.status.savedAt', { time: fmtTime(savedAt) }) : t('ed.status.autosave');
    issues.textContent = '';
    if (!errors.length && !warnings.length) {
      issues.append(h('div', { class: 'issue ok' }, icon('circle-check', 20), t('ed.status.valid')));
      return;
    }
    const list = [...errors.map((m) => ['error', m]), ...warnings.map((m) => ['warn', m])];
    const shown = list.slice(0, 6);
    issues.append(
      h(
        'details',
        { class: 'issue-box', open: errors.length > 0 },
        h('summary', {}, icon('alert', 20), `${t('cnt.errors', { n: errors.length })}, ${t('cnt.warnings', { n: warnings.length })}`),
        h('ul', {}, shown.map(([kind, m]) => h('li', { class: kind }, m))),
        list.length > shown.length ? h('p', { class: 'muted' }, t('ed.status.more', { n: list.length - shown.length })) : null,
      ),
    );
  };

  // ----- Thông tin bài + đội -----
  const titleInput = h('input', {
    type: 'text', value: draft.title, placeholder: t('ed.title.placeholder'), 'data-testid': 'pack-title',
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
            type: 'text', value: name, 'aria-label': t('ed.team.aria', { n: i + 1 }),
            onInput: (e) => { draft.teams[i] = e.target.value; commit(); },
          }),
          draft.teams.length > LIMITS.minTeams
            ? button({ iconName: 'x', title: t('ed.team.remove'), variant: 'ghost', onClick: () => { draft.teams.splice(i, 1); renderTeams(); commit(); } })
            : null,
        ),
      );
    });
    if (draft.teams.length < LIMITS.maxTeams) {
      const defaults = ['Red', 'Blue', 'Green', 'Yellow'];
      teamsBox.append(
        button({
          label: t('ed.team.add'), iconName: 'plus', variant: 'ghost',
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
          key === 'word' && missing.has(v) ? h('span', { class: 'missing-tag' }, t('ed.vocab.notInBank')) : null)),
        h(
          'td', { class: 'row-actions' },
          button({ iconName: 'volume', title: t('ed.row.speak', { word: v.word }), variant: 'ghost', onClick: () => speak(v.word, { manual: true }) }),
          button({ iconName: 'trash', title: t('ed.row.remove'), variant: 'ghost', onClick: () => { missing.delete(v); draft.vocab.splice(i, 1); renderVocab(); commit(); } }),
        ),
      );
      vocabBody.append(tr);
    });
    const cats = new Set(draft.vocab.map((v) => v.category).filter(Boolean));
    vocabCount.textContent = `${t('cnt.words', { n: draft.vocab.length })}, ${t('cnt.categories', { n: cats.size })}`;
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
    toast(t('ed.paste.done', { n: rows.length }), 'success');
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
                'label', { class: `option-cell${q.answer === k ? ' correct' : ''}`, title: t('ed.q.markCorrect') },
                h('input', {
                  type: 'radio', name: group, checked: q.answer === k, 'aria-label': t('ed.q.correctAria', { letter: 'ABC'[k] }),
                  onChange: () => { q.answer = k; renderQuestions(); commit(); },
                }),
                h('span', { class: 'option-key' }, 'ABC'[k]),
                h('input', {
                  type: 'text', value: opt, 'aria-label': t('ed.q.optionAria', { letter: 'ABC'[k] }),
                  onInput: (e) => { q.options[k] = e.target.value; commit(); },
                }),
              ),
            ),
          ),
          h(
            'td', { class: 'col-type' },
            h(
              'select', { onChange: (e) => { q.type = e.target.value; commit(); }, 'aria-label': t('ed.q.typeAria') },
              ['grammar', 'vocab'].map((ty) => h('option', { value: ty, selected: q.type === ty }, ty === 'grammar' ? t('ed.q.grammar') : t('ed.q.vocab'))),
            ),
          ),
          h('td', { class: 'row-actions' },
            button({ iconName: 'trash', title: t('ed.q.remove'), variant: 'ghost', onClick: () => { draft.questions.splice(i, 1); renderQuestions(); commit(); } }),
          ),
        ),
      );
    });
    questionCount.textContent = draft.questions.length
      ? t('ed.q.count', { n: draft.questions.length })
      : t('ed.q.empty');
  };

  // ----- Ô dán bảng -----
  const pastePanel = ({ kind, hint, sample }) => {
    const area = h('textarea', {
      rows: 4, placeholder: t('ed.paste.placeholder', { sample }), 'data-i18n-data': '',
      'data-testid': `paste-${kind}`,
    });
    const mode = h(
      'select', { 'aria-label': t('ed.paste.modeAria'), 'data-testid': `paste-${kind}-mode` },
      h('option', { value: 'append' }, t('ed.paste.append')),
      h('option', { value: 'replace' }, t('ed.paste.replace')),
    );
    const apply = () => {
      const rows = parseTsv(area.value);
      const items = kind === 'vocab' ? rowsToVocab(rows) : rowsToQuestions(rows);
      if (!items.length) {
        toast(t('ed.paste.none'), 'error');
        return;
      }
      const list = kind === 'vocab' ? draft.vocab : draft.questions;
      if (mode.value === 'replace') list.length = 0;
      list.push(...items);
      if (kind === 'vocab') renderVocab();
      else renderQuestions();
      commit(true);
      area.value = '';
      toast(t(kind === 'vocab' ? 'ed.paste.addedWords' : 'ed.paste.addedQuestions', { n: items.length }), 'success');
    };
    return h(
      'details', { class: 'paste-panel' },
      h('summary', {}, icon('paste', 20), t('ed.paste.title')),
      h('p', { class: 'muted' }, hint),
      area,
      h('div', { class: 'paste-actions' }, mode, button({ label: t('ed.paste.run'), iconName: 'check', variant: 'primary', onClick: apply, attrs: { 'data-testid': `paste-${kind}-apply` } })),
    );
  };

  // ----- Lệnh hành động -----
  const commandsArea = h('textarea', {
    rows: 6, value: draft.actionCommands.join('\n'), 'data-testid': 'commands',
    placeholder: t('ed.actions.placeholder'),
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
    button({ label: t('ed.edu.save'), iconName: 'download', variant: 'primary', onClick: () => openLinkModal(cleaned()), attrs: { 'data-testid': 'make-link' } }),
    button({ label: t('ed.guide'), iconName: 'play', onClick: () => openGuide(), attrs: { 'data-testid': 'open-guide' } }),
    button({
      label: t('ed.reset'), iconName: 'refresh', variant: 'ghost', attrs: { 'data-testid': 'reset-sample' },
      onClick: async () => {
        const ok = await confirmModal({
          title: t('ed.reset'),
          message: t('ed.reset.confirm'),
          okLabel: t('ed.reset.ok'), danger: true,
        });
        if (!ok) return;
        resetToSample();
        reloadAll();
        toast(t('ed.reset.done'), 'success');
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
      if (sub) sub.textContent = t('ed.tools.loading');
    }
    try {
      if (!panelPromise) panelPromise = import('./soanbai/panel.js');
      return await panelPromise;
    } catch (err) {
      console.error(err);
      panelPromise = null;
      toast(t('ed.tools.loadFail'), 'error', 6000);
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
        toast(t('ed.tools.error'), 'error', 6000);
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
  const importBtn = qtButton('sheet', t('ed.tool.import'), 'CSV, Excel, TXT, Google Sheets', 'qt-import', 'openImport');
  const templateLink = h('button', { type: 'button', class: 'qt-link', 'data-testid': 'qt-template' }, t('ed.tool.template'));
  templateLink.addEventListener('click', run('openTemplates', templateLink));
  const quickGrid = h('div', { class: 'qt-grid' },
    qtButton('wand', t('ed.tool.fill'), t('ed.tool.fillHint'), 'qt-fill', 'openFill'),
    qtButton('sparkles', t('ed.tool.qgen'), t('ed.tool.qgenHint'), 'qt-questions', 'openQuestions'),
    h('div', { class: 'qt-cell' }, importBtn, templateLink),
    qtButton('library', t('ed.tool.library'), 'Starters, Movers, Flyers', 'qt-library', 'openLibrary'));

  const autofillBtn = button({ label: t('ed.tool.autofill'), iconName: 'wand', variant: 'ghost', attrs: { 'data-testid': 'vocab-autofill' }, onClick: null });
  autofillBtn.addEventListener('click', run('autofillEmpty', autofillBtn));
  const autoQBtn = button({ label: t('ed.tool.qgen'), iconName: 'sparkles', variant: 'ghost', attrs: { 'data-testid': 'questions-auto' }, onClick: null });
  autoQBtn.addEventListener('click', run('openQuestions', autoQBtn));

  // Kéo thả file CSV / Excel / TXT vào cả trang Soạn bài.
  const dropOverlay = h('div', { class: 'drop-overlay', 'data-testid': 'drop-overlay', hidden: true }, icon('upload', 40), h('strong', {}, t('ed.drop')));
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

  const quickCard = section(t('ed.quick'), 'sparkles', null,
    h('p', { class: 'muted' }, t('ed.quick.lead')),
    quickGrid);
  quickCard.setAttribute('data-testid', 'quick-tools');

  const view = h(
    'div', { class: 'editor' },
    h('div', { class: 'editor-top' },
      h('div', {}, h('h1', {}, t('ed.title')), status),
      actions),
    issues,
    quickCard,
    section(t('ed.info'), 'info', null,
      h('div', { class: 'field-row' },
        h('label', { class: 'field grow' }, h('span', {}, t('ed.info.title')), titleInput),
        h('label', { class: 'field' }, h('span', {}, t('ed.info.level')), levelInput)),
      h('div', { class: 'field' }, h('span', {}, t('ed.info.teams')), teamsBox)),
    section(t('ed.vocab'), 'book-open', h('span', { class: 'head-extra' }, vocabCount, autofillBtn),
      pastePanel({
        kind: 'vocab',
        hint: t('ed.vocab.hint'),
        sample: 'banana\tquả chuối\tfruit\tI eat a banana every morning.', // i18n-keep: dữ liệu mẫu (nghĩa Việt)
      }),
      h('div', { class: 'table-wrap' },
        h('table', { class: 'grid vocab-table', 'data-testid': 'vocab-table' },
          h('thead', {}, h('tr', {}, h('th', {}, '#'), VOCAB_COLS.map((c) => h('th', {}, vocabLabel(c))), h('th', {}, ''))),
          vocabBody)),
      button({ label: t('ed.vocab.add'), iconName: 'plus', variant: 'ghost', onClick: () => {
        draft.vocab.push({ word: '', meaning: '', category: '', example: '', image: '' });
        renderVocab();
        vocabBody.lastElementChild.querySelector('input').focus();
      } })),
    section(t('ed.q.title'), 'help', h('span', { class: 'head-extra' }, questionCount, autoQBtn),
      pastePanel({
        kind: 'questions',
        hint: t('ed.q.hint'),
        sample: 'She ___ rice every day.\teats\teat\teating\tA\tgrammar',
      }),
      h('div', { class: 'table-wrap' },
        h('table', { class: 'grid question-table' },
          h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, t('ed.q.col.prompt')), h('th', {}, t('ed.q.col.a')), h('th', {}, t('ed.q.col.b')), h('th', {}, t('ed.q.col.c')), h('th', {}, t('ed.q.col.type')), h('th', {}, ''))),
          questionBody)),
      h('p', { class: 'muted' }, t('ed.q.pickHint')),
      button({ label: t('ed.q.add'), iconName: 'plus', variant: 'ghost', onClick: () => {
        draft.questions.push({ prompt: '', options: ['', '', ''], answer: 0, type: 'grammar' });
        renderQuestions();
        questionBody.lastElementChild.querySelector('input[type=text]').focus();
      } })),
    section(t('ed.actions.title'), 'person-standing', null,
      h('p', { class: 'muted' }, t('ed.actions.hint')),
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

  const openBoxes = () => [...view.querySelectorAll('details')].map((d) => d.open);
  const restoreBoxes = (flags) => view.querySelectorAll('details').forEach((d, i) => { if (flags[i] != null) d.open = flags[i]; });
  if (carry && carry.boxes) restoreBoxes(carry.boxes);

  return {
    // Giữ dữ liệu đang nhập để dựng lại khi đổi ngôn ngữ (lưu luôn phần đang chờ).
    snapshot() {
      commit(true);
      return { draft, missing, savedAt, boxes: openBoxes() };
    },
    dispose() {
      if (prefetchTimer) clearTimeout(prefetchTimer);
      // Rời tab: lưu ngay phần đang chờ.
      if (saveTimer) {
        clearTimeout(saveTimer);
        setPack(draft);
      }
      view.remove();
    },
  };
}
