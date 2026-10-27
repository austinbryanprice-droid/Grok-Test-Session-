import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt } from '../noise';
import { createMaterialArray } from './textures';

export const BEVEL = 0.08;

export type ShapeName = 'box' | 'slab' | 'wedge' | 'gable';

interface Stamp {
  x: number;
  y: number;
  z: number;
  shape: ShapeName;
  mat: number;
  rot: number;
  scale: [number, number, number];
}

const boxGeo = new RoundedBoxGeometry(1, 1, 1, 2, BEVEL);
const slabGeo = new RoundedBoxGeometry(1, 0.5, 1, 2, BEVEL * 0.75);

function extruded(profile: THREE.Vector2[]): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(profile[0].x, profile[0].y);
  for (let i = 1; i < profile.length; i++) shape.lineTo(profile[i].x, profile[i].y);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 1,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.035,
    bevelSegments: 1,
    steps: 1,
  });
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (!box) return geo;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  geo.translate(-center.x, -center.y, -center.z);
  geo.scale(1 / Math.max(size.x, 0.001), 1 / Math.max(size.y, 0.001), 1 / Math.max(size.z, 0.001));
  return geo;
}

const wedgeGeo = extruded([
  new THREE.Vector2(-0.5, -0.5),
  new THREE.Vector2(0.5, -0.5),
  new THREE.Vector2(-0.5, 0.5),
]);
const gableGeo = extruded([
  new THREE.Vector2(-0.5, -0.5),
  new THREE.Vector2(0.5, -0.5),
  new THREE.Vector2(0, 0.5),
]);

function baseGeometry(shape: ShapeName): THREE.BufferGeometry {
  if (shape === 'slab') return slabGeo;
  if (shape === 'wedge') return wedgeGeo;
  if (shape === 'gable') return gableGeo;
  return boxGeo;
}

function keyOf(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function pushCottage(stamps: Stamp[], ox: number, oy: number, oz: number, rot: number): void {
  const local: Stamp[] = [];
  const add = (x: number, y: number, z: number, shape: ShapeName, mat: number, blockRot = 0, scale: [number, number, number] = [1, 1, 1]) => {
    local.push({ x, y, z, shape, mat, rot: blockRot, scale });
  };
  for (let z = 0; z < 5; z++) {
    for (let x = 0; x < 6; x++) add(x, 0, z, 'box', 1);
  }
  for (let y = 1; y <= 3; y++) {
    for (let x = 0; x < 6; x++) {
      for (let z = 0; z < 5; z++) {
        const edge = x === 0 || z === 0 || x === 5 || z === 4;
        if (!edge) continue;
        const door = z === 0 && (x === 2 || x === 3) && y < 3;
        const window = z === 0 && (x === 1 || x === 4) && y === 2;
        if (door || window) continue;
        const post = x % 2 === 0 || z % 2 === 0 || y === 3;
        add(x, y, z, 'box', post ? 0 : 2);
      }
    }
    for (let x = 1; x <= 4; x++) add(x, y === 1 ? 1 : 3, 2, 'slab', 0);
  }
  add(-0.15, 2.15, -0.55, 'slab', 0, 0, [1.1, 0.7, 0.7]);
  add(4.15, 2.15, -0.55, 'slab', 0, 0, [1.1, 0.7, 0.7]);
  add(2.5, 4.85, 0.85, 'wedge', 4, Math.PI / 2, [2.7, 2.35, 6.3]);
  add(2.5, 4.85, 3.15, 'wedge', 4, -Math.PI / 2, [2.7, 2.35, 6.3]);
  add(0.05, 4.85, 2, 'gable', 2, Math.PI / 2, [2.55, 2.35, 0.42]);
  add(4.95, 4.85, 2, 'gable', 2, -Math.PI / 2, [2.55, 2.35, 0.42]);
  for (let y = 1; y <= 6; y++) add(1, y, 1, 'box', 1);
  add(1, 6.2, 1, 'box', 3, 0, [0.7, 0.45, 0.7]);

  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (const block of local) {
    const dx = block.x - 2.5;
    const dz = block.z - 2;
    stamps.push({
      ...block,
      x: ox + dx * c - dz * s,
      y: oy + block.y,
      z: oz + dx * s + dz * c,
      rot: block.rot + rot,
    });
  }
}

function buildStamps(): Stamp[] {
  const stamps: Stamp[] = [];
  const sites: Array<[number, number, number]> = [
    [58, 78, -Math.PI / 2],
    [66, 84, 1.1],
    [50, 86, -0.5],
    [70, 74, 2.2],
    [54, 70, 0.2],
  ];
  for (const [x, z, rot] of sites) {
    const y = Math.round(heightAt(x, z));
    pushCottage(stamps, x, y, z, rot);
  }
  for (let i = 0; i < 8; i++) {
    const x = 52 + (i % 4) * 1;
    const z = 74;
    stamps.push({
      x,
      y: heightAt(x, z) + 1.2,
      z,
      shape: 'box',
      mat: 0,
      rot: 0.2,
      scale: [1, 1, 1],
    });
  }
  return stamps;
}

export function createBlockMaterial(arrayMap: THREE.DataArrayTexture): THREE.MeshStandardMaterial {
  const dummy = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  dummy.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({
    map: dummy,
    roughness: 0.8,
    metalness: 0,
    vertexColors: true,
    emissive: new THREE.Color(0x222222),
    emissiveIntensity: 1,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.arrayMap = { value: arrayMap };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLayer;\nvarying float vLayer;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvLayer = aLayer;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2DArray arrayMap;\nvarying float vLayer;')
      .replace(
        '#include <map_fragment>',
        `vec4 sampledDiffuseColor = texture(arrayMap, vec3(vMapUv, vLayer));
        diffuseColor *= sampledDiffuseColor;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness;
        float metalnessFactor = metalness;
        float layer = floor(vLayer + 0.5);
        if (layer < 0.5) roughnessFactor = 0.72;
        else if (layer < 1.5) roughnessFactor = 0.92;
        else if (layer < 2.5) roughnessFactor = 0.84;
        else if (layer < 3.5) { roughnessFactor = 0.28; metalnessFactor = 0.82; }
        else roughnessFactor = 0.86;`,
      )
      .replace('#include <metalnessmap_fragment>', '')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (floor(vLayer + 0.5) > 2.5 && floor(vLayer + 0.5) < 3.5) {
          totalEmissiveRadiance += vec3(0.22, 0.24, 0.26);
        }`,
      );
  };
  return material;
}

export function createBlockMesh(shape: ShapeName, layer: number, material: THREE.Material): THREE.Mesh {
  const geo = baseGeometry(shape).clone();
  const count = geo.attributes.position.count;
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  geo.setAttribute('aLayer', new THREE.BufferAttribute(new Float32Array(count).fill(layer), 1));
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const seam = shape === 'box' || shape === 'slab' ? 0.965 : 1;
  mesh.scale.setScalar(seam);
  mesh.name = 'player-block';
  return mesh;
}

export function createStructures(arrayMap: THREE.DataArrayTexture): { mesh: THREE.Mesh; material: THREE.MeshStandardMaterial } {
  const material = createBlockMaterial(arrayMap);
  const stamps = buildStamps();
  const occupied = new Set<string>();
  for (const s of stamps) {
    if (s.shape === 'box') occupied.add(keyOf(Math.round(s.x), Math.round(s.y), Math.round(s.z)));
  }
  const geos: THREE.BufferGeometry[] = [];
  const tint = new THREE.Color();
  for (const stamp of stamps) {
    const src = baseGeometry(stamp.shape);
    const geo = src.clone();
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const layers = new Float32Array(pos.count);
    const cx = Math.round(stamp.x);
    const cy = Math.round(stamp.y);
    const cz = Math.round(stamp.z);
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const ly = pos.getY(i);
      const lz = pos.getZ(i);
      const sx = Math.sign(lx) || 1;
      const sy = Math.sign(ly) || 1;
      const sz = Math.sign(lz) || 1;
      const neighbors = [
        [sx, 0, 0], [0, sy, 0], [0, 0, sz],
        [sx, sy, 0], [sx, 0, sz], [0, sy, sz],
        [sx, sy, sz],
      ];
      let occ = 0;
      for (const [dx, dy, dz] of neighbors) {
        if (occupied.has(keyOf(cx + dx, cy + dy, cz + dz))) occ++;
      }
      let shade = 1 - (occ / 7) * 0.62;
      const belowEmpty = !occupied.has(keyOf(cx, cy - 1, cz));
      if (ly < -0.15 && belowEmpty) shade *= 0.62;
      tint.setRGB(shade, shade, shade);
      colors[i * 3] = tint.r;
      colors[i * 3 + 1] = tint.g;
      colors[i * 3 + 2] = tint.b;
      layers[i] = stamp.mat;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aLayer', new THREE.BufferAttribute(layers, 1));
    if (geo.getAttribute('uv2')) geo.deleteAttribute('uv2');
    const seam = stamp.shape === 'box' || stamp.shape === 'slab' ? 0.965 : 1;
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(stamp.x, stamp.y, stamp.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, stamp.rot, 0)),
      new THREE.Vector3(stamp.scale[0] * seam, stamp.scale[1] * seam, stamp.scale[2] * seam),
    );
    geo.applyMatrix4(matrix);
    geos.push(geo);
  }
  const merged = mergeGeometries(geos, false);
  if (!merged) throw new Error('Failed to merge structure geometry');
  geos.forEach((geo) => geo.dispose());
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'structures';
  return { mesh, material };
}

export function structureMaterialArray(): THREE.DataArrayTexture {
  return createMaterialArray();
}
