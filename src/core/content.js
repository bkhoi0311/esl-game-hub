// Bộ nội dung (lesson pack): đọc, ghi, kiểm tra schema, link bài học, file .edu cho ClassIn.
import samplePack from '../data/sample-food-a2.json';

const STORAGE_PREFIX = 'eslhub.pack.';
const EMBED_ID = 'embedded-lesson-pack';

export const LIMITS = { minTeams: 2, maxTeams: 4, optionsPerQuestion: 3 };

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

let embedded = readEmbedded();
// File đã lưu kèm nội dung riêng thì dùng khóa lưu riêng, để các file không đè lên nhau.
let storageKey = STORAGE_PREFIX + (embedded ? 'file-' + hash(embedded.text) : 'default');
let fromLink = false;

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

// ---------- Link bài học ----------
// Bài được nén (deflate-raw) rồi mã hoá base64url, gắn sau dấu # của link: .../#L=1xxxx
// Phần sau # không gửi lên máy chủ. "1" = đã nén, "0" = không nén (trình duyệt cũ).
const LINK_KEY = 'eslhub.link';

function toB64url(bytes) {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text) {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

// Chỉ giữ ảnh là đường link (http/https); ảnh nhúng dạng data: làm link quá dài.
function packForLink(pack) {
  const p = normalizePack(pack);
  p.vocab.forEach((v) => {
    if (!/^https?:\/\//i.test(v.image)) v.image = '';
  });
  // Bỏ trường trống / mặc định cho link ngắn hơn (normalizePack điền lại khi mở).
  const slim = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== ''));
  return {
    ...slim({ title: p.title, level: p.level }),
    vocab: p.vocab.map(slim),
    questions: p.questions.map(({ type, ...q }) => (type === 'grammar' ? q : { ...q, type })),
    actionCommands: p.actionCommands,
    teams: p.teams,
  };
}

export async function encodeLesson(pack) {
  const bytes = new TextEncoder().encode(JSON.stringify(packForLink(pack)));
  if (typeof CompressionStream === 'function') return '1' + toB64url(await pipe(bytes, new CompressionStream('deflate-raw')));
  return '0' + toB64url(bytes);
}

export async function decodeLesson(code) {
  const kind = code[0];
  let bytes = fromB64url(code.slice(1));
  if (kind === '1') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  else if (kind !== '0') throw new Error('bad lesson code');
  return normalizePack(JSON.parse(new TextDecoder().decode(bytes)));
}

export async function lessonLink(pack) {
  const base = location.href.split('#')[0].replace(/[?&]L=[^&]*/, '');
  return `${base}#L=${await encodeLesson(pack)}`;
}

// File .edu của ClassIn: JSON nhỏ trỏ tới 1 trang web; mở trong lớp ClassIn như học liệu.
// Cùng khuôn với công cụ tạo .edu của classin.vn. classin_authority: false = mọi học sinh tương tác được,
// true = chỉ học sinh được giáo viên cấp quyền. size: cỡ cửa sổ mặc định (1280x720 cho game), cỡ nhỏ nhất.
export function eduFileText({ url, title, authorizedOnly = false }) {
  const data = { url, uid: true, identity: true, title: title || 'ESL Game Hub', size: '1280x720,400x300', classin_authority: Boolean(authorizedOnly) };
  return JSON.stringify(data, null, 1).replace(/\n/g, '\r\n');
}

export async function saveEduFile(pack, { title, authorizedOnly = false } = {}) {
  const url = await lessonLink(pack);
  const name = `${fileSlug({ title: title || pack.title })}.edu`;
  downloadFile(name, eduFileText({ url, title: title || pack.title, authorizedOnly }), 'application/octet-stream');
  return name;
}

function linkCodeFromUrl() {
  const m = location.hash.match(/^#L=([A-Za-z0-9_-]+)/) || location.search.match(/[?&]L=([A-Za-z0-9_-]+)/);
  return m ? m[1] : '';
}

// Gọi 1 lần lúc mở app. Mở từ link bài học: dùng bài trong link (chế độ trình chiếu).
// Nhớ mã trong phiên của tab, để chuyển qua lại giữa các game (#/game/...) không mất bài.
export async function initLinkedPack() {
  let code = linkCodeFromUrl();
  try {
    if (code) sessionStorage.setItem(LINK_KEY, code);
    else code = sessionStorage.getItem(LINK_KEY) || '';
  } catch {
    // sessionStorage bị chặn: vẫn chạy với mã trong link.
  }
  if (!code) return false;
  try {
    const pack = await decodeLesson(code);
    embedded = { text: code, pack };
    storageKey = STORAGE_PREFIX + 'link-' + hash(code);
    fromLink = true;
    current = clone(pack); // luôn bắt đầu đúng bài trong link
  } catch (err) {
    console.error('Link bài học hỏng', err);
    return false;
  }
  if (location.hash.startsWith('#L=')) history.replaceState(null, '', location.href.split('#')[0] + '#/');
  return true;
}

export function isLinkedPack() {
  return fromLink;
}

// Thoát chế độ trình chiếu. edit = true: chép bài trong link vào Soạn bài của máy này để sửa tiếp.
export function leaveLinkedPack({ edit = false } = {}) {
  try {
    sessionStorage.removeItem(LINK_KEY);
    if (edit && embedded) localStorage.setItem(STORAGE_PREFIX + 'default', JSON.stringify(embedded.pack));
  } catch {
    // bỏ qua
  }
  const base = location.href.split('#')[0].replace(/[?&]L=[^&]*/, '');
  const sameDoc = base === location.href.split('#')[0];
  location.replace(`${base}#/${edit ? 'editor' : ''}`);
  if (sameDoc) location.reload(); // chỉ đổi phần # thì trình duyệt không tự nạp lại
}

// ---------- Tải file ----------

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
