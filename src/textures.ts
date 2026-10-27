import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearSRGBColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from 'three';
import { computeHeight, splatWeights, WATER_Y, WORLD } from './field';
import { clamp, lerp, smoothstep, tileFbm, tileNoise } from './noise';

export type Surface = {
  color: Texture;
  normal: Texture;
  rough: Texture;
};

export type Library = {
  grass: Surface;
  dirt: Surface;
  mud: Surface;
  rock: Surface;
  stone: Surface;
  wood: Surface;
  plaster: Surface;
  roof: Surface;
  splat: Texture;
  cloud: Texture;
  waterNormal: Texture;
  waterMask: Texture;
  grassClump: Texture;
  smoke: Texture;
  setAnisotropy: (max: number) => void;
};

const tracked: Texture[] = [];

function track(texture: Texture, color: boolean): Texture {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.colorSpace = color ? SRGBColorSpace : LinearSRGBColorSpace;
  texture.needsUpdate = true;
  tracked.push(texture);
  return texture;
}

function colorTex(canvas: HTMLCanvasElement): Texture {
  return track(new CanvasTexture(canvas), true);
}

function linearTex(canvas: HTMLCanvasElement, flipY = true): Texture {
  const texture = track(new CanvasTexture(canvas), false);
  texture.flipY = flipY;
  return texture;
}

type Pixel = { r: number; g: number; b: number; rough: number; height: number };

function bake(size: number, sample: (x: number, y: number) => Pixel): Surface {
  const color = document.createElement('canvas');
  const rough = document.createElement('canvas');
  color.width = color.height = rough.width = rough.height = size;
  const colorCtx = color.getContext('2d')!;
  const roughCtx = rough.getContext('2d')!;
  const colorImg = colorCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const pixel = sample(x, y);
      const i = (y * size + x) * 4;
      colorImg.data[i] = pixel.r;
      colorImg.data[i + 1] = pixel.g;
      colorImg.data[i + 2] = pixel.b;
      colorImg.data[i + 3] = pixel.rough * 255;
      const roughByte = pixel.rough * 255;
      roughImg.data[i] = roughByte;
      roughImg.data[i + 1] = roughByte;
      roughImg.data[i + 2] = roughByte;
      roughImg.data[i + 3] = 255;
      height[y * size + x] = pixel.height;
    }
  }

  colorCtx.putImageData(colorImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);
  return {
    color: colorTex(color),
    normal: linearTex(normalFromHeight(height, size, 3.2)),
    rough: linearTex(rough),
  };
}

function normalFromHeight(height: Float32Array, size: number, strength: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const nx = -dx;
      const ny = -dy;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      const i = (y * size + x) * 4;
      img.data[i] = (nx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function grassPixel(x: number, y: number, size: number): Pixel {
  const n = tileFbm(x, y, size);
  const patch = tileFbm(x * 2.4 + 12, y * 2.4, size);
  const r = lerp(48, 78, n) + (patch - 0.5) * 14;
  const g = lerp(64, 98, n) + (patch - 0.5) * 14;
  const b = lerp(30, 44, patch);
  return { r, g, b, rough: lerp(0.8, 0.96, n), height: n * 0.4 };
}

function dirtPixel(x: number, y: number, size: number): Pixel {
  const n = tileFbm(x, y, size);
  let r = lerp(118, 156, n);
  let g = lerp(86, 114, n);
  let b = lerp(52, 72, n);
  let height = n * 0.45;
  const cell = 24;
  const cx = Math.floor(x / cell);
  const cy = Math.floor(y / cell);
  if (tileNoise(cx * cell, cy * cell, cell, size) > 0.78) {
    const px = cx * cell + cell * 0.5;
    const py = cy * cell + cell * 0.5;
    const d = Math.hypot((x - px) / 5.5, (y - py) / 4.2);
    if (d < 1) {
      const shade = 1 - d;
      r -= 28 * shade;
      g -= 22 * shade;
      b -= 16 * shade;
      height += shade * 0.7;
    }
  }
  return { r, g, b, rough: lerp(0.72, 0.92, n), height };
}

function mudPixel(x: number, y: number, size: number): Pixel {
  const n = tileFbm(x * 0.8, y * 0.8, size);
  const wet = smoothstep(0.55, 0.82, tileFbm(x * 1.6 + 20, y * 1.6, size));
  return {
    r: lerp(78, 104, n) - wet * 18,
    g: lerp(64, 84, n) - wet * 14,
    b: lerp(42, 56, n) - wet * 8,
    rough: lerp(0.62, 0.84, n) * (1 - wet * 0.45),
    height: n * 0.18,
  };
}

function rockPixel(x: number, y: number, size: number): Pixel {
  const n = tileFbm(x * 1.3, y * 1.1, size);
  const crack = Math.abs(tileFbm(x * 2.8, y * 2.4, size) - 0.48) < 0.03;
  const r = (crack ? 70 : lerp(112, 146, n));
  const g = (crack ? 66 : lerp(106, 136, n));
  const b = (crack ? 60 : lerp(96, 124, n));
  return { r, g, b, rough: crack ? 0.95 : lerp(0.7, 0.9, n), height: (crack ? 0.05 : 0.35 + n * 0.6) };
}

function stonePixel(x: number, y: number, size: number): Pixel {
  const brickW = 64;
  const brickH = 32;
  const mortar = 4;
  const row = Math.floor(y / brickH);
  const offset = (row % 2) * (brickW / 2);
  const lx = (x + offset) % brickW;
  const ly = y % brickH;
  const mortarLine = lx < mortar || ly < mortar;
  const id = tileNoise(Math.floor((x + offset) / brickW) * 3.1, row * 2.7, 8, size);
  if (mortarLine) {
    return { r: 92, g: 86, b: 78, rough: 0.9, height: 0.08 };
  }
  const n = tileFbm(x, y, size);
  return {
    r: lerp(132, 168, id) + (n - 0.5) * 16,
    g: lerp(124, 156, id) + (n - 0.5) * 14,
    b: lerp(110, 140, id) + (n - 0.5) * 12,
    rough: lerp(0.68, 0.9, n),
    height: 0.55 + n * 0.25,
  };
}

function woodPixel(x: number, y: number, size: number): Pixel {
  const plank = 32;
  const seam = x % plank < 2;
  const grain = Math.sin(y * 0.38 + tileFbm(x, y, size) * 7 + Math.floor(x / plank));
  const n = tileFbm(x * 0.5, y, size);
  if (seam) return { r: 58, g: 40, b: 28, rough: 0.86, height: 0.05 };
  return {
    r: clamp(118 + grain * 18 + n * 20, 0, 255),
    g: clamp(78 + grain * 10 + n * 12, 0, 255),
    b: clamp(46 + grain * 6, 0, 255),
    rough: lerp(0.55, 0.82, n),
    height: 0.35 + grain * 0.08,
  };
}

function plasterPixel(x: number, y: number, size: number): Pixel {
  const n = tileFbm(x, y, size);
  const stain = smoothstep(0.72, 0.9, tileFbm(x * 0.6 + 8, y * 0.6, size));
  return {
    r: lerp(214, 232, n) - stain * 28,
    g: lerp(196, 214, n) - stain * 24,
    b: lerp(168, 188, n) - stain * 20,
    rough: lerp(0.72, 0.88, n),
    height: n * 0.12,
  };
}

function roofPixel(x: number, y: number, size: number): Pixel {
  const rowH = 16;
  const tileW = 32;
  const row = Math.floor(y / rowH);
  const lx = (x + (row % 2) * (tileW / 2)) % tileW;
  const ly = y % rowH;
  const curve = Math.sin((lx / tileW) * Math.PI);
  const lip = ly < 3;
  const n = tileNoise(Math.floor(x / tileW) + row, row, 16, size);
  const r = lerp(132, 168, n) - (lip ? 30 : 0);
  const g = lerp(62, 78, n) - (lip ? 16 : 0);
  const b = lerp(48, 58, n);
  return { r, g, b, rough: lerp(0.58, 0.8, 1 - curve), height: (lip ? 0.05 : 0.25 + curve * 0.7) };
}

function paintSplat(): { splat: HTMLCanvasElement; mask: HTMLCanvasElement } {
  const size = 512;
  const splat = document.createElement('canvas');
  const mask = document.createElement('canvas');
  splat.width = splat.height = mask.width = mask.height = size;
  const splatCtx = splat.getContext('2d')!;
  const maskCtx = mask.getContext('2d')!;
  const splatImg = splatCtx.createImageData(size, size);
  const maskImg = maskCtx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    const z = (y / (size - 1) - 0.5) * WORLD;
    for (let x = 0; x < size; x += 1) {
      const wx = (x / (size - 1) - 0.5) * WORLD;
      const [g, d, m, r] = splatWeights(wx, z);
      const i = (y * size + x) * 4;
      splatImg.data[i] = g * 255;
      splatImg.data[i + 1] = d * 255;
      splatImg.data[i + 2] = m * 255;
      splatImg.data[i + 3] = r * 255;
      const depth = clamp((WATER_Y - computeHeight(wx, z)) / 1.35, 0, 1);
      const foam = smoothstep(0.02, 0.16, depth) * (1 - smoothstep(0.18, 0.55, depth));
      maskImg.data[i] = depth * 255;
      maskImg.data[i + 1] = foam * 255;
      maskImg.data[i + 2] = 0;
      maskImg.data[i + 3] = 255;
    }
  }
  splatCtx.putImageData(splatImg, 0, 0);
  maskCtx.putImageData(maskImg, 0, 0);
  return { splat, mask };
}

function paintCloud(): HTMLCanvasElement {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = tileFbm(x * 0.55, y * 0.55, size);
      const c = smoothstep(0.38, 0.78, n) * 255;
      const i = (y * size + x) * 4;
      img.data[i] = c;
      img.data[i + 1] = c;
      img.data[i + 2] = c;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function paintWaves(): HTMLCanvasElement {
  const size = 256;
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      height[y * size + x] = tileFbm(x * 2.2, y * 2.2, size);
    }
  }
  return normalFromHeight(height, size, 2.4);
}

function paintGrassClump(): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const plot = (x0: number, y0: number, x1: number, y1: number, width: number, tint: number) => {
    const steps = 28;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = lerp(x0, x1, t);
      const y = lerp(y0, y1, t);
      const w = width * (1 - t * 0.75);
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -w; ox <= w; ox += 1) {
          const px = Math.round(x + ox);
          const py = Math.round(y + oy);
          if (px < 0 || py < 0 || px >= size || py >= size) continue;
          const p = (py * size + px) * 4;
          img.data[p] = 96 + tint;
          img.data[p + 1] = 124 + tint;
          img.data[p + 2] = 52;
          img.data[p + 3] = 255;
        }
      }
    }
  };
  for (let i = 0; i < 9; i += 1) {
    const spread = (i - 4) * 10;
    plot(128 + spread * 0.2, 240, 128 + spread, 18 + (i % 3) * 10, 3.2, (i % 4) * 8);
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function paintSmoke(): HTMLCanvasElement {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grd = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
  grd.addColorStop(0, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

export function createLibrary(): Library {
  const size = 512;
  const maps = paintSplat();
  const splat = linearTex(maps.splat, false);
  const waterMask = linearTex(maps.mask, false);
  splat.wrapS = splat.wrapT = RepeatWrapping;
  waterMask.wrapS = waterMask.wrapT = RepeatWrapping;
  const grassClump = colorTex(paintGrassClump());
  grassClump.wrapS = grassClump.wrapT = RepeatWrapping;
  grassClump.repeat.set(1, 1);
  return {
    grass: bake(size, (x, y) => grassPixel(x, y, size)),
    dirt: bake(size, (x, y) => dirtPixel(x, y, size)),
    mud: bake(size, (x, y) => mudPixel(x, y, size)),
    rock: bake(size, (x, y) => rockPixel(x, y, size)),
    stone: bake(size, (x, y) => stonePixel(x, y, size)),
    wood: bake(size, (x, y) => woodPixel(x, y, size)),
    plaster: bake(size, (x, y) => plasterPixel(x, y, size)),
    roof: bake(size, (x, y) => roofPixel(x, y, size)),
    splat,
    cloud: linearTex(paintCloud()),
    waterNormal: linearTex(paintWaves()),
    waterMask,
    grassClump,
    smoke: linearTex(paintSmoke()),
    setAnisotropy(max: number) {
      const amount = Math.min(8, max);
      for (const texture of tracked) {
        texture.anisotropy = amount;
        texture.needsUpdate = true;
      }
    },
  };
}
