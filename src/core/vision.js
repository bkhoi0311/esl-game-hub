// Thị giác máy tính chạy hoàn toàn trên máy: MediaPipe (Pose / Face) và so sánh khung hình (frame differencing).
// Model và WASM nạp từ CDN chính thức; mất mạng thì nạp bản lưu sẵn trong ./models (cần mở qua server local).
const MP_VERSION = '1.0.1';
const CDN_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const LOCAL_WASM = './models/wasm';
const MODELS = {
  pose: {
    cdn: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    local: './models/pose_landmarker_lite.task',
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

async function resolveFileset(lib) {
  try {
    return { fileset: await lib.FilesetResolver.forVisionTasks(CDN_WASM), source: 'cdn' };
  } catch {
    return { fileset: await lib.FilesetResolver.forVisionTasks(LOCAL_WASM), source: 'local' };
  }
}

async function createTask(kind, factory) {
  const lib = await loadLib();
  const { fileset } = await resolveFileset(lib);
  const Task = kind === 'pose' ? lib.PoseLandmarker : lib.FaceLandmarker;
  const attempts = [];
  for (const modelAssetPath of [MODELS[kind].cdn, MODELS[kind].local]) {
    for (const delegate of ['GPU', 'CPU']) {
      try {
        return await Task.createFromOptions(fileset, factory({ modelAssetPath, delegate }));
      } catch (err) {
        attempts.push(`${modelAssetPath} ${delegate}: ${err && err.message}`);
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

// Pose Landmarker: tối đa numPoses người.
export function createPoseDetector({ numPoses = 1 } = {}) {
  return resilient(() => createTask('pose', (baseOptions) => ({
    baseOptions,
    runningMode: 'VIDEO',
    numPoses,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })));
}

// Face Landmarker: tối đa numFaces khuôn mặt.
export function createFaceDetector({ numFaces = 1 } = {}) {
  return resilient(() => createTask('face', (baseOptions) => ({
    baseOptions,
    runningMode: 'VIDEO',
    numFaces,
    minFaceDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })));
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
