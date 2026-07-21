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
 * Asset discovery (robust, in order):
 *   1) Vite build.manifest entry for viewer/index.html (imports / css / dynamicImports)
 *   2) HTML src|href (+ modulepreload)
 *   3) Walk ESM import graph from entry JS (catches nested chunks without preload)
 *
 * ExportService fetches /viewer-shell/* at runtime and copies them into each tour ZIP
 * alongside project.json + assets/source/*.jpg — no runtime HTML generation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectHtmlRefs,
  collectManifestEntryAssets,
  loadViteManifest,
  resolveFromHtmlPage,
  walkJsImportGraph,
} from './asset_graph.mjs';

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

function toShellPath(relFromDist) {
  const rel = relFromDist.replace(/\\/g, '/');
  if (rel.startsWith('assets/')) return rel;
  if (rel.startsWith('brand/')) return rel;
  return `assets/${path.basename(rel)}`;
}

function writeShell(outRoot, html, fileEntries) {
  rmrf(outRoot);
  ensureDir(outRoot);
  fs.writeFileSync(path.join(outRoot, 'index.html'), html, 'utf8');

  for (const { abs, shellPath } of fileEntries) {
    if (shellPath === 'index.html') continue;
    copyFile(abs, path.join(outRoot, shellPath));
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
  const htmlDir = path.dirname(VIEWER_HTML);
  const distRelFiles = new Set(); // paths relative to dist/
  const sources = [];

  // 1) Vite manifest graph (preferred)
  const viteMan = loadViteManifest(DIST);
  if (viteMan) {
    const keys = Object.keys(viteMan.data);
    const viewerKey =
      keys.find((k) => k === 'viewer/index.html' || k.endsWith('/viewer/index.html')) ||
      keys.find((k) => /viewer\/index\.html$/i.test(k));
    if (viewerKey) {
      const fromMan = collectManifestEntryAssets(viteMan.data, viewerKey);
      for (const rel of fromMan) distRelFiles.add(rel);
      sources.push(`vite-manifest:${viewerKey} (${fromMan.size})`);
    } else {
      console.warn('[prepare_viewer_shell] vite manifest has no viewer/index.html entry');
    }
  } else {
    console.warn('[prepare_viewer_shell] no Vite manifest — falling back to HTML + JS walk');
  }

  // 2) HTML refs (script / link / modulepreload / favicon)
  for (const ref of collectHtmlRefs(html)) {
    try {
      const abs = resolveFromHtmlPage(DIST, htmlDir, ref);
      if (!fs.existsSync(abs) || abs.endsWith('.map')) continue;
      distRelFiles.add(path.relative(DIST, abs).replace(/\\/g, '/'));
    } catch (e) {
      console.warn('[prepare_viewer_shell] skip bad HTML ref:', ref, e.message);
    }
  }
  sources.push(`html-refs`);

  // 3) Walk JS import graph from every .js already collected (and entry scripts in HTML)
  const jsSeeds = [...distRelFiles].filter((r) => /\.m?js$/i.test(r));
  for (const ref of collectHtmlRefs(html)) {
    if (/\.m?js$/i.test(ref)) {
      try {
        const abs = resolveFromHtmlPage(DIST, htmlDir, ref);
        if (fs.existsSync(abs)) jsSeeds.push(path.relative(DIST, abs).replace(/\\/g, '/'));
      } catch {
        /* ignore */
      }
    }
  }
  for (const seed of jsSeeds) {
    const abs = path.join(DIST, seed);
    if (fs.existsSync(abs)) {
      walkJsImportGraph(abs, DIST, distRelFiles);
    }
  }
  sources.push(`js-import-walk`);

  const fileEntries = [];
  for (const rel of distRelFiles) {
    if (rel.endsWith('.map')) continue;
    const abs = path.join(DIST, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      console.warn('[prepare_viewer_shell] missing asset:', rel);
      continue;
    }
    fileEntries.push({ abs, shellPath: toShellPath(rel), ref: rel });
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
        fileEntries.push({ abs, shellPath, ref: `brand/${name}` });
      }
    }
  }

  if (!fileEntries.some((e) => e.shellPath.startsWith('assets/') && e.shellPath.endsWith('.js'))) {
    throw new Error('[prepare_viewer_shell] no viewer JS assets collected — build may be broken');
  }

  html = rewriteHtml(html);

  const manDist = writeShell(OUT_DIST, html, fileEntries);
  const manPub = writeShell(OUT_PUBLIC, html, fileEntries);

  console.log('[prepare_viewer_shell] sources:', sources.join(', '));
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
