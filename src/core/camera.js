// Camera: liệt kê thiết bị, chọn camera (ClassIn Cam S1 thường không phải camera mặc định),
// báo lỗi rõ ràng bằng tiếng Việt, tắt hẳn camera khi rời game. Không ghi hình, không gửi hình đi đâu.
import { getSettings, updateSettings } from './settings.js';
import { button, h } from './ui.js';
import { icon } from './icons.js';

export const RESOLUTIONS = [
  { width: 1280, height: 720 },
  { width: 640, height: 360 },
  { width: 320, height: 180 },
];

// Lỗi camera -> { kind, title, steps } tiếng Việt.
export function describeCameraError(err) {
  const name = (err && err.name) || '';
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return {
      kind: 'unsupported',
      title: 'Trình duyệt không hỗ trợ camera',
      steps: ['Mở bằng Chrome hoặc Edge bản mới.', 'Trang phải mở qua https:// hoặc http://localhost (không mở trực tiếp file cho game AI).'],
    };
  }
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return {
      kind: 'denied',
      title: 'Trình duyệt đang chặn quyền dùng camera',
      steps: [
        'Bấm biểu tượng ổ khóa (hoặc camera có dấu gạch) bên trái thanh địa chỉ.',
        'Ở mục Camera, chọn "Cho phép" (Allow).',
        'Tải lại trang (F5) rồi mở lại game.',
        'Windows: Settings > Privacy & security > Camera, bật "Let apps access your camera" và "Let desktop apps access your camera".',
      ],
    };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return {
      kind: 'busy',
      title: 'Camera đang bị ứng dụng khác sử dụng',
      steps: [
        'Thường do app ClassIn (hoặc Zoom, Teams, Camera của Windows) đang giữ camera S1.',
        'Trong ClassIn: tắt camera của mình, hoặc thoát hẳn lớp học / thoát ClassIn (kiểm tra cả biểu tượng ClassIn ở góc phải thanh Taskbar).',
        'Đóng các tab trình duyệt khác đang dùng camera.',
        'Bấm "Thử lại". Nếu vẫn lỗi: rút cáp USB của camera, cắm lại, đợi 5 giây.',
      ],
    };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return {
      kind: 'none',
      title: 'Không tìm thấy camera',
      steps: [
        'Kiểm tra cáp USB của camera S1 đã cắm chắc vào máy tính (nên cắm thẳng vào máy, không qua hub).',
        'Windows: mở Device Manager, xem mục Cameras có hiện camera không.',
        'Cắm lại xong, bấm "Thử lại".',
      ],
    };
  }
  return { kind: 'other', title: 'Không mở được camera', steps: [`Lỗi: ${name || err}`, 'Bấm "Thử lại", hoặc tải lại trang.'] };
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

// Phiên camera của 1 game: video gương, đổi thiết bị, hạ độ phân giải, tắt/bật.
export function createCameraSession() {
  const video = h('video', { class: 'cam-video', autoplay: true, muted: true, playsInline: true });
  video.setAttribute('playsinline', '');
  let stream = null;
  let resIndex = 0;
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
      stream = await openCamera(id, RESOLUTIONS[resIndex]);
      const track = stream.getVideoTracks()[0];
      const actual = track && track.getSettings ? track.getSettings().deviceId : '';
      deviceId = id || actual || '';
      if (deviceId) updateSettings({ cameraId: deviceId });
      video.srcObject = stream;
      await video.play().catch(() => {});
      await new Promise((r) => (video.readyState >= 2 ? r() : video.addEventListener('loadeddata', r, { once: true })));
      return stream;
    },
    // Máy yếu: hạ độ phân giải 1 bậc. Trả về false nếu đã thấp nhất.
    async lowerResolution() {
      if (resIndex >= RESOLUTIONS.length - 1) return false;
      resIndex += 1;
      await api.start(deviceId);
      return true;
    },
    stop() {
      stopStream(stream);
      stream = null;
      video.srcObject = null;
    },
  };
  return api;
}

// Đo FPS vòng xử lý; gọi onSlow() nếu dưới 15 FPS liên tục 5 giây.
export function createFpsMonitor({ min = 15, seconds = 5, onSlow } = {}) {
  let frames = 0;
  let windowStart = performance.now();
  let slowSince = 0;
  let fps = 30;
  let lastTick = 0;
  return {
    get fps() {
      return fps;
    },
    tick(now = performance.now()) {
      // Quãng dừng dài (đang nạp model, tạm dừng, tắt camera): bắt đầu đo lại từ đầu.
      if (lastTick && now - lastTick > 1500) {
        frames = 0;
        windowStart = now;
        slowSince = 0;
      }
      lastTick = now;
      frames += 1;
      if (now - windowStart >= 1000) {
        fps = (frames * 1000) / (now - windowStart);
        frames = 0;
        windowStart = now;
        if (fps < min) {
          if (!slowSince) slowSince = now;
          if (now - slowSince >= seconds * 1000) {
            slowSince = 0;
            if (onSlow) onSlow(fps);
          }
        } else {
          slowSince = 0;
        }
      }
    },
  };
}

// Màn hình chọn camera trước khi vào game (giáo viên, tiếng Việt).
// onReady(session) được gọi khi giáo viên bấm "Bắt đầu".
export function cameraSetupScreen({ session, title, art, hint, extraRows = [], onReady }) {
  const select = h('select', { 'aria-label': 'Chọn camera', 'data-testid': 'cam-select' });
  const preview = h('div', { class: 'cam-preview' }, session.video);
  const errorBox = h('div', { class: 'cam-error', hidden: true, 'data-testid': 'cam-error' });
  const startBtn = button({ label: 'Bắt đầu', iconName: 'play', variant: 'primary', size: 'lg', attrs: { disabled: true, 'data-testid': 'cam-start' } });
  const retryBtn = button({ label: 'Thử lại', iconName: 'refresh', onClick: () => connect(select.value) });

  const countEl = h('p', { class: 'cam-count', 'data-testid': 'cam-count' });
  const helpBox = h('details', { class: 'cam-help', 'data-testid': 'cam-help', hidden: true },
    h('summary', {}, 'Không thấy camera ClassIn S1 trong danh sách?'),
    h('ol', {},
      h('li', {}, 'Cắm cáp USB của S1 vào cổng USB của MÁY TÍNH đang chạy trình duyệt (khe OPS/PC của màn tương tác), không cắm vào cổng USB phía Android của màn hình.'),
      h('li', {}, 'Cắm xong đợi 5 giây rồi bấm "Tìm lại camera" (không cần tải lại trang).'),
      h('li', {}, 'Windows: Settings > Bluetooth & devices > Cameras. Nếu S1 không có ở đây thì Windows chưa nhận camera: thử cổng USB khác, cắm thẳng không qua hub.'),
      h('li', {}, 'Tắt app ClassIn hoặc tắt camera trong lớp ClassIn nếu đang mở.'),
      h('li', {}, 'Trình duyệt: bấm biểu tượng ổ khoá cạnh địa chỉ trang > Camera > Cho phép.')));
  let userChose = false;

  const fill = async () => {
    const cams = await listCameras();
    select.textContent = '';
    cams.forEach((c, i) => {
      const label = c.label || `Camera ${i + 1}`;
      const hintS1 = /s1|classin|eeo/i.test(label) ? ' (ClassIn)' : '';
      select.append(h('option', { value: c.deviceId, selected: c.deviceId === session.deviceId }, label + hintS1));
    });
    if (!cams.length) select.append(h('option', { value: '' }, 'Chưa thấy camera'));
    countEl.textContent = `Tìm thấy ${cams.length} camera${cams.length ? ': ' + cams.map((c, i) => c.label || `Camera ${i + 1}`).join(', ') : ''}.`;
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

  const connect = async (id) => {
    errorBox.hidden = true;
    startBtn.disabled = true;
    try {
      await session.start(id);
      const cams = await fill(); // sau khi cấp quyền mới đọc được tên camera
      if (preferClassIn(cams)) return;
      startBtn.disabled = false;
    } catch (err) {
      const info = describeCameraError(err);
      errorBox.textContent = '';
      errorBox.dataset.kind = info.kind;
      errorBox.append(
        h('h3', {}, icon('alert', 26), info.title),
        h('ol', {}, info.steps.map((s) => h('li', {}, s))),
        retryBtn,
      );
      errorBox.hidden = false;
      await fill().catch(() => {});
    }
  };

  const rescan = async () => {
    const cams = await fill().catch(() => []);
    if (!preferClassIn(cams) && !session.active) connect(select.value);
  };
  const rescanBtn = button({ label: 'Tìm lại camera', iconName: 'refresh', attrs: { 'data-testid': 'cam-rescan' }, onClick: rescan });

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
    connect(select.value);
  });
  startBtn.addEventListener('click', () => onReady(session));

  const el = h(
    'div', { class: 'setup cam-setup' },
    h('div', { class: 'setup-card cam-card' },
      h('h2', {}, art || null, h('span', {}, title)),
      h('div', { class: 'cam-grid' },
        h('div', { class: 'cam-left' }, preview, h('div', { class: 'setup-actions' }, startBtn)),
        h('div', { class: 'cam-side' },
          h('label', { class: 'setup-row' }, h('span', {}, 'Camera'), h('div', { class: 'cam-select-row' }, select, rescanBtn)),
          countEl,
          helpBox,
          h('p', { class: 'muted' }, 'Camera góc rộng ClassIn S1 thường có tên chứa "S1" hoặc "ClassIn". Hình hiển thị dạng gương. Không ghi hình, không lưu ảnh.'),
          hint ? h('p', { class: 'cam-hint' }, hint) : null,
          extraRows.map((r) => h('label', { class: 'setup-row' }, h('span', {}, r.label), r.control, r.hint ? h('small', {}, r.hint) : null)))),
      errorBox),
  );
  connect(session.deviceId);
  return el;
}
