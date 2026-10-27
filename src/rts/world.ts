import * as THREE from 'three';
import type { CSM } from 'three/addons/csm/CSM.js';
import { ACTOR_IDS, CLIP, bakeActor, type ActorId, type BakedActor } from './actors';
import { frame } from './frame';
import { GAME, TEAM } from './palette';
import { createScenery, terrainHeight, updateTreeLod, type Scenery } from './scenery';
import { bindLit } from './shader';
import { createRingTexture, createSoftDisc } from './textures';
import type { QualityName } from './quality';

interface Unit {
  id: ActorId;
  team: 'blue' | 'red';
  x: number;
  z: number;
  yaw: number;
  clip: keyof typeof CLIP;
  phase: number;
  selected: boolean;
  health?: number;
  path?: { ax: number; az: number; bx: number; bz: number; speed: number; t: number };
}

interface LodMesh {
  mesh: THREE.InstancedMesh;
  silhouette: THREE.InstancedMesh;
}

export interface WorldView {
  scenery: Scenery;
  update: (camera: THREE.Camera, dt: number) => void;
  minimap: { x: number; z: number; team: 'blue' | 'red'; kind: 'unit' | 'building' }[];
}

export function createWorld(scene: THREE.Scene, csm: CSM | null, quality: QualityName, unitBudget: number, onProgress: (value: number) => void): WorldView {
  onProgress(0.15);
  const scenery = createScenery(scene, csm, quality === 'low' ? 0.5 : 1);
  onProgress(0.34);
  const units = placeUnits(unitBudget);
  const library = new Map<ActorId, BakedActor[]>();
  ACTOR_IDS.forEach((id, index) => {
    library.set(id, [0, 1, 2].map((lod) => bakeActor(id, lod)));
    onProgress(0.34 + ((index + 1) / ACTOR_IDS.length) * 0.4);
  });
  const lods = new Map<ActorId, LodMesh[]>();
  for (const id of ACTOR_IDS) {
    const count = Math.max(1, units.filter((unit) => unit.id === id).length);
    const baked = library.get(id);
    if (!baked) continue;
    lods.set(id, baked.map((actor) => makeLod(scene, actor, count, quality, csm)));
  }
  const blobs = makeDecals(scene, units.length + 12, 'rgba(40,50,70,0.38)', 'rgba(40,50,70,0)', 0.35);
  const ownRings = makeRings(scene, 16, GAME.selectOwn);
  const enemyRings = makeRings(scene, 16, GAME.selectEnemy);
  const health = makeHealth(scene);
  const arrows = makeArrows(scene);
  const smoke = makeSmoke(scene);
  const dummy = new THREE.Object3D();
  const blue = new THREE.Color(TEAM.blue);
  const red = new THREE.Color(TEAM.red);
  const buildings = [
    [-14, 6, 'blue'],
    [-20, -8, 'blue'],
    [-2, -16, 'blue'],
    [16, 2, 'blue'],
    [18, -14, 'red'],
    [28, 8, 'red'],
    [5, -12, 'red'],
  ] as const;
  const markers: WorldView['minimap'] = [];

  const update = (camera: THREE.Camera, dt: number) => {
    for (const unit of units) {
      if (!unit.path) continue;
      unit.path.t = (unit.path.t + dt * unit.path.speed) % 1;
      const t = unit.path.t < 0.5 ? unit.path.t * 2 : (1 - unit.path.t) * 2;
      unit.x = unit.path.ax + (unit.path.bx - unit.path.ax) * t;
      unit.z = unit.path.az + (unit.path.bz - unit.path.az) * t;
      unit.yaw = Math.atan2(unit.path.bx - unit.path.ax, unit.path.bz - unit.path.az);
    }
    for (const meshes of lods.values()) {
      for (const entry of meshes) {
        entry.mesh.count = 0;
        entry.silhouette.count = 0;
      }
    }
    const cursor = new THREE.Vector3();
    blobs.count = 0;
    ownRings.count = 0;
    enemyRings.count = 0;
    for (const unit of units) {
      const y = terrainHeight(unit.x, unit.z);
      dummy.position.set(unit.x, y, unit.z);
      dummy.rotation.set(0, unit.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      const distance = camera.position.distanceTo(dummy.position);
      const lod = distance < 55 ? 0 : distance < 78 ? 1 : 2;
      const entry = lods.get(unit.id)?.[lod];
      if (!entry) continue;
      const index = entry.mesh.count++;
      entry.silhouette.count++;
      entry.mesh.setMatrixAt(index, dummy.matrix);
      entry.silhouette.setMatrixAt(index, dummy.matrix);
      const clip = CLIP[unit.clip];
      const anim = entry.mesh.geometry.getAttribute('aAnim') as THREE.InstancedBufferAttribute;
      const teamAttr = entry.mesh.geometry.getAttribute('aTeamColor') as THREE.InstancedBufferAttribute;
      anim.setXYZW(index, clip.start, clip.count, clip.fps, unit.phase);
      const color = unit.team === 'blue' ? blue : red;
      teamAttr.setXYZ(index, color.r, color.g, color.b);
      stampDecal(blobs, blobs.count++, unit.x, y + 0.05, unit.z, unit.id === 'knight' ? 2.4 : unit.id === 'sheep' ? 1.3 : 1.15);
      if (unit.selected) {
        const rings = unit.team === 'blue' ? ownRings : enemyRings;
        stampDecal(rings, rings.count++, unit.x, y + 0.07, unit.z, 1.7);
      }
      if (unit.health !== undefined) {
        health.position.set(unit.x, y + 2.45, unit.z);
        health.lookAt(camera.position.x, health.position.y, camera.position.z);
        const fill = health.children[1] as THREE.Mesh;
        fill.scale.x = unit.health;
        fill.position.x = (unit.health - 1) * 0.32;
      }
      void cursor;
    }
    for (const [id, meshes] of lods) {
      void id;
      for (const entry of meshes) {
        entry.mesh.instanceMatrix.needsUpdate = true;
        entry.silhouette.instanceMatrix.needsUpdate = true;
        const anim = entry.mesh.geometry.getAttribute('aAnim') as THREE.InstancedBufferAttribute;
        const teamAttr = entry.mesh.geometry.getAttribute('aTeamColor') as THREE.InstancedBufferAttribute;
        anim.needsUpdate = true;
        teamAttr.needsUpdate = true;
        entry.mesh.visible = entry.mesh.count > 0;
        entry.silhouette.visible = entry.silhouette.count > 0;
        enclose(entry.mesh);
      }
    }
    for (const [x, z] of buildings) stampDecal(blobs, blobs.count++, x, terrainHeight(x, z) + 0.05, z, 5.2);
    finishDecal(blobs);
    finishDecal(ownRings);
    finishDecal(enemyRings);
    for (let i = 0; i < arrows.length; i++) {
      const t = (frame.uTime.value * 0.35 + i * 0.17) % 1;
      const fromX = -4 + (i % 3) * 1.2;
      const fromZ = 1 + Math.floor(i / 3) * 1.1;
      const x = fromX + (10 - fromX) * t;
      const z = fromZ + (-1 - fromZ) * t;
      const y = terrainHeight(x, z) + 1.6 + Math.sin(t * Math.PI) * 2.2;
      arrows[i].position.set(x, y, z);
      arrows[i].lookAt(x + 1, y + Math.cos(t * Math.PI) * 0.4, z - 0.2);
    }
    smoke.forEach((puff, index) => {
      const age = (frame.uTime.value * 0.25 + index * 0.37) % 1;
      puff.position.y = terrainHeight(-14, 6) + 4.2 + age * 2.4;
      puff.position.x = -14 + Math.sin(age * 6 + index) * 0.4;
      puff.material.opacity = (1 - age) * 0.35;
    });
    updateTreeLod(scene, camera);
    markers.length = 0;
    for (const unit of units) {
      if (unit.id === 'sheep') continue;
      markers.push({ x: unit.x, z: unit.z, team: unit.team, kind: 'unit' });
    }
    for (const [x, z, team] of buildings) markers.push({ x, z, team, kind: 'building' });
  };

  return {
    scenery,
    update,
    minimap: markers,
  };
}

function placeUnits(budget: number): Unit[] {
  const units: Unit[] = [];
  const add = (id: ActorId, team: 'blue' | 'red', x: number, z: number, yaw: number, clip: Unit['clip'], extra: Partial<Unit> = {}) => {
    units.push({ id, team, x, z, yaw, clip, phase: Math.random() * 10, selected: false, ...extra });
  };
  const variants: ActorId[] = ['villager0', 'villager1', 'villager2', 'villager3'];
  variants.forEach((id, index) => {
    add(id, 'blue', -16 + index * 1.4, 7.5, 0.4, index % 2 ? 'work' : 'idle');
    add(id, 'red', 20 + (index % 2), 6 + index * 0.8, 2.4, 'work');
  });
  add('villager0', 'blue', -28, 12, 0.2, 'work');
  add('villager1', 'blue', -26, 13, -0.4, 'idle');
  for (let i = 0; i < 8; i++) {
    add('spear', 'blue', -10 + (i % 4) * 1.3, 2 - Math.floor(i / 4) * 1.4, -Math.PI / 2, i < 4 ? 'walk' : 'idle', {
      selected: i < 3,
      path: i < 4 ? { ax: -12, az: 2 - Math.floor(i / 4) * 1.4, bx: -4, bz: 2 - Math.floor(i / 4) * 1.4, speed: 0.12, t: i * 0.1 } : undefined,
    });
    add('spear', 'red', 9 + (i % 4) * 1.3, -1 + Math.floor(i / 4) * 1.4, Math.PI / 2, 'idle', {
      health: i === 0 ? 0.55 : undefined,
    });
  }
  for (let i = 0; i < 6; i++) {
    add('archer', 'blue', -9 + (i % 3) * 1.5, 5.2, -Math.PI / 2, 'idle');
    add('archer', 'red', 8 + (i % 3) * 1.5, 3.4, Math.PI / 2, i < 2 ? 'work' : 'idle', { selected: i < 2 });
  }
  for (let i = 0; i < 3; i++) {
    add('knight', 'blue', -13, -1 + i * 2.2, -Math.PI / 2, i === 0 ? 'walk' : 'idle', {
      path: i === 0 ? { ax: -16, az: -1, bx: -8, bz: -1, speed: 0.08, t: 0.2 } : undefined,
    });
    add('knight', 'red', 14, -3 + i * 2.2, Math.PI / 2, 'idle');
  }
  for (let i = 0; i < 6; i++) add('sheep', 'blue', -24 + (i % 3) * 1.6, 15 + Math.floor(i / 3) * 1.5, i, i % 2 ? 'walk' : 'idle');
  const extra = Math.max(0, budget - units.length);
  for (let i = 0; i < extra; i++) {
    const id: ActorId = i % 2 ? 'archer' : 'spear';
    const column = i % 14;
    const row = Math.floor(i / 14);
    add(id, i % 3 === 0 ? 'red' : 'blue', -18 + column * 1.5, 22 + row * 1.6, -Math.PI / 2, 'idle');
  }
  return units;
}

function makeLod(scene: THREE.Scene, actor: BakedActor, count: number, quality: QualityName, csm: CSM | null): LodMesh {
  if (!actor.geometry.getAttribute('aAnim')) {
    actor.geometry.setAttribute('aAnim', new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4));
    actor.geometry.setAttribute('aTeamColor', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3));
  }
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, vertexColors: true });
  bindLit(material, { kind: 'vat', csm, vatPos: actor.vatPos, vatNrm: actor.vatNrm, vatSize: actor.vatSize });
  const mesh = new THREE.InstancedMesh(actor.geometry, material, count);
  mesh.castShadow = quality !== 'low';
  mesh.receiveShadow = true;
  mesh.count = 0;
  mesh.frustumCulled = false;
  const silhouetteMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
  silhouetteMat.depthFunc = THREE.GreaterDepth;
  bindLit(silhouetteMat, { kind: 'silhouette', csm: null, vatPos: actor.vatPos, vatNrm: actor.vatNrm, vatSize: actor.vatSize });
  const silhouette = new THREE.InstancedMesh(actor.geometry, silhouetteMat, count);
  silhouette.count = 0;
  silhouette.frustumCulled = false;
  silhouette.renderOrder = 4;
  scene.add(mesh, silhouette);
  return { mesh, silhouette };
}

function makeRings(scene: THREE.Scene, count: number, color: number): THREE.InstancedMesh {
  const geo = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    map: createRingTexture(),
    color,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  scene.add(mesh);
  return mesh;
}

function makeDecals(scene: THREE.Scene, count: number, inner: string, outer: string, opacity: number): THREE.InstancedMesh {
  const geo = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    map: createSoftDisc(inner, outer),
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
  });
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -2;
  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  scene.add(mesh);
  return mesh;
}

const decalQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const decalMatrix = new THREE.Matrix4();

function stampDecal(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, size: number): void {
  decalMatrix.compose(new THREE.Vector3(x, y, z), decalQuat, new THREE.Vector3(size, size, 1));
  mesh.setMatrixAt(index, decalMatrix);
}

function finishDecal(mesh: THREE.InstancedMesh): void {
  mesh.instanceMatrix.needsUpdate = true;
  mesh.visible = mesh.count > 0;
}

function enclose(mesh: THREE.InstancedMesh): void {
  mesh.frustumCulled = false;
}

function makeHealth(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group();
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x2a241c, toneMapped: false, depthTest: false, side: THREE.DoubleSide }),
  );
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(0.64, 0.06),
    new THREE.MeshBasicMaterial({ color: GAME.healthGreen, toneMapped: false, depthTest: false, side: THREE.DoubleSide }),
  );
  fill.position.z = 0.01;
  group.add(back, fill);
  group.renderOrder = 6;
  scene.add(group);
  return group;
}

function makeArrows(scene: THREE.Scene): THREE.Group[] {
  const arrows: THREE.Group[] = [];
  for (let i = 0; i < 6; i++) {
    const group = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 1.75, 4),
      new THREE.MeshStandardMaterial({ color: 0x7a5a3c, roughness: 0.8 }),
    );
    shaft.rotation.x = Math.PI / 2;
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(0.05, 0.22, 4),
      new THREE.MeshStandardMaterial({ color: 0xc5c8ce, metalness: 0.9, roughness: 0.4 }),
    );
    head.rotation.x = Math.PI / 2;
    head.position.z = -0.9;
    const trail = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.8),
      new THREE.MeshBasicMaterial({ color: 0xfff1dc, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    );
    trail.position.z = 0.45;
    group.add(shaft, head, trail);
    scene.add(group);
    arrows.push(group);
  }
  return arrows;
}

function makeSmoke(scene: THREE.Scene): THREE.Sprite[] {
  const sprites: THREE.Sprite[] = [];
  for (let i = 0; i < 5; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createSoftDisc('rgba(230,230,226,0.7)', 'rgba(230,230,226,0)'),
      transparent: true,
      depthWrite: false,
      opacity: 0.3,
    }));
    sprite.scale.setScalar(0.8 + i * 0.15);
    sprite.position.set(-14, 5, 6);
    scene.add(sprite);
    sprites.push(sprite);
  }
  return sprites;
}
