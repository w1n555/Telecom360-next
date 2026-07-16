import * as THREE from 'three';

/** yaw around Y, pitch around local X; matches typical panorama convention */
export function sphericalToDirection(yaw: number, pitch: number, out = new THREE.Vector3()): THREE.Vector3 {
  const cp = Math.cos(pitch);
  out.set(Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  return out.normalize();
}

export function directionToSpherical(dir: THREE.Vector3): { yaw: number; pitch: number } {
  const n = dir.clone().normalize();
  const pitch = Math.asin(THREE.MathUtils.clamp(n.y, -1, 1));
  const yaw = Math.atan2(n.x, -n.z);
  return { yaw, pitch };
}

export function greatCircleAngle(a: { yaw: number; pitch: number }, b: { yaw: number; pitch: number }): number {
  const va = sphericalToDirection(a.yaw, a.pitch);
  const vb = sphericalToDirection(b.yaw, b.pitch);
  return Math.acos(THREE.MathUtils.clamp(va.dot(vb), -1, 1));
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
