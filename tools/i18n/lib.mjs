// Dùng chung cho các script i18n: đọc areas.json, từ điển, tìm khu vực của một khoá.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const AREAS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/i18n/areas.json'), 'utf8'));
delete AREAS._note;
export const areaNames = Object.keys(AREAS);

// Khoá -> tên khu vực (tiền tố dài nhất thắng); null nếu không khu vực nào nhận.
export function areaOfKey(key) {
  let best = null, bestLen = -1;
  for (const [name, a] of Object.entries(AREAS)) {
    for (const p of a.prefixes) {
      const hit = p.endsWith('.') ? key.startsWith(p) : key === p;
      if (hit && p.length > bestLen) { best = name; bestLen = p.length; }
    }
  }
  return best;
}

export const dictPath = (area, lang) => path.join(ROOT, 'src/i18n/strings', `${area}.${lang}.js`);

// Nạp một từ điển (export default {...}).
export async function loadDict(area, lang) {
  const url = pathToFileURL(dictPath(area, lang)).href + '?t=' + Date.now();
  return (await import(url)).default;
}

// Danh sách tệp .js dưới một đường dẫn (tệp hoặc thư mục), bỏ tệp trùng iCloud "* 2.js".
export function jsFiles(p) {
  const abs = path.join(ROOT, p);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return [abs];
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.js$/.test(e.name) && !/ \d+\.js$/.test(e.name)) out.push(f);
    }
  })(abs);
  return out;
}

export const VN = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/iu;
