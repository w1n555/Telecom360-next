/**
 * Dev: Vite middleware + static /site for local preview of exported packages.
 * No one-click deploy API — export ZIP and copy manually.
 */
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 8888);

// Optional: serve previously copied packages under ./site
const webRoot = process.env.T360_WEB_ROOT ? path.resolve(process.env.T360_WEB_ROOT) : root;
fs.mkdirSync(path.join(webRoot, 'site'), { recursive: true });

const app = express();
app.use('/site', express.static(path.join(webRoot, 'site')));

const vite = await createViteServer({
  root,
  appType: 'spa',
  server: {
    middlewareMode: true,
    watch: {
      ignored: ['**/site/**', '**/dist/**', '**/node_modules/**', '**/.git/**'],
    },
  },
});
app.use(vite.middlewares);

app.listen(port, '0.0.0.0', () => {
  console.log(`[Telecom360-next] Editor  http://127.0.0.1:${port}/`);
  console.log(`[Telecom360-next] Static site packages: ${path.join(webRoot, 'site')}`);
  console.log(`[Telecom360-next] Export ZIP → unzip to Web root (manual copy, no API)`);
});
