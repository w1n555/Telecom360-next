import { store } from '../../core/state/ProjectStore';
import { t } from '../../core/i18n/zh-Hant';
import type { SceneHotspot } from '../../core/types/project';
import type { PanoramaEngine } from '../../panorama/PanoramaEngine';
import { escapeHtml } from '../../shared/escapeHtml';

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/`/g, '&#96;');
}

/**
 * Short label for inspector dropdown (full name kept in title / value).
 * ~36 letters fits ~300px panel at 14px better than the old 22-char cut.
 */
function ellipsisLabel(s: string, maxChars = 36): string {
  const t = (s || '').trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(1, maxChars - 1))}…`;
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
    // Include scene-link target so changing the dropdown invalidates the panel
    // (otherwise early-return leaves #hs-go bound to a stale hotspot object).
    const targetSig = hs && hs.type === 'scene' ? (hs as SceneHotspot).targetSceneId || '' : '';
    const key = `${store.ui.activeSceneId}|${store.ui.selectedHotspotId}|${namesSig}|${targetSig}`;
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

    const hotspotId = hs.id;

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
        store.updateHotspot(hotspotId, { title: (e.target as HTMLInputElement).value }, { silent: true });
      });
      body.querySelector('#hs-text')!.addEventListener('input', (e) => {
        store.updateHotspot(hotspotId, { text: (e.target as HTMLTextAreaElement).value }, { silent: true });
      });
    } else {
      const options = store.project.scenes
        .filter((s) => s.id !== scene.id)
        .map((s) => {
          const full = (s.name || '').trim() || s.id;
          const short = ellipsisLabel(full);
          return `<option value="${s.id}" title="${escapeAttr(full)}" ${s.id === hs.targetSceneId ? 'selected' : ''}>${escapeHtml(short)}</option>`;
        })
        .join('');
      const selectedName =
        store.project.scenes.find((s) => s.id === hs.targetSceneId)?.name?.trim() || '';
      body.innerHTML = `
        <p class="hint">場景連結 · 點圖示只選取；用下方按鈕前往</p>
        <label>${t('selectTarget')}
          <select id="hs-target" title="${escapeAttr(selectedName || t('emptyTarget'))}">
            <option value="">${escapeHtml(ellipsisLabel(t('emptyTarget')))}</option>
            ${options}
          </select>
        </label>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn primary" id="hs-go">${t('goToScene')}</button>
          <button type="button" class="btn ghost-dark" id="hs-del">${t('delete')}</button>
        </div>
      `;
      body.querySelector('#hs-target')!.addEventListener('change', (e) => {
        const sel = e.target as HTMLSelectElement;
        const next = sel.value;
        const full =
          store.project.scenes.find((s) => s.id === next)?.name?.trim() || t('emptyTarget');
        sel.title = full;
        // Invalidate before emit so re-render does not early-return on same key
        this.inspectorKey = '';
        store.updateHotspot(hotspotId, { targetSceneId: next });
      });
      // Always resolve target from store + dropdown (never a closed-over hotspot snapshot)
      body.querySelector('#hs-go')!.addEventListener('click', () => {
        const live = store.activeScene?.hotspots.find((h) => h.id === hotspotId);
        if (!live || live.type !== 'scene') return;
        const sel = body.querySelector('#hs-target') as HTMLSelectElement | null;
        const targetSceneId = (sel?.value || live.targetSceneId || '').trim();
        if (!targetSceneId) {
          store.setToast(t('emptyTarget'));
          return;
        }
        // Persist dropdown choice in case user never blurred/changed after keyboard nav
        if (targetSceneId !== live.targetSceneId) {
          store.updateHotspot(hotspotId, { targetSceneId }, { silent: true });
        }
        this.handlers.onGoToScene({ ...live, targetSceneId });
      });
    }
    body.querySelector('#hs-del')!.addEventListener('click', () => {
      const live = store.activeScene?.hotspots.find((h) => h.id === hotspotId) || hs;
      let detailLine = '';
      if (live.type === 'info') {
        const name = (live.title || '').trim() || '（未命名注解）';
        detailLine = `標註：${name}`;
      } else {
        const sel = body.querySelector('#hs-target') as HTMLSelectElement | null;
        const tid = (sel?.value || (live as SceneHotspot).targetSceneId || '').trim();
        const tgt = store.project.scenes.find((s) => s.id === tid);
        const name = tgt?.name?.trim() || '（未選擇目標場景）';
        detailLine = `目標場景：${name}`;
      }
      store.showPromptDialog({
        title: t('deleteHotspotTitle'),
        body: `${t('confirmDeleteHotspot')}\n\n${detailLine}`,
        showInput: false,
        danger: true,
        okLabel: t('deleteConfirm'),
        context: { type: 'delete-hotspot', hotspotId },
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
        const empty = t('emptyTarget');
        opt.textContent = ellipsisLabel(empty);
        opt.title = empty;
        continue;
      }
      const s = store.project.scenes.find((x) => x.id === opt.value);
      if (s) {
        const full = (s.name || '').trim() || s.id;
        opt.textContent = ellipsisLabel(full);
        opt.title = full;
      }
    }
    const cur = sel.selectedOptions[0];
    sel.title = cur?.title || cur?.textContent || '';
  }
}
