import * as THREE from 'three';
import { heightAt, mulberry32 } from '../noise';
import type { QualityPreset } from '../presets';

export interface Foliage {
  trunks: THREE.InstancedMesh;
  crowns: THREE.InstancedMesh;
  grass: THREE.InstancedMesh;
  rocks: THREE.InstancedMesh;
  flowers: THREE.InstancedMesh;
  reeds: THREE.InstancedMesh;
  applyCounts: (preset: QualityPreset) => void;
}

function windMaterial(color: number, roughness: number, amp: number): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uAmp = { value: amp };
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uAmp;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 wpos = (instanceMatrix * vec4(position, 1.0)).xyz;
        #else
          vec3 wpos = position;
        #endif
        float sway = sin(uTime * 1.35 + wpos.x * 0.17 + wpos.z * 0.11) * uAmp;
        transformed.x += sway * transformed.y;
        transformed.z += cos(uTime * 1.1 + wpos.z * 0.2) * uAmp * 0.6 * transformed.y;`,
      );
  };
  return material;
}

export function createFoliage(max: QualityPreset): Foliage {
  const rand = mulberry32(7);
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, 4.2, 6);
  trunkGeo.translate(0, 2.1, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1.7, 1);
  crownGeo.translate(0, 4.6, 0);
  const grassGeo = new THREE.ConeGeometry(0.08, 0.7, 4);
  grassGeo.translate(0, 0.35, 0);
  const rockGeo = new THREE.DodecahedronGeometry(0.7, 0);
  const flowerGeo = new THREE.SphereGeometry(0.12, 6, 5);
  flowerGeo.translate(0, 0.35, 0);
  const reedGeo = new THREE.CylinderGeometry(0.03, 0.04, 1.3, 4);
  reedGeo.translate(0, 0.65, 0);

  const trunks = new THREE.InstancedMesh(trunkGeo, windMaterial(0x7a5a3c, 0.9, 0.015), max.trees);
  const crowns = new THREE.InstancedMesh(crownGeo, windMaterial(0x667f46, 0.88, 0.045), max.trees);
  const grass = new THREE.InstancedMesh(grassGeo, windMaterial(0x6d8a45, 0.95, 0.12), max.grass);
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x8a8680, roughness: 0.95 }), max.rocks);
  const flowers = new THREE.InstancedMesh(flowerGeo, new THREE.MeshStandardMaterial({ color: 0xd98aa4, roughness: 0.7 }), 80);
  const reeds = new THREE.InstancedMesh(reedGeo, windMaterial(0x8a9a62, 0.9, 0.08), max.reeds);

  const dummy = new THREE.Object3D();
  let trees = 0;
  let guard = 0;
  while (trees < max.trees && guard < max.trees * 30) {
    guard++;
    const x = rand() * 110 + 4;
    const z = rand() * 110 + 4;
    const h = heightAt(x, z);
    if (h < 9.2) continue;
    if (Math.hypot(x - 58, z - 78) < 12) continue;
    if (Math.hypot(x - 92, z - 102) < 4.5) continue;
    const forest = x > 64 && z > 78 && Math.hypot(x - 58, z - 78) > 18;
    if (!forest && rand() > 0.28) continue;
    dummy.position.set(x, h, z);
    dummy.rotation.y = rand() * Math.PI * 2;
    const s = 0.85 + rand() * 0.7;
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    trunks.setMatrixAt(trees, dummy.matrix);
    crowns.setMatrixAt(trees, dummy.matrix);
    trees++;
  }
  trunks.count = trees;
  crowns.count = trees;

  let gcount = 0;
  guard = 0;
  while (gcount < max.grass && guard < max.grass * 8) {
    guard++;
    const x = rand() * 116 + 2;
    const z = rand() * 116 + 2;
    const h = heightAt(x, z);
    if (h < 8.6 || h > 18) continue;
    if (Math.hypot(x - 96, z - 42) < 24) continue;
    dummy.position.set(x, h, z);
    dummy.rotation.y = rand() * Math.PI * 2;
    dummy.scale.set(0.7 + rand(), 0.6 + rand() * 0.9, 0.7 + rand());
    dummy.updateMatrix();
    grass.setMatrixAt(gcount, dummy.matrix);
    gcount++;
  }
  grass.count = gcount;

  let rcount = 0;
  for (let i = 0; i < max.rocks; i++) {
    const x = rand() * 116 + 2;
    const z = rand() * 116 + 2;
    const h = heightAt(x, z);
    if (h < 8.4) continue;
    dummy.position.set(x, h + 0.15, z);
    dummy.rotation.set(rand(), rand(), rand());
    const s = x < 32 ? 1.4 + rand() : 0.45 + rand() * 0.8;
    dummy.scale.set(s, s * 0.7, s);
    dummy.updateMatrix();
    rocks.setMatrixAt(rcount, dummy.matrix);
    rcount++;
  }
  rocks.count = rcount;

  const beds: Array<[number, number]> = [
    [55.2, 75.2], [60.8, 75.4], [63.5, 81], [48.6, 83.2], [68.4, 71.6],
  ];
  let fcount = 0;
  for (const [bx, bz] of beds) {
    for (let i = 0; i < 10; i++) {
      const x = bx + (rand() - 0.5) * 1.4;
      const z = bz + (rand() - 0.5) * 0.8;
      dummy.position.set(x, heightAt(x, z), z);
      dummy.rotation.y = rand() * 6;
      dummy.scale.setScalar(0.7 + rand() * 0.6);
      dummy.updateMatrix();
      flowers.setMatrixAt(fcount, dummy.matrix);
      const color = new THREE.Color(rand() > 0.5 ? 0xe7e2d2 : 0xd98aa4);
      flowers.setColorAt(fcount, color);
      fcount++;
    }
  }
  flowers.count = fcount;
  if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;

  let reedCount = 0;
  guard = 0;
  while (reedCount < max.reeds && guard < max.reeds * 20) {
    guard++;
    const ang = rand() * Math.PI * 2;
    const rad = 22 + rand() * 6;
    const x = 96 + Math.cos(ang) * rad;
    const z = 42 + Math.sin(ang) * rad;
    const h = heightAt(x, z);
    if (h < 8.1 || h > 9.4) continue;
    dummy.position.set(x, h, z);
    dummy.rotation.y = rand() * 6;
    dummy.scale.setScalar(0.8 + rand() * 0.6);
    dummy.updateMatrix();
    reeds.setMatrixAt(reedCount, dummy.matrix);
    reedCount++;
  }
  reeds.count = reedCount;

  for (const mesh of [trunks, crowns, rocks]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
  }
  for (const mesh of [grass, flowers, reeds]) {
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
  }
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  grass.instanceMatrix.needsUpdate = true;
  rocks.instanceMatrix.needsUpdate = true;
  flowers.instanceMatrix.needsUpdate = true;
  reeds.instanceMatrix.needsUpdate = true;

  const built = { trees, grass: gcount, rocks: rcount, reeds: reedCount };
  return {
    trunks,
    crowns,
    grass,
    rocks,
    flowers,
    reeds,
    applyCounts: (preset) => {
      trunks.count = Math.min(preset.trees, built.trees);
      crowns.count = trunks.count;
      grass.count = Math.min(preset.grass, built.grass);
      rocks.count = Math.min(preset.rocks, built.rocks);
      reeds.count = Math.min(preset.reeds, built.reeds);
    },
  };
}

export function updateWind(foliage: Foliage, time: number): void {
  for (const mesh of [foliage.trunks, foliage.crowns, foliage.grass, foliage.reeds]) {
    const shader = (mesh.material as THREE.MeshStandardMaterial).userData.shader as { uniforms: { uTime: { value: number } } } | undefined;
    if (shader) shader.uniforms.uTime.value = time;
  }
}
