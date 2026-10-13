// Quét TẤT ĐỊNH chuỗi tiếng Việt có dấu còn trong mã nguồn Hub (src/**/*.js, index.html). `npm run i18n:scan`.
//   node tools/i18n/scan-vi.mjs [đường dẫn...] [--strict] [--json] [--todo]
// Parser oxc (rolldown/parseAst): bỏ chú thích; RegExp chỉ bị báo nếu chứa chữ Việt khác 'đ' (foldText).
// Bỏ qua: src/data, src/assets, src/vendor, src/i18n/strings, tệp "* 2.js" (iCloud);
//         chuỗi trong console.*; dòng/khối có "i18n-keep"; tệp có "i18n-keep-file" ở 5 dòng đầu hoặc trong tools/i18n/keep.json.
// Tệp có "i18n-todo" ở 5 dòng đầu: chưa chuyển xong => liệt kê, KHÔNG tính lỗi (trừ --strict).
// Thêm: báo `t(` gọi ở cấp module (hằng số đóng băng ngôn ngữ), chuỗi không dấu đã biết (Anh-Anh, trang ', Xong, Chim).
// Mã thoát 1 nếu còn lỗi. Cùng đầu vào => cùng kết quả (tệp sắp theo tên).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, VN } from './lib.mjs';

const require = createRequire(path.join(ROOT, 'package.json'));
const { parseAst } = await import(require.resolve('rolldown/parseAst'));
const SKIP_DIRS = new Set(['data', 'assets', 'vendor']);
const NO_DIACRITIC = [/Anh-Anh/, /trang '/, /^Xong$/, /^Chim$/];
const KEEP_FILES = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/i18n/keep.json'), 'utf8')).files;

export async function scan(paths = ['src', 'index.html'], { strict = false } = {}) {
  const findings = [];
  const todo = [];
  const keptFiles = [];
  const files = [];
  const walk = (abs) => {
    if (!fs.existsSync(abs)) return;
    const st = fs.statSync(abs);
    if (st.isFile()) { files.push(abs); return; }
    for (const e of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const p = path.join(abs, e.name);
      if (e.isDirectory()) {
        const rel = path.relative(ROOT, p).split(path.sep).join('/');
        if (SKIP_DIRS.has(e.name) || rel === 'src/i18n/strings') continue;
        walk(p);
      } else if (/\.(js|html)$/.test(e.name) && !/ \d+\.(js|html)$/.test(e.name)) files.push(p);
    }
  };
  paths.forEach((p) => walk(path.resolve(ROOT, p)));
  files.sort();

  for (const f of files) {
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    if (/^src\/i18n\/strings\//.test(rel)) continue;
    const src = fs.readFileSync(f, 'utf8');
    const head = src.split('\n', 5).join('\n');
    if (/i18n-keep-file/.test(head) || KEEP_FILES[rel]) { keptFiles.push(rel); continue; }
    if (/i18n-todo/.test(head)) { todo.push(rel); if (!strict) continue; findings.push({ file: rel, line: 1, kind: 'todo', text: 'còn i18n-todo' }); continue; }
    const lines = src.split('\n');
    const lineOf = (idx) => { let n = 1; for (let i = 0; i < idx; i++) if (src.charCodeAt(i) === 10) n++; return n; };
    const kept = (a, b) => { for (let i = a; i <= b; i++) if (/i18n-keep/.test(lines[i - 1] || '')) return true; return false; };
    if (f.endsWith('.html')) {
      src.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' ')).split('\n').forEach((l, i) => {
        if (VN.test(l) && !/i18n-keep/.test(lines[i])) findings.push({ file: rel, line: i + 1, kind: 'html', text: l.trim().slice(0, 100) });
      });
      continue;
    }
    if (!VN.test(src) && !/\bt\(/.test(src) && !NO_DIACRITIC.some((r) => r.test(src))) continue;
    let ast;
    try { ast = parseAst(src, { sourceType: 'module' }); } catch (e) { findings.push({ file: rel, line: 1, kind: 'parse', text: String(e.message).slice(0, 100) }); continue; }

    const visit = (node, stack) => {
      if (!node || typeof node.type !== 'string') return;
      const inConsole = () => stack.some((s) => s.type === 'CallExpression' && s.callee && s.callee.type === 'MemberExpression' && s.callee.object && s.callee.object.name === 'console');
      const inFunction = () => stack.some((s) => /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(s.type));
      const report = (kind, text) => {
        const a = lineOf(node.start), b = lineOf(node.end);
        if (kept(a, b)) return;
        findings.push({ file: rel, line: a, kind, text: text.replace(/\s+/g, ' ').slice(0, 100) });
      };
      if (node.type === 'Literal' && typeof node.value === 'string' && !node.regex) {
        const isImport = stack.length && /^(ImportDeclaration|ExportAllDeclaration|ExportNamedDeclaration)$/.test(stack[stack.length - 1].type);
        if (!isImport && !inConsole()) {
          if (VN.test(node.value)) report('str', node.value);
          else if (NO_DIACRITIC.some((r) => r.test(node.value))) report('nodia', node.value);
        }
      }
      if (node.type === 'Literal' && node.regex && VN.test(node.regex.pattern.replace(/[đĐ]/g, ''))) report('regex', node.raw);
      if (node.type === 'TemplateLiteral') {
        const parts = node.quasis.map((q) => (q.value.cooked != null ? q.value.cooked : q.value.raw));
        if (!inConsole() && parts.some((p) => VN.test(p))) report('tpl', parts.join('${}'));
      }
      if (node.type === 'CallExpression' && node.callee && node.callee.type === 'Identifier' && node.callee.name === 't' && !inFunction()) {
        report('module-t', 't(...) ở cấp module (phải nằm trong hàm/getter)');
      }
      const next = stack.concat([node]);
      for (const k of Object.keys(node)) {
        if (k === 'type' || k === 'start' || k === 'end') continue;
        const v = node[k];
        if (Array.isArray(v)) v.forEach((c) => c && typeof c === 'object' && visit(c, next));
        else if (v && typeof v === 'object' && typeof v.type === 'string') visit(v, next);
      }
    };
    visit(ast, []);
  }
  return { findings, todo, keptFiles, files: files.length };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const paths = args.filter((a) => !a.startsWith('--'));
  const r = await scan(paths.length ? paths : undefined, { strict: flags.has('--strict') });
  if (flags.has('--json')) console.log(JSON.stringify(r, null, 1));
  else {
    for (const x of r.findings) console.log(`${x.file}:${x.line}\t[${x.kind}] ${JSON.stringify(x.text)}`);
    const byFile = {};
    r.findings.forEach((x) => { byFile[x.file] = (byFile[x.file] || 0) + 1; });
    console.log(`\n${r.findings.length} chuỗi còn sót trong ${Object.keys(byFile).length} tệp (đã quét ${r.files} tệp; giữ có chủ ý: ${r.keptFiles.length} tệp).`);
    if (r.todo.length) console.log(`Chưa chuyển (i18n-todo, bỏ qua): ${r.todo.length} tệp${flags.has('--todo') ? '\n  ' + r.todo.join('\n  ') : ' (thêm --todo để liệt kê)'}`);
  }
  process.exitCode = r.findings.length ? 1 : 0;
}
