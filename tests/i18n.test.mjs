// Unit test song ngữ (PLAN-I18N mục E.1): đủ cặp vi/en, tham số khớp, không khoá mồ côi / thiếu, EN không lẫn tiếng Việt,
// resolve(), withUi(), số nhiều, cờ SVG, tên dạng Toán có labelEn. Chạy: node --test tests/i18n.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');

// Nạp 3 tệp script bằng vm với window / location / localStorage giả.
function load({ search = '', store = {}, throwStorage = false, hash = '' } = {}) {
  const ls = throwStorage ? null : { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const ctx = { console, location: { search, hash, pathname: '/board/index.html' }, history: { replaceState() {} } };
  ctx.window = ctx;
  if (throwStorage) Object.defineProperty(ctx, 'localStorage', { get() { throw new Error('SecurityError'); } });
  else ctx.localStorage = ls;
  vm.createContext(ctx);
  for (const f of ['i18n/i18n.js', 'i18n/start.strings.js', 'i18n/board.strings.js']) vm.runInContext(read(f), ctx, { filename: f });
  return { I: ctx.I18N, ctx, store };
}
const { I } = load();
const { vi, en } = I.dict;
const VN = /[à-ỹÀ-Ỹđ]/;
const params = (s) => new Set((String(s).match(/\{(\w+)\}/g) || []));
const parts = (v) => (v && typeof v === 'object' ? [v.one, v.other] : [v]);

test('I1: mọi khoá có đủ vi và en, không rỗng; khoá số nhiều có one + other ở EN', () => {
  assert.deepEqual(Object.keys(vi).sort(), Object.keys(en).sort());
  assert.ok(Object.keys(vi).length >= 190, 'số khoá ' + Object.keys(vi).length);
  for (const k of Object.keys(vi)) {
    assert.equal(typeof vi[k], 'string', 'vi phải là chuỗi: ' + k);
    for (const p of parts(en[k])) assert.ok(typeof p === 'string' && p.length > 0, 'en rỗng: ' + k);
    if (typeof en[k] === 'object') assert.ok(en[k].one && en[k].other, 'thiếu one/other: ' + k);
    assert.ok(vi[k].length > 0, 'vi rỗng: ' + k);
  }
});

test('I2: tham số {x} của VI bằng hợp tập của EN', () => {
  for (const k of Object.keys(vi)) {
    const a = [...params(vi[k])].sort().join();
    const b = [...new Set(parts(en[k]).flatMap((p) => [...params(p)]))].sort().join();
    assert.equal(b, a, 'tham số lệch ở ' + k + ': vi=' + a + ' en=' + b);
  }
});

function sources() {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(PUB, d), { withFileTypes: true })) {
      const rel = d + '/' + e.name;
      if (e.isDirectory()) { if (['assets', 'edu', 'fonts', 'packs', 'math'].includes(e.name) && d !== 'board/js') continue; walk(rel); }
      else if (/\.(js|html)$/.test(e.name) && !/strings\.js$/.test(e.name) && !/snip-test/.test(e.name)) out.push(rel);
    }
  };
  walk('start'); walk('board/js'); walk('board'); walk('i18n');
  return [...new Set(out)];
}
function usedKeys() {
  const lit = new Set(), pre = new Set();
  for (const f of sources()) {
    let s = read(f);
    if (f === 'i18n/i18n.js') { const a = s.indexOf('  add({'), b = s.indexOf('  // Khởi động'); s = s.slice(0, a) + s.slice(b); }   // bỏ khối từ điển chung
    for (const m of s.matchAll(/['"]((?:common|lang|start|board|cue)\.[\w.]*)['"]/g)) (m[1].endsWith('.') ? pre : lit).add(m[1]);
    for (const m of s.matchAll(/data-i18n(?:-aria|-title)?="([\w.]+)"/g)) lit.add(m[1]);
  }
  return { lit, pre };
}

test('I3: không khoá mồ côi, không dùng khoá thiếu', () => {
  const { lit, pre } = usedKeys();
  const all = Object.keys(vi);
  const NOT_KEYS = new Set(['board.v2']);   // khoá sessionStorage của v2.js, không phải khoá chuỗi
  const missing = [...lit].filter((k) => !(k in vi) && !NOT_KEYS.has(k));
  assert.deepEqual(missing, [], 'khoá dùng mà không có trong danh mục: ' + missing.join(', '));
  for (const p of pre) assert.ok(all.some((k) => k.startsWith(p)), 'tiền tố không có khoá: ' + p);
  const used = (k) => lit.has(k) || [...pre].some((p) => k.startsWith(p));
  const orphans = all.filter((k) => !used(k));
  assert.deepEqual(orphans, [], 'khoá mồ côi: ' + orphans.join(', '));
});

test('I4: giá trị EN không lẫn tiếng Việt (trừ danh sách trắng)', () => {
  const white = new Set(['lang.vi', 'board.info.src2']);
  for (const k of Object.keys(en)) {
    if (white.has(k)) continue;
    for (const p of parts(en[k])) assert.ok(!VN.test(p), 'EN có dấu tiếng Việt: ' + k + ' = ' + p);
  }
});

test('I5: resolve(): ?ui > localStorage > vi; KHÔNG đọc tham số lang', () => {
  const st = (v, thr) => (thr ? { getItem() { throw new Error('x'); } } : { getItem: () => v });
  assert.equal(I.resolve('?ui=en', st(null)), 'en');
  assert.equal(I.resolve('?lang=en', st(null)), 'vi');
  assert.equal(I.resolve('?lang=en&uid=1&classId=9', st(null)), 'vi');
  assert.equal(I.resolve('?lang=en&ui=vi', st('en')), 'vi');
  assert.equal(I.resolve('', st('en')), 'en');
  assert.equal(I.resolve('', st('rác')), 'vi');
  assert.equal(I.resolve('', st(null, true)), 'vi');
  assert.equal(I.resolve('?ui=fr', st('en')), 'en');
  assert.equal(I.resolve('?ui=fr', st(null)), 'vi');
  assert.equal(I.resolve('?a=1&ui=en#L=abc', st(null)), 'en');
  assert.equal(I.resolve('', null), 'vi');
  // khởi động thật: ui hợp lệ thì ghi vào storage; lang thì không
  const a = load({ search: '?ui=en' });
  assert.equal(a.I.lang(), 'en'); assert.equal(a.store['eslhub.ui'], 'en');
  const b = load({ search: '?lang=en&classId=9' });
  assert.equal(b.I.lang(), 'vi'); assert.equal(b.store['eslhub.ui'], undefined);
  const c = load({ store: { 'eslhub.ui': 'en' } });
  assert.equal(c.I.lang(), 'en');
  const d = load({ throwStorage: true, search: '?ui=en' });
  assert.equal(d.I.lang(), 'en');
  const e = load({ throwStorage: true });
  assert.equal(e.I.lang(), 'vi');
});

test('I6: withUi giữ query và hash, thay ui cũ, không nhân đôi; VI bỏ ui', () => {
  assert.equal(I.withUi('../board/index.html?from=hub', 'en'), '../board/index.html?from=hub&ui=en');
  assert.equal(I.withUi('../#/', 'en'), '../?ui=en#/');
  assert.equal(I.withUi('../board/index.html?ui=vi&from=hub#L=abc', 'en'), '../board/index.html?from=hub&ui=en#L=abc');
  assert.equal(I.withUi('../board/index.html?from=hub&ui=en', 'en'), '../board/index.html?from=hub&ui=en');
  assert.equal(I.withUi('../start/index.html', 'en'), '../start/index.html?ui=en');
  assert.equal(I.withUi('../board/index.html?from=hub&ui=en', 'vi'), '../board/index.html?from=hub');
  assert.equal(I.withUi('../#/', 'vi'), '../#/');
});

test('I7: số nhiều và tham số', () => {
  const x = load({ search: '?ui=en' }).I;
  assert.equal(x.t('board.toast.packShort', { n: 1 }), 'This pack has only 1 question of this type.');
  assert.equal(x.t('board.toast.packShort', { n: 5 }), 'This pack has only 5 questions of this type.');
  assert.equal(x.t('board.tb.zonesBtn', { n: 1 }), 'Use 1 zone');
  assert.equal(x.t('board.tb.zonesBtn', { n: 3 }), 'Split into 3 zones');
  assert.equal(x.t('board.dlg.zones.title', { n: 4 }), 'Switch to 4 zones?');
  const v = load().I;
  assert.equal(v.t('board.toast.packShort', { n: 1 }), 'Gói này chỉ có 1 câu loại này.');
  assert.equal(v.t('board.tb.zonesBtn', { n: 2 }), 'Chia 2 vùng');
  assert.equal(v.tIn('en', 'cue.q', { i: 3, total: 10 }), 'Q 3/10');
  assert.equal(v.tIn('vi', 'cue.q', { i: 3, total: 10 }), 'Câu 3/10');
  assert.equal(v.t('khong.co.khoa'), 'khong.co.khoa');   // thiếu khoá trả về chính khoá
  assert.ok(v.missing.includes('khong.co.khoa'));
  assert.equal(v.t('board.score.correct', { s: 1 }), '1/{j} đúng');   // thiếu tham số: giữ nguyên {j}
});

test('I8: cờ SVG: VN sao vàng 10 điểm; Mỹ 7 sọc đỏ, ô xanh, 8 sao, không có id', () => {
  const vn = I.flag('vi'), us = I.flag('en');
  assert.ok(vn.includes('#DA251D') && vn.includes('#FFFF00'));
  const star = vn.match(/<polygon fill="#FFFF00" points="([^"]+)"/)[1].trim().split(/\s+/);
  assert.equal(star.length, 10);
  assert.equal((us.match(/M0 \d+(\.\d+)?h30/g) || []).length, 7);
  assert.ok(us.includes('#3C3B6E') && us.includes('#B22234'));
  assert.equal((us.match(/<polygon/g) || []).length, 8);
  for (const s of [vn, us]) { assert.ok(!/\sid=/.test(s)); assert.ok(s.includes('viewBox="0 0 30 20"')); assert.ok(s.includes('aria-hidden="true"')); }
});

test('I9: mọi dạng Toán lớp 1-12 có labelEn, không dấu tiếng Việt', async () => {
  const { MATH_TYPES } = await import('../public/board/js/math/gen.js');
  let n = 0;
  const seen = new Set();
  for (let g = 1; g <= 12; g++) for (const x of MATH_TYPES[g]) {
    assert.ok(x.labelEn && x.labelEn.length > 0, 'thiếu labelEn: ' + x.type);
    assert.ok(!VN.test(x.labelEn), 'labelEn có dấu: ' + x.labelEn);
    if (!seen.has(x.type)) { seen.add(x.type); n++; }
  }
  assert.equal(n, 37);
});

test('I10: không còn chuỗi giao diện tiếng Việt cứng trong public/board/js (trừ diag / palm / ink / lỗi nội bộ / dữ liệu)', () => {
  const VNC = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/;
  const SKIP = new Set(['diag.js', 'palm.js', 'snip-test.js', 'ink.js', 'render-tiles.js', 'gen.js', 'expr.js', 'rational.js', 'lesson.js', 'theme.js', 'i18n.js']);
  const bad = [];
  const dir = path.join(PUB, 'board/js');
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js') || SKIP.has(f)) continue;
    let block = false;
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((line, i) => {
      let c = line;
      if (block) { if (c.includes('*/')) { block = false; c = c.slice(c.indexOf('*/') + 2); } else return; }
      c = c.replace(/\/\*.*?\*\//g, '');
      if (c.includes('/*')) { block = true; c = c.slice(0, c.indexOf('/*')); }
      c = c.replace(/(^|\s)\/\/.*$/, '$1');
      if (VNC.test(c) && !/diag\.log\(/.test(c)) bad.push(f + ':' + (i + 1) + ' ' + c.trim().slice(0, 80));
    });
  }
  assert.deepEqual(bad, [], 'chuỗi tiếng Việt cứng:\n' + bad.join('\n'));
});

test('I-F1: setLang lặp trên bản sao listeners (listener tự gỡ không làm bỏ sót listener sau; listener bị gỡ giữa chừng không bị gọi)', () => {
  const { I: L } = load();
  const calls = [];
  const offA = L.onLang(() => { calls.push('A'); offA(); });
  L.onLang(() => calls.push('B'));
  let offD;
  L.onLang(() => { calls.push('C'); offD(); });
  offD = L.onLang(() => calls.push('D'));
  L.onLang(() => calls.push('E'));
  L.setLang('en');
  assert.deepEqual(calls, ['A', 'B', 'C', 'E']);
  calls.length = 0;
  L.setLang('vi');
  assert.deepEqual(calls, ['B', 'C', 'E']);
});
