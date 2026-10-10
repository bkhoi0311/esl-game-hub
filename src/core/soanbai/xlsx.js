// Đọc / ghi .xlsx không phụ thuộc thư viện (PLAN-SOANBAI E3, quyết định người dùng: không fflate).
// ĐỌC: bộ phân tích thư mục trung tâm của zip tự viết + DecompressionStream('deflate-raw') của trình duyệt (Chromium 80+).
// GHI: zip phương thức "stored" (không nén) với crc32 tự viết. Parse XML bằng regex (không DOMParser) để test được bằng node.
// Không hỗ trợ .xls cũ, zip64, file có mật khẩu.

export class XlsxError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const MSG_BAD = 'Không mở được file Excel (có thể bị khoá mật khẩu hoặc hỏng).';
const MSG_NO_DS = 'Trình duyệt này chưa đọc được file Excel. Hãy lưu file thành CSV UTF-8 rồi nhập lại.';

// ---------- crc32 ----------

let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  CRC_TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC_TABLE[n] = c >>> 0;
  }
  return CRC_TABLE;
}

export function crc32(bytes) {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- zip: đọc ----------

function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

// Trả Map tên -> { method, compSize, size, offset, flags }.
export function zipEntries(bytes) {
  let eocd = -1;
  const lo = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= lo; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) { eocd = i; break; }
  }
  if (eocd < 0) throw new XlsxError('bad', MSG_BAD);
  const count = u16(bytes, eocd + 10);
  let p = u32(bytes, eocd + 16);
  const map = new Map();
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || u32(bytes, p) !== 0x02014b50) throw new XlsxError('bad', MSG_BAD);
    const flags = u16(bytes, p + 8);
    const method = u16(bytes, p + 10);
    const compSize = u32(bytes, p + 20);
    const size = u32(bytes, p + 24);
    const nameLen = u16(bytes, p + 28);
    const extraLen = u16(bytes, p + 30);
    const commentLen = u16(bytes, p + 32);
    const offset = u32(bytes, p + 42);
    const name = new TextDecoder('utf-8').decode(bytes.subarray(p + 46, p + 46 + nameLen));
    map.set(name, { method, compSize, size, offset, flags });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return map;
}

async function inflateRaw(data) {
  if (typeof DecompressionStream === 'undefined') throw new XlsxError('nods', MSG_NO_DS);
  try {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (err) {
    throw new XlsxError('bad', MSG_BAD);
  }
}

async function zipRead(bytes, entries, name) {
  const e = entries.get(name);
  if (!e) return null;
  if (e.flags & 1) throw new XlsxError('bad', MSG_BAD);
  const o = e.offset;
  if (o + 30 > bytes.length || u32(bytes, o) !== 0x04034b50) throw new XlsxError('bad', MSG_BAD);
  const start = o + 30 + u16(bytes, o + 26) + u16(bytes, o + 28);
  const raw = bytes.subarray(start, start + e.compSize);
  if (e.method === 0) return raw;
  if (e.method === 8) return inflateRaw(raw);
  throw new XlsxError('bad', MSG_BAD);
}

// ---------- XML nhỏ ----------

const utf8 = (b) => new TextDecoder('utf-8').decode(b);

function unescapeXml(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, g) => {
    if (g === 'amp') return '&';
    if (g === 'lt') return '<';
    if (g === 'gt') return '>';
    if (g === 'quot') return '"';
    if (g === 'apos') return "'";
    const code = g[1] === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
    return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
  });
}

function attr(tag, name) {
  const m = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*"([^"]*)"').exec(tag) || new RegExp("(?:^|\\s)" + name + "\\s*=\\s*'([^']*)'").exec(tag);
  return m ? unescapeXml(m[1]) : null;
}

function textOf(xml) {
  const out = [];
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m;
  while ((m = re.exec(xml))) out.push(unescapeXml(m[1]));
  return out.join('');
}

function parseShared(xml) {
  const list = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) list.push(textOf(m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')));
  return list;
}

function colIndex(ref) {
  const m = /^([A-Za-z]+)/.exec(ref);
  let n = 0;
  if (!m) return 0;
  for (let i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) & 31);
  return n - 1;
}

function parseSheet(xml, shared, maxRows) {
  const rows = [];
  let truncated = false;
  const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rm;
  let seq = 0;
  while ((rm = rowRe.exec(xml))) {
    seq++;
    const rAttr = attr(rm[1], 'r');
    const rowNum = rAttr ? parseInt(rAttr, 10) : seq;
    if (rowNum > maxRows) { truncated = true; break; }
    const cells = [];
    const body = rm[2] || '';
    const cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    let nextCol = 0;
    while ((cm = cRe.exec(body))) {
      const ref = attr(cm[1], 'r');
      const col = ref ? colIndex(ref) : nextCol;
      nextCol = col + 1;
      const t = attr(cm[1], 't');
      const inner = cm[2] || '';
      let val = '';
      if (t === 'inlineStr') {
        val = textOf(inner);
      } else {
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner);
        const raw = v ? unescapeXml(v[1]) : '';
        if (t === 's') val = shared[parseInt(raw, 10)] || '';
        else if (t === 'b') val = raw === '1' ? 'TRUE' : 'FALSE';
        else if (t === 'e') val = '';
        else val = raw;
      }
      while (cells.length < col) cells.push('');
      cells[col] = val;
    }
    while (rows.length < rowNum - 1) rows.push([]);
    rows[rowNum - 1] = cells.map((c) => String(c).trim());
  }
  return { rows, truncated };
}

// bytes: Uint8Array của file .xlsx. Trả Promise<[{ name, rows, truncated }]>.
export async function readXlsx(bytes, opts) {
  const maxRows = (opts && opts.maxRows) || 2000;
  const entries = zipEntries(bytes);
  const wb = await zipRead(bytes, entries, 'xl/workbook.xml');
  if (!wb) throw new XlsxError('bad', MSG_BAD);
  const wbXml = utf8(wb);
  const relsBytes = await zipRead(bytes, entries, 'xl/_rels/workbook.xml.rels');
  const rels = {};
  if (relsBytes) {
    const re = /<Relationship\b[^>]*>/g;
    let m;
    const xml = utf8(relsBytes);
    while ((m = re.exec(xml))) {
      const id = attr(m[0], 'Id');
      const target = attr(m[0], 'Target');
      if (id && target) rels[id] = target;
    }
  }
  const ssBytes = await zipRead(bytes, entries, 'xl/sharedStrings.xml');
  const shared = ssBytes ? parseShared(utf8(ssBytes)) : [];
  const sheets = [];
  const re = /<sheet\b[^>]*>/g;
  let m;
  let n = 0;
  while ((m = re.exec(wbXml))) {
    n++;
    const name = attr(m[0], 'name') || 'Sheet' + n;
    const rid = attr(m[0], 'r:id') || attr(m[0], 'id');
    let target = rid && rels[rid] ? rels[rid] : 'worksheets/sheet' + n + '.xml';
    target = target.charAt(0) === '/' ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    const data = await zipRead(bytes, entries, target);
    if (!data) continue;
    const parsed = parseSheet(utf8(data), shared, maxRows);
    sheets.push({ name, rows: parsed.rows, truncated: parsed.truncated });
  }
  if (!sheets.length) throw new XlsxError('bad', MSG_BAD);
  return sheets;
}

// ---------- ghi ----------

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function colName(i) {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetXml(rows, widths) {
  const cols = widths && widths.length
    ? '<cols>' + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>'
    : '';
  const body = rows.map((r, ri) => {
    const cells = r.map((v, ci) => {
      const s = String(v == null ? '' : v);
      if (s === '') return '';
      return `<c r="${colName(ci)}${ri + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(s)}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + cols + `<sheetData>${body}</sheetData></worksheet>`;
}

function safeSheetName(name, i) {
  const n = String(name || '').replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31);
  return n || 'Sheet' + (i + 1);
}

// sheets: [{ name, rows: string[][], widths?: number[] }] -> Uint8Array (zip stored).
export function writeXlsx(sheets) {
  const enc = new TextEncoder();
  const files = [];
  const add = (name, text) => files.push({ name, data: enc.encode(text) });
  const names = sheets.map((s, i) => safeSheetName(s.name, i));
  add('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
    '</Types>');
  add('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  add('xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>');
  add('xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  add('xl/styles.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>');
  sheets.forEach((s, i) => add(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows || [], s.widths)));
  return zipStore(files);
}

function zipStore(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const push = (arr) => { parts.push(arr); offset += arr.length; };
  files.forEach((f) => {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const head = new Uint8Array(30);
    const dv = new DataView(head.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0x0800, true);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0x0021, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, f.data.length, true);
    dv.setUint32(22, f.data.length, true);
    dv.setUint16(26, name.length, true);
    dv.setUint16(28, 0, true);
    central.push({ name, crc, size: f.data.length, offset });
    push(head);
    push(name);
    push(f.data);
  });
  const cdStart = offset;
  central.forEach((c) => {
    const h = new Uint8Array(46);
    const dv = new DataView(h.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(8, 0x0800, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0, true);
    dv.setUint16(14, 0x0021, true);
    dv.setUint32(16, c.crc, true);
    dv.setUint32(20, c.size, true);
    dv.setUint32(24, c.size, true);
    dv.setUint16(28, c.name.length, true);
    dv.setUint32(42, c.offset, true);
    push(h);
    push(c.name);
  });
  const cdSize = offset - cdStart;
  const end = new Uint8Array(22);
  const dv = new DataView(end.buffer);
  dv.setUint32(0, 0x06054b50, true);
  dv.setUint16(8, central.length, true);
  dv.setUint16(10, central.length, true);
  dv.setUint32(12, cdSize, true);
  dv.setUint32(16, cdStart, true);
  push(end);
  const out = new Uint8Array(offset);
  let p = 0;
  parts.forEach((a) => { out.set(a, p); p += a.length; });
  return out;
}
