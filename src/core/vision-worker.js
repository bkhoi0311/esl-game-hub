// Luồng riêng chạy MediaPipe (Pose / Face): nhận diện không chặn luồng vẽ game,
// máy bận (ClassIn đang chạy lớp ảo) thì chỉ nhận diện thưa đi, hình game vẫn mượt.
// Nhận khung hình dạng ImageBitmap đã thu nhỏ, trả về toạ độ điểm (0..1).
import { FaceLandmarker, FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

// MediaPipe nạp file loader WASM (script thường) bằng importScripts; trong module worker
// importScripts không dùng được nên nó gọi self.import(url): tự tải và chạy ở phạm vi toàn cục.
self.import = async (url) => {
  const code = await (await fetch(url)).text();
  (0, eval)(`${code}\n;self.ModuleFactory = self.ModuleFactory || (typeof ModuleFactory !== 'undefined' ? ModuleFactory : undefined);`);
};

let task = null;
let current = null; // { kind, options, wasm, model }
let lastTs = 0;

async function create({ kind, options, wasm, model, delegates = ['GPU', 'CPU'] }) {
  const fileset = await FilesetResolver.forVisionTasks(wasm);
  const Task = kind === 'face' ? FaceLandmarker : PoseLandmarker;
  let lastErr = null;
  for (const delegate of delegates) {
    try {
      const t = await Task.createFromOptions(fileset, {
        ...options,
        baseOptions: { modelAssetPath: model, delegate },
        canvas: new OffscreenCanvas(1, 1),
      });
      return { task: t, delegate };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('create failed');
}

async function init(msg) {
  // Thử lần lượt các nguồn (lưu sẵn cùng trang, rồi CDN).
  const errors = [];
  for (const src of msg.sources) {
    try {
      const made = await create({ kind: msg.kind, options: msg.options, delegates: msg.delegates, ...src });
      if (task) task.close();
      task = made.task;
      current = { ...msg, ...src };
      lastTs = 0;
      return made.delegate;
    } catch (err) {
      errors.push(`${src.model}: ${err && err.message}`);
    }
  }
  throw new Error(errors.join(' | '));
}

function pick(kind, res) {
  // Chỉ gửi toạ độ điểm về (gọn, sao chép nhanh).
  const list = kind === 'face' ? res.faceLandmarks : res.landmarks;
  return (list || []).map((pts) => pts.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility })));
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    try {
      const delegate = await init(msg);
      self.postMessage({ type: 'ready', delegate, model: current.model });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err && err.message) });
    }
    return;
  }
  if (msg.type === 'frame') {
    const bitmap = msg.bitmap;
    if (!task) {
      bitmap.close();
      self.postMessage({ type: 'result', id: msg.id, ms: 0, list: null });
      return;
    }
    const t0 = performance.now();
    let list = null;
    try {
      const ts = Math.max(Math.round(msg.t), lastTs + 1); // timestamp phải tăng dần
      lastTs = ts;
      list = pick(current.kind, task.detectForVideo(bitmap, ts));
    } catch (err) {
      self.postMessage({ type: 'warn', message: String(err && err.message) });
      // Graph hỏng: tạo lại task, bỏ qua khung này.
      try {
        task.close();
      } catch {
        // bỏ qua
      }
      task = null;
      init(current).catch(() => {});
    }
    bitmap.close();
    self.postMessage({ type: 'result', id: msg.id, ms: performance.now() - t0, list });
    return;
  }
  if (msg.type === 'close') {
    if (task) task.close();
    task = null;
    self.close();
  }
};
