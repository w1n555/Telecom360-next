/**
 * Production-like static host: serves dist/ + optional /site packages.
 * No deploy API — use「匯出 ZIP」then copy to IIS wwwroot.
 */
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT || 8888);

function resolveWebRoot() {
  if (process.env.T360_WEB_ROOT) return path.resolve(process.env.T360_WEB_ROOT);
  const inetpub = 'C:\\inetpub\\wwwroot';
  if (fs.existsSync(inetpub)) return inetpub;
  return dist;
}
const webRoot = resolveWebRoot();

if (!fs.existsSync(dist)) {
  console.error('dist/ not found. Run: npm run build');
  process.exit(1);
}

fs.mkdirSync(path.join(webRoot, 'site'), { recursive: true });

const app = express();
app.use('/site', express.static(path.join(webRoot, 'site')));
app.use(express.static(dist));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/site')) return next();
  res.sendFile(path.join(dist, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[Telecom360-Three.js] http://127.0.0.1:${port}/`);
  console.log(`[Telecom360-Three.js] site packages: ${path.join(webRoot, 'site')}`);
});
