/**
 * Offline POC: copy prebuilt viewer-shell + sample image + project.json, verify files exist.
 * Usage: npm run build && node scripts/poc_viewer_package.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'site', 'POC', 'POC', 'verify');

function findShell() {
  for (const c of [
    path.join(ROOT, 'public', 'viewer-shell'),
    path.join(ROOT, 'dist', 'viewer-shell'),
  ]) {
    if (fs.existsSync(path.join(c, 'index.html')) && fs.existsSync(path.join(c, 'manifest.json'))) {
      return c;
    }
  }
  throw new Error('viewer-shell missing — run npm run build first');
}

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (name === 'manifest.json') continue;
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.statSync(from).isDirectory()) copyTree(from, to);
    else fs.copyFileSync(from, to);
  }
}

function pickImage() {
  const site = path.join(ROOT, 'site');
  function walk(d, acc = []) {
    if (!fs.existsSync(d)) return acc;
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p, acc);
      else if (/\.jpe?g$/i.test(name) && st.size > 100000) acc.push(p);
    }
    return acc;
  }
  const imgs = walk(site).filter((p) => !p.includes(`${path.sep}POC${path.sep}`));
  if (!imgs.length) throw new Error('No sample JPG under site/ — export once from editor first');
  return imgs[0];
}

function main() {
  const shell = findShell();
  fs.rmSync(OUT, { recursive: true, force: true });
  copyTree(shell, OUT);

  fs.mkdirSync(path.join(OUT, 'assets', 'source'), { recursive: true });
  const imgPath = pickImage();
  const fileName = path.basename(imgPath);
  const sceneId = 'scn_poc';
  const rel = `assets/source/${sceneId}_${fileName}`;
  fs.copyFileSync(imgPath, path.join(OUT, rel));
  console.log('OK image', fileName);

  const project = {
    id: 'poc',
    name: 'POC Viewer',
    settings: {
      mouseViewMode: 'drag',
      autorotateEnabled: false,
      fullscreenButton: true,
      viewControlButtons: true,
      defaultParallaxEnabled: true,
      parallaxRadius: 120,
      sphereRadius: 500,
      anisotropy: 16,
      locale: 'zh-Hant',
    },
    scenes: [
      {
        id: sceneId,
        name: 'POC',
        source: { kind: 'equirectangular', url: rel, fileName, width: 11904, height: 5952 },
        initialView: { yaw: 0, pitch: 0, fov: 1.745 },
        hotspots: [],
      },
    ],
    deploy: { siteCode: 'POC', roomName: 'POC', photoDate: 'verify' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(OUT, 'project.json'),
    JSON.stringify({ format: 'telecom360-next-package', version: 1, project }, null, 2)
  );
  console.log('Wrote', OUT);
  console.log('Open /site/POC/POC/verify/ after staging or npm run dev');
}

main();
