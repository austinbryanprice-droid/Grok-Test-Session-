import * as THREE from 'three';
import { makeNoise, mulberry32 } from '../noise';

const broad = makeNoise(4);
const mid = makeNoise(12);
const fine = makeNoise(21);
const grit = makeNoise(28);
const blot = makeNoise(33);

const VALLEY = 0x24361c;
const OLIVE = 0x466428;
const RIDGE = 0x74844a;
const MUD = 0x6a5438;
const STONE = 0x6a655c;
const FOG = 0x8e99a6;
const HAZE = 0xd2dae2;
const SUN = 0xf3e6d2;

function rawHeight(x: number, z: number): number {
  const large = broad(x * 0.0031, z * 0.0028);
  const middle = mid(x * 0.0085, z * 0.0078);
  const detail = fine(x * 0.019, z * 0.017);
  const grain = grit(x * 0.046, z * 0.043);
  return (large - 0.46) * 26 + (middle - 0.5) * 12 + (detail - 0.5) * 4.2 + (grain - 0.5) * 1.1;
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
  update: (time: number) => void;
}

export function createField(): Field {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.FogExp2(FOG, 0.0046);

  scene.add(createSky());
  scene.add(createTerrain());

  const ambient = new THREE.AmbientLight(0x9aabbe, 0.38);
  const hemi = new THREE.HemisphereLight(0xb7c4d2, 0x3a4a2a, 0.82);
  const sun = new THREE.DirectionalLight(SUN, 2.7);
  sun.position.set(-120, 62, 40);
  const fill = new THREE.DirectionalLight(0xb7c6d6, 0.42);
  fill.position.set(70, 36, -28);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.14;
  sun.shadow.radius = 3;
  const shadowCam = sun.shadow.camera as THREE.OrthographicCamera;
  shadowCam.left = -140;
  shadowCam.right = 140;
  shadowCam.top = 140;
  shadowCam.bottom = -140;
  shadowCam.near = 10;
  shadowCam.far = 340;
  sun.target.position.set(0, 6, 0);
  scene.add(ambient, hemi, sun, sun.target, fill);

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
  scene.add(createCarrier(UNIT));
  scene.add(createMist(rand));

  const dust = createDust(rand);
  scene.add(dust.points);

  return {
    scene,
    update: (time: number) => dust.update(time),
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
      uZenith: { value: new THREE.Color(0x667584) },
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
  const strength = 3.2;
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
  texture.repeat.set(28, 28);
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
    const patch = blot(x * 0.028, z * 0.026);
    tint.copy(olive).lerp(valley, patch * 0.28);
    tint.lerp(valley, (1 - THREE.MathUtils.smoothstep(h, -6, 3)) * 0.7);
    const crest = THREE.MathUtils.smoothstep(h, 5, 14) * (1 - THREE.MathUtils.smoothstep(slope, 0.05, 0.26));
    tint.lerp(ridge, crest * 0.62);
    const mudPatch = blot(x * 0.07 + 12, z * 0.064);
    tint.lerp(mud, THREE.MathUtils.smoothstep(mudPatch, 0.58, 0.8) * 0.72);
    tint.lerp(mud, (1 - THREE.MathUtils.smoothstep(h, -12, -3)) * 0.4);
    tint.lerp(stone, THREE.MathUtils.smoothstep(slope, 0.4, 0.72));
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
      normalScale: new THREE.Vector2(0.75, 0.75),
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
  const count = 150;
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.2, 1.55, 5);
  trunkGeo.translate(0, 0.78, 0);
  const lowGeo = new THREE.ConeGeometry(1.25, 2.35, 6);
  lowGeo.translate(0, 2.0, 0);
  const midGeo = new THREE.ConeGeometry(0.92, 2.0, 6);
  midGeo.translate(0, 3.05, 0);
  const highGeo = new THREE.ConeGeometry(0.55, 1.55, 5);
  highGeo.translate(0, 4.05, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, std(0x5a4c3c, 0.88), count);
  const low = new THREE.InstancedMesh(lowGeo, std(0x314422, 0.9), count);
  const midMesh = new THREE.InstancedMesh(midGeo, std(0x3c5228, 0.9), count);
  const high = new THREE.InstancedMesh(highGeo, std(0x4a6234, 0.88), count);
  const dummy = new THREE.Object3D();
  const leaf = new THREE.Color();
  const centers: Array<[number, number]> = [
    [-42, 24], [38, 30], [18, 8], [-16, -4], [44, -8], [-36, -22], [8, -24], [48, 8], [-8, 16],
  ];
  let placed = 0;
  for (let cluster = 0; cluster < 15 && placed < count; cluster++) {
    const fixed = centers[cluster];
    let cx = 0;
    let cz = 0;
    if (fixed) {
      cx = fixed[0];
      cz = fixed[1];
    } else {
      let best = -999;
      for (let attempt = 0; attempt < 5; attempt++) {
        const x = (rand() - 0.5) * 340;
        const z = (rand() - 0.5) * 340;
        const h = rawHeight(x, z);
        if (h > best) {
          best = h;
          cx = x;
          cz = z;
        }
      }
    }
    const members = 6 + Math.floor(rand() * 7);
    for (let i = 0; i < members && placed < count; i++) {
      const x = cx + (rand() + rand() - 1) * 7;
      const z = cz + (rand() + rand() - 1) * 7;
      if (blocked(x, z, 12)) continue;
      const scale = (rand() > 0.55 ? 0.74 : 1) * (0.85 + rand() * 0.9);
      dummy.position.set(x, hillHeight(x, z) - 0.08, z);
      dummy.rotation.set((rand() - 0.5) * 0.06, rand() * Math.PI * 2, (rand() - 0.5) * 0.06);
      dummy.scale.set(scale, scale * (0.82 + rand() * 0.4), scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(placed, dummy.matrix);
      low.setMatrixAt(placed, dummy.matrix);
      midMesh.setMatrixAt(placed, dummy.matrix);
      high.setMatrixAt(placed, dummy.matrix);
      leaf.setRGB(0.84 + rand() * 0.16, 0.88 + rand() * 0.12, 0.8 + rand() * 0.14);
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
  const mesh = new THREE.InstancedMesh(geo, std(0x1c2818, 0.92), count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 210 + rand() * 150;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const scale = 1.4 + rand() * 1.8;
    dummy.position.set(x, hillHeight(x, z), z);
    dummy.rotation.y = rand() * Math.PI;
    dummy.scale.set(scale, scale * (0.8 + rand() * 0.5), scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.setRGB(0.7 + rand() * 0.2, 0.75 + rand() * 0.15, 0.68);
    mesh.setColorAt(i, color);
  }
  shadeInstances([mesh], false);
  mesh.name = 'distant-trees';
  return mesh;
}

function createRocks(rand: () => number): THREE.InstancedMesh {
  const count = 70;
  const geo = new THREE.DodecahedronGeometry(0.65, 0);
  const mesh = new THREE.InstancedMesh(geo, std(0x7a746c, 0.9), count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const centers: Array<[number, number]> = [[-10, 34], [-28, 16], [4, 18], [18, -8], [32, 14], [-4, 8]];
  let placed = 0;
  for (let cluster = 0; cluster < 12 && placed < count; cluster++) {
    const fixed = centers[cluster];
    const cx = fixed ? fixed[0] : (rand() - 0.5) * 300;
    const cz = fixed ? fixed[1] : (rand() - 0.5) * 300;
    const members = 3 + Math.floor(rand() * 4);
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
  group.name = 'debris';
  for (let i = 0; i < 16; i++) {
    const x = (rand() - 0.5) * 120;
    const z = (rand() - 0.5) * 90;
    if (blocked(x, z, 8)) continue;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.16 + rand() * 0.12, 0.18, 1.6 + rand() * 1.8, 6), wood);
    log.position.set(x, hillHeight(x, z) + 0.18, z);
    log.rotation.set(rand() * 0.2, rand() * Math.PI, Math.PI / 2 + (rand() - 0.5) * 0.4);
    log.scale.y = 0.85 + rand() * 0.4;
    group.add(log);
  }
  const crates: Array<[number, number]> = [[-2, 20], [2, 16], [-14, 20], [12, 8]];
  for (const [x, z] of crates) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), crateMat);
    crate.position.set(x, hillHeight(x, z) + 0.28, z);
    crate.rotation.y = rand() * Math.PI;
    crate.scale.setScalar(0.85 + rand() * 0.4);
    group.add(crate);
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
  const concrete = std(0x9a958c, 0.88);
  const stained = std(0x7e7a72, 0.9);
  const dark = std(0x3a403e, 0.8, 0.08);
  const sand = std(0x6d5e46, 0.9);
  const wood = std(0x5c5042, 0.86);
  const metal = std(0x6a7074, 0.72, 0.28);
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
  const pad = new THREE.Mesh(new THREE.CircleGeometry(10, 16), std(0x5c513e, 0.92));
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
  const metal = std(0x72767a, 0.74, 0.26);
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
  const olive = std(0x4d5634, 0.84, 0.04);
  const dark = std(0x2c312c, 0.74, 0.32);
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
  }
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 2.6, 5), std(0x6e7478, 0.7, 0.3));
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

function createMist(rand: () => number): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: HAZE,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
    fog: true,
  });
  const anchors: Array<[number, number, number]> = [
    [10, 18, 14], [-28, 6, 12], [22, -10, 11], [-6, -20, 13],
  ];
  for (const [x, z, radius] of anchors) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 18), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x + (rand() - 0.5) * 2, hillHeight(x, z) + 0.45, z);
    mesh.scale.set(1, 0.72 + rand() * 0.3, 1);
    mesh.renderOrder = 2;
    group.add(mesh);
  }
  group.name = 'mist';
  return group;
}

function createDust(rand: () => number): { points: THREE.Points; update: (time: number) => void } {
  const count = 460;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const x = (rand() - 0.5) * 240;
    const z = (rand() - 0.5) * 240;
    positions[i * 3] = x;
    positions[i * 3 + 1] = hillHeight(x, z) + 0.5 + rand() * 6.5;
    positions[i * 3 + 2] = z;
    seeds[i] = rand() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xc8c2b4,
    size: 2.2,
    transparent: true,
    opacity: 0.24,
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
        let x = attr.getX(i) + dt * 1.15;
        if (x > 120) x -= 240;
        attr.setX(i, x);
        attr.setY(i, positions[i * 3 + 1] + Math.sin(time * 0.35 + seeds[i]) * 0.16);
      }
      attr.needsUpdate = true;
    },
  };
}
