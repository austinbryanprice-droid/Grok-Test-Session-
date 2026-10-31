import assert from 'node:assert/strict';
import { EYES, FANGS, fangTip, sdWerewolf, surfaceNet } from '../src/sdf.ts';

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

const skull = [0, 0.78, -0.7];
const muzzle = [0, 0.8, -1.15];
const hand = [0.18, 0.07, -0.9];
assert.ok(sdWerewolf(0, 0.55, -0.32) < 0, 'chest of the low crouch should be inside');
assert.ok(sdWerewolf(skull[0], skull[1], skull[2]) < 0, 'skull should be inside');
assert.ok(sdWerewolf(muzzle[0], muzzle[1], muzzle[2]) < 0, 'muzzle should be inside on -z');
assert.ok(sdWerewolf(hand[0], hand[1], hand[2]) < 0, 'forward low hand should be inside');
assert.ok(sdWerewolf(0, 1.2, 0.22) > 0, 'space above the hips should be outside the low crouch');
assert.ok(sdWerewolf(0.75, 0.4, -0.3) > 0, 'a wide lateral sample should miss the tucked arms');
assert.ok(muzzle[2] < skull[2], 'muzzle sample is not in front of the skull');

let noseZ = 0;
for (let y = 0.6; y <= 0.95; y += 0.04) {
  for (let z = -1.6; z <= -0.5; z += 0.04) {
    if (sdWerewolf(0, y, z) < 0) noseZ = Math.min(noseZ, z);
  }
}
assert.ok(noseZ < skull[2] - 0.35, `muzzle tip ${noseZ} is not farther on -z than the skull ${skull[2]}`);
assert.ok(sdWerewolf(0, 0.72, -1.1) > 0, 'the mouth slot should be open air');
assert.ok(sdWerewolf(0, 0.76, -1.06) > 0, 'the old buried upper-tooth sample should be open air');
for (const fang of FANGS) {
  const gap = sdWerewolf(fang.x, fang.y, fang.z);
  assert.ok(gap > 0, `fang (${fang.x}, ${fang.y}, ${fang.z}) is inside the snout (${gap})`);
  const tip = fangTip(fang);
  const tipGap = sdWerewolf(tip.x, tip.y, tip.z);
  assert.ok(tipGap > 0, `fang tip (${tip.x}, ${tip.y}, ${tip.z}) is inside the snout (${tipGap})`);
}
for (const eye of EYES) {
  const seat = sdWerewolf(eye.x, eye.y, eye.z);
  assert.ok(seat > 0, `eye (${eye.x}, ${eye.y}, ${eye.z}) should sit in air on the brow (${seat})`);
  const ahead = sdWerewolf(eye.x * 0.4, eye.y - 0.03, eye.z - 0.18);
  assert.ok(ahead > 0, `the muzzle should leave the eye (${eye.x}, ${eye.y}, ${eye.z}) in view (${ahead})`);
}

console.log(`sdf tests passed (${count} sphere verts, muzzle tip z=${noseZ.toFixed(2)})`);
