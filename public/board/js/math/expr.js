// Bộ kiểm độc lập cho đề toán: đọc chuỗi biểu thức và tính lại bằng cách khác với lúc sinh. (THUẦN, không DOM)
//   exprText(runs)  Run -> chuỗi biểu thức (phân số luôn có ngoặc, mũ ^( ), căn √( ))
//   evalExpr(str, vars, alg)  tính giá trị; hỗ trợ + − × · ÷ / ^ √ ², ngoặc, nhân ngầm (3x, 2(x+1), (x+1)(x-2)), biến một chữ cái
//   nums(text)  mọi số trong chuỗi theo thứ tự (hiểu −, dấu phẩy thập phân, phân số a/b)
export const MINUS = '−';

export function exprText(runs) {
  const one = (r) => {
    switch (r.t) {
      case 'frac': return '((' + exprText(r.n) + ')/(' + exprText(r.d) + '))';
      case 'sup': return '(' + exprText(r.b) + ')^(' + exprText(r.e) + ')';
      case 'sqrt': return '√(' + exprText(r.v) + ')';
      case 'sub': return '';
      case 'blank': return '?';
      case 'int': return '∫[' + exprText(r.lo) + ',' + exprText(r.hi) + ']';
      default: return r.v == null ? '' : String(r.v);
    }
  };
  return (runs || []).map(one).join('');
}

// ---- đại số thực và phức ----
export const REAL = {
  num: (x) => x, add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b, div: (a, b) => a / b, neg: (a) => -a,
  pow: (a, b) => Math.pow(a, b), sqrt: (a) => Math.sqrt(a), toNum: (a) => a,
};
export const COMPLEX = {
  num: (x) => ({ re: x, im: 0 }),
  add: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }), sub: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
  mul: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
  div: (a, b) => { const d = b.re * b.re + b.im * b.im; return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }; },
  neg: (a) => ({ re: -a.re, im: -a.im }),
  pow: (a, n) => { let r = { re: 1, im: 0 }; for (let i = 0; i < n; i++) r = COMPLEX.mul(r, a); return r; },
  sqrt: () => { throw new Error('căn phức'); },
};

function tokenize(s) {
  const t = [];
  const src = String(s).replace(/−/g, '-').replace(/·|⋅|\*/g, '×').replace(/\s+/g, '');
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/[0-9]/.test(c)) {
      let j = i; while (j < src.length && /[0-9]/.test(src[j])) j++;
      if ((src[j] === ',' || src[j] === '.') && /[0-9]/.test(src[j + 1] || '')) { j++; while (j < src.length && /[0-9]/.test(src[j])) j++; }
      t.push({ k: 'n', v: parseFloat(src.slice(i, j).replace(',', '.')) }); i = j;
    } else if (/[A-Za-z]/.test(c)) { t.push({ k: 'v', v: c }); i++; }
    else if (c === '²') { t.push({ k: 'o', v: '^' }, { k: 'n', v: 2 }); i++; }
    else if (c === '³') { t.push({ k: 'o', v: '^' }, { k: 'n', v: 3 }); i++; }
    else if ('+-×÷/^()√'.indexOf(c) >= 0) { t.push({ k: 'o', v: c === '÷' ? '/' : c }); i++; }
    else if (c === '=' || c === '?') throw new Error('ký tự ' + c);
    else i++;   // bỏ ký tự lạ (chữ tiếng Việt, dấu câu)
  }
  return t;
}

export function evalExpr(str, vars, alg) {
  const A = alg || REAL;
  const V = vars || {};
  const tk = tokenize(str);
  let p = 0;
  const peek = () => tk[p];
  const isOp = (v) => tk[p] && tk[p].k === 'o' && tk[p].v === v;
  function startsPrimary() { const x = tk[p]; return !!x && (x.k === 'n' || x.k === 'v' || (x.k === 'o' && (x.v === '(' || x.v === '√'))); }
  function expr() {
    let v = term();
    while (isOp('+') || isOp('-')) { const o = tk[p++].v; const r = term(); v = o === '+' ? A.add(v, r) : A.sub(v, r); }
    return v;
  }
  function term() {
    let v = unary();
    for (;;) {
      if (isOp('×') || isOp('/')) { const o = tk[p++].v; const r = unary(); v = o === '/' ? A.div(v, r) : A.mul(v, r); }
      else if (startsPrimary()) { v = A.mul(v, power()); }       // nhân ngầm
      else break;
    }
    return v;
  }
  function unary() {
    if (isOp('-')) { p++; return A.neg(unary()); }
    if (isOp('+')) { p++; return unary(); }
    return power();
  }
  function power() {
    const b = atom();
    if (isOp('^')) {
      p++;
      let neg = false; if (isOp('-')) { p++; neg = true; }
      const e = atom();
      const ev = A === REAL ? e : e.re;
      return A.pow(b, neg ? -ev : ev);
    }
    return b;
  }
  function atom() {
    const x = tk[p];
    if (!x) throw new Error('hết biểu thức');
    if (x.k === 'n') { p++; return A.num(x.v); }
    if (x.k === 'v') { p++; if (!(x.v in V)) throw new Error('biến ' + x.v + ' chưa có giá trị'); return typeof V[x.v] === 'number' && A !== REAL ? A.num(V[x.v]) : V[x.v]; }
    if (isOp('(')) { p++; const v = expr(); if (!isOp(')')) throw new Error('thiếu )'); p++; return v; }
    if (isOp('√')) { p++; return A.sqrt(atom()); }
    throw new Error('ký hiệu ' + JSON.stringify(x));
  }
  const v = expr();
  if (p < tk.length) throw new Error('thừa ký hiệu sau biểu thức');
  return v;
}

// Mọi số trong chuỗi. "−3/4" -> −0,75 một số; "2; 3" -> [2, 3]; "7 dư 5" -> [7, 5]; "6√2" -> [6, 2]
export function nums(text) {
  const t = String(text).replace(/−/g, '-');
  const out = [];
  const re = /(-?)(\d+(?:[.,]\d+)?)(?:\/(\d+(?:[.,]\d+)?))?/g;
  let m;
  while ((m = re.exec(t))) {
    const a = parseFloat(m[2].replace(',', '.'));
    const v = m[3] ? a / parseFloat(m[3].replace(',', '.')) : a;
    out.push(m[1] ? -v : v);
  }
  return out;
}
export const near = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-9) * Math.max(1, Math.abs(b));
