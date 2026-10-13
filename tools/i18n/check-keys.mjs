// Kiểm khoá từ điển Hub. `npm run i18n:check` (cũng chạy trong npm test qua tests/i18n-hub.test.mjs).
//  1. mỗi khu vực: tập khoá VI = EN; giá trị không rỗng; số nhiều EN { one, other } đủ hai, VI có {n}.
//  2. tham số {x} của VI = của EN (other); EN one là tập con.
//  3. EN không có chữ Việt (trừ set.lang cố ý song ngữ).
//  4. khoá không trùng giữa khu vực; đúng khu vực theo tiền tố (areas.json).
//  5. khu vực "xong" (không tệp nào còn i18n-todo): khoá không mồ côi (core: chỉ khi mọi khu vực xong).
//  6. mọi literal dạng khoá trong mã (hub.*, set.*, ui.*...) phải có trong từ điển (hoặc common.* / lang.* của lõi).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, AREAS, areaNames, areaOfKey, loadDict, jsFiles, VN } from './lib.mjs';

const P = (s) => [...new Set(String(s).match(/\{(\w+)\}/g) || [])].sort();
const KEY_RE = /(['"`])((?:hub|set|ui|content|voice|cnt|level|ed|sbm|sb|cam|game|duel|guide)\.[\w.]+)\1/g;
const CORE_KEYS = /^(common|lang)\./;

export function areaDone(name) {
  return AREAS[name].files.flatMap(jsFiles).every((f) => !/i18n-todo/.test(fs.readFileSync(f, 'utf8').split('\n', 5).join('\n')));
}

export async function checkKeys() {
  const errs = [];
  const all = {};
  for (const a of areaNames) {
    let vi, en;
    try { vi = await loadDict(a, 'vi'); en = await loadDict(a, 'en'); } catch (e) { errs.push(`${a}: không nạp được từ điển (${e.message})`); continue; }
    const kv = Object.keys(vi), ke = Object.keys(en);
    for (const k of kv) if (!(k in en)) errs.push(`${a}: thiếu EN cho ${k}`);
    for (const k of ke) if (!(k in vi)) errs.push(`${a}: thiếu VI cho ${k}`);
    for (const k of kv) {
      const v = vi[k], e = en[k];
      if (e == null) continue;
      if (typeof v !== 'string' || !v) errs.push(`${a}: VI rỗng/sai kiểu ${k}`);
      if (typeof e === 'object') {
        if (typeof e.one !== 'string' || typeof e.other !== 'string' || !e.one || !e.other) errs.push(`${a}: EN số nhiều thiếu one/other ${k}`);
        if (typeof v === 'string' && !/\{n\}/.test(v)) errs.push(`${a}: khoá số nhiều cần {n} trong VI ${k}`);
        if (!P(e.other).includes('{n}')) errs.push(`${a}: EN other cần {n} ${k}`);
        const pv = P(v), po = P(e.other);
        if (pv.join() !== po.join()) errs.push(`${a}: tham số lệch ${k}: vi=${pv} en=${po}`);
        for (const p of P(e.one)) if (!pv.includes(p)) errs.push(`${a}: EN one có tham số lạ ${p} ở ${k}`);
      } else {
        if (typeof e !== 'string' || !e) errs.push(`${a}: EN rỗng/sai kiểu ${k}`);
        else if (P(v).join() !== P(e).join()) errs.push(`${a}: tham số lệch ${k}: vi=${P(v)} en=${P(e)}`);
      }
      const enText = typeof e === 'object' ? `${e.one} ${e.other}` : String(e);
      if (VN.test(enText) && k !== 'set.lang') errs.push(`${a}: EN còn chữ Việt ${k}`);
      if (all[k]) errs.push(`khoá trùng giữa ${all[k]} và ${a}: ${k}`);
      all[k] = a;
      if (areaOfKey(k) !== a) errs.push(`${a}: khoá ${k} không thuộc tiền tố của khu vực này (thuộc ${areaOfKey(k)})`);
    }
  }
  // nguồn: mọi tệp .js dưới src (trừ từ điển) để dò khoá được dùng
  const srcFiles = jsFiles('src').filter((f) => !/src\/i18n\/strings\//.test(f.split(path.sep).join('/')));
  const used = new Set();
  const usedPrefix = new Set();
  const where = {};
  for (const f of srcFiles) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(KEY_RE)) {
      const k = m[2];
      if (k.endsWith('.')) { usedPrefix.add(k); continue; }
      used.add(k);
      (where[k] ||= []).push(path.relative(ROOT, f));
    }
    for (const m of text.matchAll(/(['"`])((?:hub|set|ui|content|voice|cnt|level|ed|sbm|sb|cam|game|duel|guide)\.(?:\w+\.)*)\1/g)) usedPrefix.add(m[2]);
  }
  for (const k of used) if (!(k in all) && !CORE_KEYS.test(k)) errs.push(`khoá dùng trong mã nhưng không có trong từ điển: ${k} (${[...new Set(where[k])].join(', ')})`);
  const doneAll = areaNames.every(areaDone);
  for (const a of areaNames) {
    // core là khu vực dùng chung (khoá được các khu vực khác dùng): chỉ kiểm mồ côi khi mọi khu vực đã xong.
    if (!areaDone(a) || (a === 'core' && !doneAll)) continue;
    for (const k of Object.keys(await loadDict(a, 'vi'))) {
      if (!used.has(k) && ![...usedPrefix].some((p) => k.startsWith(p))) errs.push(`${a}: khoá mồ côi (không thấy trong mã): ${k}`);
    }
  }
  return { errs, keys: Object.keys(all).length, done: areaNames.filter(areaDone) };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const r = await checkKeys();
  if (r.errs.length) console.log(r.errs.join('\n'));
  console.log(`${r.keys} khoá; ${r.errs.length} lỗi; khu vực đã chuyển xong: ${r.done.join(', ') || '(không)'}`);
  process.exitCode = r.errs.length ? 1 : 0;
}
