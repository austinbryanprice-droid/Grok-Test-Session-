import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Sprite,
  SpriteMaterial,
} from 'three';
import { settlement } from './field';
import { lit } from './lit';
import type { Library } from './textures';

export type Settlement = {
  object: Group;
  update: (time: number) => void;
};

export function createSettlement(library: Library): Settlement {
  const home = settlement();
  const root = new Group();
  root.position.set(home.x, home.y, home.z);

  const stone = surface(library.stone, 0.34);
  const wood = surface(library.wood, 0.3);
  const plaster = surface(library.plaster, 0.28);
  const roofMat = surface(library.roof, 0.32);
  const doorMat = surface(library.wood, 0.25);
  doorMat.color = new Color(0x6a4632);
  const metal = lit({
    color: 0xb08a62,
    metalness: 1,
    roughness: 0.28,
    envMapIntensity: 1.15,
  });
  const windowMat = lit({
    color: 0x2a160e,
    emissive: 0xffb15a,
    emissiveIntensity: 0.7,
    roughness: 0.45,
    metalness: 0,
  });
  const flameMat = lit({
    color: 0x000000,
    emissive: 0xff6a1c,
    emissiveIntensity: 3.4,
    roughness: 1,
    metalness: 0,
  });

  const add = (mesh: Mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };

  add(box(9.1, 0.64, 13.8, stone, 0, 0.32, 0));
  add(box(0.34, 3.85, 12.4, plaster, 4.05, 2.58, 0.15));
  add(box(8.1, 3.85, 0.34, plaster, 0, 2.58, 6.55));
  add(box(8.1, 3.85, 0.34, plaster, 0, 2.58, -6.55));
  add(box(0.34, 1.55, 4.7, plaster, -4.05, 1.42, -3.85));
  add(box(0.34, 1.55, 5.1, plaster, -4.05, 1.42, 3.55));
  add(box(0.34, 1.15, 1.7, plaster, -4.05, 3.85, -0.15));

  const postY = 2.55;
  for (const z of [-6.2, -4.0, -1.15, 0.85, 3.3, 6.2]) {
    add(box(0.22, 3.9, 0.22, wood, -4.22, postY, z));
    add(box(0.22, 3.9, 0.22, wood, 4.22, postY, z));
  }
  for (const x of [-2.2, 0, 2.2]) {
    add(box(0.2, 3.9, 0.2, wood, x, postY, -6.7));
    add(box(0.2, 3.9, 0.2, wood, x, postY, 6.7));
  }
  add(box(0.18, 0.18, 13.2, wood, -4.22, 4.45, 0));
  add(box(0.18, 0.18, 13.2, wood, 4.22, 4.45, 0));
  add(box(8.6, 0.16, 0.16, wood, 0, 4.45, -6.7));
  add(box(8.6, 0.16, 0.16, wood, 0, 4.45, 6.7));
  add(box(0.14, 0.14, 12.6, wood, -4.22, 2.35, 0));
  add(box(0.14, 0.14, 12.6, wood, 4.22, 2.35, 0));

  const braceA = box(0.12, 2.4, 0.12, wood, -4.28, 3.3, -5.1);
  braceA.rotation.x = 0.7;
  add(braceA);
  const braceB = box(0.12, 2.4, 0.12, wood, -4.28, 3.3, 4.7);
  braceB.rotation.x = -0.7;
  add(braceB);

  add(box(0.16, 2.15, 1.25, doorMat, -4.28, 1.72, -0.15));
  add(box(0.08, 0.7, 0.55, windowMat, -4.32, 2.85, -3.7));
  add(box(0.08, 0.7, 0.55, windowMat, -4.32, 2.85, 2.6));
  add(box(0.5, 0.7, 0.08, windowMat, 2.4, 2.85, -6.78));

  const rise = 2.55;
  const run = 5.05;
  const slopeLen = Math.hypot(run, rise);
  const angle = Math.atan2(rise, run);
  const left = box(slopeLen, 0.14, 14.3, roofMat, -run / 2, 4.55 + rise / 2, 0);
  left.rotation.z = angle;
  add(left);
  const right = box(slopeLen, 0.14, 14.3, roofMat, run / 2, 4.55 + rise / 2, 0);
  right.rotation.z = -angle;
  add(right);
  add(gable(-6.55, plaster, rise));
  add(gable(6.55, plaster, rise));
  add(box(0.16, 0.16, 14.4, wood, 0, 4.55 + rise, 0));
  add(box(0.7, 1.7, 0.7, stone, 1.5, 6.5, 2.2));
  add(box(0.28, 0.5, 0.28, metal, -4.85, 2.15, -1.55));

  const flame = new Mesh(new ConeGeometry(0.12, 0.38, 8), flameMat);
  flame.position.set(-4.85, 2.52, -1.55);
  flame.castShadow = false;
  root.add(flame);

  const torch = new PointLight(0xff7a3c, 8, 16, 2);
  torch.position.set(-4.85, 2.45, -1.55);
  torch.castShadow = true;
  torch.shadow.mapSize.set(512, 512);
  torch.shadow.bias = -0.004;
  root.add(torch);

  const smokeMat = new SpriteMaterial({
    map: library.smoke,
    color: 0xb7b0a6,
    transparent: true,
    depthWrite: false,
    opacity: 0.28,
  });
  const smokes: Sprite[] = [];
  for (let i = 0; i < 4; i += 1) {
    const sprite = new Sprite(smokeMat.clone());
    sprite.position.set(1.5, 7.2 + i * 0.45, 2.2);
    sprite.scale.setScalar(0.8 + i * 0.35);
    root.add(sprite);
    smokes.push(sprite);
  }

  const dustMat = new SpriteMaterial({
    map: library.smoke,
    color: 0xffd2a4,
    transparent: true,
    depthWrite: false,
    opacity: 0.2,
  });
  const motes: { sprite: Sprite; phase: number }[] = [];
  for (let i = 0; i < 14; i += 1) {
    const sprite = new Sprite(dustMat.clone());
    sprite.scale.setScalar(0.18 + (i % 3) * 0.06);
    sprite.position.set(-5.5, 1.2 + (i % 5) * 0.4, -1.2 + (i % 7) * 0.45);
    root.add(sprite);
    motes.push({ sprite, phase: i * 0.37 });
  }

  const out = new Group();
  out.position.set(3.6, 0, 8.7);
  root.add(out);
  const outAdd = (mesh: Mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    out.add(mesh);
  };
  outAdd(box(4.4, 0.4, 3.8, stone, 0, 0.2, 0));
  outAdd(box(4.0, 2.3, 3.4, stone, 0, 1.55, 0));
  const outRoofL = box(Math.hypot(2.3, 1.15), 0.12, 4.1, roofMat, -1.05, 3.15, 0);
  outRoofL.rotation.z = Math.atan2(1.15, 2.3);
  outAdd(outRoofL);
  const outRoofR = box(Math.hypot(2.3, 1.15), 0.12, 4.1, roofMat, 1.05, 3.15, 0);
  outRoofR.rotation.z = -Math.atan2(1.15, 2.3);
  outAdd(outRoofR);
  outAdd(box(0.12, 1.7, 0.9, doorMat, -2.05, 1.15, 0.2));

  return {
    object: root,
    update(time: number) {
      flame.scale.y = 0.82 + Math.sin(time * 15) * 0.16;
      flame.scale.x = 1 + Math.sin(time * 11) * 0.08;
      torch.intensity = 7.2 + Math.sin(time * 18) * 1.1;
      smokes.forEach((sprite, index) => {
        const cycle = (time * 0.22 + index * 0.25) % 1;
        sprite.position.y = 7.1 + cycle * 2.4;
        sprite.position.x = 1.5 + Math.sin(time * 0.6 + index) * 0.15;
        sprite.scale.setScalar(0.7 + cycle * 1.3);
        sprite.material.opacity = (1 - cycle) * 0.32;
      });
      for (const mote of motes) {
        const cycle = (time * 0.12 + mote.phase) % 1;
        mote.sprite.position.y = 1.1 + cycle * 4.2;
        mote.sprite.position.x = -5.4 + Math.sin(time + mote.phase) * 0.35;
        mote.sprite.material.opacity = Math.sin(cycle * Math.PI) * 0.28;
      }
    },
  };
}

function surface(map: Library['stone'], env: number): MeshStandardMaterial {
  const material = lit({
    map: map.color,
    normalMap: map.normal,
    roughnessMap: map.rough,
    roughness: 1,
    metalness: 0,
    envMapIntensity: env,
  });
  material.normalScale.set(0.85, 0.85);
  return material;
}

function box(
  w: number,
  h: number,
  d: number,
  material: MeshStandardMaterial,
  x: number,
  y: number,
  z: number,
): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function gable(z: number, material: MeshStandardMaterial, rise: number): Mesh {
  const hw = 4.7;
  const y0 = 4.55;
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([-hw, y0, z, hw, y0, z, 0, y0 + rise, z]), 3),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 1]);
  geometry.computeVertexNormals();
  return new Mesh(geometry, material);
}
