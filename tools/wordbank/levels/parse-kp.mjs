// Parser danh sách A2 Key (KET) và B1 Preliminary (PET) (PLAN-LEVELS mục 2.2). Tất định.
// Chỉ rút DỮ KIỆN (headword, loại từ, biến thể Anh-Mỹ). KHÔNG lưu câu ví dụ.
// parseKP(text, { level:'ket'|'pet', fixups }) -> { entries, suspects, problems, region }
// Dòng ví dụ bắt đầu bằng "•"; một số dòng ví dụ không có dấu chấm cuối và bị dính headword của cột bên cạnh => "mập mờ" (suspects).
// Quy tắc BẢO THỦ: mục mập mờ bị BỎ QUA trừ khi fixups.accept/reject quyết định. Gợi ý tự động chỉ để người duyệt tham khảo.

const T = 'phr v|prep phr|n pl|exclam|abbrev|adj|adv|conj|det|pron|prep|sing|phr|pl|mv|av|n|v';
const POS_GROUP = '\\((?:' + T + ')(?:\\s*(?:,|&)\\s*(?:' + T + '))*\\)';
const POSRE = new RegExp(POS_GROUP, 'g');
const ANNOT = /^\s*\((?:Br Eng|Am Eng|US|UK)[^)]*\)/;
const norm = (s) => String(s).replace(/[’‘]/g, "'").replace(/[“”]/g, '"');

const KP_POS_MAP = { 'n pl': 'n', pl: 'n', sing: 'n', abbrev: 'n', 'phr v': 'v', 'prep phr': 'phr', phr: 'phr', exclam: 'excl' };

function splitPos(group) {
  return group.slice(1, -1).split(/\s*(?:,|&)\s*/).map((s) => s.trim()).filter(Boolean);
}

// Lấy phần đứng sau dấu kết câu cuối cùng (nếu có). Trả { tail, hadSentence }.
function afterSentence(seg) {
  const re = /[.?!"]['"]*(?=\s)/g;
  let last = -1;
  let m;
  while ((m = re.exec(seg))) last = m.index + m[0].length;
  if (last >= 0) return { tail: seg.slice(last).trim(), hadSentence: true, endsSentence: false };
  if (/[.?!"]['"]*$/.test(seg) && !/^[^\s]*\.[a-z]\.$/.test(seg)) return { tail: '', hadSentence: true, endsSentence: true };
  return { tail: seg, hadSentence: false, endsSentence: false };
}

export function findRegionKP(lines) {
  let summary = -1;
  for (let i = 0; i < lines.length; i++) if (/^Summary of points/.test(lines[i].trim())) { summary = i; break; }
  if (summary < 0) return null;
  let end = -1;
  for (let i = summary; i < lines.length; i++) if (lines[i].trim() === 'Appendix 1') { end = i; break; }
  if (end < 0) end = lines.length;
  return { start: summary + 1, end };
}

export function parseKP(text, opts) {
  const o = opts || {};
  const level = o.level || 'ket';
  const fx = o.fixups || {};
  const decided = Object.assign({}, fx.decide || {}); // "dòng|ứng viên" hoặc ứng viên -> 'accept'|'reject'
  const lines = String(text).split(/\r?\n/);
  const region = findRegionKP(lines);
  const problems = [];
  const entries = [];
  const suspects = [];
  if (!region) return { entries, suspects, problems: ['không tìm thấy vùng danh sách chữ cái'], region: null };
  const lineFix = fx.lineFix || {};
  const acceptHints = [];
  for (let i = region.start; i < region.end; i++) {
    let line = norm(lines[i]).trim();
    if (lineFix[level + ':' + (i + 1)] !== undefined) line = norm(lineFix[level + ':' + (i + 1)]);
    if (!line || line.startsWith('|')) continue;
    if (/©|Page \d+ of \d+/.test(line)) continue;
    // Nhóm loại từ bị gãy sang dòng sau: "gold (adj &" + "n)".
    if (new RegExp('\\((?:' + T + ')(?:\\s*(?:,|&)\\s*(?:' + T + '))*\\s*(?:,|&)$').test(line)) {
      const nx = norm(lines[i + 1] || '').trim();
      const mm = new RegExp('^((?:' + T + ')\\))\\s*').exec(nx);
      if (mm) { line = line + ' ' + mm[1]; lines[i + 1] = nx.slice(mm[0].length); }
    }
    // Bỏ chữ cái phân nhóm.
    line = line.replace(/^[A-Z]\s+(?=[a-z(•])/, '').replace(/([.?!"])\s+[A-Z]$/, '$1').trim();
    // Chú thích Anh-Mỹ bị gãy dòng: bỏ phần mở "(Am Eng:" / "(Br Eng:" nếu không đóng được trên dòng này.
    line = line.replace(/\((?:Am|Br) Eng:([^)(]*)$/, (m0, g) => g).replace(/\((?:Am|Br) Eng:(?=[^)]*\()/g, '');
    if (!/\(/.test(line)) continue;
    POSRE.lastIndex = 0;
    let prev = 0;
    let m;
    const matches = [];
    while ((m = POSRE.exec(line))) matches.push({ index: m.index, end: m.index + m[0].length, group: m[0] });
    let nth = 0;
    for (let k = 0; k < matches.length; k++) {
      const mt = matches[k];
      let seg = line.slice(prev, mt.index).trim();
      let end = mt.end;
      const alts = [];
      let rest = line.slice(end);
      let a;
      while ((a = ANNOT.exec(rest))) {
        const inner = a[0].trim().slice(1, -1);
        const colon = inner.indexOf(':');
        if (colon >= 0) alts.push(inner.slice(colon + 1).trim());
        end += a[0].length;
        rest = line.slice(end);
      }
      prev = end;
      if (!seg) continue;
      // Phần đứng sau "•" cuối cùng là cụm/câu ví dụ.
      const bi = seg.lastIndexOf('•');
      const bullet = bi >= 0;
      let body = bullet ? seg.slice(bi + 1).trim() : seg;
      // Mảnh còn dư dấu ")" đóng từ dòng trước: bỏ đến dấu ")" cuối cùng không cân.
      const opens = (body.match(/\(/g) || []).length;
      const closes = (body.match(/\)/g) || []).length;
      if (closes > opens) body = body.slice(body.lastIndexOf(')') + 1).trim();
      if (!body) continue;
      const endsSentence = /[.?!"]['"]*$/.test(body) && !/(?:^|\s)(?:a\.m\.|p\.m\.|O\.K\.)$/i.test(body);
      if (endsSentence) continue; // nhãn loại từ đứng sau câu ví dụ
      const s = afterSentence(body);
      let head = s.tail;
      if (!head) continue;
      const ambiguous = bullet && (!s.hadSentence || head.split(/\s+/).length > 3 || /^['"]/.test(head));
      nth++;
      const rec = { head, pos: splitPos(mt.group), alts, line: i + 1 };
      if (ambiguous) {
        suspects.push({ id: nth > 1 ? (i + 1) + '.' + nth : String(i + 1), line: i + 1, candidate: head, pos: splitPos(mt.group), alts, context: line, level, hint: null });
        continue;
      }
      if (/^\(.*\)$/.test(head)) continue; // mảnh ô, không phải headword
      entries.push(rec);
    }
  }
  suspects.forEach((sp) => { sp.hint = hintFor(sp.candidate, sp.line, entries); });
  // Áp quyết định của fixups.decide[<level>:<id>] = 'reject' | 'accept' (lấy từ cuối cụm) | '<headword>'.
  const kept = [];
  suspects.forEach((sp) => {
    const d = decided[level + ':' + sp.id];
    if (d === undefined) { kept.push(sp); return; }
    if (d === 'reject') return;
    const word = d === 'accept' ? sp.hint.word : d;
    entries.push({ head: word, pos: sp.pos, alts: sp.alts, line: sp.line, viaFixup: true });
  });
  return { entries, suspects: kept, problems, region };
}

// Gợi ý (KHÔNG áp dụng, chỉ để người duyệt tham khảo). Ứng viên = từ cuối của cụm ví dụ.
//  - đã có headword trùng (hoặc dạng số nhiều) trong cùng danh sách        => 'reject' (nhãn của ví dụ)
//  - có headword đã nhận cùng 2 chữ đầu trong ±12 dòng gần đó              => 'accept'
//  - còn lại                                                               => 'reject'
function hintFor(cand, line, entries) {
  const words = cand.replace(/[^\w'\s/-]/g, ' ').split(/\s+/).filter(Boolean);
  const last = (words[words.length - 1] || '').toLowerCase();
  const heads = new Set(entries.map((e) => e.head.toLowerCase()));
  const dup = heads.has(last) || heads.has(last + 's') || heads.has(last + 'es') || heads.has(last.replace(/s$/, '')) || heads.has(last.replace(/ing$/, '')) || heads.has(last.replace(/ed$/, ''));
  const same = entries.some((e) => Math.abs(e.line - line) <= 12 && e.head.toLowerCase().slice(0, 2) === last.slice(0, 2));
  return { word: last, suggest: !dup && same && last.length > 1 ? 'accept' : 'reject' };
}
