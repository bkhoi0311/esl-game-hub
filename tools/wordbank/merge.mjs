// Gộp tools/wordbank/parts/{part,new}-NN.json -> src/data/wordbank/words.json (PLAN-SOANBAI B5, PLAN-LEVELS 3.3, 4).
// Chạy `check all` trước; có lỗi thì dừng và KHÔNG ghi. Bỏ mục skip:true và check:true.
// Kho là MỘT tệp nạp lười, dạng cột (v:1, cols/rows). Thất bại nếu > 420 KB thô hoặc > 120 KB gzip.
// Sinh thêm: src/core/soanbai/proper-gen.js (danh từ riêng từ cột display) và tools/wordbank/levels-lock.json ({word: mã cấp}, gitignore).
// Dùng: node tools/wordbank/merge.mjs [--parts <thư mục>] [--in <thư mục>] [--out <file>] [--proper <file>] [--lock <file>] [--no-env]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { checkAll } from './check.mjs';
import { matchWord } from './levels/relevel.mjs';
import { LEVEL_CODES } from '../../src/core/soanbai/categories.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
const partsDir = opt('--parts', path.join(here, 'parts'));
const inDir = opt('--in', path.join(here, 'in'));
const out = opt('--out', path.join(here, '../../src/data/wordbank/words.json'));
const properOut = opt('--proper', path.join(here, '../../src/core/soanbai/proper-gen.js'));
const lockOut = opt('--lock', path.join(here, 'levels-lock.json'));
const MAX_RAW = 420 * 1024;
const MAX_GZ = 120 * 1024;

const res = checkAll({ partsDir, inDir, env: argv.includes('--no-env') ? null : undefined });
res.notes.forEach((n) => console.log('Lưu ý  ' + n));
if (res.errors.length) {
  res.errors.forEach((e) => console.error('LỖI    ' + e));
  console.error(`\ncheck all còn ${res.errors.length} lỗi. Không ghi ${out}.`);
  process.exit(1);
}

const kept = res.entries.filter((e) => !e.skip && !e.check);
const dropped = { skip: res.entries.filter((e) => e.skip).length, check: res.entries.filter((e) => !e.skip && e.check).length };
kept.sort((a, b) => (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
const rows = kept.map((e) => [e.word, e.vi, e.pos, e.cat, LEVEL_CODES[e.level] || 'o', e.ex, (e.alt || []).join('|'), e.pl || '', e.display || '']);
const json = { v: 1, cols: ['w', 'vi', 'pos', 'cat', 'lv', 'ex', 'alt', 'pl', 'd'], rows };
const text = '{"v":1,"cols":' + JSON.stringify(json.cols) + ',"rows":[\n' + rows.map((r) => JSON.stringify(r)).join(',\n') + '\n]}\n';
const raw = Buffer.byteLength(text);
const gz = zlib.gzipSync(text).length;
console.log(`Tổng ${kept.length} từ (bỏ ${dropped.skip} skip, ${dropped.check} còn check). Thô ${(raw / 1024).toFixed(1)} KB, gzip ${(gz / 1024).toFixed(1)} KB.`);
const count = (f) => kept.reduce((m, e) => { const k = f(e); m[k] = (m[k] || 0) + 1; return m; }, {});
console.log('Theo level:', JSON.stringify(count((e) => e.level)));
console.log('Theo cat:', JSON.stringify(count((e) => e.cat)));
const fail = [];
if (raw > MAX_RAW) fail.push(`${raw} byte thô > ${MAX_RAW} byte (420 KB)`);
if (gz > MAX_GZ) fail.push(`${gz} byte gzip > ${MAX_GZ} byte (120 KB). Phương án B trong PLAN-LEVELS 4.2: tách words-core / words-ext`);
if (fail.length) {
  console.error('LỖI: ' + fail.join('; ') + '. Không ghi.');
  process.exit(1);
}
// Phủ theo cấp: số lemma của danh sách đã có mục trong kho / tổng lemma của cấp.
const env = res.env;
if (env && env.idx) {
  const lemmas = [...env.idx.exact.values()].filter((l, i, a) => a.indexOf(l) === i);
  const total = {};
  const covered = {};
  lemmas.forEach((l) => { total[l.level] = (total[l.level] || 0) + 1; });
  const have = new Set();
  kept.forEach((e) => { const m = matchWord(e, env.idx); if (m) have.add(m.lemma.word); });
  lemmas.forEach((l) => { if (have.has(l.word)) covered[l.level] = (covered[l.level] || 0) + 1; });
  console.log('Phủ danh sách theo cấp:', Object.keys(total).map((k) => `${k} ${covered[k] || 0}/${total[k]}`).join(', '));
}
// Danh từ riêng tự sinh (cột display) và khóa cấp.
const gen = {};
kept.forEach((e) => { if (e.display) gen[e.word] = e.display; });
fs.writeFileSync(properOut, '// TỰ SINH bởi tools/wordbank/merge.mjs từ cột display của kho. KHÔNG sửa tay.\nexport const PROPER_GEN = ' + JSON.stringify(gen, null, 2) + ';\n');
const lock = {};
kept.forEach((e) => { if (e.level && e.level !== 'other') lock[e.word] = LEVEL_CODES[e.level]; });
fs.writeFileSync(lockOut, JSON.stringify(lock) + '\n');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, text);
console.log('Đã ghi ' + path.relative(process.cwd(), out));
