/** Telecom360-Three.js project schema (v1). Demo values in docs only — live data comes from user uploads. */

export const PACKAGE_FORMAT = 'telecom360-threejs-package' as const;
export const PACKAGE_VERSION = 1 as const;

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
  rotation: number;
  transition?: 'fly' | 'cut';
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
  mouseViewMode: 'drag';
  autorotateEnabled: boolean;
  fullscreenButton: boolean;
  viewControlButtons: boolean;
  defaultParallaxEnabled: boolean;
  /** camera offset limit when 3D move mode is on (world units) */
  parallaxRadius: number;
  sphereRadius: number;
  anisotropy: number;
  locale: 'zh-Hant';
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
    mouseViewMode: 'drag',
    autorotateEnabled: false,
    fullscreenButton: true,
    viewControlButtons: true,
    defaultParallaxEnabled: false,
    /** WASD move limit from sphere centre (larger = more walk range) */
    parallaxRadius: 120,
    sphereRadius: 500,
    anisotropy: 16,
    locale: 'zh-Hant',
  };
}

export function deployFieldsComplete(d: { siteCode: string; roomName: string; photoDate: string }): boolean {
  return Boolean(d.siteCode?.trim() && d.roomName?.trim() && d.photoDate?.trim());
}

export function emptyProject(name = '未命名專案'): ProjectDocument {
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
