/**
 * Shared canvas fade helpers for scene changes (Editor + Viewer).
 */
import type { PanoramaEngine } from '../panorama/PanoramaEngine';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Fade canvas to opacity 0 (CSS transition on renderer DOM). */
export async function fadeCanvasOut(engine: PanoramaEngine, ms = 350): Promise<void> {
  const canvas = engine.renderer.domElement;
  canvas.style.transition = `opacity ${ms}ms ease`;
  canvas.style.opacity = '0';
  await delay(ms);
}

export function fadeCanvasIn(engine: PanoramaEngine): void {
  const canvas = engine.renderer.domElement;
  canvas.style.opacity = '1';
}

/**
 * Aim at hotspot, fade out, then load next texture URL.
 * Caller is responsible for settleView / hotspot re-enable.
 */
export async function aimFadeAndLoad(
  engine: PanoramaEngine,
  opts: {
    yaw: number;
    pitch: number;
    url: string;
    aimMs?: number;
    fadeMs?: number;
    /** Use engine crossfade sphere after canvas fade (viewer) vs plain load (editor often loads via store). */
    mode?: 'load' | 'transition';
    transitionMs?: number;
  }
): Promise<void> {
  const aimMs = opts.aimMs ?? 380;
  const fadeMs = opts.fadeMs ?? 350;
  engine.interruptAutorotate();
  await engine.aimAndZoomIn(opts.yaw, opts.pitch, aimMs);
  await fadeCanvasOut(engine, fadeMs);
  if (opts.mode === 'transition') {
    await engine.transitionToUrl(opts.url, opts.transitionMs ?? 400);
  } else {
    await engine.loadTextureFromUrl(opts.url);
  }
  fadeCanvasIn(engine);
}

/** Simple opacity fade + load (no aim), for scene list switches. */
export async function fadeAndLoad(
  engine: PanoramaEngine,
  url: string,
  opts?: { fadeMs?: number; mode?: 'load' | 'transition'; transitionMs?: number }
): Promise<void> {
  const fadeMs = opts?.fadeMs ?? 280;
  engine.interruptAutorotate();
  await fadeCanvasOut(engine, fadeMs);
  if (opts?.mode === 'transition') {
    await engine.transitionToUrl(url, opts.transitionMs ?? 400);
  } else {
    await engine.loadTextureFromUrl(url);
  }
  fadeCanvasIn(engine);
}
