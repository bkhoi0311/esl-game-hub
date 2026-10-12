// Phân số bằng số nguyên: luôn tối giản, mẫu dương. (THUẦN) PLAN-V2 mục B.iii.
export const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a; };
export const lcm = (a, b) => (a === 0 || b === 0 ? 0 : Math.abs(a * b) / gcd(a, b));

export function frac(n, d) {
  if (d === undefined) d = 1;
  if (d === 0) throw new Error('mẫu bằng 0');
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
}
export const add = (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a, b) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a, b) => frac(a.n * b.n, a.d * b.d);
export function div(a, b) { if (b.n === 0) throw new Error('chia cho 0'); return frac(a.n * b.d, a.d * b.n); }
export const neg = (a) => frac(-a.n, a.d);
export const cmp = (a, b) => { const x = a.n * b.d - b.n * a.d; return x < 0 ? -1 : x > 0 ? 1 : 0; };
export const eq = (a, b) => a.n === b.n && a.d === b.d;
export const toNumber = (a) => a.n / a.d;
export const isInt = (a) => a.d === 1;
export const isZero = (a) => a.n === 0;
