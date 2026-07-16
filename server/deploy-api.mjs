/**
 * Deploy API: writes static viewer packages to {webRoot}/site/{SITE}/{ROOM}/{DATE}/
 * Used by Editor one-click deploy (same origin /api/deploy).
 */
import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

/** @param {string} webRoot absolute path to IIS / static site root */
export function createDeployRouter(webRoot) {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 120 * 1024 * 1024 } });

  router.get('/health', (_req, res) => {
    res.json({ ok: true, webRoot });
  });

  router.post('/deploy', upload.array('files'), (req, res) => {
    try {
      const siteCode = String(req.body.siteCode || '').trim();
      const roomName = String(req.body.roomName || '').trim();
      const photoDate = String(req.body.photoDate || '').trim();
      if (!siteCode || !roomName || !photoDate) {
        return res.status(400).json({ ok: false, error: 'missing_fields' });
      }
      if (/[\\/]|\.\./.test(siteCode) || /[\\/]|\.\./.test(roomName) || /[\\/]|\.\./.test(photoDate)) {
        return res.status(400).json({ ok: false, error: 'invalid_path_segment' });
      }

      const target = path.join(webRoot, 'site', siteCode, roomName, photoDate);
      fs.mkdirSync(target, { recursive: true });

      const files = req.files || [];
      if (!files.length) {
        return res.status(400).json({ ok: false, error: 'no_files' });
      }

      for (const f of files) {
        const rel = String(f.originalname || '').replace(/\\/g, '/');
        if (!rel || rel.includes('..') || path.isAbsolute(rel)) {
          return res.status(400).json({ ok: false, error: 'invalid_file_path' });
        }
        const dest = path.join(target, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, f.buffer);
      }

      const publicPath = `/site/${encodeURIComponent(siteCode)}/${encodeURIComponent(roomName)}/${encodeURIComponent(photoDate)}/`;
      res.json({
        ok: true,
        path: target,
        url: publicPath,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ ok: false, error: String(err.message || err) });
    }
  });

  return router;
}

export function defaultWebRoot() {
  return process.env.T360_WEB_ROOT
    ? path.resolve(process.env.T360_WEB_ROOT)
    : path.join(REPO_ROOT, 'dist');
}
