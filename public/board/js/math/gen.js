// Toán sinh bằng luật (không AI), lớp 1-12. PLAN-V2 mục B.iii. THUẦN, không DOM.
//   generateMath({ grade, type, difficulty, count, seed, lang, options }) -> Task[] (có cờ .short khi không đủ câu khác nhau)
//   MATH_TYPES[grade] -> [{ type, labelVi, home, review }]
//   checkAnswer(task) -> boolean: bộ kiểm độc lập, tính lại từ CHUỖI ĐỀ (hoặc từ tham số) bằng cách khác lúc sinh.
//   boundOf(type, grade, d) -> số lớn nhất được phép xuất hiện trong đề.
// Sinh ngược: chọn đáp án trước rồi dựng đề. Câu nào không qua checkAnswer thì bỏ và sinh lại (tối đa 50 lần mỗi câu).
import { makeRng, runsText as plain } from '../tasks.js';
import * as Q from './rational.js';
import { exprText, evalExpr, nums, near, COMPLEX, MINUS } from './expr.js';

/* ---------------- tiện ích ---------------- */
const T = (v) => ({ t: 'text', v: String(v) });
const Vr = (v) => ({ t: 'var', v });
const asRuns = (x) => (Array.isArray(x) ? x : [typeof x === 'object' ? x : T(x)]);
const F = (n, d) => ({ t: 'frac', n: asRuns(n), d: asRuns(d) });
const SUP = (b, e) => ({ t: 'sup', b: asRuns(b), e: asRuns(e) });
const SUB = (v) => ({ t: 'sub', v: String(v) });
const SQ = (v) => ({ t: 'sqrt', v: asRuns(v) });
const BL = { t: 'blank' };
const sg = (n) => (n < 0 ? MINUS + (-n) : String(n));
const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const pick = (r, a) => a[Math.floor(r() * a.length)];
const sgn = (r) => (r() < 0.5 ? -1 : 1);
const gcdI = Q.gcd;

const LX = {
  vi: { calc: 'Tính:', compare: 'So sánh:', findx: 'Tìm x:', calcRem: 'Tính (có dư):', fillSeq: 'Tìm số còn thiếu:', solve: 'Giải phương trình:', solveIneq: 'Giải bất phương trình:',
    solveSys: 'Giải hệ:', and: ' và ', or: ' hoặc ', dbl: ' (nghiệm kép)', none: 'Vô nghiệm', of: ' của ', rem: ' dư ', gcd: 'Tìm ƯCLN', lcm: 'Tìm BCNN', simplify: 'Thu gọn:', expand: 'Khai triển:',
    derive: 'Tính đạo hàm:', integ: 'Tính:', plotPt: 'Vẽ điểm', plotLine: 'Vẽ đồ thị', quadrant: 'Góc phần tư ', onOx: 'Trên trục Ox', onOy: 'Trên trục Oy', origin: 'Gốc toạ độ',
    through: 'Đi qua', cutOy: 'Cắt Oy tại', cutOx: 'cắt Ox tại', given: 'Cho', compute: 'Tính', findm: 'Tìm m để', perp: 'vuông góc', sol: 'Giải:', ar: 'Cấp số cộng có', geo: 'Cấp số nhân có', sumFirst: 'Tính tổng', terms: 'số hạng đầu',
    ofPt: 'và cho biết góc phần tư.', unitsEq: 'Đổi:', solveEq: 'Giải:' },
  en: { calc: 'Calculate:', compare: 'Compare:', findx: 'Find x:', calcRem: 'Calculate (with remainder):', fillSeq: 'Find the missing number:', solve: 'Solve:', solveIneq: 'Solve the inequality:',
    solveSys: 'Solve the system:', and: ' and ', or: ' or ', dbl: ' (double root)', none: 'No real solution', of: ' of ', rem: ' r ', gcd: 'Find GCD', lcm: 'Find LCM', simplify: 'Simplify:', expand: 'Expand:',
    derive: 'Differentiate:', integ: 'Evaluate:', plotPt: 'Plot point', plotLine: 'Graph', quadrant: 'Quadrant ', onOx: 'On the x-axis', onOy: 'On the y-axis', origin: 'The origin',
    through: 'Passes through', cutOy: 'Meets y-axis at', cutOx: 'meets x-axis at', given: 'Given', compute: 'Compute', findm: 'Find m so that', perp: 'perpendicular', sol: 'Solve:', ar: 'Arithmetic sequence with', geo: 'Geometric sequence with', sumFirst: 'Find the sum of the first', terms: 'terms',
    ofPt: 'and state its quadrant.', unitsEq: 'Convert:', solveEq: 'Solve:' },
};

function decStr(v, places, lang) {      // v: số nguyên theo bậc 10^-places
  const neg = v < 0; v = Math.abs(v);
  const s = String(v).padStart(places + 1, '0');
  let i = s.slice(0, s.length - places), f = s.slice(s.length - places).replace(/0+$/, '');
  return (neg ? MINUS : '') + i + (f ? (lang === 'en' ? '.' : ',') + f : '');
}

// poly: [{c, p}] -> Run[]; v: tên biến
function polyRuns(terms, v) {
  v = v || 'x';
  const out = [];
  terms.forEach((t, i) => {
    const a = Math.abs(t.c);
    if (i === 0) { if (t.c < 0) out.push(T(MINUS)); } else out.push(T(t.c < 0 ? ' ' + MINUS + ' ' : ' + '));
    if (t.p === 0) { out.push(T(a)); return; }
    if (a !== 1) out.push(T(a));
    if (t.p === 1) out.push(Vr(v)); else out.push(SUP([Vr(v)], [T(t.p)]));
  });
  return out;
}
function normPoly(terms) {
  const m = {};
  terms.forEach((t) => { m[t.p] = (m[t.p] || 0) + t.c; });
  const out = Object.keys(m).map(Number).sort((a, b) => b - a).filter((p) => m[p] !== 0).map((p) => ({ c: m[p], p }));
  return out.length ? out : [{ c: 0, p: 0 }];
}
const evalPoly = (terms, x) => terms.reduce((s, t) => s + t.c * Math.pow(x, t.p), 0);

const textOf = (task) => plain(task.prompt);
function afterColon(s) { const i = s.indexOf(':'); return i >= 0 ? s.slice(i + 1).trim() : s.trim(); }
const exprOf = (task) => afterColon(exprText(task.prompt));
const mm = (s) => String(s).replace(/−/g, '-');
const ansNums = (task) => nums(plain(task.answer));
const reducedOk = (task) => { const m = /(\d+)\/(\d+)/.exec(plain(task.answer)); return !m || (gcdI(+m[1], +m[2]) === 1 && +m[2] > 0); };

function arith(L, exprRuns, value, args, extra) {
  const e = typeof exprRuns === 'string' ? [T(exprRuns)] : exprRuns;
  return Object.assign({ prompt: [T(L.calc + ' ')].concat(e, [T(' = ?')]), answer: [T(sg(value))], args, value, vkind: 'int' }, extra || {});
}
function arithVerify(task) {
  const e = exprOf(task).replace(/=\s*\?$/, '').trim();
  const v = evalExpr(e);
  const a = ansNums(task);
  return a.length === 1 && isFinite(v) && near(v, a[0]);
}
const hasCarry = (a, b) => { let c = 0; while (a > 0 || b > 0 || c) { const s = (a % 10) + (b % 10) + c; if (s >= 10) return true; c = 0; a = Math.floor(a / 10); b = Math.floor(b / 10); if (!a && !b) break; } return false; };
const hasBorrow = (a, b) => { let br = 0; while (a > 0 || b > 0) { const da = a % 10, db = (b % 10) + br; if (da < db) return true; br = 0; a = Math.floor(a / 10); b = Math.floor(b / 10); } return false; };

/* ---------------- đăng ký các dạng ---------------- */
const TYPES = {};
const def = (type, o) => { TYPES[type] = Object.assign({ type }, o); };

// ----- lớp 1-3 -----
def('add', {
  label: 'Phép cộng', S: { 1: { max: [10, 20, 100], carry: ['no', 'no', 'no'] }, 2: { max: [50, 100, 100], carry: ['any', 'any', 'yes'] }, 3: { max: [300, 1000, 1000], carry: ['any', 'any', 'yes'] } },
  bound: (s, d) => s.max[d - 1],
  gen({ r, d, s, L }) {
    const max = s.max[d - 1], mode = s.carry[d - 1];
    let a, b;
    for (let i = 0; i < 300; i++) { a = ri(r, 1, max - 1); b = ri(r, 1, max - a); const c = hasCarry(a, b); if (mode === 'any' || (mode === 'no' && !c) || (mode === 'yes' && c)) break; }
    return arith(L, a + ' + ' + b, a + b, { a, b }, { near: [a + b - 10, a + b + 10, a + b - 1, a + b + 1] });
  },
  verify: arithVerify,
});
def('sub', {
  label: 'Phép trừ', S: { 1: { max: [10, 20, 100], carry: ['no', 'no', 'no'] }, 2: { max: [50, 100, 100], carry: ['any', 'any', 'yes'] }, 3: { max: [300, 1000, 1000], carry: ['any', 'any', 'yes'] } },
  bound: (s, d) => s.max[d - 1],
  gen({ r, d, s, L }) {
    const max = s.max[d - 1], mode = s.carry[d - 1];
    let a, b;
    for (let i = 0; i < 300; i++) { a = ri(r, 2, max); b = ri(r, 1, a); const c = hasBorrow(a, b); if (mode === 'any' || (mode === 'no' && !c) || (mode === 'yes' && c)) break; }
    return arith(L, a + ' ' + MINUS + ' ' + b, a - b, { a, b }, { near: [a - b + 10, a - b - 10, a - b + 1, a - b - 1] });
  },
  verify: arithVerify,
});
def('compare', {
  label: 'So sánh số', S: { 1: { max: [10, 20, 100] } }, bound: (s, d) => s.max[d - 1],
  gen({ r, d, s, L }) {
    const max = s.max[d - 1];
    const a = ri(r, 0, max); const b = r() < 0.15 ? a : ri(r, 0, max);
    return { prompt: [T(L.compare + ' '), T(a + ' '), BL, T(' ' + b)], answer: [T(a < b ? '<' : a > b ? '>' : '=')], args: { a, b }, value: a < b ? '<' : a > b ? '>' : '=', vkind: 'sym' };
  },
  verify(task) {
    const m = /(\d+)\s*\?\s*(\d+)/.exec(afterColon(textOf(task)));
    if (!m) return false;
    const a = +m[1], b = +m[2];
    return plain(task.answer) === (a < b ? '<' : a > b ? '>' : '=');
  },
});
def('mul-table', {
  label: 'Bảng nhân 2 và 5', S: { 2: { tables: [[2], [2, 5], [2, 5]], mmax: [5, 10, 10] } }, bound: (s, d) => [10, 10, 50][d - 1],
  gen({ r, d, s, L }) {
    const t = pick(r, s.tables[d - 1]), m = ri(r, 1, s.mmax[d - 1]);
    if (d === 3 && r() < 0.5) return { prompt: [T(L.calc + ' '), T(t + ' × '), BL, T(' = ' + t * m)], answer: [T(String(m))], args: { t, m, missing: true }, value: m, vkind: 'int' };
    const flip = d >= 2 && r() < 0.5;
    return arith(L, flip ? m + ' × ' + t : t + ' × ' + m, t * m, { t, m }, { near: [t * m + t, t * m - t, t * m + 1, t * m - 1] });
  },
  verify(task) {
    const e = exprOf(task);
    const mm2 = /^(\d+)\s*×\s*\?\s*=\s*(\d+)$/.exec(e);
    if (mm2) { const a = ansNums(task); return a.length === 1 && +mm2[1] * a[0] === +mm2[2]; }
    return arithVerify(task);
  },
});
def('seq', {
  label: 'Dãy số cách đều', S: { 2: { steps: [[2], [5], [2, 5, 10]] } }, bound: (s, d) => [20, 70, 100][d - 1],
  gen({ r, d, s, L }) {
    const step = pick(r, s.steps[d - 1]);
    let a0, st = step;
    if (d === 3 && r() < 0.4) { st = -step; a0 = ri(r, 5 * step, 100); } else a0 = ri(r, 0, d === 1 ? 10 : d === 2 ? 50 : 40);
    const terms = [0, 1, 2, 3, 4].map((i) => a0 + st * i);
    const q = d === 3 ? pick(r, [2, 3]) : 4;
    const shown = terms.map((v, i) => (i === q ? null : v));
    const runs = [T(L.fillSeq + ' ')];
    shown.forEach((v, i) => { if (i) runs.push(T(', ')); if (v == null) runs.push(BL); else runs.push(T(v)); });
    return { prompt: runs, answer: [T(terms[q])], args: { terms, q }, value: terms[q], vkind: 'int', near: [terms[q] + st, terms[q] - st, terms[q] + 1, terms[q] - 1] };
  },
  verify(task) {
    const parts = afterColon(textOf(task)).split(',').map((x) => x.trim());
    const known = [];
    let qi = -1;
    parts.forEach((p, i) => { if (p === '?') qi = i; else known.push([i, +p]); });
    if (qi < 0 || known.length < 3) return false;
    const [i0, v0] = known[0], [i1, v1] = known[known.length - 1];
    const step = (v1 - v0) / (i1 - i0);
    if (!known.every(([i, v]) => v === v0 + step * (i - i0))) return false;
    const a = ansNums(task);
    return a.length === 1 && a[0] === v0 + step * (qi - i0) && a[0] >= 0;
  },
});
def('mul', {
  label: 'Phép nhân',
  S: { 3: { A: [[2, 5], [2, 9], [6, 9]], B: [[1, 5], [1, 10], [6, 10]], max: [5, 10, 10] }, 4: { A: [[10, 99], [100, 999], [100, 999]], B: [[2, 9], [2, 9], [6, 9]], max: [99, 999, 999] } },
  bound: (s, d) => s.max[d - 1],
  gen({ r, d, s, L }) {
    const a = ri(r, s.A[d - 1][0], s.A[d - 1][1]), b = ri(r, s.B[d - 1][0], s.B[d - 1][1]);
    return arith(L, a + ' × ' + b, a * b, { a, b }, { near: [a * b + a, a * b - a, a * b + 10, a * b - 10] });
  },
  verify: arithVerify,
});
def('div', {
  label: 'Phép chia',
  S: { 3: { D: [[2, 5], [2, 9], [2, 9]], rng: [[1, 10], [1, 10], [10, 99]], exact: [true, true, false], max: [50, 90, 99] }, 4: { D: [[2, 9], [2, 9], [2, 9]], rng: [[10, 99], [100, 999], [100, 999]], exact: [true, true, false], max: [99, 999, 999] } },
  bound: (s, d) => s.max[d - 1],
  gen({ r, d, s, L }) {
    const dv = ri(r, s.D[d - 1][0], s.D[d - 1][1]);
    const exact = s.exact[d - 1];
    let a;
    if (exact) {
      if (s.rng[d - 1][1] <= 10) a = dv * ri(r, s.rng[d - 1][0], s.rng[d - 1][1]);
      else { const lo = Math.ceil(s.rng[d - 1][0] / dv), hi = Math.floor(s.rng[d - 1][1] / dv); a = dv * ri(r, lo, hi); }
    } else { do { a = ri(r, s.rng[d - 1][0], s.rng[d - 1][1]); } while (a % dv === 0); }
    const q = Math.floor(a / dv), rm = a % dv;
    const e = a + ' ÷ ' + dv;
    if (!exact) return { prompt: [T(L.calcRem + ' '), T(e + ' = ?')], answer: [T(q + L.rem + rm)], args: { a, dv }, value: q, vkind: null };
    return arith(L, e, q, { a, dv }, { near: [q + 1, q - 1, q + 10, q - 10] });
  },
  verify(task) {
    const m = /(\d+)\s*÷\s*(\d+)/.exec(exprOf(task));
    if (!m) return false;
    const a = +m[1], b = +m[2], an = ansNums(task);
    if (b === 0) return false;
    if (an.length === 1) return a % b === 0 && an[0] === a / b;
    return an.length === 2 && an[0] === Math.floor(a / b) && an[1] === a % b && an[1] < b;
  },
});
def('find-x', {
  label: 'Tìm x', S: { 3: { max: [20, 100, 1000], forms: [['add'], ['add', 'sub', 'mul'], ['add', 'sub', 'mul']] } }, bound: (s, d) => s.max[d - 1],
  gen({ r, d, s, L }) {
    const max = s.max[d - 1], f = pick(r, s.forms[d - 1]);
    let runs, x;
    if (f === 'add') { x = ri(r, 1, max - 2); const a = ri(r, 1, max - x); runs = r() < 0.5 ? [Vr('x'), T(' + ' + a + ' = ' + (x + a))] : [T(a + ' + '), Vr('x'), T(' = ' + (x + a))]; }
    else if (f === 'sub') { const a = ri(r, 1, max - 2); const b = ri(r, 1, max - a); x = a + b; runs = [Vr('x'), T(' ' + MINUS + ' ' + a + ' = ' + b)]; }
    else { const a = ri(r, 2, 9); x = ri(r, 2, Math.max(2, Math.floor(max / a))); runs = [T(a + ' × '), Vr('x'), T(' = ' + a * x)]; }
    return { prompt: [T(L.findx + ' ')].concat(runs), answer: [Vr('x'), T(' = ' + x)], args: { x }, value: x, vkind: null };
  },
  verify(task) {
    const e = exprOf(task), i = e.indexOf('=');
    const a = ansNums(task);
    if (i < 0 || a.length !== 1) return false;
    return near(evalExpr(e.slice(0, i), { x: a[0] }), evalExpr(e.slice(i + 1), { x: a[0] }));
  },
});

// ----- lớp 4-5 -----
const U_LEN = { km: 1e6, m: 1e3, dm: 100, cm: 10, mm: 1 };
const U_MASS = { t: 1e6, kg: 1e3, g: 1 };
const U_AREA = { 'km²': 1e10, ha: 1e8, 'm²': 1e4, 'dm²': 100, 'cm²': 1 };
const unitBase = (u) => U_LEN[u] || U_MASS[u] || U_AREA[u];
function unitPairs(table, factors) {
  const ks = Object.keys(table), out = [];
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) { const f = table[ks[i]] / table[ks[j]]; if (factors.indexOf(f) >= 0) out.push([ks[i], ks[j], f]); }
  return out;
}
function unitsGen(table, factorsByD, kMax) {
  return function ({ r, d, L }) {
    const prs = unitPairs(table, factorsByD[d - 1]);
    const [big, small, f] = pick(r, prs);
    let runs, value, target;
    const mode = d === 1 ? 'down' : d === 2 ? 'comp' : (r() < 0.5 ? 'up' : 'comp');
    if (mode === 'down') { const v = ri(r, 1, 20); runs = v + ' ' + big; target = small; value = v * f; }
    else if (mode === 'comp') { const v1 = ri(r, 1, 9), v2 = ri(r, 1, Math.min(f - 1, 999)); runs = v1 + ' ' + big + ' ' + v2 + ' ' + small; target = small; value = v1 * f + v2; }
    else { const k = ri(r, 1, kMax); runs = (k * f) + ' ' + small; target = big; value = k; }
    return { prompt: [T(L.unitsEq + ' '), T(runs + ' = ? ' + target)], answer: [T(value + ' ' + target)], args: { target }, value, vkind: 'int', unit: target };
  };
}
function unitsVerify(task) {
  const e = textOf(task).replace(/^[^:]*:\s*/, '');
  const m = /^(.*?)=\s*\?\s*(\S+)$/.exec(e);
  if (!m) return false;
  const re = /(\d+)\s*([a-zA-Z²]+)/g;
  let x, total = 0, k = 0;
  while ((x = re.exec(m[1]))) { const b = unitBase(x[2]); if (!b) return false; total += +x[1] * b; k++; }
  const tb = unitBase(m[2]);
  if (!k || !tb) return false;
  const a = ansNums(task);
  return a.length === 1 && a[0] * tb === total && new RegExp(m[2].replace('²', '\\u00b2') + '$').test(plain(task.answer));
}
// mass: thêm kg/g/t trong cùng bảng; mỗi lần chọn họ đơn vị theo bảng nào có cặp hợp lệ
def('units', {
  label: 'Đổi đơn vị độ dài, khối lượng', S: { 4: {} }, bound: (s, d) => [20, 999, 9000][d - 1],
  gen(c) {
    const fam = c.r() < 0.6 ? U_LEN : Object.assign({}, U_MASS);
    return unitsGen(fam, [[10, 100, 1000], [100, 1000], [100, 1000]], 9)(c);
  },
  verify: unitsVerify,
});
def('frac-compare', {
  label: 'So sánh phân số cùng mẫu', S: { 4: { dmax: [10, 20, 30] } }, bound: (s, d) => s.dmax[d - 1],
  gen({ r, d, s, L }) {
    const den = ri(r, 3, s.dmax[d - 1]);
    const a = ri(r, 1, den - 1), b = r() < 0.1 ? a : ri(r, 1, den - 1);
    const sym = a < b ? '<' : a > b ? '>' : '=';
    return { prompt: [T(L.compare + ' '), F(a, den), T(' '), BL, T(' '), F(b, den)], answer: [T(sym)], args: { a, b, den }, value: sym, vkind: 'sym' };
  },
  verify(task) {
    const m = /(\d+)\/(\d+)\s*\?\s*(\d+)\/(\d+)/.exec(textOf(task));
    if (!m) return false;
    const a = +m[1], d1 = +m[2], b = +m[3], d2 = +m[4];
    const cmpv = a * d2 - b * d1;
    return d1 === d2 && plain(task.answer) === (cmpv < 0 ? '<' : cmpv > 0 ? '>' : '=');
  },
});
function fracAns(q) {
  if (q.d === 1) return [T(sg(q.n))];
  return q.n < 0 ? [T(MINUS), F(-q.n, q.d)] : [F(q.n, q.d)];
}
function fracOp(opSym, op) {
  return function ({ r, d, s, L }) {
    const dm = s.dmax[d - 1];
    let b, dd, a, c, res, tries = 0;
    do {
      b = ri(r, 2, dm); dd = ri(r, 2, dm); a = ri(r, 1, b - 1); c = ri(r, 1, dd - 1);
      res = op(Q.frac(a, b), Q.frac(c, dd)); tries++;
    } while ((b === dd || res.n <= 0 || gcdI(a, b) !== 1 || gcdI(c, dd) !== 1) && tries < 400);
    return { prompt: [T(L.calc + ' '), F(a, b), T(' ' + opSym + ' '), F(c, dd), T(' = ?')], answer: fracAns(res), args: { a, b, c, d: dd }, value: res, vkind: 'frac',
      near: [Q.frac(opSym === '+' ? a + c : a - c, b + dd), Q.frac(opSym === '+' ? a + c : a - c, b), Q.frac(res.n + 1, res.d), Q.frac(res.n, res.d + 1)] };
  };
}
def('frac-add', { label: 'Cộng phân số', S: { 5: { dmax: [12, 20, 30] } }, bound: (s, d) => s.dmax[d - 1], gen: fracOp('+', Q.add), verify: (t) => arithVerify(t) && reducedOk(t) });
def('frac-sub', { label: 'Trừ phân số', S: { 5: { dmax: [12, 20, 30] } }, bound: (s, d) => s.dmax[d - 1], gen: fracOp(MINUS, Q.sub), verify: (t) => arithVerify(t) && reducedOk(t) });
def('decimal', {
  label: 'Số thập phân', S: { 5: {} }, bound: () => 100,
  gen({ r, d, L, lang }) {
    let a, b, op, pl, A, B, v, vp;
    const op3 = d === 1 ? pick(r, ['+', MINUS]) : d === 2 ? pick(r, ['+', MINUS, '×i']) : pick(r, ['×d', '×d', '+', MINUS]);
    if (op3 === '+' || op3 === MINUS) {
      pl = d === 1 ? 1 : 2;
      const hi = d === 1 ? 999 : 9999;
      A = ri(r, 11, hi); B = ri(r, 11, hi);
      if (op3 === MINUS && B > A) { const t = A; A = B; B = t; }
      v = op3 === '+' ? A + B : A - B; vp = pl;
      return arith(L, [T(decStr(A, pl, lang) + ' ' + op3 + ' ' + decStr(B, pl, lang))], v, { A, B, pl }, { value: v, vkind: 'dec', places: vp, near: [v + 1, v - 1, v + 10, v - 10] });
    }
    if (op3 === '×i') { A = ri(r, 11, 99); const m = ri(r, 2, 9); v = A * m; return arith(L, [T(decStr(A, 1, lang) + ' × ' + m)], v, { A, m }, { value: v, vkind: 'dec', places: 1, near: [v + 10, v - 10, v * 10, Math.round(v / 10)] }); }
    A = ri(r, 11, 99); B = ri(r, 11, 99); v = A * B;
    return arith(L, [T(decStr(A, 1, lang) + ' × ' + decStr(B, 1, lang))], v, { A, B }, { value: v, vkind: 'dec', places: 2, near: [v * 10, Math.round(v / 10), v + 1, v - 1] });
  },
  verify: arithVerify,
});
// với 'dec' các hàm arith() ghi answer bằng sg(value): thay bằng định dạng thập phân sau khi sinh (xem finishDecimal)
def('percent', {
  label: 'Tìm phần trăm của một số', S: { 5: { pcts: [[10, 20, 25, 50], [5, 10, 15, 20, 25, 30, 40, 50, 75], [2, 4, 6, 8, 12, 15, 35, 45, 60, 80]], bmax: [200, 500, 1000] } }, bound: (s, d) => s.bmax[d - 1],
  gen({ r, d, s, L }) {
    const a = pick(r, s.pcts[d - 1]);
    const step = 100 / gcdI(a, 100);
    const b = step * ri(r, 1, Math.max(1, Math.floor(s.bmax[d - 1] / step)));
    const v = a * b / 100;
    return { prompt: [T(L.calc + ' ' + a + '%' + L.of + b + ' = ?')], answer: [T(v)], args: { a, b }, value: v, vkind: 'int', near: [v * 10, Math.round(v / 10), v + a, v - a] };
  },
  verify(task) {
    const m = /(\d+)%\s*(?:của|of)\s*(\d+)/.exec(textOf(task));
    const a = ansNums(task);
    return !!m && a.length === 1 && near(a[0], +m[1] * +m[2] / 100);
  },
});
def('units-area', {
  label: 'Đổi đơn vị diện tích', S: { 5: {} }, bound: (s, d) => [20, 999, 90000][d - 1],
  gen: unitsGen(U_AREA, [[100], [100, 10000], [100, 10000]], 9), verify: unitsVerify,
});

// ----- lớp 6-7 -----
const par = (n) => (n < 0 ? '(' + MINUS + (-n) + ')' : String(n));
def('int-ops', {
  label: 'Số nguyên âm', S: { 6: { max: [10, 30, 99] } }, bound: (s, d) => s.max[d - 1],
  gen({ r, d, s, L }) {
    const max = s.max[d - 1];
    const op = d === 1 ? pick(r, ['+', MINUS]) : d === 2 ? pick(r, ['+', MINUS, '×']) : pick(r, ['+', MINUS, '÷', '×']);
    let a, b, v;
    if (op === '×') { a = ri(r, -12, 12); b = ri(r, -9, 9); v = a * b; if (a === 0 || b === 0) { a = 7; b = -3; v = -21; } }
    else if (op === '÷') { b = sgn(r) * ri(r, 1, 9); const q = ri(r, -11, 11); a = b * q; v = q; if (a === 0) { a = 36; b = -4; v = -9; } }
    else { a = ri(r, -max, max); b = ri(r, -max, max); v = op === '+' ? a + b : a - b; }
    return arith(L, par(a) + ' ' + op + ' ' + par(b), v, { a, b, op }, { near: [-v, v + 2, v - 2, op === MINUS ? a + b : a - b] });
  },
  verify: arithVerify,
});
def('frac-mul-div', {
  label: 'Nhân, chia phân số', S: { 6: { dmax: [6, 12, 20] } }, bound: (s, d) => s.dmax[d - 1],
  gen({ r, d, s, L }) {
    const dm = s.dmax[d - 1];
    let b, dd, a, c, tries = 0;
    do { b = ri(r, 2, dm); dd = ri(r, 2, dm); a = ri(r, 1, b - 1); c = ri(r, 1, dd - 1); tries++; } while ((gcdI(a, b) !== 1 || gcdI(c, dd) !== 1) && tries < 400);
    const mulOp = r() < 0.5;
    const res = mulOp ? Q.mul(Q.frac(a, b), Q.frac(c, dd)) : Q.div(Q.frac(a, b), Q.frac(c, dd));
    return { prompt: [T(L.calc + ' '), F(a, b), T(mulOp ? ' × ' : ' ÷ '), F(c, dd), T(' = ?')], answer: fracAns(res), args: { a, b, c, d: dd, mulOp }, value: res, vkind: 'frac',
      near: [Q.frac(res.n + 1, res.d), Q.frac(res.n, res.d + 1), mulOp ? Q.div(Q.frac(a, b), Q.frac(c, dd)) : Q.mul(Q.frac(a, b), Q.frac(c, dd))] };
  },
  verify: (t) => arithVerify(t) && reducedOk(t),
});
def('gcd-lcm', {
  label: 'ƯCLN, BCNN', S: { 6: { max: [30, 60, 100] } }, bound: (s, d) => s.max[d - 1],
  gen({ r, d, s, L }) {
    const max = s.max[d - 1];
    const isG = r() < 0.5;
    let a, b, g, l, tries = 0;
    do { a = ri(r, 6, max); b = ri(r, 6, max); g = gcdI(a, b); l = a * b / g; tries++; } while ((a === b || (isG && g < 2) || (!isG && l > 600)) && tries < 500);
    const v = isG ? g : l;
    return { prompt: [T((isG ? L.gcd : L.lcm) + '(' + a + '; ' + b + ') = ?')], answer: [T(v)], args: { a, b, isG }, value: v, vkind: 'int', near: [isG ? l : g, v * 2, Math.max(1, v - 1), v + 1] };
  },
  verify(task) {
    const m = /(\d+);\s*(\d+)/.exec(textOf(task));
    if (!m) return false;
    const a = +m[1], b = +m[2];
    const isG = /CLN|GCD/.test(textOf(task));
    let v = 0;
    if (isG) { for (let k = Math.min(a, b); k >= 1; k--) if (a % k === 0 && b % k === 0) { v = k; break; } }
    else { for (let k = Math.max(a, b); k <= a * b; k += Math.max(a, b)) if (k % a === 0 && k % b === 0) { v = k; break; } }
    const an = ansNums(task);
    return an.length === 1 && an[0] === v;
  },
});
def('pow', {
  label: 'Luỹ thừa', S: { 6: { bmax: [5, 9, 12], emax: [3, 4, 5], vmax: [125, 6561, 20000] } }, bound: (s, d) => s.bmax[d - 1],
  gen({ r, d, s, L }) {
    let a, e, tries = 0;
    do { a = ri(r, 2, s.bmax[d - 1]); e = ri(r, 2, s.emax[d - 1]); tries++; } while (Math.pow(a, e) > s.vmax[d - 1] && tries < 200);
    const v = Math.pow(a, e);
    return { prompt: [T(L.calc + ' '), SUP([T(a)], [T(e)]), T(' = ?')], answer: [T(v)], args: { a, e }, value: v, vkind: 'int', near: [a * e, Math.pow(a, e - 1), Math.pow(a, e) + a, Math.pow(e, a)] };
  },
  verify: arithVerify,
});
function signedFracRuns(n, d) {   // phân số có dấu, âm thì đặt trong ngoặc
  return n < 0 ? [T('(' + MINUS), F(-n, d), T(')')] : [F(n, d)];
}
def('rational', {
  label: 'Số hữu tỉ', S: { 7: { nmax: [6, 10, 15] } }, bound: (s, d) => s.nmax[d - 1],
  gen({ r, d, s, L }) {
    const nm = s.nmax[d - 1];
    const ops = d === 1 ? ['+', MINUS] : d === 2 ? ['+', MINUS, '×'] : ['×', '÷', '+', MINUS];
    const op = pick(r, ops);
    let a, b, c, dd, tries = 0;
    do { a = sgn(r) * ri(r, 1, nm); b = ri(r, 2, nm); c = sgn(r) * ri(r, 1, nm); dd = ri(r, 2, nm); tries++; } while ((gcdI(Math.abs(a), b) !== 1 || gcdI(Math.abs(c), dd) !== 1) && tries < 400);
    const x = Q.frac(a, b), y = Q.frac(c, dd);
    const res = op === '+' ? Q.add(x, y) : op === MINUS ? Q.sub(x, y) : op === '×' ? Q.mul(x, y) : Q.div(x, y);
    return { prompt: [T(L.calc + ' ')].concat(signedFracRuns(a, b), [T(' ' + op + ' ')], signedFracRuns(c, dd), [T(' = ?')]), answer: fracAns(res), args: { a, b, c, d: dd, op }, value: res, vkind: 'frac',
      near: [Q.neg(res), Q.frac(res.n + 1, res.d), Q.frac(res.n, res.d + 1), Q.frac(a + c, b + dd)] };
  },
  verify: (t) => arithVerify(t) && reducedOk(t),
});
def('ratio', {
  label: 'Tỉ lệ thức', S: { 7: { pq: [4, 5, 6], k: [3, 4, 6] } }, bound: (s, d) => s.pq[d - 1] * s.k[d - 1],
  gen({ r, d, s, L }) {
    let p, q, tries = 0;
    do { p = ri(r, 1, s.pq[d - 1]); q = ri(r, 1, s.pq[d - 1]); tries++; } while ((p === q || gcdI(p, q) !== 1) && tries < 100);
    const m = ri(r, 1, s.k[d - 1]), n = ri(r, 1, s.k[d - 1]);
    const b = p * m, c = q * m;
    let runs, x;
    if (r() < 0.5) { const a = q * n; x = p * n; runs = [F([Vr('x')], a), T(' = '), F(b, c)]; }
    else { const a = p * n; x = q * n; runs = [F(a, [Vr('x')]), T(' = '), F(b, c)]; }
    return { prompt: [T(L.findx + ' ')].concat(runs), answer: [Vr('x'), T(' = ' + x)], args: { x }, value: x, vkind: null };
  },
  verify(task) {
    const e = exprOf(task), i = e.indexOf('='), a = ansNums(task);
    return i > 0 && a.length === 1 && near(evalExpr(e.slice(0, i), { x: a[0] }), evalExpr(e.slice(i + 1), { x: a[0] }));
  },
});
def('sqrt-perfect', {
  label: 'Căn bậc hai', S: { 7: { kmax: [10, 20, 30] } }, bound: (s, d) => s.kmax[d - 1] * s.kmax[d - 1],
  gen({ r, d, s, L }) {
    const km = s.kmax[d - 1];
    if (d < 3) { const k = ri(r, 2, km); return { prompt: [T(L.calc + ' '), SQ(k * k), T(' = ?')], answer: [T(k)], args: { k }, value: k, vkind: 'int', near: [k * 2, k + 1, k - 1, k * k] }; }
    const k1 = ri(r, 2, km), k2 = ri(r, 2, km), minus = r() < 0.4 && k1 > k2;
    const v = minus ? k1 - k2 : k1 + k2;
    return { prompt: [T(L.calc + ' '), SQ(k1 * k1), T(minus ? ' ' + MINUS + ' ' : ' + '), SQ(k2 * k2), T(' = ?')], answer: [T(v)], args: { k1, k2, minus }, value: v, vkind: 'int', near: [minus ? k1 + k2 : k1 - k2, v + 1, v - 1, k1 * k1] };
  },
  verify: arithVerify,
});
def('graph-point', {
  label: 'Vẽ điểm, đường thẳng', S: { 6: {} }, bound: () => 6,
  gen({ r, d, L, lang }) {
    if (d === 1 || (d === 2 && r() < 0.25)) {
      let x = ri(r, -5, 5), y = ri(r, -5, 5);
      if (r() < 0.9 && (x === 0 || y === 0)) { x = x || 3; y = y || -2; }
      const name = pick(r, ['A', 'B', 'C', 'M', 'N']);
      const roman = x > 0 && y > 0 ? 'I' : x < 0 && y > 0 ? 'II' : x < 0 && y < 0 ? 'III' : 'IV';
      const where = x === 0 && y === 0 ? L.origin : y === 0 ? L.onOx : x === 0 ? L.onOy : L.quadrant + roman;
      return { prompt: [T(L.plotPt + ' ' + name + '(' + sg(x) + '; ' + sg(y) + ') ' + L.ofPt)], answer: [T(where)], args: { x, y }, variant: 'point', value: null, vkind: null, paper: 'axes' };
    }
    let a, b;
    if (d === 2) { a = ri(r, 1, 3); b = ri(r, -3, 3); }
    else { a = sgn(r) * ri(r, 1, 3); b = a * ri(r, -2, 2); if (b === 0) b = a * 2; }
    const x0 = -b / a;
    const prompt = [T(L.plotLine + ' '), Vr('y'), T(' = ' + (a === 1 ? '' : a === -1 ? MINUS : sg(a))), Vr('x')].concat(b === 0 ? [] : [T(' ' + (b < 0 ? MINUS : '+') + ' ' + Math.abs(b))]);
    const ans = d === 2 ? L.through + ' (0; ' + sg(b) + ') ' + (lang === 'en' ? 'and' : 'và') + ' (1; ' + sg(a + b) + ')' : L.cutOy + ' (0; ' + sg(b) + '), ' + L.cutOx + ' (' + sg(x0) + '; 0)';
    return { prompt, answer: [T(ans)], args: { a, b }, variant: d === 2 ? 'line' : 'line2', value: null, vkind: null, paper: 'axes' };
  },
  verify(task) {
    const text = mm(textOf(task));
    const pt = /\((-?\d+); (-?\d+)\)/.exec(text);
    const ans = mm(plain(task.answer));
    if (/\by\s*=/.test(text)) {
      const f = (x) => evalExpr(text.slice(text.indexOf('=') + 1), { x });
      const b = f(0), a1 = f(1) - f(0);
      const n = nums(ans);
      if (task.meta.variant === 'line') return n.length === 4 && n[0] === 0 && n[1] === b && n[2] === 1 && n[3] === a1 + b;
      return n.length === 4 && n[0] === 0 && n[1] === b && near(n[2], -b / a1) && n[3] === 0 && Math.abs(a1) >= 1;
    }
    if (!pt) return false;
    const x = +pt[1], y = +pt[2];
    if (x === 0 && y === 0) return /(Gốc|origin)/i.test(ans);
    if (y === 0) return /Ox|x-axis/.test(ans);
    if (x === 0) return /Oy|y-axis/.test(ans);
    const roman = x > 0 && y > 0 ? 'I' : x < 0 && y > 0 ? 'II' : x < 0 && y < 0 ? 'III' : 'IV';
    return new RegExp('(?:phần tư|Quadrant) ' + roman + '$').test(ans);
  },
});

// ----- lớp 8 -----
function pickCoef(r, cmax, positiveOnly) { let c = 0; while (c === 0) c = ri(r, -cmax, cmax); return positiveOnly ? Math.abs(c) : c; }
const polyPoints = [-2, -1, 0, 1, 2, 3];
def('simplify', {
  label: 'Thu gọn đa thức', S: { 8: { cmax: [9, 15, 20] } }, bound: (s, d) => s.cmax[d - 1],
  gen({ r, d, s, L }) {
    const powers = d === 1 ? [1, 1, 0] : d === 2 ? [2, 1, 2, 1] : [2, 1, 0, 2, 1];
    for (let tries = 0; tries < 100; tries++) {
      const terms = powers.map((p) => ({ c: pickCoef(r, s.cmax[d - 1], d === 1), p }));
      // xáo thứ tự
      for (let i = terms.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = terms[i]; terms[i] = terms[j]; terms[j] = t; }
      const res = normPoly(terms);
      if (res.length === 1 && res[0].c === 0) continue;
      if (res.length === terms.length) continue;   // phải có ít nhất một cặp đồng dạng gộp được
      return { prompt: [T(L.simplify + ' ')].concat(polyRuns(terms)), answer: polyRuns(res), args: { terms }, value: null, vkind: null };
    }
    return null;
  },
  verify(task) {
    const e = exprOf(task), f = exprText(task.answer);
    return polyPoints.every((x) => near(evalExpr(e, { x }), evalExpr(f, { x })));
  },
});
def('expand', {
  label: 'Nhân đa thức', S: { 8: { cmax: [9, 15, 20] } }, bound: (s, d) => s.cmax[d - 1],
  gen({ r, d, s, L }) {
    const cm = s.cmax[d - 1];
    const lin = (p, c) => [T('('), ...polyRuns([{ c: p, p: 1 }, { c, p: 0 }]), T(')')];
    if (d === 1) {
      const a = sgn(r) * ri(r, 2, Math.min(cm, 9)), b = pickCoef(r, cm);
      const terms = [{ c: a, p: 1 }, { c: a * b, p: 0 }];
      return { prompt: [T(L.expand + ' ' + sg(a)), ...lin(1, b)], answer: polyRuns(normPoly(terms)), args: { a, b }, value: null, vkind: null };
    }
    let p = 1, q = 1;
    if (d === 3) { p = ri(r, 1, 3); q = sgn(r) * ri(r, 1, 3); }
    const a = pickCoef(r, cm), b = pickCoef(r, cm);
    const terms = [{ c: p * q, p: 2 }, { c: p * b + q * a, p: 1 }, { c: a * b, p: 0 }];
    return { prompt: [T(L.expand + ' ')].concat(lin(p, a), lin(q, b)), answer: polyRuns(normPoly(terms)), args: { p, q, a, b }, value: null, vkind: null };
  },
  verify(task) {
    const e = exprOf(task), f = exprText(task.answer);
    return polyPoints.every((x) => near(evalExpr(e, { x }), evalExpr(f, { x })));
  },
});
def('linear', {
  label: 'Phương trình bậc nhất', S: { 8: { cmax: [9, 15, 20], xmax: [5, 8, 10] } }, bound: (s, d) => s.cmax[d - 1] * s.xmax[d - 1] + s.cmax[d - 1],
  gen({ r, d, s, L }) {
    const pos = d === 1;
    const a = pickCoef(r, s.cmax[d - 1], pos), b = pickCoef(r, s.cmax[d - 1], pos);
    if (Math.abs(a) < 2) return null;
    const x = pickCoef(r, s.xmax[d - 1], pos), c = a * x + b;
    return { prompt: [T(L.solve + ' ')].concat(polyRuns([{ c: a, p: 1 }, { c: b, p: 0 }]), [T(' = ' + sg(c))]), answer: [Vr('x'), T(' = ' + sg(x))], args: { a, b, c, x }, value: x, vkind: null };
  },
  verify(task) {
    const e = exprOf(task), i = e.indexOf('='), an = ansNums(task);
    return i > 0 && an.length === 1 && near(evalExpr(e.slice(0, i), { x: an[0] }), evalExpr(e.slice(i + 1), { x: an[0] }));
  },
});

// ----- lớp 9-10 -----
function lin2Runs(a, b) {   // a x + b y
  const out = [];
  if (a === -1) out.push(T(MINUS), Vr('x')); else if (a === 1) out.push(Vr('x')); else out.push(T(sg(a)), Vr('x'));
  out.push(T(b < 0 ? ' ' + MINUS + ' ' : ' + '));
  if (Math.abs(b) !== 1) out.push(T(Math.abs(b)));
  out.push(Vr('y'));
  return out;
}
def('linear-system', {
  label: 'Hệ hai phương trình', S: { 9: { cmax: [3, 5, 9], xy: [4, 5, 6] } }, bound: (s, d) => 2 * s.cmax[d - 1] * s.xy[d - 1],
  gen({ r, d, s, L }) {
    const pos = d === 1;
    const c = (m) => pickCoef(r, m, pos);
    let a1, b1, a2, b2, tries = 0;
    do { a1 = c(s.cmax[d - 1]); b1 = c(s.cmax[d - 1]); a2 = c(s.cmax[d - 1]); b2 = c(s.cmax[d - 1]); tries++; } while ((a1 * b2 - a2 * b1 === 0 || (a1 === a2 && b1 === b2)) && tries < 100);
    const x = pickCoef(r, s.xy[d - 1]), y = pickCoef(r, s.xy[d - 1]);
    const c1 = a1 * x + b1 * y, c2 = a2 * x + b2 * y;
    return { prompt: [T(L.solveSys + ' ')].concat(lin2Runs(a1, b1), [T(' = ' + sg(c1) + L.and)], lin2Runs(a2, b2), [T(' = ' + sg(c2))]),
      answer: [T('('), Vr('x'), T('; '), Vr('y'), T(') = (' + sg(x) + '; ' + sg(y) + ')')], args: { a1, b1, c1, a2, b2, c2, x, y }, value: null, vkind: null };
  },
  verify(task) {
    const e = exprOf(task).split(/ và | and /);
    const an = ansNums(task);
    if (e.length !== 2 || an.length !== 2) return false;
    return e.every((s) => { const i = s.indexOf('='); return near(evalExpr(s.slice(0, i), { x: an[0], y: an[1] }), evalExpr(s.slice(i + 1), { x: an[0], y: an[1] })); });
  },
});
def('quadratic', {
  label: 'Phương trình bậc hai',
  S: { 9: { rmax: [5, 8, 10], amax: [1, 2, 3], modes: [['two'], ['two'], ['two']] }, 10: { rmax: [5, 8, 10], amax: [1, 2, 3], modes: [['two'], ['two', 'double'], ['two', 'double', 'none']] } },
  bound: (s, d) => [25, 128, 300][d - 1],
  gen({ r, d, s, L }) {
    const mode = pick(r, s.modes[d - 1]);
    const rm = s.rmax[d - 1];
    let a, b, c, ans;
    if (mode === 'two') {
      const a0 = d === 1 ? 1 : ri(r, 1, s.amax[d - 1]);
      let r1, r2, tries = 0;
      do { r1 = ri(r, -rm, rm); r2 = ri(r, -rm, rm); tries++; } while ((r1 === r2) && tries < 50);
      a = a0; b = -a0 * (r1 + r2); c = a0 * r1 * r2;
      const lo = Math.min(r1, r2), hi = Math.max(r1, r2);
      ans = [Vr('x'), T(' = ' + sg(lo) + L.or), Vr('x'), T(' = ' + sg(hi))];
    } else if (mode === 'double') {
      const r1 = sgn(r) * ri(r, 1, rm);
      a = 1; b = -2 * r1; c = r1 * r1;
      ans = [Vr('x'), T(' = ' + sg(r1) + L.dbl)];
    } else {
      a = ri(r, 1, s.amax[d - 1]); b = ri(r, -6, 6);
      c = Math.floor(b * b / (4 * a)) + 1 + ri(r, 0, 3);
      ans = [T(L.none)];
    }
    const terms = [{ c: a, p: 2 }, { c: b, p: 1 }, { c: c, p: 0 }].filter((t) => t.c !== 0);
    return { prompt: [T(L.solve + ' ')].concat(polyRuns(terms), [T(' = 0')]), answer: ans, args: { a, b, c, mode }, value: null, vkind: null };
  },
  verify(task) {
    const e = exprOf(task).replace(/=\s*0$/, '');
    const f = (x) => evalExpr(e, { x });
    const c = f(0), f1 = f(1), fm = f(-1);
    const a = (f1 + fm) / 2 - c, b = (f1 - fm) / 2;
    const disc = b * b - 4 * a * c;
    const text = plain(task.answer);
    if (/Vô nghiệm|No real/.test(text)) return disc < 0 && a !== 0;
    if (disc < 0) return false;
    const r1 = (-b - Math.sqrt(disc)) / (2 * a), r2 = (-b + Math.sqrt(disc)) / (2 * a);
    const an = nums(text);
    const want = [r1, r2].sort((p, q) => p - q);
    if (disc === 0) return an.length === 1 && near(an[0], want[0]) && Math.abs(f(an[0])) < 1e-9;
    return an.length === 2 && near(an[0], want[0]) && near(an[1], want[1]) && an[0] < an[1];
  },
});
def('sqrt-simplify', {
  label: 'Rút gọn căn', S: { 9: { kmax: [5, 8, 12], ms: [[2, 3, 5], [2, 3, 5, 6, 7], [2, 3, 5, 6, 7, 10, 11]] } }, bound: (s, d) => s.kmax[d - 1] * s.kmax[d - 1] * Math.max.apply(null, s.ms[d - 1]),
  gen({ r, d, s, L }) {
    const k = ri(r, 2, s.kmax[d - 1]), m = pick(r, s.ms[d - 1]);
    const n = k * k * m;
    return { prompt: [T(L.calc + ' '), SQ(n), T(' = ?')], answer: [T(k), SQ(m)], args: { k, m }, value: null, vkind: null };
  },
  verify(task) {
    const m0 = /√\((\d+)\)/.exec(exprText(task.prompt));
    if (!m0) return false;
    const n = +m0[1];
    let k = 1;
    for (let i = Math.floor(Math.sqrt(n)); i >= 1; i--) if (n % (i * i) === 0) { k = i; break; }
    const m = n / (k * k);
    const an = ansNums(task);
    return an.length === 2 && an[0] === k && an[1] === m && m > 1 && Math.abs(an[0] * Math.sqrt(an[1]) - Math.sqrt(n)) < 1e-9;
  },
});
def('ineq-linear', {
  label: 'Bất phương trình bậc nhất', S: { 10: { amax: [3, 6, 9], bmax: [9, 15, 20], xmax: [5, 6, 8] } }, bound: (s, d) => s.amax[d - 1] * s.xmax[d - 1] + s.bmax[d - 1],
  gen({ r, d, s, L }) {
    const pos = d === 1;
    let a = pickCoef(r, s.amax[d - 1], pos); if (Math.abs(a) < 2) a = a * 2;
    const b = pickCoef(r, s.bmax[d - 1], pos), x0 = pickCoef(r, s.xmax[d - 1], pos), c = a * x0 + b;
    const op = pick(r, ['<', '>', '≤', '≥']);
    const flip = { '<': '>', '>': '<', '≤': '≥', '≥': '≤' };
    const res = a > 0 ? op : flip[op];
    return { prompt: [T(L.solveIneq + ' ')].concat(polyRuns([{ c: a, p: 1 }, { c: b, p: 0 }]), [T(' ' + op + ' ' + sg(c))]), answer: [Vr('x'), T(' ' + res + ' ' + sg(x0))], args: { a, b, c, x0, op }, value: null, vkind: null };
  },
  verify(task) {
    const e = mm(exprOf(task));
    const m = /^(.*?)(<|>|≤|≥)(.*)$/.exec(e);
    const am = /x\s*(<|>|≤|≥)\s*(-?\d+)/.exec(mm(plain(task.answer)));
    if (!m || !am) return false;
    const x0 = +am[2];
    const test = (op, l, r2) => (op === '<' ? l < r2 : op === '>' ? l > r2 : op === '≤' ? l <= r2 : l >= r2);
    return [x0 - 3, x0 - 1, x0 - 0.5, x0, x0 + 0.5, x0 + 1, x0 + 3].every((x) => test(m[2], evalExpr(m[1], { x }), evalExpr(m[3], { x })) === test(am[1], x, x0));
  },
});
def('vector-dot', {
  label: 'Tích vô hướng', S: { 10: { cmax: [3, 6, 9] } }, bound: (s, d) => s.cmax[d - 1] * 2,
  gen({ r, d, s, L }) {
    const cm = s.cmax[d - 1];
    if (d === 3 && r() < 0.5) {
      let a, b, t, m, dd, tries = 0;
      do { a = pickCoef(r, cm); b = pickCoef(r, cm); t = sgn(r) * ri(r, 1, 2); m = b * t; dd = -a * t; tries++; } while ((Math.abs(m) > cm * 2 || Math.abs(dd) > cm * 2) && tries < 100);
      return { prompt: [T(L.given + ' '), Vr('u'), T(' = (' + sg(a) + '; ' + sg(b) + '), '), Vr('v'), T(' = ('), Vr('m'), T('; ' + sg(dd) + '). ' + L.findm + ' '), Vr('u'), T(' ⊥ '), Vr('v'), T('.')],
        answer: [Vr('m'), T(' = ' + sg(m))], args: { a, b, dd, m }, variant: 'perp', value: m, vkind: null };
    }
    const a = pickCoef(r, cm, d === 1), b = pickCoef(r, cm, d === 1), c = pickCoef(r, cm, d === 1), dd = pickCoef(r, cm, d === 1);
    const v = a * c + b * dd;
    return { prompt: [T(L.given + ' '), Vr('u'), T(' = (' + sg(a) + '; ' + sg(b) + '), '), Vr('v'), T(' = (' + sg(c) + '; ' + sg(dd) + '). ' + L.compute + ' '), Vr('u'), T(' · '), Vr('v'), T('.')],
      answer: [T(sg(v))], args: { a, b, c, dd }, variant: 'dot', value: v, vkind: 'int', near: [a * c - b * dd, a * dd + b * c, v + 2, v - 2, -v] };
  },
  verify(task) {
    const n = nums(textOf(task));
    const an = ansNums(task);
    if (an.length !== 1) return false;
    if (/⊥/.test(textOf(task))) return n.length === 3 && n[0] * an[0] + n[1] * n[2] === 0;
    return n.length === 4 && an[0] === n[0] * n[2] + n[1] * n[3];
  },
});

// ----- lớp 11 -----
def('log-exp', {
  label: 'Logarit và mũ', S: { 11: { pairs: [[[2, 2, 6], [3, 2, 3], [4, 2, 3], [5, 2, 2]], [[2, 2, 7], [3, 2, 5], [4, 2, 3], [5, 2, 3]], [[2, 2, 10], [3, 2, 6], [4, 2, 5]]] } }, bound: (s, d) => [64, 243, 1024][d - 1],
  gen({ r, d, s, L }) {
    const [a, k0, k1] = pick(r, s.pairs[d - 1]);
    const k = ri(r, k0, k1), N = Math.pow(a, k);
    const variant = d === 1 ? 'log' : d === 2 ? (r() < 0.5 ? 'log' : 'exp') : pick(r, ['exp', 'sum', 'sum']);
    if (variant === 'log') return { prompt: [T(L.calc + ' log'), SUB(a), T(' ' + N + ' = ?')], answer: [T(k)], args: { a, k }, variant, value: k, vkind: 'int', near: [k + 1, k - 1, N / a, a] };
    if (variant === 'exp') return { prompt: [T(L.sol + ' '), SUP([T(a)], [Vr('x')]), T(' = ' + N)], answer: [Vr('x'), T(' = ' + k)], args: { a, k }, variant, value: k, vkind: null };
    const k1_ = ri(r, 1, k - 1), k2_ = k - k1_;
    return { prompt: [T(L.calc + ' log'), SUB(a), T(' ' + Math.pow(a, k1_) + ' + log'), SUB(a), T(' ' + Math.pow(a, k2_) + ' = ?')], answer: [T(k)], args: { a, k1: k1_, k2: k2_ }, variant, value: k, vkind: 'int', near: [k1_ * k2_, k + 1, k - 1, Math.pow(a, k1_) + Math.pow(a, k2_)] };
  },
  verify(task) {
    const n = nums(textOf(task).replace(/^[^:]*:/, '').replace(/log_(\d+)/g, 'log $1'));
    const an = ansNums(task);
    if (an.length !== 1) return false;
    const lg = (a, x) => Math.log(x) / Math.log(a);
    if (task.meta.variant === 'log') return near(lg(n[0], n[1]), an[0], 1e-9) && Number.isInteger(an[0]);
    if (task.meta.variant === 'exp') return near(Math.pow(n[0], an[0]), n[1]) && Number.isInteger(an[0]);
    return n.length === 4 && near(lg(n[0], n[1]) + lg(n[2], n[3]), an[0], 1e-9);
  },
});
const TRIG = {
  sin: { 0: [0], 30: [1, 1, 2], 45: [1, 2, 2], 60: [1, 3, 2], 90: [1], 120: [1, 3, 2], 135: [1, 2, 2], 150: [1, 1, 2], 180: [0] },
  cos: { 0: [1], 30: [1, 3, 2], 45: [1, 2, 2], 60: [1, 1, 2], 90: [0], 120: [-1, 1, 2], 135: [-1, 2, 2], 150: [-1, 3, 2], 180: [-1] },
  tan: { 0: [0], 30: [1, 3, 3], 45: [1], 60: [1, 3, 1], 120: [-1, 3, 1], 135: [-1], 150: [-1, 3, 3], 180: [0] },
};
function trigRuns(e) {      // e: [dấu] | [dấu, căn, mẫu]
  if (e.length === 1) return [T(e[0] === 0 ? '0' : e[0] < 0 ? MINUS + '1' : '1')];
  const [s, rad, den] = e;
  const nu = rad === 1 ? [T(1)] : [SQ(rad)];
  const body = den === 1 ? nu : [F(nu, den)];
  return (s < 0 ? [T(MINUS)] : []).concat(body);
}
def('trig-value', {
  label: 'Giá trị lượng giác', S: { 11: {} }, bound: (s, d) => [90, 90, 180][d - 1],
  gen({ r, d, L }) {
    const fns = d === 1 ? ['sin', 'cos'] : ['sin', 'cos', 'tan'];
    const fn = pick(r, fns);
    const angles = Object.keys(TRIG[fn]).map(Number).filter((a) => (d === 3 ? true : a <= 90));
    const deg = pick(r, angles);
    const e = TRIG[fn][deg];
    // đáp án: e = [0] / [±1] / [±1, căn, mẫu]; với [1] đứng một mình hiểu là 1
    const runs = e.length === 1 ? [T(e[0] === 0 ? '0' : e[0] === -1 ? MINUS + '1' : '1')] : trigRuns(e);
    return { prompt: [T(L.calc + ' ' + fn + ' ' + deg + '° = ?')], answer: runs, args: { fn, deg }, value: null, vkind: null };
  },
  verify(task) {
    const m = /(sin|cos|tan)\s*(\d+)°/.exec(textOf(task));
    if (!m) return false;
    const rad = +m[2] * Math.PI / 180;
    const want = Math[m[1]](rad);
    const got = evalExpr(exprText(task.answer));
    return isFinite(got) && Math.abs(got - want) < 1e-9;
  },
});
def('seq-arith-geo', {
  label: 'Cấp số cộng, cấp số nhân', S: { 11: { nmax: [10, 15, 20] } }, bound: (s, d) => s.nmax[d - 1],
  gen({ r, d, s, L, lang }) {
    const nm = s.nmax[d - 1];
    const variant = d === 1 ? 'ar' : d === 2 ? pick(r, ['ar', 'geo']) : pick(r, ['ar', 'geo', 'sum']);
    const u1 = pickCoef(r, 9, d === 1);
    if (variant === 'geo') {
      const q = pick(r, [2, 3, -2]), n = ri(r, 4, d === 2 ? 6 : 8);
      const v = u1 * Math.pow(q, n - 1);
      return { prompt: [T(L.geo + ' u'), SUB(1), T(' = ' + sg(u1) + ', q = ' + sg(q) + '. ' + L.compute + ' u'), SUB(n), T('.')], answer: [T(sg(v))], args: { u1, q, n }, variant, value: v, vkind: 'int', near: [u1 * q * (n - 1), v + u1, -v, u1 * Math.pow(q, n)] };
    }
    const dd = pickCoef(r, 9, d === 1);
    if (variant === 'sum') {
      const n = ri(r, 5, nm);
      const v = n * (2 * u1 + (n - 1) * dd) / 2;
      return { prompt: [T(L.ar + ' u'), SUB(1), T(' = ' + sg(u1) + ', d = ' + sg(dd) + '. ' + L.sumFirst + ' ' + n + ' ' + L.terms + '.')], answer: [T(sg(v))], args: { u1, d: dd, n }, variant, value: v, vkind: 'int', near: [v + n, v - n, n * (u1 + (n - 1) * dd), n * (2 * u1 + n * dd) / 2] };
    }
    const n = ri(r, 5, nm);
    const v = u1 + (n - 1) * dd;
    return { prompt: [T(L.ar + ' u'), SUB(1), T(' = ' + sg(u1) + ', d = ' + sg(dd) + '. ' + L.compute + ' u'), SUB(n), T('.')], answer: [T(sg(v))], args: { u1, d: dd, n }, variant, value: v, vkind: 'int', near: [v + dd, v - dd, u1 + n * dd, v + 1] };
  },
  verify(task) {
    const { u1, n } = task.meta.args;
    const an = ansNums(task);
    if (an.length !== 1) return false;
    let want = 0;
    if (task.meta.variant === 'geo') { let u = u1; for (let i = 1; i < n; i++) u *= task.meta.args.q; want = u; }
    else if (task.meta.variant === 'sum') { let u = u1; want = 0; for (let i = 0; i < n; i++) { want += u; u += task.meta.args.d; } }
    else { let u = u1; for (let i = 1; i < n; i++) u += task.meta.args.d; want = u; }
    return an[0] === want;
  },
});

// ----- lớp 12 -----
function randPoly(r, deg, cm) {
  for (let tries = 0; tries < 100; tries++) {
    const terms = [];
    for (let p = deg; p >= 0; p--) { if (p === deg || r() < 0.7) terms.push({ c: pickCoef(r, cm), p }); }
    if (terms.length >= 2) return terms;
  }
  return [{ c: 3, p: deg }, { c: 1, p: 0 }];
}
def('deriv-poly', {
  label: 'Đạo hàm đa thức', S: { 12: { deg: [2, 3, 4], cmax: [9, 9, 12] } }, bound: (s, d) => s.cmax[d - 1],
  gen({ r, d, s, L }) {
    const f = randPoly(r, s.deg[d - 1], s.cmax[d - 1]);
    const df = normPoly(f.filter((t) => t.p > 0).map((t) => ({ c: t.c * t.p, p: t.p - 1 })));
    return { prompt: [T(L.derive + ' f(x) = ')].concat(polyRuns(f)), answer: [T('f′(x) = ')].concat(polyRuns(df)), args: { f }, value: null, vkind: null };
  },
  verify(task) {
    const e = exprOf(task), i = e.indexOf('=');
    const a = exprText(task.answer), j = a.indexOf('=');
    const h = 1e-3;
    const F0 = (x) => evalExpr(e.slice(i + 1), { x });
    return [-2, -1, 0.5, 1, 2].every((x) => { const num = (F0(x + h) - F0(x - h)) / (2 * h); const got = evalExpr(a.slice(j + 1), { x }); return Math.abs(num - got) <= 1e-3 * (1 + Math.abs(got)); });
  },
});
def('integral-poly', {
  label: 'Tích phân đa thức', S: { 12: { deg: [1, 2, 2], cmax: [6, 9, 9], lim: [[0, 3], [-2, 3], [-3, 4]] } }, bound: (s, d) => Math.max(s.cmax[d - 1], s.lim[d - 1][1]),
  gen({ r, d, s, L }) {
    const f = randPoly(r, s.deg[d - 1], s.cmax[d - 1]);
    let lo, hi;
    do { lo = ri(r, s.lim[d - 1][0], s.lim[d - 1][1]); hi = ri(r, s.lim[d - 1][0], s.lim[d - 1][1]); } while (lo >= hi);
    let v = Q.frac(0, 1);
    f.forEach((t) => { v = Q.add(v, Q.mul(Q.frac(t.c, t.p + 1), Q.frac(Math.pow(hi, t.p + 1) - Math.pow(lo, t.p + 1), 1))); });
    return { prompt: [T(L.integ + ' '), { t: 'int', lo: [T(sg(lo))], hi: [T(sg(hi))] }, T(' (')].concat(polyRuns(f), [T(') d'), Vr('x'), T(' = ?')]), answer: fracAns(v), args: { f, lo, hi }, value: v, vkind: 'frac', near: [Q.neg(v), Q.frac(v.n + 1, v.d), Q.frac(v.n, v.d + 1)] };
  },
  verify(task) {
    const m = /∫\[(-?\d+),(-?\d+)\]\s*\((.*)\)\s*d\s*x/.exec(mm(exprText(task.prompt)));
    if (!m) return false;
    const lo = +m[1], hi = +m[2], f = (x) => evalExpr(m[3], { x });
    const n = 200, hh = (hi - lo) / n;
    let sum = f(lo) + f(hi);
    for (let i = 1; i < n; i++) sum += f(lo + i * hh) * (i % 2 ? 4 : 2);
    const simpson = sum * hh / 3;
    const got = evalExpr(exprText(task.answer));
    return isFinite(got) && Math.abs(simpson - got) < 1e-7 * Math.max(1, Math.abs(got)) && reducedOk(task);
  },
});
function cplxRuns(a, b) {
  const out = [T('(' + sg(a) + (b < 0 ? ' ' + MINUS + ' ' : ' + '))];
  if (Math.abs(b) !== 1) out.push(T(Math.abs(b)));
  out.push(Vr('i'), T(')'));
  return out;
}
function cplxAns(re, im) {
  if (re === 0 && im === 0) return [T('0')];
  const out = [];
  if (re !== 0) out.push(T(sg(re)));
  if (im !== 0) {
    if (re !== 0) out.push(T(im < 0 ? ' ' + MINUS + ' ' : ' + '));
    else if (im < 0) out.push(T(MINUS));
    if (Math.abs(im) !== 1) out.push(T(Math.abs(im)));
    out.push(Vr('i'));
  }
  return out;
}
def('complex', {
  label: 'Số phức', S: { 12: { cmax: [9, 5, 9] } }, bound: (s, d) => s.cmax[d - 1],
  gen({ r, d, s, L }) {
    const cm = s.cmax[d - 1];
    const a = pickCoef(r, cm), b = pickCoef(r, cm), c = pickCoef(r, cm), dd = pickCoef(r, cm);
    const op = d === 1 ? pick(r, ['+', MINUS]) : '×';
    let re, im;
    if (op === '+') { re = a + c; im = b + dd; } else if (op === MINUS) { re = a - c; im = b - dd; } else { re = a * c - b * dd; im = a * dd + b * c; }
    return { prompt: [T(L.calc + ' ')].concat(cplxRuns(a, b), [T(' ' + op + ' ')], cplxRuns(c, dd), [T(' = ?')]), answer: cplxAns(re, im), args: { a, b, c, dd, op }, value: null, vkind: null };
  },
  verify(task) {
    const I = { i: { re: 0, im: 1 } };
    const e = exprOf(task).replace(/=\s*\?$/, '');
    const want = evalExpr(e, I, COMPLEX);
    const got = evalExpr(exprText(task.answer), I, COMPLEX);
    return near(want.re, got.re) && near(want.im, got.im);
  },
});

/* ---------------- danh sách dạng theo lớp ---------------- */
const HOME = {
  1: ['add', 'sub', 'compare'], 2: ['add', 'sub', 'mul-table', 'seq'], 3: ['add', 'sub', 'mul', 'div', 'find-x'], 4: ['mul', 'div', 'units', 'frac-compare'],
  5: ['frac-add', 'frac-sub', 'decimal', 'percent', 'units-area'], 6: ['int-ops', 'frac-mul-div', 'gcd-lcm', 'pow', 'graph-point'], 7: ['rational', 'ratio', 'sqrt-perfect', 'graph-point'],
  8: ['simplify', 'expand', 'linear', 'graph-point'], 9: ['linear-system', 'quadratic', 'sqrt-simplify', 'graph-point'], 10: ['quadratic', 'ineq-linear', 'vector-dot', 'graph-point'],
  11: ['log-exp', 'trig-value', 'seq-arith-geo', 'graph-point'], 12: ['deriv-poly', 'integral-poly', 'complex', 'graph-point'],
};
export const MATH_TYPES = {};
for (let g = 1; g <= 12; g++) {
  const seen = new Set(), list = [];
  [g, g - 1, g - 2].forEach((gg, k) => {
    (HOME[gg] || []).forEach((t) => { if (!seen.has(t) && !(gg < 6 && t === 'graph-point')) { seen.add(t); list.push({ type: t, labelVi: TYPES[t].label, home: gg, review: k > 0 }); } });
  });
  MATH_TYPES[g] = list;
}
export const ALL_TYPES = Object.keys(TYPES);

function specFor(type, grade) {
  const S = TYPES[type].S;
  const keys = Object.keys(S).map(Number).sort((a, b) => a - b);
  let k = keys[0];
  keys.forEach((x) => { if (x <= grade) k = x; });
  return S[k];
}
export function boundOf(type, grade, d) {
  const t = TYPES[type];
  return t.bound(specFor(type, grade), d);
}

/* ---------------- đáp án nhiễu ---------------- */
function valRuns(v, vkind, task, lang) {
  if (vkind === 'int') return [T(sg(v) + (task.meta.unit ? ' ' + task.meta.unit : ''))];
  if (vkind === 'dec') return [T(decStr(v, task.meta.places || 1, lang) + (task.meta.unit ? ' ' + task.meta.unit : ''))];
  if (vkind === 'frac') return fracAns(v);
  return [T(String(v))];
}
function makeOptions(task, r, grade) {
  const m = task.meta, vk = m.vkind;
  if (!vk) return null;
  const nonNeg = grade <= 5;
  const lang = task.lang;
  let cands = [], key;
  const v = m.value;
  if (vk === 'sym') {
    cands = ['<', '>', '='].filter((x) => x !== v);
    key = (c) => c;
  } else if (vk === 'int') {
    cands = (m.near || []).concat([v + 1, v - 1, v + 10, v - 10, v + 2, v - 2, -v, v * 2, v + 5, v - 5, v + 100]);
    cands = cands.filter((c) => Number.isInteger(c) && c !== v && (!nonNeg || c >= 0));
    key = (c) => String(c);
  } else if (vk === 'dec') {
    const pl = m.places || 1;
    cands = (m.near || []).concat([v + 1, v - 1, v + 10, v - 10, v + 100, v - 100, v * 10, Math.round(v / 10)]);
    cands = cands.filter((c) => Number.isInteger(c) && c !== v && c >= 0);
    key = (c) => String(c);
  } else if (vk === 'frac') {
    const vi = Q.isInt(v);
    const raw = (m.near || []).concat([Q.frac(v.n + 1, v.d), Q.frac(v.n - 1, v.d), Q.frac(v.n, v.d + 1), Q.frac(v.n, Math.max(1, v.d - 1)), Q.neg(v), v.n !== 0 ? Q.frac(v.d, v.n) : Q.frac(1, 2), Q.frac(v.n + v.d, v.d * 2)]);
    cands = raw.filter((c) => c && c.d >= 1 && !Q.eq(c, v) && Q.isInt(c) === vi && (!nonNeg || c.n >= 0));
    key = (c) => c.n + '/' + c.d;
  } else return null;
  const seen = new Set();
  const uniq = [];
  cands.forEach((c) => { const k = key(c); if (!seen.has(k)) { seen.add(k); uniq.push(c); } });
  if (uniq.length < 2) return null;
  // ưu tiên lỗi hay gặp (near) rồi tới phần còn lại, xáo nhẹ để đa dạng
  const first = uniq.slice(0, Math.min(4, uniq.length));
  for (let i = first.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = first[i]; first[i] = first[j]; first[j] = t; }
  const chosen = first.concat(uniq.slice(first.length)).slice(0, 2);
  const idx = ri(r, 0, 2);
  const arr = chosen.slice();
  arr.splice(idx, 0, v);
  return { options: arr.map((x) => valRuns(x, vk, task, lang)), answerIndex: idx };
}

/* ---------------- sinh đề ---------------- */
const normKey = (t) => plain(t.prompt).replace(/\s+/g, ' ').trim();

export function generateMath({ grade, type, difficulty = 2, count = 10, seed = 1, lang = 'vi', options = false }) {
  const def_ = TYPES[type];
  if (!def_) throw new Error('Dạng toán không có: ' + type);
  const d = Math.max(1, Math.min(3, difficulty | 0 || 2));
  const g = Math.max(1, Math.min(12, grade | 0 || 1));
  const L = LX[lang] || LX.vi;
  const spec = specFor(type, g);
  const out = [];
  const keys = new Set();
  let short = false;
  for (let i = 0; i < count; i++) {
    let made = null;
    for (let attempt = 0; attempt < 50 && !made; attempt++) {
      const r = makeRng((seed >>> 0) * 7919 + i * 104729 + attempt * 31 + 17);
      let raw;
      try { raw = def_.gen({ r, d, s: spec, L, lang, grade: g }); } catch (e) { raw = null; }
      if (!raw) continue;
      const task = {
        id: '', kind: 'math', lang, prompt: raw.prompt, options: null, answer: raw.answer, answerIndex: null,
        meta: { grade: g, type, difficulty: d, args: raw.args, value: raw.value, vkind: raw.vkind || null, variant: raw.variant || null, unit: raw.unit || null, places: raw.places || null, near: raw.near || null, paper: raw.paper || null },
      };
      // đáp án thập phân: định dạng lại theo số chữ số
      if (task.meta.vkind === 'dec') task.answer = [T(decStr(task.meta.value, task.meta.places, lang))];
      const k = normKey(task);
      if (keys.has(k)) continue;
      let ok;
      try { ok = def_.verify(task); } catch (e) { ok = false; }
      if (!ok) continue;
      task.id = 'math:' + type + ':' + k;
      if (options) {
        const o = makeOptions(task, r, g);
        if (o) { task.options = o.options; task.answerIndex = o.answerIndex; }
      }
      keys.add(k);
      made = task;
    }
    if (!made) { short = true; break; }
    out.push(made);
  }
  if (short) out.short = true;
  return out;
}

export function checkAnswer(task) {
  const t = TYPES[task.meta.type];
  if (!t) return false;
  try { return !!t.verify(task); } catch (e) { return false; }
}
export const labelOf = (type) => (TYPES[type] ? TYPES[type].label : type);
