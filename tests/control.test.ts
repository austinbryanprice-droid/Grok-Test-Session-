import assert from 'node:assert/strict';
import { FLOOR_RADIUS, FLOOR_Y, MOVE_SPEED, planarForward, stepMove } from '../src/control.ts';

const rest = { x: 0, y: 0, z: 0, yaw: 0 };
const dt = 0.1;

function travelOf(from: { x: number; z: number }, to: { x: number; z: number }): { x: number; z: number; length: number } {
  const x = to.x - from.x;
  const z = to.z - from.z;
  return { x, z, length: Math.hypot(x, z) };
}

function facingDot(yaw: number, delta: { x: number; z: number; length: number }): number {
  const forward = planarForward(yaw);
  return (forward.x * delta.x + forward.z * delta.z) / delta.length;
}

const ahead = stepMove(rest, { forward: 1, strafe: 0 }, dt);
const aheadDelta = travelOf(rest, ahead);
assert.ok(Math.abs(ahead.x) < 1e-6, `forward moved on x (${ahead.x})`);
assert.ok(ahead.z < -0.05, `forward did not travel on -z (${ahead.z})`);
assert.ok(Math.abs(ahead.yaw) < 1e-6, `forward changed yaw (${ahead.yaw})`);
assert.ok(Math.abs(aheadDelta.length - MOVE_SPEED * dt) < 1e-6, `forward length ${aheadDelta.length}`);
assert.equal(ahead.y, FLOOR_Y);
const aheadFace = facingDot(ahead.yaw, aheadDelta);
assert.ok(aheadFace > 0.9, `forward facing ${aheadFace}`);

const side = stepMove(rest, { forward: 0, strafe: 1 }, dt);
const sideDelta = travelOf(rest, side);
assert.ok(side.x > 0.05, `strafe did not travel on +x (${side.x})`);
assert.ok(Math.abs(side.z) < 1e-6, `strafe moved on z (${side.z})`);
assert.ok(Math.abs(sideDelta.length - MOVE_SPEED * dt) < 1e-6, `strafe length ${sideDelta.length}`);
assert.equal(side.y, FLOOR_Y);
const sideFace = facingDot(side.yaw, sideDelta);
assert.ok(sideFace > 0.9, `strafe facing ${sideFace}`);

const sunk = stepMove({ x: 1, y: -4, z: -1, yaw: 0.4 }, { forward: 0, strafe: 0 }, dt);
assert.equal(sunk.y, FLOOR_Y);
assert.equal(sunk.x, 1);
assert.equal(sunk.z, -1);

const rim = { x: FLOOR_RADIUS - 0.05, y: -2, z: 0, yaw: -Math.PI / 2 };
const held = stepMove(rim, { forward: 1, strafe: 0 }, 1);
const heldRadius = Math.hypot(held.x, held.z);
assert.ok(held.x > rim.x, `outward step did not advance (${held.x})`);
assert.ok(heldRadius <= FLOOR_RADIUS + 1e-6, `left the hall (${heldRadius})`);
assert.equal(held.y, FLOOR_Y);
const heldDelta = travelOf(rim, held);
const heldFace = facingDot(held.yaw, heldDelta);
assert.ok(heldFace > 0.9, `rim facing ${heldFace}`);

console.log(
  `control: forward z=${ahead.z.toFixed(3)} x=${ahead.x.toFixed(3)} yaw=${ahead.yaw.toFixed(3)} facing=${aheadFace.toFixed(3)}`,
);
console.log(
  `control: strafe x=${side.x.toFixed(3)} z=${side.z.toFixed(3)} yaw=${side.yaw.toFixed(3)} facing=${sideFace.toFixed(3)}`,
);
console.log(`control: floor radius=${heldRadius.toFixed(3)} y=${held.y.toFixed(3)}`);
console.log('control tests passed');
