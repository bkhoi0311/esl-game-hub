// Đóng gói các gói thư viện (31 gói chung + gói theo cấp) thành module .js tĩnh cho Bảng nhiều người viết (PLAN-V2 mục B.i).
// Bảng có CSP connect-src 'none' nên không fetch được JSON: nạp bằng import() cùng origin.
// Dùng: node tools/board/build-packs.mjs [--src <thư mục library>] [--out <thư mục ra>]
// Kiểm tra sai thì DỪNG (exit 1), không ghi gì.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MAX_MODULE = 12 * 1024;
export const MAX_TOTAL = 900 * 1024;
const HEADER = '// TỰ SINH, KHÔNG SỬA TAY (tools/board/build-packs.mjs)\n';

export function buildPacks({ srcDir, outDir, write = true }) {
  const index = JSON.parse(fs.readFileSync(path.join(srcDir, 'index.json'), 'utf8'));
  const errors = [];
  const files = {};
  const catalog = [];
  for (const it of index) {
    const file = path.join(srcDir, 'packs', it.id + '.json');
    if (!fs.existsSync(file)) { errors.push(it.id + ': thiếu packs/' + it.id + '.json'); continue; }
    const p = JSON.parse(fs.readFileSync(file, 'utf8'));
    const vocab = (p.vocab || []).map((v) => ({ w: String(v.word || ''), m: String(v.meaning || ''), c: String(v.category || '') }));
    const questions = (p.questions || []).map((q) => ({ p: String(q.prompt || ''), o: (q.options || []).map(String), a: q.answer }));
    if (vocab.length < 6) errors.push(it.id + ': vocab < 6 (' + vocab.length + ')');
    questions.forEach((q, i) => {
      if (q.o.length !== 3) errors.push(it.id + ' câu ' + (i + 1) + ': không đủ 3 phương án');
      if (!(q.a === 0 || q.a === 1 || q.a === 2)) errors.push(it.id + ' câu ' + (i + 1) + ': answer ngoài 0..2');
    });
    const mod = { id: it.id, title: it.title, titleVi: it.titleVi, level: it.level, teams: p.teams || [], vocab, questions };
    const text = HEADER + 'export default ' + JSON.stringify(mod) + ';\n';
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes > MAX_MODULE) errors.push(it.id + ': module ' + bytes + ' B > 12 KB');
    files[it.id + '.js'] = text;
    catalog.push({ id: it.id, title: it.title, titleVi: it.titleVi, level: it.level, general: !!it.general, kw: it.kw || '', words: vocab.length, questions: questions.length });
  }
  files['catalog.js'] = HEADER + 'export default ' + JSON.stringify(catalog) + ';\n';
  const total = Object.values(files).reduce((a, t) => a + Buffer.byteLength(t, 'utf8'), 0);
  if (total > MAX_TOTAL) errors.push('tổng ' + total + ' B > 900 KB');
  if (!errors.length && write) {
    fs.mkdirSync(outDir, { recursive: true });
    for (const k of Object.keys(files)) fs.writeFileSync(path.join(outDir, k), files[k]);
  }
  return { errors, files: Object.keys(files), total, count: catalog.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
  const r = buildPacks({
    srcDir: opt('--src', path.join(here, '../../src/data/library')),
    outDir: opt('--out', path.join(here, '../../public/board/packs')),
  });
  if (r.errors.length) { console.error('LỖI:\n - ' + r.errors.join('\n - ')); process.exit(1); }
  console.log('Đã ghi ' + r.files.length + ' tệp (' + r.count + ' gói), tổng ' + (r.total / 1024).toFixed(1) + ' KB');
}
