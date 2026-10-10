import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Bản offline (mở bằng file://) không có public/start/: gỡ đoạn chuyển hướng về màn chọn khỏi HTML.
const stripChooser = {
  name: 'strip-chooser-redirect',
  transformIndexHtml(html) {
    return html.replace(/<!--chooser-redirect:start-->[\s\S]*?<!--chooser-redirect:end-->/, '');
  },
};

// mode "offline": gộp toàn bộ thành 1 file dist/index.html (mở bằng bấm đúp).
export default defineConfig(({ mode }) => {
  const offline = mode === 'offline';
  return {
    base: './',
    // Bản 1-file không cần thư mục public (model AI ~40 MB chỉ dùng ở bản online / server local).
    publicDir: offline ? false : 'public',
    define: {
      __SINGLE_FILE__: JSON.stringify(offline),
    },
    plugins: offline ? [stripChooser, viteSingleFile()] : [],
    // File giọng đọc được tạo hàng loạt bằng script: không tải lại trang mỗi khi có file mới.
    server: { watch: { ignored: ['**/src/assets/voices/**', '**/tools/**'] } },
    // Gói sẵn thư viện ngay khi khởi động dev server: tránh tự tải lại trang khi game nạp Phaser lần đầu.
    optimizeDeps: { include: ['phaser', 'gsap', 'canvas-confetti', '@mediapipe/tasks-vision'] },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
