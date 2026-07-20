import { store } from '../core/state/ProjectStore';
import { t } from '../core/i18n/zh-Hant';
import { PanoramaEngine } from '../panorama/PanoramaEngine';
import { ingestEquirectFile } from '../media/ImageIngest';
import { buildProjectZip, downloadBlob, suggestZipName } from '../project/ExportService';
import { importProjectZip } from '../project/ImportService';
import { uid } from '../utils/id';
import {
  deployFieldsComplete,
  projectNameComplete,
  type InfoHotspot,
  type SceneHotspot,
} from '../core/types/project';

const ICON_INFO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v6"/><circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none"/></svg>`;
const ICON_SCENE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>`;

export class EditorApp {
  private root: HTMLElement;
  private engine: PanoramaEngine | null = null;
  private stageEl: HTMLElement | null = null;
  private hotspotLayer: HTMLElement | null = null;
  private draggingHotspotId: string | null = null;
  private unsub: (() => void) | null = null;
  private overlayRaf = 0;
  private inspectorKey = '';
  private lastActiveId: string | null = null;
  /** Hide hotspots until panorama texture + camera view have settled */
  private hotspotsReady = false;
  /** Avoid resetting prompt input on every syncUi tick */
  private promptFocusKey = '';

  constructor(root: HTMLElement) {
    this.root = root;
  }

  start() {
    this.renderShell();
    this.unsub = store.subscribe(() => this.syncUi());
    this.bindGlobal();
    this.syncUi();
    this.ensureEngine();
    this.loopOverlays();
  }

  destroy() {
    this.unsub?.();
    cancelAnimationFrame(this.overlayRaf);
    this.engine?.dispose();
  }

  private renderShell() {
    this.root.innerHTML = `
      <div class="app-shell">
        <header class="header">
          <div class="logo-wrap" title="CLP">
            <img class="logo" src="/brand/clp-dark.png" alt="CLP" />
          </div>
          <div class="brand-text">Telecom360-next</div>
          <div class="spacer"></div>
          <button type="button" class="btn" id="btn-import">${t('openPackage')}</button>
          <button type="button" class="btn primary" id="btn-export">${t('exportZip')}</button>
          <input type="file" id="file-import" class="sr-file" accept=".zip,application/zip" tabindex="-1" />
          <input type="file" id="file-scenes" class="sr-file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" multiple tabindex="-1" />
        </header>
        <div class="main">
          <aside class="sidebar">
            <h2>${t('projectName')} *</h2>
            <div class="project-name-row">
              <input id="project-name" type="text" required placeholder="${t('projectNameHint')}" autocomplete="off" />
            </div>
            <div class="meta-fields">
              <label>${t('siteCode')} *
                <input id="f-site" type="text" required placeholder="e.g. FOS" autocomplete="off" />
              </label>
              <label>${t('roomName')} *
                <input id="f-room" type="text" required placeholder="e.g. Control_Room" autocomplete="off" />
              </label>
              <label>${t('photoDate')} *
                <input id="f-date" type="text" required placeholder="e.g. 20260423" autocomplete="off" />
              </label>
            </div>
            <h2>${t('scenes')}</h2>
            <ul class="scene-list" id="scene-list"></ul>
            <div class="add-files">
              <button type="button" class="btn ghost-dark btn-upload-cta" id="btn-add-scenes" style="width:100%">${t('addScenes')}</button>
            </div>
            <p class="hint" id="hint-empty-scenes">${t('noScenes')}</p>
            <p class="hint" id="hint-drag" hidden>拖曳 ⋮⋮ 可調整列表順序</p>
          </aside>
          <section class="stage-wrap">
            <div class="stage-toolbar">
              <button type="button" class="btn" id="btn-info">${t('addInfo')}</button>
              <button type="button" class="btn" id="btn-scene-hs">${t('addSceneLink')}</button>
              <button type="button" class="btn" id="btn-initial">${t('setInitialView')}</button>
              <span class="toolbar-hint" id="controls-hint">${t('controlsHint')}</span>
            </div>
            <div id="stage">
              <div class="stage-empty" id="stage-empty">${t('noScenes')}</div>
              <div class="hotspot-layer" id="hotspot-layer"></div>
            </div>
          </section>
          <aside class="inspector">
            <h2>${t('inspector')}</h2>
            <div id="inspector-body"><p class="hint">${t('noSelection')}</p></div>
          </aside>
        </div>
        <div class="toast" id="toast" hidden></div>
        <!-- One overlay for loading % AND success message (no browser native dialogs) -->
        <div class="busy" id="busy" hidden>
          <div class="busy-card">
            <div id="busy-mode-progress">
              <div id="busy-text" class="busy-text"></div>
              <div class="busy-bar-track"><div id="busy-bar" class="busy-bar"></div></div>
              <div id="busy-pct" class="busy-pct">0%</div>
            </div>
            <div id="busy-mode-result" class="busy-result" hidden>
              <div id="busy-result-title" class="msg-modal-title"></div>
              <div id="busy-result-body" class="msg-modal-body"></div>
              <div id="busy-result-link" class="msg-modal-link" tabindex="0"></div>
              <button type="button" class="btn primary msg-modal-ok" id="busy-result-ok">${t('ok')}</button>
            </div>
            <div id="busy-mode-prompt" class="busy-prompt" hidden>
              <div id="busy-prompt-title" class="msg-modal-title is-info"></div>
              <div id="busy-prompt-body" class="msg-modal-body"></div>
              <input type="text" id="busy-prompt-input" class="msg-modal-input" autocomplete="off" />
              <div class="msg-modal-actions">
                <button type="button" class="btn ghost-dark" id="busy-prompt-cancel">${t('cancel')}</button>
                <button type="button" class="btn primary" id="busy-prompt-ok">${t('ok')}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.stageEl = this.root.querySelector('#stage');
    this.hotspotLayer = this.root.querySelector('#hotspot-layer');

    this.root.querySelector('#busy-result-ok')!.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      store.clearResultDialog();
    });
    this.root.querySelector('#busy-prompt-cancel')!.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.promptFocusKey = '';
      store.clearPromptDialog();
    });
    this.root.querySelector('#busy-prompt-ok')!.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.commitPromptDialog();
    });
    this.root.querySelector('#busy-prompt-input')!.addEventListener('keydown', (ev) => {
      const ke = ev as KeyboardEvent;
      if (ke.key === 'Enter') {
        ke.preventDefault();
        this.commitPromptDialog();
      } else if (ke.key === 'Escape') {
        ke.preventDefault();
        this.promptFocusKey = '';
        store.clearPromptDialog();
      }
    });

    this.root.addEventListener('click', (ev) => {
      const tEl = (ev.target as HTMLElement).closest('button') as HTMLElement | null;
      if (!tEl || !this.root.contains(tEl)) return;
      const id = tEl.id;
      if (id === 'busy-result-ok' || id === 'busy-prompt-ok' || id === 'busy-prompt-cancel') return;
      if (id === 'btn-add-scenes') {
        ev.preventDefault();
        this.openFilePicker('#file-scenes');
        return;
      }
      if (id === 'btn-import') {
        ev.preventDefault();
        this.openFilePicker('#file-import');
        return;
      }
      if (id === 'btn-export') {
        ev.preventDefault();
        void this.onExport();
        return;
      }
      if (id === 'btn-info') {
        ev.preventDefault();
        this.addInfoHotspot();
        return;
      }
      if (id === 'btn-scene-hs') {
        ev.preventDefault();
        this.addSceneHotspot();
        return;
      }
      if (id === 'btn-initial') {
        ev.preventDefault();
        this.setInitialView();
        return;
      }
    });

    this.root.querySelector('#file-scenes')!.addEventListener('change', (e) => this.onAddFiles(e));
    this.root.querySelector('#file-import')!.addEventListener('change', (e) => this.onImport(e));

    const site = this.root.querySelector('#f-site') as HTMLInputElement;
    const room = this.root.querySelector('#f-room') as HTMLInputElement;
    const date = this.root.querySelector('#f-date') as HTMLInputElement;
    const pname = this.root.querySelector('#project-name') as HTMLInputElement;
    site.addEventListener('input', () => store.setDeploy({ siteCode: site.value }));
    room.addEventListener('input', () => store.setDeploy({ roomName: room.value }));
    date.addEventListener('input', () => store.setDeploy({ photoDate: date.value }));
    pname.addEventListener('input', () => store.setProjectName(pname.value));
  }

  private bindGlobal() {
    // Suppress leave warning while deploy/export busy or result overlay open
    // (native beforeunload dialog looks like a "browser message box" and confuses users)
    window.addEventListener('beforeunload', (e) => {
      if (store.ui.busyMessage) return;
      const busy = this.root.querySelector('#busy');
      if (busy && !busy.hasAttribute('hidden')) return;
      if (!store.project.scenes.length) return;
      e.preventDefault();
      e.returnValue = t('leaveWarn');
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      const files = [...(e.dataTransfer?.files || [])].filter(
        (f) => /image\/(jpeg|png)/.test(f.type) || /\.jpe?g$/i.test(f.name)
      );
      if (files.length) await this.ingestFiles(files);
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.draggingHotspotId || !this.engine) return;
      const hit = this.engine.pickSpherical(e.clientX, e.clientY);
      if (hit) store.updateHotspot(this.draggingHotspotId, { yaw: hit.yaw, pitch: hit.pitch }, { silent: true });
    });
    window.addEventListener('pointerup', () => {
      this.draggingHotspotId = null;
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (store.ui.resultDialog) {
          e.preventDefault();
          store.clearResultDialog();
        }
      }
    });
  }

  private ensureEngine() {
    if (!this.stageEl || this.engine) return;
    try {
      this.engine = new PanoramaEngine(this.stageEl, store.project.settings);
      this.engine.setParallaxEnabled(true);
      store.setParallaxEnabled(true);
      this.engine.setCallbacks({
        onClickSphere: () => {
          /* navigate / edit via hotspots only */
        },
      });
      if (this.hotspotLayer) this.stageEl.appendChild(this.hotspotLayer);
    } catch (err) {
      console.error(err);
      store.setToast(`${t('webglError')}: ${(err as Error).message || err}`);
    }
  }

  private clearHotspotLayer() {
    this.hotspotsReady = false;
    if (this.hotspotLayer) this.hotspotLayer.innerHTML = '';
  }

  private commitPromptDialog() {
    const prompt = store.ui.promptDialog;
    if (!prompt) return;
    const inputEl = this.root.querySelector('#busy-prompt-input') as HTMLInputElement | null;
    const showInput = prompt.showInput !== false;
    this.promptFocusKey = '';
    store.clearPromptDialog();

    if (prompt.context.type === 'rename-scene') {
      const name = (inputEl?.value ?? prompt.value ?? '').trim();
      if (!name) return;
      store.renameScene(prompt.context.sceneId, name);
      return;
    }
    if (prompt.context.type === 'delete-scene') {
      store.removeScene(prompt.context.sceneId);
      this.inspectorKey = '';
      return;
    }
    if (prompt.context.type === 'delete-hotspot') {
      store.removeHotspot(prompt.context.hotspotId);
      this.inspectorKey = '';
    }
  }

  private async loadActiveScene(transition: boolean) {
    const scene = store.activeScene;
    if (!scene || !this.engine) return;
    // Hide icons immediately — show only after image + view are ready
    this.clearHotspotLayer();
    this.engine.setSettings(store.project.settings);
    this.engine.setParallaxEnabled(store.ui.parallaxEnabled);
    try {
      if (transition) {
        await this.engine.transitionToUrl(scene.source.url, 550);
      } else {
        await this.engine.loadTextureFromUrl(scene.source.url);
      }
      // Image ready → apply initial view → then allow icons
      await this.engine.settleView(scene.initialView);
      if (store.activeScene?.id === scene.id) {
        this.hotspotsReady = true;
        this.drawHotspots();
      }
    } catch (err) {
      console.error(err);
      store.setToast(String((err as Error).message || err));
      this.hotspotsReady = true;
    }
  }

  private syncUi() {
    const p = store.project;
    const ui = store.ui;
    const setIfBlurred = (sel: string, val: string) => {
      const el = this.root.querySelector(sel) as HTMLInputElement;
      if (document.activeElement !== el) el.value = val;
    };
    setIfBlurred('#project-name', p.name);
    setIfBlurred('#f-site', p.deploy.siteCode);
    setIfBlurred('#f-room', p.deploy.roomName);
    setIfBlurred('#f-date', p.deploy.photoDate);

    // 3D always on (no toggle) — keep engine in sync
    if (!ui.parallaxEnabled) store.setParallaxEnabled(true);

    const empty = this.root.querySelector('#stage-empty') as HTMLElement | null;
    if (empty) empty.hidden = p.scenes.length > 0;
    // Sidebar empty-state hints: only when no scenes
    const hintEmpty = this.root.querySelector('#hint-empty-scenes') as HTMLElement | null;
    const hintDrag = this.root.querySelector('#hint-drag') as HTMLElement | null;
    if (hintEmpty) hintEmpty.hidden = p.scenes.length > 0;
    if (hintDrag) hintDrag.hidden = p.scenes.length === 0;
    // Pulse upload CTA when project has no panoramas yet
    const uploadBtn = this.root.querySelector('#btn-add-scenes') as HTMLButtonElement | null;
    if (uploadBtn) {
      const empty = p.scenes.length === 0;
      uploadBtn.classList.toggle('is-cta-pulse', empty);
      uploadBtn.classList.toggle('btn-upload-cta', true);
      // Keep accessible hint for empty project
      uploadBtn.title = empty ? '按此開始：上傳全景圖片' : '';
    }

    const list = this.root.querySelector('#scene-list')!;
    list.innerHTML = p.scenes
      .map(
        (s) => `
      <li class="scene-item ${s.id === ui.activeSceneId ? 'active' : ''}" data-id="${s.id}" draggable="true">
        <div class="scene-drag" title="拖曳排序">⋮⋮</div>
        <div class="scene-body">
          <div class="name" title="${escapeAttr(s.name)}">${escapeHtml(s.name)}</div>
          <div class="meta">${s.source.width || '?'}×${s.source.height || '?'} · ${s.hotspots.length} 標註</div>
        </div>
        <div class="row-actions">
          <button type="button" data-act="rename" data-id="${s.id}" title="${t('rename')}">${t('rename')}</button>
          <button type="button" data-act="del" data-id="${s.id}" title="${t('delete')}">${t('delete')}</button>
        </div>
      </li>`
      )
      .join('');

    list.querySelectorAll('.scene-item').forEach((el) => {
      const id = (el as HTMLElement).dataset.id!;
      el.addEventListener('click', (ev) => {
        const target = ev.target as HTMLElement;
        const act = target.dataset.act || (target.closest('[data-act]') as HTMLElement | null)?.dataset.act;
        if (act === 'del') {
          ev.stopPropagation();
          const sceneName = store.project.scenes.find((s) => s.id === id)?.name || '';
          store.showPromptDialog({
            title: t('deleteSceneTitle'),
            body: sceneName
              ? `${t('confirmDeleteScene')}\n\n全景：${sceneName}`
              : t('confirmDeleteScene'),
            showInput: false,
            danger: true,
            okLabel: t('deleteConfirm'),
            context: { type: 'delete-scene', sceneId: id },
          });
          return;
        }
        if (act === 'rename') {
          ev.stopPropagation();
          const current = store.project.scenes.find((s) => s.id === id)?.name || '';
          store.showPromptDialog({
            title: t('renameSceneTitle'),
            body: t('renameSceneBody'),
            value: current,
            placeholder: current || t('rename'),
            showInput: true,
            context: { type: 'rename-scene', sceneId: id },
          });
          return;
        }
        if (id !== store.ui.activeSceneId) store.selectScene(id);
      });
      el.addEventListener('dragstart', (ev) => {
        (ev as DragEvent).dataTransfer?.setData('text/plain', id);
        (el as HTMLElement).classList.add('dragging');
      });
      el.addEventListener('dragend', () => (el as HTMLElement).classList.remove('dragging'));
      el.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        (el as HTMLElement).classList.add('drag-over');
      });
      el.addEventListener('dragleave', () => (el as HTMLElement).classList.remove('drag-over'));
      el.addEventListener('drop', (ev) => {
        ev.preventDefault();
        (el as HTMLElement).classList.remove('drag-over');
        const fromId = (ev as DragEvent).dataTransfer?.getData('text/plain');
        if (!fromId || fromId === id) return;
        const from = store.project.scenes.findIndex((s) => s.id === fromId);
        const to = store.project.scenes.findIndex((s) => s.id === id);
        store.moveScene(from, to);
      });
    });

    // Corner toast retired — all notices use center modal (#busy result mode)
    const toast = this.root.querySelector('#toast') as HTMLElement | null;
    if (toast) toast.hidden = true;

    const busy = this.root.querySelector('#busy') as HTMLElement;
    const bar = this.root.querySelector('#busy-bar') as HTMLElement;
    const pctEl = this.root.querySelector('#busy-pct') as HTMLElement;
    const modeProgress = this.root.querySelector('#busy-mode-progress') as HTMLElement | null;
    const modeResult = this.root.querySelector('#busy-mode-result') as HTMLElement | null;
    const modePrompt = this.root.querySelector('#busy-mode-prompt') as HTMLElement | null;
    const result = ui.resultDialog;
    const prompt = ui.promptDialog;

    if (ui.busyMessage) {
      // Progress mode
      busy.hidden = false;
      busy.classList.add('is-on');
      if (modeProgress) modeProgress.hidden = false;
      if (modeResult) modeResult.hidden = true;
      if (modePrompt) modePrompt.hidden = true;
      const pct = ui.busyPercent ?? 0;
      // Keep % on the progress bar label only when message has no multi-line detail
      const base = ui.busyMessage || '';
      const label =
        ui.busyPercent != null && !base.includes('\n')
          ? `${base} · ${pct}%`
          : ui.busyPercent != null
            ? `${base.split('\n')[0]} · ${pct}%${base.includes('\n') ? '\n' + base.split('\n').slice(1).join('\n') : ''}`
            : base;
      (this.root.querySelector('#busy-text') as HTMLElement).textContent = label;
      bar.style.width = `${pct}%`;
      pctEl.textContent = ui.busyPercent != null ? `${pct}%` : '';
      pctEl.hidden = ui.busyPercent == null;
    } else if (prompt) {
      // In-app prompt / confirm — same overlay style as message box
      busy.hidden = false;
      busy.classList.add('is-on');
      if (modeProgress) modeProgress.hidden = true;
      if (modeResult) modeResult.hidden = true;
      if (modePrompt) modePrompt.hidden = false;
      const titleEl = this.root.querySelector('#busy-prompt-title') as HTMLElement;
      const bodyEl = this.root.querySelector('#busy-prompt-body') as HTMLElement;
      const inputEl = this.root.querySelector('#busy-prompt-input') as HTMLInputElement;
      const okBtn = this.root.querySelector('#busy-prompt-ok') as HTMLButtonElement;
      const cancelBtn = this.root.querySelector('#busy-prompt-cancel') as HTMLButtonElement;
      const showInput = prompt.showInput !== false;
      if (titleEl) {
        titleEl.textContent = prompt.title;
        titleEl.classList.remove('is-error', 'is-success', 'is-info');
        titleEl.classList.add(prompt.danger ? 'is-error' : 'is-info');
      }
      if (bodyEl) {
        bodyEl.textContent = prompt.body || '';
        bodyEl.hidden = !prompt.body;
      }
      inputEl.hidden = !showInput;
      if (okBtn) {
        okBtn.textContent = prompt.okLabel || t('ok');
        okBtn.classList.toggle('danger', !!prompt.danger);
      }
      if (cancelBtn) cancelBtn.textContent = prompt.cancelLabel || t('cancel');
      const ctxKey =
        prompt.context.type === 'rename-scene' || prompt.context.type === 'delete-scene'
          ? prompt.context.sceneId
          : prompt.context.hotspotId;
      const key = `${prompt.context.type}:${ctxKey}:${prompt.title}`;
      if (this.promptFocusKey !== key) {
        this.promptFocusKey = key;
        if (showInput) {
          inputEl.value = prompt.value || '';
          inputEl.placeholder = prompt.placeholder || '';
          requestAnimationFrame(() => {
            inputEl.focus();
            inputEl.select();
          });
        } else {
          requestAnimationFrame(() => okBtn?.focus());
        }
      }
    } else if (result) {
      // Center modal (success / error / info) — must press 確定
      this.promptFocusKey = '';
      busy.hidden = false;
      busy.classList.add('is-on');
      if (modeProgress) modeProgress.hidden = true;
      if (modeResult) modeResult.hidden = false;
      if (modePrompt) modePrompt.hidden = true;
      const titleEl = this.root.querySelector('#busy-result-title') as HTMLElement;
      const bodyEl = this.root.querySelector('#busy-result-body') as HTMLElement;
      const linkEl = this.root.querySelector('#busy-result-link') as HTMLElement;
      if (titleEl) {
        titleEl.textContent = result.title;
        titleEl.classList.remove('is-error', 'is-success', 'is-info');
        titleEl.classList.add(
          result.variant === 'error'
            ? 'is-error'
            : result.variant === 'success'
              ? 'is-success'
              : 'is-info'
        );
      }
      if (bodyEl) bodyEl.textContent = result.body;
      if (linkEl) {
        const link = (result.link || '').trim();
        if (link) {
          linkEl.hidden = false;
          linkEl.textContent = link;
          linkEl.title = '點擊複製連結';
          linkEl.onclick = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const original = link;
            void navigator.clipboard?.writeText(original).then(
              () => {
                linkEl.textContent = '已複製連結 ✓';
                window.setTimeout(() => {
                  if (store.ui.resultDialog?.link === original) {
                    linkEl.textContent = original;
                  }
                }, 1600);
              },
              () => {
                /* ignore */
              }
            );
          };
        } else {
          linkEl.hidden = true;
          linkEl.textContent = '';
          linkEl.onclick = null;
        }
      }
    } else {
      this.promptFocusKey = '';
      busy.hidden = true;
      busy.classList.remove('is-on');
      bar.style.width = '0%';
      if (modeProgress) modeProgress.hidden = false;
      if (modeResult) modeResult.hidden = true;
      if (modePrompt) modePrompt.hidden = true;
    }

    this.renderInspector();
    this.engine?.setParallaxEnabled(ui.parallaxEnabled);

    if (ui.activeSceneId !== this.lastActiveId) {
      const useTransition = this.lastActiveId != null && ui.activeSceneId != null;
      this.lastActiveId = ui.activeSceneId;
      if (!ui.activeSceneId) {
        this.engine?.clearTexture();
        this.clearHotspotLayer();
      } else {
        // Clear icons before async load so they never lead the new panorama
        this.clearHotspotLayer();
        void this.loadActiveScene(useTransition);
      }
    }
  }

  private renderInspector() {
    const body = this.root.querySelector('#inspector-body') as HTMLElement;
    const scene = store.activeScene;
    const hs = scene?.hotspots.find((h) => h.id === store.ui.selectedHotspotId);
    // Include scene names so target dropdown refreshes after rename
    const namesSig = store.project.scenes.map((s) => `${s.id}=${s.name}`).join('|');
    const key = `${store.ui.activeSceneId}|${store.ui.selectedHotspotId}|${namesSig}`;
    if (key === this.inspectorKey && body.childElementCount > 0) {
      // Live-refresh target dropdown labels without remounting (keeps selection / focus)
      this.refreshTargetDropdownLabels();
      return;
    }
    this.inspectorKey = key;

    if (!scene) {
      body.innerHTML = `<p class="hint">${t('noScenes')}</p>`;
      this.engine?.clearTexture();
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
        void this.goToScene(hs as SceneHotspot);
      });
    }
    body.querySelector('#hs-del')!.addEventListener('click', () => {
      // Match 刪除全景 style: confirm text + named item line
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

  /** Update「選擇目標場景」option text when scenes are renamed (without full remount). */
  private refreshTargetDropdownLabels() {
    const sel = this.root.querySelector('#hs-target') as HTMLSelectElement | null;
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

  private loopOverlays = () => {
    this.overlayRaf = requestAnimationFrame(this.loopOverlays);
    this.drawHotspots();
  };

  private drawHotspots() {
    if (!this.engine || !this.hotspotLayer) return;
    const scene = store.activeScene;
    if (!scene || !this.hotspotsReady) {
      if (!this.hotspotsReady && this.hotspotLayer.childElementCount) {
        this.hotspotLayer.innerHTML = '';
      }
      if (!scene) this.hotspotLayer.innerHTML = '';
      return;
    }
    const existing = new Map(
      [...this.hotspotLayer.querySelectorAll('.hotspot-pin')].map((el) => [
        (el as HTMLElement).dataset.id!,
        el as HTMLElement,
      ])
    );
    const keep = new Set<string>();
    for (const h of scene.hotspots) {
      keep.add(h.id);
      let el = existing.get(h.id);
      if (!el) {
        el = document.createElement('div');
        el.className = `hotspot-pin ${h.type}`;
        el.dataset.id = h.id;
        el.innerHTML = `<div class="glyph">${h.type === 'info' ? ICON_INFO : ICON_SCENE}</div><div class="pin-label"></div>`;
        el.addEventListener('pointerdown', (ev) => {
          ev.stopPropagation();
          this.draggingHotspotId = h.id;
          this.inspectorKey = '';
          store.selectHotspot(h.id);
          (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
        });
        el.addEventListener('pointerup', (ev) => {
          ev.stopPropagation();
          this.draggingHotspotId = null;
        });
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.inspectorKey = '';
          store.selectHotspot(h.id);
        });
        this.hotspotLayer.appendChild(el);
      }
      el.classList.toggle('selected', store.ui.selectedHotspotId === h.id);
      el.classList.toggle('info', h.type === 'info');
      el.classList.toggle('scene', h.type === 'scene');
      const labelEl = el.querySelector('.pin-label') as HTMLElement | null;
      if (labelEl) {
        if (h.type === 'info') {
          const t0 = (h.title || '').trim();
          labelEl.textContent = t0;
          labelEl.hidden = !t0;
        } else {
          const tgt = store.project.scenes.find((s) => s.id === h.targetSceneId);
          labelEl.textContent = tgt ? `→ ${tgt.name}` : '場景';
          labelEl.hidden = false;
        }
      }
      const scr = this.engine.projectToScreen(h.yaw, h.pitch);
      el.style.left = `${scr.x}px`;
      el.style.top = `${scr.y}px`;
      el.style.display = scr.visible ? 'block' : 'none';
    }
    for (const [id, el] of existing) {
      if (!keep.has(id)) el.remove();
    }
  }

  private async goToScene(h: SceneHotspot) {
    if (!h.targetSceneId || !this.engine) return;
    // Hide old icons immediately (before zoom / fade) for cleaner UX
    this.clearHotspotLayer();
    await this.engine.aimAndZoomIn(h.yaw, h.pitch, 380);
    const canvas = this.engine.renderer.domElement;
    canvas.style.transition = 'opacity 0.35s ease';
    canvas.style.opacity = '0';
    await new Promise((r) => setTimeout(r, 350));
    store.selectScene(h.targetSceneId);
    // loadActiveScene will re-enable icons after new image settles
    await new Promise((r) => setTimeout(r, 80));
    canvas.style.opacity = '1';
  }

  private openFilePicker(selector: string) {
    const input = this.root.querySelector(selector) as HTMLInputElement | null;
    if (!input) {
      store.setToast('找不到檔案選擇器');
      return;
    }
    const anyInput = input as HTMLInputElement & { showPicker?: () => void };
    try {
      if (typeof anyInput.showPicker === 'function') anyInput.showPicker();
      else input.click();
    } catch {
      input.click();
    }
  }

  private requireActiveScene(): boolean {
    if (!this.engine) {
      store.setToast(t('webglError'));
      return false;
    }
    if (!store.activeScene) {
      store.setToast('請先「上傳全景圖片」');
      return false;
    }
    return true;
  }

  /** Current scene label for toast / dialog (name + file if available). */
  private activeSceneLabel(): string {
    const s = store.activeScene;
    if (!s) return '';
    const file = s.source.fileName?.trim();
    if (file && file !== s.name) return `${s.name}（${file}）`;
    return s.name || file || s.id;
  }

  private addInfoHotspot() {
    if (!this.requireActiveScene() || !this.engine) return;
    const v = this.engine.getView();
    const sceneName = this.activeSceneLabel();
    const hs: InfoHotspot = {
      id: uid('hs'),
      type: 'info',
      yaw: v.yaw,
      pitch: v.pitch,
      title: '',
      text: '',
    };
    store.addHotspot(hs);
    store.showResultDialog({
      title: t('addInfo'),
      body: `圖片：${sceneName}\n\n已新增注解標示（可拖曳位置）。`,
      variant: 'success',
    });
  }

  private addSceneHotspot() {
    if (!this.requireActiveScene() || !this.engine) return;
    const v = this.engine.getView();
    const sceneName = this.activeSceneLabel();
    const other = store.project.scenes.find((s) => s.id !== store.ui.activeSceneId);
    if (!other) {
      store.showError(t('addSceneLink'), `圖片：${sceneName}\n\n需要至少兩個全景才能建立場景連結。`);
      return;
    }
    const hs: SceneHotspot = {
      id: uid('hs'),
      type: 'scene',
      yaw: v.yaw,
      pitch: v.pitch,
      targetSceneId: other.id,
      rotation: 0,
      transition: 'fly',
    };
    store.addHotspot(hs);
    store.showResultDialog({
      title: t('addSceneLink'),
      body: `圖片：${sceneName}\n\n已新增場景連結（右側可改目標／前往）。\n預設目標：${other.name}`,
      variant: 'success',
    });
  }

  private setInitialView() {
    if (!this.requireActiveScene() || !this.engine) return;
    const sceneName = this.activeSceneLabel();
    store.updateActiveInitialView(this.engine.getView());
    store.showResultDialog({
      title: t('setInitialView'),
      body: `圖片：${sceneName}\n\n${t('initialViewSet')}。`,
      variant: 'success',
    });
  }

  private requireProjectName(): boolean {
    if (!projectNameComplete(store.project.name)) {
      store.showError(t('projectName'), t('projectNameRequired'));
      const el = this.root.querySelector('#project-name') as HTMLInputElement | null;
      el?.focus();
      return false;
    }
    return true;
  }

  private requireDeployFields(): boolean {
    if (!this.requireProjectName()) return false;
    if (!deployFieldsComplete(store.project.deploy)) {
      store.setToast(t('deployNeedFields'));
      return false;
    }
    return true;
  }

  private async onAddFiles(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = [...(input.files || [])];
    input.value = '';
    await this.ingestFiles(files);
  }

  private async ingestFiles(files: File[]) {
    const total = files.length;
    if (!total) return;
    let done = 0;
    const progressLabel = (remaining: number, currentName?: string) => {
      const head = `${t('uploading')}：共 ${total} 張 · 已完成 ${done} 張 · 剩餘 ${remaining} 張`;
      return currentName ? `${head}\n${currentName}` : head;
    };
    store.setBusy(progressLabel(total), 0);
    try {
      for (const f of files) {
        const remaining = total - done;
        store.setBusy(progressLabel(remaining, f.name), Math.round((done / total) * 100));
        const { scene } = await ingestEquirectFile(f);
        store.addScene(scene);
        done += 1;
        store.setBusy(progressLabel(total - done), Math.round((done / total) * 100));
      }
      store.showResultDialog({
        title: t('uploadScenesDone'),
        body: total === 1 ? '已成功加入 1 張全景圖片。' : `已成功加入 ${total} 張全景圖片。`,
        variant: 'success',
      });
    } catch (err) {
      store.showError(
        '上傳失敗',
        `共 ${total} 張 · 已完成 ${done} 張 · 剩餘 ${total - done} 張\n\n${String((err as Error).message || err)}`
      );
    } finally {
      store.setBusy(null);
    }
  }

  private async onExport() {
    if (!store.project.scenes.length) {
      store.setToast(t('deployNeedScenes'));
      return;
    }
    if (!this.requireDeployFields()) return;
    store.setBusy(t('exporting'), 0);
    try {
      const blob = await buildProjectZip(store.project, (p, label) => {
        store.setBusy(label ? `${t('exporting')}（${label}）` : t('exporting'), p);
      });
      store.setBusy(t('exporting'), 100);
      const fileName = suggestZipName(store.project);
      const d = store.project.deploy;
      const pathHint = `site/${encodeURIComponent(d.siteCode.trim())}/${encodeURIComponent(d.roomName.trim())}/${encodeURIComponent(d.photoDate.trim())}/`;
      // Prefer current browser host (IP or hostname) so the link is ready to copy
      const hostBase =
        typeof location !== 'undefined' && location.origin
          ? location.origin.replace(/\/$/, '')
          : `http://${typeof location !== 'undefined' ? location.hostname || '127.0.0.1' : '127.0.0.1'}`;
      const fullUrl = `${hostBase}/${pathHint}`;
      downloadBlob(blob, fileName);
      store.showResultDialog({
        title: t('exportDone'),
        body:
          `檔案名稱：${fileName}\n\n` +
          `請將 ZIP 解壓（或把內容複製）到網站根目錄，例如：\n` +
          `C:\\inetpub\\wwwroot\n\n` +
          `然後用瀏覽器開啟（點擊下方連結可複製）：`,
        link: fullUrl,
        variant: 'success',
      });
    } catch (err) {
      console.error(err);
      store.showError(t('exportFail'), (err as Error).message || t('exportFail'));
    } finally {
      store.setBusy(null);
    }
  }

  private async onImport(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    store.setBusy(t('importing'), 0);
    try {
      const doc = await importProjectZip(file, (p, label) => {
        store.setBusy(label ? `${t('importing')}（${label}）` : t('importing'), p);
      });
      store.setProject(doc);
      this.lastActiveId = null;
      store.setBusy(t('importing'), 100);
      store.setToast(t('importDone'));
    } catch (err) {
      console.error(err);
      store.setToast(`${t('importFail')}: ${(err as Error).message}`);
    } finally {
      store.setBusy(null);
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/`/g, '&#96;');
}
