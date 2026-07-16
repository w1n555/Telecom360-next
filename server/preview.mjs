/**
 * Production-like static host: serves dist/ + /api/deploy into dist/ (or T360_WEB_ROOT).
 * Use after `npm run build`. Point IIS ARR or reverse-proxy here, or run as the site backend.
 */
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDeployRouter } from './deploy-api.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT || 8888);
const webRoot = process.env.T360_WEB_ROOT ? path.resolve(process.env.T360_WEB_ROOT) : dist;

if (!fs.existsSync(dist)) {
  console.error('dist/ not found. Run: npm run build');
  process.exit(1);
}

fs.mkdirSync(path.join(webRoot, 'site'), { recursive: true });

const app = express();
app.use('/api', createDeployRouter(webRoot));
app.use('/site', express.static(path.join(webRoot, 'site')));
app.use(express.static(dist));

// SPA fallback for editor
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/site')) return next();
  res.sendFile(path.join(dist, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[Telecom360-Three.js] http://127.0.0.1:${port}/`);
  console.log(`[Telecom360-Three.js] site root: ${path.join(webRoot, 'site')}`);
});
