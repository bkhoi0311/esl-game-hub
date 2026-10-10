// Chia seed Cambridge word map thành 12 phần theo ĐÚNG thứ tự khoá (PLAN-SOANBAI mục B1).
// Dùng: node tools/wordbank/split.mjs [đường-dẫn-seed] [--parts 12]
// Ra: tools/wordbank/in/part-01.txt ... part-12.txt, mỗi dòng "word<TAB>emoji".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SEED = '/Users/haku/Desktop/BAO KHOI/CLAUDE/agents/cambridge-word-map.json';
const args = process.argv.slice(2);
const pi = args.indexOf('--parts');
const PARTS = pi >= 0 ? Number(args.splice(pi, 2)[1]) : 12;
const seedPath = args[0] || DEFAULT_SEED;

const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const keys = Object.keys(seed);
// 1161 từ -> 11 phần x 97 + phần cuối 94. Công thức chung: ceil(n/PARTS) cho các phần đầu, phần cuối lấy phần dư.
const size = Math.ceil(keys.length / PARTS);
const inDir = path.join(here, 'in');
fs.mkdirSync(inDir, { recursive: true });
for (const f of fs.readdirSync(inDir)) if (/^part-\d\d\.txt$/.test(f)) fs.unlinkSync(path.join(inDir, f));

let total = 0;
for (let p = 0; p < PARTS; p++) {
  const slice = keys.slice(p * size, p === PARTS - 1 ? undefined : (p + 1) * size);
  const name = `part-${String(p + 1).padStart(2, '0')}.txt`;
  fs.writeFileSync(path.join(inDir, name), slice.map((k) => `${k}\t${seed[k]}`).join('\n') + '\n');
  total += slice.length;
  console.log(`${name}: ${slice.length} từ (${slice[0]} ... ${slice[slice.length - 1]})`);
}
if (total !== keys.length) {
  console.error(`LỖI: chia ${total} / ${keys.length} từ`);
  process.exit(1);
}
console.log(`Xong: ${keys.length} từ chia ${PARTS} phần vào ${inDir}`);
