// Nạp src/core/content.js (normalizePack, validatePack...) trong Node: file gốc import JSON không có
// import attribute nên Node không nạp thẳng được. Ta bỏ dòng import đó và nạp qua data: URL.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
let cached = null;

export async function loadContent() {
  if (cached) return cached;
  const file = path.join(here, '../../src/core/content.js');
  const src = fs.readFileSync(file, 'utf8').replace(/^import\s+samplePack\s+from\s+['"][^'"]+['"];?\s*$/m, 'const samplePack = {};');
  if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: () => null };
  cached = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
  return cached;
}
