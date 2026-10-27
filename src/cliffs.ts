import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  Object3D,
} from 'three';
import { WORLD, cliffEdgeX, computeHeight, settlement } from './field';
import { lit } from './lit';
import { mulberry32, noise2 } from './noise';
import type { Library } from './textures';

export function createCliffs(library: Library): { cliff: Mesh; rocks: InstancedMesh } {
  const material = lit({
    map: library.rock.color,
    normalMap: library.rock.normal,
    roughnessMap: library.rock.rough,
    roughness: 1,
    metalness: 0,
    side: DoubleSide,
    envMapIntensity: 0.35,
  });
  material.normalScale.set(1.25, 1.25);
  const cliffMat = lit({
    map: library.rock.color,
    normalMap: library.rock.normal,
    roughnessMap: library.rock.rough,
    roughness: 1,
    metalness: 0,
    side: DoubleSide,
    envMapIntensity: 0.35,
    vertexColors: true,
  });
  cliffMat.normalScale.set(1.4, 1.4);

  const cliff = new Mesh(cliffGeometry(), cliffMat);
  cliff.castShadow = true;
  cliff.receiveShadow = true;

  const rockGeo = new IcosahedronGeometry(1, 1);
  const position = rockGeo.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const n = noise2(x * 2.4 + 4, z * 2.1);
    position.setXYZ(i, x * (0.75 + n * 0.55), y * (0.55 + n * 0.35), z * (0.8 + n * 0.4));
  }
  rockGeo.computeVertexNormals();

  const count = 52;
  const rocks = new InstancedMesh(rockGeo, material, count);
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  rocks.frustumCulled = false;
  const dummy = new Object3D();
  const rand = mulberry32(19);
  const home = settlement();
  let placed = 0;
  for (let i = 0; i < count; i += 1) {
    const z = home.z - 36 + rand() * 78;
    const edge = cliffEdgeX(z);
    const x = edge + 1.5 + rand() * 3.2;
    const y = computeHeight(x, z);
    const scale = 0.7 + rand() * 1.8;
    dummy.position.set(x, y + scale * 0.25, z);
    dummy.rotation.set(rand() * 0.4, rand() * Math.PI * 2, rand() * 0.4);
    dummy.scale.set(scale * (0.8 + rand() * 0.5), scale * (0.45 + rand() * 0.4), scale);
    dummy.updateMatrix();
    rocks.setMatrixAt(placed, dummy.matrix);
    placed += 1;
  }
  rocks.count = placed;
  return { cliff, rocks };
}

function cliffGeometry(): BufferGeometry {
  const steps = 120;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const bands = 6;
  for (let i = 0; i < steps; i += 1) {
    const z0 = -WORLD / 2 + (i / steps) * WORLD;
    const z1 = -WORLD / 2 + ((i + 1) / steps) * WORLD;
    const x0 = cliffEdgeX(z0) + (noise2(z0 * 0.17, 1.2) - 0.5) * 1.6;
    const x1 = cliffEdgeX(z1) + (noise2(z1 * 0.17, 1.2) - 0.5) * 1.6;
    const top0 = computeHeight(x0 - 2.4, z0);
    const top1 = computeHeight(x1 - 2.4, z1);
    const bot0 = computeHeight(x0 + 7.5, z0) - 0.2;
    const bot1 = computeHeight(x1 + 7.5, z1) - 0.2;
    if (top0 < bot0 + 1.2 || top1 < bot1 + 1.2) continue;
    for (let band = 0; band < bands; band += 1) {
      const t0 = band / bands;
      const t1 = (band + 1) / bands;
      const run0 = (1 - t0) * 9.5;
      const run1 = (1 - t1) * 9.5;
      const wobbleBottom = (noise2(z0 * 0.16, t0 * 3.0) - 0.5) * 1.4;
      const wobbleBottom1 = (noise2(z1 * 0.16, t0 * 3.0) - 0.5) * 1.4;
      const wobbleTop = (noise2(z0 * 0.16, t1 * 3.0) - 0.5) * 1.4;
      const wobbleTop1 = (noise2(z1 * 0.16, t1 * 3.0) - 0.5) * 1.4;
      const y0a = bot0 + (top0 - bot0) * t0;
      const y0b = bot0 + (top0 - bot0) * t1;
      const y1a = bot1 + (top1 - bot1) * t0;
      const y1b = bot1 + (top1 - bot1) * t1;
      const lip = band === bands - 1;
      const shade = (band % 2 === 0 ? 0.28 : 1.12) * (0.7 + t1 * 0.4);
      const tint = (z: number, y: number) => {
        if (lip && y > top0 - 1.4) return [0.45 * shade, 0.62 * shade, 0.28 * shade];
        const stain = noise2(z * 0.11, y * 0.2);
        return [0.72 * shade * (0.9 + stain * 0.2), 0.66 * shade, 0.55 * shade];
      };
      const u0 = i * 0.62;
      const pushQuad = (
        corners: Array<[number, number, number]>,
        colorAt: (z: number, y: number) => number[],
        v0: number,
        v1: number,
      ) => {
        const base = positions.length / 3;
        for (const [x, y, z] of corners) {
          positions.push(x, y, z);
          colors.push(...colorAt(z, y));
        }
        uvs.push(u0, v0, u0 + 0.62, v0, u0 + 0.62, v1, u0, v1);
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      };
      pushQuad([
        [x0 + run0 + wobbleBottom, y0a, z0],
        [x1 + run0 + wobbleBottom1, y1a, z1],
        [x1 + run1 + wobbleTop1, y1b, z1],
        [x0 + run1 + wobbleTop, y0b, z0],
      ], tint, t0 * 2.4, t1 * 2.4);
      if (band % 2 === 1) {
        const lipX = 1.8;
        pushQuad([
          [x0 + run0 + wobbleBottom, y0a, z0],
          [x1 + run0 + wobbleBottom1, y1a, z1],
          [x1 + run0 + wobbleBottom1 + lipX, y1a + 0.05, z1],
          [x0 + run0 + wobbleBottom + lipX, y0a + 0.05, z0],
        ], () => [0.95, 0.86, 0.68], 0.1, 0.45);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
