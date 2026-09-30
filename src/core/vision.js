// Thị giác máy tính chạy hoàn toàn trên máy: MediaPipe (Pose / Face) và so sánh khung hình (frame differencing).
// Model và WASM ưu tiên bản lưu sẵn trong ./models, dự phòng CDN chính thức.
// Nhận diện chạy ở luồng riêng (vision-worker.js) và tự hạ mức khi máy chậm.
const MP_VERSION = '1.0.1';
const CDN_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const LOCAL_WASM = './models/wasm';
const MODELS = {
  pose: {
    cdn: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    local: './models/pose_landmarker_lite.task',
  },
  // Bản "full": chính xác hơn khi lớp đông / học sinh đứng xa, nặng hơn bản lite.
  poseFull: {
    cdn: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
    local: './models/pose_landmarker_full.task',
  },
  face: {
    cdn: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    local: './models/face_landmarker.task',
  },
};

let libPromise = null;
function loadLib() {
  libPromise ||= import('@mediapipe/tasks-vision');
  return libPromise;
}

async function createTask(kind, factory) {
  const lib = await loadLib();
  const Task = kind === 'face' ? lib.FaceLandmarker : lib.PoseLandmarker;
  // kind: 'pose' | 'poseFull' | 'face' (khoá trong MODELS)
  const attempts = [];
  // Ưu tiên WASM + model lưu sẵn cùng trang (nhanh, không phụ thuộc mạng ngoài); mở file trực tiếp thì dùng CDN.
  const local = { wasm: LOCAL_WASM, model: MODELS[kind].local };
  const cdn = { wasm: CDN_WASM, model: MODELS[kind].cdn };
  const order = location.protocol === 'file:' ? [cdn, local] : [local, cdn];
  for (const src of order) {
    let fileset;
    try {
      fileset = await lib.FilesetResolver.forVisionTasks(src.wasm);
    } catch (err) {
      attempts.push(`${src.wasm}: ${err && err.message}`);
      continue;
    }
    for (const delegate of ['GPU', 'CPU']) {
      try {
        return await Task.createFromOptions(fileset, factory({ modelAssetPath: src.model, delegate }));
      } catch (err) {
        attempts.push(`${src.model} ${delegate}: ${err && err.message}`);
      }
    }
  }
  const e = new Error('Không nạp được model AI. ' + attempts.join(' | '));
  e.name = 'ModelLoadError';
  throw e;
}

// Bọc task MediaPipe: bỏ qua khung hình lỗi (video chưa có kích thước, lỗi nội bộ của graph)
// và tự tạo lại task khi graph hỏng, để vòng lặp game không dừng.
async function resilient(create) {
  let task = await create();
  let rebuilding = false;
  let lastTs = 0;
  let warned = false;
  return {
    // Trả về kết quả nhận diện, hoặc null nếu khung này bỏ qua.
    detect(video, now) {
      if (!task || !video || !video.videoWidth || !video.videoHeight) return null;
      const ts = Math.max(Math.round(now), lastTs + 1); // timestamp phải tăng dần
      lastTs = ts;
      try {
        return task.detectForVideo(video, ts);
      } catch (err) {
        if (!warned) console.warn('[vision] bỏ qua khung lỗi, tạo lại model:', err && err.message);
        warned = true;
        try {
          task.close();
        } catch {
          // bỏ qua
        }
        task = null;
        if (!rebuilding) {
          rebuilding = true;
          create()
            .then((t) => (task = t))
            .catch(() => {})
            .finally(() => (rebuilding = false));
        }
        return null;
      }
    },
    close() {
      if (task) task.close();
      task = null;
    },
  };
}

// ---------- Nhận diện ở luồng riêng + tự hạ mức khi máy chậm ----------
// Mỗi bậc: model + chiều rộng ảnh gửi cho AI. Máy chậm (ClassIn đang chạy lớp ảo, máy OPS yếu)
// thì xuống bậc dưới, không thông báo, không tắt/mở lại camera.
const TIERS = {
  // MediaPipe tự thu ảnh về ~256 px bên trong: gửi 480 px là đủ chính xác mà nhẹ hơn nhiều so với 640.
  full: [{ model: 'poseFull', width: 480 }, { model: 'pose', width: 480 }, { model: 'pose', width: 384 }, { model: 'pose', width: 320 }],
  lite: [{ model: 'pose', width: 480 }, { model: 'pose', width: 384 }, { model: 'pose', width: 320 }, { model: 'pose', width: 256 }],
  face: [{ model: 'face', width: 480 }, { model: 'face', width: 384 }, { model: 'face', width: 320 }, { model: 'face', width: 256 }],
};
const SLOW_MS = 50; // AI mất hơn ~50 ms mỗi khung (dưới ~20 lần/giây: khung xương bắt đầu giật) thì hạ bậc
const SAMPLES = 10;

function sourcesFor(modelKey) {
  const abs = (u) => new URL(u, location.href).href;
  const local = { wasm: abs(LOCAL_WASM), model: abs(MODELS[modelKey].local) };
  const cdn = { wasm: CDN_WASM, model: MODELS[modelKey].cdn };
  return location.protocol === 'file:' ? [cdn, local] : [local, cdn];
}

function workerDetector(kind, options, tiers, delegates = ['GPU', 'CPU']) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL('./vision-worker.js', import.meta.url), { type: 'module' });
    } catch (err) {
      reject(err);
      return;
    }
    let tier = 0;
    let busy = false;
    let fresh = null;
    let ready = false;
    let switching = false;
    let delegate = '';
    let id = 0;
    const ms = [];
    let lastChange = performance.now();
    let results = 0;
    let sent = 0;
    let calls = 0;
    let probing = false;
    let probeTimer = 0;
    let sentAt = 0;
    const key = kind === 'face' ? 'faceLandmarks' : 'landmarks';
    const initTier = () => {
      switching = true;
      worker.postMessage({ type: 'init', kind, options, delegates, sources: sourcesFor(tiers[tier].model) });
    };
    const timer = setTimeout(() => {
      if (!ready) {
        worker.terminate();
        reject(new Error('vision worker timeout'));
      }
    }, 60000);

    const api = {
      mode: 'worker',
      // Luồng riêng im quá 6 giây (GPU treo giữa chừng): báo để bộ bọc bên ngoài khởi động lại bằng CPU.
      get stalled() {
        return Boolean(sentAt) && performance.now() - sentAt > 6000;
      },
      delegates,
      detect(video, now) {
        calls += 1;
        if (ready && !busy && video && video.videoWidth && video.videoHeight) {
          busy = true;
          const w = Math.min(tiers[tier].width, video.videoWidth);
          const h = Math.round((w * video.videoHeight) / video.videoWidth);
          createImageBitmap(video, { resizeWidth: w, resizeHeight: h, resizeQuality: 'low' })
            .then((bitmap) => {
              sent += 1;
              sentAt = performance.now();
              worker.postMessage({ type: 'frame', id: ++id, bitmap, t: now }, [bitmap]);
            })
            .catch((err) => {
              busy = false;
              window.__visionWarn = 'bitmap: ' + (err && err.message);
              if (!api.warned) console.warn('[vision] createImageBitmap:', err && err.message);
              api.warned = true;
            });
        }
        if (!fresh) return null;
        const r = fresh;
        fresh = null;
        return r;
      },
      // Hạ 1 bậc (gọi thêm từ đồng hồ đo FPS của game). Trả về false nếu đã thấp nhất.
      degrade() {
        if (switching || tier >= tiers.length - 1) return false;
        const before = tiers[tier].model;
        tier += 1;
        ms.length = 0;
        lastChange = performance.now();
        if (tiers[tier].model !== before) initTier();
        return true;
      },
      info() {
        const avg = ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : 0;
        return { mode: 'worker', tier, model: tiers[tier].model, width: tiers[tier].width, delegate, ms: Math.round(avg), results, sent, calls, busy };
      },
      close() {
        clearTimeout(timer);
        worker.postMessage({ type: 'close' });
        setTimeout(() => worker.terminate(), 500);
      },
    };

    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'ready') {
        switching = false;
        delegate = m.delegate;
        if (!ready && !probing) {
          // Gửi 1 khung thử: GPU của vài máy / trình duyệt treo ở khung đầu, phải biết trước khi dùng.
          probing = true;
          const c = new OffscreenCanvas(64, 64);
          c.getContext('2d').fillRect(0, 0, 32, 32);
          createImageBitmap(c).then((bitmap) => worker.postMessage({ type: 'frame', id: -1, bitmap, t: performance.now() }, [bitmap]));
          // GPU treo thì bỏ sau 6 s để thử CPU. CPU chỉ chậm (máy yếu / đang bận) chứ không hỏng:
          // vẫn dùng luồng riêng, vì chạy ở luồng chính còn làm game giật hơn.
          probeTimer = setTimeout(() => {
            if (delegate === 'CPU') {
              clearTimeout(timer);
              ready = true;
              resolve(api);
              return;
            }
            worker.terminate();
            reject(new Error(`vision probe timeout (${delegate})`));
          }, delegate === 'CPU' ? 12000 : 6000);
        }
      } else if (m.type === 'error') {
        switching = false;
        if (!ready) {
          clearTimeout(timer);
          worker.terminate();
          reject(new Error(m.message));
        }
      } else if (m.type === 'warn') {
        window.__visionWarn = m.message;
        if (!api.warned) console.warn('[vision worker]', m.message);
        api.warned = true;
      } else if (m.type === 'result' && m.id === -1) {
        clearTimeout(probeTimer);
        clearTimeout(timer);
        if (!ready) {
          ready = true;
          resolve(api);
        }
      } else if (m.type === 'result') {
        busy = false;
        sentAt = 0;
        if (!m.list) return;
        results += 1;
        fresh = { [key]: m.list };
        ms.push(m.ms);
        if (ms.length > SAMPLES) ms.shift();
        const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
        if (ms.length >= SAMPLES && avg > SLOW_MS && performance.now() - lastChange > 3000) api.degrade();
      }
    };
    worker.onerror = (e) => {
      if (!ready) {
        clearTimeout(timer);
        worker.terminate();
        reject(new Error(e.message || 'vision worker error'));
      }
    };
    initTier();
  });
}

// Chạy ở luồng riêng (GPU, không được thì CPU); trình duyệt không hỗ trợ (hoặc bản 1-file mở trực tiếp)
// thì chạy ở luồng chính như cũ. Đang chơi mà luồng riêng treo thì tự thay bằng luồng riêng chạy CPU.
async function startDetector(kind, options, tiers, delegates) {
  const canWorker = typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && typeof createImageBitmap === 'function';
  if (canWorker) {
    for (const list of delegates[0] === 'GPU' ? [delegates, ['CPU']] : [delegates]) {
      try {
        return await workerDetector(kind, options, tiers, list);
      } catch (err) {
        console.warn('[vision] luồng riêng', list.join('/'), 'không chạy được:', err && err.message);
      }
    }
  }
  const main = await resilient(() => createTask(tiers[0].model, (baseOptions) => ({ baseOptions, ...options })));
  return { ...main, mode: 'main', delegates: [], stalled: false, degrade: () => false, info: () => ({ mode: 'main', tier: 0, model: tiers[0].model }) };
}

async function adaptive(kind, options, tiers) {
  // Mặc định CPU (XNNPACK): các model lite/full chỉ mất ~10–30 ms/khung ở luồng riêng. GPU trong worker
  // có máy/trình duyệt bị treo cả tiến trình đồ hoạ (đơ luôn trang), rủi ro lớn hơn lợi ích.
  let inner = await startDetector(kind, options, tiers, window.__visionDelegates || ['CPU']);
  let swapping = false;
  let closed = false;
  const api = {
    detect(video, now) {
      if (inner.stalled && !swapping) {
        swapping = true;
        const old = inner;
        old.close();
        startDetector(kind, options, tiers, ['CPU'])
          .then((d) => (closed ? d.close() : (inner = d)))
          .catch(() => {})
          .finally(() => (swapping = false));
        return null;
      }
      return swapping ? null : inner.detect(video, now);
    },
    degrade: () => inner.degrade(),
    info: () => ({ ...inner.info(), swapping }),
    close() {
      closed = true;
      inner.close();
    },
  };
  window.__vision = api; // để kiểm tra (test) biết đang chạy luồng nào, bậc nào
  return api;
}

// Pose Landmarker: tối đa numPoses người.
// model: 'lite' (nhanh) | 'full' (chính xác hơn khi lớp đông; máy chậm tự chuyển sang lite).
export function createPoseDetector({ numPoses = 1, model = 'lite' } = {}) {
  return adaptive('pose', {
    runningMode: 'VIDEO',
    numPoses,
    minPoseDetectionConfidence: 0.55,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  }, TIERS[model === 'full' ? 'full' : 'lite']);
}

// Face Landmarker: tối đa numFaces khuôn mặt.
export function createFaceDetector({ numFaces = 1 } = {}) {
  return adaptive('face', {
    runningMode: 'VIDEO',
    numFaces,
    minFaceDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  }, TIERS.face);
}

// Chỉ số điểm Pose (theo cơ thể người trong hình: "left" = tay trái của học sinh).
export const POSE = {
  nose: 0, leftEye: 2, rightEye: 5, leftEar: 7, rightEar: 8,
  leftShoulder: 11, rightShoulder: 12, leftElbow: 13, rightElbow: 14,
  leftWrist: 15, rightWrist: 16, leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26, leftAnkle: 27, rightAnkle: 28,
};

export const POSE_LINKS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28], [0, 11], [0, 12],
];

// Vẽ khung xương lên canvas, lật gương theo hình camera.
export function drawSkeleton(ctx, landmarks, { width, height, color = '#04bc09', mirror = true, lineWidth = 6 }) {
  const X = (p) => (mirror ? 1 - p.x : p.x) * width;
  const Y = (p) => p.y * height;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = color;
  for (const [a, b] of POSE_LINKS) {
    const p = landmarks[a];
    const q = landmarks[b];
    if (!p || !q || (p.visibility ?? 1) < 0.4 || (q.visibility ?? 1) < 0.4) continue;
    ctx.beginPath();
    ctx.moveTo(X(p), Y(p));
    ctx.lineTo(X(q), Y(q));
    ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    const p = landmarks[i];
    if (!p || (p.visibility ?? 1) < 0.4) continue;
    ctx.beginPath();
    ctx.arc(X(p), Y(p), lineWidth * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------- So sánh khung hình (Statue Freeze, không dùng AI) ----------

// Lưới cols x rows ô; mỗi khung trả về mảng mức chuyển động (0..255) của từng ô.
export function createMotionGrid({ cols = 16, rows = 9, sampleWidth = 192 } = {}) {
  const sampleHeight = Math.round((sampleWidth * rows) / cols);
  const canvas = document.createElement('canvas');
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let prev = null;
  const cellW = sampleWidth / cols;
  const cellH = sampleHeight / rows;

  return {
    cols,
    rows,
    reset() {
      prev = null;
    },
    // Trả về Float32Array(cols*rows): chênh lệch sáng trung bình của mỗi ô so với khung trước.
    // Ô được đánh số theo hình GƯƠNG (cột 0 = bên trái màn hình).
    measure(video) {
      ctx.save();
      ctx.translate(sampleWidth, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, sampleWidth, sampleHeight);
      ctx.restore();
      const data = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
      const gray = new Uint8Array(sampleWidth * sampleHeight);
      for (let i = 0, j = 0; i < data.length; i += 4, j++) gray[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
      const out = new Float32Array(cols * rows);
      if (prev) {
        const sums = new Float32Array(cols * rows);
        const counts = new Float32Array(cols * rows);
        for (let y = 0; y < sampleHeight; y++) {
          const r = Math.min(rows - 1, Math.floor(y / cellH));
          for (let x = 0; x < sampleWidth; x++) {
            const c = Math.min(cols - 1, Math.floor(x / cellW));
            const k = y * sampleWidth + x;
            const d = Math.abs(gray[k] - prev[k]);
            // Bỏ nhiễu hạt nhỏ của cảm biến.
            sums[r * cols + c] += d > 12 ? d : 0;
            counts[r * cols + c] += 1;
          }
        }
        for (let i = 0; i < out.length; i++) out[i] = sums[i] / counts[i];
      }
      prev = gray;
      return out;
    },
  };
}
