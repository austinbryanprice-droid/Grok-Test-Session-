export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hash2(ix: number, iy: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function noise2(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const xf = x - x0;
  const yf = y - y0;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(x0, y0);
  const b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1);
  const d = hash2(x0 + 1, y0 + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function fbm(x: number, y: number): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let sum = 0;
  for (let i = 0; i < 5; i += 1) {
    value += amplitude * noise2(x * frequency, y * frequency);
    sum += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return value / sum;
}

function wrap(i: number, period: number): number {
  return ((i % period) + period) % period;
}

export function tileNoise(px: number, py: number, cell: number, size: number): number {
  const period = size / cell;
  const x = px / cell;
  const y = py / cell;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const xf = x - x0;
  const yf = y - y0;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(wrap(x0, period), wrap(y0, period));
  const b = hash2(wrap(x0 + 1, period), wrap(y0, period));
  const c = hash2(wrap(x0, period), wrap(y0 + 1, period));
  const d = hash2(wrap(x0 + 1, period), wrap(y0 + 1, period));
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function tileFbm(px: number, py: number, size: number): number {
  let value = 0;
  let amplitude = 0.5;
  let cell = 64;
  let sum = 0;
  for (let i = 0; i < 5; i += 1) {
    value += amplitude * tileNoise(px, py, cell, size);
    sum += amplitude;
    amplitude *= 0.5;
    cell = Math.max(2, cell / 2);
  }
  return value / sum;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
