import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

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
    plugins: offline ? [viteSingleFile()] : [],
    // File giọng đọc được tạo hàng loạt bằng script: không tải lại trang mỗi khi có file mới.
    server: { watch: { ignored: ['**/src/assets/voices/**', '**/tools/**'] } },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
