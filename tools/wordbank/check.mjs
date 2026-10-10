// Kiểm file nguồn kho từ (PLAN-SOANBAI mục B3). Lỗi = thoát mã 1; lưu ý chỉ in ra.
// Dùng:
//   node tools/wordbank/check.mjs part-03        kiểm parts/part-03.json so với in/part-03.txt
//   node tools/wordbank/check.mjs all            kiểm cả 12 phần + không trùng giữa các phần
//   node tools/wordbank/check.mjs --file <json>  kiểm 1 file bất kỳ (không đối chiếu in/ trừ khi thêm --in <txt>)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, POS_LIST, LEVELS } from '../../src/core/soanbai/categories.js';
import { findWordInText } from '../../src/core/soanbai/normalize.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIELDS = ['word', 'vi', 'pos', 'cat', 'level', 'ex', 'img', 'alt', 'pl', 'check', 'levelCheck', 'skip', 'note'];
const REQUIRED = ['word', 'pos', 'cat', 'level', 'check', 'levelCheck', 'skip'];
// Từ phải đánh skip:true (không hợp trẻ em). skull/sword: chỉ nhắc, để Opus quyết.
const HARD_BLOCK = ['beer', 'wine', 'gun', 'pistol', 'bomb', 'bikini', 'syringe', 'injection', 'cigarette', 'alcohol', 'whisky', 'vodka', 'cocktail', 'rifle', 'grenade'];
const WATCH = ['skull', 'sword', 'knife', 'kill', 'die', 'dead', 'blood'];
const VI_DIACRITIC = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const VI_LATIN_OK = new Set(['pizza', 'taxi', 'robot', 'internet', 'karate', 'yoga', 'cola', 'hamburger', 'sandwich', 'email', 'video', 'camera', 'menu', 'ok', 'radio', 'tv', 'dvd', 'cd', 'wifi', 'game', 'website', 'web', 'taxi', 'online', 'app', 'judo', 'taekwondo', 'ballet', 'golf', 'tennis', 'jazz', 'pop', 'rap', 'hip hop', 'kung fu', 'sushi', 'pasta', 'spaghetti', 'laptop', 'tablet', 'panda', 'koala', 'ketchup', 'hotdog', 'hot dog', 'popcorn', 'kiwi', 'karaoke', 'ski', 'bowling', 'rugby', 'marathon', 'sticker', 'kem', 'cam', 'cua', 'khoai', 'ba', 'ma', 'nho', 'bi', 'xe']);

const read = (p) => fs.readFileSync(p, 'utf8');
const words = (s) => String(s).trim().split(/\s+/).filter(Boolean);

export function readInFile(p) {
  return read(p).split(/\r?\n/).filter((l) => l.trim()).map((l) => {
    const [word, emoji] = l.split('\t');
    return { word: word.trim(), emoji: (emoji || '').trim() };
  });
}

// Kiểm 1 mảng entry. inWords: mảng từ cần có đúng (hoặc null). Trả { errors:[], notes:[], stats }.
export function checkEntries(data, inWords, label) {
  const errors = [];
  const notes = [];
  const err = (w, m) => errors.push(`${label} | ${w}: ${m}`);
  const note = (w, m) => notes.push(`${label} | ${w}: ${m}`);
  const stats = { entries: 0, check: 0, levelCheck: 0, skip: 0 };
  if (!Array.isArray(data)) {
    errors.push(`${label}: file phải là mảng JSON`);
    return { errors, notes, stats };
  }
  const seen = new Map();
  const viByCat = new Map();
  data.forEach((e, i) => {
    stats.entries++;
    const w0 = e && typeof e.word === 'string' ? e.word : `#${i + 1}`;
    if (!e || typeof e !== 'object' || Array.isArray(e)) { err(w0, 'phần tử phải là object'); return; }
    Object.keys(e).forEach((k) => { if (!FIELDS.includes(k)) err(w0, `trường lạ "${k}"`); });
    REQUIRED.forEach((k) => { if (e[k] === undefined) err(w0, `thiếu trường "${k}"`); });
    ['word', 'vi', 'pos', 'cat', 'level', 'ex', 'img', 'pl', 'note'].forEach((k) => {
      if (e[k] !== undefined && typeof e[k] !== 'string') err(w0, `"${k}" phải là chuỗi`);
    });
    ['check', 'levelCheck', 'skip'].forEach((k) => {
      if (e[k] !== undefined && typeof e[k] !== 'boolean') err(w0, `"${k}" phải là true/false`);
    });
    if (e.alt !== undefined && !(Array.isArray(e.alt) && e.alt.every((x) => typeof x === 'string'))) err(w0, '"alt" phải là mảng chuỗi');
    if (typeof e.word !== 'string') return;
    if (e.word !== e.word.trim().toLowerCase()) err(w0, 'word phải chữ thường, không dư khoảng trắng');
    if (seen.has(e.word)) err(w0, `trùng trong file (dòng ${seen.get(e.word) + 1} và ${i + 1})`);
    else seen.set(e.word, i);
    if (e.pos !== undefined && !POS_LIST.includes(e.pos)) err(w0, `pos "${e.pos}" ngoài bộ ${POS_LIST.join('/')}`);
    if (e.level !== undefined && !LEVELS.includes(e.level)) err(w0, `level "${e.level}" ngoài bộ ${LEVELS.join('/')}`);
    if (e.cat !== undefined && !Object.prototype.hasOwnProperty.call(CATEGORIES, e.cat)) err(w0, `cat "${e.cat}" ngoài bảng A3`);
    if (e.check === true) stats.check++;
    if (e.levelCheck === true) stats.levelCheck++;
    if (e.skip === true) stats.skip++;
    if (HARD_BLOCK.includes(e.word) && e.skip !== true) err(w0, 'không hợp trẻ em: bắt buộc skip:true và ghi note');
    if (WATCH.includes(e.word) && e.skip !== true) note(w0, 'từ nhạy cảm, cân nhắc skip hoặc để Opus quyết');
    if (e.skip === true) {
      if (!e.note || !String(e.note).trim()) err(w0, 'skip:true thì phải ghi note lý do');
      return;
    }
    // ---- vi ----
    const vi = typeof e.vi === 'string' ? e.vi : '';
    if (!vi.trim()) err(w0, 'thiếu vi');
    else {
      if (vi.length > 40) err(w0, `vi dài ${vi.length} ký tự (tối đa 40)`);
      if (/[;/(]/.test(vi)) err(w0, 'vi không được chứa ; / (');
      if (vi !== vi.trim()) err(w0, 'vi dư khoảng trắng đầu/cuối');
      const parts = vi.split(',').map((s) => s.trim().toLowerCase());
      if (!VI_DIACRITIC.test(vi) && !parts.every((p) => VI_LATIN_OK.has(p) || looksVietnameseNoTone(p)) && e.check !== true) err(w0, `vi "${vi}" không có dấu tiếng Việt (nếu đúng là từ không dấu/từ mượn thì đánh check:true và ghi note)`);
      if (vi.split(',').length > 2) err(w0, 'vi tối đa 2 nghĩa');
      if (vi.length > 25) note(w0, `vi dài (${vi.length} ký tự)`);
      if (vi[0] !== vi[0].toLowerCase() && !/^(Việt|Hà|Hồ|Mỹ|Anh|Pháp|Nhật|Hàn|Trung|Thái|Úc)/.test(vi)) note(w0, 'vi viết hoa đầu (chỉ đúng với tên riêng)');
      if (e.cat) {
        const k = e.cat + '|' + vi.toLowerCase();
        if (viByCat.has(k) && viByCat.get(k) !== e.word) note(w0, `cùng vi "${vi}" với "${viByCat.get(k)}" trong cùng cat (hại câu hỏi nghĩa)`);
        else viByCat.set(k, e.word);
      }
    }
    // ---- ex ----
    const ex = typeof e.ex === 'string' ? e.ex : '';
    if (!ex.trim()) err(w0, 'thiếu ex');
    else {
      const n = words(ex).length;
      if (n < 4 || n > 12) err(w0, `ex có ${n} từ (cần 4-12): "${ex}"`);
      if (ex.length > 70) err(w0, `ex dài ${ex.length} ký tự (tối đa 70): "${ex}"`);
      if (!/^[A-Z]/.test(ex)) err(w0, `ex phải viết hoa đầu câu: "${ex}"`);
      if (!/[.?!]$/.test(ex)) err(w0, `ex phải kết thúc . ? hoặc ! : "${ex}"`);
      if (VI_DIACRITIC.test(ex)) err(w0, `ex không được chứa chữ tiếng Việt: "${ex}"`);
      if (ex !== ex.trim() || /\s{2,}/.test(ex)) err(w0, 'ex dư khoảng trắng');
      const hits = findWordInText(ex, e.word, { pl: e.pl, alt: e.alt });
      if (hits.length === 0) err(w0, `ex không chứa từ (kể cả số nhiều/chia động từ/pl/alt): "${ex}"`);
      else if (hits.length > 1) err(w0, `ex chứa từ ${hits.length} lần (chỉ được 1): "${ex}"`);
      else if (hits[0].index === 0) note(w0, `ex bắt đầu bằng chính từ (hại câu điền chỗ trống): "${ex}"`);
    }
  });
  if (inWords) {
    const want = new Set(inWords);
    const have = new Set(data.filter((e) => e && typeof e.word === 'string').map((e) => e.word));
    const miss = inWords.filter((w) => !have.has(w));
    const extra = [...have].filter((w) => !want.has(w));
    if (miss.length) errors.push(`${label}: thiếu ${miss.length} từ so với file in/: ${miss.slice(0, 15).join(', ')}${miss.length > 15 ? ', ...' : ''}`);
    if (extra.length) errors.push(`${label}: thừa ${extra.length} từ không có trong file in/: ${extra.slice(0, 15).join(', ')}${extra.length > 15 ? ', ...' : ''}`);
  }
  return { errors, notes, stats };
}

export function partNames(inDir) {
  return fs.readdirSync(inDir).filter((f) => /^part-\d\d\.txt$/.test(f)).map((f) => f.replace('.txt', '')).sort();
}

// opts: { inDir, partsDir } cho phép đổi thư mục (merge/test dùng).
export function checkAll(opts) {
  const inDir = (opts && opts.inDir) || path.join(here, 'in');
  const partsDir = (opts && opts.partsDir) || path.join(here, 'parts');
  const names = partNames(inDir);
  const result = { errors: [], notes: [], parts: {}, entries: [] };
  const owner = new Map();
  names.forEach((name) => {
    const f = path.join(partsDir, name + '.json');
    if (!fs.existsSync(f)) { result.errors.push(`${name}: thiếu file ${path.relative(process.cwd(), f)}`); return; }
    const r = checkOne(name, inDir, partsDir);
    result.errors.push(...r.errors);
    result.notes.push(...r.notes);
    result.parts[name] = r.stats;
    if (r.data) r.data.forEach((e) => {
      if (e && typeof e.word === 'string') {
        if (owner.has(e.word)) result.errors.push(`${name} | ${e.word}: trùng với ${owner.get(e.word)}`);
        else owner.set(e.word, name);
        result.entries.push(e);
      }
    });
  });
  return result;
}

export function checkOne(name, inDir, partsDir) {
  const f = path.join(partsDir, name + '.json');
  let data;
  try {
    data = JSON.parse(read(f));
  } catch (e) {
    return { errors: [`${name}: JSON không hợp lệ (${e.message})`], notes: [], stats: { entries: 0, check: 0, levelCheck: 0, skip: 0 } };
  }
  const inFile = path.join(inDir, name + '.txt');
  const inWords = fs.existsSync(inFile) ? readInFile(inFile).map((x) => x.word) : null;
  const r = checkEntries(data, inWords, name);
  r.data = data;
  return r;
}

// Âm tiết tiếng Việt không dấu (ví dụ "con", "anh", "trai", "ong", "ma"): không có f/j/w/z và kết thúc bằng nguyên âm hoặc c/ch/m/n/ng/nh/p/t.
// Chặn từ tiếng Anh còn nguyên (bird, bee, dog...) nhờ so với chính từ gốc ở chỗ gọi (vi === word vẫn lỗi) và các đuôi lạ (d, r, l, b, k, s...).
function looksVietnameseNoTone(tok) {
  const toks = String(tok).toLowerCase().split(/\s+/).filter(Boolean);
  return toks.length > 0 && toks.every((x) => VI_LATIN_OK.has(x) || syllableNoTone(x));
}
function syllableNoTone(t) {
  if (!/^[a-z]+$/.test(t)) return false;
  if (/[fjwz]/.test(t)) return false;
  if (/(ee|oo|ou|ea)/.test(t)) return false;
  return /[aeiouy]$/.test(t) || /(c|ch|m|n|ng|nh|p|t)$/.test(t);
}

function printReport(errors, notes, statsByLabel) {
  notes.forEach((n) => console.log('Lưu ý  ' + n));
  errors.forEach((e) => console.log('LỖI    ' + e));
  Object.entries(statsByLabel).forEach(([k, s]) => console.log(`${k}: ${s.entries} mục, check=${s.check}, levelCheck=${s.levelCheck}, skip=${s.skip}`));
  console.log(errors.length ? `\n${errors.length} lỗi, ${notes.length} lưu ý.` : `\n0 lỗi, ${notes.length} lưu ý.`);
}

function main() {
  const argv = process.argv.slice(2);
  const fi = argv.indexOf('--file');
  if (fi >= 0) {
    const file = argv[fi + 1];
    if (!file) { console.error('Thiếu đường dẫn sau --file'); process.exit(2); }
    const ii = argv.indexOf('--in');
    let data;
    try { data = JSON.parse(read(file)); } catch (e) { console.error(`LỖI    ${file}: JSON không hợp lệ (${e.message})`); process.exit(1); }
    const inWords = ii >= 0 ? readInFile(argv[ii + 1]).map((x) => x.word) : null;
    const label = path.basename(file);
    const r = checkEntries(data, inWords, label);
    printReport(r.errors, r.notes, { [label]: r.stats });
    process.exit(r.errors.length ? 1 : 0);
  }
  const target = argv[0];
  if (!target) { console.error('Dùng: check.mjs part-NN | all | --file <json> [--in <txt>]'); process.exit(2); }
  const inDir = path.join(here, 'in');
  const partsDir = path.join(here, 'parts');
  let errors; let notes; let stats; let result;
  if (target === 'all') {
    result = checkAll();
    errors = result.errors; notes = result.notes; stats = result.parts;
  } else {
    const name = target.replace(/\.(json|txt)$/, '');
    if (!fs.existsSync(path.join(inDir, name + '.txt'))) { console.error(`Không có in/${name}.txt`); process.exit(2); }
    if (!fs.existsSync(path.join(partsDir, name + '.json'))) { console.error(`LỖI    chưa có parts/${name}.json`); process.exit(1); }
    const r = checkOne(name, inDir, partsDir);
    errors = r.errors; notes = r.notes; stats = { [name]: r.stats };
  }
  printReport(errors, notes, stats);
  fs.writeFileSync(path.join(here, 'check-result.json'), JSON.stringify({ target, at: new Date().toISOString(), errors: errors.length, notes: notes.length, stats, errorList: errors.slice(0, 500), noteList: notes.slice(0, 500) }, null, 2));
  process.exit(errors.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
