import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  FrontSide,
  IcosahedronGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD, computeHeight, inClearing, settlement, slopeAt, splatWeights, WATER_Y } from './field';
import { lit } from './lit';
import { mulberry32, noise2 } from './noise';
import type { Library } from './textures';

const windTime = { value: 0 };

export function foliageTime(): { value: number } {
  return windTime;
}

export function createFoliage(library: Library): {
  trunks: InstancedMesh;
  canopies: InstancedMesh;
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
  const leaf = lit(
    {
      color: 0x8ea24a,
      roughness: 0.86,
      metalness: 0,
      vertexColors: true,
      envMapIntensity: 0.3,
    },
    (material) => bindWind(material, 0.04),
  );
  const shrubMat = lit(
    {
      color: 0x6f8a3c,
      roughness: 0.9,
      metalness: 0,
      vertexColors: true,
    },
    (material) => bindWind(material, 0.03),
  );
  const grassMat = lit(
    {
      map: library.grassClump,
      alphaTest: 0.45,
      roughness: 0.9,
      metalness: 0,
      side: DoubleSide,
      shadowSide: FrontSide,
      vertexColors: true,
    },
    (material) => bindWind(material, 0.16, true),
  );

  const canopyGeo = leafGeometry();
  const shrubGeo = leafGeometry();
  shrubGeo.scale(0.7, 0.55, 0.7);
  const trunkGeo = new CylinderGeometry(0.16, 0.3, 2.3, 6);
  trunkGeo.translate(0, 1.15, 0);

  const trees = placeTrees();
  const trunks = new InstancedMesh(trunkGeo, wood, trees.length);
  const canopies = new InstancedMesh(canopyGeo, leaf, trees.length);
  const dummy = new Object3D();
  const color = new Color();
  for (let i = 0; i < trees.length; i += 1) {
    const tree = trees[i];
    dummy.position.set(tree.x, tree.y, tree.z);
    dummy.rotation.set(0, tree.rot, 0);
    dummy.scale.setScalar(tree.scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(tree.x, tree.y + 2.05 * tree.scale, tree.z);
    dummy.scale.set(tree.scale * tree.wide, tree.scale * 0.82, tree.scale * tree.wide);
    dummy.updateMatrix();
    canopies.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.22 + tree.hue, 0.48, 0.32);
    canopies.setColorAt(i, color);
  }
  trunks.castShadow = true;
  trunks.receiveShadow = true;
  canopies.castShadow = true;
  canopies.receiveShadow = true;
  trunks.frustumCulled = false;
  canopies.frustumCulled = false;

  const shrubSpots = placeShrubs();
  const shrubs = new InstancedMesh(shrubGeo, shrubMat, shrubSpots.length);
  for (let i = 0; i < shrubSpots.length; i += 1) {
    const spot = shrubSpots[i];
    dummy.position.set(spot.x, spot.y + 0.25 * spot.scale, spot.z);
    dummy.rotation.set(0, spot.rot, 0);
    dummy.scale.setScalar(spot.scale);
    dummy.updateMatrix();
    shrubs.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.2 + spot.hue, 0.32, 0.28);
    shrubs.setColorAt(i, color);
  }
  shrubs.castShadow = true;
  shrubs.receiveShadow = true;
  shrubs.frustumCulled = false;

  const blades = placeGrass();
  const grass = new InstancedMesh(grassGeometry(), grassMat, blades.length);
  for (let i = 0; i < blades.length; i += 1) {
    const blade = blades[i];
    dummy.position.set(blade.x, blade.y, blade.z);
    dummy.rotation.set(0, blade.rot, 0);
    dummy.scale.setScalar(blade.scale * 1.7);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.28 + blade.hue, 0.55, 0.42);
    grass.setColorAt(i, color);
  }
  grass.receiveShadow = true;
  grass.frustumCulled = false;

  const wheatSpots = placeWheat();
  const wheatMat = lit(
    {
      map: library.grassClump,
      color: 0xe0b24a,
      alphaTest: 0.4,
      roughness: 0.85,
      metalness: 0,
      side: DoubleSide,
      shadowSide: FrontSide,
    },
    (material) => bindWind(material, 0.2, true),
  );
  const wheat = new InstancedMesh(grassGeometry(), wheatMat, Math.max(1, wheatSpots.length));
  for (let i = 0; i < wheatSpots.length; i += 1) {
    const blade = wheatSpots[i];
    dummy.position.set(blade.x, blade.y, blade.z);
    dummy.rotation.set(0, blade.rot, 0);
    dummy.scale.set(blade.scale, blade.scale * 1.35, blade.scale);
    dummy.updateMatrix();
    wheat.setMatrixAt(i, dummy.matrix);
  }
  wheat.count = wheatSpots.length;
  wheat.receiveShadow = true;
  wheat.frustumCulled = false;
  return { trunks, canopies, shrubs, grass, wheat };
}

function bindWind(material: MeshStandardMaterial, amount: number, liftNormal = false): void {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.uniforms.uTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\n`)
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3(position);
         #ifdef USE_INSTANCING
           vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
         #else
           vec3 iPos = vec3(0.0);
         #endif
         float tip = smoothstep(0.0, 1.0, position.y);
         float sway = sin(uTime * 1.5 + iPos.x * 0.37 + iPos.z * 0.29);
         transformed.x += sway * tip * ${amount.toFixed(3)};
         transformed.z += cos(uTime * 1.15 + iPos.z * 0.41) * tip * ${(amount * 0.65).toFixed(3)};`,
      );
    if (liftNormal) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `vec3 objectNormal = normalize(mix(vec3(normal), vec3(0.0, 1.0, 0.0), 0.7));
         #ifdef USE_TANGENT
           vec3 objectTangent = vec3(tangent.xyz);
         #endif`,
      );
    }
  };
}

function leafGeometry(): BufferGeometry {
  const lobes: Array<[number, number, number, number, number, number]> = [
    [0, 0.35, 0, 1.05, 0.78, 1.0],
    [0.72, 0.15, 0.18, 0.7, 0.55, 0.68],
    [-0.68, 0.12, 0.22, 0.66, 0.52, 0.64],
    [0.12, 0.55, -0.58, 0.62, 0.5, 0.6],
    [-0.08, 0.05, 0.7, 0.58, 0.46, 0.56],
  ];
  const parts = lobes.map(([x, y, z, sx, sy, sz]) => {
    const geometry = new IcosahedronGeometry(1, 3);
    geometry.scale(sx, sy, sz);
    geometry.translate(x, y, z);
    return geometry;
  });
  const geometry = mergeGeometries(parts, false);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const n = noise2(x * 1.6, z * 1.6);
    const shade = Math.max(0.42, Math.min(1, 0.5 + y * 0.38 + n * 0.12));
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade * 0.98;
    colors[i * 3 + 2] = shade * 0.82;
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

function grassGeometry(): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const blades = [0, Math.PI / 2, Math.PI / 5];
  let vertex = 0;
  for (const rot of blades) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const corners = [
      [-0.14, 0, 0],
      [0.14, 0, 0],
      [0.07, 0.78, 0.04],
      [-0.07, 0.78, 0.04],
    ];
    const uv = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    for (let i = 0; i < 4; i += 1) {
      const corner = corners[i];
      positions.push(corner[0] * c - corner[2] * s, corner[1], corner[0] * s + corner[2] * c);
      uvs.push(uv[i][0], uv[i][1]);
      const shade = 0.4 + 0.6 * (corner[1] / 0.78);
      colors.push(shade, shade, shade);
    }
    indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3);
    vertex += 4;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
