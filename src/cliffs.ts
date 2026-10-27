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

  const cliff = new Mesh(cliffGeometry(), material);
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
  const steps = 160;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const bands = 5;
  const pushWall = (inset: number, topDrop: number) => {
    for (let i = 0; i < steps; i += 1) {
      const z0 = -WORLD / 2 + (i / steps) * WORLD;
      const z1 = -WORLD / 2 + ((i + 1) / steps) * WORLD;
      const x0 = cliffEdgeX(z0) + inset + (noise2(z0 * 0.17, 1.2) - 0.5) * 1.3;
      const x1 = cliffEdgeX(z1) + inset + (noise2(z1 * 0.17, 1.2) - 0.5) * 1.3;
      const top0 = computeHeight(x0 - 3.2, z0) - topDrop;
      const top1 = computeHeight(x1 - 3.2, z1) - topDrop;
      const bot0 = computeHeight(x0 + 6.5, z0) - 0.15;
      const bot1 = computeHeight(x1 + 6.5, z1) - 0.15;
      if (top0 < bot0 + 0.8 || top1 < bot1 + 0.8) continue;
      for (let band = 0; band < bands; band += 1) {
        const t0 = band / bands;
        const t1 = (band + 1) / bands;
        const ledge = (noise2(z0 * 0.23 + band, 4.2) - 0.35) * 1.7;
        const ledge1 = (noise2(z1 * 0.23 + band, 4.2) - 0.35) * 1.7;
        const y0a = bot0 + (top0 - bot0) * t0;
        const y0b = bot0 + (top0 - bot0) * t1;
        const y1a = bot1 + (top1 - bot1) * t0;
        const y1b = bot1 + (top1 - bot1) * t1;
        const base = positions.length / 3;
        positions.push(
          x0 + ledge, y0a, z0,
          x1 + ledge1, y1a, z1,
          x1 + ledge1, y1b, z1,
          x0 + ledge, y0b, z0,
        );
        const u0 = i * 0.55;
        uvs.push(u0, t0 * 3.2, u0 + 0.55, t0 * 3.2, u0 + 0.55, t1 * 3.2, u0, t1 * 3.2);
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
  };

  pushWall(0.2, 0.2);
  pushWall(1.35, 1.6);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
