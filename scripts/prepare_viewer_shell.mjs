/**
 * After `vite build`, assemble a self-contained offline viewer shell for ZIP export.
 *
 * Input:  dist/viewer/index.html (+ hashed assets under dist/assets, brand under dist/brand)
 * Output: dist/viewer-shell/ and public/viewer-shell/
 *   index.html          (paths rewritten to ./assets/…, ./brand/…)
 *   assets/*            (viewer JS/CSS chunks; no .map)
 *   brand/*             (favicon / logo referenced by shell)
 *   manifest.json       (file list for ExportService)
 *
 * ExportService fetches /viewer-shell/* at runtime and copies them into each tour ZIP
 * alongside project.json + assets/source/*.jpg — no runtime HTML generation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const VIEWER_HTML = path.join(DIST, 'viewer', 'index.html');
const OUT_DIST = path.join(DIST, 'viewer-shell');
const OUT_PUBLIC = path.join(ROOT, 'public', 'viewer-shell');

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function collectHtmlRefs(html) {
  const refs = new Set();
  const re = /(?:src|href)=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const u = m[1].trim();
    if (!u || u.startsWith('data:') || u.startsWith('http:') || u.startsWith('https:') || u.startsWith('//') || u.startsWith('#')) {
      continue;
    }
    refs.add(u);
  }
  return [...refs];
}

/** Resolve a path relative to dist/viewer/index.html → absolute file under dist/ */
function resolveFromViewerHtml(rel) {
  const abs = path.normalize(path.join(DIST, 'viewer', rel));
  if (!abs.startsWith(DIST)) {
    throw new Error(`Ref escapes dist: ${rel}`);
  }
  return abs;
}

function rewriteHtml(html) {
  // Vite multi-page viewer lives in dist/viewer/ so assets are ../assets and ../brand
  return html
    .replace(/(src|href)=["']\.\.\/assets\//gi, '$1="./assets/')
    .replace(/(src|href)=["']\.\.\/brand\//gi, '$1="./brand/')
    .replace(/(src|href)=["']\/brand\//gi, '$1="./brand/')
    .replace(/(src|href)=["']\/assets\//gi, '$1="./assets/');
}

function copyFile(from, to) {
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
}

function writeShell(outRoot, html, fileEntries) {
  rmrf(outRoot);
  ensureDir(outRoot);
  fs.writeFileSync(path.join(outRoot, 'index.html'), html, 'utf8');

  for (const { abs, shellPath } of fileEntries) {
    if (shellPath === 'index.html') continue;
    const dest = path.join(outRoot, shellPath);
    copyFile(abs, dest);
  }

  const manifest = {
    format: 'telecom360-viewer-shell',
    version: 1,
    generatedAt: new Date().toISOString(),
    files: [
      { path: 'index.html' },
      ...fileEntries.map((e) => ({ path: e.shellPath })),
    ],
  };
  // de-dupe paths
  const seen = new Set();
  manifest.files = manifest.files.filter((f) => {
    if (seen.has(f.path)) return false;
    seen.add(f.path);
    return true;
  });
  fs.writeFileSync(path.join(outRoot, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}

function main() {
  if (!fs.existsSync(VIEWER_HTML)) {
    throw new Error(`Missing ${VIEWER_HTML} — run vite build first`);
  }

  let html = fs.readFileSync(VIEWER_HTML, 'utf8');
  const refs = collectHtmlRefs(html);
  const fileEntries = [];

  for (const ref of refs) {
    const abs = resolveFromViewerHtml(ref);
    if (!fs.existsSync(abs)) {
      console.warn('[prepare_viewer_shell] skip missing ref:', ref);
      continue;
    }
    // skip source maps in package (smaller ZIP; not needed offline)
    if (abs.endsWith('.map')) continue;

    const relFromDist = path.relative(DIST, abs).replace(/\\/g, '/');
    let shellPath;
    if (relFromDist.startsWith('assets/')) shellPath = relFromDist;
    else if (relFromDist.startsWith('brand/')) shellPath = relFromDist;
    else shellPath = `assets/${path.basename(abs)}`;

    fileEntries.push({ abs, shellPath, ref });
  }

  // Always include brand assets viewer may load at runtime (relative brand/…)
  const brandDir = path.join(DIST, 'brand');
  if (fs.existsSync(brandDir)) {
    for (const name of fs.readdirSync(brandDir)) {
      const abs = path.join(brandDir, name);
      if (!fs.statSync(abs).isFile()) continue;
      if (name === '.gitkeep') continue;
      const shellPath = `brand/${name}`;
      if (!fileEntries.some((e) => e.shellPath === shellPath)) {
        fileEntries.push({ abs, shellPath, ref: `../brand/${name}` });
      }
    }
  }

  html = rewriteHtml(html);

  const manDist = writeShell(OUT_DIST, html, fileEntries);
  const manPub = writeShell(OUT_PUBLIC, html, fileEntries);

  console.log('[prepare_viewer_shell] wrote', OUT_DIST);
  console.log('[prepare_viewer_shell] wrote', OUT_PUBLIC);
  console.log(
    '[prepare_viewer_shell] files:',
    manDist.files.map((f) => f.path).join(', ')
  );
  if (manPub.files.length !== manDist.files.length) {
    console.warn('[prepare_viewer_shell] public/dist file count mismatch');
  }
}

main();
