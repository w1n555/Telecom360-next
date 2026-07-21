import { store } from '../../core/state/ProjectStore';
import { t } from '../../core/i18n/zh-Hant';
import type { SceneHotspot } from '../../core/types/project';
import type { PanoramaEngine } from '../../panorama/PanoramaEngine';
import { escapeHtml } from '../../shared/escapeHtml';

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/`/g, '&#96;');
}

export type InspectorPanelHandlers = {
  onGoToScene: (h: SceneHotspot) => void;
  onInspectorKeyInvalidate: () => void;
  getEngine: () => PanoramaEngine | null;
};

/**
 * Right-hand hotspot inspector (info fields / scene link target).
 */
export class InspectorPanel {
  private body: HTMLElement;
  private handlers: InspectorPanelHandlers;
  private inspectorKey = '';

  constructor(body: HTMLElement, handlers: InspectorPanelHandlers) {
    this.body = body;
    this.handlers = handlers;
  }

  invalidateKey() {
    this.inspectorKey = '';
  }

  render() {
    const body = this.body;
    const scene = store.activeScene;
    const hs = scene?.hotspots.find((h) => h.id === store.ui.selectedHotspotId);
    const namesSig = store.project.scenes.map((s) => `${s.id}=${s.name}`).join('|');
    const key = `${store.ui.activeSceneId}|${store.ui.selectedHotspotId}|${namesSig}`;
    if (key === this.inspectorKey && body.childElementCount > 0) {
      this.refreshTargetDropdownLabels();
      return;
    }
    this.inspectorKey = key;

    if (!scene) {
      body.innerHTML = `<p class="hint">${t('noScenes')}</p>`;
      this.handlers.getEngine()?.clearTexture();
      return;
    }
    if (!hs) {
      body.innerHTML = `<p class="hint">${t('noSelection')}</p>`;
      return;
    }

    if (hs.type === 'info') {
      body.innerHTML = `
        <p class="hint">注解標示 · 可在預覽拖曳位置 · 檢視器滑鼠移上圖示顯示內容</p>
        <label>${t('title')}<input id="hs-title" value="${escapeAttr(hs.title)}" placeholder="" autocomplete="off" /></label>
        <label>${t('text')}<textarea id="hs-text" placeholder="">${escapeHtml(hs.text)}</textarea></label>
        <div style="margin-top:12px">
          <button type="button" class="btn ghost-dark" id="hs-del">${t('delete')}</button>
        </div>
      `;
      body.querySelector('#hs-title')!.addEventListener('input', (e) => {
        store.updateHotspot(hs.id, { title: (e.target as HTMLInputElement).value }, { silent: true });
      });
      body.querySelector('#hs-text')!.addEventListener('input', (e) => {
        store.updateHotspot(hs.id, { text: (e.target as HTMLTextAreaElement).value }, { silent: true });
      });
    } else {
      const options = store.project.scenes
        .filter((s) => s.id !== scene.id)
        .map(
          (s) =>
            `<option value="${s.id}" ${s.id === hs.targetSceneId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
        )
        .join('');
      body.innerHTML = `
        <p class="hint">場景連結 · 點圖示只選取；用下方按鈕前往</p>
        <label>${t('selectTarget')}
          <select id="hs-target">
            <option value="">${t('emptyTarget')}</option>
            ${options}
          </select>
        </label>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn primary" id="hs-go">${t('goToScene')}</button>
          <button type="button" class="btn ghost-dark" id="hs-del">${t('delete')}</button>
        </div>
      `;
      body.querySelector('#hs-target')!.addEventListener('change', (e) => {
        store.updateHotspot(hs.id, { targetSceneId: (e.target as HTMLSelectElement).value });
        this.inspectorKey = '';
      });
      body.querySelector('#hs-go')!.addEventListener('click', () => {
        this.handlers.onGoToScene(hs as SceneHotspot);
      });
    }
    body.querySelector('#hs-del')!.addEventListener('click', () => {
      let detailLine = '';
      if (hs.type === 'info') {
        const name = (hs.title || '').trim() || '（未命名注解）';
        detailLine = `標註：${name}`;
      } else {
        const tgt = store.project.scenes.find((s) => s.id === hs.targetSceneId);
        const name = tgt?.name?.trim() || '（未選擇目標場景）';
        detailLine = `目標場景：${name}`;
      }
      store.showPromptDialog({
        title: t('deleteHotspotTitle'),
        body: `${t('confirmDeleteHotspot')}\n\n${detailLine}`,
        showInput: false,
        danger: true,
        okLabel: t('deleteConfirm'),
        context: { type: 'delete-hotspot', hotspotId: hs.id },
      });
    });
  }

  private refreshTargetDropdownLabels() {
    const sel = this.body.querySelector('#hs-target') as HTMLSelectElement | null;
    if (!sel) return;
    const scene = store.activeScene;
    if (!scene) return;
    for (const opt of Array.from(sel.options)) {
      if (!opt.value) {
        opt.textContent = t('emptyTarget');
        continue;
      }
      const s = store.project.scenes.find((x) => x.id === opt.value);
      if (s) opt.textContent = s.name;
    }
  }
}
