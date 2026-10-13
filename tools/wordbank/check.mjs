// Kiểm file nguồn kho từ (PLAN-SOANBAI mục B3). Lỗi = thoát mã 1; lưu ý chỉ in ra.
// Dùng:
//   node tools/wordbank/check.mjs part-03        kiểm parts/part-03.json so với in/part-03.txt
//   node tools/wordbank/check.mjs new-07         kiểm parts/new-07.json so với in/new-07.txt (7 cột, xem README-AGENT-LEVELS.md)
//   node tools/wordbank/check.mjs all            kiểm mọi phần part-NN + new-NN, không trùng word/alt/pl giữa các phần
//   node tools/wordbank/check.mjs all --full     thêm: mọi lemma của levels.json (trừ tên riêng) phải có đúng 1 mục (bật sau khi soạn xong đợt cuối)
//   node tools/wordbank/check.mjs --file <json>  kiểm 1 file bất kỳ (không đối chiếu in/ trừ khi thêm --in <txt>)
// Mở rộng PLAN-LEVELS mục 3.3: kiểm cấp theo danh sách (levels.json cục bộ, hoặc levels-lock.json), nhãn+loại từ, độ dài câu theo cấp,
// chặn chép câu ví dụ Cambridge (so với dòng • trong tools/wordbank/src/*.md nếu có), cảnh báo >10% check:true.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, POS_LIST, LEVELS, catAllowsPos } from '../../src/core/soanbai/categories.js';
import { findWordInText, normKey } from '../../src/core/soanbai/normalize.js';
import { meaningClash } from '../../src/core/soanbai/qrules.js';
import { buildIndex, matchWord, heldWords } from './levels/relevel.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIELDS = ['word', 'vi', 'pos', 'cat', 'level', 'ex', 'img', 'alt', 'pl', 'display', 'sense', 'check', 'levelCheck', 'skip', 'note'];
const REQUIRED = ['word', 'pos', 'cat', 'level', 'check', 'levelCheck', 'skip'];
// Từ phải đánh skip:true (không hợp trẻ em). skull/sword: chỉ nhắc, để Opus quyết.
const LEVEL_BY_CODE = { starters: 's', movers: 'm', flyers: 'f', ket: 'k', pet: 'p', other: 'o' };
const HARD_BLOCK = ['beer', 'wine', 'gun', 'pistol', 'bomb', 'bikini', 'syringe', 'injection', 'cigarette', 'alcohol', 'whisky', 'vodka', 'cocktail', 'rifle', 'grenade'];
const WATCH = ['skull', 'sword', 'knife', 'kill', 'die', 'dead', 'blood'];
const VI_DIACRITIC = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const VI_LATIN_OK = new Set(['pizza', 'taxi', 'robot', 'internet', 'karate', 'yoga', 'cola', 'hamburger', 'sandwich', 'email', 'video', 'camera', 'menu', 'ok', 'radio', 'tv', 'dvd', 'cd', 'wifi', 'game', 'website', 'web', 'taxi', 'online', 'app', 'judo', 'taekwondo', 'ballet', 'golf', 'tennis', 'jazz', 'pop', 'rap', 'hip hop', 'kung fu', 'sushi', 'pasta', 'spaghetti', 'laptop', 'tablet', 'panda', 'koala', 'ketchup', 'hotdog', 'hot dog', 'popcorn', 'kiwi', 'karaoke', 'ski', 'bowling', 'rugby', 'marathon', 'sticker', 'kem', 'cam', 'cua', 'blog', 'vlog', 'selfie', 'hashtag', 'podcast', 'smartphone', 'chat', 'offline', 'hacker', 'show', 'fan', 'pizza', 'bar', 'club', 'cafe', 'party', 'sitcom', 'smoothie', 'cookie', 'hacker', 'file', 'link', 'wifi', 'khoai', 'ba', 'ma', 'nho', 'bi', 'xe', 'trai', 'gai', 'chai', 'ngai']);

// Đầu nghĩa được viết hoa (tên riêng: nước, thành phố, châu lục, hành tinh, viết tắt).
const VI_PROPER_START = /^(Việt|Hà|Hồ|Mỹ|Anh|Pháp|Nhật|Hàn|Trung|Thái|Úc|Luân|Bắc|Nam|Tây|Đông|Trái|ADN|Ấn|Đức|Nga|Ý|Ai Cập|Bồ|Hà Lan|Thụy|Thuỵ|Brazil|Canada|Ireland|Singapore|Châu|Paris|Pa-ri|New York|Tokyo|Sydney|Bắc Kinh|Mặt Trăng|Mặt Trời|Sao )/;
const read = (p) => fs.readFileSync(p, 'utf8');
const words = (s) => String(s).trim().split(/\s+/).filter(Boolean);

// part-NN.txt: "word<TAB>tên emoji". new-NN.txt: "word<TAB>pos<TAB>level<TAB>sense<TAB>alt(|)<TAB>pl<TAB>display<TAB>cpos" (PLAN-LEVELS 2.7).
export function readInFile(p) {
  const isNew = /^new-/.test(path.basename(p));
  return read(p).split(/\r?\n/).filter((l) => l.trim()).map((l) => {
    const c = l.split('\t');
    if (isNew) {
      return { word: c[0].trim(), pos: (c[1] || '').trim(), level: (c[2] || '').trim(), sense: (c[3] || '').trim(), alt: (c[4] || '').split('|').map((x) => x.trim()).filter(Boolean), pl: (c[5] || '').trim(), display: (c[6] || '').trim(), cpos: (c[7] || '').trim(), isNew: true };
    }
    return { word: c[0].trim(), emoji: (c[1] || '').trim() };
  });
}

// Độ dài câu ví dụ theo cấp (PLAN-LEVELS 3.2): [từ tối thiểu, từ tối đa, ký tự tối đa].
export const EX_LIMITS = { starters: [4, 9, 55], movers: [4, 10, 60], flyers: [4, 12, 70], ket: [5, 12, 75], pet: [5, 14, 90], other: [4, 12, 70] };
const IRREG_PAST = /\b(went|saw|made|ran|ate|took|came|gave|got|had|did|said|told|found|knew|thought|bought|brought|wrote|sat|stood|met|left|felt|heard|kept|began|drank|flew|swam|drew|woke|wore|lost|paid|sold|sent|spent|won)\b/i;

// Đọc mọi dòng ví dụ "•" của KET/PET để chặn chép (chỉ cục bộ; tệp nguồn bị gitignore nên CI bỏ qua).
export function loadCopyIndex(srcDir) {
  const dir = srcDir || path.join(here, 'src');
  const sentences = new Set();
  const grams = new Set();
  let files = 0;
  ['a2-key-2020.md', 'b1-preliminary.md'].forEach((f) => {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) return;
    files++;
    read(p).split(/\r?\n/).forEach((ln) => {
      ln.split('•').slice(1).forEach((part) => {
        const toks = tokensOf(part.replace(/\([^)]*\)\s*$/, ''));
        if (toks.length >= 3) sentences.add(toks.join(' '));
        for (let i = 0; i + 6 <= toks.length; i++) grams.add(toks.slice(i, i + 6).join(' '));
      });
    });
  });
  return files ? { sentences, grams } : null;
}
function tokensOf(t) {
  return String(t).toLowerCase().replace(/[’‘]/g, "'").split(/[^a-z0-9']+/).filter(Boolean);
}
export function copyHit(ex, copy) {
  if (!copy) return null;
  const toks = tokensOf(ex);
  if (toks.length >= 3 && copy.sentences.has(toks.join(' '))) return 'trùng nguyên văn';
  for (let i = 0; i + 6 <= toks.length; i++) if (copy.grams.has(toks.slice(i, i + 6).join(' '))) return 'trùng ≥6 từ liền: "' + toks.slice(i, i + 6).join(' ') + '"';
  return null;
}

// env: { idx, held, lock, copy } tuỳ chọn. Có idx (levels.json) hoặc lock (levels-lock.json) thì kiểm cấp theo danh sách.
export function loadEnv(opts) {
  const o = opts || {};
  const env = { idx: null, held: new Set(), lock: null, copy: null, source: '' };
  const lv = o.levels || path.join(here, 'src', 'levels.json');
  const lock = o.lock || path.join(here, 'levels-lock.json');
  if (fs.existsSync(lv)) {
    try { env.idx = buildIndex(JSON.parse(read(lv))); env.source = 'levels.json'; } catch (e) { /* bỏ qua */ }
  }
  if (!env.idx && fs.existsSync(lock)) {
    try { env.lock = JSON.parse(read(lock)); env.source = 'levels-lock.json'; } catch (e) { /* bỏ qua */ }
  }
  const amb = o.ambiguous || path.join(here, 'ambiguous.json');
  if (fs.existsSync(amb)) { try { env.held = heldWords(JSON.parse(read(amb))); } catch (e) { /* bỏ qua */ } }
  if (!o.noCopy) env.copy = loadCopyIndex(o.srcDir);
  return env;
}

// Kiểm 1 mảng entry. inWords: mảng từ cần có đúng (hoặc null). Trả { errors:[], notes:[], stats }.
export function checkEntries(data, inRows, label, env0) {
  const env = env0 || {};
  const strictEx = /^new-/.test(label);
  const inWords = inRows ? inRows.map((r) => (typeof r === 'string' ? r : r.word)) : null;
  const inMap = new Map();
  (inRows || []).forEach((r) => { if (r && typeof r === 'object') inMap.set(r.word, r); });
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
    ['word', 'vi', 'pos', 'cat', 'level', 'ex', 'img', 'pl', 'note', 'display', 'sense'].forEach((k) => {
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
    // ---- đối chiếu in-file (định dạng new-NN) ----
    const row = inMap.get(e.word);
    if (row && row.isNew) {
      if (e.pos !== row.pos) err(w0, `pos "${e.pos}" khác in-file "${row.pos}" (chép y nguyên)`);
      if (e.level !== row.level) err(w0, `level "${e.level}" khác in-file "${row.level}" (không được đổi cấp)`);
      if (JSON.stringify(e.alt || []) !== JSON.stringify(row.alt)) err(w0, `alt phải y nguyên in-file: ${JSON.stringify(row.alt)}`);
      if ((e.pl || '') !== row.pl) err(w0, `pl phải y nguyên in-file: "${row.pl}"`);
      if ((e.display || '') !== row.display) err(w0, `display phải y nguyên in-file: "${row.display}"`);
      if ((e.sense || '') !== row.sense) err(w0, `sense phải y nguyên in-file: "${row.sense}"`);
      if (e.levelCheck === true) err(w0, 'levelCheck luôn false (cấp lấy từ danh sách)');
    }
    // ---- cấp theo danh sách Cambridge ----
    if (e.level !== undefined && (env.idx || env.lock) && e.levelCheck !== true) {
      if (env.idx) {
        const m = matchWord(e, env.idx);
        if (m && m.lemma.level !== e.level) err(w0, `level "${e.level}" khác cấp thấp nhất trong danh sách "${m.lemma.level}" (${env.source})`);
        if (!m && e.level !== 'other' && !(env.held && env.held.has(e.word))) err(w0, `level "${e.level}" nhưng từ không có trong danh sách: phải là "other"`);
      } else if (env.lock) {
        const code = env.lock[e.word];
        const want = code && Object.keys(LEVEL_BY_CODE).find((k) => LEVEL_BY_CODE[k] === code);
        if (want && want !== e.level) err(w0, `level "${e.level}" khác levels-lock "${want}"`);
      }
    }
    if (e.cat !== undefined && e.pos !== undefined && Object.prototype.hasOwnProperty.call(CATEGORIES, e.cat) && !e.skip && !catAllowsPos(e.cat, e.pos)) {
      err(w0, `cat "${e.cat}" chỉ dùng cho loại từ ${CATEGORIES[e.cat].pos.join('/')}, không phải "${e.pos}"`);
    }
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
      if (vi[0] !== vi[0].toLowerCase() && !VI_PROPER_START.test(vi)) note(w0, 'vi viết hoa đầu (chỉ đúng với tên riêng)');
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
      const lim = EX_LIMITS[e.level] || EX_LIMITS.other;
      if (strictEx) {
        // new-NN (dữ liệu mới): độ dài theo cấp là LỖI
        if (n < lim[0] || n > lim[1]) err(w0, `ex có ${n} từ, cấp ${e.level} cần ${lim[0]}-${lim[1]}: "${ex}"`);
        if (ex.length > lim[2]) err(w0, `ex dài ${ex.length} ký tự (cấp ${e.level} tối đa ${lim[2]}): "${ex}"`);
      } else {
        // part-NN cũ (luật A1): 4-12 từ, 70 ký tự là lỗi; vượt giới hạn của cấp mới chỉ là lưu ý để Opus sửa dần
        if (n < 4 || n > 12) err(w0, `ex có ${n} từ (cần 4-12): "${ex}"`);
        if (ex.length > 70) err(w0, `ex dài ${ex.length} ký tự (tối đa 70): "${ex}"`);
        if (n < lim[0] || n > lim[1] || ex.length > lim[2]) note(w0, `ex (${n} từ, ${ex.length} ký tự) ngoài giới hạn cấp ${e.level} (${lim[0]}-${lim[1]} từ, ≤${lim[2]} ký tự)`);
      }
      if ((e.level === 'starters' || e.level === 'movers') && !IRREG_PAST.test(e.word) && IRREG_PAST.test(ex) && !/\b(was|were)\b/i.test(ex)) note(w0, `ex cấp ${e.level} có động từ quá khứ bất quy tắc: "${ex}"`);
      const ch = copyHit(ex, env.copy);
      if (ch) err(w0, `ex chép ví dụ Cambridge (${ch}): "${ex}"`);
      if (!/^[A-Z]/.test(ex)) err(w0, `ex phải viết hoa đầu câu: "${ex}"`);
      if (!/[.?!]$/.test(ex)) err(w0, `ex phải kết thúc . ? hoặc ! : "${ex}"`);
      if (VI_DIACRITIC.test(ex.replace(/\b(caf[eé]s?|fianc[eé]e?s?|r[eé]sum[eé]s?|na[iï]ve|jalape[nñ]os?)(?![a-z])/gi, ''))) err(w0, `ex không được chứa chữ tiếng Việt: "${ex}"`);
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

// Khoá phát hiện trùng khi gộp kho: normKey + bỏ dấu (café = cafe). Không đổi normKey của runtime.
export function dupKey(v) {
  return normKey(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
// Khoá "dạng gốc" của word: dupKey + bỏ -s/-es cuối (meatballs = meatball, olives = olive). Chỉ dùng để tìm cặp số ít/số nhiều cùng nghĩa.
export function foldKey(w) {
  let k = dupKey(w);
  if (k.length > 3 && /[^s]s$/.test(k) && !/\(/.test(k)) k = k.slice(0, -1);
  return k;
}

// Cặp số ít/số nhiều Opus đã cố ý tách nghĩa (Cambridge liệt kê hai lemma riêng): không coi là trùng.
export const SPLIT_OK = new Set(['a lot|lots', 'detail|details']);

export function partNames(inDir) {
  return fs.readdirSync(inDir).filter((f) => /^(part|new)-\d\d\.txt$/.test(f)).map((f) => f.replace('.txt', '')).sort();
}

// opts: { inDir, partsDir, env, full, reviewDir } cho phép đổi thư mục (merge/test dùng). env mặc định = loadEnv().
export function checkAll(opts) {
  const o = opts || {};
  const inDir = o.inDir || path.join(here, 'in');
  const partsDir = o.partsDir || path.join(here, 'parts');
  const env = o.env === undefined ? loadEnv() : o.env;
  const names = partNames(inDir);
  const result = { errors: [], notes: [], parts: {}, entries: [], env };
  const owner = new Map();
  const keyOwner = new Map();
  names.forEach((name) => {
    const f = path.join(partsDir, name + '.json');
    if (!fs.existsSync(f)) {
      // new-NN chưa soạn: chưa phải lỗi (merge vẫn chạy với phần đã có); `--full` coi là lỗi.
      const msg = `${name}: chưa có ${path.relative(process.cwd(), f)}`;
      if (/^new-/.test(name) && !o.full) result.notes.push(msg + ' (chưa soạn, bỏ qua)');
      else result.errors.push(msg);
      return;
    }
    const r = checkOne(name, inDir, partsDir, env || {});
    result.errors.push(...r.errors);
    result.notes.push(...r.notes);
    result.parts[name] = r.stats;
    if (r.stats.entries && r.stats.check / r.stats.entries > 0.1) result.notes.push(`${name}: ${r.stats.check}/${r.stats.entries} mục check:true (>10%): kiểm lại, đừng đánh check chỉ vì từ khó`);
    if (r.data) r.data.forEach((e) => {
      if (e && typeof e.word === 'string') {
        if (owner.has(e.word)) result.errors.push(`${name} | ${e.word}: trùng với ${owner.get(e.word)}`);
        else owner.set(e.word, name);
        result.entries.push(e);
        Object.defineProperty(e, '_part', { value: name, enumerable: false, configurable: true });
        if (e.skip !== true) {
          // khoá chuẩn hoá word/alt/pl không được trỏ vào hai mục khác nhau
          [e.word].concat(Array.isArray(e.alt) ? e.alt : [], e.pl ? [e.pl] : []).forEach((v) => {
            const k = dupKey(v);
            if (!k) return;
            const prev = keyOwner.get(k);
            if (prev && prev.word !== e.word) {
              // 11 cặp cũ (feet/foot, gray/grey, tv/television...) nằm trong part-NN đã duyệt: chỉ "lưu ý" cho tới khi Opus gộp. Mục mới (new-NN) trùng thì là LỖI.
              const msg = `${name} | ${e.word}: khoá "${k}" (word/alt/pl) trùng với "${prev.word}" ở ${prev.part}`;
              if (/^part-/.test(name) && /^part-/.test(prev.part)) result.notes.push(msg + ' (mục cũ, chờ gộp)');
              else result.errors.push(msg);
            }
            else if (!prev) keyOwner.set(k, { word: e.word, part: name });
          });
        }
      }
    });
  });
  // cặp số ít/số nhiều hoặc có/không dấu CÙNG loại từ và nghĩa va nhau (café/cafe, meatballs/meatball): LỖI, phải gộp thành 1 mục + alt/pl.
  const foldOwner = new Map();
  result.entries.forEach((e) => {
    if (e.skip === true || !e.vi) return;
    const k = foldKey(e.word);
    const list = foldOwner.get(k) || [];
    list.forEach((o) => {
      if (o.word !== e.word && o.pos === e.pos && meaningClash(o.vi, e.vi) && !SPLIT_OK.has(o.word + '|' + e.word) && !SPLIT_OK.has(e.word + '|' + o.word)) {
        // cặp cũ nằm cả hai trong part-NN (shoe/shoes... đã duyệt, cố ý tách đơn/đôi): lưu ý; có mục new-NN: LỖI
        const msg = `${e.word}: cùng dạng gốc, loại từ và nghĩa với "${o.word}" (${o.vi} | ${e.vi}): gộp thành 1 mục + alt/pl`;
        if (/^part-/.test(o._part) && /^part-/.test(e._part)) result.notes.push(msg + ' (mục cũ, giữ)');
        else result.errors.push(msg);
      }
    });
    list.push(e);
    foldOwner.set(k, list);
  });
  // trùng vi+cat trên toàn kho -> ứng viên nhóm gần nghĩa (ghi review/syn-candidates.tsv)
  const viKey = new Map();
  result.entries.forEach((e) => {
    if (e.skip === true || !e.vi) return;
    const k = e.cat + '|' + String(e.vi).toLowerCase().replace(/^(con|cái|quả|chiếc|bông|ngọn|cây|củ|trái|bộ|môn|người)\s+/, '');
    if (!viKey.has(k)) viKey.set(k, []);
    viKey.get(k).push(e.word);
  });
  const syn = [...viKey.entries()].filter(([, w]) => w.length > 1);
  result.synCandidates = syn.map(([k, w]) => ({ cat: k.split('|')[0], vi: k.split('|')[1], words: w }));
  if (syn.length) result.notes.push(`${syn.length} cặp/nhóm trùng vi+cat trên toàn kho (xem review/syn-candidates.tsv): ${syn.slice(0, 5).map(([, w]) => w.join('=')).join('; ')}${syn.length > 5 ? '; ...' : ''}`);
  if (o.full) {
    if (!env || !env.idx) result.errors.push('--full cần tools/wordbank/src/levels.json');
    else {
      const have = new Set();
      // mục skip (cố ý loại, vd bomb/gun) vẫn tính là đã xử lý; dạng số nhiều của kho khớp lemma số ít của danh sách (parents = parent)
      result.entries.forEach((e) => { have.add(e.word); (e.alt || []).forEach((a) => have.add(a)); if (e.pl) have.add(e.pl); const m = matchWord(e, env.idx); if (m) have.add(m.lemma.word); });
      const missing = [...env.idx.exact.keys()].filter((w) => !have.has(w) && !(env.idx.exact.get(w).lists || []).every((l) => l === 'names'));
      if (missing.length) result.errors.push(`--full: còn ${missing.length} lemma của danh sách chưa có mục: ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ', ...' : ''}`);
    }
  }
  return result;
}

export function checkOne(name, inDir, partsDir, env) {
  const f = path.join(partsDir, name + '.json');
  let data;
  try {
    data = JSON.parse(read(f));
  } catch (e) {
    return { errors: [`${name}: JSON không hợp lệ (${e.message})`], notes: [], stats: { entries: 0, check: 0, levelCheck: 0, skip: 0 } };
  }
  const inFile = path.join(inDir, name + '.txt');
  const inRows = fs.existsSync(inFile) ? readInFile(inFile) : null;
  const r = checkEntries(data, inRows, name, env === undefined ? loadEnv() : env);
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
    const inWords = ii >= 0 ? readInFile(argv[ii + 1]) : null;
    const label = path.basename(file);
    const r = checkEntries(data, inWords, label, loadEnv());
    printReport(r.errors, r.notes, { [label]: r.stats });
    process.exit(r.errors.length ? 1 : 0);
  }
  const target = argv[0];
  if (!target) { console.error('Dùng: check.mjs part-NN | new-NN | all [--full] | --file <json> [--in <txt>]'); process.exit(2); }
  const inDir = path.join(here, 'in');
  const partsDir = path.join(here, 'parts');
  let errors; let notes; let stats; let result;
  if (target === 'all') {
    result = checkAll({ full: argv.includes('--full') });
    errors = result.errors; notes = result.notes; stats = result.parts;
    fs.mkdirSync(path.join(here, 'review'), { recursive: true });
    fs.writeFileSync(path.join(here, 'review', 'syn-candidates.tsv'), ['cat\tvi\twords'].concat((result.synCandidates || []).map((c) => [c.cat, c.vi, c.words.join(', ')].join('\t'))).join('\n') + '\n');
  } else {
    const name = target.replace(/\.(json|txt)$/, '');
    if (!fs.existsSync(path.join(inDir, name + '.txt'))) { console.error(`Không có in/${name}.txt`); process.exit(2); }
    if (!fs.existsSync(path.join(partsDir, name + '.json'))) { console.error(`LỖI    chưa có parts/${name}.json`); process.exit(1); }
    const r = checkOne(name, inDir, partsDir, loadEnv());
    errors = r.errors; notes = r.notes; stats = { [name]: r.stats };
  }
  printReport(errors, notes, stats);
  fs.writeFileSync(path.join(here, 'check-result.json'), JSON.stringify({ target, at: new Date().toISOString(), errors: errors.length, notes: notes.length, stats, errorList: errors.slice(0, 500), noteList: notes.slice(0, 500) }, null, 2));
  process.exit(errors.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
