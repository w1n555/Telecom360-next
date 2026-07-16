import { DEFAULT_VIEW, type Scene } from '../core/types/project';
import { uid } from '../utils/id';

export interface IngestResult {
  scene: Scene;
  objectUrl: string;
  revoke: () => void;
}

function loadImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('無法讀取圖片'));
    img.src = url;
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Accept equirectangular JPEG/PNG. Soft-warn if not ~2:1 but still allow
 * (Insta360 11904×5952 is exact 2:1).
 */
export async function ingestEquirectFile(file: File): Promise<IngestResult> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const { width, height } = await loadImageSize(objectUrl);
    const ratio = width / height;
    if (ratio < 1.8 || ratio > 2.2) {
      console.warn(`圖片比例 ${ratio.toFixed(2)} 非接近 2:1，仍會載入。`);
    }
    const dataUrl = await fileToDataUrl(file);
    const base = file.name.replace(/\.[^.]+$/, '');
    const scene: Scene = {
      id: uid('scn'),
      name: base || '全景',
      source: {
        kind: 'equirectangular',
        url: objectUrl,
        fileName: file.name,
        width,
        height,
        dataUrl,
      },
      initialView: { ...DEFAULT_VIEW },
      hotspots: [],
    };
    return {
      scene,
      objectUrl,
      revoke: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (e) {
    URL.revokeObjectURL(objectUrl);
    throw e;
  }
}
