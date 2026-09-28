// Liệt kê câu cần thu âm cho 1 bộ nội dung -> tools/voices/texts.json
// Chạy: node tools/voices/texts.mjs [đường-dẫn-bài.json]   (mặc định: bài mẫu Food A2)
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VOICES, clipKey, textsByVoice } from '../../src/core/voice-lines.js';

const packPath = resolve(process.argv[2] || 'src/data/sample-food-a2.json');
const pack = JSON.parse(readFileSync(packPath, 'utf8'));
const byVoice = textsByVoice(pack);
const jobs = [];
for (const [voice, texts] of Object.entries(byVoice)) texts.forEach((text) => jobs.push({ voice, key: clipKey(text), text }));
writeFileSync(resolve('tools/voices/texts.json'), JSON.stringify({ pack: packPath, voices: VOICES, jobs }, null, 1));
const summary = Object.entries(byVoice).map(([v, t]) => `${v}:${t.length}`).join(' ');
console.log(`${jobs.length} file (${summary}) -> tools/voices/texts.json`);
