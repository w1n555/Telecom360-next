import { PanoramaEngine } from '../panorama/PanoramaEngine';
import {
  FOV_MAX,
  defaultSettings,
  type ProjectDocument,
  type SceneHotspot,
  type InfoHotspot,
  type ViewParams,
} from '../core/types/project';
import { escapeHtml } from '../shared/escapeHtml';
import {
  createHotspotPinElement,
  fillViewerInfoPin,
  fillViewerScenePin,
  positionPin,
} from '../shared/hotspotDom';
import { aimFadeAndLoad, fadeAndLoad } from '../shared/sceneTransition';
import { assetUrl } from './loadProject';

/**
 * Offline published tour viewer (shared PanoramaEngine with Editor).
 * Autorotate: user toggle stays on; drag/wheel/keys pause then resume after 5s (engine).
 */
export class ViewerApp {
  private project: ProjectDocument;
  private engine: PanoramaEngine;
  private scenesEl: HTMLElement;
  private hotLayer: HTMLElement;
  private btnAuto: HTMLButtonElement;
  private btnFs: HTMLButtonElement;

  private activeId: string | null;
  private pinSceneId: string | null = null;
  private pinEls = new Map<string, HTMLElement>();
  private switching = false;
  private hotspotsReady = false;
  private overlayRaf = 0;

  constructor(root: HTMLElement, project: ProjectDocument) {
    this.project = project;
    this.activeId = project.scenes[0]?.id ?? null;

    const brandSrc = assetUrl('brand/clp-dark.png');
    root.innerHTML = `
      <div class="viewer-root">
        <header class="viewer-header">
          <div class="logo-wrap" title="CLP">
            <img class="logo" src="${brandSrc}" alt="CLP" onerror="this.parentElement.style.display='none'" />
          </div>
          <div class="brand-text" id="v-title"></div>
          <div class="spacer"></div>
          <div class="viewer-tools">
            <button type="button" class="btn" id="v-auto">自動旋轉</button>
            <button type="button" class="btn" id="v-fs">全螢幕</button>
          </div>
        </header>
        <div class="viewer-stage" id="v-stage">
          <div class="viewer-scenes" id="v-scenes"></div>
          <div class="hotspot-layer" id="v-hot"></div>
        </div>
      </div>
    `;

    (root.querySelector('#v-title') as HTMLElement).textContent = project.name;
    const stage = root.querySelector('#v-stage') as HTMLElement;
    this.scenesEl = root.querySelector('#v-scenes') as HTMLElement;
    this.hotLayer = root.querySelector('#v-hot') as HTMLElement;
    this.btnAuto = root.querySelector('#v-auto') as HTMLButtonElement;
    this.btnFs = root.querySelector('#v-fs') as HTMLButtonElement;

    const settings = {
      ...defaultSettings(),
      ...project.settings,
      fullscreenButton: true,
      defaultParallaxEnabled: true,
      autorotateEnabled: false,
    };
    this.engine = new PanoramaEngine(stage, settings);
    this.engine.setParallaxEnabled(true);
    stage.appendChild(this.hotLayer);

    this.btnAuto.addEventListener('click', () => {
      const on = !this.btnAuto.classList.contains('on');
      this.btnAuto.classList.toggle('on', on);
      this.engine.setAutorotate(on);
    });
    this.btnFs.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    });
    document.addEventListener('fullscreenchange', () => {
      this.btnFs.classList.toggle('on', !!document.fullscreenElement);
    });
  }

  async start() {
    this.renderSceneButtons();
    if (this.activeId) await this.switchScene(this.activeId);
    const loop = () => {
      this.drawHot();
      this.overlayRaf = requestAnimationFrame(loop);
    };
    loop();
  }

  dispose() {
    cancelAnimationFrame(this.overlayRaf);
    this.engine.dispose();
  }

  private sceneView(scene: { initialView: ViewParams }): ViewParams {
    return {
      yaw: scene.initialView.yaw,
      pitch: scene.initialView.pitch,
      fov: typeof scene.initialView.fov === 'number' ? scene.initialView.fov : FOV_MAX,
    };
  }

  private clearPins() {
    this.hotspotsReady = false;
    this.pinSceneId = null;
    this.pinEls.clear();
    this.hotLayer.innerHTML = '';
  }

  private renderSceneButtons() {
    this.scenesEl.innerHTML = this.project.scenes
      .map(
        (s) =>
          `<button type="button" data-id="${s.id}" class="${s.id === this.activeId ? 'active' : ''}">${escapeHtml(s.name)}</button>`
      )
      .join('');
    this.scenesEl.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => void this.switchScene((b as HTMLElement).dataset.id!));
    });
  }

  private ensurePins() {
    if (!this.hotspotsReady) {
      if (this.hotLayer.childElementCount) this.clearPins();
      return;
    }
    const scene = this.project.scenes.find((s) => s.id === this.activeId);
    if (!scene) {
      this.clearPins();
      return;
    }
    if (this.pinSceneId === scene.id && this.pinEls.size === scene.hotspots.length) return;
    this.hotLayer.innerHTML = '';
    this.pinEls.clear();
    this.pinSceneId = scene.id;
    for (const h of scene.hotspots) {
      const el = createHotspotPinElement(h);
      if (h.type === 'info') {
        fillViewerInfoPin(el, h as InfoHotspot);
      } else {
        const sh = h as SceneHotspot;
        const tgt = this.project.scenes.find((s) => s.id === sh.targetSceneId);
        fillViewerScenePin(el, sh, tgt?.name);
        el.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (!tgt || this.switching) return;
          this.engine.interruptAutorotate();
          void this.switchScene(tgt.id, sh);
        });
      }
      this.hotLayer.appendChild(el);
      this.pinEls.set(h.id, el);
    }
  }

  private drawHot() {
    if (!this.hotspotsReady) return;
    this.ensurePins();
    const scene = this.project.scenes.find((s) => s.id === this.activeId);
    if (!scene) return;
    for (const h of scene.hotspots) {
      const el = this.pinEls.get(h.id);
      if (!el) continue;
      positionPin(el, this.engine.projectToScreen(h.yaw, h.pitch));
    }
  }

  private async switchScene(id: string, fromHotspot?: SceneHotspot) {
    if (this.switching) return;
    const scene = this.project.scenes.find((s) => s.id === id);
    if (!scene) return;
    this.switching = true;
    this.clearPins();
    try {
      this.engine.interruptAutorotate();
      if (fromHotspot) {
        await aimFadeAndLoad(this.engine, {
          yaw: fromHotspot.yaw,
          pitch: fromHotspot.pitch,
          url: scene.source.url,
          mode: 'transition',
        });
      } else if (this.activeId && this.activeId !== id) {
        await fadeAndLoad(this.engine, scene.source.url, { mode: 'load', fadeMs: 280 });
      } else {
        await this.engine.loadTextureFromUrl(scene.source.url);
      }
      this.activeId = id;
      await this.engine.settleView(this.sceneView(scene));
      this.renderSceneButtons();
      if (this.activeId === id) {
        this.hotspotsReady = true;
        this.drawHot();
      }
    } finally {
      this.switching = false;
    }
  }
}
