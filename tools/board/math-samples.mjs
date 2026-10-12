// In 30 đề mẫu mỗi lớp (dạng của chính lớp, đủ 3 độ khó) để giáo viên duyệt. PLAN-V2 bước 5.
// Dùng: node tools/board/math-samples.mjs [tệp ra]   (mặc định: screens/v2-math-samples.txt trong thư mục dự án)
import fs from 'node:fs';
import { generateMath, MATH_TYPES, checkAnswer } from '../../public/board/js/math/gen.js';
import { runsText } from '../../public/board/js/tasks.js';

const out = process.argv[2] || '/Users/haku/Desktop/BAO KHOI/CLAUDE/PROJECTS/bang-nhieu-nguoi-viet/screens/v2-math-samples.txt';
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const SUBS = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
const pretty = (s) => s.replace(/\^(\d+)/g, (m, d) => d.split('').map((c) => SUP[c]).join('')).replace(/_(\d+)/g, (m, d) => d.split('').map((c) => SUBS[c]).join(''));
const DIFF = { 1: 'Dễ', 2: 'Vừa', 3: 'Khó' };
const lines = ['ĐỀ TOÁN MẪU (máy sinh theo luật, mỗi đề đã qua bộ kiểm độc lập). Mỗi lớp 30 câu: dạng của lớp x 3 độ khó.', 'Xin giáo viên xem: đề có đúng chương trình lớp, ký hiệu có quen, độ khó Dễ/Vừa/Khó có hợp lý không.', ''];
let bad = 0;
for (let g = 1; g <= 12; g++) {
  const own = MATH_TYPES[g].filter((t) => !t.review);
  lines.push('=== LỚP ' + g + ' ===');
  const per = Math.ceil(30 / (own.length * 3));
  const rows = [];
  own.forEach((t) => {
    for (let d = 1; d <= 3; d++) {
      generateMath({ grade: g, type: t.type, difficulty: d, count: per, seed: 100 + g * 10 + d }).forEach((task) => {
        if (!checkAnswer(task)) bad++;
        rows.push('[' + t.labelVi + ' | ' + DIFF[d] + '] ' + pretty(runsText(task.prompt).replace(/\s+/g, ' ')) + '   =>   ' + pretty(runsText(task.answer)));
      });
    }
  });
  // lấy đều 30 câu (xen kẽ dạng)
  const pick = [];
  for (let i = 0; pick.length < 30 && i < rows.length * 2; i++) pick.push(rows[(i * 7) % rows.length]);
  const uniq = Array.from(new Set(pick)).slice(0, 30);
  lines.push(...uniq, '');
}
fs.writeFileSync(out, lines.join('\n'));
console.log('Đã ghi ' + out + ' (' + lines.length + ' dòng), câu không qua kiểm: ' + bad);
