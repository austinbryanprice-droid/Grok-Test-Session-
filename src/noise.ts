export function hash2(x: number, y: number): number {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function hash3(x: number, y: number, z: number): number {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1440672139);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise in world space. */
export function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = fade(x - x0);
  const sy = fade(y - y0);
  const a = hash2(x0, y0);
  const b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1);
  const d = hash2(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Tileable value noise. `period` is the lattice period in noise-space. */
export function valueNoiseTile(x: number, y: number, period: number): number {
  const p = Math.max(1, period);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = fade(x - x0);
  const sy = fade(y - y0);
  const wrap = (v: number) => ((v % p) + p) % p;
  const a = hash2(wrap(x0), wrap(y0));
  const b = hash2(wrap(x0 + 1), wrap(y0));
  const c = hash2(wrap(x0), wrap(y0 + 1));
  const d = hash2(wrap(x0 + 1), wrap(y0 + 1));
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export function fbm(x: number, y: number, octaves = 5): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * (valueNoise(x * freq, y * freq) * 2 - 1);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** u and v are 0..1 across one tile. Five octaves, wraps on both edges. */
export function fbmTile(u: number, v: number, octaves = 5): number {
  let amp = 1;
  let freq = 2;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * valueNoiseTile(u * freq, v * freq, freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
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

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
