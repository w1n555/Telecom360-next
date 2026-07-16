import JSZip from 'jszip';
import {
  PACKAGE_FORMAT,
  PACKAGE_VERSION,
  type ProjectDocument,
  type ProjectPackage,
  type Scene,
} from '../core/types/project';
import { slugify } from '../utils/id';

function cloneProjectForPackage(project: ProjectDocument): ProjectDocument {
  const scenes: Scene[] = project.scenes.map((s) => {
    const rel = `assets/source/${s.id}_${s.source.fileName}`;
    return {
      ...s,
      source: {
        ...s.source,
        url: rel,
        // keep dataUrl in package for re-import fidelity
      },
      hotspots: s.hotspots.map((h) => ({ ...h })),
      measurements: s.measurements.map((m) => ({
        ...m,
        points: m.points.map((p) => ({ ...p })),
      })),
    };
  });
  return {
    ...project,
    scenes,
    settings: { ...project.settings },
    deploy: { ...project.deploy },
  };
}

async function dataUrlToUint8(dataUrl: string): Promise<Uint8Array> {
  const res = await fetch(dataUrl);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

function buildViewerHtml(project: ProjectDocument): string {
  const data = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    project,
  };
  // Self-contained lightweight viewer (no external deps) using Three from CDN only if needed —
  // For offline IIS we embed a minimal three-free CSS3D? Better: ship note that runtime uses built viewer.
  // Portable zip embeds project.json + images + a tiny three-based inline viewer using importmap is hard offline.
  // Strategy: include project.json and images; viewer/index uses relative project.json and we also
  // embed a standalone viewer script built at export time as data blob of simple canvas equirect using raw WebGL? Too heavy.
  // Practical approach: export includes viewer assets copied from /viewer-runtime after build.
  // For in-browser export without build artifacts, generate a single HTML that uses three from esm.sh
  // and loads local images — works under IIS same-origin.

  const json = JSON.stringify(data);
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(project.name)} · Telecom360</title>
  <style>
    html,body{margin:0;height:100%;background:#0b1220;color:#e8eef8;font-family:system-ui,"Segoe UI","Noto Sans TC",sans-serif}
    #c{position:fixed;inset:0}
    #ui{position:fixed;left:12px;top:12px;z-index:2;display:flex;flex-direction:column;gap:8px;max-width:260px}
    #ui h1{font-size:14px;margin:0;padding:8px 12px;background:rgba(0,63,145,.9);border-radius:10px}
    #scenes{background:rgba(15,23,42,.88);border-radius:10px;padding:8px;max-height:50vh;overflow:auto}
    #scenes button{display:block;width:100%;text-align:left;border:0;background:transparent;color:#e8eef8;padding:8px;border-radius:8px;cursor:pointer}
    #scenes button.active,#scenes button:hover{background:rgba(0,161,224,.25)}
    #hot{position:fixed;inset:0;pointer-events:none;z-index:1}
    .pin{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;cursor:pointer}
    .pin .dot{width:28px;height:28px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4)}
    .pin.info .dot{background:#00a1e0}
    .pin.scene .dot{background:#003f91}
    .tip{position:absolute;left:50%;top:36px;transform:translateX(-50%);background:rgba(15,23,42,.95);padding:8px 10px;border-radius:8px;min-width:120px;font-size:12px;display:none}
    .pin.open .tip{display:block}
  </style>
</head>
<body>
  <canvas id="c"></canvas>
  <div id="hot"></div>
  <div id="ui">
    <h1 id="title"></h1>
    <div id="scenes"></div>
  </div>
  <script type="importmap">
  {"imports":{"three":"https://unpkg.com/three@0.172.0/build/three.module.js"}}
  </script>
  <script type="module">
  import * as THREE from 'three';
  const PKG = ${json};
  const project = PKG.project;
  const canvas = document.getElementById('c');
  const hotRoot = document.getElementById('hot');
  const titleEl = document.getElementById('title');
  const scenesEl = document.getElementById('scenes');
  titleEl.textContent = project.name;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 2000);
  const sphereR = project.settings.sphereRadius || 500;
  const geo = new THREE.SphereGeometry(sphereR, 64, 40); geo.scale(-1,1,1);
  const mat = new THREE.MeshBasicMaterial({ color: 0x222 });
  const mesh = new THREE.Mesh(geo, mat); scene.add(mesh);
  let yaw=0,pitch=0,fov=Math.PI/2, dragging=false, lx=0, ly=0;
  let active = project.scenes[0] || null;
  const loader = new THREE.TextureLoader();

  function sphDir(y,p){const cp=Math.cos(p);return new THREE.Vector3(Math.sin(y)*cp, Math.sin(p), -Math.cos(y)*cp).normalize();}
  function apply(){camera.fov=THREE.MathUtils.radToDeg(fov);camera.updateProjectionMatrix();const look=sphDir(yaw,pitch);camera.position.set(0,0,0);camera.lookAt(look);drawHot();}
  function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  async function loadScene(s){
    active=s; yaw=s.initialView.yaw; pitch=s.initialView.pitch; fov=s.initialView.fov;
    const url = s.source.url;
    const tex = await loader.loadAsync(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
    if(mat.map) mat.map.dispose();
    mat.map=tex; mat.color.set(0xffffff); mat.needsUpdate=true;
    [...scenesEl.querySelectorAll('button')].forEach(b=>b.classList.toggle('active', b.dataset.id===s.id));
    apply();
  }
  function drawHot(){
    hotRoot.innerHTML='';
    if(!active) return;
    for(const h of active.hotspots){
      const dir=sphDir(h.yaw,h.pitch).multiplyScalar(sphereR*0.98);
      const v=dir.project(camera);
      if(v.z>=1) continue;
      const x=(v.x*0.5+0.5)*innerWidth, y=(-v.y*0.5+0.5)*innerHeight;
      const el=document.createElement('div');
      el.className='pin '+h.type;
      el.style.left=x+'px'; el.style.top=y+'px';
      el.innerHTML='<div class="dot"></div><div class="tip"></div>';
      const tip=el.querySelector('.tip');
      if(h.type==='info'){ tip.innerHTML='<strong>'+esc(h.title)+'</strong><div>'+esc(h.text)+'</div>'; el.onclick=()=>el.classList.toggle('open'); }
      else {
        const tgt=project.scenes.find(s=>s.id===h.targetSceneId);
        tip.textContent=tgt?tgt.name:'場景';
        el.onclick=()=>{ if(tgt) loadScene(tgt); };
      }
      hotRoot.appendChild(el);
    }
  }
  function esc(s){return String(s).replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));}
  project.scenes.forEach(s=>{
    const b=document.createElement('button'); b.textContent=s.name; b.dataset.id=s.id;
    b.onclick=()=>loadScene(s); scenesEl.appendChild(b);
  });
  addEventListener('resize',()=>{resize();apply();});
  canvas.addEventListener('pointerdown',e=>{dragging=true;lx=e.clientX;ly=e.clientY;canvas.setPointerCapture(e.pointerId);});
  addEventListener('pointermove',e=>{if(!dragging)return;const dx=e.clientX-lx,dy=e.clientY-ly;lx=e.clientX;ly=e.clientY;const sens=0.005*(fov/(Math.PI/2));yaw-=dx*sens;pitch=Math.max(-1.5,Math.min(1.5,pitch+dy*sens));apply();});
  addEventListener('pointerup',()=>dragging=false);
  canvas.addEventListener('wheel',e=>{e.preventDefault();fov=Math.max(0.7,Math.min(1.75,fov+Math.sign(e.deltaY)*0.06));apply();},{passive:false});
  function loop(){renderer.render(scene,camera);requestAnimationFrame(loop);} resize(); if(active) loadScene(active); loop();
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );
}

export async function buildProjectZip(project: ProjectDocument): Promise<Blob> {
  const zip = new JSZip();
  const packed = cloneProjectForPackage(project);
  const pkg: ProjectPackage = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    savedAt: new Date().toISOString(),
    project: packed,
  };

  for (const s of project.scenes) {
    if (!s.source.dataUrl) continue;
    const bytes = await dataUrlToUint8(s.source.dataUrl);
    const path = `assets/source/${s.id}_${s.source.fileName}`;
    zip.file(path, bytes);
    // also under viewer for standalone relative urls
    zip.file(`viewer/${path}`, bytes);
  }

  // viewer project paths already relative to viewer/
  const viewerProject = structuredClone(packed);
  zip.file('project.json', JSON.stringify(pkg, null, 2));
  zip.file(
    'viewer/project.json',
    JSON.stringify(
      {
        format: PACKAGE_FORMAT,
        version: PACKAGE_VERSION,
        savedAt: pkg.savedAt,
        project: viewerProject,
      },
      null,
      2
    )
  );
  zip.file('viewer/index.html', buildViewerHtml(viewerProject));
  zip.file(
    'README.txt',
    `Telecom360-Three.js 專案套件
============================
1) 獨立檢視：將 viewer/ 放到 Web 伺服器（IIS）後開啟 index.html
2) 繼續編輯：在 Editor 使用「開啟專案套件」匯入本 ZIP 根目錄之 project.json
3) 一鍵部署路徑慣例：site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/
`
  );

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** Build a folder-like map of files for deploy API (viewer only under target path). */
export async function buildDeployFiles(
  project: ProjectDocument
): Promise<{ path: string; data: Uint8Array | string; contentType: string }[]> {
  const packed = cloneProjectForPackage(project);
  const files: { path: string; data: Uint8Array | string; contentType: string }[] = [];
  const pkg: ProjectPackage = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    savedAt: new Date().toISOString(),
    project: packed,
  };
  files.push({
    path: 'project.json',
    data: JSON.stringify(pkg, null, 2),
    contentType: 'application/json',
  });
  files.push({
    path: 'index.html',
    data: buildViewerHtml(packed),
    contentType: 'text/html; charset=utf-8',
  });
  for (const s of project.scenes) {
    if (!s.source.dataUrl) continue;
    const bytes = await dataUrlToUint8(s.source.dataUrl);
    const p = `assets/source/${s.id}_${s.source.fileName}`;
    files.push({ path: p, data: bytes, contentType: 'image/jpeg' });
  }
  return files;
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function suggestZipName(project: ProjectDocument): string {
  const d = project.deploy;
  if (d.siteCode && d.roomName && d.photoDate) {
    return `${slugify(d.siteCode)}_${slugify(d.roomName)}_${slugify(d.photoDate)}.zip`;
  }
  return `${slugify(project.name) || 'telecom360'}.zip`;
}
