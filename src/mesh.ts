import { BufferAttribute, BufferGeometry, Float32BufferAttribute } from 'three';
import { atlasUV, tileOf } from './blocks';
import { hash3 } from './noise';
import { tuning } from './tuning';

type SolidFn = (x: number, y: number, z: number) => boolean;
type Vec3 = [number, number, number];

const FACES: Array<{ n: Vec3; c: Vec3[] }> = [
  { n: [0, 1, 0], c: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]] },
  { n: [0, -1, 0], c: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]] },
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 1, 1], [1, 1, 0], [1, 0, 0]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]] },
  { n: [0, 0, -1], c: [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 0]] },
];

export class Builder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];
  indices: number[] = [];

  quad(verts: Vec3[], normal: Vec3, uvs: Array<[number, number]>, cols: Vec3[], flipDiag: boolean): void {
    const ab: Vec3 = [verts[1][0] - verts[0][0], verts[1][1] - verts[0][1], verts[1][2] - verts[0][2]];
    const ad: Vec3 = [verts[3][0] - verts[0][0], verts[3][1] - verts[0][1], verts[3][2] - verts[0][2]];
    const cx = ab[1] * ad[2] - ab[2] * ad[1];
    const cy = ab[2] * ad[0] - ab[0] * ad[2];
    const cz = ab[0] * ad[1] - ab[1] * ad[0];
    const order = cx * normal[0] + cy * normal[1] + cz * normal[2] < 0 ? [0, 3, 2, 1] : [0, 1, 2, 3];
    const base = this.positions.length / 3;
    for (const i of order) {
      const p = verts[i];
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(normal[0], normal[1], normal[2]);
      this.uvs.push(uvs[i][0], uvs[i][1]);
      this.colors.push(cols[i][0], cols[i][1], cols[i][2]);
    }
    if (!flipDiag) this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else this.indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  }

  geometry(): BufferGeometry | null {
    if (this.positions.length === 0) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
    g.setIndex(new BufferAttribute(new Uint32Array(this.indices), 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

function norm(x: number, y: number, z: number): Vec3 {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

function cornerAO(x: number, y: number, z: number, n: Vec3, c: Vec3, solid: SolidFn): number {
  const base: Vec3 = [x + n[0], y + n[1], z + n[2]];
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let tx = 0;
  let ty = 0;
  let tz = 0;
  let first = true;
  for (let axis = 0; axis < 3; axis += 1) {
    if (n[axis] !== 0) continue;
    const sign = c[axis] === 0 ? -1 : 1;
    if (first) {
      if (axis === 0) sx = sign;
      else if (axis === 1) sy = sign;
      else sz = sign;
      first = false;
    } else if (axis === 0) tx = sign;
    else if (axis === 1) ty = sign;
    else tz = sign;
  }
  const s1 = solid(base[0] + sx, base[1] + sy, base[2] + sz);
  const s2 = solid(base[0] + tx, base[1] + ty, base[2] + tz);
  const sc = solid(base[0] + sx + tx, base[1] + sy + ty, base[2] + sz + tz);
  if (s1 && s2) return 0;
  return 3 - (Number(s1) + Number(s2) + Number(sc));
}

function shade(ao: number, variation: number, tint: Vec3, boost = 1): Vec3 {
  const a = (0.28 + 0.72 * (ao / 3)) * boost;
  return [a * variation * tint[0], a * variation * tint[1], a * variation * tint[2]];
}

/**
 * One exposed box face becomes an inset quad, four chamfer strips, and four corner patches.
 * The chamfer stays inside the cell so neighboring blocks meet without cracks.
 * AO uses 0–3 neighbors per corner and flips the quad diagonal.
 */
export function appendExposedFaces(
  builder: Builder,
  x: number,
  y: number,
  z: number,
  block: number,
  size: Vec3,
  tint: Vec3,
  solid: SolidFn,
  bevel = tuning.bevel,
): void {
  const tile = tileOf(block);
  const rot = Math.min(3, Math.floor(hash3(x, y, z) * 4));
  const variation = 0.97 + hash3(x, y, z + 11) * 0.06;
  const b = Math.min(bevel, size[0] * 0.22, size[1] * 0.22, size[2] * 0.22);
  const lift = (hash3(x, 2, z) - 0.5) * 0.03;
  const tiltX = (hash3(x, 3, z) - 0.5) * 0.02;
  const tiltZ = (hash3(x, 4, z) - 0.5) * 0.02;

  for (const face of FACES) {
    const n = face.n;
    if (solid(x + n[0], y + n[1], z + n[2])) continue;
    const c0 = face.c[0];
    const c1 = face.c[1];
    const c3 = face.c[3];
    const U: Vec3 = [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]];
    const V: Vec3 = [c3[0] - c0[0], c3[1] - c0[1], c3[2] - c0[2]];
    const top = n[1] === 1 && size[0] === 1 && size[1] === 1 && size[2] === 1;
    const at = (u: number, v: number, inset: number): Vec3 => {
      const pos: Vec3 = [
        x + (c0[0] + U[0] * u + V[0] * v) * size[0] - n[0] * inset,
        y + (c0[1] + U[1] * u + V[1] * v) * size[1] - n[1] * inset,
        z + (c0[2] + U[2] * u + V[2] * v) * size[2] - n[2] * inset,
      ];
      if (top && u > 0.001 && v > 0.001 && u < 0.999 && v < 0.999) {
        pos[1] += lift + tiltX * (u - 0.5) + tiltZ * (v - 0.5);
      }
      return pos;
    };
    const uv = (u: number, v: number): [number, number] => atlasUV(tile, u, v, rot);
    const ao = face.c.map((c) => cornerAO(x, y, z, n, c, solid));
    const col = (a: number, boost = 1): Vec3 => shade(a, variation, tint, boost);

    builder.quad(
      [at(b, b, 0), at(1 - b, b, 0), at(1 - b, 1 - b, 0), at(b, 1 - b, 0)],
      n,
      [uv(b, b), uv(1 - b, b), uv(1 - b, 1 - b), uv(b, 1 - b)],
      [col(ao[0]), col(ao[1]), col(ao[2]), col(ao[3])],
      ao[0] + ao[2] < ao[1] + ao[3],
    );

    const edges: Array<{ u0: number; v0: number; u1: number; v1: number; out: Vec3; a0: number; a1: number }> = [
      { u0: b, v0: 0, u1: 1 - b, v1: 0, out: [-V[0], -V[1], -V[2]], a0: ao[0], a1: ao[1] },
      { u0: 1, v0: b, u1: 1, v1: 1 - b, out: [U[0], U[1], U[2]], a0: ao[1], a1: ao[2] },
      { u0: 1 - b, v0: 1, u1: b, v1: 1, out: [V[0], V[1], V[2]], a0: ao[2], a1: ao[3] },
      { u0: 0, v0: 1 - b, u1: 0, v1: b, out: [-U[0], -U[1], -U[2]], a0: ao[3], a1: ao[0] },
    ];
    for (const e of edges) {
      const en = norm(n[0] + e.out[0], n[1] + e.out[1], n[2] + e.out[2]);
      const du = e.u0 === e.u1 ? (e.u0 === 0 ? b : -b) : 0;
      const dv = e.v0 === e.v1 ? (e.v0 === 0 ? b : -b) : 0;
      const iu0 = e.u0 + du;
      const iv0 = e.v0 + dv;
      const iu1 = e.u1 + du;
      const iv1 = e.v1 + dv;
      builder.quad(
        [at(e.u0, e.v0, b), at(e.u1, e.v1, b), at(iu1, iv1, 0), at(iu0, iv0, 0)],
        en,
        [uv(e.u0, e.v0), uv(e.u1, e.v1), uv(iu1, iv1), uv(iu0, iv0)],
        [col(e.a0, 1.28), col(e.a1, 1.28), col(e.a1, 1.28), col(e.a0, 1.28)],
        false,
      );
    }

    const corners: Array<{ u: number; v: number; outU: Vec3; outV: Vec3; a: number }> = [
      { u: 0, v: 0, outU: [-U[0], -U[1], -U[2]], outV: [-V[0], -V[1], -V[2]], a: ao[0] },
      { u: 1, v: 0, outU: [U[0], U[1], U[2]], outV: [-V[0], -V[1], -V[2]], a: ao[1] },
      { u: 1, v: 1, outU: [U[0], U[1], U[2]], outV: [V[0], V[1], V[2]], a: ao[2] },
      { u: 0, v: 1, outU: [-U[0], -U[1], -U[2]], outV: [V[0], V[1], V[2]], a: ao[3] },
    ];
    for (const c of corners) {
      const du = c.u === 0 ? b : -b;
      const dv = c.v === 0 ? b : -b;
      const cn = norm(n[0] + c.outU[0] + c.outV[0], n[1] + c.outU[1] + c.outV[1], n[2] + c.outU[2] + c.outV[2]);
      const ccol = col(c.a, 1.18);
      builder.quad(
        [at(c.u, c.v, b), at(c.u + du, c.v, b), at(c.u + du, c.v + dv, 0), at(c.u, c.v + dv, b)],
        cn,
        [uv(c.u, c.v), uv(c.u + du, c.v), uv(c.u + du, c.v + dv), uv(c.u, c.v + dv)],
        [ccol, ccol, ccol, ccol],
        false,
      );
    }
  }
}

export function appendBlock(
  builder: Builder,
  x: number,
  y: number,
  z: number,
  block: number,
  tint: Vec3,
  solid: SolidFn,
): void {
  appendExposedFaces(builder, x, y, z, block, [1, 1, 1], tint, solid, tuning.bevel);
}
