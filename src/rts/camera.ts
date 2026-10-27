import * as THREE from 'three';
import { PERSON_HEIGHT } from './palette';

const FOV = 32;
const NEAR_PIXELS = 120;
const FAR_PIXELS = 30;
const REF_HEIGHT = 1080;

/** Pitch rises slowly, then faster, so 52px lands on 52°. */
export function pitchForPixels(pixels: number): number {
  const t = THREE.MathUtils.clamp((NEAR_PIXELS - pixels) / (NEAR_PIXELS - FAR_PIXELS), 0, 1);
  return 45 + 13 * Math.pow(t, 2.21);
}

/**
 * Distance from the camera to a standing figure so it is `pixels` tall on a 1080px-tall view.
 * The figure is vertical and the camera looks down, so only cos(pitch) of its height is seen.
 */
export function distanceFor(pixels: number, pitchDeg: number): number {
  const fov = THREE.MathUtils.degToRad(FOV);
  const pitch = THREE.MathUtils.degToRad(pitchDeg);
  const apparent = PERSON_HEIGHT * Math.cos(pitch);
  return apparent / (2 * Math.tan(fov / 2) * (pixels / REF_HEIGHT));
}

export function zoomOutAmount(pixels: number): number {
  return THREE.MathUtils.clamp((NEAR_PIXELS - pixels) / (NEAR_PIXELS - FAR_PIXELS), 0, 1);
}

export class RtsCamera {
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.35, 260);
  pixels = 52;
  yaw = 0;
  readonly target = new THREE.Vector3(0, 0, 0);
  orbiting = true;

  apply(viewHeight: number): { distance: number; pitch: number } {
    const pitch = pitchForPixels(this.pixels);
    const distance = distanceFor(this.pixels, pitch);
    const pitchRad = THREE.MathUtils.degToRad(pitch);
    const horizontal = distance * Math.cos(pitchRad);
    const height = distance * Math.sin(pitchRad);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * horizontal,
      this.target.y + height,
      this.target.z + Math.cos(this.yaw) * horizontal,
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
    this.camera.aspect = this.camera.aspect || 16 / 9;
    void viewHeight;
    this.camera.updateProjectionMatrix();
    return { distance, pitch };
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  pan(dx: number, dz: number): void {
    this.target.x = THREE.MathUtils.clamp(this.target.x + dx, -56, 56);
    this.target.z = THREE.MathUtils.clamp(this.target.z + dz, -56, 56);
  }

  zoomBy(delta: number): void {
    this.pixels = THREE.MathUtils.clamp(this.pixels * Math.exp(-delta * 0.00115), FAR_PIXELS, NEAR_PIXELS);
  }
}

export const CAMERA_FOV = FOV;
