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
    // Production / Release ZIPs ship without maps (smaller, no source leakage).
    // Set T360_SOURCEMAP=1 for local dist debugging.
    sourcemap: process.env.T360_SOURCEMAP === '1',
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
  },
});
