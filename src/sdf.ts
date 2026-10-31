export type Vec3 = [number, number, number];

export type NetMesh = {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
};

const CORNERS: readonly Vec3[] = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];

const EDGES: readonly [number, number][] = [
  [0, 1], [0, 2], [0, 4],
  [1, 3], [1, 5],
  [2, 3], [2, 6],
  [3, 7],
  [4, 5], [4, 6],
  [5, 7], [6, 7],
];

export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

export function sdSphere(x: number, y: number, z: number, r: number): number {
  return Math.hypot(x, y, z) - r;
}

export function sdEllipsoid(x: number, y: number, z: number, rx: number, ry: number, rz: number): number {
  const kx = x / rx;
  const ky = y / ry;
  const kz = z / rz;
  const k0 = Math.hypot(kx, ky, kz);
  const k1 = Math.hypot(kx / rx, ky / ry, kz / rz);
  return k0 * (k0 - 1) / Math.max(k1, 1e-8);
}

export function sdCapsule(
  x: number, y: number, z: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  r: number,
): number {
  const pax = x - ax;
  const pay = y - ay;
  const paz = z - az;
  const bax = bx - ax;
  const bay = by - ay;
  const baz = bz - az;
  const denom = bax * bax + bay * bay + baz * baz;
  const h = denom < 1e-8 ? 0 : Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / denom));
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
}

function sampleLerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function surfaceNet(
  samples: Vec3,
  field: (x: number, y: number, z: number) => number,
  min: Vec3,
  max: Vec3,
): NetMesh {
  const nx = samples[0];
  const ny = samples[1];
  const nz = samples[2];
  const cx = nx - 1;
  const cy = ny - 1;
  const cz = nz - 1;
  const cellCount = cx * cy * cz;
  const cellVertex = new Int32Array(cellCount);
  cellVertex.fill(-1);
  const positions: number[] = [];
  const gradients: number[] = [];
  const edgeMasks: number[] = [];

  const at = (i: number, j: number, k: number): number =>
    field(
      sampleLerp(min[0], max[0], i / cx),
      sampleLerp(min[1], max[1], j / cy),
      sampleLerp(min[2], max[2], k / cz),
    );

  const cellIndex = (i: number, j: number, k: number): number => (k * cy + j) * cx + i;
  const indices: number[] = [];

  const pushFace = (a: number, b: number, c: number) => {
    if (a < 0 || b < 0 || c < 0 || a === b || b === c || a === c) return;
    const ax = positions[a * 3];
    const ay = positions[a * 3 + 1];
    const az = positions[a * 3 + 2];
    const bx = positions[b * 3] - ax;
    const by = positions[b * 3 + 1] - ay;
    const bz = positions[b * 3 + 2] - az;
    const ux = positions[c * 3] - ax;
    const uy = positions[c * 3 + 1] - ay;
    const uz = positions[c * 3 + 2] - az;
    const nx = by * uz - bz * uy;
    const ny = bz * ux - bx * uz;
    const nz = bx * uy - by * ux;
    const gx = gradients[a * 3];
    const gy = gradients[a * 3 + 1];
    const gz = gradients[a * 3 + 2];
    if (nx * gx + ny * gy + nz * gz < 0) indices.push(a, c, b);
    else indices.push(a, b, c);
  };

  for (let k = 0; k < cz; k += 1) {
    for (let j = 0; j < cy; j += 1) {
      for (let i = 0; i < cx; i += 1) {
        const cornerValue: number[] = [];
        let mask = 0;
        for (let c = 0; c < 8; c += 1) {
          const corner = CORNERS[c];
          const value = at(i + corner[0], j + corner[1], k + corner[2]);
          cornerValue.push(value);
          if (value < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 0xff) continue;

        let edgeMask = 0;
        const sum = [0, 0, 0];
        let edgeCount = 0;
        for (let e = 0; e < 12; e += 1) {
          const c0 = EDGES[e][0];
          const c1 = EDGES[e][1];
          const inside0 = (mask & (1 << c0)) !== 0;
          const inside1 = (mask & (1 << c1)) !== 0;
          if (inside0 === inside1) continue;
          edgeMask |= 1 << e;
          const g0 = cornerValue[c0];
          const g1 = cornerValue[c1];
          const denom = g0 - g1;
          const t = Math.abs(denom) > 1e-6 ? Math.min(1, Math.max(0, g0 / denom)) : 0.5;
          edgeCount += 1;
          for (let axis = 0; axis < 3; axis += 1) {
            const a = CORNERS[c0][axis];
            const b = CORNERS[c1][axis];
            sum[axis] += a === b ? a : (a === 1 ? 1 - t : t);
          }
        }
        if (edgeCount === 0) continue;

        const inv = 1 / edgeCount;
        const px = sampleLerp(min[0], max[0], (i + sum[0] * inv) / cx);
        const py = sampleLerp(min[1], max[1], (j + sum[1] * inv) / cy);
        const pz = sampleLerp(min[2], max[2], (k + sum[2] * inv) / cz);
        const vid = positions.length / 3;
        positions.push(px, py, pz);
        const step = 0.004;
        gradients.push(
          field(px + step, py, pz) - field(px - step, py, pz),
          field(px, py + step, pz) - field(px, py - step, pz),
          field(px, py, pz + step) - field(px, py, pz - step),
        );
        cellVertex[cellIndex(i, j, k)] = vid;
        edgeMasks.push(edgeMask);

        const orthogonal: Vec3[] = [[0, 1, 0], [0, 0, 1], [1, 0, 0]];
        const orthogonalB: Vec3[] = [[0, 0, 1], [1, 0, 0], [0, 1, 0]];
        for (let axis = 0; axis < 3; axis += 1) {
          if ((edgeMask & (1 << axis)) === 0) continue;
          const u = orthogonal[axis];
          const v = orthogonalB[axis];
          if ((axis === 0 && (j === 0 || k === 0)) || (axis === 1 && (k === 0 || i === 0)) || (axis === 2 && (i === 0 || j === 0))) {
            continue;
          }
          const m = vid;
          const mu = cellVertex[cellIndex(i - u[0], j - u[1], k - u[2])];
          const mv = cellVertex[cellIndex(i - v[0], j - v[1], k - v[2])];
          const muv = cellVertex[cellIndex(i - u[0] - v[0], j - u[1] - v[1], k - u[2] - v[2])];
          if ((mask & 1) !== 0) {
            pushFace(m, mu, mv);
            pushFace(mv, mu, muv);
          } else {
            pushFace(m, mv, mu);
            pushFace(mu, mv, muv);
          }
        }
      }
    }
  }
  void edgeMasks;

  const normalArray = new Float32Array(gradients.length);
  for (let i = 0; i < gradients.length; i += 3) {
    const x = gradients[i];
    const y = gradients[i + 1];
    const z = gradients[i + 2];
    const len = Math.hypot(x, y, z) || 1;
    normalArray[i] = x / len;
    normalArray[i + 1] = y / len;
    normalArray[i + 2] = z / len;
  }

  return {
    positions: Float32Array.from(positions),
    normals: normalArray,
    indices: Uint32Array.from(indices),
  };
}

// Low forward crouch. Local forward is -z. Head origin is (0, 0.78, -0.70).
// Ellipsoid arguments are the sample point minus the primitive center.
export function sdWerewolf(x: number, y: number, z: number): number {
  const pelvis = sdEllipsoid(x, y - 0.4, z - 0.22, 0.16, 0.11, 0.15);
  const belly = sdEllipsoid(x, y - 0.46, z + 0.02, 0.18, 0.13, 0.16);
  const chest = sdEllipsoid(x, y - 0.55, z + 0.32, 0.26, 0.15, 0.22);
  const hump = sdEllipsoid(x, y - 0.66, z + 0.08, 0.2, 0.09, 0.16);
  const neck = sdCapsule(x, y, z, 0, 0.58, -0.38, 0, 0.74, -0.62, 0.085);
  let body = smin(pelvis, belly, 0.06);
  body = smin(body, chest, 0.07);
  body = smin(body, hump, 0.05);
  body = smin(body, neck, 0.045);

  const arm = (side: number) => {
    const upper = sdCapsule(x, y, z, side * 0.22, 0.6, -0.18, side * 0.26, 0.32, -0.5, 0.095);
    const fore = sdCapsule(x, y, z, side * 0.26, 0.32, -0.5, side * 0.2, 0.08, -0.86, 0.062);
    const hand = sdEllipsoid(x - side * 0.2, y - 0.07, z + 0.96, 0.075, 0.038, 0.1);
    return smin(smin(upper, fore, 0.04), hand, 0.035);
  };
  body = smin(body, arm(1), 0.05);
  body = smin(body, arm(-1), 0.05);
  body = smin(body, sdSphere(0.24, 0.62, -0.16, 0.1), 0.035);
  body = smin(body, sdSphere(-0.24, 0.62, -0.16, 0.1), 0.035);

  const leg = (side: number) => {
    const thigh = sdCapsule(x, y, z, side * 0.11, 0.36, 0.16, side * 0.15, 0.22, 0.36, 0.09);
    const shin = sdCapsule(x, y, z, side * 0.15, 0.22, 0.36, side * 0.11, 0.06, 0.04, 0.055);
    const paw = sdEllipsoid(x - side * 0.11, y - 0.04, z + 0.08, 0.055, 0.028, 0.11);
    return smin(smin(thigh, shin, 0.035), paw, 0.03);
  };
  body = smin(body, leg(1), 0.045);
  body = smin(body, leg(-1), 0.045);

  const tailA = sdCapsule(x, y, z, 0, 0.34, 0.3, 0.02, 0.22, 0.52, 0.045);
  const tailB = sdCapsule(x, y, z, 0.02, 0.22, 0.52, 0.08, 0.16, 0.78, 0.026);
  body = smin(body, smin(tailA, tailB, 0.03), 0.035);

  const hx = x;
  const hy = y - 0.78;
  const hz = z + 0.7;
  const skull = sdEllipsoid(hx, hy, hz, 0.13, 0.115, 0.13);
  const muzzle = sdEllipsoid(hx, hy - 0.02, hz + 0.38, 0.064, 0.042, 0.32);
  const brow = sdEllipsoid(hx, hy - 0.055, hz + 0.08, 0.11, 0.032, 0.05);
  const jaw = sdEllipsoid(hx, hy + 0.12, hz + 0.32, 0.055, 0.032, 0.2);
  const cheekL = sdEllipsoid(hx - 0.07, hy + 0.01, hz + 0.06, 0.04, 0.035, 0.045);
  const cheekR = sdEllipsoid(hx + 0.07, hy + 0.01, hz + 0.06, 0.04, 0.035, 0.045);
  let head = smin(skull, muzzle, 0.045);
  head = smin(head, brow, 0.025);
  head = smin(head, jaw, 0.01);
  head = smin(head, cheekL, 0.025);
  head = smin(head, cheekR, 0.025);
  const eyeL = sdSphere(hx - 0.048, hy - 0.005, hz + 0.11, 0.026);
  const eyeR = sdSphere(hx + 0.048, hy - 0.005, hz + 0.11, 0.026);
  head = smax(head, -eyeL, 0.008);
  head = smax(head, -eyeR, 0.008);
  // Slot thicker than a surface-net cell, so the snout stays split into lip and jaw.
  const mouth = sdCapsule(x, y, z, 0, 0.72, -0.96, 0, 0.72, -1.22, 0.042);
  head = smax(head, -mouth, 0.01);
  body = smin(body, head, 0.04);
  return body;
}

export const HEAD_ORIGIN = { x: 0, y: 0.78, z: -0.7 };

// Character-space points that sit in the open mouth. Teeth are mounted on these.
export const FANGS: Array<{ x: number; y: number; z: number; down: boolean; length: number }> = [
  { x: -0.038, y: 0.748, z: -1.16, down: true, length: 0.05 },
  { x: -0.014, y: 0.752, z: -1.18, down: true, length: 0.034 },
  { x: 0.014, y: 0.752, z: -1.18, down: true, length: 0.034 },
  { x: 0.038, y: 0.748, z: -1.16, down: true, length: 0.05 },
  { x: -0.026, y: 0.698, z: -1.14, down: false, length: 0.032 },
  { x: 0, y: 0.694, z: -1.16, down: false, length: 0.03 },
  { x: 0.026, y: 0.698, z: -1.14, down: false, length: 0.032 },
];

// ConeGeometry is centered, apex toward +Y. A down fang's tip is half a length below the point.
export function fangTip(fang: { x: number; y: number; z: number; down: boolean; length: number }): {
  x: number;
  y: number;
  z: number;
} {
  return {
    x: fang.x,
    y: fang.y + (fang.down ? -fang.length / 2 : fang.length / 2),
    z: fang.z,
  };
}

export function werewolfRegion(x: number, y: number, z: number): 'fur' | 'mane' | 'skin' | 'nose' | 'lip' {
  const headForward = -(z + 0.7);
  const headY = y - 0.78;
  if (headForward > 0.58 && Math.abs(x) < 0.045 && Math.abs(headY) < 0.05) return 'nose';
  if (headForward > 0.22 && headY < 0.02 && headY > -0.08 && Math.abs(x) < 0.06) return 'lip';
  if (headForward > 0.08 && y > 0.62 && Math.abs(x) < 0.12) return 'skin';
  if (y > 0.42 && y < 0.86 && z > -0.5 && z < 0.28 && Math.abs(x) < 0.28) return 'mane';
  return 'fur';
}
