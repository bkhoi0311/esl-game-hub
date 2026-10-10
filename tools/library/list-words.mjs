// Tra kho runtime để chọn từ cho gói thư viện (PLAN-SOANBAI mục B6).
// Dùng: node tools/library/list-words.mjs [--level movers] [--upto movers] [--cat animal] [--q chữ] [--summary] [--words] [--file <words.json>]
//   --level   đúng cấp đó; --upto  cấp đó và thấp hơn
//   --words   chỉ in từ, cách nhau dấu phẩy (dán thẳng vào topics.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBank } from '../../src/core/soanbai/wordbank.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const flag = (n) => argv.includes(n);
const file = opt('--file') || path.join(here, '../../src/data/wordbank/words.json');
const ORDER = ['starters', 'movers', 'flyers', 'ket', 'other'];

const bank = buildBank(JSON.parse(fs.readFileSync(file, 'utf8')));
let list = bank.list.slice();
const level = opt('--level');
const upto = opt('--upto');
const cat = opt('--cat');
const q = opt('--q');
if (level) list = list.filter((e) => e.level === level);
if (upto) list = list.filter((e) => ORDER.indexOf(e.level) <= ORDER.indexOf(upto));
if (cat) list = list.filter((e) => e.cat === cat);
if (q) list = list.filter((e) => e.word.includes(q) || e.vi.toLowerCase().includes(q.toLowerCase()));

if (flag('--summary')) {
  const by = {};
  list.forEach((e) => { const k = e.cat; by[k] = by[k] || {}; by[k][e.level] = (by[k][e.level] || 0) + 1; });
  Object.keys(by).sort().forEach((k) => console.log(k.padEnd(14), JSON.stringify(by[k])));
  console.log(`Tổng ${list.length}/${bank.size} từ`);
} else if (flag('--words')) {
  console.log(list.map((e) => e.word).join(', '));
} else {
  list.forEach((e) => console.log([e.word, e.vi, e.cat, e.level, e.pos].join('\t')));
  console.error(`(${list.length} từ)`);
}
