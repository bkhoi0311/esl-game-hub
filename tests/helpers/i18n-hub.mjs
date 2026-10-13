// Trợ giúp Playwright chung cho các ca kiểm song ngữ của Hub (PLAN-I18N-HUB F.3).
// Dùng:  import { startServer, launch, openHub, vietnameseIn, overflow, hit56, noI18nErrors, shot, VIEWPORTS } from './helpers/i18n-hub.mjs';
// Cổng: PORT=... (mỗi agent một cổng: 5211 A, 5212 B, 5213 C, 5214 D, 5215 E, 5216 F). Chromium 109 thật:
//   node --import ~/.cache/esl-chromium109/hook.mjs tests/<ca>.mjs   (launch() tự dùng playwright-core của hook khi C109=1)
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import os from 'node:os';

export const SHOT_DIR = process.env.SHOT_DIR || '/Users/haku/Desktop/BAO KHOI/CLAUDE/PROJECTS/bang-nhieu-nguoi-viet/screens/i18n-hub';
export const UA_CLASSIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.5414.120 Safari/537.36 ClassIn X/6.0.9.1813';
export const VIEWPORTS = [[1280, 720], [1920, 1080], [960, 540]]; // + [1280, 647] cho thanh trên
export const VN = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

export async function startServer(port = Number(process.env.PORT || 5211)) {
  const server = await createServer({ server: { port, strictPort: true }, logLevel: 'error' });
  await server.listen();
  return { server, base: `http://localhost:${port}/`, port, close: () => server.close() };
}

// Chrome mới (mặc định) hoặc Chromium 109 (C109=1).
export async function launch(opts = {}) {
  let chromium;
  if (process.env.C109 === '1') {
    const dir = process.env.CHROMIUM109_DIR || `${os.homedir()}/.cache/esl-chromium109`;
    ({ chromium } = await import(`${dir}/node_modules/playwright-core/index.mjs`));
  } else ({ chromium } = await import('playwright'));
  return chromium.launch(opts).catch(() => chromium.launch({ channel: 'chrome', ...opts }));
}

// Mở Hub. lang: 'vi' | 'en' (qua ?ui=); extraQuery: 'lang=en' để giả ClassIn; test=1 để lõi in "[i18n] thiếu khoá".
// Trả { ctx, page, log, close }. log.errors = lỗi trang + console.error (kể cả thiếu khoá).
export async function openHub(browser, { base, lang, w = 1280, h = 720, hash = '', extraQuery = '', classin = false, storageLang = null, touch = false, ready = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, userAgent: classin ? UA_CLASSIN : undefined });
  if (storageLang) await ctx.addInitScript((l) => { try { localStorage.setItem('eslhub.ui', l); } catch { /* bỏ qua */ } }, storageLang);
  const page = await ctx.newPage();
  const log = { errors: [], requests: [] };
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push('console: ' + m.text()); });
  page.on('request', (r) => log.requests.push(r.url()));
  const q = ['test=1', lang ? `ui=${lang}` : '', extraQuery].filter(Boolean).join('&');
  await page.goto(`${base}?${q}${hash}`);
  if (ready) await page.waitForSelector('#app .nav-link, #app *', { timeout: 15000 });
  return { ctx, page, log, close: () => ctx.close() };
}

// Chữ HIỂN THỊ (nút, nhãn, aria-label, title, placeholder, alt) có dấu tiếng Việt trong phạm vi `scope`.
// Bỏ: phần tử [data-i18n-data] (ô dữ liệu bài), input/textarea value, .lib-vi, thẻ chữ trong game đang chơi (.stage canvas/.card-word).
export async function vietnameseIn(page, scope = '#app, .modal-overlay') {
  return page.evaluate(({ scope, src }) => {
    const VN = new RegExp(src, 'i');
    const skip = (el) => el.closest('[data-i18n-data], .lib-vi, [data-i18n-keep]');
    const out = new Set();
    for (const root of document.querySelectorAll(scope)) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || skip(el) || /^(SCRIPT|STYLE)$/.test(el.tagName)) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (VN.test(n.nodeValue)) out.add(n.nodeValue.trim());
      }
      for (const el of root.querySelectorAll('[aria-label],[title],[placeholder],[alt]')) {
        if (skip(el)) continue;
        for (const a of ['aria-label', 'title', 'placeholder', 'alt']) {
          const v = el.getAttribute(a);
          if (v && VN.test(v)) out.add(`${a}: ${v}`);
        }
      }
    }
    return [...out];
  }, { scope, src: VN.source });
}

// Phần tử cắt chữ (nowrap/overflow hidden mà scrollWidth > clientWidth), phần tử vượt mép phải hộp chứa, cuộn ngang trang.
export async function overflow(page, sel = 'body', { allow = ['.pack-chip > span', '.lib-card b'] } = {}) {
  return page.evaluate(({ sel, allow }) => {
    const bad = [];
    const allowed = (el) => allow.some((s) => el.matches(s));
    const name = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''} "${(el.textContent || '').trim().slice(0, 30)}"`;
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    for (const root of document.querySelectorAll(sel)) {
      for (const el of root.querySelectorAll('*')) {
        if (!vis(el) || allowed(el)) continue;
        const cs = getComputedStyle(el);
        if ((cs.whiteSpace === 'nowrap' || cs.overflowX === 'hidden') && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) bad.push('cắt chữ: ' + name(el));
        const box = el.closest('.modal, .app-header, .setup-card, .notice');
        if (box && box !== el && vis(box)) {
          const a = el.getBoundingClientRect(), b = box.getBoundingClientRect();
          if (a.right > b.right + 1) bad.push('vượt mép phải: ' + name(el));
        }
      }
    }
    const se = document.scrollingElement;
    if (se.scrollWidth > innerWidth + 1) bad.push(`cuộn ngang trang: ${se.scrollWidth} > ${innerWidth}`);
    return bad;
  }, { sel, allow });
}

// Vùng chạm ≥ 56×56: 4 điểm (cx±27, cy±27) quanh tâm phải thuộc chính nút (thanh trên: ±27 dọc, ±(rộng/2−1) ngang).
export async function hit56(page, sel, { header = false } = {}) {
  return page.evaluate(({ sel, header }) => {
    const bad = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = header ? Math.max(0, r.width / 2 - 1) : 27;
      for (const [x, y] of [[cx - dx, cy - 27], [cx + dx, cy - 27], [cx - dx, cy + 27], [cx + dx, cy + 27]]) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || !(hit === el || el.contains(hit))) { bad.push(`${sel} @ (${Math.round(x)},${Math.round(y)}) trúng ${hit ? hit.tagName + '.' + hit.className : 'null'}`); break; }
      }
    }
    return bad;
  }, { sel, header });
}

// Lỗi i18n trong console (mở với &test=1): "[i18n] thiếu khoá ..." và lỗi trang.
export const noI18nErrors = (log) => log.errors.filter((e) => /\[i18n\] thiếu khoá|pageerror/.test(e));

export async function shot(page, name) {
  mkdirSync(SHOT_DIR, { recursive: true });
  const f = `${SHOT_DIR}/${name}.png`;
  await page.screenshot({ path: f });
  return f;
}
