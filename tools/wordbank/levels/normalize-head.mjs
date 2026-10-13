// Chuẩn hoá headword của danh sách Cambridge thành lemma (PLAN-LEVELS mục 2.3). Thuần, tất định.
// normalizeHead(head, fixups) -> { word, alts[], pl, note, display, problems[] }

export const IRREGULAR_PL = {
  children: 'child', feet: 'foot', men: 'man', women: 'woman', mice: 'mouse', leaves: 'leaf', teeth: 'tooth', people: 'person',
  geese: 'goose', wolves: 'wolf', knives: 'knife', lives: 'life', shelves: 'shelf', thieves: 'thief', halves: 'half',
};
const PARTICLES = new Set(['to', 'with', 'on', 'of', 'up', 'off', 'out', 'in', 'at', 'for', 'by', 'from', 'that', 'upon', 'about', 'over', 'down', 'back', 'away', 'into', 'together', 'sth', 'sb', 'the', 'as', 'got', 'not', 'something', 'someone', 'somebody', 'it', 'after', 'forward', 'backwards']);
const ABBR_LOWER = new Set(['cm', 'km', 'kg', 'mm', 'lab', 'tv', 'id', 'dj', 'dvd', 'cd', 'pc', 'it', 'cv']);

function topGroups(s) {
  const out = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') { if (depth === 0) start = i; depth++; }
    else if (s[i] === ')') { depth--; if (depth === 0 && start >= 0) { out.push({ start, end: i + 1, content: s.slice(start + 1, i) }); start = -1; } if (depth < 0) depth = 0; }
  }
  return out;
}

// "sweet(s)" -> ["sweet", "sweets"]; "wool(len)" -> ["wool","woolen"]; "chemist('s)" -> ["chemist","chemist's"]
function attachedOptional(text) {
  const m = /^(.*?)([^\s(])\(([^)\s]+)\)(.*)$/.exec(text);
  if (!m) return null;
  const base = m[1] + m[2] + m[4];
  const full = m[1] + m[2] + m[3] + m[4];
  return { base, full };
}

export function normalizeHead(head0, fixups) {
  const fx = fixups || {};
  const problems = [];
  let h = String(head0).replace(/[’‘]/g, "'").replace(/…/g, '...').replace(/\s+/g, ' ').trim();
  h = h.replace(/[,;:]+$/, '').trim();
  if (fx.heads && fx.heads[h]) {
    const f = fx.heads[h];
    return { word: f.word, alts: f.alts || [], pl: f.pl || '', note: f.note || '', display: f.display || '', problems, skip: !!f.skip };
  }
  let display = '';
  const alts = [];
  let note = '';
  let pl = '';
  // 1) nhóm ngoặc đơn cấp ngoài cùng, xử lý từ phải sang trái.
  const groups = topGroups(h).filter((g) => g.start === 0 || h[g.start - 1] === ' ');
  for (let gi = groups.length - 1; gi >= 0; gi--) {
    const g = groups[gi];
    const c = g.content.trim();
    const before = h.slice(0, g.start).replace(/\s+$/, '');
    const after = h.slice(g.end).replace(/^\s+/, '');
    const joinMain = () => (before + (before && after ? ' ' : '') + after).trim();
    let m;
    if ((m = /^(?:UK|US|Br Eng|Am Eng|Br|Am)\s+(.+)$/.exec(c))) {
      // biến thể Anh-Mỹ thay k chữ cuối của phần đứng trước (k = số chữ của biến thể)
      const vt = m[1].trim();
      const k = vt.split(/\s+/).length;
      const bt = before.split(' ');
      const stem = bt.slice(0, Math.max(0, bt.length - k)).join(' ');
      const variant = ((stem ? stem + ' ' : '') + vt + (after ? ' ' + after : '')).trim();
      const vexp = attachedOptional(variant);
      if (vexp) { alts.push(vexp.base, vexp.full); } else alts.push(variant);
      h = joinMain();
    } else if (/^s \+ pl$/.test(c)) {
      pl = '__same__';
      h = joinMain();
    } else if (/^[A-Z][A-Z ]{3,}$/.test(c) || /^[A-Z ]*[A-Z]{2,}[A-Z ]*\s[A-Z ]+$/.test(c)) {
      note = c.toLowerCase(); // nhãn nghĩa viết hoa toàn bộ: (PLANNING), (SOCIAL MEDIA)
      h = joinMain();
    } else if (/^(?:[A-Z]{2,3}|cm|km|kg|mm|lab)$/.test(c) && !after) {
      alts.push(c.toLowerCase());
      h = joinMain();
    } else if (c.split(/[\s/]+/).every((w) => PARTICLES.has(w.toLowerCase()))) {
      // tuỳ chọn: lemma bỏ phần ngoặc, biến thể có phần ngoặc
      const withIt = (before + ' ' + c.replace(/\//g, ' ') + (after ? ' ' + after : '')).trim();
      if (c.indexOf('/') < 0) alts.push(withIt);
      h = joinMain();
    } else if (/^[a-z]+$/.test(before.replace(/\s/g, '')) === false && false) {
      h = joinMain();
    } else if (/^[A-Z]{1,4}$/.test(before)) {
      // viết tắt + giải nghĩa: PC (personal computer)
      alts.push(c.toLowerCase());
      h = joinMain();
    } else {
      note = c;
      h = joinMain();
    }
  }
  // 2) chữ tuỳ chọn gắn liền: blond(e), kid(s), photo(graph)
  let guard = 0;
  let exp;
  while ((exp = attachedOptional(h)) && guard++ < 3) {
    alts.push(exp.full);
    h = exp.base;
  }
  // 3) dấu gạch chéo
  if (h.indexOf('/') >= 0) {
    const spaced = /\s\/\s|\s\/|\/\s/.test(h);
    const parts = h.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
    const multi = parts.some((p) => p.indexOf(' ') >= 0);
    if (parts.length === 2 && IRREGULAR_PL[parts[1].toLowerCase()] === parts[0].toLowerCase()) {
      h = parts[0];
      pl = parts[1].toLowerCase();
    } else if (!multi || spaced) {
      h = parts[0];
      alts.push(...parts.slice(1));
    } else {
      // dạng phân phối: "city/town centre", "take a photo/picture"
      const last = parts[parts.length - 1].split(' ');
      const first = parts[0].split(' ');
      if (first.length === 1 && last.length > 1) {
        const tail = last.slice(1).join(' ');
        h = parts[0] + ' ' + tail;
        parts.slice(1, -1).forEach((p) => alts.push(p + ' ' + tail));
        alts.push(parts[parts.length - 1]);
      } else if (last.length === 1 && first.length > 1) {
        const stem = first.slice(0, -1).join(' ');
        h = parts[0];
        parts.slice(1).forEach((p) => alts.push(stem + ' ' + p));
      } else {
        problems.push(`dấu "/" chưa xử lý: "${head0}"`);
        h = parts[0];
      }
    }
  }
  h = h.replace(/\s+/g, ' ').replace(/^[•+\s]+|[,;:\s]+$/g, '').trim();
  // hiển thị
  const hasUpper = /[A-Z]/.test(h);
  if (hasUpper) display = h;
  let word = h.toLowerCase();
  if (display && display === word) display = '';
  if (pl === '__same__') pl = word;
  const altList = [];
  alts.forEach((a) => {
    const x = String(a).replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
    if (x && x !== word && altList.indexOf(x) < 0) altList.push(x);
  });
  if (!/^[a-zé0-9][a-zé0-9 '.\-@]*$/.test(word)) problems.push(`lemma lạ: "${word}" (từ "${head0}")`);
  return { word, alts: altList, pl, note, display, problems };
}
