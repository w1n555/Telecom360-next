import { PanoramaEngine } from './panorama/PanoramaEngine';
import {
  PACKAGE_VERSION,
  defaultSettings,
  FOV_MAX,
  isKnownPackageFormat,
  type ProjectDocument,
  type ProjectPackage,
  type SceneHotspot,
  type InfoHotspot,
  type ViewParams,
} from './core/types/project';
import { t } from './core/i18n/zh-Hant';

const ICON_INFO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 10v6"/><circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none"/></svg>`;
const ICON_SCENE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>`;

/** Resolve brand/asset URLs relative to this page (works under /site/S/R/D/ and /viewer/). */
function assetUrl(rel: string): string {
  return new URL(rel.replace(/^\//, ''), location.href).href;
}

async function loadPackage(): Promise<ProjectDocument> {
  const url = assetUrl('project.json');
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `找不到 project.json（此頁應與 project.json 同目錄；匯出套件解壓後開啟 site/{SITE}/{ROOM}/{DATE}/）`
    );
  }
  const pkg = (await res.json()) as ProjectPackage;
  if (!isKnownPackageFormat(pkg.format) || pkg.version !== PACKAGE_VERSION) {
    throw new Error('專案格式不支援');
  }
  if (!pkg.project?.scenes?.length) {
    throw new Error('專案沒有場景');
  }
  for (const s of pkg.project.scenes) {
    if (!/^https?:|blob:|data:/i.test(s.source.url)) {
      s.source.url = assetUrl(s.source.url);
    }
    delete (s as { measurements?: unknown }).measurements;
  }
  pkg.project.settings = { ...defaultSettings(), ...pkg.project.settings };
  return pkg.project;
}

async function main() {
  const root = document.getElementById('viewer-app');
  if (!root) return;
  document.title = t('viewerTitle');

  let project: ProjectDocument;
  try {
    project = await loadPackage();
  } catch (e) {
    const msg = escapeHtml((e as Error).message || String(e));
    root.innerHTML = `<div style="padding:24px;color:#fff;background:#0b1220;min-height:100%;box-sizing:border-box;font-family:system-ui,sans-serif"><strong>無法載入導覽</strong><p style="margin:12px 0 0;line-height:1.5">${msg}</p></div>`;
    return;
  }

  document.title = `${project.name} · Telecom360-next`;
  const brandSrc = assetUrl('brand/clp-light.png');

  root.innerHTML = `
    <div class="viewer-root">
      <div class="viewer-bar">
        <img src="${brandSrc}" alt="CLP" onerror="this.style.display='none'" />
        <div class="title" id="v-title"></div>
        <div class="viewer-tools">
          <button type="button" id="v-auto">自動旋轉</button>
          <button type="button" id="v-fs">全螢幕</button>
        </div>
      </div>
      <div class="viewer-stage" id="v-stage">
        <div class="viewer-scenes" id="v-scenes"></div>
        <div class="hotspot-layer" id="v-hot"></div>
      </div>
    </div>
  `;

  (root.querySelector('#v-title') as HTMLElement).textContent = project.name;
  const stage = root.querySelector('#v-stage') as HTMLElement;
  const scenesEl = root.querySelector('#v-scenes') as HTMLElement;
  const hotLayer = root.querySelector('#v-hot') as HTMLElement;
  const btnAuto = root.querySelector('#v-auto') as HTMLButtonElement;
  const btnFs = root.querySelector('#v-fs') as HTMLButtonElement;

  const settings = {
    ...defaultSettings(),
    ...project.settings,
    fullscreenButton: true,
    defaultParallaxEnabled: true,
    autorotateEnabled: false,
  };
  const engine = new PanoramaEngine(stage, settings);
  engine.setParallaxEnabled(true);
  stage.appendChild(hotLayer);

  let activeId = project.scenes[0]?.id ?? null;
  let pinSceneId: string | null = null;
  const pinEls = new Map<string, HTMLElement>();
  let switching = false;
  /** Icons only after texture + settleView */
  let hotspotsReady = false;

  const clearPins = () => {
    hotspotsReady = false;
    pinSceneId = null;
    pinEls.clear();
    hotLayer.innerHTML = '';
  };

  const sceneView = (scene: { initialView: ViewParams }): ViewParams => ({
    yaw: scene.initialView.yaw,
    pitch: scene.initialView.pitch,
    fov: typeof scene.initialView.fov === 'number' ? scene.initialView.fov : FOV_MAX,
  });

  const renderSceneButtons = () => {
    scenesEl.innerHTML = project.scenes
      .map((s) => `<button type="button" data-id="${s.id}" class="${s.id === activeId ? 'active' : ''}">${escapeHtml(s.name)}</button>`)
      .join('');
    scenesEl.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => void switchScene((b as HTMLElement).dataset.id!));
    });
  };

  const ensurePins = () => {
    if (!hotspotsReady) {
      if (hotLayer.childElementCount) clearPins();
      return;
    }
    const scene = project.scenes.find((s) => s.id === activeId);
    if (!scene) {
      clearPins();
      return;
    }
    if (pinSceneId === scene.id && pinEls.size === scene.hotspots.length) return;
    hotLayer.innerHTML = '';
    pinEls.clear();
    pinSceneId = scene.id;
    for (const h of scene.hotspots) {
      const el = document.createElement('div');
      el.className = `hotspot-pin ${h.type}`;
      el.dataset.id = h.id;
      el.style.pointerEvents = 'auto';
      el.style.display = 'none'; // position first, then show
      if (h.type === 'info') {
        const info = h as InfoHotspot;
        const t0 = (info.title || '').trim();
        const tx = (info.text || '').trim();
        const has = Boolean(t0 || tx);
        el.innerHTML = `<div class="glyph">${ICON_INFO}</div><div class="pin-label"></div><div class="pin-tip"></div>`;
        const lbl = el.querySelector('.pin-label') as HTMLElement;
        const tip = el.querySelector('.pin-tip') as HTMLElement;
        lbl.textContent = t0;
        lbl.hidden = !t0;
        if (has) {
          el.classList.add('has-content');
          tip.innerHTML = `${t0 ? `<strong>${escapeHtml(t0)}</strong>` : ''}${tx ? `<p>${escapeHtml(tx)}</p>` : ''}`;
        }
      } else {
        const sh = h as SceneHotspot;
        const tgt = project.scenes.find((s) => s.id === sh.targetSceneId);
        el.innerHTML = `<div class="glyph">${ICON_SCENE}</div><div class="pin-label"></div>`;
        const lbl = el.querySelector('.pin-label') as HTMLElement;
        lbl.textContent = tgt ? `→ ${tgt.name}` : '場景';
        el.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (!tgt || switching) return;
          engine.interruptAutorotate();
          btnAuto.classList.remove('on');
          void switchScene(tgt.id, sh);
        });
      }
      hotLayer.appendChild(el);
      pinEls.set(h.id, el);
    }
  };

  const drawHot = () => {
    if (!hotspotsReady) return;
    ensurePins();
    const scene = project.scenes.find((s) => s.id === activeId);
    if (!scene) return;
    for (const h of scene.hotspots) {
      const el = pinEls.get(h.id);
      if (!el) continue;
      const scr = engine.projectToScreen(h.yaw, h.pitch);
      if (!scr.visible) {
        el.style.display = 'none';
        continue;
      }
      el.style.left = `${scr.x}px`;
      el.style.top = `${scr.y}px`;
      el.style.display = 'block';
    }
  };

  async function switchScene(id: string, fromHotspot?: SceneHotspot) {
    if (switching) return;
    const scene = project.scenes.find((s) => s.id === id);
    if (!scene) return;
    switching = true;
    // Hide icons immediately (before fade / zoom)
    clearPins();
    try {
      engine.interruptAutorotate();
      btnAuto.classList.remove('on');
      const canvas = engine.renderer.domElement;
      if (fromHotspot) {
        await engine.aimAndZoomIn(fromHotspot.yaw, fromHotspot.pitch, 380);
        canvas.style.transition = 'opacity 0.35s ease';
        canvas.style.opacity = '0';
        await new Promise((r) => setTimeout(r, 350));
        await engine.transitionToUrl(scene.source.url, 400);
        canvas.style.opacity = '1';
      } else if (activeId && activeId !== id) {
        canvas.style.transition = 'opacity 0.3s ease';
        canvas.style.opacity = '0';
        await new Promise((r) => setTimeout(r, 280));
        await engine.loadTextureFromUrl(scene.source.url);
        canvas.style.opacity = '1';
      } else {
        await engine.loadTextureFromUrl(scene.source.url);
      }
      activeId = id;
      const iv = sceneView(scene);
      // Image ready → settle camera to initial view → then show icons
      await engine.settleView(iv);
      renderSceneButtons();
      if (activeId === id) {
        hotspotsReady = true;
        drawHot();
      }
    } finally {
      switching = false;
    }
  }

  btnAuto.addEventListener('click', () => {
    const on = !btnAuto.classList.contains('on');
    btnAuto.classList.toggle('on', on);
    engine.setAutorotate(on);
  });
  btnFs.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  });
  document.addEventListener('fullscreenchange', () => {
    btnFs.classList.toggle('on', !!document.fullscreenElement);
  });

  renderSceneButtons();
  if (activeId) await switchScene(activeId);

  const loop = () => {
    drawHot();
    requestAnimationFrame(loop);
  };
  loop();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

main().catch(console.error);
