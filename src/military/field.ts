import * as THREE from 'three';
import { makeNoise, mulberry32 } from '../noise';

const broad = makeNoise(4);
const mid = makeNoise(12);
const fine = makeNoise(21);
const grit = makeNoise(28);
const blot = makeNoise(33);

const VALLEY = 0x484538;
const OLIVE = 0x5c624c;
const RIDGE = 0x726c5c;
const MUD = 0x634c3c;
const STONE = 0x6a6458;
const FOG = 0x929a94;
const HAZE = 0xada594;
const SUN = 0xd8cfba;
const TREE = 0x3a4634;
const TREE_FAR = 0x465044;

function rawHeight(x: number, z: number): number {
  const large = broad(x * 0.0031, z * 0.0028);
  const middle = mid(x * 0.0085, z * 0.0078);
  const detail = fine(x * 0.019, z * 0.017);
  const grain = grit(x * 0.046, z * 0.043);
  return (large - 0.46) * 16 + (middle - 0.5) * 15 + (detail - 0.5) * 6.2 + (grain - 0.5) * 1.5;
}

export const BUNKER = new THREE.Vector3(-20, 0, 12);
export const TOWER = new THREE.Vector3(26, 0, -18);
export const UNIT = new THREE.Vector3(-6, 0, 27);

function blendPad(h: number, x: number, z: number, px: number, pz: number, radius: number): number {
  const distance = Math.hypot(x - px, z - pz);
  if (distance >= radius) return h;
  const flat = rawHeight(px, pz);
  const t = distance / radius;
  const w = t * t * (3 - 2 * t);
  return flat * (1 - w) + h * w;
}

export function hillHeight(x: number, z: number): number {
  let h = rawHeight(x, z);
  h = blendPad(h, x, z, BUNKER.x, BUNKER.z, 16);
  h = blendPad(h, x, z, TOWER.x, TOWER.z, 12);
  h = blendPad(h, x, z, UNIT.x, UNIT.z, 11);
  return h;
}

export interface Field {
  scene: THREE.Scene;
  terrain: THREE.Mesh;
  unit: THREE.Group;
  update: (time: number) => void;
  focusShadow: (x: number, z: number) => void;
}

export function createField(): Field {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.FogExp2(FOG, 0.0055);

  scene.add(createSky());
  const terrain = createTerrain();
  scene.add(terrain);

  const ambient = new THREE.AmbientLight(0x4a524c, 0.22);
  const hemi = new THREE.HemisphereLight(0xb7c3cc, 0x6e6254, 0.7);
  const sun = new THREE.DirectionalLight(SUN, 1.7);
  const fill = new THREE.DirectionalLight(0xaeb6ba, 0.28);
  fill.position.set(70, 36, -28);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.00018;
  sun.shadow.normalBias = 0.045;
  sun.shadow.radius = 4;
  const shadowCam = sun.shadow.camera as THREE.OrthographicCamera;
  scene.add(ambient, hemi, sun, sun.target, fill);
  const focusShadow = (x: number, z: number): void => {
    sun.position.set(x - 56, 42, z + 28);
    sun.target.position.set(x, 4, z);
    sun.target.updateMatrixWorld();
    shadowCam.left = -46;
    shadowCam.right = 46;
    shadowCam.top = 46;
    shadowCam.bottom = -46;
    shadowCam.near = 8;
    shadowCam.far = 170;
    shadowCam.updateProjectionMatrix();
  };
  focusShadow(0, 6);

  const rand = mulberry32(19);
  const trees = createTrees(rand);
  const distant = createDistantTrees(rand);
  const rocks = createRocks(rand);
  const debris = createDebris(rand);
  scene.add(trees.trunks, trees.low, trees.mid, trees.high, distant, rocks, debris);

  BUNKER.y = hillHeight(BUNKER.x, BUNKER.z);
  TOWER.y = hillHeight(TOWER.x, TOWER.z);
  UNIT.y = hillHeight(UNIT.x, UNIT.z);
  scene.add(createBunker(BUNKER));
  scene.add(createWatchtower(TOWER));
  const unit = createCarrier(UNIT);
  scene.add(unit);
  const mist = createMist(rand);
  scene.add(mist.group);

  const dust = createDust(rand);
  scene.add(dust.points);

  return {
    scene,
    terrain,
    unit,
    focusShadow,
    update: (time: number) => {
      dust.update(time);
      mist.update(time);
    },
  };
}

function std(color: number, roughness = 0.86, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, dithering: true });
}

function createSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color(0x6e767c) },
      uHorizon: { value: new THREE.Color(FOG) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vDir = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      void main() {
        vec3 dir = normalize(vDir);
        float up = clamp(dir.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uZenith, smoothstep(0.02, 0.7, up));
        float cloud = noise(dir.xz / max(dir.y + 0.2, 0.16) * 1.6);
        col = mix(col, col * vec3(0.92, 0.93, 0.95), smoothstep(0.5, 0.78, cloud) * smoothstep(0.04, 0.35, up) * 0.22);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(680, 28, 16), material);
  mesh.frustumCulled = false;
  mesh.name = 'sky';
  return mesh;
}

function makeGroundNormalMap(): THREE.DataTexture {
  const size = 256;
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) heights[y * size + x] = grit(x * 0.17, y * 0.17);
  }
  const data = new Uint8Array(size * size * 4);
  const strength = 1.55;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const left = heights[y * size + ((x + size - 1) % size)];
      const right = heights[y * size + ((x + 1) % size)];
      const down = heights[((y + size - 1) % size) * size + x];
      const up = heights[((y + 1) % size) * size + x];
      const nx = (left - right) * strength;
      const ny = (down - up) * strength;
      const nz = 1;
      const length = Math.hypot(nx, ny, nz);
      const index = (y * size + x) * 4;
      data[index] = (nx / length * 0.5 + 0.5) * 255;
      data[index + 1] = (ny / length * 0.5 + 0.5) * 255;
      data[index + 2] = (nz / length * 0.5 + 0.5) * 255;
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(18, 18);
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createTerrain(): THREE.Mesh {
  const size = 820;
  const segs = 210;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, hillHeight(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const normal = geo.attributes.normal;
  for (let i = 0; i < normal.count; i++) {
    const x = normal.getX(i) * 1.12;
    const y = normal.getY(i);
    const z = normal.getZ(i) * 1.12;
    const length = Math.hypot(x, y, z);
    normal.setXYZ(i, x / length, y / length, z / length);
  }
  normal.needsUpdate = true;
  geo.computeTangents();
  const colors = new Float32Array(pos.count * 3);
  const valley = new THREE.Color(VALLEY);
  const olive = new THREE.Color(OLIVE);
  const ridge = new THREE.Color(RIDGE);
  const mud = new THREE.Color(MUD);
  const stone = new THREE.Color(STONE);
  const tint = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = pos.getY(i);
    const slope = 1 - normal.getY(i);
    const heightT = THREE.MathUtils.smoothstep(h, -5, 11);
    tint.copy(valley).lerp(olive, 0.35 + heightT * 0.25);
    tint.lerp(ridge, heightT * (1 - THREE.MathUtils.smoothstep(slope, 0.08, 0.4)));
    tint.lerp(stone, THREE.MathUtils.smoothstep(slope, 0.32, 0.7) * 0.55);
    const mudPatch = blot(x * 0.045 + 12, z * 0.04);
    const flat = 1 - THREE.MathUtils.smoothstep(slope, 0.05, 0.32);
    const low = 1 - THREE.MathUtils.smoothstep(h, -2, 7);
    tint.lerp(mud, flat * low * THREE.MathUtils.smoothstep(mudPatch, 0.48, 0.74) * 0.92);
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0,
      normalMap: makeGroundNormalMap(),
      normalScale: new THREE.Vector2(0.38, 0.38),
      dithering: true,
    }),
  );
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'terrain';
  return mesh;
}

function shadeInstances(meshes: THREE.InstancedMesh[], shadows: boolean): void {
  for (const mesh of meshes) {
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

function blocked(x: number, z: number, radius: number): boolean {
  return Math.hypot(x - BUNKER.x, z - BUNKER.z) < radius
    || Math.hypot(x - TOWER.x, z - TOWER.z) < radius * 0.7
    || Math.hypot(x - UNIT.x, z - UNIT.z) < radius * 0.85;
}

function createTrees(rand: () => number): {
  trunks: THREE.InstancedMesh;
  low: THREE.InstancedMesh;
  mid: THREE.InstancedMesh;
  high: THREE.InstancedMesh;
} {
  const count = 120;
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.2, 1.55, 5);
  trunkGeo.translate(0, 0.78, 0);
  const lowGeo = new THREE.ConeGeometry(1.25, 2.35, 6);
  lowGeo.translate(0, 2.0, 0);
  const midGeo = new THREE.ConeGeometry(0.92, 2.0, 6);
  midGeo.translate(0, 3.05, 0);
  const highGeo = new THREE.ConeGeometry(0.55, 1.55, 5);
  highGeo.translate(0, 4.05, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, std(0x5a4c3c, 0.88), count);
  const low = new THREE.InstancedMesh(lowGeo, std(TREE, 0.9), count);
  const midMesh = new THREE.InstancedMesh(midGeo, std(0x44523a, 0.9), count);
  const high = new THREE.InstancedMesh(highGeo, std(0x4e5c42, 0.88), count);
  const dummy = new THREE.Object3D();
  const leaf = new THREE.Color();
  const centers: Array<[number, number]> = [
    [-46, 34], [40, 30], [34, -34], [-38, -26], [6, -40], [-14, 46],
  ];
  let placed = 0;
  for (let cluster = 0; cluster < centers.length && placed < count; cluster++) {
    const [cx, cz] = centers[cluster];
    const members = 12 + Math.floor(rand() * 6);
    for (let i = 0; i < members && placed < count; i++) {
      const x = cx + (rand() + rand() - 1) * 4.4;
      const z = cz + (rand() + rand() - 1) * 4.4;
      if (blocked(x, z, 12)) continue;
      const scale = 0.78 + rand() * 0.62;
      dummy.position.set(x, hillHeight(x, z) - 0.08, z);
      dummy.rotation.set((rand() - 0.5) * 0.06, rand() * Math.PI * 2, (rand() - 0.5) * 0.06);
      dummy.scale.set(scale, scale * (0.82 + rand() * 0.4), scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(placed, dummy.matrix);
      low.setMatrixAt(placed, dummy.matrix);
      midMesh.setMatrixAt(placed, dummy.matrix);
      high.setMatrixAt(placed, dummy.matrix);
      const shade = 0.9 + rand() * 0.14;
      leaf.setRGB(shade, shade * (0.98 + rand() * 0.04), shade * 0.92);
      low.setColorAt(placed, leaf);
      midMesh.setColorAt(placed, leaf);
      high.setColorAt(placed, leaf);
      placed++;
    }
  }
  trunks.count = placed;
  low.count = placed;
  midMesh.count = placed;
  high.count = placed;
  shadeInstances([trunks, low, midMesh, high], true);
  return { trunks, low, mid: midMesh, high };
}

function createDistantTrees(rand: () => number): THREE.InstancedMesh {
  const count = 80;
  const geo = new THREE.ConeGeometry(1.8, 7.5, 5);
  geo.translate(0, 3.6, 0);
  const mesh = new THREE.InstancedMesh(geo, std(TREE_FAR, 0.9), count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 128 + rand() * 70;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const scale = 1.4 + rand() * 1.8;
    dummy.position.set(x, hillHeight(x, z), z);
    dummy.rotation.y = rand() * Math.PI;
    dummy.scale.set(scale, scale * (0.8 + rand() * 0.5), scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    const shade = 0.78 + rand() * 0.16;
    color.setRGB(shade, shade, shade * 0.96);
    mesh.setColorAt(i, color);
  }
  shadeInstances([mesh], false);
  mesh.name = 'distant-trees';
  return mesh;
}

function createRocks(rand: () => number): THREE.InstancedMesh {
  const count = 70;
  const geo = new THREE.DodecahedronGeometry(0.65, 0);
  const mesh = new THREE.InstancedMesh(geo, std(0x6e6860, 0.9), count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const centers: Array<[number, number]> = [[-42, 30], [36, 26], [14, -6], [-10, 42], [28, -30], [-34, -22]];
  let placed = 0;
  for (let cluster = 0; cluster < centers.length && placed < count; cluster++) {
    const [cx, cz] = centers[cluster];
    const members = 5 + Math.floor(rand() * 4);
    for (let i = 0; i < members && placed < count; i++) {
      const x = cx + (rand() - 0.5) * 6;
      const z = cz + (rand() - 0.5) * 6;
      if (blocked(x, z, 7)) continue;
      const s = 0.5 + rand() * 1.5;
      dummy.position.set(x, hillHeight(x, z) + s * 0.1, z);
      dummy.rotation.set(rand() * 2, rand() * 5, rand() * 2);
      dummy.scale.set(s * (0.7 + rand() * 0.6), s * (0.4 + rand() * 0.25), s * (0.8 + rand() * 0.4));
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      color.setRGB(0.75 + rand() * 0.2, 0.72 + rand() * 0.16, 0.66 + rand() * 0.14);
      mesh.setColorAt(placed, color);
      placed++;
    }
  }
  mesh.count = placed;
  shadeInstances([mesh], true);
  mesh.name = 'rocks';
  return mesh;
}

function createDebris(rand: () => number): THREE.Group {
  const group = new THREE.Group();
  const wood = std(0x5a4636, 0.88);
  const crateMat = std(0x6a5c44, 0.84);
  const sand = std(0x6d5e46, 0.9);
  group.name = 'debris';
  const logAnchors: Array<[number, number]> = [[-42, 30], [36, 24], [-34, -22], [8, -36]];
  for (const [ax, az] of logAnchors) {
    const x = ax + (rand() - 0.5) * 6;
    const z = az + (rand() - 0.5) * 6;
    if (blocked(x, z, 8)) continue;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 2.2, 6), wood);
    log.position.set(x, hillHeight(x, z) + 0.2, z);
    log.rotation.set(0.05, rand() * Math.PI, Math.PI / 2);
    group.add(log);
  }
  for (let i = 0; i < 8; i++) {
    const x = (rand() - 0.5) * 90;
    const z = (rand() - 0.5) * 70;
    if (blocked(x, z, 8)) continue;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.16 + rand() * 0.12, 0.18, 1.6 + rand() * 1.8, 6), wood);
    log.position.set(x, hillHeight(x, z) + 0.18, z);
    log.rotation.set(rand() * 0.2, rand() * Math.PI, Math.PI / 2 + (rand() - 0.5) * 0.4);
    log.scale.y = 0.85 + rand() * 0.4;
    group.add(log);
  }
  const crates: Array<[number, number]> = [[-2, 20], [2, 16], [-14, 20], [12, 8], [30, 22], [-40, 26]];
  for (const [x, z] of crates) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), crateMat);
    crate.position.set(x, hillHeight(x, z) + 0.28, z);
    crate.rotation.y = rand() * Math.PI;
    crate.scale.setScalar(0.85 + rand() * 0.4);
    group.add(crate);
  }
  for (let i = 0; i < 5; i++) {
    const x = -12 + i * 0.7;
    const z = 22;
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5), sand);
    bag.scale.set(1.3, 0.62, 0.9);
    bag.position.set(x, hillHeight(x, z) + 0.16, z);
    bag.rotation.y = i;
    group.add(bag);
  }
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return group;
}

function paint(group: THREE.Group): void {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
}

function createBunker(origin: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  const concrete = std(0x6a6458, 0.9);
  const stained = std(0x5a564e, 0.9);
  const dark = std(0x3a403e, 0.8, 0.08);
  const sand = std(0x6d5e46, 0.9);
  const wood = std(0x5c5042, 0.86);
  const metal = std(0x6a7074, 0.78, 0.14);
  const body = new THREE.Mesh(new THREE.BoxGeometry(13.2, 3.4, 8), concrete);
  body.position.y = 1.7;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(14.1, 0.5, 8.8), stained);
  roof.position.y = 3.55;
  const slit = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.38, 0.3), dark);
  slit.position.set(-1.1, 2.1, 4.1);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.45, 2.05, 0.26), dark);
  door.position.set(4.5, 1.02, 4.05);
  group.add(body, roof, slit, door);
  for (let i = 0; i < 12; i++) {
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 5), sand);
    bag.scale.set(1.35, 0.68, 0.92);
    bag.position.set(-5.4 + (i % 6) * 1.05, i < 6 ? 0.3 : 0.78, 4.9);
    bag.rotation.y = i;
    group.add(bag);
  }
  for (const [x, z, s] of [[-5.2, 3.2, 1], [-4.2, 3.5, 0.8], [5.6, 2.4, 1.1]] as Array<[number, number, number]>) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), wood);
    crate.position.set(x, 0.35 * s, z);
    crate.scale.setScalar(s);
    crate.rotation.y = x;
    group.add(crate);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 3.4, 5), metal);
  mast.position.set(-4.8, 5.2, -1.4);
  mast.rotation.z = -0.06;
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.28), dark);
  tip.position.set(-4.95, 6.85, -1.4);
  const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.8, 4), metal);
  whip.position.set(3.6, 4.5, -2.2);
  whip.rotation.x = 0.15;
  group.add(mast, tip, whip);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(10, 16), std(0x5c513e, 0.9));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.04;
  group.add(pad);
  group.position.copy(origin);
  paint(group);
  group.name = 'bunker';
  return group;
}

function addBrace(group: THREE.Group, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, material: THREE.Material): void {
  const start = new THREE.Vector3(x1, y1, z1);
  const end = new THREE.Vector3(x2, y2, z2);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, start.distanceTo(end), 0.1), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
  group.add(mesh);
}

function createWatchtower(origin: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  const wood = std(0x65594a, 0.86);
  const dark = std(0x4a4338, 0.88);
  const metal = std(0x72767a, 0.8, 0.12);
  const posts: Array<[number, number]> = [[-1.35, -1.35], [1.35, -1.35], [-1.35, 1.35], [1.35, 1.35]];
  const height = 14.2;
  for (const [x, z] of posts) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, height, 0.28), wood);
    post.position.set(x, height / 2, z);
    group.add(post);
  }
  const faces: Array<[[number, number], [number, number]]> = [
    [[-1.35, -1.35], [1.35, -1.35]],
    [[1.35, -1.35], [1.35, 1.35]],
    [[1.35, 1.35], [-1.35, 1.35]],
    [[-1.35, 1.35], [-1.35, -1.35]],
  ];
  for (const [a, b] of faces) {
    for (const y0 of [1.1, 6.2]) {
      addBrace(group, a[0], y0, a[1], b[0], y0 + 4.2, b[1], dark);
      addBrace(group, a[0], y0 + 4.2, a[1], b[0], y0, b[1], dark);
    }
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 3.4), wood);
  deck.position.y = 12.2;
  group.add(deck);
  for (const z of [-1.65, 1.65]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.08, 0.08), dark);
    rail.position.set(0, 12.95, z);
    group.add(rail);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.25, 4), metal);
  roof.position.y = 13.9;
  roof.rotation.y = Math.PI / 4;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 2.2, 5), metal);
  mast.position.y = 15.2;
  group.add(roof, mast);
  for (let i = 0; i < 9; i++) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.05), dark);
    rung.position.set(0, 0.8 + i * 1.2, 1.52);
    group.add(rung);
  }
  group.position.copy(origin);
  paint(group);
  group.name = 'watchtower';
  return group;
}

function createCarrier(origin: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  const olive = std(0x4e5844, 0.84, 0.06);
  const dark = std(0x3a4038, 0.86, 0.1);
  const boxMat = std(0x5c5344, 0.86);
  const canvas = std(0x59624a, 0.9);
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.05, 6.2), olive);
  hull.position.y = 1.05;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.55, 1.5), olive);
  nose.position.set(0, 1.35, 3.15);
  nose.rotation.x = -0.42;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.85, 2.3), olive);
  cab.position.set(0, 1.85, 0.55);
  const tarp = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 2.4), canvas);
  tarp.position.set(0, 1.7, -1.7);
  group.add(hull, nose, cab, tarp);
  for (const x of [-1.48, 1.48]) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.62, 6.5), dark);
    track.position.set(x, 0.4, 0);
    group.add(track);
    for (let i = 0; i < 5; i++) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.24, 8), dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.3, -2.4 + i * 1.2);
      group.add(wheel);
    }
    for (let i = 0; i < 8; i++) {
      const tread = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.2), dark);
      tread.position.set(x, 0.08, -2.9 + i * 0.82);
      group.add(tread);
    }
  }
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 2.6, 5), std(0x6e7478, 0.78, 0.14));
  antenna.position.set(-0.85, 3.15, 0.2);
  antenna.rotation.z = 0.12;
  const mount = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), dark);
  mount.position.set(-0.78, 2.2, 0.15);
  const eq1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.85), boxMat);
  eq1.position.set(0.55, 1.55, -2.15);
  eq1.rotation.y = 0.2;
  const eq2 = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.32, 0.5), boxMat);
  eq2.position.set(-0.7, 1.5, -2.05);
  const can = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.42, 0.14), std(0x5a6240, 0.78, 0.12));
  can.position.set(1.05, 1.35, -1.15);
  const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.16, 8), dark);
  spare.rotation.z = Math.PI / 2;
  spare.position.set(1.15, 1.15, 1.4);
  group.add(antenna, mount, eq1, eq2, can, spare);
  group.position.copy(origin);
  group.rotation.y = 2.4;
  paint(group);
  group.name = 'carrier';
  return group;
}

function radialTexture(fadeAlpha: boolean): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a haze texture');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.04, size / 2, size / 2, size * 0.5);
  if (fadeAlpha) {
    gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.42, '#6e6e6e');
    gradient.addColorStop(1, '#000000');
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

function createMist(rand: () => number): { group: THREE.Group; update: (time: number) => void } {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: HAZE,
    alphaMap: radialTexture(false),
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    fog: true,
  });
  const anchors: Array<[number, number, number]> = [
    [-38, 6, 18], [30, 24, 16], [8, -32, 17],
  ];
  const sheets: THREE.Mesh[] = [];
  for (const [x, z, radius] of anchors) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 20), material);
    mesh.rotation.x = -Math.PI / 2;
    const y = hillHeight(x, z) + 0.7;
    mesh.position.set(x, y, z);
    mesh.scale.set(1, 0.78 + rand() * 0.28, 1);
    mesh.renderOrder = 2;
    mesh.userData.baseX = x;
    mesh.userData.baseZ = z;
    group.add(mesh);
    sheets.push(mesh);
  }
  group.name = 'mist';
  return {
    group,
    update: (time: number) => {
      for (let i = 0; i < sheets.length; i++) {
        const mesh = sheets[i];
        const x = (mesh.userData.baseX as number) + Math.sin(time * 0.07 + i) * 3.2;
        const z = (mesh.userData.baseZ as number) + Math.cos(time * 0.05 + i * 1.4) * 2.4;
        mesh.position.x = x;
        mesh.position.z = z;
        mesh.position.y = hillHeight(x, z) + 0.65;
      }
    },
  };
}

function createDust(rand: () => number): { points: THREE.Points; update: (time: number) => void } {
  const count = 220;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const x = (rand() - 0.5) * 180;
    const z = (rand() - 0.5) * 180;
    positions[i * 3] = x;
    positions[i * 3 + 1] = hillHeight(x, z) + 0.4 + rand() * 5.5;
    positions[i * 3 + 2] = z;
    seeds[i] = rand() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xc4bba8,
    map: radialTexture(true),
    size: 0.85,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    sizeAttenuation: true,
  }));
  points.frustumCulled = false;
  points.name = 'dust';
  let previous = 0;
  return {
    points,
    update: (time: number) => {
      const dt = previous === 0 ? 0.016 : Math.min(0.05, time - previous);
      previous = time;
      const attr = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < count; i++) {
        let x = attr.getX(i) + dt * (0.28 + (i % 5) * 0.04);
        let z = attr.getZ(i) + dt * Math.sin(seeds[i]) * 0.12;
        if (x > 90) x -= 180;
        if (z > 90) z -= 180;
        if (z < -90) z += 180;
        attr.setX(i, x);
        attr.setZ(i, z);
        attr.setY(i, positions[i * 3 + 1] + Math.sin(time * 0.22 + seeds[i]) * 0.12);
      }
      attr.needsUpdate = true;
    },
  };
}
