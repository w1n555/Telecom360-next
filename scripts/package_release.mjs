/**
 * Build a ready-to-copy IIS release ZIP from dist/.
 *
 * Usage (from repo root):
 *   npm run release
 *   → npm run build, then zip dist/ → release/Telecom360-next-v{version}-iis.zip
 *
 * ZIP contents (unzip and copy all into IIS site root):
 *   index.html, assets/, brand/, viewer-shell/, web.config, RELEASE.txt
 *
 * Excluded from ZIP (not needed on IIS):
 *   dist/viewer/  — Vite multi-page intermediate (shell is viewer-shell/)
 *   *.map, .gitkeep, OS junk
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

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
  mustExist('web.config', 'web.config (MIME for .json / .mjs / .wasm)');
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
  if (!assetFiles.some((n) => n.startsWith('main-'))) {
    throw new Error('Release check failed: dist/assets/ has no main-* Editor bundle');
  }

  const brand = path.join(DIST, 'brand');
  if (!fs.existsSync(brand) || !fs.statSync(brand).isDirectory()) {
    throw new Error('Release check failed: dist/brand/ missing');
  }

  const webConfig = fs.readFileSync(path.join(DIST, 'web.config'), 'utf8');
  for (const ext of ['.json', '.mjs', '.wasm']) {
    if (!webConfig.includes(`fileExtension="${ext}"`) || !webConfig.includes('mimeMap')) {
      throw new Error(`Release check failed: dist/web.config missing MIME for ${ext}`);
    }
  }

  const man = JSON.parse(
    fs.readFileSync(path.join(DIST, 'viewer-shell', 'manifest.json'), 'utf8')
  );
  if (!man?.files?.length) {
    throw new Error('Release check failed: viewer-shell/manifest.json has empty files list');
  }

  // Every listed shell file must exist on disk with non-zero size
  for (const entry of man.files) {
    const rel = String(entry.path || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '');
    if (!rel || rel.includes('..')) {
      throw new Error(`Release check failed: invalid viewer-shell path in manifest: ${entry.path}`);
    }
    const abs = path.join(DIST, 'viewer-shell', rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      throw new Error(`Release check failed: viewer-shell missing file from manifest: ${rel}`);
    }
    if (fs.statSync(abs).size <= 0) {
      throw new Error(`Release check failed: viewer-shell file empty: ${rel}`);
    }
  }

  console.log('[package_release] dist validation OK');
  console.log(
    '[package_release]   viewer-shell files:',
    man.files.map((f) => f.path).join(', ')
  );
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

/**
 * Paths relative to dist/ that must not ship in the IIS Release ZIP.
 * - viewer/ is Vite multi-page intermediate; production Viewer is viewer-shell/
 */
function shouldSkipReleasePath(relPosix, baseName) {
  if (baseName.endsWith('.map')) return true;
  if (baseName === '.DS_Store' || baseName === 'Thumbs.db') return true;
  if (baseName === '.gitkeep') return true;
  // Intermediate Vite viewer page (not the export shell)
  if (relPosix === 'viewer' || relPosix.startsWith('viewer/')) return true;
  return false;
}

/** Prefer system tar (Windows 10+ / macOS / Linux) to avoid extra deps. */
function zipWithTar(zipPath, sourceDir) {
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
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  let fileCount = 0;

  function addDir(dir, prefix) {
    for (const name of fs.readdirSync(dir)) {
      if (name === '.' || name === '..') continue;
      const abs = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const relPosix = rel.replace(/\\/g, '/');
      if (shouldSkipReleasePath(relPosix, name)) continue;
      const st = fs.statSync(abs);
      if (st.isDirectory()) {
        addDir(abs, relPosix);
      } else {
        zip.file(relPosix, fs.readFileSync(abs));
        fileCount += 1;
      }
    }
  }

  addDir(sourceDir, '');
  if (fileCount < 5) {
    throw new Error(`Release ZIP too sparse (${fileCount} files) — dist may be incomplete`);
  }

  const buf = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  fs.writeFileSync(zipPath, buf);
  return fileCount;
}

/** Prefer JSZip so we can exclude paths consistently on all platforms. */
async function createZip(zipPath, sourceDir) {
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  const count = await zipWithJszip(zipPath, sourceDir);
  if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size < 100) {
    // last resort: tar (may include paths we prefer to skip)
    zipWithTar(zipPath, sourceDir);
    console.log('[package_release] ZIP via tar (fallback — may include viewer/)');
    return;
  }
  console.log(`[package_release] ZIP via JSZip (${count} files)`);
}

function runNpmBuild() {
  console.log('[package_release] running npm run build…');
  // Prefer npm.cmd on Windows; fall back to npm for Unix CI
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const build = spawnSync(npmCmd, ['run', 'build'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

async function main() {
  const skipBuild = process.argv.includes('--no-build');
  if (!skipBuild) {
    runNpmBuild();
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

  // Post-zip sanity: critical paths present, intermediate viewer/ absent
  const JSZip = (await import('jszip')).default;
  const z = await JSZip.loadAsync(fs.readFileSync(zipPath));
  const names = Object.keys(z.files).filter((n) => !z.files[n].dir);
  const required = [
    'index.html',
    'web.config',
    'viewer-shell/index.html',
    'viewer-shell/manifest.json',
  ];
  for (const r of required) {
    if (!names.includes(r) && !names.some((n) => n.replace(/^\.\//, '') === r)) {
      throw new Error(`Release ZIP missing required path: ${r}`);
    }
  }
  if (names.some((n) => n === 'viewer/index.html' || n.startsWith('viewer/'))) {
    throw new Error('Release ZIP must not include dist/viewer/ intermediate output');
  }
  if (names.some((n) => n.endsWith('.gitkeep') || n.endsWith('.map'))) {
    throw new Error('Release ZIP must not include .gitkeep or .map files');
  }

  const sizeMb = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(2);
  console.log(`[package_release] wrote ${zipPath} (${sizeMb} MB)`);
  console.log('[package_release] Deploy: unzip → copy all files into IIS site root.');
}

main().catch((e) => {
  console.error('[package_release]', e.message || e);
  process.exit(1);
});
