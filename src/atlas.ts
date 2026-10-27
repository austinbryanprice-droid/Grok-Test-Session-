import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  type Wrapping,
} from 'three';
import { fbmTile, hash2, lerp } from './noise';

const TILE = 512;
const COLS = 4;
const ROWS = 2;

export type Atlas = {
  color: DataTexture;
  normal: DataTexture;
  waterNormal: DataTexture;
};

type Rgb = [number, number, number];

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function blend(data: Uint8Array, height: Float32Array, i: number, rgb: Rgb, a: number, h: number): void {
  const t = Math.max(0, Math.min(1, a));
  data[i] = clampByte(lerp(data[i], rgb[0], t));
  data[i + 1] = clampByte(lerp(data[i + 1], rgb[1], t));
  data[i + 2] = clampByte(lerp(data[i + 2], rgb[2], t));
  height[i / 4] = lerp(height[i / 4], h, t);
}

function paintBase(
  data: Uint8Array,
  height: Float32Array,
  sample: (u: number, v: number) => { rgb: Rgb; h: number },
): void {
  for (let y = 0; y < TILE; y += 1) {
    for (let x = 0; x < TILE; x += 1) {
      const u = x / TILE;
      const v = y / TILE;
      const s = sample(u, v);
      const i = (y * TILE + x) * 4;
      data[i] = s.rgb[0];
      data[i + 1] = s.rgb[1];
      data[i + 2] = s.rgb[2];
      data[i + 3] = 255;
      height[y * TILE + x] = s.h;
    }
  }
}

function grass(u: number, v: number): { rgb: Rgb; h: number } {
  const n = fbmTile(u, v, 5);
  const patch = fbmTile(u * 0.35 + 0.2, v * 0.35, 4);
  const soil = fbmTile(u * 2.1 + 4, v * 2.1, 3);
  const r = lerp(86, 168, n) + (patch - 0.5) * 36;
  const g = lerp(118, 188, n) + (soil - 0.5) * 28;
  const b = lerp(42, 78, patch);
  return { rgb: [r, g, b], h: n * 0.55 + patch * 0.25 };
}

function dirt(u: number, v: number): { rgb: Rgb; h: number } {
  const n = fbmTile(u + 0.4, v + 0.1, 5);
  const pebble = fbmTile(u * 3.2 + 2, v * 3.2, 3);
  const r = lerp(126, 168, n);
  const g = lerp(86, 118, n);
  const b = lerp(48, 72, n);
  return { rgb: [r + pebble * 18, g + pebble * 10, b], h: n * 0.4 + pebble * 0.35 };
}

function stone(u: number, v: number): { rgb: Rgb; h: number } {
  const n = fbmTile(u * 1.3, v * 1.1, 5);
  const grain = fbmTile(u * 4 + 1, v * 4, 3);
  const r = lerp(118, 156, n) + (grain - 0.5) * 16;
  const g = lerp(112, 148, n);
  const b = lerp(100, 132, n);
  return { rgb: [r, g, b], h: n * 0.7 + grain * 0.2 };
}

function wood(u: number, v: number): { rgb: Rgb; h: number } {
  const n = fbmTile(u * 0.5, v, 5);
  const ring = Math.sin((v * 28 + n * 6) * Math.PI * 2) * 0.5 + 0.5;
  const r = lerp(68, 112, ring) + n * 18;
  const g = lerp(42, 74, ring);
  const b = lerp(24, 42, n);
  return { rgb: [r, g, b], h: ring * 0.55 + n * 0.2 };
}

function plank(u: number, v: number): { rgb: Rgb; h: number } {
  const n = fbmTile(u, v * 0.4 + 0.3, 4);
  const board = Math.floor(v * 8);
  const local = (v * 8) % 1;
  const seam = local < 0.06 || local > 0.94 ? 1 : 0;
  const stud = (((u + (board % 2) * 0.5) * 4) % 1) < 0.035 ? 1 : 0;
  const tone = 0.75 + hash2(board, 3) * 0.4;
  const r = (168 + n * 40) * tone;
  const g = (124 + n * 24) * tone;
  const b = (78 + n * 16) * tone;
  const dark = Math.max(seam, stud);
  return {
    rgb: [lerp(r, 72, dark), lerp(g, 52, dark), lerp(b, 34, dark)],
    h: (1 - dark) * (0.35 + n * 0.4),
  };
}

function metal(u: number, v: number): { rgb: Rgb; h: number } {
  const n = fbmTile(u * 2, v * 2 + 0.7, 5);
  const scratch = Math.abs(Math.sin((u * 40 + n * 8 + v * 6) * Math.PI)) < 0.08 ? 1 : 0;
  const base = lerp(92, 128, n);
  const r = lerp(base, 168, scratch * 0.7);
  const g = lerp(base - 6, 160, scratch * 0.7);
  const b = lerp(base - 8, 150, scratch * 0.7);
  return { rgb: [r, g, b], h: n * 0.25 + scratch * 0.45 };
}

function sand(u: number, v: number): { rgb: Rgb; h: number } {
  const n = fbmTile(u * 1.6 + 0.2, v * 1.6, 5);
  const speckle = fbmTile(u * 6, v * 6, 3);
  const r = lerp(186, 214, n) + (speckle - 0.5) * 16;
  const g = lerp(156, 184, n);
  const b = lerp(102, 132, n);
  return { rgb: [r, g, b], h: n * 0.35 + speckle * 0.25 };
}

function snow(u: number, v: number): { rgb: Rgb; h: number } {
  const n = fbmTile(u * 0.8, v * 0.8 + 0.15, 5);
  const blue = Math.max(0, 0.55 - n);
  const r = lerp(214, 244, n);
  const g = lerp(220, 246, n);
  const b = lerp(224, 250, n) + blue * 18;
  return { rgb: [r, g, b], h: n * 0.3 };
}

const PAINTERS = [grass, dirt, stone, wood, plank, metal, sand, snow];

function addGrassBlades(data: Uint8Array, height: Float32Array): void {
  for (let by = 0; by < 36; by += 1) {
    for (let bx = 0; bx < 36; bx += 1) {
      if (hash2(bx + 8, by + 2) < 0.42) continue;
      const x0 = Math.floor(((bx + 0.35 + hash2(bx, by) * 0.4) / 36) * TILE);
      const y0 = Math.floor(hash2(bx + 4, by + 9) * TILE);
      const len = 16 + Math.floor(hash2(bx + 1, by + 6) * 28);
      const bend = (hash2(bx + 12, by) - 0.5) * 14;
      for (let t = 0; t < len; t += 1) {
        const py = (y0 + t) % TILE;
        const px = Math.floor(x0 + bend * (t / len) + Math.sin(t * 0.35 + bx) * 1.4);
        const fade = t / len;
        for (let w = -2; w <= 2; w += 1) {
          const xx = ((px + w) % TILE + TILE) % TILE;
          const k = (1 - Math.abs(w) / 2.4) * (0.28 + fade * 0.55);
          const i = (py * TILE + xx) * 4;
          blend(data, height, i, [118 + fade * 70, 168 + fade * 50, 48], k, 0.75 + fade * 0.2);
        }
      }
    }
  }
}

function addPebbles(data: Uint8Array, height: Float32Array, count: number, color: Rgb, seed: number): void {
  for (let i = 0; i < count; i += 1) {
    const cx = Math.floor(hash2(i + seed, 2) * TILE);
    const cy = Math.floor(hash2(3, i + seed) * TILE);
    const rx = 2 + Math.floor(hash2(i, seed) * 4);
    const ry = 2 + Math.floor(hash2(seed, i + 5) * 3);
    for (let y = -ry; y <= ry; y += 1) {
      for (let x = -rx; x <= rx; x += 1) {
        const e = (x * x) / (rx * rx) + (y * y) / (ry * ry);
        if (e > 1) continue;
        const xx = (cx + x + TILE) % TILE;
        const yy = (cy + y + TILE) % TILE;
        const k = (1 - e) * 0.72;
        blend(data, height, (yy * TILE + xx) * 4, color, k, 0.85);
      }
    }
  }
}

function addCracks(data: Uint8Array, height: Float32Array): void {
  for (let y = 0; y < TILE; y += 1) {
    for (let x = 0; x < TILE; x += 1) {
      const n = fbmTile(x / TILE, y / TILE, 4);
      const ridge = Math.abs(n - 0.48);
      if (ridge > 0.035) continue;
      const k = 1 - ridge / 0.035;
      const i = (y * TILE + x) * 4;
      blend(data, height, i, [62, 58, 52], k * 0.85, 0.05);
    }
  }
  for (let i = 0; i < 28; i += 1) {
    let x = hash2(i, 19) * TILE;
    let y = hash2(21, i) * TILE;
    const steps = 18 + Math.floor(hash2(i, 4) * 24);
    for (let s = 0; s < steps; s += 1) {
      x = (x + Math.sin(i + s * 0.4) * 2.4 + TILE) % TILE;
      y = (y + 1.6) % TILE;
      const px = Math.floor(x);
      const py = Math.floor(y);
      blend(data, height, (py * TILE + px) * 4, [48, 64, 36], 0.55, 0.2);
    }
  }
}

function addMoss(data: Uint8Array, height: Float32Array): void {
  for (let y = 0; y < TILE; y += 1) {
    for (let x = 0; x < TILE; x += 1) {
      const m = fbmTile(x / TILE + 0.5, y / TILE + 0.2, 3);
      if (m < 0.62) continue;
      const k = (m - 0.62) / 0.38;
      blend(data, height, (y * TILE + x) * 4, [78, 128, 62], k * 0.55, 0.4 + k * 0.2);
    }
  }
}

function addRivets(data: Uint8Array, height: Float32Array): void {
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const cx = Math.floor((col + 0.5) * (TILE / 4));
      const cy = Math.floor((row + 0.5) * (TILE / 4));
      for (let y = -5; y <= 5; y += 1) {
        for (let x = -5; x <= 5; x += 1) {
          const d = Math.hypot(x, y);
          if (d > 5) continue;
          const xx = (cx + x + TILE) % TILE;
          const yy = (cy + y + TILE) % TILE;
          const ring = d > 3.2 && d < 4.6;
          blend(
            data,
            height,
            (yy * TILE + xx) * 4,
            ring ? [58, 54, 50] : [168, 164, 156],
            0.8,
            ring ? 0.15 : 0.9,
          );
        }
      }
    }
  }
}

function sobel(height: Float32Array, x: number, y: number): [number, number, number] {
  const h = (ix: number, iy: number) => height[(((iy % TILE) + TILE) % TILE) * TILE + (((ix % TILE) + TILE) % TILE)];
  const dx = h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1) - (h(x - 1, y - 1) + 2 * h(x - 1, y) + h(x - 1, y + 1));
  const dy = h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1) - (h(x - 1, y - 1) + 2 * h(x, y - 1) + h(x + 1, y - 1));
  const nx = -dx * 2.4;
  const ny = -dy * 2.4;
  const nz = 1;
  const l = Math.hypot(nx, ny, nz);
  return [nx / l, ny / l, nz / l];
}

function writeNormal(dst: Uint8Array, ox: number, oy: number, atlasW: number, height: Float32Array): void {
  for (let y = 0; y < TILE; y += 1) {
    for (let x = 0; x < TILE; x += 1) {
      const n = sobel(height, x, y);
      const i = ((oy + y) * atlasW + (ox + x)) * 4;
      dst[i] = clampByte((n[0] * 0.5 + 0.5) * 255);
      dst[i + 1] = clampByte((n[1] * 0.5 + 0.5) * 255);
      dst[i + 2] = clampByte((n[2] * 0.5 + 0.5) * 255);
      dst[i + 3] = 255;
    }
  }
}

function makeTexture(data: Uint8Array, w: number, h: number, srgb: boolean, wrap: Wrapping): DataTexture {
  const tex = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType);
  tex.flipY = false;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = wrap;
  tex.wrapT = wrap;
  tex.anisotropy = 8;
  tex.colorSpace = srgb ? SRGBColorSpace : tex.colorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createAtlas(): Atlas {
  const atlasW = COLS * TILE;
  const atlasH = ROWS * TILE;
  const color = new Uint8Array(atlasW * atlasH * 4);
  const normal = new Uint8Array(atlasW * atlasH * 4);
  for (let tile = 0; tile < 8; tile += 1) {
    const data = new Uint8Array(TILE * TILE * 4);
    const height = new Float32Array(TILE * TILE);
    paintBase(data, height, PAINTERS[tile]);
    if (tile === 0) addGrassBlades(data, height);
    if (tile === 1) addPebbles(data, height, 70, [96, 78, 58], 4);
    if (tile === 2) {
      addCracks(data, height);
      addMoss(data, height);
    }
    if (tile === 5) addRivets(data, height);
    if (tile === 6) addPebbles(data, height, 40, [150, 122, 84], 9);
    const col = tile % COLS;
    const row = Math.floor(tile / COLS);
    const ox = col * TILE;
    const oy = row * TILE;
    for (let y = 0; y < TILE; y += 1) {
      color.set(data.subarray(y * TILE * 4, (y + 1) * TILE * 4), ((oy + y) * atlasW + ox) * 4);
    }
    writeNormal(normal, ox, oy, atlasW, height);
  }

  const waterSize = 256;
  const waterH = new Float32Array(waterSize * waterSize);
  const waterN = new Uint8Array(waterSize * waterSize * 4);
  for (let y = 0; y < waterSize; y += 1) {
    for (let x = 0; x < waterSize; x += 1) {
      const u = x / waterSize;
      const v = y / waterSize;
      waterH[y * waterSize + x] =
        Math.sin((u * 8 + v * 2) * Math.PI * 2) * 0.35 +
        Math.sin((u * 3 - v * 7) * Math.PI * 2) * 0.25 +
        fbmTile(u, v, 4) * 0.4;
    }
  }
  const sampleW = (ix: number, iy: number) => waterH[(((iy % waterSize) + waterSize) % waterSize) * waterSize + (((ix % waterSize) + waterSize) % waterSize)];
  for (let y = 0; y < waterSize; y += 1) {
    for (let x = 0; x < waterSize; x += 1) {
      const dx = sampleW(x + 1, y) - sampleW(x - 1, y);
      const dy = sampleW(x, y + 1) - sampleW(x, y - 1);
      const nx = -dx * 3;
      const ny = -dy * 3;
      const nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * waterSize + x) * 4;
      waterN[i] = clampByte((nx / l) * 0.5 * 255 + 128);
      waterN[i + 1] = clampByte((ny / l) * 0.5 * 255 + 128);
      waterN[i + 2] = clampByte((nz / l) * 0.5 * 255 + 128);
      waterN[i + 3] = 255;
    }
  }

  return {
    color: makeTexture(color, atlasW, atlasH, true, ClampToEdgeWrapping),
    normal: makeTexture(normal, atlasW, atlasH, false, ClampToEdgeWrapping),
    waterNormal: makeTexture(waterN, waterSize, waterSize, false, RepeatWrapping),
  };
}
