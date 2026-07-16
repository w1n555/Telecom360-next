import JSZip from 'jszip';
import {
  PACKAGE_FORMAT,
  PACKAGE_VERSION,
  type ProjectDocument,
  type ProjectPackage,
  type Scene,
} from '../core/types/project';
import type { ProgressFn } from './ExportService';

function isPackage(x: unknown): x is ProjectPackage {
  if (!x || typeof x !== 'object') return false;
  const o = x as ProjectPackage;
  return o.format === PACKAGE_FORMAT && o.version === PACKAGE_VERSION && !!o.project;
}

/**
 * Find project.json in ZIP.
 * Supports:
 * - site/{SITE}/{ROOM}/{DATE}/project.json  (new, matches deploy)
 * - project.json / viewer/project.json      (legacy export)
 */
function findManifest(zip: JSZip): { file: JSZip.JSZipObject; baseDir: string } | null {
  const names = Object.keys(zip.files)
    .map((n) => n.replace(/\\/g, '/'))
    .filter((n) => !n.includes('__MACOSX') && n.endsWith('project.json') && !zip.files[n].dir);

  // Prefer site/*/*/*/project.json
  const preferred = names
    .filter((n) => /^site\/[^/]+\/[^/]+\/[^/]+\/project\.json$/i.test(n))
    .sort((a, b) => b.length - a.length);
  const pick = preferred[0] || names.find((n) => n === 'project.json') || names[0];
  if (!pick) return null;
  const file = zip.file(pick);
  if (!file) return null;
  const baseDir = pick.includes('/') ? pick.slice(0, pick.lastIndexOf('/') + 1) : '';
  return { file, baseDir };
}

/**
 * Import package ZIP. Images load from assets/source (no embedded dataUrl required).
 */
export async function importProjectZip(
  file: File,
  onProgress?: ProgressFn
): Promise<ProjectDocument> {
  onProgress?.(5, '讀取 ZIP');
  const zip = await JSZip.loadAsync(file);
  onProgress?.(15, '解析專案');

  const found = findManifest(zip);
  if (!found) {
    throw new Error('找不到 project.json（請使用本系統匯出的套件）');
  }
  const text = await found.file.async('string');
  const parsed = JSON.parse(text) as unknown;
  if (!isPackage(parsed)) {
    throw new Error('套件格式不正確或版本不符');
  }

  const project = structuredClone(parsed.project) as ProjectDocument;
  const scenes = project.scenes;
  const n = Math.max(scenes.length, 1);
  for (let i = 0; i < scenes.length; i++) {
    onProgress?.(20 + Math.round(((i + 0.5) / n) * 75), `載入場景 ${i + 1}/${scenes.length}`);
    await rehydrateScene(zip, scenes[i], found.baseDir);
    onProgress?.(20 + Math.round(((i + 1) / n) * 75), `載入場景 ${i + 1}/${scenes.length}`);
  }
  project.updatedAt = new Date().toISOString();
  onProgress?.(100, '完成');
  return project;
}

async function rehydrateScene(zip: JSZip, scene: Scene, baseDir: string) {
  // Prefer file assets (single copy); dataUrl only if present in old packages
  const candidates = [
    scene.source.url,
    `assets/source/${scene.id}_${scene.source.fileName}`,
    `${baseDir}assets/source/${scene.id}_${scene.source.fileName}`,
    `viewer/assets/source/${scene.id}_${scene.source.fileName}`,
  ]
    .filter(Boolean)
    .map((p) => p.replace(/^\//, '').replace(/\\/g, '/'));

  // If relative url without baseDir, also try baseDir + url
  if (scene.source.url && !scene.source.url.startsWith('data:')) {
    candidates.unshift(`${baseDir}${scene.source.url}`.replace(/\/{2,}/g, '/').replace(/^\//, ''));
  }

  for (const p of candidates) {
    const f = zip.file(p);
    if (f) {
      const buf = await f.async('arraybuffer');
      const blob = new Blob([buf], { type: 'image/jpeg' });
      scene.source.url = URL.createObjectURL(blob);
      scene.source.dataUrl = await blobToDataUrl(blob);
      return;
    }
  }

  if (scene.source.dataUrl) {
    const res = await fetch(scene.source.dataUrl);
    const blob = await res.blob();
    scene.source.url = URL.createObjectURL(blob);
    return;
  }

  throw new Error(`場景「${scene.name}」缺少圖片檔案`);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
