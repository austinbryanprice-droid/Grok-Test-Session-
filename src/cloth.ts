import * as THREE from 'three/webgpu';

export type Strand = {
  pos: any[];
  prev: any[];
  rest: number;
};

const scratch = new THREE.Vector3();
const delta = new THREE.Vector3();

export function createStrand(anchor: any, direction: any, links: number, rest: number): Strand {
  const pos: any[] = [];
  const prev: any[] = [];
  for (let i = 0; i < links; i += 1) {
    const point = anchor.clone().addScaledVector(direction, rest * i);
    pos.push(point);
    prev.push(point.clone());
  }
  return { pos, prev, rest };
}

export function stepStrand(strand: Strand, anchor: any, dt: number): void {
  const damp = 0.92;
  const gravity = -6.5 * dt * dt;
  strand.pos[0].copy(anchor);
  strand.prev[0].copy(anchor);
  for (let i = 1; i < strand.pos.length; i += 1) {
    const point = strand.pos[i];
    const previous = strand.prev[i];
    scratch.copy(point).sub(previous).multiplyScalar(damp);
    previous.copy(point);
    point.add(scratch);
    point.y += gravity;
  }
  for (let pass = 0; pass < 3; pass += 1) {
    strand.pos[0].copy(anchor);
    for (let i = 1; i < strand.pos.length; i += 1) {
      delta.copy(strand.pos[i]).sub(strand.pos[i - 1]);
      const len = delta.length() || 1;
      delta.multiplyScalar(1 - strand.rest / len);
      strand.pos[i].sub(delta);
    }
  }
}
