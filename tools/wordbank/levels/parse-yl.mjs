// Parser danh sách Starters / Movers / Flyers (PLAN-LEVELS mục 2.1). Tất định, chỉ rút DỮ KIỆN (từ, loại từ, cấp, ghi chú ngắn).
// Nguồn: bảng "Pre A1 Starters, A1 Movers and A2 Flyers alphabetic vocabulary list" (mỗi mục có đuôi S/M/F).
// parseYL(text, fixups) -> { entries:[{raw,head,pos,note,level,line}], names:{S,M,F}, problems:[], rawCount }
// Tệp nguồn (có bản quyền) nằm ở tools/wordbank/src/ và KHÔNG được commit; module này không chứa văn bản của nó.

export const YL_POS = ['adj', 'adv', 'conj', 'det', 'dis', 'excl', 'int', 'n', 'poss', 'prep', 'pron', 'v', 'title'];
const POS_ALT = YL_POS.join('|');
const POS_EXPR = '(?:' + POS_ALT + ')(?:\\s*\\+\\s*(?:' + POS_ALT + '))*';
export const LV_CODE = { S: 'starters', M: 'movers', F: 'flyers' };

const norm = (s) => String(s).replace(/[’‘]/g, "'");
const TAIL = /\s[SMF](?=\s|$)/;

function isGarbage(t) {
  if (!t) return true;
  if (/^\|\s*:?-+/.test(t)) return true;
  if (/alphabetic vocabulary list|Grammatical key|First appears at/i.test(t)) return true;
  if (/^(Pre A1 Starters, A1 Movers and|A2 Flyers alphabetic vocabulary list)$/.test(t)) return true;
  if (/^(adj|adv|conj|det|dis|excl|int|n|poss|prep|pron|v)\s{2}\S/.test(t)) return true;
  if (/^[A-Z]$/.test(t)) return true;
  return false;
}

// Tách dòng rời thành các ô: ranh giới là đuôi cấp (ô xong) hoặc >= 2 dấu cách (ô chưa xong).
export function splitFreeLine(line) {
  const s = line.trim();
  const cells = [];
  let pos = 0;
  while (pos < s.length) {
    const rest = s.slice(pos);
    const tail = TAIL.exec(rest);
    const ws = /\s{2,}/.exec(rest);
    const tailEnd = tail ? tail.index + tail[0].length : Infinity;
    if (tail && (!ws || tailEnd <= ws.index + 0 || tail.index < ws.index)) {
      cells.push({ text: rest.slice(0, tailEnd).trim(), done: true });
      pos += tailEnd;
    } else if (ws) {
      const t = rest.slice(0, ws.index).trim();
      if (t) cells.push({ text: t, done: false });
      pos += ws.index + ws[0].length;
    } else {
      cells.push({ text: rest.trim(), done: false });
      pos = s.length;
    }
    while (pos < s.length && s[pos] === ' ') pos++;
  }
  return cells;
}

// Tách "headword POS [ghi chú] CẤP". Trả null nếu không đúng dạng.
export function parseEntry(raw) {
  const t = raw.trim().replace(/\s+/g, ' ');
  const m = /^(.*\S)\s+([SMF])$/.exec(t);
  if (!m) return null;
  const body = m[1];
  const level = LV_CODE[m[2]];
  // Tìm loại từ đầu tiên nằm ngoài ngoặc đơn.
  const re = new RegExp('\\s(' + POS_EXPR + ')(?=\\s|$)', 'g');
  let hit = null;
  let x;
  while ((x = re.exec(body))) {
    const before = body.slice(0, x.index);
    const open = (before.match(/\(/g) || []).length - (before.match(/\)/g) || []).length;
    if (open === 0) { hit = x; break; }
  }
  if (!hit) return { raw: t, head: body, pos: [], note: '', level, noPos: true };
  const head = body.slice(0, hit.index).trim();
  const pos = hit[1].split('+').map((p) => p.trim());
  let note = body.slice(hit.index + hit[0].length).trim();
  // "my poss adj", "her poss adj + pron": poss đi kèm adj/pron, không phải ghi chú nghĩa
  if (pos[0] === 'poss') note = note.replace(/^(?:adj|pron)(?:\s*\+\s*(?:adj|pron))*\s*/, '').trim();
  if (!head) return null;
  return { raw: t, head, pos, note, level };
}

export function findRegion(lines) {
  let start = -1;
  for (let i = 1; i < lines.length; i++) {
    if (/^A2 Flyers alphabetic vocabulary list$/.test(lines[i].trim()) && /^Pre A1 Starters, A1 Movers and/.test(lines[i - 1].trim())) { start = i + 1; break; }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^A2 Flyers grammatical vocabulary list$/.test(lines[i].trim())) { end = i; break; }
  }
  return { start, end };
}

// Tên riêng: bảng "Names" cuối mỗi phần danh sách riêng của từng cấp.
export function parseNames(lines) {
  const names = { S: [], M: [], F: [] };
  let lv = null;
  let inNames = false;
  lines.forEach((ln) => {
    const t = ln.trim();
    if (/^Pre A1 Starters A.Z wordlist$|^\d*\s*Pre A1 Starters A.Z wordlist\s*\d*$/.test(t)) lv = 'S';
    else if (/^\d*\s*A1 Movers A.Z wordlist\s*\d*$/.test(t)) lv = 'M';
    else if (/^\d*\s*A2 Flyers A.Z wordlist\s*\d*$/.test(t)) lv = 'F';
    if (/alphabetic vocabulary list/.test(t) && !/A.Z wordlist/.test(t)) inNames = false;
    if (t === 'Names') { inNames = true; return; }
    if (inNames && lv) {
      if (t.startsWith('|')) {
        if (/^\|\s*:?-+/.test(t)) return;
        t.split('|').slice(1, -1).map((c) => norm(c).trim()).filter(Boolean).forEach((c) => names[lv].push(c));
      } else if (!/^Candidates will be expected to recognise/.test(t) && t) inNames = false;
    }
  });
  return names;
}

export function parseYL(text, fixups) {
  const fx = fixups || {};
  const rewrite = fx.rewrite || {};
  const lines = String(text).split(/\r?\n/);
  const region = findRegion(lines);
  const problems = [];
  if (!region) return { entries: [], names: parseNames(lines), problems: ['không tìm thấy vùng danh sách gộp S/M/F'], rawCount: 0 };
  const pending = ['', '', '', '', '', ''];
  const raws = [];
  const push = (raw, line) => {
    const key = raw.replace(/\s+/g, ' ').trim();
    if (rewrite[key]) rewrite[key].forEach((r) => raws.push({ raw: r, line }));
    else raws.push({ raw: key, line });
  };
  const feed = (col, text, done, line) => {
    if (!text) return;
    pending[col] = pending[col] ? pending[col] + ' ' + text : text;
    if (done || /\s[SMF]$/.test(pending[col])) {
      push(pending[col], line);
      pending[col] = '';
    }
  };
  for (let i = region.start; i < region.end; i++) {
    const t = norm(lines[i]).trim();
    if (isGarbage(t)) continue;
    if (t.startsWith('|')) {
      const cells = t.split('|').slice(1, -1).map((c) => c.trim());
      cells.forEach((c, col) => feed(col, c, false, i + 1));
    } else {
      splitFreeLine(t).forEach((c, col) => feed(col, c.text, c.done, i + 1));
    }
  }
  pending.forEach((p, col) => { if (p) problems.push(`ô dở dang ở cột ${col}: "${p}"`); });
  const dropSet = new Set((fx.drop || []).map((s) => s.toLowerCase()));
  const posOverride = fx.posOverride || {};
  const entries = [];
  raws.forEach(({ raw, line }) => {
    if (dropSet.has(raw.toLowerCase())) return;
    let e = parseEntry(raw);
    if (!e) { problems.push(`dòng ${line}: không tách được mục "${raw}"`); return; }
    if (e.noPos) {
      const o = posOverride[e.head.toLowerCase()] || posOverride[e.head.toLowerCase().replace(/\s*\(.*\)/, '')];
      if (o) { e.pos = o.split('+'); e.noPos = false; }
      else { problems.push(`dòng ${line}: mục không có loại từ "${raw}"`); return; }
    }
    e.line = line;
    entries.push(e);
  });
  return { entries, names: parseNames(lines), problems, rawCount: raws.length };
}
