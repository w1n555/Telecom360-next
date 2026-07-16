import type { ProjectDocument } from '../core/types/project';
import { buildDeployZip, type ProgressFn } from './ExportService';

export interface DeployResult {
  ok: boolean;
  url?: string;
  path?: string;
  error?: string;
  files?: number;
}

/**
 * One-click deploy: build one ZIP then POST /api/deploy (server extracts).
 * Avoids multer multi-file size failures on large 360 JPGs.
 */
export async function deployProject(
  project: ProjectDocument,
  onProgress?: ProgressFn
): Promise<DeployResult> {
  const { siteCode, roomName, photoDate } = project.deploy;
  if (!siteCode.trim() || !roomName.trim() || !photoDate.trim()) {
    return { ok: false, error: 'missing_fields' };
  }
  if (!project.scenes.length) {
    return { ok: false, error: 'no_scenes' };
  }

  onProgress?.(2, '準備部署包');
  const blob = await buildDeployZip(project, (p, label) => {
    // packing 0–55 of overall (map 0–100 → 2–55)
    onProgress?.(2 + Math.round(p * 0.53), label || '打包');
  });

  onProgress?.(58, '上傳中');

  const form = new FormData();
  form.append('siteCode', siteCode.trim());
  form.append('roomName', roomName.trim());
  form.append('photoDate', photoDate.trim());
  form.append('package', blob, 'deploy.zip');

  try {
    const data = await uploadWithProgress(
      form,
      (pct) => {
        // upload 58–92
        onProgress?.(58 + Math.round(pct * 0.34), '上傳中');
      },
      () => {
        // upload finished, server extracting zip
        onProgress?.(93, '伺服器解壓寫入中');
      }
    );
    onProgress?.(100, '完成');
    if (!data.ok) {
      return { ok: false, error: data.error || 'deploy_failed' };
    }
    return {
      ok: true,
      url:
        data.url ||
        `${location.origin}/site/${encodeURIComponent(siteCode.trim())}/${encodeURIComponent(roomName.trim())}/${encodeURIComponent(photoDate.trim())}/`,
      path: data.path,
      files: data.files,
    };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

function uploadWithProgress(
  form: FormData,
  onPct: (percent: number) => void,
  onUploadDone?: () => void
): Promise<DeployResult & { message?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/deploy');
    xhr.responseType = 'text';
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && ev.total > 0) {
        onPct((ev.loaded / ev.total) * 100);
      } else {
        onPct(50);
      }
    };
    xhr.upload.onload = () => {
      onUploadDone?.();
    };
    xhr.onload = () => {
      let body: DeployResult & { message?: string; error?: string } = { ok: false };
      try {
        body = JSON.parse(xhr.responseText || '{"ok":false}') as DeployResult & {
          message?: string;
          error?: string;
        };
      } catch {
        body = { ok: false, error: xhr.responseText?.slice(0, 200) || `HTTP ${xhr.status}` };
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.ok !== false) {
        resolve({
          ok: true,
          url: body.url,
          path: body.path,
          files: body.files,
        });
      } else {
        resolve({
          ok: false,
          error: body.error || body.message || `HTTP ${xhr.status} ${xhr.statusText}`,
        });
      }
    };
    xhr.onerror = () => reject(new Error('網絡錯誤，無法連線部署 API'));
    xhr.send(form);
  });
}
