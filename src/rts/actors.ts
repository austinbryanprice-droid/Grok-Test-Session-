import * as THREE from 'three';
import { DataUtils } from 'three';
import { ENV } from './palette';
import { MeshData } from './mesh';

type V3 = [number, number, number];
type Pose = Record<string, { pos?: V3; rot?: V3 }>;

interface Bone {
  name: string;
  parent: string | null;
  restPos: V3;
  restRot?: V3;
}

interface Part {
  bone: string;
  size: V3;
  offset: V3;
  color: THREE.Color;
  mask: number;
  rough: number;
  metal: number;
  maxLod: number;
}

const SKIN = new THREE.Color(ENV.skin);
const CLOTH = new THREE.Color(ENV.cloth);
const CLOTH_B = new THREE.Color(ENV.clothB);
const STEEL = new THREE.Color(ENV.steel);
const WOOD = new THREE.Color(ENV.wood);
const LEATHER = new THREE.Color(ENV.leather);
const HAIR = new THREE.Color(ENV.hair);
const GOLD = new THREE.Color(ENV.gold);
const TEAM = new THREE.Color(0.78, 0.76, 0.7);
const WOOL = new THREE.Color(ENV.wool);

const CLIPS = [
  { start: 0, count: 24 },
  { start: 24, count: 12 },
  { start: 36, count: 14 },
];

export interface BakedActor {
  geometry: THREE.BufferGeometry;
  vatPos: THREE.DataTexture;
  vatNrm: THREE.DataTexture;
  vatSize: THREE.Vector2;
}

function humanBones(): Bone[] {
  return [
    { name: 'hips', parent: null, restPos: [0, 1.02, 0] },
    { name: 'torso', parent: 'hips', restPos: [0, 0.2, 0] },
    { name: 'head', parent: 'torso', restPos: [0, 0.52, 0] },
    { name: 'armL', parent: 'torso', restPos: [-0.32, 0.36, 0] },
    { name: 'foreL', parent: 'armL', restPos: [0, -0.3, 0] },
    { name: 'handL', parent: 'foreL', restPos: [0, -0.28, 0] },
    { name: 'armR', parent: 'torso', restPos: [0.32, 0.36, 0] },
    { name: 'foreR', parent: 'armR', restPos: [0, -0.3, 0] },
    { name: 'handR', parent: 'foreR', restPos: [0, -0.28, 0] },
    { name: 'thighL', parent: 'hips', restPos: [-0.11, -0.04, 0] },
    { name: 'shinL', parent: 'thighL', restPos: [0, -0.46, 0] },
    { name: 'footL', parent: 'shinL', restPos: [0, -0.42, 0] },
    { name: 'thighR', parent: 'hips', restPos: [0.11, -0.04, 0] },
    { name: 'shinR', parent: 'thighR', restPos: [0, -0.46, 0] },
    { name: 'footR', parent: 'shinR', restPos: [0, -0.42, 0] },
  ];
}

function humanParts(id: string): Part[] {
  const narrow = id === 'villager1' ? 0.86 : 1;
  const parts: Part[] = [
    { bone: 'hips', size: [0.36 * narrow, 0.24, 0.22], offset: [0, 0.02, 0], color: CLOTH, mask: 0, rough: 0.88, metal: 0, maxLod: 2 },
    { bone: 'torso', size: [0.46 * narrow, 0.52, 0.24], offset: [0, 0.26, 0], color: CLOTH, mask: 0, rough: 0.86, metal: 0, maxLod: 2 },
    { bone: 'torso', size: [0.34 * narrow, 0.36, 0.12], offset: [0, 0.28, 0.1], color: TEAM, mask: 1, rough: 0.82, metal: 0, maxLod: 2 },
    { bone: 'head', size: [0.32, 0.4, 0.3], offset: [0, 0.22, 0], color: SKIN, mask: 0, rough: 0.72, metal: 0, maxLod: 2 },
    { bone: 'armL', size: [0.13, 0.32, 0.13], offset: [0, -0.16, 0], color: CLOTH_B, mask: 0, rough: 0.88, metal: 0, maxLod: 1 },
    { bone: 'foreL', size: [0.11, 0.28, 0.11], offset: [0, -0.14, 0], color: SKIN, mask: 0, rough: 0.74, metal: 0, maxLod: 1 },
    { bone: 'handL', size: [0.12, 0.1, 0.08], offset: [0, -0.06, 0], color: SKIN, mask: 0, rough: 0.7, metal: 0, maxLod: 0 },
    { bone: 'armR', size: [0.13, 0.32, 0.13], offset: [0, -0.16, 0], color: CLOTH_B, mask: 0, rough: 0.88, metal: 0, maxLod: 1 },
    { bone: 'foreR', size: [0.11, 0.28, 0.11], offset: [0, -0.14, 0], color: SKIN, mask: 0, rough: 0.74, metal: 0, maxLod: 1 },
    { bone: 'handR', size: [0.12, 0.1, 0.08], offset: [0, -0.06, 0], color: SKIN, mask: 0, rough: 0.7, metal: 0, maxLod: 0 },
    { bone: 'thighL', size: [0.15, 0.46, 0.15], offset: [0, -0.23, 0], color: CLOTH, mask: 0, rough: 0.9, metal: 0, maxLod: 2 },
    { bone: 'shinL', size: [0.12, 0.42, 0.12], offset: [0, -0.21, 0], color: CLOTH_B, mask: 0, rough: 0.9, metal: 0, maxLod: 1 },
    { bone: 'footL', size: [0.12, 0.08, 0.24], offset: [0, -0.02, 0.06], color: LEATHER, mask: 0, rough: 0.8, metal: 0, maxLod: 0 },
    { bone: 'thighR', size: [0.15, 0.46, 0.15], offset: [0, -0.23, 0], color: CLOTH, mask: 0, rough: 0.9, metal: 0, maxLod: 2 },
    { bone: 'shinR', size: [0.12, 0.42, 0.12], offset: [0, -0.21, 0], color: CLOTH_B, mask: 0, rough: 0.9, metal: 0, maxLod: 1 },
    { bone: 'footR', size: [0.12, 0.08, 0.24], offset: [0, -0.02, 0.06], color: LEATHER, mask: 0, rough: 0.8, metal: 0, maxLod: 0 },
  ];
  if (id === 'villager1') {
    parts.push({ bone: 'head', size: [0.34, 0.28, 0.32], offset: [0, 0.18, -0.02], color: HAIR, mask: 0, rough: 0.8, metal: 0, maxLod: 1 });
  }
  if (id === 'villager2') {
    parts.push({ bone: 'head', size: [0.5, 0.08, 0.5], offset: [0, 0.42, 0], color: LEATHER, mask: 0, rough: 0.84, metal: 0, maxLod: 1 });
  }
  if (id.startsWith('villager')) {
    const tool = id === 'villager3' ? 'pick' : id === 'villager2' ? 'hoe' : id === 'villager1' ? 'basket' : 'axe';
    if (tool === 'basket') {
      parts.push({ bone: 'torso', size: [0.28, 0.22, 0.22], offset: [0, 0.1, -0.2], color: WOOD, mask: 0, rough: 0.9, metal: 0, maxLod: 1 });
    } else if (tool === 'axe') {
      parts.push({ bone: 'handR', size: [0.08, 1.35, 0.08], offset: [0.08, 0.55, 0], color: WOOD, mask: 0, rough: 0.84, metal: 0, maxLod: 2 });
      parts.push({ bone: 'handR', size: [0.28, 0.22, 0.08], offset: [0.2, 1.15, 0], color: STEEL, mask: 0, rough: 0.4, metal: 0.9, maxLod: 2 });
    } else if (tool === 'hoe') {
      parts.push({ bone: 'handR', size: [0.07, 1.5, 0.07], offset: [0.06, 0.6, 0], color: WOOD, mask: 0, rough: 0.86, metal: 0, maxLod: 2 });
      parts.push({ bone: 'handR', size: [0.08, 0.08, 0.36], offset: [0.06, 1.3, 0.1], color: STEEL, mask: 0, rough: 0.42, metal: 0.9, maxLod: 2 });
    } else {
      parts.push({ bone: 'handR', size: [0.08, 1.2, 0.08], offset: [0.08, 0.45, 0], color: WOOD, mask: 0, rough: 0.84, metal: 0, maxLod: 2 });
      parts.push({ bone: 'handR', size: [0.26, 0.16, 0.08], offset: [0.2, 1.0, 0], color: STEEL, mask: 0, rough: 0.4, metal: 0.9, maxLod: 2 });
    }
  }
  if (id === 'spear') {
    parts.push({ bone: 'handL', size: [0.08, 0.9, 0.62], offset: [-0.16, 0.15, 0.08], color: TEAM, mask: 1, rough: 0.72, metal: 0, maxLod: 1 });
    parts.push({ bone: 'handL', size: [0.1, 0.9, 0.1], offset: [-0.16, 0.15, 0], color: WOOD, mask: 0, rough: 0.8, metal: 0, maxLod: 1 });
    parts.push({ bone: 'handR', size: [0.07, 3.15, 0.07], offset: [0.05, 1.45, 0.04], color: WOOD, mask: 0, rough: 0.84, metal: 0, maxLod: 2 });
    parts.push({ bone: 'handR', size: [0.1, 0.42, 0.1], offset: [0.05, 3.05, 0.04], color: STEEL, mask: 0, rough: 0.38, metal: 0.9, maxLod: 2 });
    parts.push({ bone: 'head', size: [0.36, 0.16, 0.36], offset: [0, 0.36, 0], color: STEEL, mask: 0, rough: 0.4, metal: 0.85, maxLod: 1 });
  }
  if (id === 'archer') {
    parts.push({ bone: 'handL', size: [0.08, 2.05, 0.08], offset: [-0.12, 0.7, 0.05], color: WOOD, mask: 0, rough: 0.82, metal: 0, maxLod: 2 });
    parts.push({ bone: 'handL', size: [0.04, 1.7, 0.04], offset: [-0.02, 0.7, 0.1], color: LEATHER, mask: 0, rough: 0.7, metal: 0, maxLod: 0 });
    parts.push({ bone: 'torso', size: [0.16, 0.42, 0.16], offset: [0.12, 0.2, -0.16], color: LEATHER, mask: 0, rough: 0.8, metal: 0, maxLod: 1 });
    parts.push({ bone: 'torso', size: [0.28, 0.46, 0.08], offset: [0, 0.16, -0.16], color: TEAM, mask: 1, rough: 0.78, metal: 0, maxLod: 2 });
  }
  if (id === 'knight') return knightParts();
  return parts;
}

function knightBones(): Bone[] {
  return [
    { name: 'body', parent: null, restPos: [0, 1.28, 0] },
    { name: 'neck', parent: 'body', restPos: [0, 0.22, 0.62] },
    { name: 'hhead', parent: 'neck', restPos: [0, 0.18, 0.28] },
    { name: 'legFL', parent: 'body', restPos: [-0.22, -0.1, 0.48] },
    { name: 'legFR', parent: 'body', restPos: [0.22, -0.1, 0.48] },
    { name: 'legBL', parent: 'body', restPos: [-0.22, -0.1, -0.5] },
    { name: 'legBR', parent: 'body', restPos: [0.22, -0.1, -0.5] },
    { name: 'hips', parent: 'body', restPos: [0, 0.42, -0.05] },
    { name: 'torso', parent: 'hips', restPos: [0, 0.16, 0] },
    { name: 'head', parent: 'torso', restPos: [0, 0.48, 0] },
    { name: 'armL', parent: 'torso', restPos: [-0.3, 0.3, 0] },
    { name: 'foreL', parent: 'armL', restPos: [0, -0.26, 0] },
    { name: 'handL', parent: 'foreL', restPos: [0, -0.24, 0] },
    { name: 'armR', parent: 'torso', restPos: [0.3, 0.3, 0] },
    { name: 'foreR', parent: 'armR', restPos: [0, -0.26, 0] },
    { name: 'handR', parent: 'foreR', restPos: [0, -0.24, 0] },
  ];
}

function knightParts(): Part[] {
  const horse = new THREE.Color(0x6b4632);
  const horseDark = new THREE.Color(0x4e3426);
  return [
    { bone: 'body', size: [0.55, 0.5, 1.55], offset: [0, 0, 0], color: horse, mask: 0, rough: 0.82, metal: 0, maxLod: 2 },
    { bone: 'body', size: [0.62, 0.28, 1.15], offset: [0, 0.16, -0.05], color: TEAM, mask: 1, rough: 0.75, metal: 0, maxLod: 2 },
    { bone: 'neck', size: [0.22, 0.36, 0.28], offset: [0, 0.1, 0.08], color: horse, mask: 0, rough: 0.82, metal: 0, maxLod: 1 },
    { bone: 'hhead', size: [0.22, 0.28, 0.48], offset: [0, 0.02, 0.12], color: horseDark, mask: 0, rough: 0.8, metal: 0, maxLod: 1 },
    { bone: 'legFL', size: [0.14, 1.05, 0.14], offset: [0, -0.55, 0], color: horseDark, mask: 0, rough: 0.84, metal: 0, maxLod: 1 },
    { bone: 'legFR', size: [0.14, 1.05, 0.14], offset: [0, -0.55, 0], color: horseDark, mask: 0, rough: 0.84, metal: 0, maxLod: 1 },
    { bone: 'legBL', size: [0.15, 1.08, 0.15], offset: [0, -0.56, 0], color: horseDark, mask: 0, rough: 0.84, metal: 0, maxLod: 1 },
    { bone: 'legBR', size: [0.15, 1.08, 0.15], offset: [0, -0.56, 0], color: horseDark, mask: 0, rough: 0.84, metal: 0, maxLod: 1 },
    { bone: 'hips', size: [0.34, 0.2, 0.22], offset: [0, 0, 0], color: STEEL, mask: 0, rough: 0.42, metal: 0.85, maxLod: 2 },
    { bone: 'torso', size: [0.46, 0.48, 0.26], offset: [0, 0.24, 0], color: STEEL, mask: 0, rough: 0.4, metal: 0.9, maxLod: 2 },
    { bone: 'torso', size: [0.34, 0.32, 0.1], offset: [0, 0.22, 0.12], color: TEAM, mask: 1, rough: 0.7, metal: 0, maxLod: 2 },
    { bone: 'head', size: [0.3, 0.34, 0.3], offset: [0, 0.18, 0], color: STEEL, mask: 0, rough: 0.36, metal: 0.9, maxLod: 2 },
    { bone: 'head', size: [0.1, 0.42, 0.16], offset: [0, 0.48, 0], color: TEAM, mask: 1, rough: 0.7, metal: 0, maxLod: 1 },
    { bone: 'armL', size: [0.14, 0.28, 0.14], offset: [0, -0.14, 0], color: STEEL, mask: 0, rough: 0.4, metal: 0.85, maxLod: 1 },
    { bone: 'handL', size: [0.1, 0.85, 0.55], offset: [-0.12, 0.05, 0.08], color: TEAM, mask: 1, rough: 0.68, metal: 0, maxLod: 1 },
    { bone: 'armR', size: [0.14, 0.28, 0.14], offset: [0, -0.14, 0], color: STEEL, mask: 0, rough: 0.4, metal: 0.85, maxLod: 1 },
    { bone: 'handR', size: [0.08, 3.4, 0.08], offset: [0.1, 1.3, 0.25], color: WOOD, mask: 0, rough: 0.8, metal: 0, maxLod: 2 },
    { bone: 'handR', size: [0.12, 0.36, 0.12], offset: [0.1, 2.95, 0.25], color: STEEL, mask: 0, rough: 0.36, metal: 0.9, maxLod: 2 },
    { bone: 'body', size: [0.08, 0.08, 0.08], offset: [0, 0.2, -0.85], color: GOLD, mask: 0, rough: 0.3, metal: 1, maxLod: 0 },
  ];
}

function sheepBones(): Bone[] {
  return [
    { name: 'body', parent: null, restPos: [0, 0.72, 0] },
    { name: 'head', parent: 'body', restPos: [0, 0.12, 0.48] },
    { name: 'legFL', parent: 'body', restPos: [-0.16, -0.05, 0.28] },
    { name: 'legFR', parent: 'body', restPos: [0.16, -0.05, 0.28] },
    { name: 'legBL', parent: 'body', restPos: [-0.16, -0.05, -0.28] },
    { name: 'legBR', parent: 'body', restPos: [0.16, -0.05, -0.28] },
  ];
}

function sheepParts(): Part[] {
  const face = new THREE.Color(0x3e3a36);
  return [
    { bone: 'body', size: [0.55, 0.42, 0.85], offset: [0, 0.05, 0], color: WOOL, mask: 0, rough: 0.95, metal: 0, maxLod: 2 },
    { bone: 'head', size: [0.22, 0.22, 0.32], offset: [0, 0.02, 0.08], color: face, mask: 0, rough: 0.8, metal: 0, maxLod: 2 },
    { bone: 'legFL', size: [0.1, 0.48, 0.1], offset: [0, -0.28, 0], color: face, mask: 0, rough: 0.86, metal: 0, maxLod: 1 },
    { bone: 'legFR', size: [0.1, 0.48, 0.1], offset: [0, -0.28, 0], color: face, mask: 0, rough: 0.86, metal: 0, maxLod: 1 },
    { bone: 'legBL', size: [0.1, 0.48, 0.1], offset: [0, -0.28, 0], color: face, mask: 0, rough: 0.86, metal: 0, maxLod: 1 },
    { bone: 'legBR', size: [0.1, 0.48, 0.1], offset: [0, -0.28, 0], color: face, mask: 0, rough: 0.86, metal: 0, maxLod: 1 },
  ];
}

function poseHuman(id: string, clip: number, t: number): Pose {
  const pose: Pose = {};
  const wave = Math.sin(t * Math.PI * 2);
  if (clip === 0) {
    pose.torso = { rot: [0.04 * wave, 0, 0] };
    pose.armL = { rot: [0.12, 0, 0.15] };
    pose.armR = { rot: [0.18, 0, -0.12] };
    pose.hips = { pos: [0, Math.abs(wave) * 0.015, 0] };
  } else if (clip === 1) {
    pose.thighL = { rot: [-0.75 * wave, 0, 0] };
    pose.thighR = { rot: [0.75 * wave, 0, 0] };
    pose.shinL = { rot: [Math.max(0, -wave) * 1.05, 0, 0] };
    pose.shinR = { rot: [Math.max(0, wave) * 1.05, 0, 0] };
    pose.armL = { rot: [0.65 * wave, 0, 0.08] };
    pose.armR = { rot: [-0.65 * wave, 0, -0.08] };
    pose.hips = { pos: [0, Math.abs(wave) * 0.045, 0] };
  } else {
    const swing = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
    const attack = id === 'archer' ? -0.2 - swing * 0.9 : -0.3 - swing * 1.5;
    pose.armR = { rot: [attack, 0, -0.15] };
    pose.foreR = { rot: [-0.4 * swing, 0, 0] };
    pose.torso = { rot: [0.15 * swing, 0.25 * swing, 0] };
    if (id === 'archer') pose.armL = { rot: [-0.4, 0, 0.3] };
  }
  return pose;
}

function poseKnight(clip: number, t: number): Pose {
  const pose: Pose = {};
  const wave = Math.sin(t * Math.PI * 2);
  if (clip === 1) {
    pose.legFL = { rot: [0.45 * wave, 0, 0] };
    pose.legBR = { rot: [0.45 * wave, 0, 0] };
    pose.legFR = { rot: [-0.45 * wave, 0, 0] };
    pose.legBL = { rot: [-0.45 * wave, 0, 0] };
    pose.body = { pos: [0, Math.abs(wave) * 0.04, 0] };
  } else if (clip === 2) {
    const swing = t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65;
    pose.armR = { rot: [-0.8 - swing, 0, 0] };
    pose.torso = { rot: [0.2 * swing, 0, 0] };
  } else {
    pose.body = { rot: [0.03 * wave, 0, 0] };
  }
  return pose;
}

function poseSheep(clip: number, t: number): Pose {
  const pose: Pose = {};
  const wave = Math.sin(t * Math.PI * 2);
  if (clip === 1) {
    pose.legFL = { rot: [0.4 * wave, 0, 0] };
    pose.legBR = { rot: [0.4 * wave, 0, 0] };
    pose.legFR = { rot: [-0.4 * wave, 0, 0] };
    pose.legBL = { rot: [-0.4 * wave, 0, 0] };
    pose.body = { pos: [0, Math.abs(wave) * 0.03, 0] };
  } else {
    pose.body = { rot: [0.02 * wave, 0, 0] };
  }
  return pose;
}

function worlds(bones: Bone[], pose: Pose): Map<string, THREE.Matrix4> {
  const byName = new Map(bones.map((bone) => [bone.name, bone]));
  const cache = new Map<string, THREE.Matrix4>();
  const walk = (name: string): THREE.Matrix4 => {
    const cached = cache.get(name);
    if (cached) return cached;
    const bone = byName.get(name);
    if (!bone) throw new Error(`Missing bone ${name}`);
    const delta = pose[name] ?? {};
    const position = new THREE.Vector3(
      bone.restPos[0] + (delta.pos?.[0] ?? 0),
      bone.restPos[1] + (delta.pos?.[1] ?? 0),
      bone.restPos[2] + (delta.pos?.[2] ?? 0),
    );
    const rotation = new THREE.Euler(
      (bone.restRot?.[0] ?? 0) + (delta.rot?.[0] ?? 0),
      (bone.restRot?.[1] ?? 0) + (delta.rot?.[1] ?? 0),
      (bone.restRot?.[2] ?? 0) + (delta.rot?.[2] ?? 0),
    );
    const local = new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(1, 1, 1));
    const world = bone.parent ? new THREE.Matrix4().multiplyMatrices(walk(bone.parent), local) : local;
    cache.set(name, world);
    return world;
  };
  for (const bone of bones) walk(bone.name);
  return cache;
}

function emit(parts: Part[], matrices: Map<string, THREE.Matrix4>, lod: number): MeshData {
  const data = new MeshData();
  for (const part of parts) {
    if (part.maxLod < lod) continue;
    const bone = matrices.get(part.bone);
    if (!bone) continue;
    const local = new THREE.Matrix4().makeTranslation(part.offset[0], part.offset[1], part.offset[2]);
    data.addBox(new THREE.Matrix4().multiplyMatrices(bone, local), part.size, part.color, part.mask, part.rough, part.metal, 0);
  }
  return data;
}

function spec(id: string): { bones: Bone[]; parts: Part[]; pose: (clip: number, t: number) => Pose; scaleTo?: number } {
  if (id === 'knight') return { bones: knightBones(), parts: knightParts(), pose: (clip, t) => poseKnight(clip, t) };
  if (id === 'sheep') return { bones: sheepBones(), parts: sheepParts(), pose: (clip, t) => poseSheep(clip, t), scaleTo: 1.15 };
  return { bones: humanBones(), parts: humanParts(id), pose: (clip, t) => poseHuman(id, clip, t) };
}

function halfTexture(values: Float32Array, width: number, height: number): THREE.DataTexture {
  const packed = new Uint16Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    packed[i * 4] = DataUtils.toHalfFloat(values[i * 3]);
    packed[i * 4 + 1] = DataUtils.toHalfFloat(values[i * 3 + 1]);
    packed[i * 4 + 2] = DataUtils.toHalfFloat(values[i * 3 + 2]);
    packed[i * 4 + 3] = DataUtils.toHalfFloat(1);
  }
  const texture = new THREE.DataTexture(packed, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function bakeActor(id: string, lod: number): BakedActor {
  const actor = spec(id);
  const frames = CLIPS.reduce((sum, clip) => sum + clip.count, 0);
  let sample: MeshData | null = null;
  const positions: number[] = [];
  const normals: number[] = [];
  for (let clipIndex = 0; clipIndex < CLIPS.length; clipIndex++) {
    const clip = CLIPS[clipIndex];
    for (let frame = 0; frame < clip.count; frame++) {
      const t = frame / clip.count;
      const data = emit(actor.parts, worlds(actor.bones, actor.pose(clipIndex, t)), lod);
      if (!sample) sample = data;
      if (data.count !== sample.count) throw new Error(`VAT mismatch for ${id}`);
      positions.push(...data.pos);
      normals.push(...data.nrm);
    }
  }
  if (!sample || sample.count === 0) throw new Error(`Empty actor ${id}`);
  let scale = 1;
  if (actor.scaleTo) {
    let maxY = 0;
    for (let i = 1; i < sample.pos.length; i += 3) maxY = Math.max(maxY, sample.pos[i]);
    if (maxY > 0.01) scale = actor.scaleTo / maxY;
  }
  if (scale !== 1) {
    for (let i = 0; i < positions.length; i++) positions[i] *= scale;
    for (let i = 0; i < sample.pos.length; i++) sample.pos[i] *= scale;
  }
  const geometry = sample.toGeometry();
  const vatSize = new THREE.Vector2(sample.count, frames);
  return {
    geometry,
    vatPos: halfTexture(new Float32Array(positions), sample.count, frames),
    vatNrm: halfTexture(new Float32Array(normals), sample.count, frames),
    vatSize,
  };
}

export const ACTOR_IDS = ['villager0', 'villager1', 'villager2', 'villager3', 'spear', 'archer', 'knight', 'sheep'] as const;
export type ActorId = (typeof ACTOR_IDS)[number];

export const CLIP = {
  idle: { start: 0, count: 24, fps: 12 },
  walk: { start: 24, count: 12, fps: 12 },
  work: { start: 36, count: 14, fps: 12 },
} as const;
