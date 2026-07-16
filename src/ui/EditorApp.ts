import { store } from '../core/state/ProjectStore';
import { t } from '../core/i18n/zh-Hant';
import { PanoramaEngine } from '../panorama/PanoramaEngine';
import { ingestEquirectFile } from '../media/ImageIngest';
import { buildProjectZip, downloadBlob, suggestZipName } from '../project/ExportService';
import { importProjectZip } from '../project/ImportService';
import { deployProject } from '../project/DeployService';
import { uid } from '../utils/id';
import { greatCircleAngle } from '../utils/math';
import type { Hotspot, InfoHotspot, SceneHotspot } from '../core/types/project';

export class EditorApp {
  private root: HTMLElement;
  private engine: PanoramaEngine | null = null;
  private stageEl: HTMLElement | null = null;
  private hotspotLayer: HTMLElement | null = null;
  private measureLayer: SVGSVGElement | null = null;
  private draggingHotspotId: string | null = null;
  private unsub: (() => void) | null = null;
  private overlayRaf = 0;

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
          <img class="logo" src="/brand/clp-light.png" alt="CLP" />
          <div class="brand-text">Telecom360</div>
          <div class="spacer"></div>
          <div class="deploy-fields">
            <label>${t('siteCode')}<input id="f-site" placeholder="FOS" /></label>
            <label>${t('roomName')}<input id="f-room" placeholder="Main" /></label>
            <label>${t('photoDate')}<input id="f-date" placeholder="20260423" /></label>
          </div>
          <button class="btn" id="btn-import">${t('openPackage')}</button>
          <button class="btn" id="btn-export">${t('exportZip')}</button>
          <button class="btn primary" id="btn-deploy">${t('oneClickDeploy')}</button>
          <input type="file" id="file-import" accept=".zip,application/zip" hidden />
          <input type="file" id="file-scenes" accept="image/jpeg,image/png,.jpg,.jpeg,.png" multiple hidden />
        </header>
        <div class="main">
          <aside class="sidebar">
            <h2>${t('projectName')}</h2>
            <div class="project-name-row">
              <input id="project-name" />
            </div>
            <h2>${t('scenes')}</h2>
            <ul class="scene-list" id="scene-list"></ul>
            <div class="add-files">
              <button class="btn ghost-dark" id="btn-add-scenes" style="width:100%">${t('addScenes')}</button>
            </div>
            <p class="hint">${t('noScenes')}</p>
          </aside>
          <section class="stage-wrap">
            <div class="stage-toolbar">
              <button class="btn" id="btn-info">${t('addInfo')}</button>
              <button class="btn" id="btn-scene-hs">${t('addSceneLink')}</button>
              <button class="btn" id="btn-initial">${t('setInitialView')}</button>
              <button class="btn" id="btn-measure">${t('measure')}</button>
              <button class="btn" id="btn-parallax">${t('parallaxOff')}</button>
            </div>
            <div id="stage">
              <div class="hotspot-layer" id="hotspot-layer"></div>
              <div class="measure-layer"><svg id="measure-layer"></svg></div>
            </div>
            <div class="stage-footer" id="stage-footer">${t('controlsHint')}</div>
          </section>
          <aside class="inspector">
            <h2>${t('inspector')}</h2>
            <div id="inspector-body"><p class="hint">${t('noSelection')}</p></div>
          </aside>
        </div>
        <div class="toast" id="toast" hidden></div>
        <div class="busy" id="busy" hidden><div id="busy-text"></div></div>
      </div>
    `;

    this.stageEl = this.root.querySelector('#stage');
    this.hotspotLayer = this.root.querySelector('#hotspot-layer');
    this.measureLayer = this.root.querySelector('#measure-layer');

    this.root.querySelector('#btn-add-scenes')!.addEventListener('click', () => {
      (this.root.querySelector('#file-scenes') as HTMLInputElement).click();
    });
    this.root.querySelector('#file-scenes')!.addEventListener('change', (e) => this.onAddFiles(e));
    this.root.querySelector('#btn-import')!.addEventListener('click', () => {
      (this.root.querySelector('#file-import') as HTMLInputElement).click();
    });
    this.root.querySelector('#file-import')!.addEventListener('change', (e) => this.onImport(e));
    this.root.querySelector('#btn-export')!.addEventListener('click', () => this.onExport());
    this.root.querySelector('#btn-deploy')!.addEventListener('click', () => this.onDeploy());
    this.root.querySelector('#btn-info')!.addEventListener('click', () => this.addInfoHotspot());
    this.root.querySelector('#btn-scene-hs')!.addEventListener('click', () => this.addSceneHotspot());
    this.root.querySelector('#btn-initial')!.addEventListener('click', () => this.setInitialView());
    this.root.querySelector('#btn-measure')!.addEventListener('click', () => this.toggleMeasure());
    this.root.querySelector('#btn-parallax')!.addEventListener('click', () => this.toggleParallax());

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
    window.addEventListener('beforeunload', (e) => {
      if (store.project.scenes.length) {
        e.preventDefault();
        e.returnValue = t('leaveWarn');
      }
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      const files = [...(e.dataTransfer?.files || [])].filter((f) => /image\/(jpeg|png)/.test(f.type) || /\.jpe?g$/i.test(f.name));
      if (files.length) await this.ingestFiles(files);
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.draggingHotspotId || !this.engine) return;
      const hit = this.engine.pickSpherical(e.clientX, e.clientY);
      if (hit) store.updateHotspot(this.draggingHotspotId, { yaw: hit.yaw, pitch: hit.pitch });
    });
    window.addEventListener('pointerup', () => {
      this.draggingHotspotId = null;
    });
  }

  private ensureEngine() {
    if (!this.stageEl || this.engine) return;
    this.engine = new PanoramaEngine(this.stageEl, store.project.settings);
    this.engine.setCallbacks({
      onClickSphere: (yaw, pitch) => this.onSphereClick(yaw, pitch),
    });
    // keep hotspot layer on top of canvas
    if (this.hotspotLayer) this.stageEl.appendChild(this.hotspotLayer);
    const ml = this.stageEl.querySelector('.measure-layer');
    if (ml) this.stageEl.appendChild(ml);
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

  private lastActiveId: string | null = null;

  private syncUi() {
    const p = store.project;
    const ui = store.ui;
    (this.root.querySelector('#project-name') as HTMLInputElement).value = p.name;
    (this.root.querySelector('#f-site') as HTMLInputElement).value = p.deploy.siteCode;
    (this.root.querySelector('#f-room') as HTMLInputElement).value = p.deploy.roomName;
    (this.root.querySelector('#f-date') as HTMLInputElement).value = p.deploy.photoDate;

    const list = this.root.querySelector('#scene-list')!;
    list.innerHTML = p.scenes
      .map(
        (s) => `
      <li class="scene-item ${s.id === ui.activeSceneId ? 'active' : ''}" data-id="${s.id}">
        <div>
          <div class="name">${escapeHtml(s.name)}</div>
          <div class="meta">${s.source.width || '?'}×${s.source.height || '?'} · ${s.hotspots.length} 標註</div>
        </div>
        <div class="row-actions">
          <button data-act="rename" data-id="${s.id}">${t('rename')}</button>
          <button data-act="del" data-id="${s.id}">${t('delete')}</button>
        </div>
      </li>`
      )
      .join('');

    list.querySelectorAll('.scene-item').forEach((el) => {
      el.addEventListener('click', (ev) => {
        const target = ev.target as HTMLElement;
        const id = (el as HTMLElement).dataset.id!;
        if (target.dataset.act === 'del') {
          ev.stopPropagation();
          if (confirm(t('confirmDeleteScene'))) store.removeScene(id);
          return;
        }
        if (target.dataset.act === 'rename') {
          ev.stopPropagation();
          const name = prompt(t('rename'), store.project.scenes.find((s) => s.id === id)?.name || '');
          if (name) store.renameScene(id, name);
          return;
        }
        if (id !== store.ui.activeSceneId) {
          store.selectScene(id);
        }
      });
    });

    const paraBtn = this.root.querySelector('#btn-parallax') as HTMLButtonElement;
    paraBtn.textContent = ui.parallaxEnabled ? t('parallaxOn') : t('parallaxOff');
    paraBtn.classList.toggle('active', ui.parallaxEnabled);

    const measureBtn = this.root.querySelector('#btn-measure') as HTMLButtonElement;
    measureBtn.classList.toggle('active', ui.mode === 'measure');

    const toast = this.root.querySelector('#toast') as HTMLElement;
    if (ui.toast) {
      toast.hidden = false;
      toast.textContent = ui.toast;
    } else toast.hidden = true;

    const busy = this.root.querySelector('#busy') as HTMLElement;
    if (ui.busyMessage) {
      busy.hidden = false;
      (this.root.querySelector('#busy-text') as HTMLElement).textContent = ui.busyMessage;
    } else busy.hidden = true;

    this.renderInspector();
    this.engine?.setParallaxEnabled(ui.parallaxEnabled);

    if (ui.activeSceneId !== this.lastActiveId) {
      const useTransition = this.lastActiveId != null && ui.activeSceneId != null;
      this.lastActiveId = ui.activeSceneId;
      void this.loadActiveScene(useTransition);
    }
  }

  private renderInspector() {
    const body = this.root.querySelector('#inspector-body')!;
    const scene = store.activeScene;
    const hs = scene?.hotspots.find((h) => h.id === store.ui.selectedHotspotId);
    if (!scene) {
      body.innerHTML = `<p class="hint">${t('noScenes')}</p>`;
      return;
    }
    if (!hs) {
      const measures = scene.measurements
        .map((m) => {
          const ang = m.points.length >= 2 ? greatCircleAngle(m.points[0], m.points[1]) : 0;
          const label =
            m.scaleMetersPerUnit != null
              ? `${(ang * m.scaleMetersPerUnit).toFixed(2)} ${t('meters')}`
              : `${ang.toFixed(3)} ${t('relativeUnit')}`;
          return `<li><span>${escapeHtml(m.label)} · ${label}</span><button data-mid="${m.id}">${t('delete')}</button></li>`;
        })
        .join('');
      body.innerHTML = `
        <p class="hint">${t('noSelection')}</p>
        <h2 style="margin-top:16px">${t('measure')}</h2>
        <ul class="measure-list">${measures || `<li class="hint">${t('measurementHint')}</li>`}</ul>
      `;
      body.querySelectorAll('button[data-mid]').forEach((b) => {
        b.addEventListener('click', () => store.removeMeasurement((b as HTMLElement).dataset.mid!));
      });
      return;
    }

    if (hs.type === 'info') {
      body.innerHTML = `
        <label>${t('title')}<input id="hs-title" value="${escapeAttr(hs.title)}" /></label>
        <label>${t('text')}<textarea id="hs-text">${escapeHtml(hs.text)}</textarea></label>
        <div style="margin-top:12px;display:flex;gap:8px">
          <button class="btn ghost-dark" id="hs-del">${t('delete')}</button>
        </div>
      `;
      body.querySelector('#hs-title')!.addEventListener('input', (e) => {
        store.updateHotspot(hs.id, { title: (e.target as HTMLInputElement).value });
      });
      body.querySelector('#hs-text')!.addEventListener('input', (e) => {
        store.updateHotspot(hs.id, { text: (e.target as HTMLTextAreaElement).value });
      });
    } else {
      const options = store.project.scenes
        .filter((s) => s.id !== scene.id)
        .map((s) => `<option value="${s.id}" ${s.id === hs.targetSceneId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
        .join('');
      body.innerHTML = `
        <label>${t('selectTarget')}
          <select id="hs-target">
            <option value="">${t('emptyTarget')}</option>
            ${options}
          </select>
        </label>
        <div style="margin-top:12px;display:flex;gap:8px">
          <button class="btn ghost-dark" id="hs-del">${t('delete')}</button>
        </div>
      `;
      body.querySelector('#hs-target')!.addEventListener('change', (e) => {
        store.updateHotspot(hs.id, { targetSceneId: (e.target as HTMLSelectElement).value });
      });
    }
    body.querySelector('#hs-del')!.addEventListener('click', () => {
      if (confirm(t('confirmDeleteHotspot'))) store.removeHotspot(hs.id);
    });
  }

  private loopOverlays = () => {
    this.overlayRaf = requestAnimationFrame(this.loopOverlays);
    this.drawHotspots();
    this.drawMeasures();
  };

  private drawHotspots() {
    if (!this.engine || !this.hotspotLayer) return;
    const scene = store.activeScene;
    if (!scene) {
      this.hotspotLayer.innerHTML = '';
      return;
    }
    const existing = new Map(
      [...this.hotspotLayer.querySelectorAll('.hotspot-pin')].map((el) => [(el as HTMLElement).dataset.id!, el as HTMLElement])
    );
    const keep = new Set<string>();
    for (const h of scene.hotspots) {
      keep.add(h.id);
      let el = existing.get(h.id);
      if (!el) {
        el = document.createElement('div');
        el.className = `hotspot-pin ${h.type}`;
        el.dataset.id = h.id;
        el.innerHTML = `<div class="glyph"></div>`;
        el.addEventListener('pointerdown', (ev) => {
          ev.stopPropagation();
          this.draggingHotspotId = h.id;
          store.selectHotspot(h.id);
          (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
        });
        el.addEventListener('pointerup', (ev) => {
          ev.stopPropagation();
          if (this.draggingHotspotId === h.id && h.type === 'scene' && !store.ui.selectedHotspotId) {
            /* ignore */
          }
          // double purpose: click scene hotspot to navigate when not measuring
          if (h.type === 'scene' && store.ui.mode === 'navigate' && this.draggingHotspotId === h.id) {
            const moved = false;
            if (!moved && h.targetSceneId) {
              // small delay distinction: if pointer barely moved — navigate
            }
          }
          this.draggingHotspotId = null;
        });
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          store.selectHotspot(h.id);
          if (h.type === 'scene' && h.targetSceneId && store.ui.mode === 'navigate') {
            void this.goToScene(h as SceneHotspot);
          }
        });
        this.hotspotLayer.appendChild(el);
      }
      el.classList.toggle('selected', store.ui.selectedHotspotId === h.id);
      el.classList.toggle('info', h.type === 'info');
      el.classList.toggle('scene', h.type === 'scene');
      const scr = this.engine.projectToScreen(h.yaw, h.pitch);
      el.style.left = `${scr.x}px`;
      el.style.top = `${scr.y}px`;
      el.style.display = scr.visible ? 'block' : 'none';
    }
    for (const [id, el] of existing) {
      if (!keep.has(id)) el.remove();
    }

    if (this.draggingHotspotId && this.engine) {
      // position updated on pointer move via window
    }
  }

  private drawMeasures() {
    if (!this.engine || !this.measureLayer) return;
    const scene = store.activeScene;
    const parts: string[] = [];
    if (scene) {
      for (const m of scene.measurements) {
        if (m.points.length < 2) continue;
        const a = this.engine.projectToScreen(m.points[0].yaw, m.points[0].pitch);
        const b = this.engine.projectToScreen(m.points[1].yaw, m.points[1].pitch);
        if (!a.visible && !b.visible) continue;
        const ang = greatCircleAngle(m.points[0], m.points[1]);
        const label =
          m.scaleMetersPerUnit != null
            ? `${(ang * m.scaleMetersPerUnit).toFixed(2)} m`
            : `${ang.toFixed(3)}`;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        parts.push(
          `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#00a1e0" stroke-width="2" />`,
          `<circle cx="${a.x}" cy="${a.y}" r="4" fill="#fff" />`,
          `<circle cx="${b.x}" cy="${b.y}" r="4" fill="#fff" />`,
          `<text x="${mx}" y="${my - 8}" fill="#fff" font-size="12" text-anchor="middle">${escapeHtml(label)}</text>`
        );
      }
      if (store.ui.measureDraft) {
        const d = this.engine.projectToScreen(store.ui.measureDraft.yaw, store.ui.measureDraft.pitch);
        parts.push(`<circle cx="${d.x}" cy="${d.y}" r="5" fill="#f59e0b" />`);
      }
    }
    this.measureLayer.innerHTML = parts.join('');
  }

  private onSphereClick(yaw: number, pitch: number) {
    if (this.draggingHotspotId) {
      store.updateHotspot(this.draggingHotspotId, { yaw, pitch });
      return;
    }
    if (store.ui.mode === 'measure') {
      if (!store.ui.measureDraft) {
        store.setMeasureDraft({ yaw, pitch });
      } else {
        store.addMeasurement({
          id: uid('msr'),
          points: [store.ui.measureDraft, { yaw, pitch }],
          label: '距離',
          scaleMetersPerUnit: null,
        });
        store.setMeasureDraft(null);
      }
    }
  }

  private async goToScene(h: SceneHotspot) {
    if (!h.targetSceneId || !this.engine) return;
    await this.engine.aimAndPush(h.yaw, h.pitch, 350);
    store.selectScene(h.targetSceneId);
  }

  private addInfoHotspot() {
    if (!this.engine || !store.activeScene) return;
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
  }

  private addSceneHotspot() {
    if (!this.engine || !store.activeScene) return;
    const v = this.engine.getView();
    const other = store.project.scenes.find((s) => s.id !== store.ui.activeSceneId);
    const hs: SceneHotspot = {
      id: uid('hs'),
      type: 'scene',
      yaw: v.yaw,
      pitch: v.pitch,
      targetSceneId: other?.id || '',
      rotation: 0,
      transition: 'fly',
    };
    store.addHotspot(hs);
  }

  private setInitialView() {
    if (!this.engine) return;
    store.updateActiveInitialView(this.engine.getView());
    store.setToast(t('initialViewSet'));
  }

  private toggleMeasure() {
    store.setMode(store.ui.mode === 'measure' ? 'navigate' : 'measure');
    if (store.ui.mode === 'measure') store.setToast(t('measurementHint'));
  }

  private toggleParallax() {
    const on = !store.ui.parallaxEnabled;
    store.setParallaxEnabled(on);
    this.engine?.setParallaxEnabled(on);
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
      store.setToast(`${t('ready')} · ${files.length}`);
    } catch (err) {
      store.setToast(String((err as Error).message || err));
    } finally {
      store.setBusy(null);
    }
  }

  private async onExport() {
    if (!store.project.scenes.length) {
      store.setToast(t('deployNeedScenes'));
      return;
    }
    store.setBusy(t('exporting'));
    try {
      const blob = await buildProjectZip(store.project);
      downloadBlob(blob, suggestZipName(store.project));
      store.setToast(t('exportDone'));
    } catch (err) {
      console.error(err);
      store.setToast(t('exportFail'));
    } finally {
      store.setBusy(null);
    }
  }

  private async onImport(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    store.setBusy(t('importing'));
    try {
      const doc = await importProjectZip(file);
      store.setProject(doc);
      this.lastActiveId = null;
      store.setToast(t('importDone'));
    } catch (err) {
      console.error(err);
      store.setToast(`${t('importFail')}: ${(err as Error).message}`);
    } finally {
      store.setBusy(null);
    }
  }

  private async onDeploy() {
    store.setBusy(t('deploying'));
    try {
      const res = await deployProject(store.project);
      if (!res.ok) {
        if (res.error === 'missing_fields') store.setToast(t('deployNeedFields'));
        else if (res.error === 'no_scenes') store.setToast(t('deployNeedScenes'));
        else store.setToast(`${t('deployFail')}: ${res.error || ''}`);
        return;
      }
      store.setToast(`${t('deployDone')} ${res.url}`);
      if (res.url && confirm(`${t('deployDone')}\n${res.url}\n\n${t('openDeployed')}?`)) {
        window.open(res.url, '_blank');
      }
    } catch (err) {
      console.error(err);
      store.setToast(`${t('deployFail')}: ${(err as Error).message}`);
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
