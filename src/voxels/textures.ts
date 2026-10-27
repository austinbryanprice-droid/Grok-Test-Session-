import * as THREE from 'three';
import { heightAt, makeNoise } from '../noise';

const LAYER_NAMES = ['wood', 'stone', 'plaster', 'alloy', 'shingle'] as const;
export const LAYER_COUNT = LAYER_NAMES.length;

function paintLayer(
  data: Uint8Array,
  layer: number,
  size: number,
  painter: (x: number, y: number, n: (x: number, y: number) => number) => [number, number, number],
): void {
  const n = makeNoise(40 + layer * 17);
  const stride = size * size * 4;
  const base = layer * stride;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = painter(x / size, y / size, n);
      const i = base + (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, v));
}

export function createMaterialArray(): THREE.DataArrayTexture {
  const size = 256;
  const data = new Uint8Array(size * size * LAYER_COUNT * 4);
  paintLayer(data, 0, size, (u, v, n) => {
    const grain = Math.sin((v * 46 + n(u * 3, v * 2) * 2.2) * Math.PI * 2) * 0.5 + 0.5;
    const fine = n(u * 18, v * 8);
    const crack = n(u * 7, v * 2) > 0.78 ? 0.72 : 1;
    const moss = n(u * 4 + 2, v * 4) > 0.72 ? 0.22 : 0;
    const k = 0.86 + grain * 0.1 + (fine - 0.5) * 0.06;
    const r = 156 * k * crack;
    const g = 114 * k * crack * (1 - moss) + 128 * moss;
    const b = 74 * k * crack * (1 - moss) + 78 * moss;
    return [clamp(r), clamp(g), clamp(b)];
  });
  paintLayer(data, 1, size, (u, v, n) => {
    const blob = n(u * 3.2, v * 3.2);
    const mortar = (Math.abs((u * 2) % 1 - 0.5) < 0.04 || Math.abs((v * 2) % 1 - 0.5) < 0.04) ? 0.86 : 1;
    const k = (0.9 + blob * 0.12) * mortar;
    return [clamp(141 * k), clamp(136 * k), clamp(128 * k)];
  });
  paintLayer(data, 2, size, (u, v, n) => {
    const fine = n(u * 10, v * 10);
    const k = 0.94 + (fine - 0.5) * 0.05;
    return [clamp(230 * k), clamp(216 * k), clamp(196 * k)];
  });
  paintLayer(data, 3, size, (u, v, n) => {
    const fine = n(u * 12, v * 12);
    const k = 0.9 + fine * 0.08;
    return [clamp(198 * k), clamp(206 * k), clamp(210 * k)];
  });
  paintLayer(data, 4, size, (u, v, n) => {
    const row = Math.sin(v * 28 * Math.PI) * 0.5 + 0.5;
    const fine = n(u * 8, v * 6);
    const k = 0.82 + row * 0.1 + (fine - 0.5) * 0.04;
    return [clamp(92 * k), clamp(78 * k), clamp(68 * k)];
  });
  const tex = new THREE.DataArrayTexture(data, size, size, LAYER_COUNT);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function canvasTex(paint: (ctx: CanvasRenderingContext2D, n: (x: number, y: number) => number) => void, seed: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context missing');
  paint(ctx, makeNoise(seed));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

export function createTerrainTextures(): { grass: THREE.CanvasTexture; dirt: THREE.CanvasTexture; rock: THREE.CanvasTexture } {
  const grass = canvasTex((ctx, n) => {
    const img = ctx.createImageData(256, 256);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const f = n(x * 0.05, y * 0.05);
        const g = n(x * 0.2, y * 0.2);
        const k = 0.82 + f * 0.2 + (g - 0.5) * 0.06;
        const i = (y * 256 + x) * 4;
        img.data[i] = 78 * k;
        img.data[i + 1] = 104 * k;
        img.data[i + 2] = 52 * k;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, 3);
  const dirt = canvasTex((ctx, n) => {
    const img = ctx.createImageData(256, 256);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const f = n(x * 0.06, y * 0.06);
        const k = 0.86 + f * 0.18;
        const i = (y * 256 + x) * 4;
        img.data[i] = 150 * k;
        img.data[i + 1] = 118 * k;
        img.data[i + 2] = 78 * k;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, 8);
  const rock = canvasTex((ctx, n) => {
    const img = ctx.createImageData(256, 256);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const f = n(x * 0.04, y * 0.04);
        const k = 0.84 + f * 0.2;
        const i = (y * 256 + x) * 4;
        img.data[i] = 128 * k;
        img.data[i + 1] = 124 * k;
        img.data[i + 2] = 116 * k;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, 13);
  return { grass, dirt, rock };
}

export function createShoreTexture(waterY: number): THREE.DataTexture {
  const size = 256;
  const data = new Uint8Array(size * size);
  const span = 120;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wx = (x / size) * span;
      const wz = (y / size) * span;
      const h = heightAt(wx, wz);
      const d = h - waterY;
      let foam = 0;
      if (d > -0.25 && d < 1.05) foam = 1 - Math.abs(d - 0.25) / 1.1;
      data[y * size + x] = Math.max(0, Math.min(255, foam * 255));
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
