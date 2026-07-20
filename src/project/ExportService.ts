import JSZip from 'jszip';
import {
  PACKAGE_FORMAT,
  PACKAGE_VERSION,
  type ProjectDocument,
  type ProjectPackage,
  type Scene,
} from '../core/types/project';
import { slugify } from '../utils/id';

function cloneProjectForPackage(project: ProjectDocument, opts?: { keepDataUrl?: boolean }): ProjectDocument {
  const keepDataUrl = opts?.keepDataUrl !== false;
  const scenes: Scene[] = project.scenes.map((s) => {
    const rel = `assets/source/${s.id}_${s.source.fileName}`;
    const source = {
      ...s.source,
      url: rel,
    };
    if (!keepDataUrl) {
      delete (source as { dataUrl?: string }).dataUrl;
    }
    return {
      ...s,
      source,
      hotspots: s.hotspots.map((h) => ({ ...h })),
    };
  });
  return {
    ...project,
    scenes,
    settings: { ...project.settings },
    deploy: { ...project.deploy },
  };
}

/** Viewer package must NOT embed multi-MB dataUrls. */
function projectForViewer(project: ProjectDocument): ProjectDocument {
  const doc = cloneProjectForPackage(project, { keepDataUrl: false });
  doc.settings = {
    ...doc.settings,
    autorotateEnabled: false,
    fullscreenButton: true,
    defaultParallaxEnabled: true,
  };
  return doc;
}

async function dataUrlToUint8(dataUrl: string): Promise<Uint8Array> {
  const res = await fetch(dataUrl);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export interface ViewerShellManifest {
  format: string;
  version: number;
  files: { path: string }[];
}

export interface ViewerShellFile {
  path: string;
  data: Uint8Array;
}

/**
 * Load pre-built viewer static shell (from npm run build → prepare_viewer_shell).
 * Shell is served at /viewer-shell/ next to the Editor (IIS or dev).
 */
export async function fetchViewerShell(): Promise<ViewerShellFile[]> {
  const baseCandidates = [
    new URL('/viewer-shell/', location.origin).href,
    new URL('./viewer-shell/', location.href).href,
  ];

  let lastErr: unknown;
  for (const base of baseCandidates) {
    try {
      const manRes = await fetch(new URL('manifest.json', base));
      if (!manRes.ok) {
        lastErr = new Error(`manifest ${manRes.status} @ ${base}`);
        continue;
      }
      const man = (await manRes.json()) as ViewerShellManifest;
      if (!man?.files?.length) {
        lastErr = new Error('viewer-shell manifest 無檔案列表');
        continue;
      }

      const out: ViewerShellFile[] = [];
      for (const entry of man.files) {
        const rel = String(entry.path || '')
          .replace(/\\/g, '/')
          .replace(/^\/+/, '');
        if (!rel || rel.includes('..')) {
          throw new Error(`非法 shell 路徑: ${entry.path}`);
        }
        const res = await fetch(new URL(rel, base));
        if (!res.ok) {
          throw new Error(`無法載入 viewer-shell/${rel} (${res.status})`);
        }
        out.push({ path: rel, data: new Uint8Array(await res.arrayBuffer()) });
      }
      return out;
    } catch (e) {
      lastErr = e;
    }
  }

  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr ?? '');
  throw new Error(
    `找不到預建 viewer-shell（請重新安裝官方編輯器套件，確認網站根有 viewer-shell/ 資料夾）。${detail ? ` ${detail}` : ''}`
  );
}

function addShellToZip(zip: JSZip, shellFiles: ViewerShellFile[], prefix: string) {
  const p = prefix ? `${prefix.replace(/\/$/, '')}/` : '';
  for (const f of shellFiles) {
    // Never overwrite tour data paths with shell (source images live under assets/source/)
    if (f.path === 'project.json' || f.path.startsWith('assets/source/')) {
      continue;
    }
    zip.file(`${p}${f.path}`, f.data);
  }
}

export type ProgressFn = (percent: number, label?: string) => void;

/** Sanitize one path segment (same rules as deploy API). */
function pathSeg(raw: string, fallback: string): string {
  const s = (raw || '').trim().replace(/[\\/]/g, '_').replace(/\.\./g, '');
  return s || fallback;
}

/**
 * ZIP path prefix (manual copy to IIS wwwroot):
 * site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/
 */
export function deployPackagePrefix(project: ProjectDocument): string {
  const site = pathSeg(project.deploy.siteCode, 'SITE');
  const room = pathSeg(project.deploy.roomName, 'ROOM');
  const date = pathSeg(project.deploy.photoDate, 'DATE');
  return `site/${site}/${room}/${date}`;
}

/**
 * Export ZIP for manual copy to server.
 *
 * site/{SITE}/{ROOM}/{DATE}/
 *   index.html + assets/* + brand/*   ← prebuilt viewer shell (TypeScript build)
 *   project.json                      ← tour data (no dataUrl)
 *   assets/source/*.jpg
 * README.txt
 *
 * Unzip to web root (e.g. C:\inetpub\wwwroot) then open /site/S/R/D/
 * Re-import: Editor「開啟專案套件」.
 */
export async function buildProjectZip(
  project: ProjectDocument,
  onProgress?: ProgressFn
): Promise<Blob> {
  const zip = new JSZip();
  const prefix = deployPackagePrefix(project);
  const viewerProject = projectForViewer(project);
  const pkg: ProjectPackage = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    savedAt: new Date().toISOString(),
    project: viewerProject,
  };

  onProgress?.(4, '載入檢視器殼層');
  const shellFiles = await fetchViewerShell();
  addShellToZip(zip, shellFiles, prefix);

  onProgress?.(12, '寫入專案資料');
  zip.file(`${prefix}/project.json`, JSON.stringify(pkg, null, 2));

  const withData = project.scenes.filter((s) => s.source.dataUrl);
  const n = Math.max(withData.length, 1);
  let i = 0;
  for (const s of withData) {
    const bytes = await dataUrlToUint8(s.source.dataUrl!);
    const rel = `assets/source/${s.id}_${s.source.fileName}`;
    zip.file(`${prefix}/${rel}`, bytes);
    i += 1;
    onProgress?.(15 + Math.round((i / n) * 60), '打包圖片');
  }

  zip.file(
    'README.txt',
    `Telecom360-next 專案套件
============================
資料夾結構：
  site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/
    index.html           (預建 Viewer)
    project.json         (導覽資料)
    assets/              (viewer JS/CSS + source 全景圖)
    brand/               (可選)

使用方式（純靜態，無需 Node / 腳本）：
1) 解壓到 IIS 網站根目錄（與編輯器同一層，例如 C:\\inetpub\\wwwroot）
2) 瀏覽器開啟：http://{host}/site/{SITE}/{ROOM}/{DATE}/
3) 若要繼續編輯：開啟編輯器 →「開啟專案套件」載入本 ZIP

注意：
- Viewer 為預建靜態檔，匯出時不會 runtime 產生 HTML/JS。
- 網站根需已安裝官方編輯器套件（含 web.config），.json 才可正確載入。
`
  );
  onProgress?.(80, '壓縮中');

  return zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (meta) => {
      const p = 80 + Math.round((meta.percent || 0) * 0.2);
      onProgress?.(Math.min(99, p), '壓縮中');
    }
  );
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function suggestZipName(project: ProjectDocument): string {
  const d = project.deploy;
  if (d.siteCode && d.roomName && d.photoDate) {
    return `${slugify(d.siteCode)}_${slugify(d.roomName)}_${slugify(d.photoDate)}.zip`;
  }
  return `${slugify(project.name) || 'telecom360-next'}.zip`;
}
