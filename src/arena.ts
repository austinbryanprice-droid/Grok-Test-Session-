import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createStrand, stepStrand, type Strand } from './cloth.ts';

function marbleTexture(): any {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('marble canvas unavailable');
  ctx.fillStyle = '#d8d2c6';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 36; i += 1) {
    const x = (i * 73) % 256;
    const y = (i * 41) % 256;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(118, 110, 98, 0.28)' : 'rgba(236, 230, 220, 0.5)';
    ctx.beginPath();
    ctx.ellipse(x, y, 16 + (i % 5) * 9, 7 + (i % 4) * 4, (i % 7) * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
}

function bannerTexture(): any {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('banner canvas unavailable');
  ctx.fillStyle = '#7a1d1a';
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = '#d6b15e';
  ctx.fillRect(0, 0, 8, 128);
  ctx.fillRect(24, 18, 32, 8);
  ctx.fillRect(24, 40, 24, 6);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export type Arena = {
  object: any;
  update: (time: number) => void;
};

export function createArena(): Arena {
  const group = new THREE.Group();
  const marble = new THREE.MeshStandardMaterial({
    map: marbleTexture(),
    color: 0xf2efe8,
    roughness: 0.62,
    metalness: 0.02,
  });
  const stone = new THREE.MeshStandardMaterial({ color: 0x8d8478, roughness: 0.9, metalness: 0.02 });

  const floor = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.4, 0.35, 48), marble);
  floor.position.y = -0.18;
  floor.receiveShadow = true;
  group.add(floor);

  const nearColumns: any[] = [];
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const column = new THREE.CylinderGeometry(0.28, 0.32, 4.2, 10);
    column.translate(Math.cos(angle) * 6.4, 2.05, Math.sin(angle) * 6.4);
    nearColumns.push(column);
  }
  const near = new THREE.Mesh(mergeGeometries(nearColumns), marble);
  near.castShadow = true;
  near.receiveShadow = true;
  group.add(near);

  const farColumns: any[] = [];
  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * Math.PI * 2;
    const column = new THREE.CylinderGeometry(0.45, 0.5, 6, 8);
    column.translate(Math.cos(angle) * 36, 2.8, Math.sin(angle) * 36);
    farColumns.push(column);
  }
  const far = new THREE.Mesh(mergeGeometries(farColumns), marble);
  far.castShadow = false;
  far.receiveShadow = false;
  group.add(far);

  const rocks: any[] = [];
  const rockSpots: Array<[number, number, number]> = [[2.4, 0.18, 1.6], [-2.1, 0.16, 1.2], [1.2, 0.12, 2.4]];
  for (const [x, y, z] of rockSpots) {
    const rock = new THREE.DodecahedronGeometry(0.28, 0);
    rock.translate(x, y, z);
    rocks.push(rock);
  }
  const rockMesh = new THREE.Mesh(mergeGeometries(rocks), stone);
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  group.add(rockMesh);

  const grassGeo = new THREE.ConeGeometry(0.035, 0.16, 4);
  grassGeo.translate(0, 0.08, 0);
  const grass = new THREE.InstancedMesh(
    grassGeo,
    new THREE.MeshStandardMaterial({ color: 0x3f7a32, roughness: 0.95, metalness: 0 }),
    80,
  );
  grass.castShadow = false;
  grass.receiveShadow = false;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  for (let i = 0; i < 80; i += 1) {
    const angle = i * 2.399;
    const radius = 3.2 + (i % 9) * 0.45;
    position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i);
    scale.set(1, 0.8 + (i % 5) * 0.08, 1);
    matrix.compose(position, rotation, scale);
    grass.setMatrixAt(i, matrix);
  }
  group.add(grass);

  const metal = new THREE.MeshStandardMaterial({ color: 0x5c534c, roughness: 0.42, metalness: 0.86, envMapIntensity: 1 });
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 12, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58), metal);
  bowl.position.set(-1.9, 0.58, 0.95);
  bowl.castShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 8, 20), metal);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(-1.9, 0.74, 0.95);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.62, 8), metal);
  stem.position.set(-1.9, 0.3, 0.95);
  stem.castShadow = true;
  group.add(bowl, rim, stem);

  const flameMaterial = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: new THREE.Color(1.0, 0.42, 0.08),
    emissiveIntensity: 2.4,
    roughness: 1,
    metalness: 0,
    toneMapped: false,
  });
  const flames = new THREE.InstancedMesh(new THREE.ConeGeometry(0.08, 0.28, 6), flameMaterial, 5);
  flames.position.set(-1.9, 0.86, 0.95);
  flames.castShadow = false;
  for (let i = 0; i < 5; i += 1) {
    position.set((i - 2) * 0.05, (i % 2) * 0.05, (i - 2) * 0.02);
    rotation.identity();
    scale.set(1, 0.8 + (i % 3) * 0.15, 1);
    matrix.compose(position, rotation, scale);
    flames.setMatrixAt(i, matrix);
  }
  group.add(flames);

  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.05, 0.16, 28), marble);
  basin.position.set(2.05, 0.08, 1.45);
  basin.castShadow = true;
  basin.receiveShadow = true;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.06, 8, 28), marble);
  lip.rotation.x = Math.PI / 2;
  lip.position.set(2.05, 0.16, 1.45);
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(1.02, 24),
    new THREE.MeshStandardMaterial({ color: 0x6ea8b8, roughness: 0.18, metalness: 0.05, envMapIntensity: 0.8 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(2.05, 0.15, 1.45);
  group.add(basin, lip, water);

  const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTexture(), roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
  const poles = [-3.1, 3.1];
  const banners: Array<{ mesh: any; strands: Strand[] }> = [];
  for (const x of poles) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 2.4, 6), metal);
    pole.position.set(x, 1.2, 2.7);
    pole.castShadow = true;
    group.add(pole);
    const strands: Strand[] = [];
    for (let col = 0; col < 4; col += 1) {
      strands.push(createStrand(new THREE.Vector3(x + col * 0.12, 2.15, 2.7), new THREE.Vector3(0, -1, 0), 6, 0.16));
    }
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(4 * 6 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const normals = new Float32Array(4 * 6 * 3);
    for (let n = 0; n < 4 * 6; n += 1) normals[n * 3 + 2] = 1;
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    const uvs = new Float32Array(4 * 6 * 2);
    const index: number[] = [];
    for (let col = 0; col < 4; col += 1) {
      for (let row = 0; row < 6; row += 1) {
        const v = col * 6 + row;
        uvs[v * 2] = col / 3;
        uvs[v * 2 + 1] = 1 - row / 5;
      }
    }
    for (let col = 0; col < 3; col += 1) {
      for (let row = 0; row < 5; row += 1) {
        const a = col * 6 + row;
        index.push(a, a + 6, a + 1, a + 1, a + 6, a + 7);
      }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(index);
    const mesh = new THREE.Mesh(geo, bannerMat);
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    group.add(mesh);
    banners.push({ mesh, strands });
  }

  const update = (time: number) => {
    for (const banner of banners) {
      const positions = banner.mesh.geometry.attributes.position;
      for (let col = 0; col < 4; col += 1) {
        const strand = banner.strands[col];
        const anchor = strand.pos[0];
        anchor.x += Math.sin(time * 0.7 + col) * 0;
        stepStrand(strand, strand.pos[0], 1 / 60);
        for (let row = 0; row < 6; row += 1) {
          positions.setXYZ(col * 6 + row, strand.pos[row].x, strand.pos[row].y, strand.pos[row].z);
        }
      }
      positions.needsUpdate = true;
    }
  };

  return { object: group, update };
}
