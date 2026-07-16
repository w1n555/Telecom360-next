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
          <div class="brand-text">Telecom360</div>
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
            <p class="field-label-hint" id="controls-hint">${t('controlsHint')}</p>
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
              <button type="button" class="btn ghost-dark" id="btn-add-scenes" style="width:100%">${t('addScenes')}</button>
            </div>
            <p class="hint" id="hint-empty-scenes">${t('noScenes')}</p>
            <p class="hint" id="hint-drag" hidden>拖曳 ⋮⋮ 可調整列表順序</p>
          </aside>
          <section class="stage-wrap">
            <div class="stage-toolbar">
              <button type="button" class="btn" id="btn-info">${t('addInfo')}</button>
              <button type="button" class="btn" id="btn-scene-hs">${t('addSceneLink')}</button>
              <button type="button" class="btn" id="btn-initial">${t('setInitialView')}</button>
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
              <button type="button" class="btn primary msg-modal-ok" id="busy-result-ok">確定</button>
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

    this.root.addEventListener('click', (ev) => {
      const tEl = (ev.target as HTMLElement).closest('button') as HTMLElement | null;
      if (!tEl || !this.root.contains(tEl)) return;
      const id = tEl.id;
      if (id === 'busy-result-ok') return;
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

  private async loadActiveScene(transition: boolean) {
    const scene = store.activeScene;
    if (!scene || !this.engine) return;
    this.engine.setSettings(store.project.settings);
    this.engine.setParallaxEnabled(store.ui.parallaxEnabled);
    try {
      if (transition) {
        await this.engine.transitionToUrl(scene.source.url, 550);
      } else {
        await this.engine.loadTextureFromUrl(scene.source.url);
      }
      this.engine.setView(scene.initialView, true);
    } catch (err) {
      console.error(err);
      store.setToast(String((err as Error).message || err));
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
          if (confirm(t('confirmDeleteScene'))) store.removeScene(id);
          return;
        }
        if (act === 'rename') {
          ev.stopPropagation();
          const name = prompt(t('rename'), store.project.scenes.find((s) => s.id === id)?.name || '');
          if (name) store.renameScene(id, name);
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
    const result = ui.resultDialog;

    if (ui.busyMessage) {
      // Progress mode
      busy.hidden = false;
      busy.classList.add('is-on');
      if (modeProgress) modeProgress.hidden = false;
      if (modeResult) modeResult.hidden = true;
      const pct = ui.busyPercent ?? 0;
      const label =
        ui.busyPercent != null ? `${ui.busyMessage} · ${pct}%` : ui.busyMessage;
      (this.root.querySelector('#busy-text') as HTMLElement).textContent = label;
      bar.style.width = `${pct}%`;
      pctEl.textContent = ui.busyPercent != null ? `${pct}%` : '';
      pctEl.hidden = ui.busyPercent == null;
    } else if (result) {
      // Center modal (success / error / info) — must press 確定
      busy.hidden = false;
      busy.classList.add('is-on');
      if (modeProgress) modeProgress.hidden = true;
      if (modeResult) modeResult.hidden = false;
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
      busy.hidden = true;
      busy.classList.remove('is-on');
      bar.style.width = '0%';
      if (modeProgress) modeProgress.hidden = false;
      if (modeResult) modeResult.hidden = true;
    }

    this.renderInspector();
    this.engine?.setParallaxEnabled(ui.parallaxEnabled);

    if (ui.activeSceneId !== this.lastActiveId) {
      const useTransition = this.lastActiveId != null && ui.activeSceneId != null;
      this.lastActiveId = ui.activeSceneId;
      if (!ui.activeSceneId) {
        this.engine?.clearTexture();
        if (this.hotspotLayer) this.hotspotLayer.innerHTML = '';
      } else {
        void this.loadActiveScene(useTransition);
      }
    }
  }

  private renderInspector() {
    const body = this.root.querySelector('#inspector-body') as HTMLElement;
    const scene = store.activeScene;
    const hs = scene?.hotspots.find((h) => h.id === store.ui.selectedHotspotId);
    const key = `${store.ui.activeSceneId}|${store.ui.selectedHotspotId}`;
    if (key === this.inspectorKey && body.childElementCount > 0) return;
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
        <p class="hint">注解標示 · 可在預覽拖曳位置</p>
        <label>${t('title')}<input id="hs-title" value="${escapeAttr(hs.title)}" /></label>
        <label>${t('text')}<textarea id="hs-text">${escapeHtml(hs.text)}</textarea></label>
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
      if (confirm(t('confirmDeleteHotspot'))) {
        store.removeHotspot(hs.id);
        this.inspectorKey = '';
      }
    });
  }

  private loopOverlays = () => {
    this.overlayRaf = requestAnimationFrame(this.loopOverlays);
    this.drawHotspots();
  };

  private drawHotspots() {
    if (!this.engine || !this.hotspotLayer) return;
    const scene = store.activeScene;
    if (!scene) {
      this.hotspotLayer.innerHTML = '';
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
        if (h.type === 'info') labelEl.textContent = h.title || '注解';
        else {
          const tgt = store.project.scenes.find((s) => s.id === h.targetSceneId);
          labelEl.textContent = tgt ? `→ ${tgt.name}` : '場景';
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
    await this.engine.aimAndZoomIn(h.yaw, h.pitch, 380);
    const canvas = this.engine.renderer.domElement;
    canvas.style.transition = 'opacity 0.35s ease';
    canvas.style.opacity = '0';
    await new Promise((r) => setTimeout(r, 350));
    store.selectScene(h.targetSceneId);
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
      store.setToast('請先「新增全景圖片」');
      return false;
    }
    return true;
  }

  private addInfoHotspot() {
    if (!this.requireActiveScene() || !this.engine) return;
    const v = this.engine.getView();
    const hs: InfoHotspot = {
      id: uid('hs'),
      type: 'info',
      yaw: v.yaw,
      pitch: v.pitch,
      title: '標題',
      text: '內容',
    };
    store.addHotspot(hs);
    store.setToast('已新增注解標示（可拖曳位置）');
  }

  private addSceneHotspot() {
    if (!this.requireActiveScene() || !this.engine) return;
    const v = this.engine.getView();
    const other = store.project.scenes.find((s) => s.id !== store.ui.activeSceneId);
    if (!other) {
      store.setToast('需要至少兩個全景才能建立場景連結');
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
    store.setToast('已新增場景連結（右側可改目標／前往）');
  }

  private setInitialView() {
    if (!this.requireActiveScene() || !this.engine) return;
    store.updateActiveInitialView(this.engine.getView());
    store.setToast(t('initialViewSet'));
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
    store.setBusy(t('processing'));
    try {
      for (const f of files) {
        const { scene } = await ingestEquirectFile(f);
        store.addScene(scene);
      }
      const n = files.length;
      store.showResultDialog({
        title: t('uploadScenesDone'),
        body: n === 1 ? '已成功加入 1 張全景圖片。' : `已成功加入 ${n} 張全景圖片。`,
        variant: 'success',
      });
    } catch (err) {
      store.showError('上傳失敗', String((err as Error).message || err));
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
      const pathHint = `site/${d.siteCode.trim()}/${d.roomName.trim()}/${d.photoDate.trim()}/`;
      downloadBlob(blob, fileName);
      store.showResultDialog({
        title: t('exportDone'),
        body:
          `檔案名稱：${fileName}\n\n` +
          `請將 ZIP 解壓（或把內容複製）到網站根目錄，例如：\n` +
          `C:\\inetpub\\wwwroot\n\n` +
          `然後用瀏覽器開啟：\n` +
          `http://{主機}/${pathHint}`,
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
