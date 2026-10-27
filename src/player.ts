import {
  BufferAttribute,
  CapsuleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { GRASS } from './blocks';
import { Builder, appendExposedFaces } from './mesh';

const outlineMat = new MeshBasicMaterial({ color: 0x14110e, side: 1 });
outlineMat.side = 1;

function tone(color: number, roughness: number): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ color, roughness, metalness: 0, vertexColors: true });
  mat.toneMapped = false;
  return mat;
}

function expandOutline(mesh: Mesh, parent: Group): void {
  const geo = mesh.geometry.clone();
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (!box) return;
  const center = box.getCenter(new Vector3());
  const pos = geo.getAttribute('position') as BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    pos.setXYZ(
      i,
      center.x + (pos.getX(i) - center.x) * 1.08,
      center.y + (pos.getY(i) - center.y) * 1.08,
      center.z + (pos.getZ(i) - center.z) * 1.08,
    );
  }
  pos.needsUpdate = true;
  const shell = new Mesh(geo, outlineMat);
  shell.position.copy(mesh.position);
  shell.rotation.copy(mesh.rotation);
  shell.scale.copy(mesh.scale);
  shell.castShadow = false;
  shell.receiveShadow = false;
  parent.add(shell);
}

function beveled(w: number, h: number, d: number, tint: [number, number, number]): Mesh {
  const builder = new Builder();
  appendExposedFaces(builder, -w / 2, -h / 2, -d / 2, GRASS, [w, h, d], tint, () => false, 0.045);
  const geo = builder.geometry();
  if (!geo) throw new Error('Player box produced no faces.');
  const mat = tone(0xffffff, 0.72);
  const mesh = new Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export type Player = {
  group: Group;
  place: (x: number, y: number, z: number) => void;
  update: (dt: number, moving: boolean, yaw: number) => void;
};

export function createPlayer(): Player {
  outlineMat.side = 1;
  const BackSide = 1;
  outlineMat.side = BackSide;

  const group = new Group();
  const cloth: [number, number, number] = [0.72, 0.95, 0.58];
  const leather: [number, number, number] = [0.72, 0.42, 0.24];
  const skin: [number, number, number] = [0.95, 0.72, 0.55];
  const dark: [number, number, number] = [0.22, 0.2, 0.18];

  const torso = beveled(0.5, 0.56, 0.3, cloth);
  torso.position.set(0, 1.12, 0);
  group.add(torso);
  expandOutline(torso, group);

  const pack = beveled(0.34, 0.4, 0.16, leather);
  pack.position.set(0, 1.14, -0.2);
  group.add(pack);
  expandOutline(pack, group);

  const head = beveled(0.34, 0.34, 0.34, skin);
  head.position.set(0, 1.56, 0);
  group.add(head);
  expandOutline(head, group);

  const belt = beveled(0.42, 0.08, 0.32, dark);
  belt.position.set(0, 0.86, 0);
  group.add(belt);

  const eyeMat = new MeshStandardMaterial({
    color: 0x083038,
    emissive: 0x35e0ff,
    emissiveIntensity: 2.4,
    roughness: 0.25,
  });
  eyeMat.toneMapped = false;
  const eyeGeo = new CapsuleGeometry(0.045, 0.02, 2, 6);
  const leftEye = new Mesh(eyeGeo, eyeMat);
  const rightEye = new Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.08, 1.58, 0.16);
  rightEye.position.set(0.08, 1.58, 0.16);
  group.add(leftEye, rightEye);

  const nodeMat = new MeshStandardMaterial({
    color: 0x062028,
    emissive: 0x3de0ff,
    emissiveIntensity: 2,
    roughness: 0.3,
  });
  nodeMat.toneMapped = false;
  const node = new Mesh(new CapsuleGeometry(0.05, 0.02, 2, 6), nodeMat);
  node.position.set(0.16, 1.28, -0.18);
  group.add(node);

  const accentMat = new MeshStandardMaterial({
    color: 0x4a2414,
    emissive: 0xff8a3d,
    emissiveIntensity: 1.8,
    roughness: 0.4,
  });
  accentMat.toneMapped = false;
  const clasp = beveled(0.12, 0.08, 0.06, [1, 0.7, 0.4]);
  clasp.material = accentMat;
  clasp.position.set(0, 1.2, 0.16);
  group.add(clasp);
  const lamp = new Mesh(new CapsuleGeometry(0.04, 0.04, 2, 6), accentMat);
  lamp.position.set(0, 1.32, -0.22);
  group.add(lamp);

  const legGeo = new CapsuleGeometry(0.09, 0.46, 3, 8);
  const armGeo = new CapsuleGeometry(0.07, 0.34, 3, 8);
  const limbMat = tone(0xffffff, 0.75);
  const makeLimb = (x: number, y: number, z: number, geo: CapsuleGeometry, drop: number) => {
    const pivot = new Group();
    pivot.position.set(x, y, z);
    const mesh = new Mesh(geo, limbMat);
    mesh.position.y = -drop;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const tintAttr = new Float32Array(geo.getAttribute('position').count * 3);
    for (let i = 0; i < tintAttr.length; i += 3) {
      tintAttr[i] = leather[0];
      tintAttr[i + 1] = leather[1];
      tintAttr[i + 2] = leather[2];
    }
    geo.setAttribute('color', new BufferAttribute(tintAttr, 3));
    pivot.add(mesh);
    expandOutline(mesh, pivot);
    group.add(pivot);
    return pivot;
  };
  const leftLeg = makeLimb(-0.12, 0.78, 0, legGeo, 0.32);
  const rightLeg = makeLimb(0.12, 0.78, 0, legGeo.clone(), 0.32);
  const leftArm = makeLimb(-0.32, 1.28, 0, armGeo, 0.24);
  const rightArm = makeLimb(0.32, 1.28, 0, armGeo.clone(), 0.24);

  let bob = 0;
  return {
    group,
    place: (x, y, z) => group.position.set(x, y, z),
    update: (dt, moving, yaw) => {
      group.rotation.y = yaw;
      bob += dt * (moving ? 8 : 2);
      const swing = Math.sin(bob) * (moving ? 0.7 : 0.05);
      leftLeg.rotation.x = swing;
      rightLeg.rotation.x = -swing;
      leftArm.rotation.x = -swing * 0.6;
      rightArm.rotation.x = swing * 0.6;
      torso.position.y = 1.12 + Math.sin(bob * 2) * (moving ? 0.02 : 0.008);
    },
  };
}
