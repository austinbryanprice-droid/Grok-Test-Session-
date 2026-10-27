import * as THREE from 'three';
import { LIGHT } from './palette';

/** Uniforms shared by every patched material. One object so a single write updates every shader. */
export const frame = {
  uTime: { value: 0 },
  uZoomOut: { value: 0.756 },
  uSunTravel: { value: new THREE.Vector3(0.455, -0.766, 0.455).normalize() },
  uRimColor: { value: new THREE.Color(LIGHT.rim) },
  uFowMap: { value: null as THREE.Texture | null },
  uMapSize: { value: 128 },
  uCloud: { value: null as THREE.Texture | null },
  uCloudOffset: { value: new THREE.Vector2() },
  uCursor: { value: new THREE.Vector2(999, 999) },
};

export const SUN_TRAVEL = frame.uSunTravel.value;
