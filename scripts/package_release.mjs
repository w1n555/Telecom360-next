/**
 * Build a ready-to-copy IIS release ZIP from dist/.
 *
 * Usage (from repo root):
 *   npm run release
 *   → npm run build, then zip dist/ → release/Telecom360-next-v{version}-iis.zip
 *
 * ZIP contents (unzip and copy all into IIS site root):
 *   index.html, assets/, brand/, viewer-shell/, web.config, …
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const RELEASE_DIR = path.join(ROOT, 'release');

function readVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  return String(pkg.version || '0.0.0');
}

function mustExist(rel, label) {
  const abs = path.join(DIST, rel);
  if (!fs.existsSync(abs)) {
    throw new Error(`Release check failed: missing ${label} (${path.join('dist', rel)})`);
  }
  return abs;
}

function validateDist() {
  mustExist('index.html', 'Editor index.html');
  mustExist('web.config', 'web.config (MIME for .json / .mjs)');
  mustExist(path.join('viewer-shell', 'index.html'), 'viewer-shell/index.html');
  mustExist(path.join('viewer-shell', 'manifest.json'), 'viewer-shell/manifest.json');

  const assets = path.join(DIST, 'assets');
  if (!fs.existsSync(assets) || !fs.statSync(assets).isDirectory()) {
    throw new Error('Release check failed: dist/assets/ missing or not a directory');
  }
  const assetFiles = fs.readdirSync(assets).filter((n) => !n.endsWith('.map'));
  if (!assetFiles.length) {
    throw new Error('Release check failed: dist/assets/ has no files');
  }

  const brand = path.join(DIST, 'brand');
  if (!fs.existsSync(brand) || !fs.statSync(brand).isDirectory()) {
    throw new Error('Release check failed: dist/brand/ missing');
  }

  const webConfig = fs.readFileSync(path.join(DIST, 'web.config'), 'utf8');
  if (!webConfig.includes('fileExtension=".json"') || !webConfig.includes('mimeMap')) {
    throw new Error('Release check failed: dist/web.config missing .json MIME mapping');
  }

  const man = JSON.parse(
    fs.readFileSync(path.join(DIST, 'viewer-shell', 'manifest.json'), 'utf8')
  );
  if (!man?.files?.length) {
    throw new Error('Release check failed: viewer-shell/manifest.json has empty files list');
  }

  console.log('[package_release] dist validation OK');
  console.log('[package_release]   viewer-shell files:', man.files.map((f) => f.path).join(', '));
}

function writeReleaseNotes(version) {
  const text = `Telecom360-next v${version} — IIS install package
================================================
Contents: Editor + viewer-shell + web.config (static files only).

Deploy (no Node.js, no scripts):
  1. Unzip this archive
  2. Copy ALL files into the IIS website physical path
     (e.g. C:\\inetpub\\wwwroot)
  3. Open the site in a browser — Editor is ready

web.config is included (MIME for .json / .mjs / .wasm).
Do not delete viewer-shell/ — required for 「匯出 ZIP」.

Published tours live under site/{SITE}/{ROOM}/{DATE}/ after you
export from the Editor and unzip the tour package into the same IIS root.

See README.md for full usage.
`;
  fs.writeFileSync(path.join(DIST, 'RELEASE.txt'), text, 'utf8');
}

/** Prefer system tar (Windows 10+ / macOS / Linux) to avoid extra deps. */
function zipWithTar(zipPath, sourceDir) {
  // tar -a -c -f zip -C sourceDir .
  const r = spawnSync(
    'tar',
    ['-a', '-c', '-f', zipPath, '-C', sourceDir, '.'],
    { encoding: 'utf8', shell: false }
  );
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || '').trim() || `tar exit ${r.status}`;
    throw new Error(`Failed to create ZIP with tar: ${err}`);
  }
}

async function zipWithJszip(zipPath, sourceDir) {
  // Fallback if tar unavailable: use jszip from project deps
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  function addDir(dir, prefix) {
    for (const name of fs.readdirSync(dir)) {
      if (name === '.' || name === '..') continue;
      const abs = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const st = fs.statSync(abs);
      if (st.isDirectory()) {
        addDir(abs, rel.replace(/\\/g, '/'));
      } else {
        zip.file(rel.replace(/\\/g, '/'), fs.readFileSync(abs));
      }
    }
  }

  addDir(sourceDir, '');
  const buf = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  fs.writeFileSync(zipPath, buf);
}

async function createZip(zipPath, sourceDir) {
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  const tarCheck = spawnSync('tar', ['--version'], { encoding: 'utf8' });
  if (tarCheck.status === 0) {
    try {
      zipWithTar(zipPath, sourceDir);
      // Verify non-empty
      if (fs.existsSync(zipPath) && fs.statSync(zipPath).size > 100) {
        console.log('[package_release] ZIP via tar');
        return;
      }
    } catch (e) {
      console.warn('[package_release] tar zip failed, falling back to JSZip:', e.message);
    }
  }

  await zipWithJszip(zipPath, sourceDir);
  console.log('[package_release] ZIP via JSZip');
}

async function main() {
  const skipBuild = process.argv.includes('--no-build');
  if (!skipBuild) {
    console.log('[package_release] running npm run build…');
    const build = spawnSync('npm.cmd', ['run', 'build'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
    });
    if (build.status !== 0) {
      process.exit(build.status ?? 1);
    }
  } else if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    throw new Error('dist/ missing — run npm run build first (or omit --no-build)');
  }

  validateDist();
  const version = readVersion();
  writeReleaseNotes(version);

  fs.mkdirSync(RELEASE_DIR, { recursive: true });
  const zipName = `Telecom360-next-v${version}-iis.zip`;
  const zipPath = path.join(RELEASE_DIR, zipName);

  await createZip(zipPath, DIST);

  const sizeMb = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(2);
  console.log(`[package_release] wrote ${zipPath} (${sizeMb} MB)`);
  console.log('[package_release] Deploy: unzip → copy all files into IIS site root.');
}

main().catch((e) => {
  console.error('[package_release]', e.message || e);
  process.exit(1);
});
