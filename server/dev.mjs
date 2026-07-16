/**
 * Dev: Vite middleware + /api/deploy writing into ./dist/site (and project site/ for convenience).
 */
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDeployRouter } from './deploy-api.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 8888);

// Deploy into repo-level site/ so it mirrors IIS layout even in dev
const webRoot = process.env.T360_WEB_ROOT ? path.resolve(process.env.T360_WEB_ROOT) : root;
fs.mkdirSync(path.join(webRoot, 'site'), { recursive: true });

const app = express();
app.use('/api', createDeployRouter(webRoot));
app.use('/site', express.static(path.join(webRoot, 'site')));

const vite = await createViteServer({
  root,
  appType: 'spa',
  server: {
    middlewareMode: true,
    // CRITICAL: one-click deploy writes into ./site/ — must NOT trigger Vite full reload
    // (reload wipes in-memory project → all panoramas disappear, success UI never shows)
    watch: {
      ignored: [
        '**/site/**',
        '**/dist/**',
        '**/node_modules/**',
        '**/.git/**',
      ],
    },
  },
});
app.use(vite.middlewares);

app.listen(port, '0.0.0.0', () => {
  console.log(`[Telecom360-Three.js] Editor  http://127.0.0.1:${port}/`);
  console.log(`[Telecom360-Three.js] Deploy → ${path.join(webRoot, 'site')}\\{{SITE}}\\{{ROOM}}\\{{DATE}}\\`);
  console.log(`[Telecom360-Three.js] Health  http://127.0.0.1:${port}/api/health`);
});
