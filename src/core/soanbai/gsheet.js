// Đọc Google Sheet đã xuất bản (PLAN-SOANBAI E5). Không gửi dữ liệu nào lên ngoài URL người dùng dán.
import { t, addStrings } from '../../i18n/index.js';
import VI from '../../i18n/strings/soanbai.vi.js';

addStrings('soanbai', VI);
export class GsheetError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}


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
    throw new GsheetError('notsheet', t('sb.gs.notSheet'));
  }
  if (u.hostname !== 'docs.google.com' || (u.protocol !== 'https:' && u.protocol !== 'http:')) throw new GsheetError('notsheet', t('sb.gs.notSheet'));
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
  throw new GsheetError('notsheet', t('sb.gs.notSheet'));
}

// Trả Promise<string> (văn bản CSV). opts: { timeoutMs, fetchImpl }.
export async function fetchSheetCsv(url, opts) {
  const o = opts || {};
  const csvUrl = toCsvUrl(url);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new GsheetError('network', t('sb.gs.network'));
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => { if (ctl) ctl.abort(); }, o.timeoutMs || 15000);
  let res;
  try {
    res = await (o.fetchImpl || fetch)(csvUrl, { signal: ctl ? ctl.signal : undefined, credentials: 'omit' });
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === 'AbortError') throw new GsheetError('timeout', t('sb.gs.slow'));
    throw new GsheetError('network', t('sb.gs.network'));
  }
  try {
    if (res.status === 400 || res.status === 404) throw new GsheetError('notfound', t('sb.gs.badLink'));
    if (res.status === 401 || res.status === 403) throw new GsheetError('private', t('sb.gs.notPublic'));
    if (!res.ok) throw new GsheetError('http', t('sb.gs.status', { status: res.status }));
    const text = await res.text();
    if (/^\s*</.test(text)) throw new GsheetError('private', t('sb.gs.notPublic'));
    return text;
  } catch (err) {
    if (err instanceof GsheetError) throw err;
    if (err && err.name === 'AbortError') throw new GsheetError('timeout', t('sb.gs.slow'));
    throw new GsheetError('network', t('sb.gs.network'));
  } finally {
    clearTimeout(timer);
  }
}
