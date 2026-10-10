// Đọc Google Sheet đã xuất bản (PLAN-SOANBAI E5). Không gửi dữ liệu nào lên ngoài URL người dùng dán.
export class GsheetError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const NOT_SHEET = 'Đây không phải link Google Sheet.';
const NETWORK = 'Không kết nối được Google. Kiểm tra mạng Internet. Nếu đang dùng bản offline/USB thì cần có mạng mới đọc được link.\nHoặc tải trang tính về dạng CSV (Tệp > Tải xuống > CSV) rồi kéo thả vào đây.';
const NOT_PUBLIC = 'Trang tính chưa công khai. Vào Tệp > Chia sẻ > Xuất bản lên web, chọn CSV, bấm Xuất bản rồi dán link mới.';

function gidOf(u) {
  const q = u.searchParams.get('gid');
  if (q != null && q !== '') return q;
  const m = /(?:^#|&)gid=(\d+)/.exec(u.hash);
  return m ? m[1] : '';
}

// Chuyển link bất kỳ của Google Sheet thành link tải CSV. Link sai: ném GsheetError.
export function toCsvUrl(input) {
  let u;
  try {
    u = new URL(String(input || '').trim());
  } catch (err) {
    throw new GsheetError('notsheet', NOT_SHEET);
  }
  if (u.hostname !== 'docs.google.com' || (u.protocol !== 'https:' && u.protocol !== 'http:')) throw new GsheetError('notsheet', NOT_SHEET);
  const gid = gidOf(u);
  const gp = gid ? '&gid=' + encodeURIComponent(gid) : '';
  let m = /^\/spreadsheets\/d\/e\/([^/]+)\/(pubhtml|pub)\b/.exec(u.pathname);
  if (m) {
    if (m[2] === 'pub' && /(^|&)output=csv(&|$)/.test(u.search.slice(1))) return u.origin + u.pathname + u.search;
    return `https://docs.google.com/spreadsheets/d/e/${m[1]}/pub?output=csv${gp}`;
  }
  m = /^\/spreadsheets\/d\/([^/]+)\/gviz\/tq\b/.exec(u.pathname);
  if (m && /tqx=out:csv/.test(u.search)) return u.origin + u.pathname + u.search;
  m = /^\/spreadsheets\/d\/([^/]+)(?:\/|$)/.exec(u.pathname);
  if (m && m[1] !== 'e') return `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv${gp}`;
  throw new GsheetError('notsheet', NOT_SHEET);
}

// Trả Promise<string> (văn bản CSV). opts: { timeoutMs, fetchImpl }.
export async function fetchSheetCsv(url, opts) {
  const o = opts || {};
  const csvUrl = toCsvUrl(url);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new GsheetError('network', NETWORK);
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => { if (ctl) ctl.abort(); }, o.timeoutMs || 15000);
  let res;
  try {
    res = await (o.fetchImpl || fetch)(csvUrl, { signal: ctl ? ctl.signal : undefined, credentials: 'omit' });
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === 'AbortError') throw new GsheetError('timeout', 'Google phản hồi quá lâu. Thử lại sau ít phút.');
    throw new GsheetError('network', NETWORK);
  }
  try {
    if (res.status === 400 || res.status === 404) throw new GsheetError('notfound', 'Link không đúng hoặc trang tính đã bị xoá.');
    if (res.status === 401 || res.status === 403) throw new GsheetError('private', NOT_PUBLIC);
    if (!res.ok) throw new GsheetError('http', `Google trả lỗi ${res.status}. Thử lại sau ít phút.`);
    const text = await res.text();
    if (/^\s*</.test(text)) throw new GsheetError('private', NOT_PUBLIC);
    return text;
  } catch (err) {
    if (err instanceof GsheetError) throw err;
    if (err && err.name === 'AbortError') throw new GsheetError('timeout', 'Google phản hồi quá lâu. Thử lại sau ít phút.');
    throw new GsheetError('network', NETWORK);
  } finally {
    clearTimeout(timer);
  }
}
