import * as THREE from 'three';
import { clamp, directionToSpherical, sphericalToDirection } from '../utils/math';
import type { ProjectSettings, ViewParams } from '../core/types/project';

export interface EngineCallbacks {
  onViewChange?: (view: ViewParams) => void;
  onClickSphere?: (yaw: number, pitch: number, event: PointerEvent) => void;
  onPointerDownSphere?: (yaw: number, pitch: number, event: PointerEvent) => void;
}

/**
 * Large inward-facing sphere panorama + limited parallax camera.
 * Zoom via FOV; optional WASD offset within ±parallaxRadius.
 */
export class PanoramaEngine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sphere: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;

  private container: HTMLElement;
  private settings: ProjectSettings;
  private yaw = 0;
  private pitch = 0;
  private fov = Math.PI / 2;
  private offset = new THREE.Vector3();
  private parallaxEnabled = false;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private keys = new Set<string>();
  private raf = 0;
  private disposed = false;
  private texture: THREE.Texture | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private callbacks: EngineCallbacks = {};
  private transitionOpacity = 1;
  private fadeSphere: THREE.Mesh | null = null;

  constructor(container: HTMLElement, settings: ProjectSettings) {
    this.container = container;
    this.settings = settings;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x0b1220, 1);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(this.fov), 1, 0.1, settings.sphereRadius * 4);
    this.camera.position.set(0, 0, 0);

    const geo = new THREE.SphereGeometry(settings.sphereRadius, 64, 40);
    // invert so we see the inside
    geo.scale(-1, 1, 1);
    this.material = new THREE.MeshBasicMaterial({ color: 0x222833 });
    this.sphere = new THREE.Mesh(geo, this.material);
    this.scene.add(this.sphere);

    this.bindEvents();
    this.resize();
    this.applyView();
    this.loop();
  }

  setCallbacks(cb: EngineCallbacks) {
    this.callbacks = cb;
  }

  setSettings(settings: ProjectSettings) {
    this.settings = settings;
  }

  setParallaxEnabled(on: boolean) {
    this.parallaxEnabled = on;
    if (!on) {
      // ease toward center next frames via soft pull
      this.offset.multiplyScalar(0.2);
      if (this.offset.length() < 0.05) this.offset.set(0, 0, 0);
    }
  }

  getView(): ViewParams {
    return { yaw: this.yaw, pitch: this.pitch, fov: this.fov };
  }

  setView(view: ViewParams, instant = true) {
    this.yaw = view.yaw;
    this.pitch = clamp(view.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
    this.fov = clamp(view.fov, THREE.MathUtils.degToRad(40), THREE.MathUtils.degToRad(100));
    if (instant) this.offset.set(0, 0, 0);
    this.applyView();
  }

  async loadTextureFromUrl(url: string): Promise<void> {
    const loader = new THREE.TextureLoader();
    const tex = await loader.loadAsync(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = Math.min(
      this.settings.anisotropy,
      this.renderer.capabilities.getMaxAnisotropy()
    );
    tex.needsUpdate = true;
    if (this.texture) this.texture.dispose();
    this.texture = tex;
    this.material.map = tex;
    this.material.color.set(0xffffff);
    this.material.needsUpdate = true;
  }

  /** Soft crossfade helper: flash current material opacity via second sphere */
  async transitionToUrl(url: string, durationMs = 600): Promise<void> {
    const loader = new THREE.TextureLoader();
    const tex = await loader.loadAsync(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = Math.min(
      this.settings.anisotropy,
      this.renderer.capabilities.getMaxAnisotropy()
    );

    if (this.fadeSphere) {
      this.scene.remove(this.fadeSphere);
      (this.fadeSphere.material as THREE.Material).dispose();
    }

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0,
    });
    const geo = this.sphere.geometry;
    this.fadeSphere = new THREE.Mesh(geo, mat);
    this.fadeSphere.scale.copy(this.sphere.scale);
    this.scene.add(this.fadeSphere);

    const start = performance.now();
    await new Promise<void>((resolve) => {
      const step = () => {
        if (this.disposed) return resolve();
        const t = clamp((performance.now() - start) / durationMs, 0, 1);
        const e = t * t * (3 - 2 * t);
        mat.opacity = e;
        this.transitionOpacity = 1 - e * 0.35;
        this.material.opacity = 1;
        this.material.transparent = true;
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    if (this.texture) this.texture.dispose();
    this.texture = tex;
    this.material.map = tex;
    this.material.transparent = false;
    this.material.opacity = 1;
    this.material.needsUpdate = true;
    if (this.fadeSphere) {
      this.scene.remove(this.fadeSphere);
      mat.dispose();
      this.fadeSphere = null;
    }
  }

  /** Project spherical coords to screen CSS pixels relative to container */
  projectToScreen(yaw: number, pitch: number): { x: number; y: number; visible: boolean } {
    const dir = sphericalToDirection(yaw, pitch);
    const world = dir.multiplyScalar(this.settings.sphereRadius * 0.98);
    const projected = world.project(this.camera);
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const x = (projected.x * 0.5 + 0.5) * w;
    const y = (-projected.y * 0.5 + 0.5) * h;
    const visible = projected.z < 1 && projected.x > -1.2 && projected.x < 1.2 && projected.y > -1.2 && projected.y < 1.2;
    return { x, y, visible };
  }

  pickSpherical(clientX: number, clientY: number): { yaw: number; pitch: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.sphere, false);
    if (!hits.length) return null;
    // geometry is scaled -1 on X; convert point to direction from origin
    const p = hits[0].point.clone().sub(this.camera.position).normalize();
    return directionToSpherical(p);
  }

  /** Animate look toward yaw/pitch then optional FOV push */
  async aimAndPush(targetYaw: number, targetPitch: number, ms = 400): Promise<void> {
    const start = this.getView();
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const step = () => {
        if (this.disposed) return resolve();
        const u = clamp((performance.now() - t0) / ms, 0, 1);
        const e = u * u * (3 - 2 * u);
        this.yaw = start.yaw + (targetYaw - start.yaw) * e;
        this.pitch = start.pitch + (targetPitch - start.pitch) * e;
        this.fov = start.fov + (start.fov * 0.82 - start.fov) * e;
        this.applyView();
        if (u < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.removeEventListener('wheel', this.onWheel);
    if (this.texture) this.texture.dispose();
    this.material.dispose();
    this.sphere.geometry.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private applyView() {
    this.camera.fov = THREE.MathUtils.radToDeg(this.fov);
    this.camera.updateProjectionMatrix();

    const R = this.settings.parallaxRadius;
    this.offset.x = clamp(this.offset.x, -R, R);
    this.offset.y = clamp(this.offset.y, -R, R);
    this.offset.z = clamp(this.offset.z, -R, R);
    if (this.offset.length() > R) this.offset.setLength(R);

    this.camera.position.copy(this.offset);
    const look = sphericalToDirection(this.yaw, this.pitch).add(this.offset);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(look);
    this.callbacks.onViewChange?.(this.getView());
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.tickMovement();
    if (!this.parallaxEnabled && this.offset.lengthSq() > 1e-6) {
      this.offset.multiplyScalar(0.88);
      if (this.offset.length() < 0.02) this.offset.set(0, 0, 0);
      this.applyView();
    }
    this.renderer.render(this.scene, this.camera);
  };

  private tickMovement() {
    if (!this.parallaxEnabled) return;
    if (!this.keys.size) return;
    if (this.isFormFocus()) return;
    const speed = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 0.55 : 0.28);
    const forward = sphericalToDirection(this.yaw, 0);
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    if (this.keys.has('KeyW')) this.offset.addScaledVector(forward, speed);
    if (this.keys.has('KeyS')) this.offset.addScaledVector(forward, -speed);
    if (this.keys.has('KeyA')) this.offset.addScaledVector(right, -speed);
    if (this.keys.has('KeyD')) this.offset.addScaledVector(right, speed);
    if (this.keys.has('KeyQ')) this.offset.y += speed;
    if (this.keys.has('KeyE')) this.offset.y -= speed;
    // arrows rotate when not form
    const rot = 0.025 * (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 1.8 : 1);
    if (this.keys.has('ArrowLeft')) this.yaw += rot;
    if (this.keys.has('ArrowRight')) this.yaw -= rot;
    if (this.keys.has('ArrowUp')) this.pitch += rot;
    if (this.keys.has('ArrowDown')) this.pitch -= rot;
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
    this.applyView();
  }

  private isFormFocus() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
  }

  private bindEvents() {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: false });
    this.renderer.domElement.style.touchAction = 'none';
  }

  private onResize = () => this.resize();

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.isFormFocus()) return;
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const hit = this.pickSpherical(e.clientX, e.clientY);
    if (hit) this.callbacks.onPointerDownSphere?.(hit.yaw, hit.pitch, e);
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    const sens = 0.005 * (this.fov / (Math.PI / 2));
    this.yaw -= dx * sens;
    this.pitch += dy * sens;
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
    this.applyView();
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.dragging = false;
    try {
      this.renderer.domElement.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    // click without much drag
    const hit = this.pickSpherical(e.clientX, e.clientY);
    if (hit) this.callbacks.onClickSphere?.(hit.yaw, hit.pitch, e);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = Math.sign(e.deltaY) * 0.06;
    this.fov = clamp(this.fov + delta, THREE.MathUtils.degToRad(40), THREE.MathUtils.degToRad(100));
    this.applyView();
  };
}
