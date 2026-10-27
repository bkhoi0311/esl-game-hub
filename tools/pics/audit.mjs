// img = hình rõ, hint = hình kèm câu gợi ý đục lỗ, cloze = chỉ câu đục lỗ.
// Rà hình cho từ vựng + câu hỏi học sinh thấy (không còn tiếng Việt) trên MỌI gói thư viện và kho từ.
// Dùng: node tools/pics/audit.mjs [--list]   (--list in các từ chưa có hình thật)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '../..');
const PICS = JSON.parse(fs.readFileSync(path.join(root, 'src/data/pics.json'), 'utf8'));

// Nạp src/core/pics.js trong Node: thay import Vite (JSON, ui.js, content.js) bằng giá trị thay thế.
const src = fs.readFileSync(path.join(root, 'src/core/pics.js'), 'utf8')
  .replace(/^import PICS from .*$/m, `const PICS = ${JSON.stringify(PICS)};`)
  .replace(/^import \{ h \} from .*$/m, 'const h = () => null;')
  .replace(/^import \{ getQuestions \} from .*$/m, 'const getQuestions = (p) => p.questions;')
  .replace('import.meta.env.BASE_URL', "'/'");
const pics = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

const idx = JSON.parse(fs.readFileSync(path.join(root, 'src/data/library/index.json'), 'utf8'));
const LEVELS = ['starters', 'movers', 'flyers', 'ket', 'pet'];
const stat = {};
const noPic = {};
let bad = 0;
for (const p of idx) {
  const pack = JSON.parse(fs.readFileSync(path.join(root, 'src/data/library/packs', `${p.id}.json`), 'utf8'));
  const lv = LEVELS.includes(p.level) ? p.level : 'chung';
  const s = (stat[lv] ||= { packs: 0, words: 0, img: 0, hint: 0, digits: 0, cloze: 0, none: 0, q: 0, qPic: 0, qDrop: 0 });
  s.packs++;
  pack.vocab.forEach((v) => {
    s.words++;
    const pic = pics.picOf(v);
    s[pic ? (pic.hint ? 'hint' : pic.type) : 'none']++;
    if (!pics.isPicture(pic)) (noPic[lv] ||= new Set()).add(v.word);
  });
  pack.questions.forEach((q) => {
    s.q++;
    const out = pics.studentQuestion(q, pack.vocab);
    if (!out) { s.qDrop++; return; }
    if (out.pic) s.qPic++;
    // Từ mượn (café, yoga, rap): nghĩa trùng chữ tiếng Anh của chính từ trong bài -> không tính là tiếng Việt.
    const lc = (x) => String(x).toLowerCase();
    const isEn = (x) => pack.vocab.some((v) => lc(v.word) === lc(x)) || out.prompt.includes(x);
    const texts = [out.prompt, ...out.options].filter((x) => !isEn(x) || x === out.prompt);
    const vi = (x) => (x === out.prompt ? pics.hasVietnamese(x.replace(/\b(café|cafés)\b/gi, '')) : pics.hasVietnamese(x) || pack.vocab.some((v) => v.meaning && lc(v.meaning) === lc(x)));
    if (texts.some(vi)) {
      bad++;
      console.log('CÒN TIẾNG VIỆT', p.id, JSON.stringify(out));
    }
  });
}

// Kho từ: Starters -> PET
const bank = JSON.parse(fs.readFileSync(path.join(root, 'src/data/wordbank/words.json'), 'utf8'));
const LV = { s: 'starters', m: 'movers', f: 'flyers', k: 'ket', p: 'pet' };
const bankStat = {};
for (const r of bank.rows) {
  const lv = LV[r[4]];
  if (!lv) continue;
  const s = (bankStat[lv] ||= { words: 0, img: 0, hint: 0, digits: 0, cloze: 0, none: 0 });
  s.words++;
  const pic = pics.picOf({ word: r[0], example: r[5] });
  s[pic ? (pic.hint ? 'hint' : pic.type) : 'none']++;
}

console.log('\nGói thư viện (từ trong gói + câu hỏi):');
console.table(stat);
console.log('Kho từ Starters -> PET:');
console.table(bankStat);
if (process.argv.includes('--list')) for (const [lv, set] of Object.entries(noPic)) console.log(`\n${lv} (câu đục lỗ / không hình): ${[...set].join(', ')}`);
console.log(bad ? `\nFAIL: ${bad} câu còn tiếng Việt` : '\nOK: học sinh không thấy tiếng Việt trong câu hỏi nào');
process.exit(bad ? 1 : 0);
