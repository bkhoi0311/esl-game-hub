// Trang tự chẩn đoán camera (#/camcheck): mở bằng file .edu ngay trong lớp ClassIn (camera lớp đang bật)
// để biết trình duyệt nhúng của ClassIn cho phép gì: đọc danh sách camera, mở từng camera khi lớp đang
// dùng S1, quay màn hình, luồng riêng cho AI. Không ghi hình, không gửi đi đâu; chỉ hiện kết quả để chụp màn hình.
import { button, h, toast } from './ui.js';
import { icon } from './icons.js';

const row = (ok, name, detail) => ({ ok, name, detail });
let fullApi = ''; // danh sách lệnh đầy đủ của ClassIn (cho nút sao chép riêng)

async function tryOpen(constraints, ms = 6000) {
  const t0 = performance.now();
  let stream;
  try {
    stream = await Promise.race([
      navigator.mediaDevices.getUserMedia(constraints),
      new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('quá 6 giây không phản hồi'), { name: 'Timeout' })), ms)),
    ]);
    const track = stream.getVideoTracks()[0];
    const s = track && track.getSettings ? track.getSettings() : {};
    // Có khung hình thật không (một số trường hợp mở được nhưng hình đen/đứng)
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.srcObject = stream;
    await v.play().catch(() => {});
    await new Promise((r) => setTimeout(r, 700));
    const frames = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality().totalVideoFrames : -1;
    return { ok: true, info: `${s.width || '?'}×${s.height || '?'} ${s.frameRate ? Math.round(s.frameRate) + 'fps' : ''} · ${frames >= 0 ? frames + ' khung/0,7s' : ''} · ${Math.round(performance.now() - t0)} ms`, label: track ? track.label : '' };
  } catch (err) {
    return { ok: false, info: `${err.name}: ${err.message}`, name: err.name };
  } finally {
    if (stream) stream.getTracks().forEach((t) => t.stop());
  }
}

// Đọc danh sách API mà ClassIn mở cho trang qua QWebChannel (giao thức: gửi {type: 3 (Init)}, nhận {type: 10}).
function listQtChannel(transport) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ error: 'không phản hồi sau 3 giây' }), 3000);
    const prev = transport.onmessage;
    transport.onmessage = (msg) => {
      let data;
      try {
        data = typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;
      } catch {
        return;
      }
      if (data.type !== 10 || data.id !== 'esl-init') return;
      clearTimeout(timer);
      transport.onmessage = prev;
      const uniq = (list) => [...new Set(list.filter((n) => !n.includes('(') && !/^(deleteLater|destroyed|objectNameChanged|_q_)/.test(n)))];
      const MEDIA = /cam|video|media|device|stream|mic|audio|capture|publish|rtc|av|seat|stage|screen|share|record/i;
      fullApi = '';
      const out = Object.entries(data.data || {}).map(([name, o]) => {
        const methods = uniq((o.methods || []).map((m) => m[0]));
        const props = (o.properties || []).map((p) => p[1]).filter((n) => n !== 'objectName');
        const signals = uniq((o.signals || []).map((sg) => sg[0]));
        fullApi += `[${name}]\nhàm: ${methods.join(', ')}\nthuộc tính: ${props.join(', ')}\ntín hiệu: ${signals.join(', ')}\n\n`;
        const hot = [...methods, ...props, ...signals].filter((n) => MEDIA.test(n));
        return { name, detail: `${methods.length} hàm, ${props.length} thuộc tính, ${signals.length} tín hiệu · liên quan camera/video: ${hot.join(', ') || 'KHÔNG CÓ'}` };
      });
      resolve(out.length ? out : { error: 'kênh có nhưng không mở đối tượng nào' });
    };
    try {
      transport.send(JSON.stringify({ type: 3, id: 'esl-init' }));
    } catch (err) {
      clearTimeout(timer);
      resolve({ error: String(err && err.message) });
    }
  });
}

async function runChecks(log) {
  log(row(true, 'Phiên bản kiểm tra', 'v4 (camera trước, lệnh ClassIn rút gọn)'));
  const ua = navigator.userAgent;
  const chrome = (ua.match(/Chrom(e|ium)\/([\d.]+)/) || [])[2] || '?';
  log(row(true, 'Trình duyệt', `${/ClassIn/i.test(ua) ? 'trình duyệt nhúng ClassIn · ' : ''}Chromium ${chrome} · ${navigator.platform}`));
  log(row(true, 'User agent', ua));
  log(row(isSecureContext, 'Kết nối an toàn (https)', String(isSecureContext)));
  const md = navigator.mediaDevices;
  log(row(Boolean(md && md.getUserMedia), 'Có API camera (getUserMedia)', md && md.getUserMedia ? 'có' : 'KHÔNG'));
  log(row(Boolean(md && md.getDisplayMedia), 'Có API quay màn hình (getDisplayMedia)', md && md.getDisplayMedia ? 'có' : 'không'));
  log(row(typeof Worker === 'function' && typeof OffscreenCanvas === 'function', 'Luồng riêng cho AI (Worker + OffscreenCanvas)', typeof Worker === 'function' && typeof OffscreenCanvas === 'function' ? 'có' : 'không'));
  // Card đồ hoạ: game Phaser rất chậm nếu trình duyệt nhúng vẽ WebGL bằng CPU (SwiftShader / "software").
  {
    let gl = null;
    try {
      gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    } catch { /* bỏ qua */ }
    if (!gl) log(row(false, 'Card đồ hoạ (WebGL)', 'KHÔNG có WebGL'));
    else {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      const soft = /swiftshader|software|llvmpipe|basic render/i.test(String(name));
      log(row(!soft, 'Card đồ hoạ (WebGL)', `${name}${soft ? ' · ĐANG VẼ BẰNG CPU (không có tăng tốc GPU): game Phaser sẽ chậm' : ' · có tăng tốc GPU'}`));
    }
  }
  // Đo nhanh tốc độ vẽ của trang (khung hình/giây trong 2 giây)
  {
    const fps = await new Promise((res) => {
      let n = 0;
      const t0 = performance.now();
      const tick = (now) => (now - t0 < 2000 ? (n++, requestAnimationFrame(tick)) : res(n / ((now - t0) / 1000)));
      requestAnimationFrame(tick);
    });
    log(row(fps > 50, 'Tốc độ vẽ của trang', `${fps.toFixed(0)} khung/giây`));
  }
  // Cầu nối ClassIn -> trang web (nếu có thì có thể tự tắt/bật camera của lớp khi mở/thoát game)
  const names = Object.getOwnPropertyNames(window).filter((k) => /classin|eeo|cef|bridge|native|jsb|webview|external|qt|electron|ipc/i.test(k) && !/^on/.test(k));
  const bridge = [
    names.length ? `biến lạ: ${names.join(', ')}` : '',
    typeof window.cefQuery === 'function' ? 'cefQuery' : '',
    window.chrome && window.chrome.webview ? 'chrome.webview' : '',
    window.webkit && window.webkit.messageHandlers ? 'webkit.messageHandlers' : '',
    window.external && Object.keys(window.external).length ? `external: ${Object.keys(window.external).join(',')}` : '',
    typeof window.qt === 'object' ? 'qt.webChannelTransport' : '',
    window.parent !== window ? 'trang nằm trong khung (iframe)' : '',
  ].filter(Boolean);
  log(row(bridge.length > 0, 'Cầu nối ClassIn (JS bridge)', bridge.length ? bridge.join(' · ') : 'không thấy'));
  log(row(true, 'Tham số ClassIn gửi kèm', (location.search + location.hash).replace(/#L=[^&]*/, '#L=…') || '(không có)'));
  // Nghe tin nhắn từ ClassIn trong 2 giây (nếu ClassIn dùng postMessage)
  const msgs = [];
  const onMsg = (e) => msgs.push(`${e.origin}: ${String(typeof e.data === 'string' ? e.data : JSON.stringify(e.data)).slice(0, 120)}`);
  window.addEventListener('message', onMsg);
  try { window.parent !== window && window.parent.postMessage({ type: 'esl-hub-hello' }, '*'); } catch { /* bỏ qua */ }
  await new Promise((r) => setTimeout(r, 2000));
  window.removeEventListener('message', onMsg);
  log(row(msgs.length > 0, 'Tin nhắn từ ClassIn (postMessage)', msgs.length ? msgs.join(' | ') : 'không có'));
  if (!md || !md.getUserMedia) return;

  // 1. Danh sách camera (trước khi xin quyền, tên có thể bị ẩn)
  let cams = (await md.enumerateDevices().catch(() => [])).filter((d) => d.kind === 'videoinput');
  log(row(cams.length > 0, 'Số camera thấy được', `${cams.length}: ${cams.map((c) => c.label || '(chưa có tên)').join(' | ')}`));

  // 2. Mở camera mặc định (nếu ClassIn hiện hộp hỏi quyền camera: bấm Cho phép)
  log(row(true, 'Đang mở camera…', 'nếu ClassIn hỏi quyền dùng camera, bấm Cho phép'));
  const def = await tryOpen({ video: true, audio: false });
  log(row(def.ok, 'Mở camera mặc định', def.ok ? `${def.label} · ${def.info}` : def.info));
  cams = (await md.enumerateDevices().catch(() => [])).filter((d) => d.kind === 'videoinput');

  // 3. Mở từng camera (thấy lỗi NotReadableError = camera đang bị ứng dụng khác giữ độc quyền)
  for (const c of cams) {
    const r = await tryOpen({ video: { deviceId: { exact: c.deviceId } }, audio: false });
    log(row(r.ok, `Camera "${c.label || c.deviceId.slice(0, 8)}"`, r.info));
  }
  // 4. Thử độ phân giải thấp (một số camera cho mở thêm luồng nhỏ khi đang bận)
  const s1 = cams.find((c) => /s1|classin|eeo/i.test(c.label));
  if (s1) {
    const low = await tryOpen({ video: { deviceId: { exact: s1.deviceId }, width: { exact: 640 }, height: { exact: 360 } }, audio: false });
    log(row(low.ok, 'S1 ở 640×360', low.info));
  }
  // QWebChannel của ClassIn (Qt WebEngine): chỉ ĐỌC danh sách đối tượng / hàm / thuộc tính / tín hiệu,
  // KHÔNG gọi hàm nào (không ảnh hưởng lớp học).
  if (window.qt && window.qt.webChannelTransport) {
    const api = await listQtChannel(window.qt.webChannelTransport);
    if (api.error) log(row(false, 'Kênh QWebChannel', api.error));
    else api.forEach((o) => log(row(true, `Đối tượng "${o.name}"`, o.detail)));
  }
}

export function mountCamCheck(root) {
  const list = h('ol', { class: 'cc-list', 'data-testid': 'cc-list' });
  const verdict = h('p', { class: 'cc-verdict', hidden: true });
  const results = [];
  const log = (r) => {
    results.push(r);
    list.append(h('li', { class: r.ok ? 'ok' : 'bad' }, icon(r.ok ? 'circle-check' : 'alert', 20), h('strong', {}, r.name), h('span', {}, r.detail)));
  };
  const run = async () => {
    list.textContent = '';
    results.length = 0;
    verdict.hidden = true;
    startBtn.disabled = true;
    try {
      await runChecks(log);
    } catch (err) {
      log(row(false, 'Lỗi khi kiểm tra', String(err && err.message)));
    }
    log(row(true, 'Hoàn tất', 'đã chạy xong, có thể sao chép kết quả'));
    startBtn.disabled = false;
    const camRows = results.filter((r) => r.name.startsWith('Camera "'));
    const s1 = camRows.find((r) => /s1|classin|eeo/i.test(r.name));
    const others = camRows.filter((r) => r !== s1 && r.ok);
    const busy = results.some((r) => /NotReadable|TrackStart|Could not start/i.test(r.detail));
    let ok = true;
    let msg;
    if (s1 && s1.ok) msg = 'Mở được camera S1 ngay cả khi lớp đang chạy: game camera dùng chung S1 được.';
    else if (others.length) msg = `${s1 ? 'S1 đang bị lớp ClassIn giữ' : 'Không thấy S1'}; game sẽ tự dùng ${others.map((r) => r.name.replace('Camera ', '')).join(', ')}.`;
    else {
      ok = false;
      msg = busy
        ? 'Camera đang bị lớp ClassIn giữ độc quyền và không còn camera nào khác: cần cách "nhân bản camera". Chụp màn hình này gửi đội kỹ thuật.'
        : 'Không mở được camera nào. Chụp màn hình này gửi đội kỹ thuật.';
    }
    verdict.hidden = false;
    verdict.className = `cc-verdict ${ok ? 'ok' : 'bad'}`;
    verdict.textContent = msg;
  };
  const startBtn = button({ label: 'Bắt đầu kiểm tra', iconName: 'play', variant: 'primary', size: 'lg', onClick: run, attrs: { 'data-testid': 'cc-run' } });
  const copyBtn = button({
    label: 'Sao chép kết quả', iconName: 'copy',
    onClick: async () => {
      const text = results.map((r) => `${r.ok ? 'OK ' : 'XX '} ${r.name}: ${r.detail}`).join('\n');
      try {
        await navigator.clipboard.writeText(text);
        toast('Đã sao chép kết quả.', 'success');
      } catch {
        toast('Không sao chép được, hãy chụp màn hình.', 'error');
      }
    },
  });
  const apiBtn = button({
    label: 'Sao chép danh sách lệnh đầy đủ', iconName: 'copy',
    onClick: async () => {
      try {
        await navigator.clipboard.writeText(fullApi || '(chưa có: bấm Bắt đầu kiểm tra trước)');
        toast('Đã sao chép danh sách lệnh.', 'success');
      } catch {
        toast('Không sao chép được.', 'error');
      }
    },
  });
  const el = h('div', { class: 'setup' },
    h('div', { class: 'setup-card cc-card' },
      h('h2', {}, icon('camera', 34), h('span', {}, 'Kiểm tra camera trong lớp ClassIn')),
      h('p', { class: 'muted' }, 'Mở trang này bằng file .edu ngay trong lớp ClassIn, lúc camera của lớp đang bật. Bấm "Bắt đầu kiểm tra", đợi khoảng 10 giây, rồi chụp màn hình gửi đội kỹ thuật. Trang không ghi hình và không gửi dữ liệu đi đâu.'),
      h('div', { class: 'setup-actions' }, apiBtn, copyBtn, startBtn),
      verdict,
      list));
  root.append(el);
  return () => el.remove();
}
