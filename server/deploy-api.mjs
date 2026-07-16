/**
 * Deploy API: accepts a single ZIP and extracts to
 * {webRoot}/site/{SITE}/{ROOM}/{DATE}/
 */
import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

/** @param {string} webRoot absolute path to site root */
export function createDeployRouter(webRoot) {
  const router = express.Router();
  // 11904×5952 × many scenes → allow large package (500MB)
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 500 * 1024 * 1024,
      files: 5,
      fields: 20,
      fieldSize: 2 * 1024 * 1024,
    },
  });

  router.get('/health', (_req, res) => {
    res.json({ ok: true, webRoot });
  });

  /** List deployed packages under site/{SITE}/{ROOM}/{DATE}/ */
  router.get('/sites', (_req, res) => {
    try {
      const siteRoot = path.join(webRoot, 'site');
      const out = [];
      if (!fs.existsSync(siteRoot)) return res.json({ ok: true, sites: [] });
      for (const siteCode of fs.readdirSync(siteRoot)) {
        const p1 = path.join(siteRoot, siteCode);
        if (!fs.statSync(p1).isDirectory() || siteCode.startsWith('.')) continue;
        for (const roomName of fs.readdirSync(p1)) {
          const p2 = path.join(p1, roomName);
          if (!fs.statSync(p2).isDirectory()) continue;
          for (const photoDate of fs.readdirSync(p2)) {
            const p3 = path.join(p2, photoDate);
            if (!fs.statSync(p3).isDirectory()) continue;
            if (!fs.existsSync(path.join(p3, 'index.html'))) continue;
            out.push({
              siteCode,
              roomName,
              photoDate,
              url: `/site/${encodeURIComponent(siteCode)}/${encodeURIComponent(roomName)}/${encodeURIComponent(photoDate)}/`,
            });
          }
        }
      }
      out.sort((a, b) => (a.siteCode + a.roomName + a.photoDate).localeCompare(b.siteCode + b.roomName + b.photoDate));
      res.json({ ok: true, sites: out });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e) });
    }
  });

  router.post('/deploy', (req, res) => {
    upload.single('package')(req, res, async (err) => {
      if (err) {
        console.error('[deploy] multer', err);
        const code = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(code).json({
          ok: false,
          error: err.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : String(err.message || err),
        });
      }
      try {
        const siteCode = String(req.body?.siteCode || '').trim();
        const roomName = String(req.body?.roomName || '').trim();
        const photoDate = String(req.body?.photoDate || '').trim();
        if (!siteCode || !roomName || !photoDate) {
          return res.status(400).json({ ok: false, error: 'missing_fields' });
        }
        if (/[\\/]|\.\./.test(siteCode) || /[\\/]|\.\./.test(roomName) || /[\\/]|\.\./.test(photoDate)) {
          return res.status(400).json({ ok: false, error: 'invalid_path_segment' });
        }
        if (!req.file?.buffer?.length) {
          return res.status(400).json({ ok: false, error: 'no_package' });
        }

        const target = path.join(webRoot, 'site', siteCode, roomName, photoDate);
        // clean previous deploy of same path
        fs.rmSync(target, { recursive: true, force: true });
        fs.mkdirSync(target, { recursive: true });

        const zip = await JSZip.loadAsync(req.file.buffer);
        const entries = Object.keys(zip.files);
        let written = 0;
        for (const name of entries) {
          const entry = zip.files[name];
          if (!entry || entry.dir) continue;
          const rel = name.replace(/\\/g, '/').replace(/^\//, '');
          if (!rel || rel.includes('..')) {
            return res.status(400).json({ ok: false, error: 'invalid_file_path' });
          }
          const dest = path.join(target, rel);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          const buf = await entry.async('nodebuffer');
          fs.writeFileSync(dest, buf);
          written += 1;
        }
        if (!written) {
          return res.status(400).json({ ok: false, error: 'empty_package' });
        }

        // ensure index.html at root of target
        if (!fs.existsSync(path.join(target, 'index.html'))) {
          return res.status(400).json({ ok: false, error: 'missing_index' });
        }

        const publicPath = `/site/${encodeURIComponent(siteCode)}/${encodeURIComponent(roomName)}/${encodeURIComponent(photoDate)}/`;
        res.json({ ok: true, path: target, url: publicPath, files: written });
      } catch (e) {
        console.error('[deploy]', e);
        res.status(500).json({ ok: false, error: String(e.message || e) });
      }
    });
  });

  return router;
}

export function defaultWebRoot() {
  return process.env.T360_WEB_ROOT ? path.resolve(process.env.T360_WEB_ROOT) : path.join(REPO_ROOT, 'dist');
}
