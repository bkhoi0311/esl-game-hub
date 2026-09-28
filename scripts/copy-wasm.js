// Chép file WASM của MediaPipe từ node_modules vào public/models/wasm,
// để 3 game AI chạy được qua server local khi không có mạng (không commit vào git).
import { cpSync, existsSync, mkdirSync } from 'node:fs';

const src = 'node_modules/@mediapipe/tasks-vision/wasm';
const dest = 'public/models/wasm';
mkdirSync(dest, { recursive: true });
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']) {
  if (!existsSync(`${dest}/${f}`)) cpSync(`${src}/${f}`, `${dest}/${f}`);
}
