// Run -> DOM, KHÔNG dùng thư viện công thức và KHÔNG ghép chuỗi HTML từ dữ liệu (chỉ textContent). PLAN-V2 mục B.iii.4.
// Run: { t:'text', v } | { t:'var', v } | { t:'hint', v } | { t:'mask', v } | { t:'blank' } | { t:'sub', v }
//    | { t:'frac', n:[Run], d:[Run] } | { t:'sup', b:[Run], e:[Run] } | { t:'sqrt', v:[Run] } | { t:'int', lo:[Run], hi:[Run] }
const STR = ['text', 'var', 'hint', 'mask', 'sub'];
const ARR = { frac: ['n', 'd'], sup: ['b', 'e'], sqrt: ['v'], int: ['lo', 'hi'] };

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Kiểm tra chuỗi Run hợp lệ (đệ quy). Trả true/false.
export function validateRuns(runs) {
  if (!Array.isArray(runs)) return false;
  for (const r of runs) {
    if (!r || typeof r.t !== 'string') return false;
    if (STR.indexOf(r.t) >= 0) { if (typeof r.v !== 'string') return false; continue; }
    if (r.t === 'blank') continue;
    const keys = ARR[r.t];
    if (!keys) return false;
    for (const k of keys) if (!validateRuns(r[k])) return false;
  }
  return true;
}

function node(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

// Chèn các Run vào parent. opts.gap: thêm dấu cách giữa các run chữ (lời đề tiếng Anh).
export function renderRuns(runs, parent, opts) {
  const gap = !!(opts && opts.gap);
  let prevText = false;
  for (const r of runs) {
    const isTxt = r.t === 'text' || r.t === 'hint' || r.t === 'mask';
    if (gap && prevText && isTxt) parent.appendChild(document.createTextNode(' '));
    prevText = isTxt;
    switch (r.t) {
      case 'text': parent.appendChild(document.createTextNode(r.v)); break;
      case 'var': { const e = node('i', 'mv'); e.textContent = r.v; parent.appendChild(e); break; }
      case 'hint': { const e = node('span', 'r-hint'); e.textContent = r.v; parent.appendChild(e); break; }
      case 'mask': { const e = node('span', 'r-mask'); e.textContent = r.v; parent.appendChild(e); break; }
      case 'blank': parent.appendChild(node('span', 'mblank')); break;
      case 'sub': { const e = node('sub'); e.textContent = r.v; parent.appendChild(e); break; }
      case 'frac': {
        const f = node('span', 'mf'), n = node('span', 'mf-n'), d = node('span', 'mf-d');
        renderRuns(r.n, n); renderRuns(r.d, d); f.append(n, d); parent.appendChild(f); break;
      }
      case 'sup': {
        renderRuns(r.b, parent);
        const e = node('sup'); renderRuns(r.e, e); parent.appendChild(e); break;
      }
      case 'sqrt': {
        const s = node('span', 'msq'); s.textContent = '√';
        const m = node('span', 'mr'); renderRuns(r.v, m);
        parent.append(s, m); break;
      }
      case 'int': {
        const w = node('span', 'mi'), hi = node('span', 'mi-hi'), sy = node('span', 'mi-sym'), lo = node('span', 'mi-lo');
        sy.textContent = '∫'; renderRuns(r.hi, hi); renderRuns(r.lo, lo); w.append(hi, sy, lo); parent.appendChild(w); break;
      }
      default: break;
    }
  }
}

export function hasMath(runs) {
  return runs.some((r) => r.t === 'frac' || r.t === 'sqrt' || r.t === 'int' || r.t === 'sup');
}
