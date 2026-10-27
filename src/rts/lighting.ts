import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import { SUN_TRAVEL } from './frame';
import { LIGHT } from './palette';
import type { QualityPreset } from './quality';

export interface SunRig {
  csm: CSM | null;
  update: (camera: THREE.PerspectiveCamera, distance: number) => void;
}

export function createSun(scene: THREE.Scene, camera: THREE.PerspectiveCamera, preset: QualityPreset): SunRig {
  const hemi = new THREE.HemisphereLight(LIGHT.hemiSky, LIGHT.hemiGround, 1.45);
  scene.add(hemi);
  if (preset.cascades > 1) {
    const csm = new CSM({
      camera,
      parent: scene,
      cascades: preset.cascades,
      maxFar: 160,
      mode: 'practical',
      shadowMapSize: preset.shadowMapSize,
      shadowBias: -0.0005,
      lightDirection: SUN_TRAVEL.clone(),
      lightIntensity: 3,
      lightNear: 1,
      lightFar: 400,
      lightMargin: 40,
    });
    for (const light of csm.lights) {
      light.color.set(LIGHT.sun);
      light.intensity = 3;
      light.shadow.normalBias = 0.02;
      light.shadow.radius = 2;
      light.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    }
    return {
      csm,
      update: () => {
        csm.lightDirection.copy(SUN_TRAVEL);
        csm.update();
      },
    };
  }

  const sun = new THREE.DirectionalLight(LIGHT.sun, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);
  const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
  const inverse = new THREE.Matrix4();
  const center = new THREE.Vector3();
  const right = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  return {
    csm: null,
    update: (view, distance) => {
      const previousFar = view.far;
      view.far = Math.min(previousFar, Math.max(48, distance * 2.6));
      view.updateProjectionMatrix();
      inverse.multiplyMatrices(view.matrixWorld, view.projectionMatrix.clone().invert());
      let index = 0;
      for (const z of [-1, 1]) {
        for (const y of [-1, 1]) {
          for (const x of [-1, 1]) corners[index++].set(x, y, z).applyMatrix4(inverse);
        }
      }
      view.far = previousFar;
      view.updateProjectionMatrix();
      center.set(0, 0, 0);
      for (const corner of corners) center.add(corner);
      center.multiplyScalar(1 / corners.length);
      let radius = 8;
      for (const corner of corners) radius = Math.max(radius, center.distanceTo(corner));
      const texel = (radius * 2) / preset.shadowMapSize;
      right.crossVectors(up, SUN_TRAVEL).normalize();
      camUp.crossVectors(SUN_TRAVEL, right).normalize();
      const snappedX = Math.round(center.dot(right) / texel) * texel;
      const snappedY = Math.round(center.dot(camUp) / texel) * texel;
      const along = center.dot(SUN_TRAVEL);
      center.copy(right).multiplyScalar(snappedX).addScaledVector(camUp, snappedY).addScaledVector(SUN_TRAVEL, along);
      sun.position.copy(center).addScaledVector(SUN_TRAVEL, -(radius + 40));
      sun.target.position.copy(center);
      const shadowCam = sun.shadow.camera as THREE.OrthographicCamera;
      shadowCam.left = -radius;
      shadowCam.right = radius;
      shadowCam.top = radius;
      shadowCam.bottom = -radius;
      shadowCam.near = 1;
      shadowCam.far = radius * 2 + 80;
      shadowCam.updateProjectionMatrix();
      sun.updateMatrixWorld();
      sun.target.updateMatrixWorld();
    },
  };
}
