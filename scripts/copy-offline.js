// Sau `npm run build`: chép bản 1-file vào dist/offline.html.
// Nút "Lưu thành file mới" ở bản online tải file này về rồi nhúng nội dung bài.
import { copyFileSync, rmSync } from 'node:fs';

copyFileSync('.offline-tmp/index.html', 'dist/offline.html');
rmSync('.offline-tmp', { recursive: true, force: true });
console.log('dist/offline.html ready');
