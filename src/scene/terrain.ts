import * as THREE from 'three';
import { heightAt } from '../noise';
import { createTerrainTextures } from '../voxels/textures';

const STEP = 2;
const NX = 60;
const NY = 18;
const NZ = 60;

function density(ix: number, iy: number, iz: number): number {
  const x = ix * STEP;
  const y = iy * STEP;
  const z = iz * STEP;
  return heightAt(x, z) - y;
}

export function createTerrain(mode: 'net' | 'height'): THREE.Mesh {
  const geometry = mode === 'height' ? heightfieldGeometry() : surfaceNetGeometry();
  const maps = createTerrainTextures();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.94,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrass = { value: maps.grass };
    shader.uniforms.uDirt = { value: maps.dirt };
    shader.uniforms.uRock = { value: maps.rock };
    shader.uniforms.uFogColor = { value: new THREE.Color(0xd7c3a4) };
    shader.uniforms.uFogDensity = { value: 0.0065 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWpos;\nvarying vec3 vWnormal;')
      .replace(
        '#include <project_vertex>',
        'vWpos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWnormal = normalize(mat3(modelMatrix) * objectNormal);\n#include <project_vertex>',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWpos;
        varying vec3 vWnormal;
        uniform sampler2D uGrass;
        uniform sampler2D uDirt;
        uniform sampler2D uRock;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        vec3 triplanar(sampler2D tex, vec3 p, vec3 n, float s) {
          vec3 b = pow(abs(normalize(n)), vec3(4.0));
          b /= max(b.x + b.y + b.z, 0.0001);
          return texture2D(tex, p.zy * s).rgb * b.x
            + texture2D(tex, p.xz * s).rgb * b.y
            + texture2D(tex, p.xy * s).rgb * b.z;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 wn = normalize(vWnormal);
        float slope = 1.0 - wn.y;
        vec3 grass = triplanar(uGrass, vWpos, wn, 0.16);
        vec3 dirt = triplanar(uDirt, vWpos, wn, 0.2);
        vec3 rock = triplanar(uRock, vWpos, wn, 0.12);
        float rockW = smoothstep(0.32, 0.62, slope);
        vec3 albedo = mix(grass, dirt, smoothstep(10.5, 7.4, vWpos.y));
        albedo = mix(albedo, rock, rockW);
        vec2 a = vec2(34.0, 102.0);
        vec2 b = vec2(58.0, 78.0);
        vec2 pv = vWpos.xz - a;
        vec2 dir = b - a;
        float t = clamp(dot(pv, dir) / dot(dir, dir), 0.0, 1.0);
        float pathDist = length(pv - dir * t);
        albedo = mix(albedo, dirt * 0.82, smoothstep(3.2, 1.1, pathDist));
        diffuseColor.rgb *= albedo;`,
      )
      .replace(
        '#include <fog_fragment>',
        `float dist = length(vWpos - cameraPosition);
        float low = 1.0 - smoothstep(7.2, 11.5, vWpos.y);
        float f = 1.0 - exp(-dist * uFogDensity);
        f = clamp(f * 0.72 + low * 0.22, 0.0, 0.5);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor, f);`,
      );
  };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

function heightfieldGeometry(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(NX * STEP, NZ * STEP, NX, NZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + (NX * STEP) / 2;
    const z = pos.getZ(i) + (NZ * STEP) / 2;
    pos.setY(i, heightAt(x, z));
    pos.setX(i, x);
    pos.setZ(i, z);
  }
  geo.computeVertexNormals();
  return geo;
}

function surfaceNetGeometry(): THREE.BufferGeometry {
  const nx = NX;
  const ny = NY;
  const nz = NZ;
  const pot = new Float32Array((nx + 1) * (ny + 1) * (nz + 1));
  const pidx = (x: number, y: number, z: number) => x + (nx + 1) * (y + (ny + 1) * z);
  for (let z = 0; z <= nz; z++) {
    for (let y = 0; y <= ny; y++) {
      for (let x = 0; x <= nx; x++) pot[pidx(x, y, z)] = density(x, y, z);
    }
  }
  const vindex = new Int32Array(nx * ny * nz).fill(-1);
  const positions: number[] = [];
  const corners: Array<[number, number, number]> = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const edges: Array<[number, number]> = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const dvals = corners.map(([cx, cy, cz]) => pot[pidx(x + cx, y + cy, z + cz)]);
        let inside = 0;
        let outside = 0;
        for (const d of dvals) {
          if (d > 0) inside++;
          else outside++;
        }
        if (inside === 0 || outside === 0) continue;
        let ax = 0;
        let ay = 0;
        let az = 0;
        let count = 0;
        for (const [a, b] of edges) {
          const da = dvals[a];
          const db = dvals[b];
          if ((da > 0) === (db > 0)) continue;
          const t = da / (da - db);
          const ca = corners[a];
          const cb = corners[b];
          ax += ca[0] + (cb[0] - ca[0]) * t;
          ay += ca[1] + (cb[1] - ca[1]) * t;
          az += ca[2] + (cb[2] - ca[2]) * t;
          count++;
        }
        if (!count) continue;
        vindex[x + nx * (y + ny * z)] = positions.length / 3;
        positions.push((x + ax / count) * STEP, (y + ay / count) * STEP, (z + az / count) * STEP);
      }
    }
  }
  const indices: number[] = [];
  const cell = (x: number, y: number, z: number) => {
    if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return -1;
    return vindex[x + nx * (y + ny * z)];
  };
  const emit = (i0: number, i1: number, i2: number, i3: number, gx: number, gy: number, gz: number) => {
    if (i0 < 0 || i1 < 0 || i2 < 0 || i3 < 0) return;
    const ax = positions[i1 * 3] - positions[i0 * 3];
    const ay = positions[i1 * 3 + 1] - positions[i0 * 3 + 1];
    const az = positions[i1 * 3 + 2] - positions[i0 * 3 + 2];
    const bx = positions[i2 * 3] - positions[i0 * 3];
    const by = positions[i2 * 3 + 1] - positions[i0 * 3 + 1];
    const bz = positions[i2 * 3 + 2] - positions[i0 * 3 + 2];
    const nx0 = ay * bz - az * by;
    const ny0 = az * bx - ax * bz;
    const nz0 = ax * by - ay * bx;
    const solid = density(gx, gy, gz);
    const air = density(gx, gy + 0.35, gz);
    const wantUp = air < solid;
    const pointsUp = ny0 > 0;
    if (wantUp === pointsUp) indices.push(i0, i1, i2, i0, i2, i3);
    else indices.push(i0, i2, i1, i0, i3, i2);
  };
  for (let z = 1; z < nz; z++) {
    for (let y = 1; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const a = pot[pidx(x, y, z)];
        const b = pot[pidx(x + 1, y, z)];
        if ((a > 0) === (b > 0)) continue;
        emit(cell(x, y - 1, z - 1), cell(x, y, z - 1), cell(x, y, z), cell(x, y - 1, z), x + 0.5, y, z);
      }
    }
  }
  for (let z = 1; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 1; x < nx; x++) {
        const a = pot[pidx(x, y, z)];
        const b = pot[pidx(x, y + 1, z)];
        if ((a > 0) === (b > 0)) continue;
        emit(cell(x - 1, y, z - 1), cell(x, y, z - 1), cell(x, y, z), cell(x - 1, y, z), x, y + 0.5, z);
      }
    }
  }
  for (let z = 0; z < nz; z++) {
    for (let y = 1; y < ny; y++) {
      for (let x = 1; x < nx; x++) {
        const a = pot[pidx(x, y, z)];
        const b = pot[pidx(x, y, z + 1)];
        if ((a > 0) === (b > 0)) continue;
        emit(cell(x - 1, y - 1, z), cell(x, y - 1, z), cell(x, y, z), cell(x - 1, y, z), x, y, z + 0.5);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  if (indices.length < 300) return heightfieldGeometry();
  return geo;
}
