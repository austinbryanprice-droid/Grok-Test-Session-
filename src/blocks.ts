import { tuning } from './tuning';

export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const WOOD = 4;
export const PLANK = 5;
export const METAL = 6;
export const SAND = 7;
export const SNOW = 8;
export const LEAVES = 9;

export const PART_TERRAIN = 0;
export const PART_FOUNDATION = 1;
export const PART_WALL_S = 2;
export const PART_WALL_N = 3;
export const PART_WALL_E = 4;
export const PART_WALL_W = 5;
export const PART_ROOF = 6;

export const WORLD_X = tuning.worldX;
export const WORLD_Y = tuning.worldY;
export const WORLD_Z = tuning.worldZ;
export const CHUNK = tuning.chunk;

const TILES: Record<number, number> = {
  [GRASS]: 0,
  [DIRT]: 1,
  [STONE]: 2,
  [WOOD]: 3,
  [PLANK]: 4,
  [METAL]: 5,
  [SAND]: 6,
  [SNOW]: 7,
  [LEAVES]: 0,
};

export function tileOf(block: number): number {
  return TILES[block] ?? 0;
}

export function voxelIndex(x: number, y: number, z: number): number {
  return (y * WORLD_Z + z) * WORLD_X + x;
}

export function inBounds(x: number, y: number, z: number): boolean {
  return x >= 0 && y >= 0 && z >= 0 && x < WORLD_X && y < WORLD_Y && z < WORLD_Z;
}

/** Atlas UV. Tile row 0 is the first rows of the data texture, which sit at v = 0. */
export function atlasUV(tile: number, u: number, v: number, rot = 0): [number, number] {
  let uu = u;
  let vv = v;
  if (rot === 1) {
    uu = v;
    vv = 1 - u;
  } else if (rot === 2) {
    uu = 1 - u;
    vv = 1 - v;
  } else if (rot === 3) {
    uu = 1 - v;
    vv = u;
  }
  uu = 0.012 + uu * 0.976;
  vv = 0.012 + vv * 0.976;
  const col = tile % 4;
  const row = Math.floor(tile / 4);
  return [(col + uu) / 4, (row + vv) / 2];
}
