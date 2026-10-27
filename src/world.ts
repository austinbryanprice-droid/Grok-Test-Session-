import {
  BufferGeometry,
  ClampToEdgeWrapping,
  DataTexture,
  FloatType,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  RGBAFormat,
} from 'three';
import {
  AIR,
  CHUNK,
  DIRT,
  GRASS,
  LEAVES,
  METAL,
  PART_FOUNDATION,
  PART_ROOF,
  PART_TERRAIN,
  PART_WALL_E,
  PART_WALL_N,
  PART_WALL_S,
  PART_WALL_W,
  PLANK,
  SAND,
  SNOW,
  STONE,
  WOOD,
  WORLD_X,
  WORLD_Y,
  WORLD_Z,
  inBounds,
  voxelIndex,
} from './blocks';
import { Builder, appendBlock } from './mesh';
import { fbm, mulberry32 } from './noise';
import { tuning } from './tuning';

const LEAF_TINTS: Array<[number, number, number]> = [
  [0.78, 1.08, 0.52],
  [0.9, 0.98, 0.4],
  [1.1, 0.96, 0.46],
];

export type HutPiece = { mesh: Mesh; material: MeshStandardMaterial };

export type BuiltWorld = {
  terrain: Mesh[];
  foundation: Mesh;
  walls: HutPiece[];
  roof: Mesh;
  roofMaterial: MeshStandardMaterial;
  floorY: number;
  inside: { x: number; z: number };
  playerStart: { x: number; y: number; z: number };
  heightTex: DataTexture;
  groundY: (x: number, z: number) => number;
  blocked: (x: number, y: number, z: number) => boolean;
  surfaceBlock: (x: number, z: number) => number;
  chunkCount: number;
};

function columnHeight(x: number, z: number): number {
  const continental = fbm(x * 0.018, z * 0.018, 5);
  const detail = fbm(x * 0.07 + 4, z * 0.07, 3);
  let h = 9.2 + continental * 4.5 + detail * 1.2;
  const dx = x - 62;
  const dz = z - 52;
  h -= Math.exp(-(dx * dx + dz * dz) / 340) * 9.5;
  const sx = x - 70;
  const sz = z - 86;
  h += Math.exp(-(sx * sx + sz * sz) / 220) * 11;
  return Math.max(2, Math.min(WORLD_Y - 2, h));
}

export function createWorld(material: MeshStandardMaterial): BuiltWorld {
  const count = WORLD_X * WORLD_Y * WORLD_Z;
  const voxels = new Uint8Array(count);
  const parts = new Uint8Array(count);
  const tints = new Uint8Array(count);
  const ground = new Float32Array(WORLD_X * WORLD_Z);

  const set = (x: number, y: number, z: number, id: number, part = PART_TERRAIN, tint = 0) => {
    if (!inBounds(x, y, z)) return;
    const i = voxelIndex(x, y, z);
    voxels[i] = id;
    parts[i] = part;
    tints[i] = tint;
  };
  const get = (x: number, y: number, z: number) => (inBounds(x, y, z) ? voxels[voxelIndex(x, y, z)] : AIR);
  const solid = (x: number, y: number, z: number) => {
    if (y < 0) return true;
    return get(x, y, z) !== AIR;
  };

  for (let z = 0; z < WORLD_Z; z += 1) {
    for (let x = 0; x < WORLD_X; x += 1) {
      const surface = Math.floor(columnHeight(x, z));
      ground[z * WORLD_X + x] = surface;
      const slope = Math.max(
        Math.abs(Math.floor(columnHeight(x + 1, z)) - surface),
        Math.abs(Math.floor(columnHeight(x - 1, z)) - surface),
        Math.abs(Math.floor(columnHeight(x, z + 1)) - surface),
        Math.abs(Math.floor(columnHeight(x, z - 1)) - surface),
      );
      for (let y = 0; y < surface; y += 1) {
        const top = y === surface - 1;
        let id = STONE;
        if (top && surface <= 8) id = SAND;
        else if (top && surface >= 16) id = SNOW;
        else if (top && slope >= 2) id = STONE;
        else if (top) id = GRASS;
        else if (y >= surface - 4) id = surface <= 8 ? SAND : DIRT;
        set(x, y, z, id);
      }
    }
  }

  let hx = 58;
  let hz = 28;
  let floorY = 9;
  let best = -1;
  for (let z = 22; z <= 34; z += 1) {
    for (let x = 52; x <= 70; x += 1) {
      const s = ground[z * WORLD_X + x];
      const ahead = ground[Math.min(WORLD_Z - 1, z + 8) * WORLD_X + x];
      if (s >= 8 && s <= 10 && ahead <= 7) {
        const score = 4 - Math.abs(s - 9);
        if (score > best) {
          best = score;
          hx = x;
          hz = z;
          floorY = s;
        }
      }
    }
  }

  const fillColumn = (x: number, z: number, surface: number, top: number) => {
    for (let y = 0; y < WORLD_Y; y += 1) set(x, y, z, AIR);
    for (let y = 0; y < surface; y += 1) {
      const id = y === surface - 1 ? top : y >= surface - 4 ? DIRT : STONE;
      set(x, y, z, id);
    }
    ground[z * WORLD_X + x] = surface;
  };

  for (let z = hz - 2; z <= hz + 6; z += 1) {
    for (let x = hx - 2; x <= hx + 8; x += 1) fillColumn(x, z, floorY, GRASS);
  }

  for (let x = hx; x <= hx + 6; x += 1) {
    for (let z = hz; z <= hz + 4; z += 1) set(x, floorY - 1, z, STONE, PART_FOUNDATION);
  }
  for (let y = floorY; y < floorY + 3; y += 1) {
    for (let x = hx; x <= hx + 6; x += 1) {
      const door = (x === hx + 3 || x === hx + 4) && y < floorY + 2;
      if (!door) set(x, y, hz, x === hx || x === hx + 6 ? WOOD : PLANK, PART_WALL_S);
      set(x, y, hz + 4, x === hx || x === hx + 6 ? WOOD : PLANK, PART_WALL_N);
    }
    for (let z = hz + 1; z <= hz + 3; z += 1) {
      const window = z === hz + 2 && y === floorY + 1;
      if (!window) set(hx, y, z, PLANK, PART_WALL_W);
      if (!window) set(hx + 6, y, z, PLANK, PART_WALL_E);
    }
  }
  for (let x = hx - 1; x <= hx + 7; x += 1) {
    for (let z = hz - 1; z <= hz + 5; z += 1) set(x, floorY + 3, z, WOOD, PART_ROOF);
  }
  for (let x = hx; x <= hx + 6; x += 1) {
    set(x, floorY + 4, hz + 2, WOOD, PART_ROOF);
    set(x, floorY + 4, hz + 3, WOOD, PART_ROOF);
  }
  set(hx + 1, floorY + 4, hz + 1, STONE, PART_ROOF);
  set(hx + 1, floorY + 5, hz + 1, STONE, PART_ROOF);

  for (let i = 1; i <= 7; i += 1) {
    for (let w = 0; w < 2; w += 1) {
      const x = hx + 3 + w;
      const z = hz - i;
      if (!inBounds(x, 0, z)) continue;
      const top = ground[z * WORLD_X + x];
      if (top > 0 && get(x, top - 1, z) === GRASS) set(x, top - 1, z, DIRT);
    }
  }
  set(hx + 8, floorY, hz + 1, METAL);
  set(hx + 8, floorY, hz + 2, METAL);
  set(hx + 9, floorY, hz + 1, METAL);
  set(hx + 8, floorY + 1, hz + 1, METAL);

  const rand = mulberry32(1337);
  const trees: Array<{ x: number; z: number }> = [];
  for (let attempt = 0; attempt < 500 && trees.length < 20; attempt += 1) {
    const x = 8 + Math.floor(rand() * (WORLD_X - 16));
    const z = 8 + Math.floor(rand() * (WORLD_Z - 16));
    const surface = ground[z * WORLD_X + x];
    if (surface < 8 || surface > 18) continue;
    if (get(x, surface - 1, z) !== GRASS) continue;
    if (Math.abs(x - hx) < 10 && Math.abs(z - hz) < 8) continue;
    if (trees.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < 49)) continue;
    const height = 4 + Math.floor(rand() * 3);
    const tint = Math.floor(rand() * 3);
    for (let y = 0; y < height; y += 1) set(x, surface + y, z, WOOD);
    const blobs = 3 + Math.floor(rand() * 3);
    for (let b = 0; b < blobs; b += 1) {
      const cx = x + Math.floor(rand() * 3) - 1;
      const cy = surface + height - 1 + Math.floor(rand() * 3);
      const cz = z + Math.floor(rand() * 3) - 1;
      const r = 1 + (rand() > 0.55 ? 1 : 0);
      for (let y = -r; y <= r; y += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          for (let dz = -r; dz <= r; dz += 1) {
            if (dx * dx + y * y + dz * dz > r * r + 0.4) continue;
            const wx = cx + dx;
            const wy = cy + y;
            const wz = cz + dz;
            if (get(wx, wy, wz) === WOOD) continue;
            set(wx, wy, wz, LEAVES, PART_TERRAIN, tint);
          }
        }
      }
    }
    trees.push({ x, z });
  }

  for (let i = 0; i < 36; i += 1) {
    const x = 6 + Math.floor(rand() * (WORLD_X - 12));
    const z = 6 + Math.floor(rand() * (WORLD_Z - 12));
    const surface = ground[z * WORLD_X + x];
    if (get(x, surface - 1, z) !== GRASS && get(x, surface - 1, z) !== STONE) continue;
    if (Math.abs(x - hx) < 8 && Math.abs(z - hz) < 7) continue;
    const h = 1 + (rand() > 0.7 ? 1 : 0);
    for (let y = 0; y < h; y += 1) {
      if (get(x, surface + y, z) === AIR) set(x, surface + y, z, STONE);
    }
  }

  for (let i = 0; i < 18; i += 1) {
    const x = 6 + Math.floor(rand() * (WORLD_X - 12));
    const z = 6 + Math.floor(rand() * (WORLD_Z - 12));
    const surface = ground[z * WORLD_X + x];
    if (get(x, surface - 1, z) !== GRASS) continue;
    const tint = Math.floor(rand() * 3);
    for (let y = 0; y <= 1; y += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          if (dx * dx + dz * dz + y * y > 1.2) continue;
          if (get(x + dx, surface + y, z + dz) === AIR) set(x + dx, surface + y, z + dz, LEAVES, PART_TERRAIN, tint);
        }
      }
    }
  }

  const tintOf = (x: number, y: number, z: number, block: number): [number, number, number] => {
    if (block !== LEAVES) return [1, 1, 1];
    return LEAF_TINTS[tints[voxelIndex(x, y, z)] % 3];
  };

  const terrain: Mesh[] = [];
  for (let cy = 0; cy < WORLD_Y / CHUNK; cy += 1) {
    for (let cz = 0; cz < WORLD_Z / CHUNK; cz += 1) {
      for (let cx = 0; cx < WORLD_X / CHUNK; cx += 1) {
        const builder = new Builder();
        for (let y = cy * CHUNK; y < (cy + 1) * CHUNK; y += 1) {
          for (let z = cz * CHUNK; z < (cz + 1) * CHUNK; z += 1) {
            for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x += 1) {
              const id = get(x, y, z);
              if (id === AIR || parts[voxelIndex(x, y, z)] !== PART_TERRAIN) continue;
              appendBlock(builder, x, y, z, id, tintOf(x, y, z, id), solid);
            }
          }
        }
        const geo = builder.geometry();
        if (!geo) continue;
        const mesh = new Mesh(geo, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        terrain.push(mesh);
      }
    }
  }

  const meshPart = (part: number, mat: MeshStandardMaterial) => {
    const builder = new Builder();
    for (let y = 0; y < WORLD_Y; y += 1) {
      for (let z = 0; z < WORLD_Z; z += 1) {
        for (let x = 0; x < WORLD_X; x += 1) {
          const i = voxelIndex(x, y, z);
          if (parts[i] !== part || voxels[i] === AIR) continue;
          appendBlock(builder, x, y, z, voxels[i], [1, 1, 1], solid);
        }
      }
    }
    const geo = builder.geometry();
    const mesh = new Mesh(geo ?? new BufferGeometry(), mat);
    if (!geo) mesh.visible = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  const cloneMat = () => {
    const mat = material.clone();
    mat.transparent = true;
    mat.opacity = 1;
    mat.depthWrite = true;
    return mat;
  };
  const foundationMat = cloneMat();
  const roofMaterial = cloneMat();
  const wallMats = [cloneMat(), cloneMat(), cloneMat(), cloneMat()];
  const foundation = meshPart(PART_FOUNDATION, foundationMat);
  const wallParts = [PART_WALL_S, PART_WALL_N, PART_WALL_E, PART_WALL_W];
  const walls = wallParts.map((part, i) => ({ mesh: meshPart(part, wallMats[i]), material: wallMats[i] }));
  const roof = meshPart(PART_ROOF, roofMaterial);

  const heightData = new Float32Array(WORLD_X * WORLD_Z * 4);
  for (let i = 0; i < ground.length; i += 1) heightData[i * 4] = ground[i];
  const heightTex = new DataTexture(heightData, WORLD_X, WORLD_Z, RGBAFormat, FloatType);
  heightTex.magFilter = LinearFilter;
  heightTex.minFilter = LinearFilter;
  heightTex.wrapS = ClampToEdgeWrapping;
  heightTex.wrapT = ClampToEdgeWrapping;
  heightTex.flipY = false;
  heightTex.needsUpdate = true;

  const groundY = (x: number, z: number) => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    if (ix < 0 || iz < 0 || ix >= WORLD_X || iz >= WORLD_Z) return 0;
    let top = 0;
    for (let y = 0; y < WORLD_Y; y += 1) {
      const id = get(ix, y, iz);
      if (id !== AIR && id !== WOOD && id !== LEAVES) top = y + 1;
    }
    return top;
  };
  const blocked = (x: number, y: number, z: number) => {
    const r = 0.28;
    for (let ix = Math.floor(x - r); ix <= Math.floor(x + r); ix += 1) {
      for (let iz = Math.floor(z - r); iz <= Math.floor(z + r); iz += 1) {
        for (let iy = Math.floor(y + 0.08); iy <= Math.floor(y + 1.55); iy += 1) {
          if (solid(ix, iy, iz)) return true;
        }
      }
    }
    return false;
  };

  const start = { x: hx + 3.5, y: 0, z: hz - 3.4 };
  start.y = groundY(start.x, start.z);
  return {
    terrain,
    foundation,
    walls,
    roof,
    roofMaterial,
    floorY,
    inside: { x: hx + 3.5, z: hz + 2.2 },
    playerStart: start,
    heightTex,
    groundY,
    blocked,
    surfaceBlock: (x: number, z: number) => get(Math.floor(x), groundY(x, z) - 1, Math.floor(z)),
    chunkCount: terrain.length,
  };
}
