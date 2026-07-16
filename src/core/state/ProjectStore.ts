import {
  type DeployMeta,
  type Hotspot,
  type Measurement,
  type ProjectDocument,
  type Scene,
  type ViewParams,
  emptyProject,
} from '../types/project';

type Listener = () => void;

export type AppMode = 'navigate' | 'measure';

export interface UiState {
  mode: AppMode;
  activeSceneId: string | null;
  selectedHotspotId: string | null;
  selectedMeasureId: string | null;
  parallaxEnabled: boolean;
  busyMessage: string | null;
  toast: string | null;
  measureDraft: { yaw: number; pitch: number } | null;
}

export class ProjectStore {
  project: ProjectDocument = emptyProject();
  ui: UiState = {
    mode: 'navigate',
    activeSceneId: null,
    selectedHotspotId: null,
    selectedMeasureId: null,
    parallaxEnabled: false,
    busyMessage: null,
    toast: null,
    measureDraft: null,
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
    this.project = doc;
    this.ui.activeSceneId = doc.scenes[0]?.id ?? null;
    this.ui.selectedHotspotId = null;
    this.ui.selectedMeasureId = null;
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

  setBusy(msg: string | null) {
    this.ui.busyMessage = msg;
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
    this.ui.measureDraft = null;
    this.emit();
  }

  setParallaxEnabled(on: boolean) {
    this.ui.parallaxEnabled = on;
    this.emit();
  }

  selectScene(id: string | null) {
    this.ui.activeSceneId = id;
    this.ui.selectedHotspotId = null;
    this.ui.selectedMeasureId = null;
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

  updateHotspot(id: string, patch: Partial<Hotspot>) {
    const s = this.activeScene;
    if (!s) return;
    const i = s.hotspots.findIndex((h) => h.id === id);
    if (i < 0) return;
    s.hotspots[i] = { ...s.hotspots[i], ...patch } as Hotspot;
    this.touch();
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

  addMeasurement(m: Measurement) {
    const s = this.activeScene;
    if (!s) return;
    s.measurements.push(m);
    this.ui.selectedMeasureId = m.id;
    this.touch();
  }

  removeMeasurement(id: string) {
    const s = this.activeScene;
    if (!s) return;
    s.measurements = s.measurements.filter((m) => m.id !== id);
    if (this.ui.selectedMeasureId === id) this.ui.selectedMeasureId = null;
    this.touch();
  }

  setMeasureDraft(p: { yaw: number; pitch: number } | null) {
    this.ui.measureDraft = p;
    this.emit();
  }
}

export const store = new ProjectStore();
