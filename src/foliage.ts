import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedMesh,
  LinearFilter,
  MeshStandardMaterial,
  Object3D,
  Points,
  PointsMaterial,
  SRGBColorSpace,
} from 'three';
import { GRASS, WORLD_X, WORLD_Z } from './blocks';
import { atlasUV } from './blocks';
import { mulberry32 } from './noise';
import { tuning } from './tuning';

function crossGeometry(height: number, width: number, tile: number): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const local: number[] = [];
  const indices: number[] = [];
  const push = (ax: number, az: number, bx: number, bz: number) => {
    const base = positions.length / 3;
    positions.push(ax, 0, az, bx, 0, bz, bx, height, bz, ax, height, az);
    const ex = bx - ax;
    const ez = bz - az;
    const nx = -ez;
    const nz = ex;
    for (let i = 0; i < 4; i += 1) normals.push(nx, 0, nz);
    const uv00 = atlasUV(tile, 0.08, 0.05);
    const uv10 = atlasUV(tile, 0.92, 0.05);
    const uv11 = atlasUV(tile, 0.92, 0.95);
    const uv01 = atlasUV(tile, 0.08, 0.95);
    uvs.push(...uv00, ...uv10, ...uv11, ...uv01);
    local.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  push(-width, 0, width, 0);
  push(0, -width, 0, width);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geo.setAttribute('aLocal', new Float32BufferAttribute(local, 2));
  geo.setIndex(indices);
  return geo;
}

function swayMaterial(map: MeshStandardMaterial['map'], discardPetal: boolean): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    map: map ?? undefined,
    roughness: 0.85,
    metalness: 0,
    vertexColors: true,
    side: DoubleSide,
  });
  material.toneMapped = false;
  material.customProgramCacheKey = () => (discardPetal ? 'petal' : 'grass');
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = swayTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uTime;\nattribute vec2 aLocal;\nvarying vec2 vLocal;',
      )
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n vLocal = aLocal;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         #ifdef USE_INSTANCING
           float sway = sin(uTime * 1.7 + instanceMatrix[3].x * 0.65 + instanceMatrix[3].z * 0.45) * transformed.y;
           transformed.x += sway * 0.22;
           transformed.z += cos(uTime * 1.25 + instanceMatrix[3].z * 0.5) * transformed.y * 0.14;
         #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLocal;')
      .replace(
        '#include <alphatest_fragment>',
        `#include <alphatest_fragment>
         float edge = abs(vLocal.x - 0.5);
         float halfW = mix(${discardPetal ? '0.12' : '0.05'}, ${discardPetal ? '0.5' : '0.46'}, vLocal.y);
         float blade = smoothstep(halfW, halfW - 0.1, edge) * smoothstep(0.0, 0.07, vLocal.y);
         if (blade < 0.35) discard;`,
      );
  };
  return material;
}

export const swayTime = { value: 0 };

export function createFoliage(
  atlasMap: MeshStandardMaterial['map'],
  groundId: (x: number, z: number) => number,
  groundTop: (x: number, z: number) => number,
): { grass: InstancedMesh; flowers: InstancedMesh } {
  const rand = mulberry32(99);
  const spots: Array<{ x: number; y: number; z: number; s: number; flower: boolean; color: Color }> = [];
  for (let z = 2; z < WORLD_Z - 2; z += 1) {
    for (let x = 2; x < WORLD_X - 2; x += 1) {
      if (groundId(x, z) !== GRASS) continue;
      if (rand() > 0.42) continue;
      const y = groundTop(x, z);
      if (y < tuning.waterY) continue;
      const flower = rand() > 0.86;
      const g = 0.78 + rand() * 0.35;
      const color = flower
        ? new Color().setHSL(rand() > 0.5 ? 0.1 + rand() * 0.08 : 0.86 + rand() * 0.08, 0.65, 0.62)
        : new Color(0.62 * g, g, 0.32 * g);
      spots.push({
        x: x + 0.2 + rand() * 0.6,
        y,
        z: z + 0.2 + rand() * 0.6,
        s: 0.65 + rand() * 0.7,
        flower,
        color,
      });
    }
  }
  const grassSpots = spots.filter((s) => !s.flower).slice(0, 2400);
  const flowerSpots = spots.filter((s) => s.flower).slice(0, 280);
  const dummy = new Object3D();

  const grassMat = swayMaterial(atlasMap, false);
  const grass = new InstancedMesh(crossGeometry(0.62, 0.22, 0), grassMat, grassSpots.length);
  grassSpots.forEach((s, i) => {
    dummy.position.set(s.x, s.y, s.z);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.setScalar(s.s);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    grass.setColorAt(i, s.color);
  });
  grass.castShadow = false;
  grass.receiveShadow = true;
  grass.frustumCulled = false;

  const flowerMat = swayMaterial(null, true);
  const flowers = new InstancedMesh(crossGeometry(0.38, 0.16, 0), flowerMat, Math.max(1, flowerSpots.length));
  flowerSpots.forEach((s, i) => {
    dummy.position.set(s.x, s.y, s.z);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.setScalar(s.s);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    flowers.setColorAt(i, s.color);
  });
  flowers.count = flowerSpots.length;
  flowers.castShadow = false;
  flowers.receiveShadow = true;
  flowers.frustumCulled = false;
  return { grass, flowers };
}

function softDot(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not draw the dust sprite.');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function createDust(): { points: Points; update: (dt: number) => void } {
  const count = 420;
  const positions = new Float32Array(count * 3);
  const rand = mulberry32(7);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = rand() * WORLD_X;
    positions[i * 3 + 1] = 4 + rand() * 16;
    positions[i * 3 + 2] = rand() * WORLD_Z;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const material = new PointsMaterial({
    color: 0xffe2b0,
    size: 0.16,
    map: softDot(),
    transparent: true,
    opacity: 0.55,
    blending: AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  material.toneMapped = false;
  const points = new Points(geo, material);
  points.frustumCulled = false;
  const pos = geo.getAttribute('position') as Float32BufferAttribute;
  return {
    points,
    update: (dt: number) => {
      for (let i = 0; i < count; i += 1) {
        let x = pos.getX(i) + dt * 0.35;
        let y = pos.getY(i) + dt * (0.12 + (i % 5) * 0.02);
        let z = pos.getZ(i) + dt * 0.18 * Math.sin(i);
        if (x > WORLD_X) x -= WORLD_X;
        if (z > WORLD_Z) z -= WORLD_Z;
        if (z < 0) z += WORLD_Z;
        if (y > 22) y = 4;
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
    },
  };
}
