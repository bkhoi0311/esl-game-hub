// Gộp tools/wordbank/parts/part-NN.json -> src/data/wordbank/words.json (PLAN-SOANBAI mục B5, định dạng A2).
// Chạy `check all` trước; có lỗi thì dừng và KHÔNG ghi. Bỏ mục skip:true và check:true. Thất bại nếu > 160 KB thô.
// Dùng: node tools/wordbank/merge.mjs [--parts <thư mục>] [--in <thư mục>] [--out <file>]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { checkAll } from './check.mjs';
import { LEVEL_CODES } from '../../src/core/soanbai/categories.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
const partsDir = opt('--parts', path.join(here, 'parts'));
const inDir = opt('--in', path.join(here, 'in'));
const out = opt('--out', path.join(here, '../../src/data/wordbank/words.json'));
const MAX_RAW = 160 * 1024;

const res = checkAll({ partsDir, inDir });
res.notes.forEach((n) => console.log('Lưu ý  ' + n));
if (res.errors.length) {
  res.errors.forEach((e) => console.error('LỖI    ' + e));
  console.error(`\ncheck all còn ${res.errors.length} lỗi. Không ghi ${out}.`);
  process.exit(1);
}

const kept = res.entries.filter((e) => !e.skip && !e.check);
const dropped = { skip: res.entries.filter((e) => e.skip).length, check: res.entries.filter((e) => !e.skip && e.check).length };
kept.sort((a, b) => (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
const rows = kept.map((e) => [e.word, e.vi, e.pos, e.cat, LEVEL_CODES[e.level] || 'o', e.ex, (e.alt || []).join('|'), e.pl || '']);
const json = { v: 1, cols: ['w', 'vi', 'pos', 'cat', 'lv', 'ex', 'alt', 'pl'], rows };
const text = '{"v":1,"cols":' + JSON.stringify(json.cols) + ',"rows":[\n' + rows.map((r) => JSON.stringify(r)).join(',\n') + '\n]}\n';
const raw = Buffer.byteLength(text);
const gz = zlib.gzipSync(text).length;
console.log(`Tổng ${kept.length} từ (bỏ ${dropped.skip} skip, ${dropped.check} còn check). Thô ${(raw / 1024).toFixed(1)} KB, gzip ${(gz / 1024).toFixed(1)} KB.`);
const count = (f) => kept.reduce((m, e) => { const k = f(e); m[k] = (m[k] || 0) + 1; return m; }, {});
console.log('Theo level:', JSON.stringify(count((e) => e.level)));
console.log('Theo cat:', JSON.stringify(count((e) => e.cat)));
if (raw > MAX_RAW) {
  console.error(`LỖI: ${raw} byte > ${MAX_RAW} byte (160 KB). Không ghi.`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, text);
console.log('Đã ghi ' + path.relative(process.cwd(), out));
