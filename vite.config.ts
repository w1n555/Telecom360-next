import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: '.',
  base: './',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        viewer: resolve(__dirname, 'viewer/index.html'),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    watch: {
      // deploy output must not hot-reload the editor
      ignored: ['**/site/**', '**/dist/**', '**/node_modules/**'],
    },
    proxy: {
      '/api': 'http://127.0.0.1:8889',
      '/site': 'http://127.0.0.1:8889',
    },
  },
});
