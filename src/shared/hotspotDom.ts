/**
 * Shared hotspot pin DOM helpers (Editor + Viewer).
 * Keeps glyph/label/tip markup and screen positioning consistent.
 */
import type { Hotspot, InfoHotspot, SceneHotspot } from '../core/types/project';
import { ICON_INFO, ICON_SCENE } from './icons';
import { escapeHtml } from './escapeHtml';

export type ScreenProjection = { x: number; y: number; visible: boolean };

export function sceneLinkLabel(targetName: string | undefined | null): string {
  return targetName ? `→ ${targetName}` : '場景';
}

export function createHotspotPinElement(h: Hotspot): HTMLElement {
  const el = document.createElement('div');
  el.className = `hotspot-pin ${h.type}`;
  el.dataset.id = h.id;
  el.style.pointerEvents = 'auto';
  el.style.display = 'none';
  return el;
}

/** Editor-style pin: glyph + label only (tips live in inspector). */
export function fillEditorPin(el: HTMLElement, h: Hotspot, targetName?: string | null): void {
  el.innerHTML = `<div class="glyph">${h.type === 'info' ? ICON_INFO : ICON_SCENE}</div><div class="pin-label"></div>`;
  syncPinLabel(el, h, targetName);
}

/** Viewer info pin with optional hover tip. */
export function fillViewerInfoPin(el: HTMLElement, info: InfoHotspot): void {
  const t0 = (info.title || '').trim();
  const tx = (info.text || '').trim();
  const has = Boolean(t0 || tx);
  el.innerHTML = `<div class="glyph">${ICON_INFO}</div><div class="pin-label"></div><div class="pin-tip"></div>`;
  const lbl = el.querySelector('.pin-label') as HTMLElement;
  const tip = el.querySelector('.pin-tip') as HTMLElement;
  lbl.textContent = t0;
  lbl.hidden = !t0;
  el.classList.toggle('has-content', has);
  if (has) {
    tip.innerHTML = `${t0 ? `<strong>${escapeHtml(t0)}</strong>` : ''}${tx ? `<p>${escapeHtml(tx)}</p>` : ''}`;
  } else {
    tip.innerHTML = '';
  }
}

/** Viewer scene-link pin. */
export function fillViewerScenePin(el: HTMLElement, _h: SceneHotspot, targetName?: string | null): void {
  el.innerHTML = `<div class="glyph">${ICON_SCENE}</div><div class="pin-label"></div>`;
  const lbl = el.querySelector('.pin-label') as HTMLElement;
  lbl.textContent = sceneLinkLabel(targetName);
  lbl.hidden = false;
}

export function syncPinLabel(el: HTMLElement, h: Hotspot, targetName?: string | null): void {
  const labelEl = el.querySelector('.pin-label') as HTMLElement | null;
  if (!labelEl) return;
  if (h.type === 'info') {
    const t0 = ((h as InfoHotspot).title || '').trim();
    labelEl.textContent = t0;
    labelEl.hidden = !t0;
  } else {
    labelEl.textContent = sceneLinkLabel(targetName);
    labelEl.hidden = false;
  }
}

export function positionPin(el: HTMLElement, scr: ScreenProjection): void {
  if (!scr.visible) {
    el.style.display = 'none';
    return;
  }
  el.style.left = `${scr.x}px`;
  el.style.top = `${scr.y}px`;
  el.style.display = 'block';
}

export function setPinTypeClasses(el: HTMLElement, h: Hotspot, selected = false): void {
  el.classList.toggle('selected', selected);
  el.classList.toggle('info', h.type === 'info');
  el.classList.toggle('scene', h.type === 'scene');
}
