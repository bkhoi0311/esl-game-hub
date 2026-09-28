import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// mode "offline": gộp toàn bộ thành 1 file dist/index.html (mở bằng bấm đúp).
export default defineConfig(({ mode }) => {
  const offline = mode === 'offline';
  return {
    base: './',
    define: {
      __SINGLE_FILE__: JSON.stringify(offline),
    },
    plugins: offline ? [viteSingleFile()] : [],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
