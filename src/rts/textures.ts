import * as THREE from 'three';
import { mulberry32 } from '../noise';
import { frame } from './frame';
import { ENV, MAP_SIZE, hexToRgb } from './palette';

const tracked: THREE.Texture[] = [];

export function applyAnisotropy(renderer: THREE.WebGLRenderer): void {
  const max = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  for (const texture of tracked) {
    if (texture.generateMipmaps) {
      texture.anisotropy = max;
      texture.needsUpdate = true;
    }
  }
}

function track<T extends THREE.Texture>(texture: T): T {
  tracked.push(texture);
  return texture;
}

function paintCanvas(size: number, draw: (ctx: CanvasRenderingContext2D, rand: () => number) => void, seed: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context missing');
  draw(ctx, mulberry32(seed));
  return canvas;
}

function fill(ctx: CanvasRenderingContext2D, hex: number): void {
  const [r, g, b] = hexToRgb(hex);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function strokes(
  ctx: CanvasRenderingContext2D,
  rand: () => number,
  colors: number[],
  count: number,
  minR: number,
  maxR: number,
  alpha: number,
): void {
  const size = ctx.canvas.width;
  for (let i = 0; i < count; i++) {
    const [r, g, b] = hexToRgb(colors[i % colors.length]);
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.beginPath();
    const radius = minR + rand() * (maxR - minR);
    ctx.ellipse(rand() * size, rand() * size, radius, radius * (0.65 + rand() * 0.5), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

function canvasTexture(canvas: HTMLCanvasElement, colorSpace: THREE.ColorSpace, repeat: boolean): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return track(texture);
}

export function createBrushTexture(): THREE.CanvasTexture {
  const canvas = paintCanvas(512, (ctx, rand) => {
    fill(ctx, 0xf2f2f2);
    strokes(ctx, rand, [0xffffff, 0xd8d2c6, 0xc8c2b4, 0xe8e2d4], 36, 40, 120, 0.45);
    strokes(ctx, rand, [0xb8b2a4, 0xffffff], 18, 18, 48, 0.28);
  }, 3);
  return canvasTexture(canvas, THREE.SRGBColorSpace, true);
}

export function createLeafTexture(): THREE.CanvasTexture {
  const canvas = paintCanvas(256, (ctx, rand) => {
    ctx.clearRect(0, 0, 256, 256);
    const blobs = [
      [128, 120, 78],
      [90, 150, 46],
      [160, 148, 50],
      [120, 78, 36],
      [150, 100, 28],
    ];
    for (const [x, y, r] of blobs) {
      const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.55, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, r * (0.8 + rand() * 0.3), r, rand(), 0, Math.PI * 2);
      ctx.fill();
    }
  }, 9);
  const texture = canvasTexture(canvas, THREE.SRGBColorSpace, false);
  texture.premultiplyAlpha = false;
  return texture;
}

export function createTreeBillboard(): THREE.CanvasTexture {
  const canvas = paintCanvas(128, (ctx) => {
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = '#6b4a30';
    ctx.fillRect(58, 70, 12, 48);
    ctx.fillStyle = '#5e7f3a';
    ctx.beginPath();
    ctx.ellipse(64, 58, 40, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#87a548';
    ctx.beginPath();
    ctx.ellipse(48, 50, 22, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }, 4);
  return canvasTexture(canvas, THREE.SRGBColorSpace, false);
}

export function createRingTexture(): THREE.CanvasTexture {
  const canvas = paintCanvas(128, (ctx) => {
    ctx.clearRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(64, 64, 46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.arc(64, 64, 46, 0, Math.PI * 2);
    ctx.stroke();
  }, 2);
  const texture = canvasTexture(canvas, THREE.SRGBColorSpace, false);
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

export function createSoftDisc(inner: string, outer: string): THREE.CanvasTexture {
  const canvas = paintCanvas(128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }, 1);
  const texture = canvasTexture(canvas, THREE.SRGBColorSpace, false);
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

export function createWaveNormal(): THREE.CanvasTexture {
  const size = 128;
  const rand = mulberry32(21);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      height[y * size + x] =
        Math.sin(u * Math.PI * 6 + rand()) * 0.5 +
        Math.sin(v * Math.PI * 4 + u * 3) * 0.35 +
        (rand() - 0.5) * 0.05;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context missing');
  const image = ctx.createImageData(size, size);
  const strength = 1.4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const left = height[y * size + ((x + size - 1) % size)];
      const right = height[y * size + ((x + 1) % size)];
      const down = height[((y + size - 1) % size) * size + x];
      const up = height[((y + 1) % size) * size + x];
      let nx = (left - right) * strength;
      let ny = (down - up) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * size + x) * 4;
      image.data[i] = (nx * 0.5 + 0.5) * 255;
      image.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      image.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = canvasTexture(canvas, THREE.NoColorSpace, true);
  return texture;
}

function layerCanvas(base: number, alts: number[], seed: number, mode: 'grass' | 'dirt' | 'rock'): { canvas: HTMLCanvasElement; height: Float32Array } {
  const size = 512;
  const canvas = paintCanvas(size, (ctx, rand) => {
    fill(ctx, base);
    const count = mode === 'rock' ? 22 : 18;
    strokes(ctx, rand, alts, count, mode === 'rock' ? 28 : 36, mode === 'rock' ? 70 : 90, mode === 'grass' ? 0.22 : 0.55);
    strokes(ctx, rand, alts, 10, 14, 28, 0.18);
  }, seed);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context missing');
  const image = ctx.getImageData(0, 0, size, size);
  const height = new Float32Array(size * size);
  for (let i = 0; i < height.length; i++) {
    const r = image.data[i * 4] / 255;
    const g = image.data[i * 4 + 1] / 255;
    const b = image.data[i * 4 + 2] / 255;
    height[i] = r * 0.3 + g * 0.5 + b * 0.2;
    image.data[i * 4 + 3] = Math.round(height[i] * 255);
  }
  ctx.putImageData(image, 0, 0);
  return { canvas, height };
}

function normalsFrom(height: Float32Array, size: number): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const strength = 2.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const left = height[y * size + ((x + size - 1) % size)];
      const right = height[y * size + ((x + 1) % size)];
      const down = height[((y + size - 1) % size) * size + x];
      const up = height[((y + 1) % size) * size + x];
      let nx = (left - right) * strength;
      let ny = (down - up) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      data[i] = (nx / len * 0.5 + 0.5) * 255;
      data[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      data[i + 2] = (nz / len * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  return data;
}

export interface TerrainTextures {
  layers: THREE.DataArrayTexture;
  normals: THREE.DataArrayTexture;
  splat: THREE.DataTexture;
  macro: THREE.DataTexture;
  cloud: THREE.DataTexture;
  fow: THREE.DataTexture;
}

function canvasToBytes(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context missing');
  return new Uint8Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
}

export function createTerrainTextures(
  heightAt: (x: number, z: number) => number,
): TerrainTextures {
  const grass = layerCanvas(ENV.grass, [ENV.grassLight, ENV.grassDark, ENV.dry, ENV.foliageA], 11, 'grass');
  const light = layerCanvas(ENV.grassLight, [ENV.dry, ENV.grass, 0xc4c47a, ENV.grassLight], 12, 'grass');
  const dirt = layerCanvas(ENV.dirt, [ENV.soil, ENV.woodLight, ENV.sand, ENV.dirt], 13, 'dirt');
  const rock = layerCanvas(ENV.rockLight, [ENV.rockDark, ENV.stone, 0x8e8678, ENV.rockLight], 14, 'rock');
  const size = 512;
  const layerData = new Uint8Array(size * size * 4 * 4);
  const normalData = new Uint8Array(size * size * 4 * 4);
  const canvases = [grass, light, dirt, rock];
  canvases.forEach((layer, index) => {
    layerData.set(canvasToBytes(layer.canvas), index * size * size * 4);
    normalData.set(normalsFrom(layer.height, size), index * size * size * 4);
  });
  const layers = new THREE.DataArrayTexture(layerData, size, size, 4);
  layers.colorSpace = THREE.NoColorSpace;
  layers.wrapS = THREE.RepeatWrapping;
  layers.wrapT = THREE.RepeatWrapping;
  layers.magFilter = THREE.LinearFilter;
  layers.minFilter = THREE.LinearMipmapLinearFilter;
  layers.generateMipmaps = true;
  layers.needsUpdate = true;
  const normals = new THREE.DataArrayTexture(normalData, size, size, 4);
  normals.colorSpace = THREE.NoColorSpace;
  normals.wrapS = THREE.RepeatWrapping;
  normals.wrapT = THREE.RepeatWrapping;
  normals.magFilter = THREE.LinearFilter;
  normals.minFilter = THREE.LinearMipmapLinearFilter;
  normals.generateMipmaps = true;
  normals.needsUpdate = true;

  const splatSize = 256;
  const splat = new Uint8Array(splatSize * splatSize * 4);
  const half = MAP_SIZE / 2;
  for (let y = 0; y < splatSize; y++) {
    for (let x = 0; x < splatSize; x++) {
      const wx = (x / (splatSize - 1)) * MAP_SIZE - half;
      const wz = (y / (splatSize - 1)) * MAP_SIZE - half;
      const n = Math.sin(wx * 0.09) * Math.cos(wz * 0.07);
      let grassW = 0.75;
      let lightW = n > 0.15 ? 0.55 : 0.12;
      let dirtW = 0;
      let rockW = 0;
      const slope = Math.abs(heightAt(wx + 0.8, wz) - heightAt(wx - 0.8, wz)) + Math.abs(heightAt(wx, wz + 0.8) - heightAt(wx, wz - 0.8));
      if (slope > 0.55) rockW = Math.min(1, (slope - 0.55) * 1.4);
      if (Math.hypot(wx - 26, wz + 4) < 14) dirtW = Math.max(dirtW, 0.35);
      if (Math.hypot(wx + 28, wz - 12) < 10) dirtW = Math.max(dirtW, 0.45);
      dirtW = Math.max(dirtW, pathWeight(wx, wz));
      const sum = grassW + lightW + dirtW + rockW;
      const i = (y * splatSize + x) * 4;
      splat[i] = (grassW / sum) * 255;
      splat[i + 1] = (lightW / sum) * 255;
      splat[i + 2] = (dirtW / sum) * 255;
      splat[i + 3] = (rockW / sum) * 255;
    }
  }
  const splatTex = new THREE.DataTexture(splat, splatSize, splatSize);
  splatTex.colorSpace = THREE.NoColorSpace;
  splatTex.wrapS = THREE.ClampToEdgeWrapping;
  splatTex.wrapT = THREE.ClampToEdgeWrapping;
  splatTex.magFilter = THREE.LinearFilter;
  splatTex.minFilter = THREE.LinearFilter;
  splatTex.generateMipmaps = false;
  splatTex.needsUpdate = true;

  const macroSize = 128;
  const macro = new Uint8Array(macroSize * macroSize * 4);
  const rand = mulberry32(17);
  const blobs: { x: number; y: number; r: number; tint: [number, number, number] }[] = [];
  for (let i = 0; i < 18; i++) {
    const warm = rand() > 0.5;
    blobs.push({
      x: rand(),
      y: rand(),
      r: 0.12 + rand() * 0.22,
      tint: warm ? [1.08, 1.04, 0.94] : [0.94, 1.0, 1.06],
    });
  }
  for (let y = 0; y < macroSize; y++) {
    for (let x = 0; x < macroSize; x++) {
      let r = 1;
      let g = 1;
      let b = 1;
      for (const blob of blobs) {
        const dx = x / macroSize - blob.x;
        const dy = y / macroSize - blob.y;
        const d = Math.hypot(dx, dy) / blob.r;
        const w = Math.max(0, 1 - d);
        const s = w * w * (3 - 2 * w);
        r = r * (1 - s * 0.35) + blob.tint[0] * s * 0.35;
        g = g * (1 - s * 0.35) + blob.tint[1] * s * 0.35;
        b = b * (1 - s * 0.35) + blob.tint[2] * s * 0.35;
      }
      const value = 0.9 + 0.2 * ((r + g + b) / 3 - 0.95);
      const clamped = Math.min(1.12, Math.max(0.88, value));
      const i = (y * macroSize + x) * 4;
      macro[i] = Math.round(Math.min(1, Math.max(0, r * clamped * 0.5)) * 255);
      macro[i + 1] = Math.round(Math.min(1, Math.max(0, g * clamped * 0.5)) * 255);
      macro[i + 2] = Math.round(Math.min(1, Math.max(0, b * clamped * 0.5)) * 255);
      macro[i + 3] = 255;
    }
  }
  const macroTex = new THREE.DataTexture(macro, macroSize, macroSize);
  macroTex.colorSpace = THREE.NoColorSpace;
  macroTex.wrapS = THREE.ClampToEdgeWrapping;
  macroTex.wrapT = THREE.ClampToEdgeWrapping;
  macroTex.magFilter = THREE.LinearFilter;
  macroTex.minFilter = THREE.LinearFilter;
  macroTex.generateMipmaps = false;
  macroTex.needsUpdate = true;

  const cloudSize = 256;
  const cloud = new Uint8Array(cloudSize * cloudSize * 4);
  const cr = mulberry32(29);
  for (let y = 0; y < cloudSize; y++) {
    for (let x = 0; x < cloudSize; x++) {
      const u = x / cloudSize;
      const v = y / cloudSize;
      let n = Math.sin(u * Math.PI * 2 * 3 + cr()) * 0.5 + Math.cos(v * Math.PI * 2 * 2) * 0.5;
      n = n * 0.5 + 0.5;
      n = Math.pow(Math.min(1, Math.max(0, n)), 1.4);
      const i = (y * cloudSize + x) * 4;
      const byte = Math.round(n * 255);
      cloud[i] = byte;
      cloud[i + 1] = byte;
      cloud[i + 2] = byte;
      cloud[i + 3] = 255;
    }
  }
  const cloudTex = new THREE.DataTexture(cloud, cloudSize, cloudSize);
  cloudTex.colorSpace = THREE.NoColorSpace;
  cloudTex.wrapS = THREE.RepeatWrapping;
  cloudTex.wrapT = THREE.RepeatWrapping;
  cloudTex.magFilter = THREE.LinearFilter;
  cloudTex.minFilter = THREE.LinearFilter;
  cloudTex.generateMipmaps = false;
  cloudTex.needsUpdate = true;

  const fowSize = 128;
  const fow = new Uint8Array(fowSize * fowSize * 4);
  for (let y = 0; y < fowSize; y++) {
    for (let x = 0; x < fowSize; x++) {
      const wx = (x / (fowSize - 1)) * MAP_SIZE - half;
      const wz = (y / (fowSize - 1)) * MAP_SIZE - half;
      const unexplored = 1 - smooth(wz, -48, -36);
      const explored = smooth(wx, 34, 46) * (1 - unexplored);
      const visible = 1 - Math.max(unexplored, explored);
      const value = unexplored * 0.05 + explored * 0.5 + visible * 1;
      const i = (y * fowSize + x) * 4;
      const byte = Math.round(Math.min(1, Math.max(0, value)) * 255);
      fow[i] = byte;
      fow[i + 1] = byte;
      fow[i + 2] = byte;
      fow[i + 3] = 255;
    }
  }
  const fowTex = new THREE.DataTexture(fow, fowSize, fowSize);
  fowTex.colorSpace = THREE.NoColorSpace;
  fowTex.wrapS = THREE.ClampToEdgeWrapping;
  fowTex.wrapT = THREE.ClampToEdgeWrapping;
  fowTex.magFilter = THREE.LinearFilter;
  fowTex.minFilter = THREE.LinearFilter;
  fowTex.generateMipmaps = false;
  fowTex.needsUpdate = true;
  fowTex.flipY = false;

  frame.uFowMap.value = fowTex;
  frame.uCloud.value = cloudTex;

  for (const texture of [layers, normals, splatTex, macroTex, cloudTex, fowTex]) track(texture);

  return { layers, normals, splat: splatTex, macro: macroTex, cloud: cloudTex, fow: fowTex };
}

function smooth(value: number, edge0: number, edge1: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function pathWeight(x: number, z: number): number {
  const points: [number, number][] = [
    [-2, -16],
    [-20, -8],
    [-14, 6],
    [16, 2],
    [6, -12],
  ];
  let best = 99;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[i + 1];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len2 = dx * dx + dz * dz;
    const t = Math.min(1, Math.max(0, ((x - x0) * dx + (z - z0) * dz) / len2));
    const px = x0 + dx * t;
    const pz = z0 + dz * t;
    best = Math.min(best, Math.hypot(x - px, z - pz));
  }
  if (best > 2.4) return 0;
  return (1 - best / 2.4) * 0.95;
}

export function createShoreTexture(
  originX: number,
  originZ: number,
  span: number,
  waterY: number,
  heightAt: (x: number, z: number) => number,
): THREE.DataTexture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const land = new Uint8Array(size * size);
  const depth = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wx = originX + (x / (size - 1)) * span;
      const wz = originZ + (y / (size - 1)) * span;
      const d = waterY - heightAt(wx, wz);
      const i = y * size + x;
      land[i] = d <= 0 ? 1 : 0;
      depth[i] = Math.max(0, d);
    }
  }
  const dist = new Float32Array(size * size);
  dist.fill(999);
  for (let i = 0; i < land.length; i++) if (land[i]) dist[i] = 0;
  const pass = (forward: boolean) => {
    const start = forward ? 0 : size - 1;
    const end = forward ? size : -1;
    const step = forward ? 1 : -1;
    for (let y = start; y !== end; y += step) {
      for (let x = start; x !== end; x += step) {
        const i = y * size + x;
        let best = dist[i];
        if (x - step >= 0 && x - step < size) best = Math.min(best, dist[y * size + (x - step)] + 1);
        if (y - step >= 0 && y - step < size) best = Math.min(best, dist[(y - step) * size + x] + 1);
        dist[i] = best;
      }
    }
  };
  pass(true);
  pass(false);
  const metersPerPixel = span / size;
  for (let i = 0; i < dist.length; i++) {
    const shore = Math.min(8, dist[i] * metersPerPixel);
    const deep = Math.min(3, depth[i]) / 3;
    data[i * 4] = Math.round(deep * 255);
    data[i * 4 + 1] = Math.round((shore / 8) * 255);
    data[i * 4 + 2] = land[i] ? 0 : 255;
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return track(texture);
}
