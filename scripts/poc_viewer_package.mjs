/**
 * Offline POC: build a deploy-style viewer package (no CDN) and verify HTTP 200s.
 * Usage: node scripts/poc_viewer_package.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'site', 'POC', 'POC', 'verify');

function copyThree() {
  const vendorSrc = path.join(ROOT, 'node_modules', 'three', 'build');
  const vendorDst = path.join(OUT, 'vendor');
  fs.mkdirSync(vendorDst, { recursive: true });
  for (const f of ['three.module.js', 'three.core.js']) {
    const from = path.join(vendorSrc, f);
    const to = path.join(vendorDst, f);
    if (!fs.existsSync(from)) throw new Error('missing ' + from);
    fs.copyFileSync(from, to);
    console.log('OK vendor', f, fs.statSync(to).size);
  }
}

function pickImage() {
  // reuse any previously deployed jpg if present
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
  if (!imgs.length) throw new Error('No sample JPG under site/ — deploy once from editor first or place a jpg');
  return imgs[0];
}

function buildHtml(project) {
  const json = JSON.stringify({ format: 'telecom360-next-package', version: 1, project });
  // minimal viewer same structure as ExportService (local three only)
  return `<!DOCTYPE html>
<html lang="zh-Hant"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>POC Viewer</title>
<style>html,body{margin:0;height:100%;background:#0b1220;color:#fff}#c{position:fixed;inset:0}#ui{position:fixed;left:12px;top:12px;z-index:2}</style>
</head><body>
<canvas id="c"></canvas><div id="ui"><div id="title"></div><div id="status">loading…</div></div>
<script type="importmap">{"imports":{"three":"./vendor/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';
const PKG = ${json};
const project = PKG.project;
const canvas = document.getElementById('c');
const status = document.getElementById('status');
document.getElementById('title').textContent = project.name;
try {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(100, 1, 0.1, 2000);
  const geo = new THREE.SphereGeometry(500, 64, 40); geo.scale(-1,1,1);
  const mat = new THREE.MeshBasicMaterial({ color: 0x333 });
  scene.add(new THREE.Mesh(geo, mat));
  const s0 = project.scenes[0];
  const url = new URL(s0.source.url, location.href).href;
  const tex = await new THREE.TextureLoader().loadAsync(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  mat.map = tex; mat.color.set(0xffffff); mat.needsUpdate = true;
  function resize(){ const w=innerWidth,h=innerHeight; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); }
  function loop(){ renderer.render(scene,camera); requestAnimationFrame(loop); }
  resize(); addEventListener('resize', resize); loop();
  status.textContent = 'OK image loaded: ' + s0.source.url;
  console.log('POC_OK', url);
} catch (e) {
  status.textContent = 'FAIL ' + e;
  console.error('POC_FAIL', e);
}
</script>
</body></html>`;
}

function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'assets', 'source'), { recursive: true });
  copyThree();
  const imgPath = pickImage();
  const fileName = path.basename(imgPath);
  const rel = `assets/source/${fileName}`;
  fs.copyFileSync(imgPath, path.join(OUT, rel));
  console.log('OK image', fileName, fs.statSync(path.join(OUT, rel)).size);

  const project = {
    id: 'poc',
    name: 'POC Viewer',
    settings: {
      mouseViewMode: 'drag',
      autorotateEnabled: false,
      fullscreenButton: true,
      viewControlButtons: true,
      defaultParallaxEnabled: false,
      parallaxRadius: 120,
      sphereRadius: 500,
      anisotropy: 16,
      locale: 'zh-Hant',
    },
    scenes: [
      {
        id: 'scn_poc',
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

  fs.writeFileSync(path.join(OUT, 'project.json'), JSON.stringify({ format: 'telecom360-next-package', version: 1, project }, null, 2));
  fs.writeFileSync(path.join(OUT, 'index.html'), buildHtml(project));
  console.log('Wrote', OUT);
}

main();
