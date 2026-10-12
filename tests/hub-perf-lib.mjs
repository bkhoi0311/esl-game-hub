// Thư viện đo cho tests/hub-perf.mjs: máy chủ tĩnh, mở trang giả ClassIn, đo khung/giây + diện tích vẽ lại bằng CDP.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

export const UA_CLASSIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.5414.120 Safari/537.36 ClassIn X/6.0.9.1813';
export const UA_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';

export function serve(dir, port) {
  const p = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '-d', dir], { stdio: 'ignore' });
  return { stop: () => p.kill() };
}
export async function waitServer(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* chưa lên */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server không lên: ' + url);
}

export const GPU_ARGS = [];
export const CPU_ARGS = ['--disable-gpu', '--disable-gpu-compositing'];

export async function launch(args = []) {
  return chromium.launch({ channel: 'chrome', args });
}

// Trang giả ClassIn X: DPR 3, 1280x647, cảm ứng, webdriver=false để animation nhàn rỗi chạy như máy thật.
export async function openPage(browser, url, { ua = UA_CLASSIN, viewport = { width: 1280, height: 647 }, dpr = 3 } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, hasTouch: true, userAgent: ua });
  await ctx.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  return { ctx, page, errors };
}

// Đo trong `ms` mili giây: khung compositor (screencast), Paint, diện tích vẽ lại (MP vật lý), style recalc, long task, rAF.
export async function measure(ctx, page, ms, { dpr = 3, during } = {}) {
  const cdp = await ctx.newCDPSession(page);
  const events = [];
  cdp.on('Tracing.dataCollected', (e) => events.push(...e.value));
  let frames = 0;
  const shots = [];
  cdp.on('Page.screencastFrame', (f) => { frames++; shots.push(f.data); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,cc', transferMode: 'ReportEvents' });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: 640, maxHeight: 400 });
  const rafP = page.evaluate((t) => new Promise((res) => {
    const d = []; let last = performance.now(); const end = last + t;
    const tick = (now) => { d.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else res(d); };
    requestAnimationFrame(tick);
  }), ms);
  if (during) await during();
  const raf = await rafP;
  await cdp.send('Page.stopScreencast');
  await cdp.send('Tracing.end');
  await done;
  await cdp.detach().catch(() => {});
  const sec = ms / 1000;
  // Vùng thay đổi giữa các khung liên tiếp (screencast): bbox của điểm ảnh đổi và tỉ lệ điểm ảnh đổi, quy ra MP vật lý (viewport x dpr²).
  const dmg = await page.evaluate(async (list) => {
    const dec = async (b64) => {
      const img = new Image();
      img.src = 'data:image/jpeg;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0);
      return x.getImageData(0, 0, c.width, c.height);
    };
    let prev = null; let bboxFrac = 0; let pixFrac = 0; let n = 0; const list2 = [];
    for (const b64 of list) {
      const cur = await dec(b64);
      if (prev && prev.width === cur.width) {
        const w = cur.width; const h = cur.height;
        let x0 = w; let y0 = h; let x1 = -1; let y1 = -1; let cnt = 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            if (Math.abs(cur.data[i] - prev.data[i]) + Math.abs(cur.data[i + 1] - prev.data[i + 1]) + Math.abs(cur.data[i + 2] - prev.data[i + 2]) > 60) {
              cnt++;
              if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
          }
        }
        if (cnt) { bboxFrac += ((x1 - x0 + 1) * (y1 - y0 + 1)) / (w * h); pixFrac += cnt / (w * h); }
        list2.push(`${x0},${y0}-${x1},${y1}`);
        n++;
      }
      prev = cur;
    }
    return { bboxFrac, pixFrac, n, list2 };
  }, shots);
  const viewMP = await page.evaluate((d) => (innerWidth * d) * (innerHeight * d) / 1e6, dpr);
  let rasterTasks = 0; let rasterMs = 0; let paints = 0; let areaCss = 0; let recalcMs = 0; let longTasks = 0;
  for (const e of events) {
    if (e.name === 'Paint' && e.ph === 'X' && e.args && e.args.data && e.args.data.clip) {
      paints++;
      const c = e.args.data.clip; // 4 đỉnh x,y
      const w = Math.max(c[0], c[2], c[4], c[6]) - Math.min(c[0], c[2], c[4], c[6]);
      const hh = Math.max(c[1], c[3], c[5], c[7]) - Math.min(c[1], c[3], c[5], c[7]);
      areaCss += Math.min(w, 1280) * Math.min(hh, 647);
    } else if (e.name === 'RasterTask' && e.ph === 'X') { rasterTasks++; rasterMs += (e.dur || 0) / 1000;
    } else if (e.name === 'UpdateLayoutTree' && e.ph === 'X') recalcMs += (e.dur || 0) / 1000;
    else if (e.name === 'RunTask' && e.ph === 'X' && e.dur > 50000) longTasks++;
  }
  const sorted = [...raf].sort((a, b) => a - b);
  return {
    screencastFps: +(frames / sec).toFixed(1),
    paintsPerSec: +(paints / sec).toFixed(1),
    mpPerSec: +((areaCss * dpr * dpr) / 1e6 / sec).toFixed(1),
    ...(process.env.HPDEBUG ? { rects: dmg.list2 } : {}),
    damageMpPerSec: +((dmg.bboxFrac * viewMP) / sec).toFixed(1),
    changedMpPerSec: +((dmg.pixFrac * viewMP) / sec).toFixed(1),
    rasterTasksPerSec: +(rasterTasks / sec).toFixed(1),
    rasterMsPerSec: +(rasterMs / sec).toFixed(1),
    recalcMsPerSec: +(recalcMs / sec).toFixed(1),
    longTasks,
    rafFps: +(raf.length / sec).toFixed(1),
    rafP95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
    rafMax: +sorted[sorted.length - 1].toFixed(1),
  };
}
