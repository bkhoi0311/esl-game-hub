// Kiểm tự động các luật CƠ HỌC trên câu hỏi của thư viện (REVIEW-LIBRARY mục c, đợt 4). Không thay cho duyệt tay.
// Dùng:  node tools/library/audit.mjs                 (mọi gói trong src/data/library/packs)
//        node tools/library/audit.mjs --stress 20     (thêm: sinh lại cả 6 loại câu trên mọi gói với 20 seed để đo tỉ lệ của bộ sinh)
//        node tools/library/audit.mjs --packs <thư mục>   (kiểm thư mục gói khác, vd bản cũ)
//        node tools/library/audit.mjs --verbose       (in từng câu vi phạm)   --strict (thoát mã 1 nếu còn vi phạm)
// Trong code: import { auditQuestion, classify, makeAuditEnv } from './audit.mjs'
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildBank, lookupEx } from '../../src/core/soanbai/wordbank.js';
import { generateQuestions, makeRealWordCheck, makeRng, QTYPES } from '../../src/core/soanbai/qgen.js';
import { phraseFor } from '../../src/core/soanbai/categories.js';
import { normKey } from '../../src/core/soanbai/normalize.js';
import {
  KID_UNSAFE, PROPER, closeCat, isGeneric, fillBlacklisted, meaningClash, isGenericWord, synClash, WHICH_CATS, isProper,
} from '../../src/core/soanbai/qrules.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '../..');

export function classify(prompt) {
  const p = String(prompt || '');
  if (p.indexOf('___') >= 0 || p.indexOf('a/an') >= 0) return 'fill';
  if (/^What does "/.test(p)) return 'meaning';
  if (/^Which word means "/.test(p)) return 'word';
  if (/^Which one is /.test(p)) return 'which';
  if (/^Find the missing letter/.test(p)) return 'letter';
  if (/^Which (is the correct spelling|word is spelled correctly)/.test(p)) return 'spell';
  return 'other';
}

export function makeAuditEnv(bank) {
  const byVi = new Map();
  bank.list.forEach((e) => { const k = e.vi.toLowerCase(); if (!byVi.has(k)) byVi.set(k, []); byVi.get(k).push(e); });
  const isReal = makeRealWordCheck([], bank);
  let dict = null;
  try {
    dict = new Set(fs.readFileSync('/usr/share/dict/words', 'utf8').split('\n').filter((w) => /^[a-z]+$/.test(w)));
  } catch (e) { dict = null; }
  return { bank, byVi, isReal, dict };
}

const entry = (env, w) => { const r = lookupEx(env.bank, w); return r ? r.entry : null; };
const firstUpper = (s) => /^[A-Z]/.test(String(s));
const isAllCaps = (s) => String(s).length >= 2 && s === String(s).toUpperCase() && /[A-Z]/.test(s);

// Trả về mảng mã luật bị vi phạm (mảng rỗng = sạch). info: { unknown: số lần thiếu dữ liệu } ghi vào out.info nếu có.
export function auditQuestion(q, env, info) {
  const v = [];
  const type = classify(q.prompt);
  const opts = q.options || [];
  const ans = q.answer;
  const correct = opts[ans];
  const wrongs = opts.filter((_, i) => i !== ans);
  const unk = () => { if (info) info.unknown = (info.unknown || 0) + 1; };
  if (opts.length !== 3 || new Set(opts.map((o) => String(o).trim().toLowerCase())).size !== 3) v.push('A1 phương án trùng/thiếu');
  if (!(ans >= 0 && ans < opts.length)) { v.push('A2 answer ngoài phạm vi'); return v; }
  if (type === 'other') return v;

  if (type === 'fill') {
    const ec = entry(env, correct);
    const ew = wrongs.map((w) => entry(env, w));
    const generic = isGeneric(q.prompt);
    if (!ec) unk();
    ew.forEach((e, i) => {
      if (!e) { unk(); return; }
      if (KID_UNSAFE.has(normKey(e.word))) v.push('F5 nhiễu không hợp với trẻ: ' + wrongs[i]);
      if (ec) {
        if (generic && e.pos && ec.pos && e.pos === ec.pos) v.push('F1 khung chung, nhiễu cùng từ loại: ' + wrongs[i]);
        if (ec.pos === 'adj' && e.pos === 'adj') v.push('F2 đáp án tính từ, nhiễu cũng tính từ: ' + wrongs[i]);
        if (closeCat(e.cat, ec.cat)) v.push(`F3 nhiễu cùng nhóm/láng giềng (${e.cat}~${ec.cat}): ${wrongs[i]}`);
        if (synClash(e.word, ec.word) || ((isGenericWord(normKey(e.word)) || isGenericWord(normKey(ec.word))) && closeCat(e.cat, ec.cat))) v.push('F7 gần nghĩa/từ bao: ' + wrongs[i]);
      }
    });
    // chữ hoa: mọi phương án phải cùng kiểu (hoa đầu / thường / viết tắt), trừ khi ô trống đứng đầu câu (khi đó mọi phương án hoa đầu)
    const caps = opts.map(firstUpper);
    if (new Set(caps).size > 1) v.push('F4 lộ đáp án qua chữ hoa: ' + opts.join(' / '));
    if (new Set(opts.map(isAllCaps)).size > 1) v.push('F4 lộ đáp án qua viết tắt: ' + opts.join(' / '));
    const before = q.prompt.slice(0, q.prompt.indexOf('___')).trim();
    const atStart = !before || /[.!?]["')\]]*$/.test(before);
    if (atStart && !caps.every(Boolean)) v.push('F4 ô trống đầu câu nhưng phương án không hoa đầu');
    if (!atStart && caps[ans]) v.push('F4 đáp án viết hoa giữa câu');
    const filled = q.prompt.replace('___', correct).toLowerCase();
    if (ec && fillBlacklisted(normKey(ec.word), filled)) v.push('F6 cặp (từ, câu) trong danh sách đen');
    const art = q.prompt.indexOf('a/an') < 0 ? /\b(a|an)\s+___/i.exec(q.prompt) : null;
    if (art) {
      const an = art[1].toLowerCase() === 'an';
      wrongs.forEach((o) => { if (/^[aeiou]/i.test(o) !== an) v.push('F8 a/an lộ đáp án: ' + o); });
    }
    return v;
  }

  if (type === 'meaning') {
    const m = /^What does "(.*)" mean\?$/.exec(q.prompt);
    const ec = m ? entry(env, m[1]) : null;
    wrongs.forEach((w) => {
      if (meaningClash(w, correct)) v.push('M1 nghĩa chứa nhau/trùng (sau khi bỏ từ chỉ loại): ' + w);
      const es = env.byVi.get(String(w).toLowerCase()) || [];
      if (!es.length) unk();
      es.forEach((e) => {
        if (KID_UNSAFE.has(normKey(e.word))) v.push('M3 nhiễu không hợp với trẻ: ' + e.word);
        if (ec && (synClash(e.word, ec.word) || ((isGenericWord(normKey(e.word)) || isGenericWord(normKey(ec.word))) && closeCat(e.cat, ec.cat)))) v.push(`M2 gần nghĩa/từ bao: ${ec.word} ~ ${e.word}`);
      });
    });
    if (m && isProper(m[1]) && PROPER[m[1].toLowerCase()] !== m[1]) v.push('M4 danh từ riêng viết thường: ' + m[1]);
    return v;
  }

  if (type === 'word') {
    const m = /^Which word means "(.*)"\?$/.exec(q.prompt);
    const ec = entry(env, correct);
    wrongs.forEach((w) => {
      const e = entry(env, w);
      if (!e) { unk(); return; }
      if (KID_UNSAFE.has(normKey(e.word))) v.push('W3 nhiễu không hợp với trẻ: ' + w);
      if (m && meaningClash(e.vi, m[1])) v.push(`W1 nghĩa nhiễu va nghĩa đề (${e.vi}): ${w}`);
      if (ec && (synClash(e.word, ec.word) || ((isGenericWord(normKey(e.word)) || isGenericWord(normKey(ec.word))) && closeCat(e.cat, ec.cat)))) v.push('W2 gần nghĩa/từ bao: ' + w);
    });
    opts.forEach((o) => { if (isProper(o) && PROPER[o.toLowerCase()] !== o) v.push('W4 danh từ riêng viết thường: ' + o); });
    return v;
  }

  if (type === 'which') {
    const m = /^Which one is (.*)\?$/.exec(q.prompt);
    const ec = entry(env, correct);
    if (!ec) { unk(); return v; }
    if (m && phraseFor(ec.cat) !== m[1]) v.push(`H2 đáp án đúng bị tính sai nhóm: "${correct}" là ${ec.cat}, đề hỏi "${m[1]}"`);
    if (!WHICH_CATS.has(ec.cat)) v.push('H3 nhóm không tự nhiên cho Which one: ' + ec.cat);
    wrongs.forEach((w) => {
      const e = entry(env, w);
      if (!e) { unk(); return; }
      if (closeCat(e.cat, ec.cat)) v.push(`H1 nhiễu cùng nhóm/láng giềng (${e.cat}~${ec.cat}): ${w}`);
      if (!WHICH_CATS.has(e.cat)) v.push('H4 nhiễu thuộc nhóm không tự nhiên: ' + w);
      if (KID_UNSAFE.has(normKey(e.word))) v.push('H5 nhiễu không hợp với trẻ: ' + w);
    });
    opts.forEach((o) => { if (isProper(o) && PROPER[o.toLowerCase()] !== o) v.push('H6 danh từ riêng viết thường: ' + o); });
    return v;
  }

  if (type === 'letter') {
    const m = /: (\S*_\S*)( \(|$)/.exec(q.prompt);
    if (!m) { v.push('L0 không đọc được từ đục chữ'); return v; }
    const formed = opts.map((o) => m[1].replace('_', o));
    if (!entry(env, formed[ans]) || normKey(entry(env, formed[ans]).word) !== formed[ans]) v.push('L2 đáp án đúng không ghép ra từ trong kho: ' + formed[ans]);
    opts.forEach((o, i) => {
      if (i === ans) return;
      if (env.isReal(formed[i])) v.push('L1 nhiễu ghép ra từ tiếng Anh có thật: ' + formed[i]);
      else if (env.dict && env.dict.has(formed[i])) { if (info) info.dictWeak = (info.dictWeak || 0) + 1; }
    });
    if (PROPER[formed[ans]] && PROPER[formed[ans]] === PROPER[formed[ans]].toUpperCase()) v.push('L3 từ viết tắt: ' + formed[ans]);
    return v;
  }

  if (type === 'spell') {
    const e = entry(env, correct);
    if (!e || normKey(e.word) !== correct.toLowerCase()) v.push('S3 đáp án đúng không phải từ trong kho: ' + correct);
    wrongs.forEach((w) => {
      if (env.isReal(w.toLowerCase())) v.push('S1 nhiễu là từ tiếng Anh viết đúng: ' + w);
      else if (env.dict && env.dict.has(w.toLowerCase())) { if (info) info.dictWeak = (info.dictWeak || 0) + 1; }
      if (KID_UNSAFE.has(w.toLowerCase())) v.push('S2 nhiễu không hợp với trẻ: ' + w);
    });
    if (new Set(opts.map(firstUpper)).size > 1) v.push('S4 lộ đáp án qua chữ hoa: ' + opts.join(' / '));
    return v;
  }
  return v;
}

const ACTION_BAN = /\b(crawl|hold hands|shake hands|run to|walk to)\b/i;
const ACTION_PROP = /^(throw|kick|ride|row|open|put on|hold|read|play the|pull on|stir|peel|rock|carry|swing a|brush|roll|fly a|blow out|look at|look through|wave a|cut|pick|type|lock)\b/i;
export function auditActions(list) {
  const v = [];
  list.forEach((a) => {
    if (ACTION_BAN.test(a)) v.push('lệnh bị cấm (bò/leo/chạm bạn/đi đến): ' + a);
    else if (/\bclimb\b/i.test(a) && !/^pretend to\b/i.test(a)) v.push('leo trèo thật: ' + a);
    else if (/\bhug\b/i.test(a) && !/\b(yourself|pretend)\b/i.test(a)) v.push('lệnh ôm người khác: ' + a);
    if (ACTION_PROP.test(a)) v.push('cần đồ vật mà thiếu "Pretend to": ' + a);
    if (/[^\x20-\x7e]/.test(a)) v.push('không phải ASCII: ' + a);
  });
  return v;
}

function tally(table, type, rules) {
  const t = table[type] || (table[type] = { total: 0, bad: 0, rules: {} });
  t.total++;
  if (rules.length) {
    t.bad++;
    const seen = new Set();
    rules.forEach((r) => { const id = r.split(' ')[0]; if (!seen.has(id)) { seen.add(id); t.rules[id] = (t.rules[id] || 0) + 1; } });
  }
}

function printTable(title, table, extra) {
  console.log(title);
  console.log('Loại     | Số câu | Còn vi phạm | Chi tiết (luật: số câu)');
  console.log('---------|--------|-------------|------------------------');
  let tot = 0;
  let bad = 0;
  ['fill', 'meaning', 'word', 'which', 'letter', 'spell', 'other'].forEach((t) => {
    const r = table[t];
    if (!r) return;
    tot += r.total; bad += r.bad;
    const det = Object.keys(r.rules).sort().map((k) => `${k}:${r.rules[k]}`).join(' ') || '-';
    console.log(`${t.padEnd(8)} | ${String(r.total).padStart(6)} | ${String(r.bad).padStart(11)} | ${det}`);
  });
  console.log(`Tổng     | ${String(tot).padStart(6)} | ${String(bad).padStart(11)} |${extra ? ' ' + extra : ''}`);
  return { tot, bad };
}

function main() {
  const argv = process.argv.slice(2);
  const verbose = argv.indexOf('--verbose') >= 0;
  const strict = argv.indexOf('--strict') >= 0;
  const si = argv.indexOf('--stress');
  const stressN = si >= 0 ? Number(argv[si + 1]) || 20 : 0;
  const pi = argv.indexOf('--packs');
  const dir = pi >= 0 ? path.resolve(argv[pi + 1]) : path.join(ROOT, 'src/data/library/packs');
  const bank = buildBank(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/wordbank/words.json'), 'utf8')));
  const env = makeAuditEnv(bank);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const table = {};
  const info = {};
  let actionBad = 0;
  let actionTotal = 0;
  const badPacks = new Set();
  files.forEach((f) => {
    const pack = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    pack.questions.forEach((q, i) => {
      const rules = auditQuestion(q, env, info);
      tally(table, classify(q.prompt), rules);
      if (rules.length) {
        badPacks.add(f);
        if (verbose) console.log(`  ${f.replace('.json', '')}#${i + 1} ${q.prompt} [${q.options.join(' / ')}] -> ${rules.join('; ')}`);
      }
    });
    actionTotal += pack.actionCommands.length;
    auditActions(pack.actionCommands).forEach((m) => { actionBad++; console.log(`  ${f.replace('.json', '')}: ${m}`); });
  });
  const r = printTable(`THƯ VIỆN: ${files.length} gói`, table, `${badPacks.size}/${files.length} gói có câu vi phạm; thiếu dữ liệu tra kho: ${info.unknown || 0}; trùng từ điển web2 (chỉ báo, không tính lỗi): ${info.dictWeak || 0}`);
  console.log(`actionCommands: ${actionTotal} lệnh, ${actionBad} vi phạm`);

  let stressBad = 0;
  if (stressN > 0) {
    const st = {};
    const sinfo = {};
    const samples = {};
    files.forEach((f) => {
      const pack = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      for (let seed = 1; seed <= stressN; seed++) {
        const res = generateQuestions(pack.vocab, { types: QTYPES, count: 40, seed, bank });
        res.questions.forEach((q) => {
          const rules = auditQuestion(q, env, sinfo);
          tally(st, classify(q.prompt), rules);
          if (rules.length) {
            const key = rules[0].split(' ')[0];
            (samples[key] = samples[key] || []).push(`${f.replace('.json', '')} s${seed}: ${q.prompt} [${q.options.join(' / ')}] -> ${rules[0]}`);
          }
        });
      }
    });
    // Bảng trộn nhiều chủ đề (giống giáo viên tự nhập): 24 từ ngẫu nhiên của cả kho, để thử which và fill nhiều nhóm.
    const mixed = bank.list.map((e) => ({ word: e.word, meaning: e.vi, category: e.cat, example: e.ex, image: '' }));
    const mt = {};
    for (let seed = 1; seed <= stressN * 5; seed++) {
      const rng = makeRng(seed * 977);
      const vocab = mixed.map((x) => ({ x, r: rng() })).sort((a, b) => a.r - b.r).slice(0, 24).map((o) => o.x);
      generateQuestions(vocab, { types: QTYPES, count: 40, seed, bank }).questions.forEach((q) => {
        const rules = auditQuestion(q, env, sinfo);
        tally(mt, classify(q.prompt), rules);
        tally(st, classify(q.prompt), rules);
        if (rules.length) { const key = rules[0].split(' ')[0]; (samples[key] = samples[key] || []).push(`mixed s${seed}: ${q.prompt} [${q.options.join(' / ')}] -> ${rules[0]}`); }
      });
    }
    console.log('');
    printTable(`STRESS bảng trộn nhiều chủ đề: ${stressN * 5} bảng x 24 từ ngẫu nhiên`, mt);
    console.log('');
    const s = printTable(`STRESS tổng (gói + bảng trộn): ${stressN} seed x ${files.length} gói, mỗi lượt tối đa 40 câu`, st, `thiếu dữ liệu tra kho: ${sinfo.unknown || 0}`);
    stressBad = s.bad;
    Object.keys(samples).sort().forEach((k) => console.log(`  mẫu ${k} (${samples[k].length}): ${samples[k][0]}`));
  }
  if (strict && (r.bad || actionBad || stressBad)) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
