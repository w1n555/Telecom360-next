/**
 * Shared helpers: resolve Vite build asset graphs for Editor / Viewer packaging.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Prefer dist/.vite/manifest.json (Vite 5+), then dist/manifest.json */
export function loadViteManifest(distDir) {
  const candidates = [
    path.join(distDir, '.vite', 'manifest.json'),
    path.join(distDir, 'manifest.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return { path: p, data: JSON.parse(fs.readFileSync(p, 'utf8')) };
    }
  }
  return null;
}

/**
 * Collect dist-relative asset paths (posix) for a Vite manifest entry key.
 * Walks static + dynamic imports and CSS/assets arrays.
 */
export function collectManifestEntryAssets(manifest, entryKey) {
  const out = new Set();
  const visited = new Set();

  function walk(key) {
    if (!key || visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk || typeof chunk !== 'object') return;

    if (chunk.file) out.add(String(chunk.file).replace(/\\/g, '/'));
    for (const c of chunk.css || []) out.add(String(c).replace(/\\/g, '/'));
    for (const a of chunk.assets || []) out.add(String(a).replace(/\\/g, '/'));
    for (const imp of chunk.imports || []) walk(imp);
    for (const imp of chunk.dynamicImports || []) walk(imp);
  }

  walk(entryKey);
  return out;
}

/** src|href refs from HTML that look like local asset paths. */
export function collectHtmlRefs(html) {
  const refs = new Set();
  const re = /(?:src|href)=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const u = m[1].trim();
    if (
      !u ||
      u.startsWith('data:') ||
      u.startsWith('http:') ||
      u.startsWith('https:') ||
      u.startsWith('//') ||
      u.startsWith('#')
    ) {
      continue;
    }
    refs.add(u);
  }
  return [...refs];
}

/**
 * Walk ESM relative imports / dynamic import() from a built JS file under dist.
 * Adds dist-relative paths (posix) into `out`.
 */
export function walkJsImportGraph(entryAbs, distDir, out = new Set()) {
  const distNorm = path.resolve(distDir);
  const queue = [path.resolve(entryAbs)];
  const seen = new Set();

  while (queue.length) {
    const abs = queue.pop();
    if (seen.has(abs)) continue;
    seen.add(abs);
    if (!abs.startsWith(distNorm) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    if (abs.endsWith('.map')) continue;

    const rel = path.relative(distNorm, abs).replace(/\\/g, '/');
    out.add(rel);

    if (!/\.(m?js|cjs)$/i.test(abs)) continue;

    const src = fs.readFileSync(abs, 'utf8');
    // import '…' / from '…' / import('…') / export … from '…'
    const re =
      /(?:import\s*(?:[^"'()]*from\s*)?|export\s*[^"'()]*from\s*|import\s*\(\s*)["'](\.[^"']+)["']/g;
    let m;
    while ((m = re.exec(src))) {
      const spec = m[1];
      const resolved = path.normalize(path.join(path.dirname(abs), spec));
      if (resolved.startsWith(distNorm) && fs.existsSync(resolved)) {
        queue.push(resolved);
      } else {
        // Vite often omits extension
        for (const ext of ['.js', '.mjs', '.css']) {
          const withExt = resolved + ext;
          if (fs.existsSync(withExt)) {
            queue.push(withExt);
            break;
          }
        }
      }
    }
  }

  return out;
}

/**
 * Resolve HTML-relative ref from a page under dist (e.g. dist/viewer/index.html).
 */
export function resolveFromHtmlPage(distDir, htmlAbsDir, ref) {
  const abs = path.normalize(path.join(htmlAbsDir, ref));
  const distNorm = path.resolve(distDir);
  if (!abs.startsWith(distNorm)) {
    throw new Error(`Ref escapes dist: ${ref}`);
  }
  return abs;
}
