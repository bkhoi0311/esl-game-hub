// Trang tự chẩn đoán camera (#/camcheck): mở bằng file .edu ngay trong lớp ClassIn (camera lớp đang bật)
// để biết trình duyệt nhúng của ClassIn cho phép gì: đọc danh sách camera, mở từng camera khi lớp đang
// dùng S1, quay màn hình, luồng riêng cho AI. Không ghi hình, không gửi đi đâu; chỉ hiện kết quả để chụp màn hình.
import { button, h, toast } from './ui.js';
import { icon } from './icons.js';

const row = (ok, name, detail) => ({ ok, name, detail });

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

async function runChecks(log) {
  const ua = navigator.userAgent;
  const chrome = (ua.match(/Chrom(e|ium)\/([\d.]+)/) || [])[2] || '?';
  log(row(true, 'Trình duyệt', `${/ClassIn/i.test(ua) ? 'trình duyệt nhúng ClassIn · ' : ''}Chromium ${chrome} · ${navigator.platform}`));
  log(row(true, 'User agent', ua));
  log(row(isSecureContext, 'Kết nối an toàn (https)', String(isSecureContext)));
  const md = navigator.mediaDevices;
  log(row(Boolean(md && md.getUserMedia), 'Có API camera (getUserMedia)', md && md.getUserMedia ? 'có' : 'KHÔNG'));
  log(row(Boolean(md && md.getDisplayMedia), 'Có API quay màn hình (getDisplayMedia)', md && md.getDisplayMedia ? 'có' : 'không'));
  log(row(typeof Worker === 'function' && typeof OffscreenCanvas === 'function', 'Luồng riêng cho AI (Worker + OffscreenCanvas)', typeof Worker === 'function' && typeof OffscreenCanvas === 'function' ? 'có' : 'không'));
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

  // 2. Mở camera mặc định
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
  const el = h('div', { class: 'setup' },
    h('div', { class: 'setup-card cc-card' },
      h('h2', {}, icon('camera', 34), h('span', {}, 'Kiểm tra camera trong lớp ClassIn')),
      h('p', { class: 'muted' }, 'Mở trang này bằng file .edu ngay trong lớp ClassIn, lúc camera của lớp đang bật. Bấm "Bắt đầu kiểm tra", đợi khoảng 10 giây, rồi chụp màn hình gửi đội kỹ thuật. Trang không ghi hình và không gửi dữ liệu đi đâu.'),
      h('div', { class: 'setup-actions' }, copyBtn, startBtn),
      verdict,
      list));
  root.append(el);
  return () => el.remove();
}
