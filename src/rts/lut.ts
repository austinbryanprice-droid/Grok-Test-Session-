import { LookupTexture } from 'postprocessing';
import * as THREE from 'three';
import { LIGHT } from './palette';

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Contrast +8%, saturation +5%, warm highlights, cool shadows, blacks lifted to 6%. */
export function gradeLinear(r: number, g: number, b: number): [number, number, number] {
  let c = [r, g, b].map((v) => (v - 0.5) * 1.08 + 0.5);
  c = c.map((v) => Math.min(1, Math.max(0, v)));
  const luma = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  c = c.map((v) => luma + (v - luma) * 1.05);
  const split = smoothstep(0.15, 0.75, luma);
  const shadow = [(LIGHT.shadowTint >> 16 & 255) / 255, (LIGHT.shadowTint >> 8 & 255) / 255, (LIGHT.shadowTint & 255) / 255];
  const high = [(LIGHT.highlight >> 16 & 255) / 255, (LIGHT.highlight >> 8 & 255) / 255, (LIGHT.highlight & 255) / 255];
  c = c.map((v, i) => v * (1 - 0.28 + 0.28 * (shadow[i] + (high[i] - shadow[i]) * split)));
  c = c.map((v) => Math.min(1, Math.max(0, v)) * 0.94 + 0.06);
  return [c[0], c[1], c[2]];
}

export function createGradeLut(): LookupTexture {
  const size = 16;
  const data = new Float32Array(size * size * size * 4);
  const sizeSq = size * size;
  const s = 1 / (size - 1);
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const graded = gradeLinear(r * s, g * s, b * s);
        const i4 = (r + g * size + b * sizeSq) * 4;
        data[i4] = graded[0];
        data[i4 + 1] = graded[1];
        data[i4 + 2] = graded[2];
        data[i4 + 3] = 1;
      }
    }
  }
  const lut = new LookupTexture(data, size);
  lut.magFilter = THREE.LinearFilter;
  lut.minFilter = THREE.LinearFilter;
  lut.colorSpace = THREE.NoColorSpace;
  lut.name = 'grade';
  lut.needsUpdate = true;
  return lut;
}
