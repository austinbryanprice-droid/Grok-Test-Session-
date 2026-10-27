import * as THREE from 'three';
import type { CSM } from 'three/addons/csm/CSM.js';
import { frame } from './frame';
import { MeshData, placed } from './mesh';
import { ENV, GAME, LIGHT, MAP_SIZE, TEAM } from './palette';
import { bindLit, WATER_FRAGMENT, WATER_VERTEX } from './shader';
import {
  createBrushTexture,
  createLeafTexture,
  createShoreTexture,
  createSoftDisc,
  createTerrainTextures,
  createTreeBillboard,
  createWaveNormal,
} from './textures';

export const WATER_Y = -0.05;
const POND = { x: 8, z: -10, r: 7.5 };

export function terrainHeight(x: number, z: number): number {
  let h = Math.sin(x * 0.05) * Math.cos(z * 0.038) * 1.35 + Math.sin(x * 0.12 + z * 0.09) * 0.28;
  const pond = Math.hypot(x - POND.x, z - POND.z);
  if (pond < POND.r + 3) {
    const bowl = pond < POND.r ? (1 - pond / POND.r) : 0;
    h -= bowl * bowl * 1.35;
  }
  for (const pad of PADS) {
    const d = Math.hypot(x - pad.x, z - pad.z);
    if (d >= pad.r) continue;
    const w = smooth(d, pad.r * 0.45, pad.r);
    h = h * w + pad.y * (1 - w);
  }
  return h;
}

const PADS: { x: number; z: number; r: number; y: number }[] = [];

function rememberPad(x: number, z: number, r: number): number {
  const y = Math.sin(x * 0.05) * Math.cos(z * 0.038) * 1.35 + Math.sin(x * 0.12 + z * 0.09) * 0.28;
  PADS.push({ x, z, r, y });
  return y;
}

function smooth(value: number, a: number, b: number): number {
  const t = Math.min(1, Math.max(0, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export interface Scenery {
  update: (time: number) => void;
  focus: THREE.Vector3;
}

export function createScenery(scene: THREE.Scene, csm: CSM | null, foliage: number): Scenery {
  scene.background = new THREE.Color(LIGHT.fog);
  scene.fog = new THREE.Fog(LIGHT.fog, 150, 240);
  scene.add(createSky());

  const pads = [
    [-14, 6, 7],
    [-20, -8, 9],
    [-2, -16, 8],
    [16, 2, 7],
    [18, -14, 6],
    [28, 8, 6],
    [5, -12, 6],
  ] as const;
  for (const [x, z, r] of pads) rememberPad(x, z, r);

  const terrainTex = createTerrainTextures(terrainHeight);
  const brush = createBrushTexture();
  const blue = litMaterial(brush, new THREE.Color(TEAM.blue), csm, 'lit');
  const red = litMaterial(brush, new THREE.Color(TEAM.red), csm, 'lit');
  const flagBlue = litMaterial(brush, new THREE.Color(TEAM.blue), csm, 'flag');
  const flagRed = litMaterial(brush, new THREE.Color(TEAM.red), csm, 'flag');

  addTerrain(scene, csm, terrainTex);
  addWater(scene);
  const wheel = addBuildings(scene, blue, red, flagBlue, flagRed);
  addTrees(scene, csm, foliage);
  addClutter(scene, csm, foliage);
  const fire = addFire(scene);
  return {
    focus: new THREE.Vector3(-6, terrainHeight(-6, 0), 0),
    update: (time: number) => {
      frame.uCloudOffset.value.x = time * 0.004;
      frame.uCloudOffset.value.y = time * 0.0015;
      wheel.rotation.x = time * 0.7;
      const flicker = 0.85 + Math.sin(time * 11) * 0.08 + Math.sin(time * 17) * 0.05;
      fire.scale.setScalar(flicker);
    },
  };
}

function litMaterial(map: THREE.Texture, team: THREE.Color, csm: CSM | null, kind: 'lit' | 'flag'): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map,
    roughness: 0.86,
    metalness: 0,
    vertexColors: true,
    side: kind === 'flag' ? THREE.DoubleSide : THREE.FrontSide,
  });
  bindLit(material, { kind, team, csm });
  return material;
}

function createSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(LIGHT.skyTop) },
      uHorizon: { value: new THREE.Color(LIGHT.skyHorizon) },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vDir = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      void main() {
        float up = clamp(normalize(vDir).y, 0.0, 1.0);
        vec3 color = mix(uHorizon, uTop, smoothstep(0.0, 0.55, up));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 24, 12), material);
  sky.frustumCulled = false;
  sky.name = 'sky';
  return sky;
}

function addTerrain(scene: THREE.Scene, csm: CSM | null, textures: ReturnType<typeof createTerrainTextures>): void {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0 });
  material.dithering = true;
  bindLit(material, { kind: 'terrain', csm, terrain: textures });
  const half = MAP_SIZE / 2;
  for (const [cx, cz] of [[-half / 2, -half / 2], [half / 2, -half / 2], [-half / 2, half / 2], [half / 2, half / 2]] as const) {
    const geo = new THREE.PlaneGeometry(half, half, 36, 36);
    geo.rotateX(-Math.PI / 2);
    geo.translate(cx, 0, cz);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    scene.add(mesh);
  }
}

function addWater(scene: THREE.Scene): void {
  const span = 30;
  const origin = new THREE.Vector2(POND.x - span / 2, POND.z - span / 2);
  const shore = createShoreTexture(origin.x, origin.y, span, WATER_Y, terrainHeight);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tShore: { value: shore },
      tWave: { value: createWaveNormal() },
      uTime: frame.uTime,
      uSunTravel: frame.uSunTravel,
      uShallow: { value: new THREE.Color(ENV.waterShallow) },
      uDeep: { value: new THREE.Color(ENV.waterDeep) },
      uSkyTop: { value: new THREE.Color(LIGHT.skyTop) },
      uSkyHorizon: { value: new THREE.Color(LIGHT.skyHorizon) },
      uShoreOrigin: { value: origin },
      uShoreSpan: { value: span },
      fogColor: { value: new THREE.Color(LIGHT.fog) },
      fogNear: { value: 150 },
      fogFar: { value: 240 },
      fogDensity: { value: 0 },
    },
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    fog: true,
  });
  const geo = new THREE.PlaneGeometry(span, span, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(POND.x, WATER_Y + 0.02, POND.z);
  mesh.receiveShadow = false;
  scene.add(mesh);
}

function addBuildings(
  scene: THREE.Scene,
  blue: THREE.Material,
  red: THREE.Material,
  flagBlue: THREE.Material,
  flagRed: THREE.Material,
): THREE.Object3D {
  const wheel = new THREE.Group();
  const specs: [number, number, THREE.Material, THREE.Material, string][] = [
    [-14, 6, blue, flagBlue, 'house'],
    [-20, -8, blue, flagBlue, 'barracks'],
    [-2, -16, blue, flagBlue, 'lumber'],
    [16, 2, blue, flagBlue, 'mill'],
    [18, -14, red, flagRed, 'foundation'],
    [28, 8, red, flagRed, 'frame'],
    [5, -12, red, flagRed, 'damaged'],
  ];
  for (const [x, z, material, flagMaterial, kind] of specs) {
    const y = terrainHeight(x, z);
    const data = new MeshData();
    if (kind === 'house') buildHouse(data, 0, 0, 0, false);
    if (kind === 'barracks') buildBarracks(data);
    if (kind === 'lumber') buildLumber(data);
    if (kind === 'mill') buildMill(data, wheel);
    if (kind === 'foundation') buildFoundation(data);
    if (kind === 'frame') buildFrame(data);
    if (kind === 'damaged') buildHouse(data, 0, 0, 0, true);
    const mesh = new THREE.Mesh(data.toGeometry(), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const flag = new MeshData();
    flag.addBox(placed(3.4, 3.5, 2.5), [1.7, 1.05, 0.08], new THREE.Color(0.82, 0.8, 0.72), 1, 0.75, 0, 1);
    const flagMesh = new THREE.Mesh(flag.toGeometry(), flagMaterial);
    flagMesh.position.set(x, y, z);
    flagMesh.castShadow = false;
    flagMesh.receiveShadow = false;
    scene.add(flagMesh);
    const pole = new MeshData();
    pole.addCylinder(placed(2.5, 0, 2.5), 0.07, 0.09, 4.1, 6, new THREE.Color(ENV.wood), 0, 0.84, 0);
    const poleMesh = new THREE.Mesh(pole.toGeometry(), material);
    poleMesh.position.set(x, y, z);
    poleMesh.castShadow = true;
    scene.add(poleMesh);
  }
  wheel.position.y += terrainHeight(16, 2);
  scene.add(wheel);
  return wheel.children[0] ?? wheel;
}

function buildHouse(data: MeshData, x: number, y: number, z: number, damaged: boolean): void {
  const plaster = new THREE.Color(ENV.plaster);
  const timber = new THREE.Color(ENV.wood);
  const thatch = new THREE.Color(ENV.thatch);
  const stone = new THREE.Color(ENV.stone);
  data.addBox(placed(x, y + 0.2, z), [7.2, 0.4, 5.4], stone, 0, 0.92, 0);
  data.addBox(placed(x, y + 2.2, z), [6.4, 3.6, 4.6], plaster, 0, 0.88, 0);
  data.addBox(placed(x, y + 2.3, z + 2.28), [1.3, 2.86, 0.16], timber, 0, 0.84, 0);
  data.addBox(placed(x - 1.8, y + 2.6, z + 2.3), [0.9, 1.1, 0.12], new THREE.Color(0xc5d5e4), 0, 0.2, 0);
  data.addBox(placed(x + 1.8, y + 2.6, z + 2.3), [0.9, 1.1, 0.12], new THREE.Color(0xc5d5e4), 0, 0.2, 0);
  data.addBox(placed(x, y + 4.55, z), [7.4, 0.28, 5.6], timber, 0, 0.86, 0);
  if (!damaged) {
    data.addBox(placed(x, y + 5.35, z - 0.7, 0, 0.55, 0), [6.6, 0.22, 3.3], thatch, 0, 0.96, 0);
    data.addBox(placed(x, y + 5.35, z + 0.7, 0, -0.55, 0), [6.6, 0.22, 3.3], thatch, 0, 0.96, 0);
  } else {
    data.addBox(placed(x - 0.4, y + 5.1, z - 0.6, 0.2, 0.4, 0.5), [4.2, 0.2, 2.4], thatch, 0, 0.96, 0);
  }
  data.addBox(placed(x + 2.4, y + 0.45, z + 2.6), [0.7, 0.7, 0.7], timber, 0, 0.9, 0);
  data.addBox(placed(x + 3.1, y + 0.55, z + 2.2), [0.55, 0.9, 0.55], timber, 0, 0.9, 0);
  data.addBox(placed(x - 2.6, y + 0.35, z + 2.5), [1.1, 0.45, 0.45], new THREE.Color(ENV.woodLight), 0, 0.88, 0);
  data.addBox(placed(x - 2.2, y + 1.5, z + 2.32), [1.2, 0.35, 0.35], new THREE.Color(ENV.foliageB), 0, 0.8, 0);
  data.addBox(placed(x + 2.2, y + 1.5, z + 2.32), [1.2, 0.35, 0.35], new THREE.Color(ENV.flowerYellow), 0, 0.8, 0);
  data.addBox(placed(x, y + 3.4, z - 2.4), [0.8, 1.1, 0.8], stone, 0, 0.9, 0);
}

function buildBarracks(data: MeshData): void {
  const stone = new THREE.Color(ENV.stone);
  const timber = new THREE.Color(ENV.wood);
  const plaster = new THREE.Color(ENV.plaster);
  data.addBox(placed(0, 0.25, 0), [10, 0.5, 7], stone, 0, 0.92, 0);
  data.addBox(placed(0, 2.4, -0.4), [8.2, 3.8, 5.2], plaster, 0, 0.88, 0);
  data.addBox(placed(0, 4.7, -0.4), [8.8, 0.35, 5.8], timber, 0, 0.86, 0);
  data.addBox(placed(0, 5.5, -1.2, 0, 0.5, 0), [8.4, 0.22, 3.4], new THREE.Color(ENV.clay), 0, 0.84, 0);
  data.addBox(placed(0, 5.5, 0.5, 0, -0.5, 0), [8.4, 0.22, 3.4], new THREE.Color(ENV.clay), 0, 0.84, 0);
  data.addBox(placed(0, 0.15, 4.2), [8, 0.2, 3.2], new THREE.Color(ENV.dirt), 0, 0.95, 0);
  data.addBox(placed(-3.2, 1.3, 3.6), [0.15, 2.2, 0.15], timber, 0, 0.86, 0);
  data.addBox(placed(-1.6, 1.3, 3.6), [0.15, 2.2, 0.15], timber, 0, 0.86, 0);
  data.addBox(placed(-2.4, 2.2, 3.6), [1.8, 0.12, 0.4], timber, 0, 0.86, 0);
  data.addBox(placed(-2.4, 1.5, 3.75), [0.08, 1.5, 0.08], new THREE.Color(ENV.steel), 0, 0.4, 0.9);
  data.addBox(placed(3.2, 0.45, 3.4), [0.8, 0.7, 0.8], timber, 0, 0.9, 0);
  data.addBox(placed(-4.6, 0.7, 1.2), [0.4, 1.2, 2.4], timber, 0, 0.88, 0);
}

function buildLumber(data: MeshData): void {
  const timber = new THREE.Color(ENV.wood);
  const light = new THREE.Color(ENV.woodLight);
  data.addBox(placed(0, 1.6, 0), [5.5, 2.6, 4.2], timber, 0, 0.86, 0);
  data.addBox(placed(0, 3.3, 0), [6.2, 0.25, 4.8], light, 0, 0.88, 0);
  data.addBox(placed(0, 3.9, -0.5, 0, 0.45, 0), [5.8, 0.18, 2.8], new THREE.Color(ENV.thatch), 0, 0.95, 0);
  data.addBox(placed(0, 3.9, 0.6, 0, -0.45, 0), [5.8, 0.18, 2.8], new THREE.Color(ENV.thatch), 0, 0.95, 0);
  for (let i = 0; i < 5; i++) data.addCylinder(placed(3.2, 0.2, -1.2 + i * 0.42, 0, 0, Math.PI / 2), 0.22, 0.22, 2.4, 6, light, 0, 0.88, 0);
  data.addBox(placed(-3.4, 0.4, 1.4), [1.2, 0.7, 1.2], timber, 0, 0.9, 0);
}

function buildMill(data: MeshData, wheel: THREE.Group): void {
  const plaster = new THREE.Color(ENV.plaster);
  const timber = new THREE.Color(ENV.wood);
  const stone = new THREE.Color(ENV.stone);
  data.addBox(placed(0, 1.8, 0), [4.6, 3.4, 4.6], stone, 0, 0.9, 0);
  data.addBox(placed(0, 4.2, 0), [5, 0.4, 5], timber, 0, 0.86, 0);
  data.addBox(placed(0, 5.3, 0), [1.2, 2.2, 1.2], plaster, 0, 0.88, 0);
  data.addBox(placed(0, 1.2, 2.5), [1.4, 2.2, 0.2], timber, 0, 0.84, 0);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.28, 12), new THREE.MeshStandardMaterial({ color: ENV.wood, roughness: 0.84 }));
  hub.rotation.z = Math.PI / 2;
  const paddles = new MeshData();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    paddles.addBox(placed(Math.cos(a) * 1.35, Math.sin(a) * 1.35, 0, 0, 0, a), [0.18, 0.7, 0.28], new THREE.Color(ENV.woodLight), 0, 0.86, 0);
  }
  const paddleMesh = new THREE.Mesh(paddles.toGeometry(), new THREE.MeshStandardMaterial({ color: ENV.woodLight, roughness: 0.86, vertexColors: true }));
  bindLit(paddleMesh.material, { kind: 'lit', team: new THREE.Color(TEAM.blue), csm: null });
  const group = new THREE.Group();
  group.add(hub, paddleMesh);
  group.position.set(16 + 2.6, 1.5, 2);
  hub.castShadow = true;
  paddleMesh.castShadow = true;
  wheel.add(group);
}

function buildFoundation(data: MeshData): void {
  const stone = new THREE.Color(ENV.stone);
  const timber = new THREE.Color(ENV.wood);
  data.addBox(placed(0, 0.15, 0), [6.4, 0.3, 4.8], stone, 0, 0.94, 0);
  for (const [x, z] of [[-2.8, -2], [2.8, -2], [-2.8, 2], [2.8, 2]] as const) {
    data.addCylinder(placed(x, 0.3, z), 0.08, 0.08, 3.2, 5, timber, 0, 0.86, 0);
  }
  data.addBox(placed(0, 3.4, 0), [6.2, 0.1, 0.1], timber, 0, 0.86, 0);
  data.addBox(placed(0, 2.2, 0), [0.08, 0.08, 4.4], timber, 0, 0.86, 0);
}

function buildFrame(data: MeshData): void {
  const timber = new THREE.Color(ENV.wood);
  const plaster = new THREE.Color(ENV.plaster);
  data.addBox(placed(0, 0.2, 0), [6.6, 0.4, 4.8], new THREE.Color(ENV.stone), 0, 0.92, 0);
  data.addBox(placed(0, 1.8, 0), [5.8, 2.8, 4.2], plaster, 0, 0.9, 0);
  data.addBox(placed(-2.9, 2.2, 0), [0.18, 3.6, 4.2], timber, 0, 0.84, 0);
  data.addBox(placed(2.9, 2.2, 0), [0.18, 3.6, 4.2], timber, 0, 0.84, 0);
  data.addBox(placed(0, 3.9, 0), [6.2, 0.16, 0.16], timber, 0, 0.84, 0);
  for (const x of [-2.2, 2.2]) data.addCylinder(placed(x, 0.4, 2.6), 0.07, 0.07, 4.2, 5, timber, 0, 0.86, 0);
  data.addBox(placed(0, 4.3, 2.6), [4.6, 0.1, 0.1], timber, 0, 0.86, 0);
}

function addTrees(scene: THREE.Scene, csm: CSM | null, foliage: number): void {
  const leaf = createLeafTexture();
  const oakMat = foliageMaterial(leaf, new THREE.Color(ENV.foliageB), csm);
  const pineMat = foliageMaterial(leaf, new THREE.Color(ENV.pine), csm);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, vertexColors: true });
  bindLit(trunkMat, { kind: 'lit', team: new THREE.Color(0xffffff), csm });
  const oak = treeGeometry([ENV.foliageA, ENV.foliageB, ENV.grassDark], 1);
  const oakLod = treeGeometry([ENV.foliageA], 0);
  const pine = treeGeometry([ENV.pine, 0x2f4a30, ENV.pine], 1);
  const pineLod = treeGeometry([ENV.pine], 0);
  const trunk = new MeshData();
  trunk.addCylinder(placed(0, 0, 0), 0.28, 0.42, 2.4, 6, new THREE.Color(ENV.wood), 0, 0.9, 0);
  const trunkGeo = trunk.toGeometry();
  const records: { x: number; z: number; pine: boolean; s: number; yaw: number }[] = [];
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed & 2147483646) / 2147483647;
  };
  for (let i = 0; i < 48; i++) {
    const x = -28 + rand() * 52;
    const z = -22 + rand() * 12;
    if (Math.hypot(x + 2, z + 16) < 9) continue;
    records.push({ x, z, pine: rand() > 0.8, s: 0.85 + rand() * 0.45, yaw: rand() * Math.PI });
  }
  const kept = records.slice(0, Math.max(4, Math.round(records.length * foliage)));
  const groups = [
    { geo: oak, mat: oakMat, pine: false, lod: 0 },
    { geo: oakLod, mat: oakMat, pine: false, lod: 1 },
    { geo: pine, mat: pineMat, pine: true, lod: 0 },
    { geo: pineLod, mat: pineMat, pine: true, lod: 1 },
  ];
  const meshes = groups.map((group) => {
    const mesh = new THREE.InstancedMesh(group.geo, group.mat, kept.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.count = 0;
    scene.add(mesh);
    return { ...group, mesh };
  });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, kept.length);
  trunks.castShadow = true;
  trunks.count = 0;
  scene.add(trunks);
  const boardGeo = new THREE.PlaneGeometry(4.2, 6.2);
  boardGeo.translate(0, 3.1, 0);
  stampSurface(boardGeo, new THREE.Color(ENV.foliageA), 0, 0.8, 0);
  const boardMat = new THREE.MeshStandardMaterial({ map: createTreeBillboard(), alphaTest: 0.5, roughness: 0.9, side: THREE.DoubleSide, vertexColors: true });
  bindLit(boardMat, { kind: 'lit', team: new THREE.Color(0xffffff), csm });
  const boards = new THREE.InstancedMesh(boardGeo, boardMat, kept.length);
  boards.castShadow = false;
  boards.count = 0;
  scene.add(boards);
  const dummy = new THREE.Object3D();
  const placeAll = (cam: THREE.Vector3) => {
    for (const entry of meshes) entry.mesh.count = 0;
    trunks.count = 0;
    boards.count = 0;
    for (const tree of kept) {
      const dist = Math.hypot(tree.x - cam.x, tree.z - cam.z);
      dummy.position.set(tree.x, terrainHeight(tree.x, tree.z), tree.z);
      dummy.rotation.set(0, tree.yaw, 0);
      dummy.scale.setScalar(tree.s);
      dummy.updateMatrix();
      if (dist > 70) {
        boards.setMatrixAt(boards.count++, dummy.matrix);
        continue;
      }
      trunks.setMatrixAt(trunks.count++, dummy.matrix);
      const lod = dist > 42 ? 1 : 0;
      const entry = meshes.find((item) => item.pine === tree.pine && item.lod === lod);
      entry?.mesh.setMatrixAt(entry.mesh.count++, dummy.matrix);
    }
    for (const entry of meshes) {
      entry.mesh.instanceMatrix.needsUpdate = true;
      entry.mesh.visible = entry.mesh.count > 0;
      enclose(entry.mesh);
    }
    trunks.instanceMatrix.needsUpdate = true;
    trunks.visible = trunks.count > 0;
    boards.instanceMatrix.needsUpdate = true;
    boards.visible = boards.count > 0;
    enclose(trunks);
    enclose(boards);
  };
  placeAll(new THREE.Vector3(0, 0, 30));
  scene.userData.updateTrees = (camera: THREE.Camera) => placeAll(camera.position);
}

function treeGeometry(colors: number[], detail: number): THREE.BufferGeometry {
  const data = new MeshData();
  colors.forEach((hex, index) => {
    const geo = new THREE.IcosahedronGeometry(1.15 - index * 0.08, detail);
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const matrix = placed((index - 1) * 0.45, 3.3 + index * 0.35, index === 2 ? -0.2 : 0.15);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const color = new THREE.Color(hex);
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    const raw = geo.toNonIndexed();
    const p = raw.attributes.position;
    const nn = raw.attributes.normal;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      n.fromBufferAttribute(nn, i).applyMatrix3(normalMatrix).normalize();
      const y01 = (v.y - minY) / (maxY - minY + 0.001);
      data.pos.push(v.x, v.y, v.z);
      data.nrm.push(n.x, n.y, n.z);
      data.uv.push(0.5, y01);
      data.col.push(color.r, color.g, color.b);
      data.mask.push(0);
      data.surf.push(0.82, 0);
      data.wind.push(y01);
    }
    void pos;
    void nrm;
  });
  return data.toGeometry();
}

function foliageMaterial(map: THREE.Texture, color: THREE.Color, csm: CSM | null): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map,
    color,
    alphaTest: 0.5,
    roughness: 0.82,
    metalness: 0,
    vertexColors: true,
    side: THREE.FrontSide,
  });
  bindLit(material, { kind: 'foliage', team: new THREE.Color(0xffffff), csm });
  return material;
}

function stampSurface(geo: THREE.BufferGeometry, color: THREE.Color, mask: number, rough: number, metal: number): void {
  const count = geo.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const masks = new Float32Array(count);
  const surf = new Float32Array(count * 2);
  const wind = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    masks[i] = mask;
    surf[i * 2] = rough;
    surf[i * 2 + 1] = metal;
    wind[i] = 0;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aTeamMask', new THREE.BufferAttribute(masks, 1));
  geo.setAttribute('aSurface', new THREE.BufferAttribute(surf, 2));
  geo.setAttribute('aWind', new THREE.BufferAttribute(wind, 1));
}

function addClutter(scene: THREE.Scene, csm: CSM | null, foliage: number): void {
  const flowerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, alphaTest: 0.4 });
  bindLit(flowerMat, { kind: 'lit', team: new THREE.Color(0xffffff), csm });
  const card = new THREE.PlaneGeometry(0.35, 0.45);
  card.translate(0, 0.22, 0);
  const colors = [ENV.flowerYellow, ENV.flowerWhite, ENV.flowerPurple, ENV.flowerRed];
  const data = new MeshData();
  let n = 0;
  for (let i = 0; i < 28 * foliage; i++) {
    const x = -30 + ((i * 17) % 50);
    const z = -8 + ((i * 13) % 24);
    if (z < -20) continue;
    const y = terrainHeight(x, z);
    const color = new THREE.Color(colors[i % colors.length]);
    data.addBox(placed(x, y + 0.2, z), [0.28, 0.36, 0.05], color, 0, 0.9, 0);
    data.addBox(placed(x, y + 0.2, z, 0, Math.PI / 2, 0), [0.28, 0.36, 0.05], color, 0, 0.9, 0);
    n++;
  }
  if (data.count) {
    const flowers = new THREE.Mesh(data.toGeometry(), flowerMat);
    flowers.castShadow = false;
    flowers.receiveShadow = false;
    scene.add(flowers);
  }
  const wheat = new MeshData();
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 10; col++) {
      const x = -30 + col * 0.7;
      const z = 10 + row * 0.55;
      wheat.addBox(placed(x, terrainHeight(x, z) + 0.35, z), [0.08, 0.7, 0.08], new THREE.Color(ENV.wheat), 0, 0.9, 0);
    }
  }
  const wheatMesh = new THREE.Mesh(wheat.toGeometry(), flowerMat);
  wheatMesh.castShadow = false;
  scene.add(wheatMesh);
  const rocks = new MeshData();
  for (let i = 0; i < 8; i++) {
    const x = -36 + i * 3.2;
    const z = -30 - (i % 3);
    rocks.addBox(placed(x, terrainHeight(x, z) + 0.25, z, 0, i, 0.2), [0.7, 0.45, 0.55], new THREE.Color(i % 2 ? ENV.rockLight : ENV.rockDark), 0, 0.92, 0);
  }
  const rockMesh = new THREE.Mesh(rocks.toGeometry(), flowerMat);
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  scene.add(rockMesh);
  void card;
}

function addFire(scene: THREE.Scene): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createSoftDisc('rgba(255,210,122,0.95)', 'rgba(255,106,30,0)'),
    color: GAME.fireCore,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  }));
  sprite.position.set(5, terrainHeight(5, -12) + 4.2, -12);
  sprite.scale.set(1.6, 2.1, 1);
  scene.add(sprite);
  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 2.4),
    new THREE.MeshBasicMaterial({
      map: createSoftDisc('rgba(255,106,30,0.55)', 'rgba(255,106,30,0)'),
      transparent: true,
      depthWrite: false,
      color: GAME.fireEdge,
    }),
  );
  decal.rotation.x = -Math.PI / 2;
  decal.position.set(5, terrainHeight(5, -12) + 0.08, -12);
  scene.add(decal);
  return sprite;
}

function enclose(mesh: THREE.InstancedMesh): void {
  if (mesh.count === 0) {
    mesh.frustumCulled = false;
    return;
  }
  const box = new THREE.Box3();
  const matrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    point.setFromMatrixPosition(matrix);
    box.expandByPoint(point);
  }
  box.expandByScalar(6);
  mesh.geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  mesh.frustumCulled = true;
}

export function updateTreeLod(scene: THREE.Scene, camera: THREE.Camera): void {
  const update = scene.userData.updateTrees as ((camera: THREE.Camera) => void) | undefined;
  update?.(camera);
}
