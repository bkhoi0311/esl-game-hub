// Phủ từ có nội dung (không function/abstract) của từng cấp bởi các gói trong tools/library/topics/<cấp>.json.
// Dùng: node tools/library/coverage.mjs [--level movers] [--list]   (--list in cả danh sách từ chưa có gói, theo nhãn cat)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBank, lookup } from '../../src/core/soanbai/wordbank.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const only = argv.includes('--level') ? argv[argv.indexOf('--level') + 1] : null;
const bank = buildBank(JSON.parse(fs.readFileSync(path.join(here, '../../src/data/wordbank/words.json'), 'utf8')));
const dir = path.join(here, 'topics');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('.draft.json')).sort() : [];
const byLevel = {};
for (const f of files) {
  const fl = f.replace('.json', '');
  for (const t of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) {
    const lv = t.level || fl;
    (byLevel[lv] = byLevel[lv] || []).push(t);
  }
}
const ORDER = ['starters', 'movers', 'flyers', 'ket', 'pet'];
for (const lv of Object.keys(byLevel).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))) {
  if (only && only !== lv) continue;
  const topics = byLevel[lv];
  const cov = new Set();
  topics.forEach((t) => (t.words || []).forEach((w) => { const e = lookup(bank, w); if (e) cov.add(e.word); }));
  const need = bank.list.filter((e) => e.level === lv && e.cat !== 'function' && e.cat !== 'abstract');
  const miss = need.filter((e) => !cov.has(e.word));
  console.log(`${lv}: ${topics.length} gói, phủ ${need.length - miss.length}/${need.length} = ${((need.length - miss.length) / need.length * 100).toFixed(1)}%`);
  if (argv.includes('--list')) miss.forEach((e) => console.log(`  ${e.word}\t${e.cat}\t${e.pos}\t${e.vi}`));
}
