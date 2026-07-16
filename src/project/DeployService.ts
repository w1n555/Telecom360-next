import type { ProjectDocument } from '../core/types/project';
import { buildDeployFiles } from './ExportService';

export interface DeployResult {
  ok: boolean;
  url?: string;
  path?: string;
  error?: string;
}

/**
 * One-click deploy: POST files to same-origin /api/deploy which writes
 * site/{SITE_CODE}/{ROOM_NAME}/{PHOTO_DATE}/ on the server disk.
 */
export async function deployProject(project: ProjectDocument): Promise<DeployResult> {
  const { siteCode, roomName, photoDate } = project.deploy;
  if (!siteCode.trim() || !roomName.trim() || !photoDate.trim()) {
    return { ok: false, error: 'missing_fields' };
  }
  if (!project.scenes.length) {
    return { ok: false, error: 'no_scenes' };
  }

  const files = await buildDeployFiles(project);
  const form = new FormData();
  form.append('siteCode', siteCode.trim());
  form.append('roomName', roomName.trim());
  form.append('photoDate', photoDate.trim());
  form.append(
    'manifest',
    JSON.stringify({
      files: files.map((f) => ({ path: f.path, contentType: f.contentType })),
    })
  );

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const blob =
      typeof f.data === 'string'
        ? new Blob([f.data], { type: f.contentType })
        : new Blob([f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength) as ArrayBuffer], {
            type: f.contentType,
          });
    form.append('files', blob, f.path);
  }

  const res = await fetch('/api/deploy', { method: 'POST', body: form });
  const data = (await res.json().catch(() => ({}))) as DeployResult & { message?: string };
  if (!res.ok) {
    return { ok: false, error: data.error || data.message || res.statusText };
  }
  return {
    ok: true,
    url: data.url || `${location.origin}/site/${encodeURIComponent(siteCode.trim())}/${encodeURIComponent(roomName.trim())}/${encodeURIComponent(photoDate.trim())}/`,
    path: data.path,
  };
}
