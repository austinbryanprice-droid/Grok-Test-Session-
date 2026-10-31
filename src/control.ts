// Ground move for a y-up, -z-front character. This module is the only place
// that builds planar forward. The page and the follow view both call it.
// Node tests import it, so it stays free of three.js.

export const FLOOR_Y = 0;
/** Inside the court's radius-9 stone, so the body stays on the floor. */
export const FLOOR_RADIUS = 8.4;
export const MOVE_SPEED = 2.4;

/** In front of the muzzle, offset to the character's right. Same forward as movement. */
export const FOLLOW_DISTANCE = 2.55;
export const FOLLOW_SIDE = 1.15;
export const FOLLOW_HEIGHT = 0.82;
export const FOLLOW_LOOK_HEIGHT = 0.42;

export type Pose = {
  x: number;
  y: number;
  z: number;
  yaw: number;
};

export type MoveInput = {
  forward: number;
  strafe: number;
};

export type FollowView = {
  x: number;
  y: number;
  z: number;
  lookX: number;
  lookY: number;
  lookZ: number;
};

/** Local -z after a yaw. yaw 0 is (0, -1). rotation.y uses this same yaw. */
export function planarForward(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

function planarRight(forward: { x: number; z: number }): { x: number; z: number } {
  return { x: -forward.z, z: forward.x };
}

/** Yaw that points local -z along (dx, dz). */
export function yawFacing(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

export function stepMove(pose: Pose, input: MoveInput, dt: number): Pose {
  const step = Math.max(0, dt);
  let forwardAxis = input.forward;
  let strafeAxis = input.strafe;
  const magnitude = Math.hypot(forwardAxis, strafeAxis);
  if (magnitude > 1) {
    forwardAxis /= magnitude;
    strafeAxis /= magnitude;
  }

  const forward = planarForward(pose.yaw);
  const right = planarRight(forward);
  const distance = MOVE_SPEED * step;
  let x = pose.x + (forward.x * forwardAxis + right.x * strafeAxis) * distance;
  let z = pose.z + (forward.z * forwardAxis + right.z * strafeAxis) * distance;

  const radial = Math.hypot(x, z);
  if (radial > FLOOR_RADIUS) {
    const scale = FLOOR_RADIUS / radial;
    x *= scale;
    z *= scale;
  }

  const movedX = x - pose.x;
  const movedZ = z - pose.z;
  const traveled = Math.hypot(movedX, movedZ);
  const yaw = traveled > 1e-8 ? yawFacing(movedX, movedZ) : pose.yaw;
  return { x, y: FLOOR_Y, z, yaw };
}

export function followView(pose: Pose): FollowView {
  const forward = planarForward(pose.yaw);
  const right = planarRight(forward);
  return {
    x: pose.x + forward.x * FOLLOW_DISTANCE + right.x * FOLLOW_SIDE,
    y: pose.y + FOLLOW_HEIGHT,
    z: pose.z + forward.z * FOLLOW_DISTANCE + right.z * FOLLOW_SIDE,
    lookX: pose.x,
    lookY: pose.y + FOLLOW_LOOK_HEIGHT,
    lookZ: pose.z,
  };
}
