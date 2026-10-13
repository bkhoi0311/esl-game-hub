import { t, addStrings } from '../../i18n/index.js';
import VI from '../../i18n/strings/soanbai.vi.js';

addStrings('soanbai', VI);

// File mẫu nhập bài (PLAN-SOANBAI E4). Sinh lúc chạy trong trình duyệt nên dùng được cả bản offline.
export const TEMPLATE_VOCAB = [
  ['word', 'meaning', 'category', 'example'],
  ['banana', 'quả chuối', 'fruit', 'I eat a banana every morning.'], // i18n-keep: dữ liệu mẫu (nghĩa Việt)
  ['carrot', 'cà rốt', 'vegetable', 'Rabbits like carrots.'], // i18n-keep: dữ liệu mẫu (nghĩa Việt)
  ['milk', 'sữa', 'drink', 'I drink milk at breakfast.'], // i18n-keep: dữ liệu mẫu (nghĩa Việt)
];

export const TEMPLATE_QUESTIONS = [
  ['prompt', 'option A', 'option B', 'option C', 'answer (A/B/C)', 'type'],
  ['She ___ rice every day.', 'eats', 'eat', 'eating', 'A', 'grammar'],
  ['What does "banana" mean?', 'quả chuối', 'quả táo', 'quả cam', 'A', 'vocab'], // i18n-keep: dữ liệu mẫu (nghĩa Việt)
  ['They ___ football on Sundays.', 'plays', 'play', 'playing', 'B', 'grammar'],
];

// Trang hướng dẫn theo ngôn ngữ lúc tải file (hàm, không phải hằng).
export function templateGuide() {
  return [t('sb.tplx.title'), t('sb.tplx.s1'), t('sb.tplx.s2'), t('sb.tplx.s3'), t('sb.tplx.s4'), t('sb.tplx.s5')].map((x) => [x]);
}

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
    { name: t('sb.tplx.sheetVocab'), rows: TEMPLATE_VOCAB, widths: [18, 22, 16, 44] },
    { name: t('sb.tplx.sheetQuestions'), rows: TEMPLATE_QUESTIONS, widths: [34, 18, 18, 18, 16, 12] },
    { name: t('sb.tplx.sheetGuide'), rows: templateGuide(), widths: [120] },
  ]);
}
