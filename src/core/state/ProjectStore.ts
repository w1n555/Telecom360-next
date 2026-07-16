import {
  type DeployMeta,
  type Hotspot,
  type ProjectDocument,
  type ProjectSettings,
  type Scene,
  type ViewParams,
  emptyProject,
} from '../types/project';

type Listener = () => void;

export type AppMode = 'navigate';

export interface ResultDialog {
  title: string;
  body: string;
  link: string;
}

export interface UiState {
  mode: AppMode;
  activeSceneId: string | null;
  selectedHotspotId: string | null;
  parallaxEnabled: boolean;
  busyMessage: string | null;
  /** 0–100 while busy; null when not showing percent */
  busyPercent: number | null;
  /** Success/info panel on the same overlay as loading (no native dialogs) */
  resultDialog: ResultDialog | null;
  toast: string | null;
}

export class ProjectStore {
  project: ProjectDocument = emptyProject();
  ui: UiState = {
    mode: 'navigate',
    activeSceneId: null,
    selectedHotspotId: null,
    parallaxEnabled: false,
    busyMessage: null,
    busyPercent: null,
    resultDialog: null,
    toast: null,
  };

  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  private touch() {
    this.project.updatedAt = new Date().toISOString();
    this.emit();
  }

  setProject(doc: ProjectDocument) {
    this.project = {
      ...doc,
      scenes: doc.scenes.map((s) => ({
        ...s,
        // drop legacy measurements field if present
        hotspots: s.hotspots.map((h) => ({ ...h })),
      })),
    };
    // ensure no measurements key left on scenes
    for (const s of this.project.scenes) {
      delete (s as { measurements?: unknown }).measurements;
    }
    this.ui.activeSceneId = doc.scenes[0]?.id ?? null;
    this.ui.selectedHotspotId = null;
    this.ui.parallaxEnabled = doc.settings.defaultParallaxEnabled;
    this.emit();
  }

  reset() {
    this.setProject(emptyProject());
  }

  setProjectName(name: string) {
    this.project.name = name;
    this.touch();
  }

  setDeploy(meta: Partial<DeployMeta>) {
    this.project.deploy = { ...this.project.deploy, ...meta };
    this.touch();
  }

  patchSettings(partial: Partial<ProjectSettings>) {
    this.project.settings = { ...this.project.settings, ...partial };
    this.touch();
  }

  setBusy(msg: string | null, percent: number | null = null) {
    this.ui.busyMessage = msg;
    this.ui.busyPercent = msg == null ? null : percent;
    // starting a busy op clears any previous result dialog
    if (msg != null) this.ui.resultDialog = null;
    this.emit();
  }

  setBusyPercent(percent: number) {
    this.ui.busyPercent = Math.max(0, Math.min(100, Math.round(percent)));
    this.emit();
  }

  /** Show success panel on loading overlay (keeps project in memory). */
  showResultDialog(dialog: ResultDialog) {
    this.ui.busyMessage = null;
    this.ui.busyPercent = null;
    this.ui.resultDialog = dialog;
    this.emit();
  }

  clearResultDialog() {
    this.ui.resultDialog = null;
    this.ui.busyMessage = null;
    this.ui.busyPercent = null;
    this.emit();
  }

  setToast(msg: string | null) {
    this.ui.toast = msg;
    this.emit();
    if (msg) {
      window.setTimeout(() => {
        if (this.ui.toast === msg) {
          this.ui.toast = null;
          this.emit();
        }
      }, 4200);
    }
  }

  setMode(mode: AppMode) {
    this.ui.mode = mode;
    this.emit();
  }

  setParallaxEnabled(on: boolean) {
    this.ui.parallaxEnabled = on;
    this.emit();
  }

  selectScene(id: string | null) {
    this.ui.activeSceneId = id;
    this.ui.selectedHotspotId = null;
    this.emit();
  }

  get activeScene(): Scene | null {
    return this.project.scenes.find((s) => s.id === this.ui.activeSceneId) ?? null;
  }

  addScene(scene: Scene) {
    this.project.scenes.push(scene);
    this.ui.activeSceneId = scene.id;
    this.touch();
  }

  removeScene(id: string) {
    this.project.scenes = this.project.scenes.filter((s) => s.id !== id);
    for (const s of this.project.scenes) {
      s.hotspots = s.hotspots.filter((h) => h.type !== 'scene' || h.targetSceneId !== id);
    }
    if (this.ui.activeSceneId === id) {
      this.ui.activeSceneId = this.project.scenes[0]?.id ?? null;
      this.ui.selectedHotspotId = null;
    }
    this.touch();
  }

  renameScene(id: string, name: string) {
    const s = this.project.scenes.find((x) => x.id === id);
    if (s) {
      s.name = name;
      this.touch();
    }
  }

  /** Reorder scenes: move index from → to */
  moveScene(fromIndex: number, toIndex: number) {
    const list = this.project.scenes;
    if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length) return;
    if (fromIndex === toIndex) return;
    const [item] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, item);
    this.touch();
  }

  updateActiveInitialView(view: ViewParams) {
    const s = this.activeScene;
    if (!s) return;
    s.initialView = { ...view };
    this.touch();
  }

  addHotspot(hotspot: Hotspot) {
    const s = this.activeScene;
    if (!s) return;
    s.hotspots.push(hotspot);
    this.ui.selectedHotspotId = hotspot.id;
    this.touch();
  }

  updateHotspot(id: string, patch: Partial<Hotspot>, opts?: { silent?: boolean }) {
    const s = this.activeScene;
    if (!s) return;
    const i = s.hotspots.findIndex((h) => h.id === id);
    if (i < 0) return;
    s.hotspots[i] = { ...s.hotspots[i], ...patch } as Hotspot;
    this.project.updatedAt = new Date().toISOString();
    if (!opts?.silent) this.emit();
  }

  removeHotspot(id: string) {
    const s = this.activeScene;
    if (!s) return;
    s.hotspots = s.hotspots.filter((h) => h.id !== id);
    if (this.ui.selectedHotspotId === id) this.ui.selectedHotspotId = null;
    this.touch();
  }

  selectHotspot(id: string | null) {
    this.ui.selectedHotspotId = id;
    this.emit();
  }
}

export const store = new ProjectStore();
