import { PanoramaEngine } from '../panorama/PanoramaEngine';
import {
  FOV_MAX,
  defaultSettings,
  type ProjectDocument,
  type SceneHotspot,
  type InfoHotspot,
  type ViewParams,
} from '../core/types/project';
import { ICON_INFO, ICON_SCENE } from '../shared/icons';
import { escapeHtml } from '../shared/escapeHtml';
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
      const el = document.createElement('div');
      el.className = `hotspot-pin ${h.type}`;
      el.dataset.id = h.id;
      el.style.pointerEvents = 'auto';
      el.style.display = 'none';
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
        const tgt = this.project.scenes.find((s) => s.id === sh.targetSceneId);
        el.innerHTML = `<div class="glyph">${ICON_SCENE}</div><div class="pin-label"></div>`;
        const lbl = el.querySelector('.pin-label') as HTMLElement;
        lbl.textContent = tgt ? `→ ${tgt.name}` : '場景';
        el.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (!tgt || this.switching) return;
          // Pause spin briefly; keep toggle ON so it resumes after idle
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
      const scr = this.engine.projectToScreen(h.yaw, h.pitch);
      if (!scr.visible) {
        el.style.display = 'none';
        continue;
      }
      el.style.left = `${scr.x}px`;
      el.style.top = `${scr.y}px`;
      el.style.display = 'block';
    }
  }

  private async switchScene(id: string, fromHotspot?: SceneHotspot) {
    if (this.switching) return;
    const scene = this.project.scenes.find((s) => s.id === id);
    if (!scene) return;
    this.switching = true;
    this.clearPins();
    try {
      // Pause only — do not clear autorotate toggle (engine resumes after 5s if still on)
      this.engine.interruptAutorotate();
      const canvas = this.engine.renderer.domElement;
      if (fromHotspot) {
        await this.engine.aimAndZoomIn(fromHotspot.yaw, fromHotspot.pitch, 380);
        canvas.style.transition = 'opacity 0.35s ease';
        canvas.style.opacity = '0';
        await new Promise((r) => setTimeout(r, 350));
        await this.engine.transitionToUrl(scene.source.url, 400);
        canvas.style.opacity = '1';
      } else if (this.activeId && this.activeId !== id) {
        canvas.style.transition = 'opacity 0.3s ease';
        canvas.style.opacity = '0';
        await new Promise((r) => setTimeout(r, 280));
        await this.engine.loadTextureFromUrl(scene.source.url);
        canvas.style.opacity = '1';
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
