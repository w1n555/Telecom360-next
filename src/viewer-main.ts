import * as THREE from 'three';
import { PanoramaEngine } from './panorama/PanoramaEngine';
import {
  PACKAGE_FORMAT,
  PACKAGE_VERSION,
  defaultSettings,
  type ProjectDocument,
  type ProjectPackage,
  type SceneHotspot,
} from './core/types/project';
import { t } from './core/i18n/zh-Hant';

async function loadPackage(): Promise<ProjectDocument> {
  const url = new URL('project.json', location.href).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error('找不到 project.json');
  const pkg = (await res.json()) as ProjectPackage;
  if (pkg.format !== PACKAGE_FORMAT || pkg.version !== PACKAGE_VERSION) {
    throw new Error('專案格式不支援');
  }
  // resolve relative asset urls against this page
  for (const s of pkg.project.scenes) {
    if (!/^https?:|blob:|data:/i.test(s.source.url)) {
      s.source.url = new URL(s.source.url, location.href).toString();
    }
  }
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
    root.innerHTML = `<div style="padding:24px;color:#fff;background:#0b1220;height:100%">${(e as Error).message}</div>`;
    return;
  }

  root.innerHTML = `
    <div class="viewer-root">
      <div class="viewer-bar">
        <img src="/brand/clp-light.png" alt="CLP" onerror="this.style.display='none'" />
        <div class="title" id="v-title"></div>
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

  const settings = { ...defaultSettings(), ...project.settings };
  const engine = new PanoramaEngine(stage, settings);
  stage.appendChild(hotLayer);

  let activeId = project.scenes[0]?.id ?? null;

  const renderSceneButtons = () => {
    scenesEl.innerHTML = project.scenes
      .map(
        (s) =>
          `<button data-id="${s.id}" class="${s.id === activeId ? 'active' : ''}">${s.name}</button>`
      )
      .join('');
    scenesEl.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => void switchScene((b as HTMLElement).dataset.id!));
    });
  };

  const drawHot = () => {
    const scene = project.scenes.find((s) => s.id === activeId);
    hotLayer.innerHTML = '';
    if (!scene) return;
    for (const h of scene.hotspots) {
      const scr = engine.projectToScreen(h.yaw, h.pitch);
      if (!scr.visible) continue;
      const el = document.createElement('div');
      el.className = `hotspot-pin ${h.type}`;
      el.style.left = `${scr.x}px`;
      el.style.top = `${scr.y}px`;
      el.innerHTML = `<div class="glyph"></div>`;
      el.style.pointerEvents = 'auto';
      if (h.type === 'info') {
        el.title = `${h.title}\n${h.text}`;
        el.addEventListener('click', () => alert(`${h.title}\n\n${h.text}`));
      } else {
        el.addEventListener('click', () => void switchScene((h as SceneHotspot).targetSceneId, h as SceneHotspot));
      }
      hotLayer.appendChild(el);
    }
  };

  async function switchScene(id: string, fromHotspot?: SceneHotspot) {
    const scene = project.scenes.find((s) => s.id === id);
    if (!scene) return;
    if (fromHotspot) {
      await engine.aimAndPush(fromHotspot.yaw, fromHotspot.pitch, 320);
      await engine.transitionToUrl(scene.source.url, 500);
    } else if (activeId && activeId !== id) {
      await engine.transitionToUrl(scene.source.url, 450);
    } else {
      await engine.loadTextureFromUrl(scene.source.url);
    }
    activeId = id;
    engine.setView(scene.initialView, true);
    renderSceneButtons();
  }

  renderSceneButtons();
  if (activeId) await switchScene(activeId);

  const loop = () => {
    drawHot();
    requestAnimationFrame(loop);
  };
  loop();
}

main().catch(console.error);
