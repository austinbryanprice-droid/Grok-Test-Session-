import assert from 'node:assert/strict';
import { sdWerewolf, surfaceNet } from '../src/sdf.ts';

function sphere(x: number, y: number, z: number): number {
  return Math.hypot(x, y, z) - 1;
}

const mesh = surfaceNet([26, 26, 26], sphere, [-1.35, -1.35, -1.35], [1.35, 1.35, 1.35]);
assert.ok(mesh.indices.length > 600, `sphere produced too few triangles: ${mesh.indices.length / 3}`);

let radius = 0;
let outward = 0;
const count = mesh.positions.length / 3;
for (let i = 0; i < count; i += 1) {
  const x = mesh.positions[i * 3];
  const y = mesh.positions[i * 3 + 1];
  const z = mesh.positions[i * 3 + 2];
  const len = Math.hypot(x, y, z);
  radius += len;
  const nx = mesh.normals[i * 3];
  const ny = mesh.normals[i * 3 + 1];
  const nz = mesh.normals[i * 3 + 2];
  outward += (x * nx + y * ny + z * nz) / len;
}
radius /= count;
outward /= count;
assert.ok(radius > 0.9 && radius < 1.1, `sphere radius ${radius}`);
assert.ok(outward > 0.8, `normals point inward (${outward})`);

assert.ok(sdWerewolf(0, 0.8, -0.28) < 0, 'chest center should be inside the werewolf');
assert.ok(sdWerewolf(0, 3, 0) > 0, 'empty air should be outside the werewolf');
assert.ok(sdWerewolf(0, 1.0, -0.95) < 0, 'muzzle should occupy -z in front of the skull');
let noseZ = 0;
for (let y = 0.85; y <= 1.2; y += 0.05) {
  for (let z = -1.4; z <= -0.4; z += 0.05) {
    if (sdWerewolf(0, y, z) < 0) noseZ = Math.min(noseZ, z);
  }
}
assert.ok(noseZ < -1.0, `muzzle tip should pass z=-1, got ${noseZ}`);

console.log(`sdf tests passed (${count} sphere verts, werewolf muzzle is -z)`);
