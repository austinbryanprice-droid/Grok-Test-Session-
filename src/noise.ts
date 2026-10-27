export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function makeNoise(seed: number): (x: number, y: number) => number {
  const rand = mulberry32(seed);
  const N = 64;
  const g = new Float32Array(N * N);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const sample = (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const xi = x0 & (N - 1);
    const yi = y0 & (N - 1);
    const xi1 = (xi + 1) & (N - 1);
    const yi1 = (yi + 1) & (N - 1);
    const v00 = g[yi * N + xi];
    const v10 = g[yi * N + xi1];
    const v01 = g[yi1 * N + xi];
    const v11 = g[yi1 * N + xi1];
    return (v00 + (v10 - v00) * fx) * (1 - fy) + (v01 + (v11 - v01) * fx) * fy;
  };
  return (x: number, y: number) => {
    let a = 0;
    let amp = 0.5;
    let f = 1;
    let sum = 0;
    for (let i = 0; i < 5; i++) {
      a += sample(x * f, y * f) * amp;
      sum += amp;
      f *= 2;
      amp *= 0.5;
    }
    return a / sum;
  };
}

export const fbm = makeNoise(11);
export const fbm2 = makeNoise(29);

export function heightAt(x: number, z: number): number {
  const broad = fbm(x * 0.011, z * 0.011);
  const mid = fbm2(x * 0.03 + 4, z * 0.028);
  let h = 7.5 + broad * 12 + mid * 2.4;
  const lake = Math.hypot(x - 96, z - 42);
  if (lake < 32) {
    const bed = 5.15 + (lake / 16) * (lake / 16) * 4.6;
    const influence = lake < 18 ? 1 : 1 - (lake - 18) / 14;
    h = Math.min(h, bed) * influence + h * (1 - influence);
  }
  const px = x - 58;
  const pz = z - 78;
  const plateau = Math.hypot(px, pz);
  if (plateau < 20) {
    const blend = plateau < 10 ? 1 : 1 - (plateau - 10) / 10;
    h = h * (1 - blend) + 13.15 * blend;
  }
  if (x < 30) h = Math.max(h, 20 - x * 0.22 + mid * 0.4);
  return h;
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}
