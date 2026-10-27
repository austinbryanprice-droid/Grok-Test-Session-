import * as THREE from 'three';
import { makeNoise, mulberry32 } from '../noise';

const broad = makeNoise(4);
const mid = makeNoise(12);
const fine = makeNoise(21);
const blot = makeNoise(33);

function rawHeight(x: number, z: number): number {
  const large = broad(x * 0.0044, z * 0.004);
  const middle = mid(x * 0.0125, z * 0.0115);
  const detail = fine(x * 0.031, z * 0.028);
  return (large - 0.42) * 22 + (middle - 0.48) * 13 + (detail - 0.5) * 3.2;
}

function blendPad(h: number, x: number, z: number, px: number, pz: number, radius: number): number {
  const distance = Math.hypot(x - px, z - pz);
  if (distance >= radius) return h;
  const flat = rawHeight(px, pz);
  const t = distance / radius;
  const w = t * t * (3 - 2 * t);
  return flat * (1 - w) + h * w;
}

export const BUNKER = new THREE.Vector3(-18, 0, 14);
export const TOWER = new THREE.Vector3(22, 0, -16);

export function hillHeight(x: number, z: number): number {
  let h = rawHeight(x, z);
  h = blendPad(h, x, z, BUNKER.x, BUNKER.z, 15);
  h = blendPad(h, x, z, TOWER.x, TOWER.z, 11);
  return h;
}

const FOG_COLOR = 0x8e99a6;

export interface Field {
  scene: THREE.Scene;
  update: (time: number) => void;
}

export function createField(): Field {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0052);

  scene.add(createSky());
  scene.add(createTerrain());

  const ambient = new THREE.AmbientLight(0xc5ccd4, 1.55);
  const hemi = new THREE.HemisphereLight(0xb7c1cb, 0x3a4a2a, 0.85);
  const sun = new THREE.DirectionalLight(0xe7ebf0, 2.15);
  sun.position.set(-92, 38, 26);
  const fill = new THREE.DirectionalLight(0xb7bfc8, 1.05);
  fill.position.set(54, 26, -34);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.00018;
  sun.shadow.normalBias = 0.08;
  sun.shadow.radius = 2.5;
  const cam = sun.shadow.camera as THREE.OrthographicCamera;
  cam.left = -120;
  cam.right = 120;
  cam.top = 120;
  cam.bottom = -120;
  cam.near = 8;
  cam.far = 280;
  sun.target.position.set(0, 6, 0);
  scene.add(ambient, hemi, sun, sun.target, fill);

  const rand = mulberry32(19);
  const trees = createTrees(rand);
  const rocks = createRocks(rand);
  scene.add(trees.trunks, trees.low, trees.mid, trees.high, rocks);

  BUNKER.y = hillHeight(BUNKER.x, BUNKER.z);
  TOWER.y = hillHeight(TOWER.x, TOWER.z);
  scene.add(createBunker(BUNKER));
  scene.add(createWatchtower(TOWER));

  const dust = createDust(rand);
  scene.add(dust.points);

  return {
    scene,
    update: (time: number) => dust.update(time),
  };
}

function createSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color(0x667482) },
      uHorizon: { value: new THREE.Color(FOG_COLOR) },
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
        vec3 col = mix(uHorizon, uZenith, smoothstep(0.02, 0.62, up));
        float cloud = noise(dir.xz / max(dir.y + 0.22, 0.18) * 1.7);
        col = mix(col, col * vec3(0.9, 0.92, 0.94), smoothstep(0.48, 0.74, cloud) * smoothstep(0.05, 0.4, up) * 0.28);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(520, 32, 18), material);
  mesh.frustumCulled = false;
  mesh.name = 'sky';
  return mesh;
}

function createTerrain(): THREE.Mesh {
  const size = 440;
  const segs = 200;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, hillHeight(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();
  const normal = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const olive = new THREE.Color(0x556e48);
  const dry = new THREE.Color(0x627848);
  const moss = new THREE.Color(0x4c6438);
  const mud = new THREE.Color(0x6e5c40);
  const stone = new THREE.Color(0x6e6a60);
  const tint = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = pos.getY(i);
    const slope = 1 - normal.getY(i);
    const patch = blot(x * 0.045, z * 0.045);
    tint.copy(olive).lerp(moss, patch * 0.45);
    tint.lerp(dry, THREE.MathUtils.smoothstep(h, 10, 18) * (1 - THREE.MathUtils.smoothstep(slope, 0.08, 0.3)) * 0.4);
    const hollow = 1 - THREE.MathUtils.smoothstep(h, -6, 0.5);
    tint.lerp(mud, hollow * 0.5);
    const track = Math.abs(z - 14 - Math.sin(x * 0.09) * 5 - (x + 18) * 0.08);
    tint.lerp(mud, (1 - THREE.MathUtils.smoothstep(track, 0.8, 3.2)) * 0.42);
    tint.lerp(stone, THREE.MathUtils.smoothstep(slope, 0.46, 0.75));
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true, dithering: true }),
  );
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

function shadeAll(meshes: THREE.InstancedMesh[]): void {
  for (const mesh of meshes) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

function createTrees(rand: () => number): {
  trunks: THREE.InstancedMesh;
  low: THREE.InstancedMesh;
  mid: THREE.InstancedMesh;
  high: THREE.InstancedMesh;
} {
  const count = 160;
  const trunkGeo = new THREE.CylinderGeometry(0.11, 0.22, 1.7, 5);
  trunkGeo.translate(0, 0.85, 0);
  const lowGeo = new THREE.ConeGeometry(1.35, 2.5, 6);
  lowGeo.translate(0, 2.15, 0);
  const midGeo = new THREE.ConeGeometry(1.0, 2.15, 6);
  midGeo.translate(0, 3.25, 0);
  const highGeo = new THREE.ConeGeometry(0.62, 1.7, 5);
  highGeo.translate(0, 4.35, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, lambert(0x5a4c3c), count);
  const low = new THREE.InstancedMesh(lowGeo, lambert(0x314222), count);
  const midMesh = new THREE.InstancedMesh(midGeo, lambert(0x3c5228), count);
  const high = new THREE.InstancedMesh(highGeo, lambert(0x4a6430), count);
  const dummy = new THREE.Object3D();
  const leaf = new THREE.Color();
  const centers: Array<[number, number]> = [
    [-10, 34], [16, 38], [-30, 26], [4, 22], [-6, 6], [30, 2], [-26, -8], [6, -24], [34, -30],
  ];
  let placed = 0;
  for (let cluster = 0; cluster < 16 && placed < count; cluster++) {
    const fixed = centers[cluster];
    let cx: number;
    let cz: number;
    if (fixed) {
      cx = fixed[0];
      cz = fixed[1];
    } else {
      cx = 0;
      cz = 0;
      let best = -999;
      for (let attempt = 0; attempt < 5; attempt++) {
        const x = (rand() - 0.5) * 280;
        const z = (rand() - 0.5) * 280;
        const h = rawHeight(x, z);
        if (h > best) {
          best = h;
          cx = x;
          cz = z;
        }
      }
    }
    const members = 7 + Math.floor(rand() * 8);
    for (let i = 0; i < members && placed < count; i++) {
      const x = cx + (rand() + rand() - 1) * 7.5;
      const z = cz + (rand() + rand() - 1) * 7.5;
      if (Math.hypot(x - BUNKER.x, z - BUNKER.z) < 13) continue;
      if (Math.hypot(x - TOWER.x, z - TOWER.z) < 8) continue;
      const narrow = rand() > 0.55 ? 0.72 : 1;
      const scale = narrow * (0.85 + rand() * 0.95);
      dummy.position.set(x, hillHeight(x, z) - 0.12, z);
      dummy.rotation.set((rand() - 0.5) * 0.05, rand() * Math.PI * 2, (rand() - 0.5) * 0.05);
      dummy.scale.set(scale, scale * (0.82 + rand() * 0.36), scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(placed, dummy.matrix);
      low.setMatrixAt(placed, dummy.matrix);
      midMesh.setMatrixAt(placed, dummy.matrix);
      high.setMatrixAt(placed, dummy.matrix);
      leaf.setRGB(0.82 + rand() * 0.18, 0.86 + rand() * 0.14, 0.78 + rand() * 0.16);
      low.setColorAt(placed, leaf);
      midMesh.setColorAt(placed, leaf);
      leaf.offsetHSL(0, 0, 0.03);
      high.setColorAt(placed, leaf);
      placed++;
    }
  }
  trunks.count = placed;
  low.count = placed;
  midMesh.count = placed;
  high.count = placed;
  shadeAll([trunks, low, midMesh, high]);
  trunks.name = 'trunks';
  return { trunks, low, mid: midMesh, high };
}

function createRocks(rand: () => number): THREE.InstancedMesh {
  const count = 80;
  const geo = new THREE.DodecahedronGeometry(0.7, 0);
  const mesh = new THREE.InstancedMesh(geo, lambert(0x8d877c), count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const centers: Array<[number, number]> = [
    [-8, 28], [-24, 18], [2, 30], [28, -6], [16, -12], [-14, 8],
  ];
  let placed = 0;
  for (let cluster = 0; cluster < 14 && placed < count; cluster++) {
    const fixed = centers[cluster];
    const cx = fixed ? fixed[0] : (rand() - 0.5) * 260;
    const cz = fixed ? fixed[1] : (rand() - 0.5) * 260;
    const members = 3 + Math.floor(rand() * 5);
    for (let i = 0; i < members && placed < count; i++) {
      const x = cx + (rand() - 0.5) * 6;
      const z = cz + (rand() - 0.5) * 6;
      if (Math.hypot(x - BUNKER.x, z - BUNKER.z) < 7) continue;
      const s = 0.55 + rand() * 1.55;
      dummy.position.set(x, hillHeight(x, z) + s * 0.12, z);
      dummy.rotation.set(rand() * 2, rand() * 4, rand() * 2);
      dummy.scale.set(s * (0.75 + rand() * 0.6), s * (0.42 + rand() * 0.25), s);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      color.setRGB(0.72 + rand() * 0.22, 0.7 + rand() * 0.18, 0.64 + rand() * 0.16);
      mesh.setColorAt(placed, color);
      placed++;
    }
  }
  mesh.count = placed;
  shadeAll([mesh]);
  mesh.name = 'rocks';
  return mesh;
}

function lambert(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, dithering: true });
}

function createBunker(origin: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  const concrete = lambert(0xa39e94);
  const stained = lambert(0x847f76);
  const dark = lambert(0x3c4442);
  const sand = lambert(0x6d5e46);
  const wood = lambert(0x5c5042);
  const body = new THREE.Mesh(new THREE.BoxGeometry(13.5, 3.5, 8.2), concrete);
  body.position.set(0, 1.75, 0);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.55, 9.1), stained);
  roof.position.set(0, 3.65, 0);
  const slit = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.42, 0.35), dark);
  slit.position.set(-1.2, 2.15, 4.2);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.15, 0.28), dark);
  door.position.set(4.6, 1.08, 4.15);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.28, 0.4), stained);
  lintel.position.set(4.6, 2.25, 4.25);
  group.add(body, roof, slit, door, lintel);
  for (let i = 0; i < 14; i++) {
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.42, 6, 5), sand);
    bag.scale.set(1.4, 0.7, 0.95);
    bag.position.set(-6.2 + (i % 7) * 1.05, i < 7 ? 0.32 : 0.82, 5.05);
    group.add(bag);
  }
  for (const [x, z] of [[-5.4, 3.4], [-4.3, 3.7], [5.8, 2.6]] as Array<[number, number]>) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.72, 0.95), wood);
    crate.position.set(x, 0.36, z);
    crate.rotation.y = x;
    group.add(crate);
  }
  const berm = new THREE.Mesh(new THREE.SphereGeometry(3.2, 8, 6), lambert(0x5a4e3a));
  berm.scale.set(2.3, 0.28, 1.1);
  berm.position.set(0, 0.15, 6.4);
  group.add(berm);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(11, 18), lambert(0x5c513e));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.05;
  pad.receiveShadow = true;
  group.add(pad);
  group.position.copy(origin);
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  group.name = 'bunker';
  return group;
}

function addBrace(group: THREE.Group, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, material: THREE.Material): void {
  const start = new THREE.Vector3(x1, y1, z1);
  const end = new THREE.Vector3(x2, y2, z2);
  const length = start.distanceTo(end);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, length, 0.1), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
  group.add(mesh);
}

function createWatchtower(origin: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  const wood = lambert(0x65594a);
  const dark = lambert(0x4a4338);
  const metal = lambert(0x72767a);
  const posts: Array<[number, number]> = [[-1.35, -1.35], [1.35, -1.35], [-1.35, 1.35], [1.35, 1.35]];
  const height = 14.5;
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
    for (const y0 of [1.2, 6.4]) {
      addBrace(group, a[0], y0, a[1], b[0], y0 + 4.4, b[1], dark);
      addBrace(group, a[0], y0 + 4.4, a[1], b[0], y0, b[1], dark);
    }
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.18, 3.5), wood);
  deck.position.y = 12.35;
  group.add(deck);
  for (const z of [-1.7, 1.7]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.08), dark);
    rail.position.set(0, 13.15, z);
    group.add(rail);
  }
  for (const x of [-1.7, 1.7]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 3.4), dark);
    rail.position.set(x, 13.15, 0);
    group.add(rail);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.55, 1.35, 4), metal);
  roof.position.y = 14.15;
  roof.rotation.y = Math.PI / 4;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 2.4, 5), metal);
  mast.position.y = 15.5;
  group.add(roof, mast);
  for (let i = 0; i < 10; i++) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.06), dark);
    rung.position.set(0, 0.7 + i * 1.15, 1.55);
    group.add(rung);
  }
  const railSide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 12.2, 0.06), dark);
  railSide.position.set(-0.22, 6.2, 1.55);
  const railSideB = railSide.clone();
  railSideB.position.x = 0.22;
  group.add(railSide, railSideB);
  group.position.copy(origin);
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  group.name = 'watchtower';
  return group;
}

function createDust(rand: () => number): { points: THREE.Points; update: (time: number) => void } {
  const count = 520;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const x = (rand() - 0.5) * 220;
    const z = (rand() - 0.5) * 220;
    positions[i * 3] = x;
    positions[i * 3 + 1] = hillHeight(x, z) + 0.6 + rand() * 7;
    positions[i * 3 + 2] = z;
    seeds[i] = rand() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xc8c4b8,
    size: 2.6,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, material);
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
        let x = attr.getX(i) + dt * 1.7;
        if (x > 110) x -= 220;
        attr.setX(i, x);
        const base = positions[i * 3 + 1];
        attr.setY(i, base + Math.sin(time * 0.4 + seeds[i]) * 0.18);
      }
      attr.needsUpdate = true;
    },
  };
}
