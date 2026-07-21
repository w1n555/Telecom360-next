import { store } from '../../core/state/ProjectStore';
import type { SceneHotspot } from '../../core/types/project';
import type { PanoramaEngine } from '../../panorama/PanoramaEngine';
import {
  createHotspotPinElement,
  fillEditorPin,
  positionPin,
  setPinTypeClasses,
  syncPinLabel,
} from '../../shared/hotspotDom';

export type HotspotOverlayHandlers = {
  onDragStart: (hotspotId: string) => void;
  onDragEnd: () => void;
  onSelect: (hotspotId: string) => void;
};

/**
 * Editor hotspot pin layer: create / update / project pins each frame.
 * Keeps DOM pin logic out of EditorApp.
 */
export class HotspotOverlay {
  private layer: HTMLElement;
  private getEngine: () => PanoramaEngine | null;
  private handlers: HotspotOverlayHandlers;
  /** Hide pins until panorama texture + camera view have settled */
  ready = false;

  constructor(
    layer: HTMLElement,
    getEngine: () => PanoramaEngine | null,
    handlers: HotspotOverlayHandlers
  ) {
    this.layer = layer;
    this.getEngine = getEngine;
    this.handlers = handlers;
  }

  clear() {
    this.ready = false;
    this.layer.innerHTML = '';
  }

  draw() {
    const engine = this.getEngine();
    if (!engine) return;
    const scene = store.activeScene;
    if (!scene || !this.ready) {
      if (!this.ready && this.layer.childElementCount) {
        this.layer.innerHTML = '';
      }
      if (!scene) this.layer.innerHTML = '';
      return;
    }
    const existing = new Map(
      [...this.layer.querySelectorAll('.hotspot-pin')].map((el) => [
        (el as HTMLElement).dataset.id!,
        el as HTMLElement,
      ])
    );
    const keep = new Set<string>();
    for (const h of scene.hotspots) {
      keep.add(h.id);
      let el = existing.get(h.id);
      if (!el) {
        el = createHotspotPinElement(h);
        fillEditorPin(el, h);
        el.addEventListener('pointerdown', (ev) => {
          ev.stopPropagation();
          this.handlers.onDragStart(h.id);
          store.selectHotspot(h.id);
          (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
        });
        el.addEventListener('pointerup', (ev) => {
          ev.stopPropagation();
          this.handlers.onDragEnd();
        });
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.handlers.onSelect(h.id);
          store.selectHotspot(h.id);
        });
        this.layer.appendChild(el);
      }
      const tgt =
        h.type === 'scene'
          ? store.project.scenes.find((s) => s.id === (h as SceneHotspot).targetSceneId)
          : undefined;
      setPinTypeClasses(el, h, store.ui.selectedHotspotId === h.id);
      syncPinLabel(el, h, tgt?.name);
      positionPin(el, engine.projectToScreen(h.yaw, h.pitch));
    }
    for (const [id, el] of existing) {
      if (!keep.has(id)) el.remove();
    }
  }
}
