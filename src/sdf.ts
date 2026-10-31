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

// Knuckle-walking crouch. Local forward is -z: the muzzle is the most negative z.
// Head frame origin is (0, 1.02, -0.55). Ellipsoid args are point-minus-center.
export function sdWerewolf(x: number, y: number, z: number): number {
  const pelvis = sdEllipsoid(x, y - 0.55, z - 0.15, 0.18, 0.13, 0.16);
  const belly = sdEllipsoid(x, y - 0.64, z + 0.02, 0.22, 0.15, 0.18);
  const chest = sdEllipsoid(x, y - 0.8, z + 0.28, 0.4, 0.2, 0.26);
  const hump = sdEllipsoid(x, y - 0.92, z + 0.08, 0.26, 0.12, 0.2);
  const neck = sdCapsule(x, y, z, 0, 0.84, -0.32, 0, 1.02, -0.5, 0.1);
  let body = smin(pelvis, belly, 0.07);
  body = smin(body, chest, 0.08);
  body = smin(body, hump, 0.06);
  body = smin(body, neck, 0.05);

  const arm = (side: number) => {
    const upper = sdCapsule(x, y, z, side * 0.36, 0.86, -0.2, side * 0.52, 0.42, -0.55, 0.125);
    const fore = sdCapsule(x, y, z, side * 0.52, 0.42, -0.55, side * 0.58, 0.1, -0.82, 0.078);
    const hand = sdEllipsoid(x - side * 0.58, y - 0.08, z + 0.9, 0.1, 0.045, 0.11);
    return smin(smin(upper, fore, 0.045), hand, 0.04);
  };
  body = smin(body, arm(1), 0.06);
  body = smin(body, arm(-1), 0.06);
  body = smin(body, sdSphere(0.34, 0.88, -0.18, 0.14), 0.04);
  body = smin(body, sdSphere(-0.34, 0.88, -0.18, 0.14), 0.04);

  const leg = (side: number) => {
    const thigh = sdCapsule(x, y, z, side * 0.15, 0.5, 0.1, side * 0.22, 0.3, 0.34, 0.11);
    const shin = sdCapsule(x, y, z, side * 0.22, 0.3, 0.34, side * 0.16, 0.08, 0.02, 0.065);
    const paw = sdEllipsoid(x - side * 0.16, y - 0.045, z + 0.18, 0.07, 0.035, 0.14);
    return smin(smin(thigh, shin, 0.04), paw, 0.035);
  };
  body = smin(body, leg(1), 0.05);
  body = smin(body, leg(-1), 0.05);

  const tailA = sdCapsule(x, y, z, 0, 0.48, 0.22, 0.04, 0.34, 0.5, 0.055);
  const tailB = sdCapsule(x, y, z, 0.04, 0.34, 0.5, 0.1, 0.26, 0.82, 0.03);
  body = smin(body, smin(tailA, tailB, 0.035), 0.04);

  const hx = x;
  const hy = y - 1.02;
  const hz = z + 0.55;
  const skull = sdEllipsoid(hx, hy - 0.02, hz, 0.16, 0.14, 0.15);
  const muzzle = sdEllipsoid(hx, hy + 0.02, hz + 0.34, 0.085, 0.07, 0.28);
  const brow = sdEllipsoid(hx, hy - 0.08, hz + 0.1, 0.14, 0.04, 0.06);
  const jaw = sdEllipsoid(hx, hy + 0.06, hz + 0.28, 0.07, 0.05, 0.16);
  const cheekL = sdEllipsoid(hx - 0.08, hy, hz + 0.08, 0.05, 0.045, 0.05);
  const cheekR = sdEllipsoid(hx + 0.08, hy, hz + 0.08, 0.05, 0.045, 0.05);
  let head = smin(skull, muzzle, 0.05);
  head = smin(head, brow, 0.03);
  head = smin(head, jaw, 0.035);
  head = smin(head, cheekL, 0.03);
  head = smin(head, cheekR, 0.03);
  const eyeL = sdSphere(hx - 0.055, hy - 0.01, hz + 0.12, 0.034);
  const eyeR = sdSphere(hx + 0.055, hy - 0.01, hz + 0.12, 0.034);
  head = smax(head, -eyeL, 0.01);
  head = smax(head, -eyeR, 0.01);
  const mouth = sdEllipsoid(hx, hy + 0.05, hz + 0.32, 0.04, 0.014, 0.12);
  head = smax(head, -mouth, 0.006);
  body = smin(body, head, 0.045);
  return body;
}

export function werewolfRegion(x: number, y: number, z: number): 'fur' | 'mane' | 'skin' | 'nose' | 'lip' {
  // Positive headForward is toward the nose, along world -z from the head origin.
  const headForward = -(z + 0.55);
  const headY = y - 1.02;
  if (headForward > 0.52 && Math.abs(x) < 0.05 && Math.abs(headY + 0.02) < 0.05) return 'nose';
  if (headForward > 0.2 && headY < 0.0 && headY > -0.09 && Math.abs(x) < 0.07) return 'lip';
  if (headForward > 0.02 && y > 0.88 && Math.abs(x) < 0.18) return 'skin';
  if (y > 0.7 && y < 1.2 && z > -0.4 && z < 0.15 && Math.abs(x) < 0.36) return 'mane';
  return 'fur';
}
