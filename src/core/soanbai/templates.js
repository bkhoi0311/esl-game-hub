// File mẫu nhập bài (PLAN-SOANBAI E4). Sinh lúc chạy trong trình duyệt nên dùng được cả bản offline.
export const TEMPLATE_VOCAB = [
  ['word', 'meaning', 'category', 'example'],
  ['banana', 'quả chuối', 'fruit', 'I eat a banana every morning.'],
  ['carrot', 'cà rốt', 'vegetable', 'Rabbits like carrots.'],
  ['milk', 'sữa', 'drink', 'I drink milk at breakfast.'],
];

export const TEMPLATE_QUESTIONS = [
  ['prompt', 'option A', 'option B', 'option C', 'answer (A/B/C)', 'type'],
  ['She ___ rice every day.', 'eats', 'eat', 'eating', 'A', 'grammar'],
  ['What does "banana" mean?', 'quả chuối', 'quả táo', 'quả cam', 'A', 'vocab'],
  ['They ___ football on Sundays.', 'plays', 'play', 'playing', 'B', 'grammar'],
];

export const TEMPLATE_GUIDE = [
  ['Hướng dẫn dùng file mẫu'],
  ['1. Trang "Từ vựng": mỗi dòng 1 từ. Cột word là bắt buộc; meaning, category, example có thể để trống (máy tự điền từ kho nếu bạn bật tuỳ chọn).'],
  ['2. Trang "Câu hỏi": mỗi dòng 1 câu, đủ 3 đáp án A, B, C. Cột answer ghi A, B hoặc C. Dùng ___ cho chỗ trống.'],
  ['3. Giữ nguyên dòng tiêu đề (dòng đầu) của mỗi trang. Tên trang không quan trọng.'],
  ['4. Lưu file dạng .xlsx (hoặc CSV UTF-8) rồi kéo thả vào Soạn bài > Nhập file.'],
  ['5. Chữ cho học sinh (word, prompt, đáp án) nên viết tiếng Anh; nghĩa viết tiếng Việt.'],
];

function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function rowsToCsv(rows) {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// kind: 'vocab' | 'questions'. Có BOM để Excel đọc đúng tiếng Việt.
export function templateCsv(kind) {
  return '﻿' + rowsToCsv(kind === 'questions' ? TEMPLATE_QUESTIONS : TEMPLATE_VOCAB);
}

export const TEMPLATE_NAMES = { xlsx: 'mau-soan-bai.xlsx', vocab: 'mau-tu-vung.csv', questions: 'mau-cau-hoi.csv' };

// Nạp lười xlsx.js. Trả Promise<Uint8Array>.
export async function templateXlsx() {
  const { writeXlsx } = await import('./xlsx.js');
  return writeXlsx([
    { name: 'Từ vựng', rows: TEMPLATE_VOCAB, widths: [18, 22, 16, 44] },
    { name: 'Câu hỏi', rows: TEMPLATE_QUESTIONS, widths: [34, 18, 18, 18, 16, 12] },
    { name: 'Hướng dẫn', rows: TEMPLATE_GUIDE, widths: [120] },
  ]);
}
