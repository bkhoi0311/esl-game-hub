// Sinh các tệp từ điển src/i18n/strings/<khu vực>.{vi,en}.js từ tools/i18n/catalog.json + areas.json.
// Chạy 1 lần ở bước A1 (và chỉ chạy lại với --force vì từ đó sửa TAY, ghi đè sẽ mất sửa đổi).
//   node tools/i18n/gen-dicts.mjs [--force]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, AREAS, areaNames, areaOfKey, dictPath } from './lib.mjs';

const force = process.argv.includes('--force');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/i18n/catalog.json'), 'utf8'));
const vi = Object.fromEntries(areaNames.map((a) => [a, {}]));
const en = Object.fromEntries(areaNames.map((a) => [a, {}]));
const errs = [];
for (const cat of Object.values(catalog.areas)) {
  for (const [k, v] of Object.entries(cat.vi)) {
    const a = areaOfKey(k);
    if (!a) { errs.push('Khoá không thuộc khu vực nào: ' + k); continue; }
    if (vi[a][k] != null) errs.push('Khoá trùng: ' + k);
    vi[a][k] = v;
    en[a][k] = cat.en[k];
  }
}
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }

const q = (s) => JSON.stringify(s);
function render(dict, lang, area) {
  const head = [
    `// Từ điển ${lang === 'vi' ? 'TIẾNG VIỆT' : 'ENGLISH'} khu vực "${area}" (chủ sở hữu: ${AREAS[area].owner}).`,
    `// Sinh từ catalog ngày ${catalog.generated}; TỪ NAY SỬA TAY (đừng chạy lại gen-dicts nếu không có --force).`,
    lang === 'vi'
      ? '// Giá trị VI = chuỗi đang hiển thị trong mã, giữ nguyên từng ký tự. Số nhiều: EN { one, other }, truyền n.'
      : '// Tiếng Anh kiểu Mỹ. Số nhiều: { one, other }. Tham số {x} phải giống bản VI.',
    'export default {',
  ];
  const body = Object.keys(dict).sort().map((k) => {
    const v = dict[k];
    return `  ${q(k)}: ${typeof v === 'object' ? `{ one: ${q(v.one)}, other: ${q(v.other)} }` : q(v)},`;
  });
  return head.concat(body, ['};', '']).join('\n');
}
fs.mkdirSync(path.join(ROOT, 'src/i18n/strings'), { recursive: true });
for (const a of areaNames) {
  for (const [lang, d] of [['vi', vi[a]], ['en', en[a]]]) {
    const f = dictPath(a, lang);
    if (fs.existsSync(f) && !force) { console.log('bỏ qua (đã có):', path.relative(ROOT, f)); continue; }
    fs.writeFileSync(f, render(d, lang, a));
  }
  console.log(a.padEnd(14), Object.keys(vi[a]).length, 'khoá');
}
