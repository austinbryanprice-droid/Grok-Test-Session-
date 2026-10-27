import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Object3D,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD, computeHeight, inClearing, settlement, slopeAt, splatWeights, WATER_Y } from './field';
import { lit } from './lit';
import { mulberry32 } from './noise';
import { billboardMaterial, spriteQuad, type FoliageSprites } from './sprites';
import type { Library } from './textures';

const windTime = { value: 0 };

export function foliageTime(): { value: number } {
  return windTime;
}

export function createFoliage(library: Library, sprites: FoliageSprites): {
  trunks: InstancedMesh;
  canopies: InstancedMesh;
  volumes: InstancedMesh;
  shrubs: InstancedMesh;
  grass: InstancedMesh;
  wheat: InstancedMesh;
} {
  const wood = lit({
    map: library.wood.color,
    normalMap: library.wood.normal,
    roughnessMap: library.wood.rough,
    roughness: 1,
    metalness: 0,
  });
  const volumeMat = lit({
    color: 0x3f7a32,
    roughness: 0.9,
    metalness: 0,
    vertexColors: true,
  });
  volumeMat.colorWrite = false;
  volumeMat.depthWrite = false;
  const treeMat = billboardMaterial(sprites.tree);
  const grassMat = billboardMaterial(sprites.grass);
  const shrubMat = billboardMaterial(sprites.tree, 0xc5e090);
  const quad = spriteQuad();
  const volumeGeo = volumeGeometry();
  const trunkGeo = new CylinderGeometry(0.16, 0.3, 2.3, 6);
  trunkGeo.translate(0, 1.15, 0);

  const trees = placeTrees();
  const trunks = new InstancedMesh(trunkGeo, wood, trees.length);
  const canopies = new InstancedMesh(quad, treeMat, trees.length);
  const volumes = new InstancedMesh(volumeGeo, volumeMat, trees.length);
  const dummy = new Object3D();
  const color = new Color();
  for (let i = 0; i < trees.length; i += 1) {
    const tree = trees[i];
    dummy.position.set(tree.x, tree.y, tree.z);
    dummy.rotation.set(0, tree.rot, 0);
    dummy.scale.setScalar(tree.scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(3.5 * tree.scale, 4.8 * tree.scale, 1);
    dummy.updateMatrix();
    canopies.setMatrixAt(i, dummy.matrix);
    dummy.position.set(tree.x, tree.y + 2.05 * tree.scale, tree.z);
    dummy.rotation.set(0, tree.rot, 0);
    dummy.scale.set(tree.scale * tree.wide, tree.scale * 0.82, tree.scale * tree.wide);
    dummy.updateMatrix();
    volumes.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.22 + tree.hue, 0.48, 0.32);
    volumes.setColorAt(i, color);
  }
  trunks.visible = false;
  trunks.castShadow = false;
  canopies.castShadow = true;
  canopies.receiveShadow = true;
  volumes.castShadow = true;
  volumes.receiveShadow = false;
  trunks.frustumCulled = false;
  canopies.frustumCulled = false;
  volumes.frustumCulled = false;

  const shrubSpots = placeShrubs();
  const shrubs = new InstancedMesh(quad, shrubMat, shrubSpots.length);
  for (let i = 0; i < shrubSpots.length; i += 1) {
    const spot = shrubSpots[i];
    dummy.position.set(spot.x, spot.y, spot.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1.5 * spot.scale, 2.1 * spot.scale, 1);
    dummy.updateMatrix();
    shrubs.setMatrixAt(i, dummy.matrix);
  }
  shrubs.castShadow = true;
  shrubs.receiveShadow = true;
  shrubs.frustumCulled = false;

  const blades = placeGrass();
  const grass = new InstancedMesh(quad, grassMat, blades.length);
  for (let i = 0; i < blades.length; i += 1) {
    const blade = blades[i];
    dummy.position.set(blade.x, blade.y, blade.z);
    dummy.rotation.set(0, blade.rot, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(2.1 * blade.scale, 1.55 * blade.scale, 1);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.28 + blade.hue * 0.2, 0.25, 0.78);
    grass.setColorAt(i, color);
  }
  grass.receiveShadow = true;
  grass.frustumCulled = false;

  const wheatSpots = placeWheat();
  const wheatMat = billboardMaterial(sprites.wheat, 0xf0d080);
  const wheat = new InstancedMesh(quad, wheatMat, Math.max(1, wheatSpots.length));
  for (let i = 0; i < wheatSpots.length; i += 1) {
    const blade = wheatSpots[i];
    dummy.position.set(blade.x, blade.y, blade.z);
    dummy.rotation.set(0, blade.rot, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(0.9 * blade.scale, 1.35 * blade.scale, 1);
    dummy.updateMatrix();
    wheat.setMatrixAt(i, dummy.matrix);
  }
  wheat.count = wheatSpots.length;
  wheat.receiveShadow = true;
  wheat.frustumCulled = false;
  return { trunks, canopies, volumes, shrubs, grass, wheat };
}


function volumeGeometry(): BufferGeometry {
  const lobes: Array<[number, number, number, number, number, number]> = [
    [0, 0.42, 0, 0.92, 0.68, 0.88],
    [0.5, 0.18, 0.12, 0.52, 0.42, 0.5],
    [-0.48, 0.16, 0.1, 0.48, 0.4, 0.46],
    [0.08, 0.5, -0.38, 0.46, 0.36, 0.44],
  ];
  const parts = lobes.map(([x, y, z, sx, sy, sz]) => {
    const geometry = new IcosahedronGeometry(1, 2);
    geometry.scale(sx, sy, sz);
    geometry.translate(x, y, z);
    return geometry;
  });
  const geometry = mergeGeometries(parts, false);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    const shade = Math.max(0.45, Math.min(1, 0.55 + y * 0.4));
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade * 0.86;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

type Spot = { x: number; y: number; z: number; rot: number; scale: number; wide: number; hue: number };

function placeTrees(): Spot[] {
  const rand = mulberry32(11);
  const spots: Spot[] = [];
  const home = settlement();
  const add = (x: number, z: number, scale: number) => {
    const y = computeHeight(x, z);
    if (y < WATER_Y + 0.45 || y > 16 || slopeAt(x, z) > 0.72 || inClearing(x, z)) return;
    spots.push({
      x,
      y,
      z,
      rot: rand() * Math.PI * 2,
      scale,
      wide: 0.9 + rand() * 0.6,
      hue: rand() * 0.1,
    });
  };
  for (let i = 0; i < 70; i += 1) add(-28 + rand() * 16, -6 + rand() * 48, 1.35 + rand() * 1.15);
  for (let i = 0; i < 40; i += 1) add(home.x + 8 + rand() * 16, home.z + 12 + rand() * 24, 1.6 + rand() * 1.5);
  return spots;
}

function placeShrubs(): Spot[] {
  const rand = mulberry32(23);
  const spots: Spot[] = [];
  for (let i = 0; i < 420 && spots.length < 140; i += 1) {
    const x = (rand() - 0.5) * (WORLD - 12);
    const z = (rand() - 0.5) * (WORLD - 12);
    const y = computeHeight(x, z);
    if (y < WATER_Y + 0.35 || slopeAt(x, z) > 0.7) continue;
    if (inClearing(x, z) && rand() > 0.2) continue;
    const [grass] = splatWeights(x, z);
    if (grass < 0.25 && rand() > 0.3) continue;
    spots.push({
      x,
      y,
      z,
      rot: rand() * Math.PI * 2,
      scale: 0.35 + rand() * 0.55,
      wide: 1,
      hue: rand() * 0.08,
    });
  }
  return spots;
}

function placeWheat(): Spot[] {
  const home = settlement();
  const rand = mulberry32(77);
  const spots: Spot[] = [];
  for (let z = -5.5; z <= 5.5; z += 0.52) {
    for (let x = 7; x <= 16; x += 0.46) {
      const px = home.x + x + (rand() - 0.5) * 0.18;
      const pz = home.z + z + (rand() - 0.5) * 0.18;
      spots.push({
        x: px,
        y: computeHeight(px, pz) + 0.03,
        z: pz,
        rot: rand() * Math.PI,
        scale: 0.9 + rand() * 0.5,
        wide: 1,
        hue: 0,
      });
    }
  }
  return spots;
}

function placeGrass(): Spot[] {
  const rand = mulberry32(41);
  const home = settlement();
  const spots: Spot[] = [];
  const stride = 1.25;
  for (let z = home.z - 48; z < home.z + 48 && spots.length < 9000; z += stride) {
    for (let x = home.x - 55; x < home.x + 40 && spots.length < 9000; x += stride) {
      if (rand() > 0.42) continue;
      const px = x + (rand() - 0.5) * stride * 1.6;
      const pz = z + (rand() - 0.5) * stride * 1.6;
      const y = computeHeight(px, pz);
      if (y < WATER_Y + 0.25 || slopeAt(px, pz) > 0.62) continue;
      const [grass, dirt] = splatWeights(px, pz);
      if (grass < 0.3 || dirt > 0.75) continue;
      if (inClearing(px, pz) && rand() > 0.35) continue;
      spots.push({
        x: px,
        y: y + 0.02,
        z: pz,
        rot: rand() * Math.PI,
        scale: 0.65 + rand() * 0.7,
        wide: 1,
        hue: (rand() - 0.5) * 0.08,
      });
    }
  }
  return spots;
}
