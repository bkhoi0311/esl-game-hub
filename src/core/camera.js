// Camera: liệt kê thiết bị, chọn camera (ClassIn Cam S1 thường không phải camera mặc định),
// báo lỗi rõ ràng (VI/EN theo ngôn ngữ giao diện), tắt hẳn camera khi rời game. Không ghi hình, không gửi hình đi đâu.
import { getSettings, updateSettings } from './settings.js';
import { button, h, setupRow, toast } from './ui.js';
import { icon } from './icons.js';
import { t, addStrings } from '../i18n/index.js';
import VI from '../i18n/strings/camera-guide.vi.js';

addStrings('camera-guide', VI);

// Luôn xin 1280x720: AI chỉ nhận ảnh đã thu nhỏ (vision.js) nên không cần hạ độ phân giải camera.
export const RESOLUTIONS = [{ width: 1280, height: 720 }];

// Lỗi camera -> { kind, title, steps } theo ngôn ngữ giao diện (kind: unsupported|denied|busy|none|other).
function errorInfo(kind, extra) {
  const tx = (title, ...steps) => ({ kind, title, steps });
  if (kind === 'unsupported') return tx(t('cam.err.unsupported.title'), t('cam.err.unsupported.s1'), t('cam.err.unsupported.s2'));
  if (kind === 'denied') return tx(t('cam.err.denied.title'), t('cam.err.denied.s1'), t('cam.err.denied.s2'), t('cam.err.denied.s3'), t('cam.err.denied.s4'));
  if (kind === 'busy') return tx(t('cam.err.busy.title'), t('cam.err.busy.s1'), t('cam.err.busy.s2'), t('cam.err.busy.s3'), t('cam.err.busy.s4'));
  if (kind === 'none') return tx(t('cam.err.none.title'), t('cam.err.none.s1'), t('cam.err.none.s2'), t('cam.err.none.s3'));
  return tx(t('cam.err.other.title'), t('cam.err.other.s1', { msg: extra }), t('cam.err.other.s2'));
}

export function describeCameraError(err) {
  const name = (err && err.name) || '';
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return errorInfo('unsupported');
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return errorInfo('denied');
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return errorInfo('busy');
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return errorInfo('none');
  return errorInfo('other', name || err);
}

export async function listCameras() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === 'videoinput');
}

export function stopStream(stream) {
  if (stream) stream.getTracks().forEach((t) => t.stop());
}

export async function openCamera(deviceId, resolution = RESOLUTIONS[0]) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const e = new Error('unsupported');
    e.name = 'Unsupported';
    throw e;
  }
  const video = { width: { ideal: resolution.width }, height: { ideal: resolution.height }, frameRate: { ideal: 30 } };
  if (deviceId) video.deviceId = { exact: deviceId };
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio: false });
  } catch (err) {
    // Camera đã lưu không còn cắm: thử camera mặc định.
    if (deviceId && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) {
      delete video.deviceId;
      return navigator.mediaDevices.getUserMedia({ video, audio: false });
    }
    throw err;
  }
}

// Phiên camera của 1 game: video gương, đổi thiết bị, tắt/bật.
export function createCameraSession() {
  const video = h('video', { class: 'cam-video', autoplay: true, muted: true, playsInline: true });
  video.setAttribute('playsinline', '');
  let stream = null;
  let deviceId = getSettings().cameraId || '';

  const api = {
    video,
    get stream() {
      return stream;
    },
    get active() {
      return Boolean(stream);
    },
    get deviceId() {
      return deviceId;
    },
    async start(id = deviceId) {
      api.stop();
      stream = await openCamera(id);
      const track = stream.getVideoTracks()[0];
      const actual = track && track.getSettings ? track.getSettings().deviceId : '';
      deviceId = id || actual || '';
      if (deviceId) updateSettings({ cameraId: deviceId });
      video.srcObject = stream;
      await video.play().catch(() => {});
      await new Promise((r) => (video.readyState >= 2 ? r() : video.addEventListener('loadeddata', r, { once: true })));
      return stream;
    },
    // true khi game "mượn" camera sau lúc lớp ClassIn tắt camera: thoát game thì nhắc bật lại camera lớp.
    borrowed: false,
    stop() {
      if (api.borrowed && stream) {
        toast(t('cam.released'), 'info', 6000);
        api.borrowed = false;
      }
      stopStream(stream);
      stream = null;
      video.srcObject = null;
    },
  };
  return api;
}

// Màn hình chọn camera trước khi vào game (giáo viên).
// onReady(session) được gọi khi giáo viên bấm "Bắt đầu".
export function cameraSetupScreen({ session, title, art, hint, extraRows = [], onReady }) {
  const select = h('select', { 'aria-label': t('cam.pick'), 'data-testid': 'cam-select' });
  // Nhóm nút to thay cho <select> (popup select có thể không hiện trên ClassIn X). Chỉ hiện trên ClassIn X hoặc ?touchui=1.
  const touchUi = /ClassIn X/i.test(navigator.userAgent) || /[?&]touchui=1/.test(location.search + location.hash);
  const camPick = h('div', { class: 'cam-pick', role: 'group', 'aria-label': t('cam.pickButtons'), 'data-testid': 'cam-pick', hidden: !touchUi });
  const syncPick = () => camPick.querySelectorAll('.btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === select.value)));
  const preview = h('div', { class: 'cam-preview' }, session.video);
  const errorBox = h('div', { class: 'cam-error', hidden: true, 'data-testid': 'cam-error' });
  const startBtn = button({ label: t('common.start'), iconName: 'play', variant: 'primary', size: 'lg', attrs: { disabled: true, 'data-testid': 'cam-start' } });
  const retryBtn = button({ label: t('cam.retry'), iconName: 'refresh', onClick: () => connect(select.value) });

  const countEl = h('p', { class: 'cam-count', 'data-testid': 'cam-count' });
  const switchNote = h('p', { class: 'cam-switch', 'data-testid': 'cam-switch', hidden: true });
  const helpBox = h('details', { class: 'cam-help', 'data-testid': 'cam-help', hidden: true },
    h('summary', {}, t('cam.help.title')),
    h('ol', {},
      h('li', {}, t('cam.help.s1')),
      h('li', {}, t('cam.help.s2')),
      h('li', {}, t('cam.help.s3')),
      h('li', {}, t('cam.help.s4')),
      h('li', {}, t('cam.help.s5'))));
  let userChose = false;
  let waitTimer = 0;
  const triedIds = new Set(); // camera đã thử khi S1 bận
  const VIRTUAL = /virtual|obs|splitcam|manycam|xsplit/i;
  const stopWaiting = () => {
    clearInterval(waitTimer);
    waitTimer = 0;
  };

  // Camera bị lớp ClassIn giữ: 2 cách, và tự thử lại mỗi 2,5 giây (tắt camera trong lớp là game tự bắt được).
  const busyPanel = (id) => h('div', { class: 'cam-busy', 'data-testid': 'cam-busy' },
    h('p', { class: 'cam-wait' }, h('span', { class: 'cam-spinner' }), t('cam.busy.waiting')),
    h('div', { class: 'cam-ways' },
      h('section', {},
        h('h4', {}, h('b', {}, '1'), t('cam.busy.opt1.title')),
        h('p', {}, t('cam.busy.opt1.body'))),
      h('section', {},
        h('h4', {}, h('b', {}, '2'), t('cam.busy.opt2.title')),
        h('p', {}, t('cam.busy.opt2.body')),
        h('a', { class: 'btn btn-ghost', href: './camera-share/Camera-dung-chung-ClassIn.zip', download: '' }, icon('download', 20), h('span', {}, t('cam.busy.opt2.download'))))),
    button({ label: t('cam.retryNow'), iconName: 'refresh', onClick: () => connect(id) }));

  const fill = async () => {
    const cams = await listCameras();
    select.textContent = '';
    cams.forEach((c, i) => {
      const label = c.label || `Camera ${i + 1}`;
      const hintS1 = /s1|classin|eeo/i.test(label) ? ' (ClassIn)' : '';
      select.append(h('option', { value: c.deviceId, selected: c.deviceId === session.deviceId }, label + hintS1));
    });
    if (!cams.length) select.append(h('option', { value: '' }, t('cam.count.none')));
    // Chỉ dựng lại nút khi danh sách camera đổi (giữ nguyên nút đang bấm).
    const key = cams.map((c) => `${c.deviceId}|${c.label}`).join(';');
    if (camPick.dataset.key === key) syncPick();
    else {
      camPick.dataset.key = key;
      camPick.textContent = '';
      cams.forEach((c, i) => {
      camPick.append(button({
        label: (c.label || `Camera ${i + 1}`) + (/s1|classin|eeo/i.test(c.label || '') ? ' (ClassIn)' : ''),
        attrs: { 'data-value': c.deviceId, 'aria-pressed': String(c.deviceId === select.value) },
        onClick: (e) => {
          e.preventDefault();
          select.value = c.deviceId;
          select.dispatchEvent(new Event('change'));
          syncPick();
        },
      }));
      });
    }
    countEl.textContent = t('cam.count', { n: cams.length, list: cams.length ? ': ' + cams.map((c, i) => c.label || `Camera ${i + 1}`).join(', ') : '' });
    const hasClassIn = cams.some((c) => /s1|classin|eeo/i.test(c.label));
    helpBox.hidden = hasClassIn && cams.length > 1;
    if (cams.length <= 1) helpBox.open = true;
    return cams;
  };

  // Chưa chọn tay mà có camera ClassIn: tự chuyển sang camera ClassIn.
  const preferClassIn = (cams) => {
    if (userChose) return false;
    const cls = cams.find((c) => /s1|classin|eeo/i.test(c.label));
    if (cls && cls.deviceId && cls.deviceId !== session.deviceId) {
      connect(cls.deviceId);
      return true;
    }
    return false;
  };

  const connect = async (id, { quiet = false } = {}) => {
    if (!quiet) {
      errorBox.hidden = true;
      startBtn.disabled = true;
    }
    try {
      await session.start(id);
      if (waitTimer) session.borrowed = true; // bắt được camera sau khi chờ lớp nhả ra
      stopWaiting();
      errorBox.hidden = true;
      const cams = await fill(); // sau khi cấp quyền mới đọc được tên camera
      if (!triedIds.size && preferClassIn(cams)) return;
      startBtn.disabled = false;
    } catch (err) {
      if (quiet) return; // đang chờ camera rảnh: giữ nguyên bảng hướng dẫn
      const info = describeCameraError(err);
      const cams = await fill().catch(() => []);
      // Camera đang bị lớp ClassIn giữ: tự dùng camera khác đang rảnh, không hỏi giáo viên.
      // Ưu tiên camera ảo (nhân bản S1, cùng góc quay với lớp), rồi đến camera khác của máy.
      if (info.kind === 'busy') {
        triedIds.add(id);
        const free = cams.filter((c) => !triedIds.has(c.deviceId));
        const next = free.find((c) => VIRTUAL.test(c.label)) || free[0];
        if (next) {
          triedIds.add(next.deviceId);
          select.value = next.deviceId;
          switchNote.textContent = t('cam.switched', { name: next.label || t('cam.otherName') });
          switchNote.hidden = false;
          connect(next.deviceId);
          return;
        }
      }
      errorBox.textContent = '';
      errorBox.dataset.kind = info.kind;
      if (info.kind === 'busy') {
        errorBox.append(h('h3', {}, icon('alert', 26), t('cam.busy.title')), busyPanel(id));
        helpBox.hidden = true; // camera có, chỉ đang bận: không cần hướng dẫn "không thấy camera"
        stopWaiting();
        waitTimer = setInterval(() => {
          if (!el.isConnected) stopWaiting();
          else connect(id, { quiet: true });
        }, 2500);
      } else {
        errorBox.append(
          h('h3', {}, icon('alert', 26), info.title),
          h('ol', {}, info.steps.map((s) => h('li', {}, s))),
          retryBtn,
        );
      }
      errorBox.hidden = false;
    }
  };

  const rescan = async () => {
    const cams = await fill().catch(() => []);
    if (!preferClassIn(cams) && !session.active) connect(select.value);
  };
  const rescanBtn = button({ label: t('cam.findAgain'), iconName: 'refresh', attrs: { 'data-testid': 'cam-rescan' }, onClick: rescan });

  // Cắm / rút camera khi đang mở trang: tự làm mới danh sách.
  const onDeviceChange = () => {
    if (!el.isConnected) {
      navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
      return;
    }
    rescan();
  };
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);

  select.addEventListener('change', () => {
    userChose = true;
    stopWaiting();
    switchNote.hidden = true;
    connect(select.value);
  });
  startBtn.addEventListener('click', () => {
    stopWaiting();
    onReady(session);
  });

  const el = h(
    'div', { class: 'setup cam-setup' },
    h('div', { class: 'setup-card cam-card' },
      h('h2', {}, art || null, h('span', {}, title)),
      h('div', { class: 'cam-grid' },
        h('div', { class: 'cam-left' }, preview, errorBox, h('div', { class: 'setup-actions' }, startBtn)),
        h('div', { class: 'cam-side' },
          h('div', { class: 'setup-row', role: 'group', 'aria-label': 'Camera' }, h('span', {}, 'Camera'), h('div', { class: 'cam-select-row' }, select, rescanBtn), camPick),
          countEl,
          switchNote,
          helpBox,
          h('p', { class: 'muted' }, t('cam.note')),
          hint ? h('p', { class: 'cam-hint' }, hint) : null,
          extraRows.map((r, i) => setupRow(r, `cam-setup-row-${i}`))))),
  );
  connect(session.deviceId);
  return el;
}
