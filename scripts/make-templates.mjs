// Ghi file mẫu nhập bài ra tests/fixtures/soanbai/ (dùng chung code với nút "Tải file mẫu").
// Chạy: node scripts/make-templates.mjs
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { templateCsv, templateXlsx, TEMPLATE_NAMES } from '../src/core/soanbai/templates.js';
import { readXlsx } from '../src/core/soanbai/xlsx.js';

const out = fileURLToPath(new URL('../tests/fixtures/soanbai/', import.meta.url));
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(out + TEMPLATE_NAMES.vocab, templateCsv('vocab'));
fs.writeFileSync(out + TEMPLATE_NAMES.questions, templateCsv('questions'));
const x = await templateXlsx();
fs.writeFileSync(out + TEMPLATE_NAMES.xlsx, x);
// Vòng kiểm: đọc lại file vừa ghi.
const back = await readXlsx(new Uint8Array(fs.readFileSync(out + TEMPLATE_NAMES.xlsx)));
console.log('Đã ghi 3 file mẫu vào tests/fixtures/soanbai/; xlsx có các trang:', back.map((s) => `${s.name} (${s.rows.length} dòng)`).join(', '));
