import {
  PACKAGE_VERSION,
  defaultSettings,
  isKnownPackageFormat,
  type ProjectDocument,
  type ProjectPackage,
} from '../core/types/project';

/** Resolve brand/asset URLs relative to this page (works under /site/S/R/D/ and /viewer/). */
export function assetUrl(rel: string): string {
  return new URL(rel.replace(/^\//, ''), location.href).href;
}

export async function loadPackage(): Promise<ProjectDocument> {
  const url = assetUrl('project.json');
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `找不到 project.json（此頁應與 project.json 同目錄；匯出套件解壓後開啟 site/{SITE}/{ROOM}/{DATE}/）`
    );
  }
  const pkg = (await res.json()) as ProjectPackage;
  if (!isKnownPackageFormat(pkg.format) || pkg.version !== PACKAGE_VERSION) {
    throw new Error('專案格式不支援');
  }
  if (!pkg.project?.scenes?.length) {
    throw new Error('專案沒有場景');
  }
  for (const s of pkg.project.scenes) {
    if (!/^https?:|blob:|data:/i.test(s.source.url)) {
      s.source.url = assetUrl(s.source.url);
    }
    delete (s as { measurements?: unknown }).measurements;
  }
  pkg.project.settings = { ...defaultSettings(), ...pkg.project.settings };
  return pkg.project;
}
