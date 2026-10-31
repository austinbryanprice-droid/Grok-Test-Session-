import * as THREE from 'three/webgpu';
import { createStrand, stepStrand, type Strand } from './cloth.ts';
import { sdWerewolf, surfaceNet, werewolfRegion, type Vec3 } from './sdf.ts';

type Joint = { name: string; parent: string | null; pos: Vec3 };

const JOINTS: Joint[] = [
  { name: 'hips', parent: null, pos: [0, 0.4, 0.22] },
  { name: 'spine', parent: 'hips', pos: [0, 0.46, -0.02] },
  { name: 'chest', parent: 'spine', pos: [0, 0.55, -0.32] },
  { name: 'neck', parent: 'chest', pos: [0, 0.66, -0.5] },
  { name: 'head', parent: 'neck', pos: [0, 0.78, -0.7] },
  { name: 'jaw', parent: 'head', pos: [0, 0.71, -1.0] },
  { name: 'shoulderL', parent: 'chest', pos: [0.22, 0.6, -0.18] },
  { name: 'elbowL', parent: 'shoulderL', pos: [0.26, 0.32, -0.5] },
  { name: 'handL', parent: 'elbowL', pos: [0.2, 0.07, -0.96] },
  { name: 'shoulderR', parent: 'chest', pos: [-0.22, 0.6, -0.18] },
  { name: 'elbowR', parent: 'shoulderR', pos: [-0.26, 0.32, -0.5] },
  { name: 'handR', parent: 'elbowR', pos: [-0.2, 0.07, -0.96] },
  { name: 'hipL', parent: 'hips', pos: [0.11, 0.36, 0.16] },
  { name: 'hockL', parent: 'hipL', pos: [0.15, 0.22, 0.36] },
  { name: 'pawL', parent: 'hockL', pos: [0.11, 0.05, -0.02] },
  { name: 'hipR', parent: 'hips', pos: [-0.11, 0.36, 0.16] },
  { name: 'hockR', parent: 'hipR', pos: [-0.15, 0.22, 0.36] },
  { name: 'pawR', parent: 'hockR', pos: [-0.11, 0.05, -0.02] },
  { name: 'tail1', parent: 'hips', pos: [0, 0.34, 0.3] },
  { name: 'tail2', parent: 'tail1', pos: [0.02, 0.22, 0.52] },
  { name: 'tail3', parent: 'tail2', pos: [0.08, 0.16, 0.78] },
];

const UP = new THREE.Vector3(0, 1, 0);
const scratchA = new THREE.Vector3();
const scratchB = new THREE.Vector3();
const scratchC = new THREE.Vector3();
const scratchQ = new THREE.Quaternion();
const neckQuat = new THREE.Quaternion();
const scratchS = new THREE.Vector3();
const scratchM = new THREE.Matrix4();
const scratchN = new THREE.Matrix4();

type Segment = { bone: number; ax: number; ay: number; az: number; bx: number; by: number; bz: number };

function jointByName(name: string): Joint {
  const joint = JOINTS.find((item) => item.name === name);
  if (!joint) throw new Error(`missing joint ${name}`);
  return joint;
}

function buildSegments(): Segment[] {
  const segments: Segment[] = [];
  JOINTS.forEach((joint, index) => {
    const children = JOINTS.filter((item) => item.parent === joint.name);
    if (children.length === 0) {
      segments.push({
        bone: index,
        ax: joint.pos[0], ay: joint.pos[1], az: joint.pos[2],
        bx: joint.pos[0], by: joint.pos[1], bz: joint.pos[2],
      });
      return;
    }
    for (const child of children) {
      segments.push({
        bone: index,
        ax: joint.pos[0], ay: joint.pos[1], az: joint.pos[2],
        bx: child.pos[0], by: child.pos[1], bz: child.pos[2],
      });
    }
  });
  return segments;
}

function distanceToSegment(x: number, y: number, z: number, segment: Segment): number {
  const abx = segment.bx - segment.ax;
  const aby = segment.by - segment.ay;
  const abz = segment.bz - segment.az;
  const denom = abx * abx + aby * aby + abz * abz;
  const apx = x - segment.ax;
  const apy = y - segment.ay;
  const apz = z - segment.az;
  const t = denom < 1e-8 ? 0 : Math.min(1, Math.max(0, (apx * abx + apy * aby + apz * abz) / denom));
  return Math.hypot(apx - abx * t, apy - aby * t, apz - abz * t);
}

function skinWeights(x: number, y: number, z: number, segments: Segment[]): [number, number, number, number] {
  if (y < 0.76 && y > 0.64 && z < -0.88 && Math.abs(x) < 0.08) {
    const jaw = JOINTS.findIndex((joint) => joint.name === 'jaw');
    return [jaw, 0, 1, 0];
  }
  let best = 0;
  let second = 0;
  let bestD = Infinity;
  let secondD = Infinity;
  for (let i = 0; i < segments.length; i += 1) {
    const dist = distanceToSegment(x, y, z, segments[i]) + 0.0001;
    if (dist < bestD) {
      second = best;
      secondD = bestD;
      best = i;
      bestD = dist;
    } else if (dist < secondD) {
      second = i;
      secondD = dist;
    }
  }
  const w0 = 1 / (bestD * bestD);
  const w1 = 1 / (secondD * secondD);
  const sum = w0 + w1;
  return [segments[best].bone, segments[second].bone, w0 / sum, w1 / sum];
}

function colorFor(x: number, y: number, z: number, nx: number, ny: number, nz: number): [number, number, number] {
  const region = werewolfRegion(x, y, z);
  let r = 0.11;
  let g = 0.062;
  let b = 0.04;
  if (region === 'mane') { r = 0.03; g = 0.018; b = 0.014; }
  if (region === 'skin') { r = 0.1; g = 0.055; b = 0.035; }
  if (region === 'nose') { r = 0.02; g = 0.014; b = 0.012; }
  if (region === 'lip') { r = 0.2; g = 0.06; b = 0.05; }
  if (region === 'fur' && ny < -0.25 && y < 0.55) { r = 0.1; g = 0.055; b = 0.035; }
  const cavity = (nz < -0.65 && z < -0.35) ? 0.72 : 1;
  const ao = (0.58 + 0.42 * Math.min(1, Math.max(0, ny * 0.45 + 0.55))) * cavity;
  return [r * ao, g * ao, b * ao];
}

type Clump = { bone: number; x: number; y: number; z: number; nx: number; ny: number; nz: number; length: number; radius: number };

function collectClumps(positions: Float32Array, normals: Float32Array): { body: Clump[]; mane: Clump[] } {
  const body: Clump[] = [];
  const mane: Clump[] = [];
  const segments = buildSegments();
  const count = positions.length / 3;
  for (let i = 0; i < count; i += 8) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const nx = normals[i * 3];
    const ny = normals[i * 3 + 1];
    const nz = normals[i * 3 + 2];
    const region = werewolfRegion(x, y, z);
    if (region === 'nose' || region === 'lip' || region === 'skin') continue;
    if (region !== 'mane') continue;
    if (y > 0.84 || y < 0.48 || z < -0.42) continue;
    const [bone] = skinWeights(x, y, z, segments);
    const joint = JOINTS[bone];
    const clump: Clump = {
      bone,
      x: x - joint.pos[0],
      y: y - joint.pos[1],
      z: z - joint.pos[2],
      nx, ny, nz,
      length: 0.02,
      radius: 0.022,
    };
    if (region === 'mane') mane.push(clump);
    else body.push(clump);
  }
  return { body: [], mane: mane.slice(0, 90) };
}

function makeFur(clumps: Clump[], bones: any[]): any {
  const geometry = new THREE.CylinderGeometry(1, 0.62, 1, 5, 1);
  geometry.translate(0, 0.5, 0);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0,
    vertexColors: false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, clumps.length);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.userData.clumps = clumps;
  mesh.userData.bones = bones;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(clumps.length * 3), 3);
  for (let i = 0; i < clumps.length; i += 1) {
    const shade = 0.035 + (i % 4) * 0.008;
    mesh.instanceColor.setXYZ(i, shade, shade * 0.55, shade * 0.32);
  }
  return mesh;
}

function updateFur(mesh: any): void {
  const clumps = mesh.userData.clumps as Clump[];
  const bones = mesh.userData.bones as any[];
  const parent = mesh.parent;
  if (parent) scratchN.copy(parent.matrixWorld).invert();
  else scratchN.identity();
  for (let i = 0; i < clumps.length; i += 1) {
    const clump = clumps[i];
    const bone = bones[clump.bone];
    scratchA.set(clump.nx, clump.ny, clump.nz);
    if (scratchA.lengthSq() < 1e-6) scratchA.set(0, 1, 0);
    else scratchA.normalize();
    scratchQ.setFromUnitVectors(UP, scratchA);
    scratchS.set(clump.radius, clump.length, clump.radius);
    scratchB.set(clump.x, clump.y, clump.z);
    scratchM.compose(scratchB, scratchQ, scratchS);
    scratchM.premultiply(bone.matrixWorld);
    scratchM.premultiply(scratchN);
    mesh.setMatrixAt(i, scratchM);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function irisTexture(): any {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('iris canvas unavailable');
  ctx.clearRect(0, 0, 128, 128);
  const iris = ctx.createRadialGradient(64, 64, 6, 64, 64, 46);
  iris.addColorStop(0, '#140c06');
  iris.addColorStop(0.28, '#e0a040');
  iris.addColorStop(0.62, '#8d4e0c');
  iris.addColorStop(1, '#2a160c');
  ctx.fillStyle = iris;
  ctx.beginPath();
  ctx.arc(64, 64, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#120904';
  ctx.beginPath();
  ctx.arc(64, 64, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 236, 210, 0.8)';
  ctx.beginPath();
  ctx.arc(50, 48, 6, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addEye(parent: any, x: number): void {
  const sclera = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x6d5434, roughness: 0.55, metalness: 0 }),
  );
  sclera.position.set(x, 0.045, -0.18);
  sclera.castShadow = false;
  sclera.scale.set(1, 0.85, 0.7);
  const socket = new THREE.Mesh(
    new THREE.SphereGeometry(0.038, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x140d0a, roughness: 1, metalness: 0 }),
  );
  socket.position.set(x, 0.04, -0.15);
  socket.scale.z = 0.45;
  const iris = new THREE.Mesh(
    new THREE.CircleGeometry(0.018, 20),
    new THREE.MeshStandardMaterial({
      map: irisTexture(),
      roughness: 0.32,
      metalness: 0.04,
      envMapIntensity: 0.7,
    }),
  );
  iris.position.set(x, 0.048, -0.204);
  iris.rotation.y = Math.PI;
  parent.add(socket, sclera, iris);
}

function addEars(parent: any): void {
  const material = new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.92, metalness: 0 });
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.16, 4), material);
    ear.position.set(side * 0.07, 0.11, 0.03);
    ear.rotation.z = side * -0.4;
    ear.rotation.x = -0.25;
    ear.castShadow = false;
    parent.add(ear);
  }
}

function addClaws(parent: any, side: number, foot: boolean): void {
  const material = new THREE.MeshStandardMaterial({
    color: 0x8d846c,
    roughness: 0.38,
    metalness: 0.18,
    envMapIntensity: 1.1,
  });
  const count = foot ? 3 : 4;
  for (let i = 0; i < count; i += 1) {
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.012, foot ? 0.055 : 0.13, 5), material);
    const spread = (i - (count - 1) / 2) * 0.028;
    claw.position.set(spread, foot ? -0.02 : -0.03, foot ? -0.1 : -0.09);
    claw.rotation.x = foot ? Math.PI * 0.55 : Math.PI * 0.62;
    claw.rotation.z = side * 0.15;
    claw.castShadow = false;
    parent.add(claw);
  }
}

function addTeeth(parent: any, lower: boolean): void {
  const material = new THREE.MeshStandardMaterial({ color: 0xe6dcc8, roughness: 0.45, metalness: 0.02 });
  for (let i = 0; i < 6; i += 1) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.008, i === 0 || i === 5 ? 0.055 : 0.032, 4), material);
    tooth.position.set((i - 2.5) * 0.014, lower ? 0.02 : -0.02, lower ? -0.04 : -0.36);
    tooth.rotation.x = lower ? 0 : Math.PI;
    parent.add(tooth);
  }
}

export type Werewolf = {
  object: any;
  update: (time: number) => void;
};

export function createWerewolf(): Werewolf {
  const boundsMin: Vec3 = [-0.7, -0.02, -1.55];
  const boundsMax: Vec3 = [0.7, 1.05, 0.95];
  const net = surfaceNet([40, 44, 64], sdWerewolf, boundsMin, boundsMax);
  const segments = buildSegments();
  const vertexCount = net.positions.length / 3;
  const colors = new Float32Array(vertexCount * 3);
  const skinIndex = new Uint16Array(vertexCount * 4);
  const skinWeight = new Float32Array(vertexCount * 4);
  for (let i = 0; i < vertexCount; i += 1) {
    const x = net.positions[i * 3];
    const y = net.positions[i * 3 + 1];
    const z = net.positions[i * 3 + 2];
    const nx = net.normals[i * 3];
    const ny = net.normals[i * 3 + 1];
    const nz = net.normals[i * 3 + 2];
    const [b0, b1, w0, w1] = skinWeights(x, y, z, segments);
    skinIndex[i * 4] = b0;
    skinIndex[i * 4 + 1] = b1;
    skinWeight[i * 4] = w0;
    skinWeight[i * 4 + 1] = w1;
    const color = colorFor(x, y, z, nx, ny, nz);
    colors[i * 3] = color[0];
    colors[i * 3 + 1] = color[1];
    colors[i * 3 + 2] = color[2];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(net.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(net.normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  geometry.setIndex(new THREE.BufferAttribute(net.indices, 1));
  geometry.computeBoundingSphere();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
    envMapIntensity: 0.18,
  });
  const mesh = new THREE.SkinnedMesh(geometry, bodyMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  const boneObjects = new Map<string, any>();
  for (const joint of JOINTS) {
    const bone = new THREE.Bone();
    bone.name = joint.name;
    boneObjects.set(joint.name, bone);
  }
  for (const joint of JOINTS) {
    const bone = boneObjects.get(joint.name);
    if (!bone) continue;
    if (joint.parent) {
      const parent = boneObjects.get(joint.parent);
      const parentJoint = jointByName(joint.parent);
      bone.position.set(
        joint.pos[0] - parentJoint.pos[0],
        joint.pos[1] - parentJoint.pos[1],
        joint.pos[2] - parentJoint.pos[2],
      );
      parent?.add(bone);
    } else {
      bone.position.set(joint.pos[0], joint.pos[1], joint.pos[2]);
    }
  }
  const rootBone = boneObjects.get('hips');
  if (!rootBone) throw new Error('hips bone missing');
  const ordered = JOINTS.map((joint) => {
    const bone = boneObjects.get(joint.name);
    if (!bone) throw new Error(joint.name);
    return bone;
  });
  mesh.add(rootBone);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(ordered));

  const head = boneObjects.get('head');
  const jaw = boneObjects.get('jaw');
  const handL = boneObjects.get('handL');
  const handR = boneObjects.get('handR');
  const pawL = boneObjects.get('pawL');
  const pawR = boneObjects.get('pawR');
  if (!head || !jaw || !handL || !handR || !pawL || !pawR) throw new Error('face bones missing');
  addEye(head, -0.055);
  addEye(head, 0.055);
  addEars(head);
  addTeeth(head, false);
  addTeeth(jaw, true);
  addClaws(handL, 1, false);
  addClaws(handR, -1, false);
  addClaws(pawL, 1, true);
  addClaws(pawR, -1, true);

  const mouth = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a1010, roughness: 0.7, metalness: 0 }),
  );
  mouth.scale.set(1.1, 0.4, 1.6);
  mouth.position.set(0, 0.01, -0.02);
  jaw.add(mouth);

  const clumps = collectClumps(net.positions, net.normals);
  const maneFur = clumps.mane.length > 0 ? makeFur(clumps.mane, ordered) : null;

  const neck = boneObjects.get('neck');
  if (!neck) throw new Error('neck missing');
  const strands: Strand[] = [];
  for (let i = 0; i < 8; i += 1) {
    const anchor = new THREE.Vector3((i - 3.5) * 0.035, 0.02, 0.06);
    const direction = new THREE.Vector3((i - 3.5) * 0.02, -0.35, 0.75).normalize();
    strands.push(createStrand(anchor, direction, 5, 0.07));
  }
  const maneGeo = new THREE.CylinderGeometry(1, 0.7, 1, 5, 1);
  maneGeo.translate(0, 0.5, 0);
  const maneCloth = new THREE.InstancedMesh(
    maneGeo,
    new THREE.MeshStandardMaterial({ color: 0x1a100c, roughness: 0.94, metalness: 0 }),
    strands.length * 4,
  );
  maneCloth.castShadow = false;
  maneCloth.frustumCulled = false;

  const group = new THREE.Group();
  group.name = 'werewolf';
  group.add(mesh, maneCloth);
  if (maneFur) group.add(maneFur);
  // The muzzle of the field sits on -z. That is the character front.
  // Muzzle is local -z. A slight yaw shows snout length and both eyes.
  group.rotation.y = 0.18;

  const update = (time: number) => {
    const spine = boneObjects.get('spine');
    const tail1 = boneObjects.get('tail1');
    const tail2 = boneObjects.get('tail2');
    const tail3 = boneObjects.get('tail3');
    if (spine) spine.rotation.x = Math.sin(time * 1.7) * 0.035;
    jaw.rotation.x = -0.5 + Math.sin(time * 1.4) * 0.02;
    if (tail1 && tail2 && tail3) {
      tail1.rotation.y = Math.sin(time * 1.8) * 0.18;
      tail2.rotation.y = Math.sin(time * 1.8 + 0.6) * 0.22;
      tail3.rotation.y = Math.sin(time * 1.8 + 1.1) * 0.28;
    }
    group.updateMatrixWorld(true);
    if (maneFur) updateFur(maneFur);
    const neckWorld = scratchC;
    neck.getWorldPosition(neckWorld);
    neck.getWorldQuaternion(neckQuat);
    for (let s = 0; s < strands.length; s += 1) {
      scratchA.set((s - 3.5) * 0.04, -0.02, 0.08).applyQuaternion(neckQuat).add(neckWorld);
      stepStrand(strands[s], scratchA, 1 / 60);
      for (let link = 0; link < 4; link += 1) {
        scratchB.copy(strands[s].pos[link + 1]).sub(strands[s].pos[link]);
        const length = scratchB.length() || 0.07;
        scratchB.multiplyScalar(1 / length);
        scratchQ.setFromUnitVectors(UP, scratchB);
        scratchS.set(0.045, length, 0.045);
        scratchM.compose(strands[s].pos[link], scratchQ, scratchS);
        scratchN.copy(group.matrixWorld).invert();
        scratchM.premultiply(scratchN);
        maneCloth.setMatrixAt(s * 4 + link, scratchM);
      }
    }
    maneCloth.instanceMatrix.needsUpdate = true;
  };

  update(0);
  return { object: group, update };
}
