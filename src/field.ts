import { fbm, lerp, smoothstep } from './noise';

export const WORLD = 176;
export const WATER_Y = 0.42;
export const PAD_Y = 2.7;

export function riverCenterX(z: number): number {
  return Math.sin(z * 0.041) * 16 + Math.sin(z * 0.105 + 1.4) * 5.5;
}

export function cliffEdgeX(z: number): number {
  return riverCenterX(z) - 23 + Math.sin(z * 0.065) * 2.4 + (fbm(z * 0.04, 3.2) - 0.5) * 3.5;
}

export function settlement(): { x: number; z: number; y: number } {
  const z = 6;
  return { x: riverCenterX(z) + 20, z, y: PAD_Y };
}

function distToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const denom = abx * abx + abz * abz + 1e-6;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / denom));
  const dx = px - (ax + abx * t);
  const dz = pz - (az + abz * t);
  return Math.hypot(dx, dz);
}

export function computeHeight(x: number, z: number): number {
  let h = 1.05 + fbm(x * 0.011, z * 0.011) * 6.2;
  h += (fbm(x * 0.046, z * 0.041) - 0.5) * 1.5;

  const ridge = smoothstep(48, 86, Math.hypot(x * 0.8, z * 0.72));
  h += ridge * (9 + fbm(x * 0.02, z * 0.02) * 5);

  const edge = cliffEdgeX(z);
  const plateau = 11.2 + fbm(x * 0.02, z * 0.017) * 2;
  const downToBank = smoothstep(edge - 0.6, edge + 8, x);
  h = lerp(plateau, h, downToBank);

  const dx = x - riverCenterX(z);
  const carve = 1 - smoothstep(3.4, 13, Math.abs(dx));
  const bed = WATER_Y - 1.65 - (fbm(x * 0.09, z * 0.07) - 0.5) * 0.3;
  h = lerp(h, Math.min(h, bed), carve);

  const home = settlement();
  const pad = 1 - smoothstep(8.5, 16.5, Math.hypot(x - home.x, z - home.z));
  const eastOfRiver = smoothstep(6, 12, dx);
  h = lerp(h, PAD_Y, pad * eastOfRiver);
  return h;
}

export function slopeAt(x: number, z: number): number {
  const e = 0.75;
  const hx = computeHeight(x + e, z) - computeHeight(x - e, z);
  const hz = computeHeight(x, z + e) - computeHeight(x, z - e);
  return Math.hypot(hx, hz) / (e * 2);
}

export function splatWeights(x: number, z: number): [number, number, number, number] {
  const home = settlement();
  const dx = x - riverCenterX(z);
  const slope = slopeAt(x, z);
  const rock = smoothstep(0.48, 0.95, slope);
  const mud = (1 - rock) * (1 - smoothstep(3.2, 9.2, Math.abs(dx)));
  const doorX = home.x - 4.3;
  const doorZ = home.z - 0.2;
  const bankX = riverCenterX(home.z) + 6.5;
  const path = 1 - smoothstep(1.15, 2.5, distToSegment(x, z, doorX, doorZ, bankX, home.z - 3));
  const yard = 1 - smoothstep(2.2, 6.4, Math.hypot(x - doorX, z - doorZ));
  const patch = smoothstep(0.58, 0.8, fbm(x * 0.07, z * 0.07));
  let dirt = (1 - rock) * (1 - mud) * Math.max(path, yard * 0.45, smoothstep(0.34, 0.55, slope) * 0.25);
  dirt = Math.min(1, dirt + patch * 0.08);
  const grass = Math.max(0, (1 - rock) * (1 - mud) * (1 - dirt));
  const sum = grass + dirt + mud + rock || 1;
  return [grass / sum, dirt / sum, mud / sum, rock / sum];
}

export function inClearing(x: number, z: number): boolean {
  const home = settlement();
  if (Math.hypot(x - home.x, z - home.z) < 18) return true;
  const outX = home.x + 3.4;
  const outZ = home.z + 8.6;
  return Math.abs(x - outX) < 3.4 && Math.abs(z - outZ) < 3.2;
}
