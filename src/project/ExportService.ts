import JSZip from 'jszip';
import {
  PACKAGE_FORMAT,
  PACKAGE_VERSION,
  type ProjectDocument,
  type ProjectPackage,
  type Scene,
} from '../core/types/project';
import { slugify } from '../utils/id';

function cloneProjectForPackage(project: ProjectDocument, opts?: { keepDataUrl?: boolean }): ProjectDocument {
  const keepDataUrl = opts?.keepDataUrl !== false;
  const scenes: Scene[] = project.scenes.map((s) => {
    const rel = `assets/source/${s.id}_${s.source.fileName}`;
    const source = {
      ...s.source,
      url: rel,
    };
    if (!keepDataUrl) {
      delete (source as { dataUrl?: string }).dataUrl;
    }
    return {
      ...s,
      source,
      hotspots: s.hotspots.map((h) => ({ ...h })),
    };
  });
  return {
    ...project,
    scenes,
    settings: { ...project.settings },
    deploy: { ...project.deploy },
  };
}

/** Viewer must NOT embed multi-MB dataUrls (breaks browser / 138MB HTML). */
function projectForViewer(project: ProjectDocument): ProjectDocument {
  return cloneProjectForPackage(project, { keepDataUrl: false });
}

async function dataUrlToUint8(dataUrl: string): Promise<Uint8Array> {
  const res = await fetch(dataUrl);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/** three.module.js imports ./three.core.js — both required offline (no CDN). */
async function fetchVendorThreeFiles(): Promise<{ module: Uint8Array; core: Uint8Array }> {
  const baseCandidates = [
    new URL('/vendor/', location.origin).href,
    new URL('./vendor/', location.href).href,
  ];
  for (const base of baseCandidates) {
    try {
      const [modRes, coreRes] = await Promise.all([
        fetch(new URL('three.module.js', base)),
        fetch(new URL('three.core.js', base)),
      ]);
      if (modRes.ok && coreRes.ok) {
        return {
          module: new Uint8Array(await modRes.arrayBuffer()),
          core: new Uint8Array(await coreRes.arrayBuffer()),
        };
      }
    } catch {
      /* try next base */
    }
  }
  throw new Error('找不到 vendor/three.module.js + three.core.js（offline，無 CDN）');
}

function addThreeVendorToZip(zip: JSZip, files: { module: Uint8Array; core: Uint8Array }, prefix = 'vendor/') {
  zip.file(`${prefix}three.module.js`, files.module);
  zip.file(`${prefix}three.core.js`, files.core);
}

function buildViewerHtml(project: ProjectDocument): string {
  // Always strip dataUrls from inline PKG — images load from assets/source/*.jpg
  const slim = projectForViewer(project);
  const data = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    project: slim,
  };
  const json = JSON.stringify(data);
  const fovMax = (100 * Math.PI) / 180;
  const fovMin = (40 * Math.PI) / 180;
  const pr = project.settings.parallaxRadius ?? 120;
  const showFs = project.settings.fullscreenButton !== false;
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(project.name)} · Telecom360</title>
  <style>
    html,body{margin:0;height:100%;background:#0b1220;color:#e8eef8;font-family:system-ui,"Segoe UI","Noto Sans TC",sans-serif}
    #c{position:fixed;inset:0}
    #ui{position:fixed;left:12px;top:12px;z-index:3;display:flex;flex-direction:column;gap:8px;max-width:280px}
    #ui h1{font-size:14px;margin:0;padding:8px 12px;background:rgba(0,63,145,.92);border-radius:10px}
    #scenes{background:rgba(15,23,42,.9);border-radius:10px;padding:8px;max-height:40vh;overflow:auto}
    #scenes button{display:block;width:100%;text-align:left;border:0;background:transparent;color:#e8eef8;padding:8px;border-radius:8px;cursor:pointer}
    #scenes button.active,#scenes button:hover{background:rgba(0,161,224,.25)}
    #tools{display:flex;gap:6px;flex-wrap:wrap}
    #tools button{border:0;border-radius:8px;padding:8px 10px;background:#1e293b;color:#fff;cursor:pointer;font-weight:600;font-size:12px}
    #tools button.on{background:#00a1e0}
    #hot{position:fixed;inset:0;pointer-events:none;z-index:1}
    .pin{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;cursor:pointer}
    .pin .glyph{width:40px;height:40px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 12px rgba(0,0,0,.5);display:grid;place-items:center;position:relative;color:#fff}
    .pin .glyph::before{content:'';position:absolute;inset:-6px;border-radius:50%;border:2px solid currentColor;opacity:.5;animation:pulse 1.8s ease-out infinite}
    .pin.info .glyph{background:radial-gradient(circle at 35% 30%,#4dc9f0,#00a1e0 55%,#0077a8)}
    .pin.scene .glyph{background:radial-gradient(circle at 35% 30%,#3d6fd4,#003f91 55%,#001f4d)}
    .pin .lbl{position:absolute;left:50%;top:calc(100% + 6px);transform:translateX(-50%);background:rgba(15,23,42,.92);padding:3px 8px;border-radius:8px;font-size:11px;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis}
    .tip{position:absolute;left:50%;top:48px;transform:translateX(-50%);background:rgba(15,23,42,.96);padding:8px 10px;border-radius:8px;min-width:120px;font-size:12px;display:none;z-index:5}
    .pin.open .tip{display:block}
    @keyframes pulse{0%{transform:scale(.85);opacity:.65}70%{transform:scale(1.35);opacity:0}100%{opacity:0}}
    #hint{font-size:11px;color:#94a3b8;padding:0 4px}
  </style>
</head>
<body>
  <canvas id="c"></canvas>
  <div id="hot"></div>
  <div id="ui">
    <h1 id="title"></h1>
    <div id="tools">
      <button type="button" id="btn-parallax">3D 移動</button>
      <button type="button" id="btn-auto">自動旋轉</button>
      ${showFs ? '<button type="button" id="btn-fs">全螢幕</button>' : ''}
    </div>
    <div id="hint">拖曳旋轉 · 滾輪縮放 · WASD/QE（3D 開）</div>
    <div id="scenes"></div>
  </div>
  <script type="importmap">
  {"imports":{"three":"./vendor/three.module.js"}}
  </script>
  <script type="module">
  import * as THREE from 'three';
  const PKG = ${json};
  const project = PKG.project;
  const FOV_MAX = ${fovMax}, FOV_MIN = ${fovMin}, PR = ${pr};
  const canvas = document.getElementById('c');
  const hotRoot = document.getElementById('hot');
  const titleEl = document.getElementById('title');
  const scenesEl = document.getElementById('scenes');
  const errEl = document.createElement('div');
  errEl.style.cssText='position:fixed;left:12px;bottom:12px;z-index:9;max-width:80vw;background:rgba(127,29,29,.92);color:#fff;padding:10px 12px;border-radius:10px;font-size:12px;display:none';
  document.body.appendChild(errEl);
  function showErr(m){ errEl.style.display='block'; errEl.textContent=m; console.error(m); }
  titleEl.textContent = project.name;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene3 = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(100, 1, 0.1, 2000);
  const sphereR = project.settings.sphereRadius || 500;
  const geo = new THREE.SphereGeometry(sphereR, 64, 40); geo.scale(-1,1,1);
  const mat = new THREE.MeshBasicMaterial({ color: 0x333844 });
  const mesh = new THREE.Mesh(geo, mat); scene3.add(mesh);
  let yaw=0,pitch=0,fov=FOV_MAX, dragging=false, lx=0, ly=0;
  let offset = new THREE.Vector3();
  let parallax=false;
  let active = project.scenes[0] || null;
  const keys = new Set();
  const loader = new THREE.TextureLoader();
  const ICON_I = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 10v6"/><circle cx="12" cy="7.5" r="1" fill="#fff" stroke="none"/></svg>';
  const ICON_S = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';

  function sphDir(y,p){const cp=Math.cos(p);return new THREE.Vector3(Math.sin(y)*cp, Math.sin(p), -Math.cos(y)*cp).normalize();}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function resolveUrl(s){
    if(s.source && s.source.dataUrl) return s.source.dataUrl;
    const u = (s.source && s.source.url) || '';
    try { return new URL(u, location.href).href; } catch(e){ return u; }
  }
  function apply(){
    camera.fov=THREE.MathUtils.radToDeg(fov);camera.updateProjectionMatrix();
    offset.x=clamp(offset.x,-PR,PR);offset.y=clamp(offset.y,-PR,PR);offset.z=clamp(offset.z,-PR,PR);
    if(offset.length()>PR) offset.setLength(PR);
    camera.position.copy(offset);
    camera.lookAt(sphDir(yaw,pitch).add(offset));
    drawHot();
  }
  function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  async function loadScene(s, opts){
    try{
      active=s;
      yaw=s.initialView.yaw; pitch=s.initialView.pitch;
      fov = FOV_MAX;
      offset.set(0,0,0);
      const url = resolveUrl(s);
      const tex = await loader.loadAsync(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
      if(mat.map) mat.map.dispose();
      mat.map=tex; mat.color.set(0xffffff); mat.needsUpdate=true;
      [...scenesEl.querySelectorAll('button')].forEach(b=>b.classList.toggle('active', b.dataset.id===s.id));
      apply();
      errEl.style.display='none';
    }catch(e){
      showErr('無法載入全景：'+(e&&e.message?e.message:e)+' · '+((s&&s.source&&s.source.url)||''));
    }
  }
  async function goSceneFromHotspot(h){
    const tgt=project.scenes.find(s=>s.id===h.targetSceneId);
    if(!tgt) return;
    // zoom toward icon ~30% then fade via opacity on canvas parent
    const startFov=fov, endFov=clamp(startFov*0.7, FOV_MIN, FOV_MAX);
    const y0=yaw,p0=pitch, t0=performance.now();
    await new Promise(res=>{
      const step=()=>{
        const u=Math.min(1,(performance.now()-t0)/380);
        const e=u*u*(3-2*u);
        yaw=y0+(h.yaw-y0)*e; pitch=p0+(h.pitch-p0)*e; fov=startFov+(endFov-startFov)*e; apply();
        if(u<1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    canvas.style.transition='opacity .35s'; canvas.style.opacity='0';
    await new Promise(r=>setTimeout(r,350));
    await loadScene(tgt);
    canvas.style.opacity='1';
  }
  function projectToScreen(y,p){
    const dir=sphDir(y,p).multiplyScalar(sphereR*0.98);
    const v=dir.project(camera);
    if(v.z>=1) return null;
    return {x:(v.x*0.5+0.5)*innerWidth, y:(-v.y*0.5+0.5)*innerHeight};
  }
  function drawHot(){
    hotRoot.innerHTML='';
    if(!active) return;
    for(const h of active.hotspots){
      const scr=projectToScreen(h.yaw,h.pitch); if(!scr) continue;
      const el=document.createElement('div');
      el.className='pin '+h.type;
      el.style.left=scr.x+'px'; el.style.top=scr.y+'px';
      el.innerHTML='<div class="glyph">'+(h.type==='info'?ICON_I:ICON_S)+'</div><div class="lbl"></div><div class="tip"></div>';
      const lbl=el.querySelector('.lbl'), tip=el.querySelector('.tip');
      if(h.type==='info'){
        lbl.textContent=h.title||'注解';
        tip.innerHTML='<strong>'+esc(h.title)+'</strong><div>'+esc(h.text)+'</div>';
        el.onclick=()=>el.classList.toggle('open');
      } else {
        const tgt=project.scenes.find(s=>s.id===h.targetSceneId);
        lbl.textContent=tgt?('→ '+tgt.name):'場景';
        tip.textContent=tgt?tgt.name:'場景';
        el.onclick=()=>{ if(tgt) goSceneFromHotspot(h); };
      }
      hotRoot.appendChild(el);
    }
  }
  function esc(s){return String(s).replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));}
  project.scenes.forEach(s=>{
    const b=document.createElement('button'); b.type='button'; b.textContent=s.name; b.dataset.id=s.id;
    b.onclick=()=>loadScene(s); scenesEl.appendChild(b);
  });
  let autorotate = !!(project.settings && project.settings.autorotateEnabled);
  const btnAuto = document.getElementById('btn-auto');
  if(autorotate) btnAuto.classList.add('on');
  document.getElementById('btn-parallax').onclick=function(){
    parallax=!parallax; if(!parallax) offset.set(0,0,0); this.classList.toggle('on', parallax); if(parallax) autorotate=false; btnAuto.classList.toggle('on', autorotate); apply();
  };
  btnAuto.onclick=function(){
    autorotate=!autorotate; this.classList.toggle('on', autorotate);
  };
  const btnFs=document.getElementById('btn-fs');
  if(btnFs){
    btnFs.onclick=function(){
      const el=document.documentElement;
      if(!document.fullscreenElement){ el.requestFullscreen?.(); this.classList.add('on'); }
      else { document.exitFullscreen?.(); this.classList.remove('on'); }
    };
    document.addEventListener('fullscreenchange',()=>{ btnFs.classList.toggle('on', !!document.fullscreenElement); });
  }
  addEventListener('resize',()=>{resize();apply();});
  canvas.addEventListener('pointerdown',e=>{
    autorotate=false; btnAuto.classList.remove('on');
    dragging=true;lx=e.clientX;ly=e.clientY;canvas.setPointerCapture(e.pointerId);
  });
  addEventListener('pointermove',e=>{
    if(!dragging)return;const dx=e.clientX-lx,dy=e.clientY-ly;lx=e.clientX;ly=e.clientY;
    const sens=0.005*(fov/(Math.PI/2));yaw-=dx*sens;pitch=clamp(pitch+dy*sens,-1.5,1.5);apply();
  });
  addEventListener('pointerup',()=>dragging=false);
  canvas.addEventListener('wheel',e=>{e.preventDefault();autorotate=false;btnAuto.classList.remove('on');fov=clamp(fov+Math.sign(e.deltaY)*0.06,FOV_MIN,FOV_MAX);apply();},{passive:false});
  addEventListener('keydown',e=>{ if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) return; keys.add(e.code); if(e.code.startsWith('Key')||e.code.startsWith('Arrow')){ autorotate=false; btnAuto.classList.remove('on'); } });
  addEventListener('keyup',e=>keys.delete(e.code));
  function tickMove(){
    if(!parallax||!keys.size) return;
    const sp=keys.has('ShiftLeft')||keys.has('ShiftRight')?2.4:1.15;
    const f=sphDir(yaw,0), r=new THREE.Vector3().crossVectors(f,new THREE.Vector3(0,1,0)).normalize();
    if(keys.has('KeyW')) offset.addScaledVector(f,sp);
    if(keys.has('KeyS')) offset.addScaledVector(f,-sp);
    if(keys.has('KeyA')) offset.addScaledVector(r,-sp);
    if(keys.has('KeyD')) offset.addScaledVector(r,sp);
    if(keys.has('KeyQ')) offset.y+=sp;
    if(keys.has('KeyE')) offset.y-=sp;
    apply();
  }
  function loop(){
    tickMove();
    if(!parallax && offset.lengthSq()>1e-6){ offset.multiplyScalar(0.88); if(offset.length()<0.02) offset.set(0,0,0); apply(); }
    if(autorotate && !dragging && !keys.size){ yaw-=0.0018; apply(); }
    renderer.render(scene3,camera); requestAnimationFrame(loop);
  }
  resize(); if(active) loadScene(active); loop();
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );
}

export type ProgressFn = (percent: number, label?: string) => void;

/** Sanitize one path segment (same rules as deploy API). */
function pathSeg(raw: string, fallback: string): string {
  const s = (raw || '').trim().replace(/[\\/]/g, '_').replace(/\.\./g, '');
  return s || fallback;
}

/**
 * Same layout as one-click deploy:
 * site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/
 */
export function deployPackagePrefix(project: ProjectDocument): string {
  const site = pathSeg(project.deploy.siteCode, 'SITE');
  const room = pathSeg(project.deploy.roomName, 'ROOM');
  const date = pathSeg(project.deploy.photoDate, 'DATE');
  return `site/${site}/${room}/${date}`;
}

/**
 * Export ZIP = deploy folder layout (single assets copy, small index.html).
 *
 * site/{SITE}/{ROOM}/{DATE}/
 *   index.html          (~few KB, no base64)
 *   project.json        (no dataUrl — images are files)
 *   vendor/three.*
 *   assets/source/*.jpg
 * README.txt
 *
 * Unzip to web root → same URL as 一鍵部署.
 * Re-import: Editor reads project.json + assets under that folder.
 */
export async function buildProjectZip(
  project: ProjectDocument,
  onProgress?: ProgressFn
): Promise<Blob> {
  const zip = new JSZip();
  const prefix = deployPackagePrefix(project);
  // No dataUrls in package — one set of image files only
  const viewerProject = projectForViewer(project);
  const pkg: ProjectPackage = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    savedAt: new Date().toISOString(),
    project: viewerProject,
  };

  onProgress?.(5, '準備 three.js');
  const threeFiles = await fetchVendorThreeFiles();
  addThreeVendorToZip(zip, threeFiles, `${prefix}/vendor/`);

  const withData = project.scenes.filter((s) => s.source.dataUrl);
  const n = Math.max(withData.length, 1);
  let i = 0;
  for (const s of withData) {
    const bytes = await dataUrlToUint8(s.source.dataUrl!);
    // single copy under package root (not duplicated)
    const rel = `assets/source/${s.id}_${s.source.fileName}`;
    zip.file(`${prefix}/${rel}`, bytes);
    i += 1;
    onProgress?.(5 + Math.round((i / n) * 65), '打包圖片');
  }

  zip.file(`${prefix}/project.json`, JSON.stringify(pkg, null, 2));
  zip.file(`${prefix}/index.html`, buildViewerHtml(viewerProject));
  zip.file(
    'README.txt',
    `Telecom360-Three.js 專案套件
============================
結構（與一鍵部署相同）：
  site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/
    index.html
    project.json
    vendor/
    assets/source/

1) 解壓到 Web 根目錄後開啟：
   http://{host}/site/{SITE}/{ROOM}/{DATE}/
2) 繼續編輯：Editor「開啟專案套件」選本 ZIP
3) 圖片只存一份 assets/source（無 dataUrl 重複）
`
  );
  onProgress?.(75, '壓縮中');

  return zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (meta) => {
      const p = 75 + Math.round((meta.percent || 0) * 0.25);
      onProgress?.(Math.min(99, p), '壓縮中');
    }
  );
}

/**
 * Deploy package: flat viewer at ZIP root (index.html + assets + project.json + vendor/three).
 * No base64 dataUrls in HTML/JSON — images only as files.
 */
export async function buildDeployZip(
  project: ProjectDocument,
  onProgress?: ProgressFn
): Promise<Blob> {
  const zip = new JSZip();
  const viewerProject = projectForViewer(project);
  const pkg: ProjectPackage = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    savedAt: new Date().toISOString(),
    project: viewerProject,
  };

  onProgress?.(5, '準備 three.js');
  const threeFiles = await fetchVendorThreeFiles();
  addThreeVendorToZip(zip, threeFiles, 'vendor/');

  zip.file('project.json', JSON.stringify(pkg, null, 2));
  zip.file('index.html', buildViewerHtml(viewerProject));
  onProgress?.(12, '產生檢視器');

  const withData = project.scenes.filter((s) => s.source.dataUrl);
  const n = Math.max(withData.length, 1);
  let i = 0;
  for (const s of withData) {
    const bytes = await dataUrlToUint8(s.source.dataUrl!);
    const pth = `assets/source/${s.id}_${s.source.fileName}`;
    zip.file(pth, bytes);
    i += 1;
    onProgress?.(12 + Math.round((i / n) * 60), '打包圖片');
  }
  onProgress?.(75, '壓縮中');

  return zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (meta) => {
      onProgress?.(Math.min(99, 75 + Math.round((meta.percent || 0) * 0.24)), '壓縮中');
    }
  );
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
