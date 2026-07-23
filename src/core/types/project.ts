/** Telecom360-next project schema (v1). Demo values in docs only — live data comes from user uploads. */

export const PACKAGE_FORMAT = 'telecom360-next-package' as const;
/** Accept packages exported under the former repo/product name */
export const PACKAGE_FORMAT_LEGACY = 'telecom360-threejs-package' as const;
export const PACKAGE_VERSION = 1 as const;

export function isKnownPackageFormat(format: string | undefined | null): boolean {
  return format === PACKAGE_FORMAT || format === PACKAGE_FORMAT_LEGACY;
}

export type HotspotType = 'info' | 'scene';

export interface ViewParams {
  yaw: number;
  pitch: number;
  fov: number;
}

export interface InfoHotspot {
  id: string;
  type: 'info';
  yaw: number;
  pitch: number;
  title: string;
  text: string;
}

export interface SceneHotspot {
  id: string;
  type: 'scene';
  yaw: number;
  pitch: number;
  targetSceneId: string;
}

export type Hotspot = InfoHotspot | SceneHotspot;

export interface SceneSource {
  kind: 'equirectangular';
  /** object URL or relative path inside package/site */
  url: string;
  /** original file name for export */
  fileName: string;
  width?: number;
  height?: number;
  /** base64 data URL embedded for portable packages (source fidelity) */
  dataUrl?: string;
}

export interface Scene {
  id: string;
  name: string;
  source: SceneSource;
  initialView: ViewParams;
  hotspots: Hotspot[];
}

export interface ProjectSettings {
  /**
   * Seed for Editor UI when a project is loaded (WASD always on in practice).
   * Viewer forces parallax on regardless.
   */
  defaultParallaxEnabled: boolean;
  /** camera offset limit when 3D move mode is on (world units) */
  parallaxRadius: number;
  sphereRadius: number;
  anisotropy: number;
}

export interface DeployMeta {
  siteCode: string;
  roomName: string;
  photoDate: string;
}

export interface ProjectDocument {
  id: string;
  name: string;
  settings: ProjectSettings;
  scenes: Scene[];
  deploy: DeployMeta;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectPackage {
  format: typeof PACKAGE_FORMAT;
  version: typeof PACKAGE_VERSION;
  savedAt: string;
  project: ProjectDocument;
}

/** Max zoom-out FOV (~100°). Larger FOV = more of the sphere visible. */
export const FOV_MAX = (100 * Math.PI) / 180;
export const FOV_MIN = (40 * Math.PI) / 180;

/** Default view: fully zoomed out */
export const DEFAULT_VIEW: ViewParams = {
  yaw: 0,
  pitch: 0,
  fov: FOV_MAX,
};

export function defaultSettings(): ProjectSettings {
  return {
    /** 3D WASD always on in viewer/editor (no toggle button) */
    defaultParallaxEnabled: true,
    /** WASD move limit from sphere centre (larger = more walk range) */
    parallaxRadius: 120,
    sphereRadius: 500,
    anisotropy: 16,
  };
}

/**
 * Keep only live settings keys (drop legacy package fields such as
 * mouseViewMode / autorotateEnabled / fullscreenButton / viewControlButtons / locale).
 */
export function sanitizeSettings(raw: Partial<ProjectSettings> | null | undefined): ProjectSettings {
  const d = defaultSettings();
  const s = raw || {};
  return {
    defaultParallaxEnabled:
      typeof s.defaultParallaxEnabled === 'boolean' ? s.defaultParallaxEnabled : d.defaultParallaxEnabled,
    parallaxRadius: typeof s.parallaxRadius === 'number' ? s.parallaxRadius : d.parallaxRadius,
    sphereRadius: typeof s.sphereRadius === 'number' ? s.sphereRadius : d.sphereRadius,
    anisotropy: typeof s.anisotropy === 'number' ? s.anisotropy : d.anisotropy,
  };
}

/** Drop unused hotspot keys (e.g. old rotation / transition on scene links). */
export function sanitizeHotspot(h: Hotspot): Hotspot {
  if (h.type === 'info') {
    return {
      id: h.id,
      type: 'info',
      yaw: h.yaw,
      pitch: h.pitch,
      title: h.title ?? '',
      text: h.text ?? '',
    };
  }
  return {
    id: h.id,
    type: 'scene',
    yaw: h.yaw,
    pitch: h.pitch,
    targetSceneId: h.targetSceneId ?? '',
  };
}

export function deployFieldsComplete(d: { siteCode: string; roomName: string; photoDate: string }): boolean {
  return Boolean(d.siteCode?.trim() && d.roomName?.trim() && d.photoDate?.trim());
}

export function projectNameComplete(name: string | undefined | null): boolean {
  return Boolean(name?.trim());
}

/** SITE / ROOM / DATE + project name (required for export ZIP path). */
export function exportReady(project: { name: string; deploy: { siteCode: string; roomName: string; photoDate: string } }): boolean {
  return projectNameComplete(project.name) && deployFieldsComplete(project.deploy);
}

export function emptyProject(name = ''): ProjectDocument {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    settings: defaultSettings(),
    scenes: [],
    deploy: { siteCode: '', roomName: '', photoDate: '' },
    createdAt: now,
    updatedAt: now,
  };
}
