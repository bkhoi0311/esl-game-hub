// Bộ nội dung (lesson pack): đọc, ghi, kiểm tra schema, xuất/nhập JSON, lưu thành file HTML mới.
import samplePack from '../data/sample-food-a2.json';

const STORAGE_PREFIX = 'eslhub.pack.';
const EMBED_ID = 'embedded-lesson-pack';

export const LIMITS = { minTeams: 2, maxTeams: 4, optionsPerQuestion: 3 };

// Ảnh chụp HTML gốc lúc trang vừa nạp (trước khi app dựng giao diện).
// Bản 1-file dùng nó để tạo "file mới" mà không cần mạng.
const pristineHtml = captureHtml();

function captureHtml() {
  try {
    return '<!doctype html>\n' + document.documentElement.outerHTML;
  } catch {
    return '';
  }
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function str(value) {
  return value == null ? '' : String(value).trim();
}

function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function getSamplePack() {
  return clone(samplePack);
}

// Đưa dữ liệu bất kỳ về đúng hình dạng schema (không ném lỗi).
export function normalizePack(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const vocab = Array.isArray(src.vocab) ? src.vocab : [];
  const questions = Array.isArray(src.questions) ? src.questions : [];
  const commands = Array.isArray(src.actionCommands) ? src.actionCommands : [];
  const teams = Array.isArray(src.teams) ? src.teams : [];

  return {
    title: str(src.title),
    level: str(src.level),
    vocab: vocab
      .filter((v) => v && typeof v === 'object')
      .map((v) => ({
        word: str(v.word),
        meaning: str(v.meaning),
        category: str(v.category).toLowerCase(),
        example: str(v.example),
        image: str(v.image),
      })),
    questions: questions
      .filter((q) => q && typeof q === 'object')
      .map((q) => {
        const options = Array.isArray(q.options) ? q.options.map(str) : [];
        while (options.length < LIMITS.optionsPerQuestion) options.push('');
        const answer = Number.isInteger(q.answer) ? q.answer : parseInt(q.answer, 10);
        return {
          prompt: str(q.prompt),
          options: options.slice(0, LIMITS.optionsPerQuestion),
          answer: answer >= 0 && answer < LIMITS.optionsPerQuestion ? answer : 0,
          type: str(q.type) || 'grammar',
        };
      }),
    actionCommands: commands.map(str).filter(Boolean),
    teams: teams.map(str).filter(Boolean).slice(0, LIMITS.maxTeams),
  };
}

// Kiểm tra nội dung. Trả về { errors, warnings } bằng tiếng Việt cho giáo viên.
export function validatePack(pack) {
  const errors = [];
  const warnings = [];

  if (!pack.title) warnings.push('Chưa đặt tên bài.');

  const seen = new Set();
  pack.vocab.forEach((v, i) => {
    const row = `Từ vựng dòng ${i + 1}`;
    if (!v.word) errors.push(`${row}: thiếu từ (word).`);
    if (v.word && !v.meaning) warnings.push(`${row} ("${v.word}"): thiếu nghĩa.`);
    if (v.word && !v.category) warnings.push(`${row} ("${v.word}"): thiếu nhóm (category).`);
    const key = v.word.toLowerCase();
    if (key && seen.has(key)) warnings.push(`${row}: từ "${v.word}" bị lặp.`);
    seen.add(key);
  });

  pack.questions.forEach((q, i) => {
    const row = `Câu hỏi ${i + 1}`;
    if (!q.prompt) errors.push(`${row}: thiếu nội dung câu hỏi.`);
    const filled = q.options.filter(Boolean).length;
    if (filled < LIMITS.optionsPerQuestion) errors.push(`${row}: cần đủ ${LIMITS.optionsPerQuestion} đáp án.`);
    if (!q.options[q.answer]) errors.push(`${row}: đáp án đúng đang trống.`);
    const uniq = new Set(q.options.filter(Boolean).map((o) => o.toLowerCase()));
    if (uniq.size < filled) warnings.push(`${row}: có 2 đáp án giống nhau.`);
  });

  if (pack.teams.length < LIMITS.minTeams) errors.push(`Cần ít nhất ${LIMITS.minTeams} đội.`);

  return { errors, warnings };
}

// ---------- Câu hỏi: dùng `questions`, nếu trống thì tự sinh từ vocab ----------

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export { shuffle };

export function generateVocabQuestions(pack) {
  const items = pack.vocab.filter((v) => v.word && v.meaning);
  if (items.length < LIMITS.optionsPerQuestion) return [];
  return items.map((item) => {
    const wrong = shuffle(items.filter((v) => v.meaning !== item.meaning))
      .slice(0, LIMITS.optionsPerQuestion - 1)
      .map((v) => v.meaning);
    const options = shuffle([item.meaning, ...wrong]);
    return {
      prompt: `What does "${item.word}" mean?`,
      options,
      answer: options.indexOf(item.meaning),
      type: 'vocab',
    };
  });
}

export function getQuestions(pack) {
  const valid = pack.questions.filter(
    (q) => q.prompt && q.options.every(Boolean) && q.options[q.answer],
  );
  return valid.length ? valid : generateVocabQuestions(pack);
}

export function getCategories(pack) {
  const groups = {};
  for (const v of pack.vocab) {
    if (!v.word || !v.category) continue;
    (groups[v.category] ||= []).push(v);
  }
  return groups;
}

// Kiểm tra nội dung đủ để chơi 1 game.
// game.minItems: số (tính theo từ vựng) hoặc { vocab, questions, actionCommands }.
// game.checkContent(pack): tùy chọn, trả về mảng thông báo thiếu.
export function missingForGame(game, pack) {
  const need = typeof game.minItems === 'number' ? { vocab: game.minItems } : game.minItems || {};
  const missing = [];
  const words = pack.vocab.filter((v) => v.word).length;
  if (need.vocab && words < need.vocab) {
    missing.push(`Cần ít nhất ${need.vocab} từ vựng (hiện có ${words}).`);
  }
  if (need.questions) {
    const count = getQuestions(pack).length;
    if (count < need.questions) {
      missing.push(`Cần ít nhất ${need.questions} câu hỏi (hiện có ${count}). Có thể nhập câu hỏi, hoặc thêm từ vựng có nghĩa để tự sinh câu hỏi.`);
    }
  }
  if (need.actionCommands && pack.actionCommands.length < need.actionCommands) {
    missing.push(`Cần ít nhất ${need.actionCommands} lệnh hành động (hiện có ${pack.actionCommands.length}).`);
  }
  if (typeof game.checkContent === 'function') missing.push(...game.checkContent(pack));
  return missing;
}

// ---------- Lưu trữ ----------

function readEmbedded() {
  const el = document.getElementById(EMBED_ID);
  const text = el ? el.textContent.trim() : '';
  if (!text) return null;
  try {
    return { text, pack: normalizePack(JSON.parse(text)) };
  } catch {
    return null;
  }
}

const embedded = readEmbedded();
// File đã lưu kèm nội dung riêng thì dùng khóa lưu riêng, để các file không đè lên nhau.
const storageKey = STORAGE_PREFIX + (embedded ? 'file-' + hash(embedded.text) : 'default');

function defaultPack() {
  return embedded ? clone(embedded.pack) : normalizePack(samplePack);
}

let current = null;
const listeners = new Set();

export function loadPack() {
  if (current) return current;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) current = normalizePack(JSON.parse(saved));
  } catch {
    current = null;
  }
  if (!current) current = defaultPack();
  return current;
}

export function getPack() {
  return loadPack();
}

export function setPack(pack) {
  current = normalizePack(pack);
  try {
    localStorage.setItem(storageKey, JSON.stringify(current));
  } catch {
    // Trình duyệt chặn lưu trữ: vẫn dùng được trong phiên hiện tại.
  }
  listeners.forEach((fn) => fn(current));
  return current;
}

export function onPackChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resetToSample() {
  return setPack(getSamplePack());
}

export function hasEmbeddedPack() {
  return Boolean(embedded);
}

// ---------- Xuất / nhập ----------

export function fileSlug(pack) {
  const base = (pack.title || 'lesson')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return base || 'lesson';
}

export function downloadFile(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportJson(pack) {
  downloadFile(`${fileSlug(pack)}.json`, JSON.stringify(pack, null, 2), 'application/json');
}

// Đọc file JSON người dùng chọn. Ném lỗi tiếng Việt nếu file hỏng.
export async function parseJsonFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('File không phải JSON hợp lệ.');
  }
  if (!data || typeof data !== 'object' || (!Array.isArray(data.vocab) && !Array.isArray(data.questions))) {
    throw new Error('File JSON không đúng định dạng bộ nội dung (thiếu "vocab" hoặc "questions").');
  }
  return normalizePack(data);
}

// Lấy mã HTML bản 1-file để nhúng nội dung vào.
async function getSingleFileHtml() {
  if (__SINGLE_FILE__ && pristineHtml) return pristineHtml;
  // Bản online: tải bản 1-file nằm cạnh trang (dist/offline.html).
  const res = await fetch('./offline.html', { cache: 'no-store' });
  if (!res.ok) throw new Error('offline.html not found');
  const html = await res.text();
  if (!html.includes(EMBED_ID)) throw new Error('offline.html invalid');
  return html;
}

function embedPack(html, pack) {
  // Chặn chuỗi "</script" trong nội dung để không phá thẻ script.
  const json = JSON.stringify(pack).replace(/</g, '\\u003c');
  const tag = new RegExp(`(<script[^>]*id="${EMBED_ID}"[^>]*>)[\\s\\S]*?(<\\/script>)`);
  if (!tag.test(html)) throw new Error('embed tag missing');
  const title = (pack.title ? pack.title + ' - ' : '') + 'ESL Game Hub';
  return html
    .replace(tag, (_, open, close) => open + json + close)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${title.replace(/[<>&]/g, '')}</title>`);
}

// "Lưu thành file mới": tải về 1 file HTML chạy offline, đã chứa sẵn nội dung bài.
export async function saveAsNewFile(pack) {
  let html;
  try {
    html = await getSingleFileHtml();
  } catch {
    throw new Error(
      'Không tạo được file mới ở chế độ này. Hãy dùng bản online đã deploy hoặc bản offline (npm run build:offline). ' +
        'Tạm thời có thể dùng "Xuất JSON" để lưu nội dung.',
    );
  }
  downloadFile(`${fileSlug(pack)}.html`, embedPack(html, pack), 'text/html');
}
