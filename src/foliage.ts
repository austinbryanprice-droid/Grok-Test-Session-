import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Object3D,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD, computeHeight, crops, inClearing, inCrop, settlement, slopeAt, splatWeights, WATER_Y } from './field';
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
  canopies: Group;
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
  const grassMat = billboardMaterial(sprites.grass.map);
  const shrubMat = billboardMaterial(sprites.grass.map, 0xd7e7a4);
  const quad = spriteQuad();
  const volumeGeo = volumeGeometry();
  const trunkGeo = new CylinderGeometry(0.16, 0.3, 2.3, 6);
  trunkGeo.translate(0, 1.15, 0);

  const trees = placeTrees();
  const trunks = new InstancedMesh(trunkGeo, wood, Math.max(1, trees.length));
  const canopies = new Group();
  const volumes = new InstancedMesh(volumeGeo, volumeMat, Math.max(1, trees.length));
  const dummy = new Object3D();
  const color = new Color();
  const lists: Spot[][] = sprites.trees.map(() => []);
  trees.forEach((tree, index) => lists[index % lists.length].push(tree));
  sprites.trees.forEach((sprite, index) => {
    const batch = lists[index];
    const mesh = new InstancedMesh(quad, billboardMaterial(sprite.map), Math.max(1, batch.length));
    mesh.count = batch.length;
    batch.forEach((tree, i) => {
      const size = tree.scale * 1.85;
      dummy.position.set(tree.x, tree.y, tree.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(sprite.width * size, sprite.height * size, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.setRGB(0.9 + tree.hue, 1, 0.86);
      mesh.setColorAt(i, color);
    });
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    canopies.add(mesh);
  });
  trees.forEach((tree, i) => {
    const sprite = sprites.trees[i % sprites.trees.length];
    const size = tree.scale * 1.85;
    const height = sprite.worldHeight * size;
    dummy.position.set(tree.x, tree.y, tree.z);
    dummy.rotation.set(0, tree.rot, 0);
    dummy.scale.setScalar(tree.scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(tree.x, tree.y + height * 0.62, tree.z);
    dummy.rotation.set(0, tree.rot, 0);
    dummy.scale.set(height * 0.46 * tree.wide, height * 0.36, height * 0.46 * tree.wide);
    dummy.updateMatrix();
    volumes.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.22 + tree.hue, 0.48, 0.32);
    volumes.setColorAt(i, color);
  });
  trunks.count = trees.length;
  volumes.count = trees.length;
  trunks.visible = false;
  trunks.castShadow = false;
  volumes.castShadow = true;
  volumes.receiveShadow = false;
  trunks.frustumCulled = false;
  volumes.frustumCulled = false;

  const shrubSpots = placeShrubs();
  const shrubs = new InstancedMesh(quad, shrubMat, shrubSpots.length);
  for (let i = 0; i < shrubSpots.length; i += 1) {
    const spot = shrubSpots[i];
    dummy.position.set(spot.x, spot.y, spot.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(sprites.grass.width * spot.scale * 2.1, sprites.grass.height * spot.scale * 1.8, 1);
    dummy.updateMatrix();
    shrubs.setMatrixAt(i, dummy.matrix);
  }
  shrubs.castShadow = false;
  shrubs.receiveShadow = false;
  shrubs.frustumCulled = false;

  const blades = placeGrass();
  const grass = new InstancedMesh(quad, grassMat, blades.length);
  for (let i = 0; i < blades.length; i += 1) {
    const blade = blades[i];
    dummy.position.set(blade.x, blade.y, blade.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(sprites.grass.width * blade.scale, sprites.grass.height * blade.scale, 1);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    color.setRGB(0.9 + blade.hue, 0.98, 0.86);
    grass.setColorAt(i, color);
  }
  grass.receiveShadow = false;
  grass.castShadow = false;
  grass.frustumCulled = false;

  const wheatSpots = placeWheat();
  const wheatMat = billboardMaterial(sprites.wheat.map);
  const wheat = new InstancedMesh(quad, wheatMat, Math.max(1, wheatSpots.length));
  for (let i = 0; i < wheatSpots.length; i += 1) {
    const blade = wheatSpots[i];
    dummy.position.set(blade.x, blade.y, blade.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(sprites.wheat.width * blade.scale, sprites.wheat.height * blade.scale, 1);
    dummy.updateMatrix();
    wheat.setMatrixAt(i, dummy.matrix);
  }
  wheat.count = wheatSpots.length;
  wheat.receiveShadow = false;
  wheat.castShadow = false;
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
    if (y < WATER_Y + 0.45 || y > 16 || slopeAt(x, z) > 0.72 || inClearing(x, z) || inCrop(x, z)) return;
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
  for (let i = 0; i < 70; i += 1) add(-28 + rand() * 16, -6 + rand() * 48, 0.9 + rand() * 0.45);
  for (let i = 0; i < 28; i += 1) add(home.x + 10 + rand() * 14, home.z + 14 + rand() * 18, 1.05 + rand() * 0.4);
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
  const rand = mulberry32(77);
  const spots: Spot[] = [];
  for (const plot of crops()) {
    for (let z = plot.z - plot.hz + 0.25; z <= plot.z + plot.hz - 0.25; z += 0.46) {
      for (let x = plot.x - plot.hx + 0.25; x <= plot.x + plot.hx - 0.25; x += 0.42) {
        const px = x + (rand() - 0.5) * 0.12;
        const pz = z + (rand() - 0.5) * 0.12;
        spots.push({
          x: px,
          y: computeHeight(px, pz) + 0.02,
          z: pz,
          rot: rand() * Math.PI,
          scale: 0.85 + rand() * 0.4,
          wide: 1,
          hue: 0,
        });
      }
    }
  }
  return spots;
}

function placeGrass(): Spot[] {
  const rand = mulberry32(41);
  const home = settlement();
  const spots: Spot[] = [];
  const stride = 1.05;
  for (let z = home.z - 48; z < home.z + 48 && spots.length < 7000; z += stride) {
    for (let x = home.x - 55; x < home.x + 40 && spots.length < 7000; x += stride) {
      if (rand() > 0.62) continue;
      const px = x + (rand() - 0.5) * stride * 1.4;
      const pz = z + (rand() - 0.5) * stride * 1.4;
      const y = computeHeight(px, pz);
      if (y < WATER_Y + 0.25 || slopeAt(px, pz) > 0.62) continue;
      const [grass, dirt] = splatWeights(px, pz);
      if (grass < 0.3 || dirt > 0.72) continue;
      if (inCrop(px, pz)) continue;
      const yard = Math.hypot(px - (home.x - 1), pz - home.z) < 8.5;
      if (yard && rand() > 0.1) continue;
      if (inClearing(px, pz) && rand() > 0.5) continue;
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
