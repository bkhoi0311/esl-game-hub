// Hạ tầng song ngữ của Hub (PLAN-I18N-HUB F.2): từ điển, khoá, máy quét, API chạy trong Node.
// Chạy: node --test tests/i18n-hub.test.mjs   (nằm trong npm test)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadContent } from '../tools/library/content-node.mjs';
import { checkKeys } from '../tools/i18n/check-keys.mjs';
import { scan } from '../tools/i18n/scan-vi.mjs';
import { AREAS, areaNames, areaOfKey, loadDict, ROOT, VN } from '../tools/i18n/lib.mjs';

test('H1-H5, H8: từ điển đủ vi/en, tham số khớp, không chữ Việt trong EN, khoá đúng khu vực, không mồ côi/thiếu', async () => {
  const r = await checkKeys();
  assert.deepEqual(r.errs, []);
  assert.ok(r.keys >= 517, `chỉ ${r.keys} khoá`);
});

test('catalog: 517 khoá, khớp tools/i18n/catalog.json và areas.json phủ hết khoá', async () => {
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/i18n/catalog.json'), 'utf8'));
  let n = 0;
  for (const c of Object.values(cat.areas)) {
    for (const k of Object.keys(c.vi)) {
      n++;
      assert.ok(areaOfKey(k), `khoá ${k} không thuộc khu vực nào`);
    }
  }
  assert.equal(n, 517);
  assert.equal(Object.keys(cat.categoriesEn).length, 58);
});

test('mỗi khu vực có đúng 1 chủ sở hữu và 1 cặp tệp từ điển; tệp VI giữ nguyên chuỗi của catalog', async () => {
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/i18n/catalog.json'), 'utf8'));
  const viAll = {};
  for (const c of Object.values(cat.areas)) Object.assign(viAll, c.vi);
  for (const a of areaNames) {
    assert.ok(AREAS[a].owner, `${a} thiếu owner`);
    const vi = await loadDict(a, 'vi');
    for (const [k, v] of Object.entries(vi)) if (k in viAll) assert.equal(v, viAll[k], `VI ${k} đã đổi so với catalog (cố ý? cập nhật catalog)`);
  }
});

test('H6: các tệp đã chuyển xong (không còn i18n-todo) không còn chuỗi Việt; không t() ở cấp module', async () => {
  const r = await scan();
  assert.deepEqual(r.findings, []);
  // ui.js, content.js, games/index.js (core nền) phải đã sạch và KHÔNG ở diện i18n-todo
  for (const f of ['src/core/ui.js', 'src/core/content.js', 'src/games/index.js', 'src/core/audio.js']) {
    assert.ok(!r.todo.includes(f), f + ' còn i18n-todo');
  }
});

test('máy quét bắt được chuỗi Việt, template, RegExp và t() cấp module (tệp mẫu)', async () => {
  const dir = path.join(ROOT, 'tests/.i18n-scan-tmp');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'sample.js');
  fs.writeFileSync(f, [
    "import { t } from '../../src/i18n/index.js';",
    "const A = 'Xin chào';",            // 2: chuỗi Việt
    "const B = `Có ${1} lỗi`;",          // 3: template
    "const C = /^Từ vựng/;",             // 4: RegExp
    "const D = t('ui.ok');",             // 5: t() cấp module
    "const E = 'Được phép'; // i18n-keep: thử",   // 6: bỏ qua
    "console.log('Nhật ký');",           // 7: bỏ qua (console)
    "export const f = () => t('ui.ok');", // 8: hợp lệ
    "const F = 'Anh-Anh (en-GB)';",      // 9: không dấu đã biết
  ].join('\n'));
  try {
    const r = await scan([path.relative(ROOT, dir)]);
    const lines = r.findings.map((x) => `${x.line}:${x.kind}`);
    assert.deepEqual(lines, ['2:str', '3:tpl', '4:regex', '5:module-t', '9:nodia']);
    fs.writeFileSync(f, '// i18n-todo: thử\n' + fs.readFileSync(f, 'utf8'));
    assert.equal((await scan([path.relative(ROOT, dir)])).findings.length, 0, 'i18n-todo thì bỏ qua');
    assert.ok((await scan([path.relative(ROOT, dir)], { strict: true })).findings.length > 0, '--strict báo i18n-todo');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('H9: không có window thì t() trả chuỗi Việt (content.js, ui key, tham số, số nhiều)', async () => {
  assert.equal(typeof window, 'undefined');
  const { t, tIn, lang, addStrings } = await import('../src/i18n/index.js');
  const content = await loadContent(); // content.js import JSON không có attribute: nạp qua tools/library/content-node.mjs
  assert.equal(lang(), 'vi');
  assert.equal(t('content.err.noWord', { row: 'X' }), 'X: thiếu từ (word).');
  assert.equal(tIn('en', 'ui.ok'), 'Đồng ý'); // Node chỉ có VI
  assert.equal(t('khong.ton.tai'), 'khong.ton.tai');
  assert.equal(t('common.close'), 'Đóng');
  addStrings('test', { 'x.plural': '{n} cái' });
  assert.equal(t('x.plural', { n: 3 }), '3 cái');
  // validatePack giữ nguyên văn Việt và trả errorRows song song với errors
  const pack = { title: '', vocab: [{ word: '', meaning: '', category: '' }, { word: 'cat', meaning: '', category: '' }], questions: [{ prompt: '', options: ['a', '', ''], answer: 1 }], teams: ['A'] };
  const r = content.validatePack(pack);
  assert.deepEqual(r.errors, [
    'Từ vựng dòng 1: thiếu từ (word).',
    'Câu hỏi 1: thiếu nội dung câu hỏi.',
    'Câu hỏi 1: cần đủ 3 đáp án.',
    'Câu hỏi 1: đáp án đúng đang trống.',
    'Cần ít nhất 2 đội.',
  ]);
  assert.deepEqual(r.errorRows, ['vocab', 'question', 'question', 'question', 'pack']);
  assert.deepEqual(r.warnings, ['Chưa đặt tên bài.', 'Từ vựng dòng 2 ("cat"): thiếu nghĩa.', 'Từ vựng dòng 2 ("cat"): thiếu nhóm (category).']);
  const miss = content.missingForGame({ minItems: { vocab: 6, questions: 6, actionCommands: 4 } }, { vocab: [], questions: [], actionCommands: [] });
  assert.deepEqual(miss, [
    'Cần ít nhất 6 từ vựng (hiện có 0).',
    'Cần ít nhất 6 câu hỏi (hiện có 0). Có thể nhập câu hỏi, hoặc thêm từ vựng có nghĩa để tự sinh câu hỏi.',
    'Cần ít nhất 4 lệnh hành động (hiện có 0).',
  ]);
});

test('lõi i18n (dùng chung với màn chọn/bảng) vẫn là nguồn duy nhất: virtual:i18n-core đọc public/i18n/i18n.js', () => {
  const cfg = fs.readFileSync(path.join(ROOT, 'vite.config.js'), 'utf8');
  assert.match(cfg, /virtual:i18n-core/);
  assert.match(cfg, /public\/i18n\/i18n\.js/);
  assert.ok(!fs.existsSync(path.join(ROOT, 'src/i18n/i18n.js')), 'không được nhân đôi lõi vào src/');
  assert.match(fs.readFileSync(path.join(ROOT, 'src/i18n/boot.js'), 'utf8'), /import 'virtual:i18n-core'/);
});

test('EN chỉ nạp lười: en-main.js gộp đủ mọi khu vực chunk main và bundle chính không import .en.js tĩnh', () => {
  const enMain = fs.readFileSync(path.join(ROOT, 'src/i18n/en-main.js'), 'utf8');
  for (const a of areaNames) {
    if (AREAS[a].chunk === 'main') assert.ok(enMain.includes(`./strings/${a}.en.js`), `en-main thiếu ${a}`);
    else assert.ok(!enMain.includes(`./strings/${a}.en.js`), `${a} phải là chunk riêng`);
  }
  const files = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.js$/.test(e.name) && !/ \d+\.js$/.test(e.name)) files.push(p); } })(path.join(ROOT, 'src'));
  for (const f of files) {
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    if (rel === 'src/i18n/en-main.js') continue;
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(!/^\s*import\s[^;]*\.en\.js['"]/m.test(src), `${rel} import tĩnh từ điển EN (phải qua ensureEn/en-main)`);
  }
});

test('VI của các khu vực không chứa nhầm chữ Anh thay cho Việt ở khoá lõi quan trọng', async () => {
  const core = await loadDict('core', 'vi');
  assert.equal(core['ui.startGame'], 'Bắt đầu chơi');
  assert.equal(core['ui.cancel'], 'Hủy');
  assert.ok(VN.test(core['ui.ok']));
});

test('H7: CATEGORIES mọi mục có en (không dấu Việt) và catLabel trả VI khi không có window', async () => {
  const { CATEGORIES, catLabel } = await import('../src/core/soanbai/categories.js');
  const keys = Object.keys(CATEGORIES);
  assert.equal(keys.length, 58);
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/i18n/catalog.json'), 'utf8'));
  for (const k of keys) {
    assert.ok(CATEGORIES[k].en && !VN.test(CATEGORIES[k].en), `${k}.en`);
    assert.equal(CATEGORIES[k].en, cat.categoriesEn[k], `${k}.en khớp catalog`);
    assert.equal(catLabel(k), CATEGORIES[k].vi);
  }
  assert.equal(catLabel('My Own Group'), 'My Own Group');
});
