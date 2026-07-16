import JSZip from 'jszip';
import {
  PACKAGE_FORMAT,
  PACKAGE_VERSION,
  type ProjectDocument,
  type ProjectPackage,
  type Scene,
} from '../core/types/project';

function isPackage(x: unknown): x is ProjectPackage {
  if (!x || typeof x !== 'object') return false;
  const o = x as ProjectPackage;
  return o.format === PACKAGE_FORMAT && o.version === PACKAGE_VERSION && !!o.project;
}

/**
 * Import new-format ZIP only. No legacy Marzipano package support.
 */
export async function importProjectZip(file: File): Promise<ProjectDocument> {
  const zip = await JSZip.loadAsync(file);
  const manifestFile =
    zip.file('project.json') || zip.file('/project.json') || zip.file('viewer/project.json');
  if (!manifestFile) {
    throw new Error('找不到 project.json（僅支援 Telecom360-Three.js 新格式套件）');
  }
  const text = await manifestFile.async('string');
  const parsed = JSON.parse(text) as unknown;
  if (!isPackage(parsed)) {
    throw new Error('套件格式不正確或版本不符');
  }

  const project = structuredClone(parsed.project) as ProjectDocument;
  // rehydrate source urls as blob URLs from zip bytes (prefer dataUrl if present)
  for (const scene of project.scenes) {
    await rehydrateScene(zip, scene);
  }
  project.updatedAt = new Date().toISOString();
  return project;
}

async function rehydrateScene(zip: JSZip, scene: Scene) {
  if (scene.source.dataUrl) {
    const res = await fetch(scene.source.dataUrl);
    const blob = await res.blob();
    scene.source.url = URL.createObjectURL(blob);
    return;
  }
  const candidates = [
    scene.source.url,
    `assets/source/${scene.id}_${scene.source.fileName}`,
    `viewer/assets/source/${scene.id}_${scene.source.fileName}`,
  ];
  for (const p of candidates) {
    const f = zip.file(p.replace(/^\//, ''));
    if (f) {
      const buf = await f.async('arraybuffer');
      const blob = new Blob([buf], { type: 'image/jpeg' });
      scene.source.url = URL.createObjectURL(blob);
      // also keep dataUrl for re-export
      scene.source.dataUrl = await blobToDataUrl(blob);
      return;
    }
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
