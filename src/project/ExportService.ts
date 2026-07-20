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
  const doc = cloneProjectForPackage(project, { keepDataUrl: false });
  // Fixed product defaults for published viewer
  doc.settings = {
    ...doc.settings,
    autorotateEnabled: false,
    fullscreenButton: true,
    defaultParallaxEnabled: true,
  };
  return doc;
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

/** Offline OCR runtime + eng / 繁中 / 簡中 language packs (~13MB). */
const OCR_VENDOR_FILES = [
  'tesseract.min.js',
  'worker.min.js',
  'tesseract-core-simd.wasm.js',
  'eng.traineddata',
  'chi_tra.traineddata',
  'chi_sim.traineddata',
] as const;

async function fetchVendorOcrFiles(): Promise<Record<string, Uint8Array>> {
  // Prefer paths relative to this module (dist/assets/main-*.js → ../vendor/tesseract/)
  // plus absolute site-root /vendor/tesseract/ (IIS / Vite public)
  const baseCandidates: string[] = [];
  try {
    baseCandidates.push(new URL('../vendor/tesseract/', import.meta.url).href);
  } catch {
    /* ignore */
  }
  baseCandidates.push(
    new URL('/vendor/tesseract/', location.origin).href,
    `${location.origin}/vendor/tesseract/`,
    new URL('./vendor/tesseract/', location.href).href
  );
  let lastErr: unknown = null;
  for (const base of baseCandidates) {
    try {
      const results = await Promise.all(
        OCR_VENDOR_FILES.map(async (name) => {
          const url = new URL(name, base).href;
          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) throw new Error(`${name} HTTP ${res.status} @ ${url}`);
          const buf = new Uint8Array(await res.arrayBuffer());
          if (buf.byteLength < 1000) throw new Error(`${name} too small (${buf.byteLength}) @ ${url}`);
          return [name, buf] as const;
        })
      );
      console.info('[export] OCR vendor loaded from', base);
      return Object.fromEntries(results);
    } catch (e) {
      lastErr = e;
      console.warn('[export] OCR vendor candidate failed', base, e);
    }
  }
  throw new Error(
    `找不到 OCR 離線檔 vendor/tesseract/（需 eng + chi_tra）。請確認網站根有 /vendor/tesseract/。詳情：${String((lastErr as Error)?.message || lastErr)}`
  );
}

function addOcrVendorToZip(zip: JSZip, files: Record<string, Uint8Array>, prefix = 'vendor/tesseract/') {
  for (const name of OCR_VENDOR_FILES) {
    if (files[name]) zip.file(`${prefix}${name}`, files[name]);
  }
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
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(project.name)} · Telecom360-next</title>
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
    #ocr-layer{position:fixed;inset:0;z-index:20;display:none;cursor:crosshair;touch-action:none}
    #ocr-layer.on{display:block}
    #ocr-box{position:absolute;border:2px solid #00a1e0;background:rgba(0,161,224,.15);pointer-events:none;display:none}
    #ocr-pop{position:fixed;z-index:30;max-width:min(360px,80vw);min-width:220px;background:rgba(15,23,42,.97);color:#f8fafc;border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.45;box-shadow:0 8px 28px rgba(0,0,0,.55);display:none;white-space:pre-wrap;word-break:break-word;pointer-events:auto}
    #ocr-pop .ocr-hd{font-size:11px;color:#94a3b8;margin-bottom:6px;font-weight:600}
    #ocr-pop .ocr-bd{user-select:text}
    #ocr-pop .ocr-prog{margin:8px 0 4px;display:none}
    #ocr-pop .ocr-prog.on{display:block}
    #ocr-pop .ocr-prog-lbl{font-size:12px;color:#cbd5e1;margin-bottom:6px;font-weight:600}
    #ocr-pop .ocr-prog-track{height:8px;border-radius:999px;background:#1e293b;overflow:hidden}
    #ocr-pop .ocr-prog-bar{height:100%;width:0%;border-radius:999px;background:linear-gradient(90deg,#003f91,#00a1e0);transition:width .12s ease-out}
    #ocr-pop .ocr-prog-pct{font-size:11px;color:#94a3b8;text-align:right;margin-top:4px}
    #ocr-pop .ocr-act{margin-top:8px;display:flex;gap:8px}
    #ocr-pop button{border:0;border-radius:8px;padding:6px 10px;background:#1e293b;color:#fff;cursor:pointer;font-size:12px;font-weight:600}
    #ocr-pop button.primary{background:#00a1e0}
    #ocr-hint{position:fixed;left:50%;top:56px;transform:translateX(-50%);z-index:25;background:rgba(0,63,145,.95);color:#fff;padding:8px 14px;border-radius:10px;font-size:13px;font-weight:600;display:none;pointer-events:none}
    #hot{position:fixed;inset:0;pointer-events:none;z-index:5}
    .pin{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;cursor:pointer;z-index:6}
    .pin .glyph{width:40px;height:40px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 12px rgba(0,0,0,.5);display:grid;place-items:center;position:relative;color:#fff}
    .pin .glyph::before{content:'';position:absolute;inset:-6px;border-radius:50%;border:2px solid currentColor;opacity:.5;animation:pulse 1.8s ease-out infinite}
    .pin.info .glyph{background:radial-gradient(circle at 35% 30%,#4dc9f0,#00a1e0 55%,#0077a8)}
    .pin.scene .glyph{background:radial-gradient(circle at 35% 30%,#3d6fd4,#003f91 55%,#001f4d);cursor:pointer}
    .pin .lbl{position:absolute;left:50%;top:calc(100% + 8px);transform:translateX(-50%);background:rgba(15,23,42,.95);color:#f8fafc;padding:6px 12px;border-radius:10px;font-size:13px;font-weight:700;line-height:1.3;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis;border:1px solid rgba(255,255,255,.22);box-shadow:0 4px 16px rgba(0,0,0,.55);pointer-events:none}
    .pin .lbl:empty{display:none}
    .pin .tip{position:absolute;left:50%;bottom:calc(100% + 10px);transform:translateX(-50%);background:rgba(15,23,42,.97);padding:10px 12px;border-radius:10px;min-width:140px;max-width:280px;font-size:13px;line-height:1.45;display:none;z-index:8;border:1px solid rgba(255,255,255,.2);box-shadow:0 8px 24px rgba(0,0,0,.55);pointer-events:none;white-space:pre-wrap;word-break:break-word}
    .pin .tip strong{display:block;margin-bottom:4px;font-size:14px}
    .pin.info.has-content:hover .tip,.pin.info.has-content:focus-within .tip{display:block}
    @keyframes pulse{0%{transform:scale(.85);opacity:.65}70%{transform:scale(1.35);opacity:0}100%{opacity:0}}
  </style>
</head>
<body>
  <canvas id="c"></canvas>
  <div id="hot"></div>
  <div id="ui">
    <h1 id="title"></h1>
    <div id="tools">
      <button type="button" id="btn-auto">自動旋轉</button>
      <button type="button" id="btn-fs">全螢幕</button>
      <button type="button" id="btn-ocr" title="框選畫面文字進行識別">識別文字</button>
    </div>
    <div id="scenes"></div>
  </div>
  <div id="ocr-layer"><div id="ocr-box"></div></div>
  <div id="ocr-hint">拖曳框選要讀的文字，Esc 取消</div>
  <div id="ocr-pop">
    <div class="ocr-hd" id="ocr-hd">識別結果</div>
    <div class="ocr-bd" id="ocr-text"></div>
    <div class="ocr-prog" id="ocr-prog">
      <div class="ocr-prog-lbl" id="ocr-prog-lbl">載入中…</div>
      <div class="ocr-prog-track"><div class="ocr-prog-bar" id="ocr-prog-bar"></div></div>
      <div class="ocr-prog-pct" id="ocr-prog-pct">0%</div>
    </div>
    <div class="ocr-act"><button type="button" class="primary" id="ocr-copy">複製</button><button type="button" id="ocr-close">關閉</button></div>
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
  // preserveDrawingBuffer: required so OCR can capture the WebGL canvas (otherwise drawImage is blank)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
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
  let parallax=true;
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
  let hotspotsReady = false;
  function clearPins(){
    hotspotsReady = false;
    pinSceneId = null;
    pinEls.clear();
    hotRoot.innerHTML = '';
  }
  function apply(){
    camera.fov=THREE.MathUtils.radToDeg(fov);camera.updateProjectionMatrix();
    offset.x=clamp(offset.x,-PR,PR);offset.y=clamp(offset.y,-PR,PR);offset.z=clamp(offset.z,-PR,PR);
    if(offset.length()>PR) offset.setLength(PR);
    camera.position.copy(offset);
    camera.up.set(0,1,0);
    camera.lookAt(sphDir(yaw,pitch).add(offset));
    camera.updateMatrixWorld(true);
    if(hotspotsReady) drawHot();
  }
  function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);}
  async function settleView(){
    resize(); apply();
    renderer.render(scene3,camera);
    await new Promise(r=>requestAnimationFrame(r));
    resize(); apply();
    renderer.render(scene3,camera);
    await new Promise(r=>requestAnimationFrame(r));
    camera.updateMatrixWorld(true);
  }
  async function loadScene(s, opts){
    try{
      // Hide icons first — show only after texture + initial view settled
      clearPins();
      active=s;
      yaw=s.initialView.yaw; pitch=s.initialView.pitch;
      const ivFov = s.initialView && typeof s.initialView.fov === 'number' ? s.initialView.fov : FOV_MAX;
      fov = clamp(ivFov, FOV_MIN, FOV_MAX);
      offset.set(0,0,0);
      const url = resolveUrl(s);
      const tex = await loader.loadAsync(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
      if(mat.map) mat.map.dispose();
      mat.map=tex; mat.color.set(0xffffff); mat.needsUpdate=true;
      [...scenesEl.querySelectorAll('button')].forEach(b=>b.classList.toggle('active', b.dataset.id===s.id));
      await settleView();
      hotspotsReady = true;
      drawHot();
      errEl.style.display='none';
    }catch(e){
      showErr('無法載入全景：'+(e&&e.message?e.message:e)+' · '+((s&&s.source&&s.source.url)||''));
      hotspotsReady = true;
    }
  }
  async function goSceneFromHotspot(h){
    const tgt=project.scenes.find(s=>s.id===h.targetSceneId);
    if(!tgt) return;
    clearPins(); // hide old icons immediately
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
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const world=sphDir(y,p).multiplyScalar(sphereR*0.98);
    const v=world.clone().project(camera);
    if(v.z>=1 || v.x<-1.3 || v.x>1.3 || v.y<-1.3 || v.y>1.3) return null;
    const br=canvas.getBoundingClientRect();
    const w=Math.max(1,br.width||innerWidth), h=Math.max(1,br.height||innerHeight);
    return {x:(v.x*0.5+0.5)*w, y:(-v.y*0.5+0.5)*h};
  }
  // Keep pin DOM stable (do not rebuild every frame — that broke click on scene links)
  let pinSceneId = null;
  const pinEls = new Map();
  function ensurePins(){
    if(!hotspotsReady || !active){ if(hotRoot.childElementCount) { hotRoot.innerHTML=''; pinEls.clear(); pinSceneId=null; } return; }
    if(pinSceneId === active.id && pinEls.size === active.hotspots.length) return;
    hotRoot.innerHTML=''; pinEls.clear(); pinSceneId = active.id;
    for(const h of active.hotspots){
      const el=document.createElement('div');
      el.className='pin '+h.type;
      el.dataset.hid=h.id;
      el.style.display='none';
      el.innerHTML='<div class="glyph">'+(h.type==='info'?ICON_I:ICON_S)+'</div><div class="lbl"></div><div class="tip"></div>';
      const lbl=el.querySelector('.lbl'), tip=el.querySelector('.tip');
      if(h.type==='info'){
        const t0=String(h.title||'').trim(), tx=String(h.text||'').trim();
        lbl.textContent=t0;
        if(t0 || tx){
          el.classList.add('has-content');
          tip.innerHTML=(t0?'<strong>'+esc(t0)+'</strong>':'')+(tx?'<div>'+esc(tx)+'</div>':'');
        } else {
          tip.innerHTML='';
        }
      } else {
        const tgt=project.scenes.find(s=>s.id===h.targetSceneId);
        lbl.textContent=tgt?('→ '+tgt.name):'場景';
        tip.innerHTML='';
        el.addEventListener('click', (ev)=>{
          ev.preventDefault(); ev.stopPropagation();
          autorotate=false; btnAuto.classList.remove('on');
          if(tgt) void goSceneFromHotspot(h);
        });
      }
      hotRoot.appendChild(el);
      pinEls.set(h.id, el);
    }
  }
  function drawHot(){
    if(!hotspotsReady) return;
    ensurePins();
    if(!active) return;
    for(const h of active.hotspots){
      const el=pinEls.get(h.id); if(!el) continue;
      const scr=projectToScreen(h.yaw,h.pitch);
      if(!scr){ el.style.display='none'; continue; }
      el.style.left=scr.x+'px'; el.style.top=scr.y+'px';
      el.style.display='block';
    }
  }
  function esc(s){return String(s).replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));}
  project.scenes.forEach(s=>{
    const b=document.createElement('button'); b.type='button'; b.textContent=s.name; b.dataset.id=s.id;
    b.onclick=()=>loadScene(s); scenesEl.appendChild(b);
  });
  let autorotate = false;
  const btnAuto = document.getElementById('btn-auto');
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

  /* ---- OCR: button → box select → recognize eng+chi_tra → popup near cursor ---- */
  const btnOcr=document.getElementById('btn-ocr');
  const ocrLayer=document.getElementById('ocr-layer');
  const ocrBox=document.getElementById('ocr-box');
  const ocrHint=document.getElementById('ocr-hint');
  const ocrPop=document.getElementById('ocr-pop');
  const ocrText=document.getElementById('ocr-text');
  const ocrProg=document.getElementById('ocr-prog');
  const ocrProgLbl=document.getElementById('ocr-prog-lbl');
  const ocrProgBar=document.getElementById('ocr-prog-bar');
  const ocrProgPct=document.getElementById('ocr-prog-pct');
  const ocrHd=document.getElementById('ocr-hd');
  let ocrMode=false, ocrDrag=false, ocrX0=0, ocrY0=0, ocrWorker=null, ocrBusy=false;
  function setOcrMode(on){
    ocrMode=!!on;
    btnOcr.classList.toggle('on', ocrMode);
    ocrLayer.classList.toggle('on', ocrMode);
    ocrHint.style.display=ocrMode?'block':'none';
    ocrBox.style.display='none';
    // Do NOT hide #ocr-pop here — result popup must stay after selection ends
  }
  function setOcrProgress(pct, label){
    const p=Math.max(0, Math.min(100, Math.round(pct)));
    if(ocrProg) ocrProg.classList.add('on');
    if(ocrProgBar) ocrProgBar.style.width=p+'%';
    if(ocrProgPct) ocrProgPct.textContent=p+'%';
    if(ocrProgLbl && label) ocrProgLbl.textContent=label;
    if(ocrHd) ocrHd.textContent='載入 OCR';
    if(ocrText) ocrText.textContent='';
  }
  function hideOcrProgress(){
    if(ocrProg) ocrProg.classList.remove('on');
    if(ocrProgBar) ocrProgBar.style.width='0%';
    if(ocrProgPct) ocrProgPct.textContent='0%';
    if(ocrHd) ocrHd.textContent='識別結果';
  }
  function placeOcrPop(x,y){
    ocrPop.style.display='block';
    ocrPop.style.visibility='visible';
    ocrPop.style.zIndex='40';
    const pad=12;
    requestAnimationFrame(()=>{
      const w=ocrPop.offsetWidth||280, h=ocrPop.offsetHeight||80;
      let left=x+14, top=y+14;
      if(left+w>innerWidth-pad) left=Math.max(pad, x-w-14);
      if(top+h>innerHeight-pad) top=Math.max(pad, y-h-14);
      ocrPop.style.left=left+'px'; ocrPop.style.top=top+'px';
    });
    ocrPop.style.left=(x+14)+'px'; ocrPop.style.top=(y+14)+'px';
  }
  function ocrBaseUrl(){
    // index.html lives in site/S/R/D/ → vendor/tesseract next to it
    return new URL('vendor/tesseract/', location.href).href;
  }
  function mapOcrStatus(status){
    const s=String(status||'');
    if(/loading tesseract core/i.test(s)) return '載入核心…';
    if(/initializing tesseract/i.test(s)) return '初始化引擎…';
    if(/loading language/i.test(s)) return '載入語言包（中/英）…';
    if(/initializing api/i.test(s)) return '準備識別 API…';
    if(/recognizing text/i.test(s)) return '識別文字中…';
    return s || '處理中…';
  }
  async function ensureTesseractLib(onPct){
    const g=typeof window!=='undefined'?window:self;
    if(g.Tesseract && g.Tesseract.createWorker) return g.Tesseract;
    const base=ocrBaseUrl();
    const mainJs=base+'tesseract.min.js';
    onPct && onPct(5, '下載 OCR 腳本…');
    let code='';
    try{
      const res=await fetch(mainJs, {cache:'no-store'});
      if(!res.ok) throw new Error('HTTP '+res.status);
      code=await res.text();
      if(code.length<1000) throw new Error('file too small ('+code.length+')');
    }catch(e){
      throw new Error(
        '找不到 OCR 腳本：'+mainJs+
        '\\n請重新用最新 Editor 匯出 ZIP，解壓後必須有 vendor/tesseract/ 五個檔案。\\n'+
        '詳情：'+(e&&e.message?e.message:e)
      );
    }
    onPct && onPct(12, '初始化 OCR 庫…');
    try{
      (0, eval)(code);
    }catch(e){
      await new Promise(function(resolve,reject){
        const s=document.createElement('script');
        s.src=mainJs;
        s.onload=function(){ resolve(); };
        s.onerror=function(){ reject(new Error('script tag failed: '+mainJs)); };
        document.head.appendChild(s);
      });
    }
    if(!(g.Tesseract && g.Tesseract.createWorker)){
      throw new Error('tesseract.min.js 已取得但 window.Tesseract 不存在');
    }
    return g.Tesseract;
  }
  async function ensureOcrWorker(onPct){
    if(ocrWorker) return ocrWorker;
    const Tesseract=await ensureTesseractLib(onPct);
    const base=ocrBaseUrl();
    const langPath=base.endsWith('/')?base.slice(0,-1):base;
    onPct && onPct(15, '檢查語言包…');
    const need=['eng.traineddata','chi_tra.traineddata','chi_sim.traineddata','worker.min.js','tesseract-core-simd.wasm.js'];
    for (let i=0;i<need.length;i++){
      const f=need[i];
      const u=base+f;
      const r=await fetch(u,{method:'GET',cache:'no-store'});
      if(!r.ok) throw new Error('缺少 OCR 檔：'+u+' (HTTP '+r.status+')');
      onPct && onPct(15 + Math.round(((i+1)/need.length)*10), '檢查：'+f);
    }
    // 繁中 + 簡中 + 英文（全景標牌常見混用）
    ocrWorker=await Tesseract.createWorker(['chi_tra','chi_sim','eng'], 1, {
      workerPath: base+'worker.min.js',
      langPath: langPath,
      corePath: base+'tesseract-core-simd.wasm.js',
      workerBlobURL: false,
      gzip: false,
      logger: function(m){
        const p = typeof m.progress==='number' ? m.progress : 0;
        const pct = 25 + Math.round(p * 65);
        onPct && onPct(pct, mapOcrStatus(m.status));
      },
    });
    // Better defaults for signage / mixed CJK+Latin on photos
    await ocrWorker.setParameters({
      tessedit_pageseg_mode: '6', // uniform block of text
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    });
    onPct && onPct(92, '引擎就緒');
    return ocrWorker;
  }
  /** Upscale + contrast — critical for small CJK glyphs on panoramas */
  function preprocessCrop(src){
    const minSide=480;
    const scale=Math.max(3, minSide/Math.max(1,src.width), minSide/Math.max(1,src.height));
    const w=Math.max(1, Math.round(src.width*scale));
    const h=Math.max(1, Math.round(src.height*scale));
    const out=document.createElement('canvas');
    out.width=w; out.height=h;
    const ctx=out.getContext('2d',{willReadFrequently:true});
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';
    ctx.fillStyle='#ffffff';
    ctx.fillRect(0,0,w,h);
    ctx.drawImage(src,0,0,w,h);
    const img=ctx.getImageData(0,0,w,h);
    const d=img.data;
    let min=255, max=0;
    const gray=new Float32Array(w*h);
    for(let i=0,p=0;i<d.length;i+=4,p++){
      const g=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
      gray[p]=g;
      if(g<min) min=g;
      if(g>max) max=g;
    }
    const range=Math.max(1, max-min);
    // contrast stretch + mild sharpen-ish threshold midtones
    for(let i=0,p=0;i<d.length;i+=4,p++){
      let g=((gray[p]-min)/range)*255;
      g=(g-128)*1.45+128;
      g=Math.max(0,Math.min(255,g));
      d[i]=d[i+1]=d[i+2]=g;
      d[i+3]=255;
    }
    ctx.putImageData(img,0,0);
    return out;
  }
  async function runOcrOnRect(rx,ry,rw,rh, clientX, clientY){
    if(ocrBusy) return;
    if(rw<12||rh<12){
      hideOcrProgress();
      ocrText.textContent='框太小，請框住整段文字（愈大愈準）。';
      placeOcrPop(clientX, clientY);
      setOcrMode(false);
      return;
    }
    ocrBusy=true;
    btnOcr.disabled=true;
    placeOcrPop(clientX, clientY);
    setOcrProgress(2, '準備截圖…');
    placeOcrPop(clientX, clientY);
    setOcrMode(false);
    try{
      renderer.render(scene3,camera);
      const full=document.createElement('canvas');
      full.width=canvas.width; full.height=canvas.height;
      const fctx=full.getContext('2d',{willReadFrequently:true});
      fctx.drawImage(canvas,0,0);
      try{
        const sample=fctx.getImageData(Math.floor(full.width/2), Math.floor(full.height/2), 1, 1).data;
        const blank=sample[0]<2&&sample[1]<2&&sample[2]<2;
        if(blank){
          renderer.render(scene3,camera);
          fctx.drawImage(canvas,0,0);
        }
      }catch(_e){}
      setOcrProgress(8, '裁切並放大選區…');
      const scaleX=canvas.width/Math.max(1,innerWidth), scaleY=canvas.height/Math.max(1,innerHeight);
      const sx=Math.max(0,Math.floor(rx*scaleX));
      const sy=Math.max(0,Math.floor(ry*scaleY));
      const sw=Math.max(1,Math.min(full.width-sx, Math.floor(rw*scaleX)));
      const sh=Math.max(1,Math.min(full.height-sy, Math.floor(rh*scaleY)));
      const crop=document.createElement('canvas');
      crop.width=sw; crop.height=sh;
      crop.getContext('2d').drawImage(full,sx,sy,sw,sh,0,0,sw,sh);
      const enhanced=preprocessCrop(crop);
      const worker=await ensureOcrWorker(function(pct, label){
        setOcrProgress(pct, label);
        placeOcrPop(clientX, clientY);
      });
      setOcrProgress(94, '識別文字中（中/英）…');
      // Try block mode first, then sparse text if weak result
      let res=await worker.recognize(enhanced);
      let text=(res&&res.data&&res.data.text?res.data.text:'').trim();
      const weak=!text || text.replace(/\\s/g,'').length<2;
      if(weak){
        setOcrProgress(96, '再試稀疏文字模式…');
        await worker.setParameters({ tessedit_pageseg_mode: '11' });
        res=await worker.recognize(enhanced);
        text=(res&&res.data&&res.data.text?res.data.text:'').trim();
        await worker.setParameters({ tessedit_pageseg_mode: '6' });
      }
      setOcrProgress(100, '完成');
      hideOcrProgress();
      ocrText.textContent=text||'（未能識別。請：① 滾輪放大畫面 ② 框住整行字 ③ 避免太斜/太暗）';
      placeOcrPop(clientX, clientY);
    }catch(e){
      hideOcrProgress();
      ocrText.textContent='識別失敗：'+(e&&e.message?e.message:String(e));
      placeOcrPop(clientX, clientY);
      console.error('[OCR]', e);
    }finally{
      ocrBusy=false;
      btnOcr.disabled=false;
    }
  }
  btnOcr.onclick=function(){
    if(ocrBusy) return;
    if(ocrMode){ setOcrMode(false); return; }
    setOcrMode(true);
  };
  document.getElementById('ocr-close').onclick=()=>{ ocrPop.style.display='none'; };
  document.getElementById('ocr-copy').onclick=async()=>{
    try{ await navigator.clipboard.writeText(ocrText.textContent||''); }catch(e){}
  };
  ocrLayer.addEventListener('pointerdown',e=>{
    if(!ocrMode||ocrBusy) return;
    e.preventDefault();
    ocrDrag=true; ocrX0=e.clientX; ocrY0=e.clientY;
    ocrBox.style.display='block';
    ocrBox.style.left=ocrX0+'px'; ocrBox.style.top=ocrY0+'px';
    ocrBox.style.width='0px'; ocrBox.style.height='0px';
    try{ ocrLayer.setPointerCapture(e.pointerId); }catch(_e){}
  });
  ocrLayer.addEventListener('pointermove',e=>{
    if(!ocrDrag) return;
    const x1=e.clientX, y1=e.clientY;
    const l=Math.min(ocrX0,x1), t=Math.min(ocrY0,y1);
    const w=Math.abs(x1-ocrX0), h=Math.abs(y1-ocrY0);
    ocrBox.style.left=l+'px'; ocrBox.style.top=t+'px';
    ocrBox.style.width=w+'px'; ocrBox.style.height=h+'px';
  });
  ocrLayer.addEventListener('pointerup',e=>{
    if(!ocrDrag) return;
    ocrDrag=false;
    const x1=e.clientX, y1=e.clientY;
    const l=Math.min(ocrX0,x1), t=Math.min(ocrY0,y1);
    const w=Math.abs(x1-ocrX0), h=Math.abs(y1-ocrY0);
    ocrBox.style.display='none';
    void runOcrOnRect(l,t,w,h, x1, y1);
  });
  addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      if(ocrMode) setOcrMode(false);
      else ocrPop.style.display='none';
    }
  });
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
 * ZIP path prefix (manual copy to IIS wwwroot):
 * site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/
 */
export function deployPackagePrefix(project: ProjectDocument): string {
  const site = pathSeg(project.deploy.siteCode, 'SITE');
  const room = pathSeg(project.deploy.roomName, 'ROOM');
  const date = pathSeg(project.deploy.photoDate, 'DATE');
  return `site/${site}/${room}/${date}`;
}

/**
 * Export ZIP for manual copy to server (single assets copy, small index.html).
 *
 * site/{SITE}/{ROOM}/{DATE}/
 *   index.html          (~few KB, no base64)
 *   project.json        (no dataUrl — images are files)
 *   vendor/three.*
 *   assets/source/*.jpg
 * README.txt
 *
 * Unzip to web root (e.g. C:\inetpub\wwwroot) then open /site/S/R/D/
 * Re-import: Editor「開啟專案套件」.
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

  onProgress?.(4, '準備 three.js');
  const threeFiles = await fetchVendorThreeFiles();
  addThreeVendorToZip(zip, threeFiles, `${prefix}/vendor/`);

  onProgress?.(8, '準備 OCR（中英）');
  {
    const ocrFiles = await fetchVendorOcrFiles();
    addOcrVendorToZip(zip, ocrFiles, `${prefix}/vendor/tesseract/`);
    const bytes = Object.values(ocrFiles).reduce((n, b) => n + b.byteLength, 0);
    console.info('[export] OCR packed', (bytes / 1024 / 1024).toFixed(2), 'MB →', `${prefix}/vendor/tesseract/`);
  }

  const withData = project.scenes.filter((s) => s.source.dataUrl);
  const n = Math.max(withData.length, 1);
  let i = 0;
  for (const s of withData) {
    const bytes = await dataUrlToUint8(s.source.dataUrl!);
    // single copy under package root (not duplicated)
    const rel = `assets/source/${s.id}_${s.source.fileName}`;
    zip.file(`${prefix}/${rel}`, bytes);
    i += 1;
    onProgress?.(10 + Math.round((i / n) * 70), '打包圖片');
  }

  zip.file(`${prefix}/project.json`, JSON.stringify(pkg, null, 2));
  zip.file(`${prefix}/index.html`, buildViewerHtml(viewerProject));
  zip.file(
    'README.txt',
    `Telecom360-next 專案套件
============================
資料夾結構：
  site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/
    index.html
    project.json
    vendor/              (three.js + tesseract OCR 中英)
    assets/source/

使用方式：
1) 解壓到網站根目錄（例如 C:\\inetpub\\wwwroot）
2) 瀏覽器開啟：http://{host}/site/{SITE}/{ROOM}/{DATE}/
3) Viewer「識別文字」：框選畫面文字 → 游標旁顯示 OCR 結果（中/英）
4) 若要繼續編輯：Editor「開啟 ZIP」載入本套件

注意：OCR 離線檔約 +11MB（每次 ZIP 都帶，方便完全離線）
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
  return `${slugify(project.name) || 'telecom360-next'}.zip`;
}
