import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoToneMapping,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  SRGBColorSpace,
  Scene,
  UnsignedByteType,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  type Texture,
  type ToneMapping,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LIGHT_DIR } from './look';
import { mulberry32 } from './noise';

export type BakedSprite = {
  map: Texture;
  width: number;
  height: number;
  worldHeight: number;
};

export type FoliageSprites = {
  trees: BakedSprite[];
  grass: BakedSprite;
  wheat: BakedSprite;
};

const AZIMUTH = -2.25;
const POLAR = 0.96;
const VIEW = new Vector3(
  Math.sin(AZIMUTH) * Math.sin(POLAR),
  Math.cos(POLAR),
  Math.cos(AZIMUTH) * Math.sin(POLAR),
).normalize();

const BILLBOARD = `
vec4 mvPosition;
#ifdef USE_INSTANCING
  vec3 spritePos = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float spriteWidth = length((modelMatrix * vec4(instanceMatrix[0].xyz, 0.0)).xyz);
  float spriteHeight = length((modelMatrix * vec4(instanceMatrix[1].xyz, 0.0)).xyz);
#else
  vec3 spritePos = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float spriteWidth = length(modelMatrix[0].xyz);
  float spriteHeight = length(modelMatrix[1].xyz);
#endif
vec3 cameraRight = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
vec3 cameraUp = normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));
vec3 worldPos = spritePos + cameraRight * transformed.x * spriteWidth + cameraUp * transformed.y * spriteHeight;
mvPosition = viewMatrix * vec4(worldPos, 1.0);
gl_Position = projectionMatrix * mvPosition;
`;

export function spriteQuad(): BufferGeometry {
  const geometry = new PlaneGeometry(1, 1);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

export function billboardMaterial(map: Texture, color = 0xffffff): MeshBasicMaterial {
  const material = new MeshBasicMaterial({
    map,
    color,
    alphaTest: 0.28,
    side: DoubleSide,
    depthWrite: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', BILLBOARD);
  };
  return material;
}

/** Render a lit image of a subject from the game camera, then box-filter it down to a sprite. */
export function renderToSprite(
  renderer: WebGLRenderer,
  subject: Object3D,
  resolution = 1024,
  output = 256,
): BakedSprite {
  const scene = new Scene();
  scene.add(subject);
  subject.updateWorldMatrix(true, true);
  const bounds = new Box3().setFromObject(subject);
  const center = bounds.getCenter(new Vector3());
  const worldHeight = Math.max(0.2, bounds.max.y - bounds.min.y);

  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.05, 50);
  const framed = frameSubject(camera, bounds, center);

  const key = new DirectionalLight(0xfff1dd, 1.45);
  key.position.copy(center).addScaledVector(LIGHT_DIR, -10);
  key.target.position.copy(center);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.015;
  key.shadow.camera.near = 0.4;
  key.shadow.camera.far = 28;
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -5;
  scene.add(key);
  scene.add(key.target);
  scene.add(new HemisphereLight(0xc5d8ee, 0x6d7a42, 0.42));
  const fill = new DirectionalLight(0xd5e4f4, 0.35);
  fill.position.copy(center).addScaledVector(LIGHT_DIR, 8);
  scene.add(fill);

  const target = new WebGLRenderTarget(resolution, resolution, {
    format: RGBAFormat,
    type: UnsignedByteType,
  });
  target.texture.colorSpace = SRGBColorSpace;
  const previousTarget = renderer.getRenderTarget();
  const previousColor = new Color();
  renderer.getClearColor(previousColor);
  const previousAlpha = renderer.getClearAlpha();
  const previousShadows = renderer.shadowMap.enabled;
  const previousAutoClear = renderer.autoClear;
  const previousTone = renderer.toneMapping;
  const previousExposure = renderer.toneMappingExposure;

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.needsUpdate = true;
  renderer.autoClear = true;
  renderer.toneMapping = NoToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);

  const pixels = new Uint8Array(resolution * resolution * 4);
  renderer.readRenderTargetPixels(target, 0, 0, resolution, resolution, pixels);
  renderer.setRenderTarget(previousTarget);
  renderer.setClearColor(previousColor, previousAlpha);
  renderer.shadowMap.enabled = previousShadows;
  renderer.shadowMap.needsUpdate = true;
  renderer.autoClear = previousAutoClear;
  renderer.toneMapping = previousTone as ToneMapping;
  renderer.toneMappingExposure = previousExposure;
  target.dispose();

  const flipped = new Uint8Array(pixels.length);
  const row = resolution * 4;
  for (let y = 0; y < resolution; y += 1) {
    flipped.set(pixels.subarray((resolution - 1 - y) * row, (resolution - y) * row), y * row);
  }
  const small = boxDownscale(flipped, resolution, output);
  const canvas = document.createElement('canvas');
  canvas.width = output;
  canvas.height = output;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('sprite canvas');
  context.putImageData(new ImageData(new Uint8ClampedArray(small), output, output), 0, 0);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  map.needsUpdate = true;
  return { map, width: framed.width, height: framed.height, worldHeight };
}

export function bakeFoliageSprites(renderer: WebGLRenderer): FoliageSprites {
  return {
    trees: [
      renderToSprite(renderer, buildTreeImage(3), 768, 384),
      renderToSprite(renderer, buildTreeImage(19), 768, 384),
    ],
    grass: renderToSprite(renderer, buildTuft('grass', 5), 512, 128),
    wheat: renderToSprite(renderer, buildTuft('wheat', 9), 512, 256),
  };
}

function frameSubject(camera: OrthographicCamera, box: Box3, center: Vector3): { width: number; height: number } {
  camera.position.copy(center).addScaledVector(VIEW, 16);
  camera.up.set(0, 1, 0);
  camera.lookAt(center);
  camera.updateMatrixWorld();
  const inverse = camera.matrixWorldInverse;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const corner = new Vector3();
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        corner.set(x, y, z).applyMatrix4(inverse);
        minX = Math.min(minX, corner.x);
        maxX = Math.max(maxX, corner.x);
        minY = Math.min(minY, corner.y);
        maxY = Math.max(maxY, corner.y);
        minZ = Math.min(minZ, corner.z);
        maxZ = Math.max(maxZ, corner.z);
      }
    }
  }
  const padX = (maxX - minX) * 0.06 + 0.04;
  const padY = (maxY - minY) * 0.06 + 0.04;
  camera.left = minX - padX;
  camera.right = maxX + padX;
  camera.bottom = minY - padY * 0.2;
  camera.top = maxY + padY;
  camera.near = Math.max(0.05, -maxZ - 1.5);
  camera.far = Math.max(camera.near + 1, -minZ + 2);
  camera.updateProjectionMatrix();
  return { width: camera.right - camera.left, height: camera.top - camera.bottom };
}

function boxDownscale(pixels: Uint8Array, source: number, target: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(target * target * 4);
  const block = source / target;
  for (let y = 0; y < target; y += 1) {
    for (let x = 0; x < target; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let weight = 0;
      const x0 = Math.floor(x * block);
      const y0 = Math.floor(y * block);
      const x1 = Math.min(source, Math.floor((x + 1) * block));
      const y1 = Math.min(source, Math.floor((y + 1) * block));
      for (let py = y0; py < y1; py += 1) {
        for (let px = x0; px < x1; px += 1) {
          const index = (py * source + px) * 4;
          const alpha = pixels[index + 3] / 255;
          r += pixels[index] * alpha;
          g += pixels[index + 1] * alpha;
          b += pixels[index + 2] * alpha;
          a += alpha;
          weight += 1;
        }
      }
      const outIndex = (y * target + x) * 4;
      out[outIndex] = a > 0 ? r / a : 0;
      out[outIndex + 1] = a > 0 ? g / a : 0;
      out[outIndex + 2] = a > 0 ? b / a : 0;
      out[outIndex + 3] = Math.min(255, (a / weight) * 255);
    }
  }
  return out;
}

function buildTreeImage(seed: number): Group {
  const rand = mulberry32(seed);
  const group = new Group();
  const trunk = new Mesh(
    new CylinderGeometry(0.08, 0.2, 1.7, 7),
    new MeshStandardMaterial({ color: 0x6a4630, roughness: 1 }),
  );
  trunk.position.y = 0.85;
  trunk.castShadow = true;
  group.add(trunk);

  const clusters: Array<[number, number, number, number, number]> = [
    [0, 2.45, 0, 1.15, 42],
    [0.72, 2.05, 0.28, 0.78, 22],
    [-0.66, 1.95, 0.14, 0.74, 22],
    [0.1, 3.05, -0.22, 0.58, 16],
    [-0.2, 1.55, 0.55, 0.5, 12],
    [0.34, 1.48, -0.5, 0.48, 12],
    [0.05, 2.2, 0.7, 0.42, 10],
  ];
  const parts: BufferGeometry[] = [];
  for (const [cx, cy, cz, spread, count] of clusters) {
    for (let i = 0; i < count; i += 1) {
      const ox = (rand() - 0.5) * spread;
      const oy = (rand() - 0.5) * spread * 0.7;
      const oz = (rand() - 0.5) * spread;
      const edge = Math.min(1, Math.hypot(ox, oy, oz) / (spread * 0.55));
      const color = new Color();
      const yellow = rand() > 0.84;
      color.setHSL(
        yellow ? 0.15 : 0.25 + rand() * 0.05,
        0.4 + rand() * 0.18,
        0.12 + edge * 0.28 + rand() * 0.06,
      );
      const blob = new IcosahedronGeometry(0.09 + rand() * 0.11, 0);
      blob.scale(1, 0.66 + rand() * 0.28, 1);
      blob.translate(cx + ox, cy + oy, cz + oz);
      parts.push(paint(blob, color));
    }
  }
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('tree foliage');
  const leaves = new Mesh(merged, new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
  }));
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  group.add(leaves);
  return group;
}

function buildTuft(kind: 'grass' | 'wheat', seed: number): Group {
  const rand = mulberry32(seed);
  const group = new Group();
  const parts: BufferGeometry[] = [];
  const count = kind === 'wheat' ? 22 : 16;
  for (let i = 0; i < count; i += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = rand() * (kind === 'wheat' ? 0.28 : 0.16);
    const height = kind === 'wheat' ? 0.9 + rand() * 0.5 : 0.16 + rand() * 0.22;
    const width = kind === 'wheat' ? 0.04 + rand() * 0.02 : 0.1 + rand() * 0.06;
    const color = new Color();
    if (kind === 'wheat') color.setHSL(0.12 + rand() * 0.03, 0.55, 0.32 + rand() * 0.22);
    else color.setHSL(0.26 + rand() * 0.08, 0.45, 0.22 + rand() * 0.2);
    const blade = new PlaneGeometry(width, height);
    blade.translate(0, height * 0.5, 0);
    blade.rotateY(angle + Math.PI / 2);
    blade.rotateX((rand() - 0.5) * 0.5);
    blade.translate(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    parts.push(paint(blade, color));
    if (kind === 'wheat' && i % 2 === 0) {
      const head = new IcosahedronGeometry(0.045 + rand() * 0.02, 0);
      head.scale(1, 1.8, 1);
      head.translate(Math.cos(angle) * radius, height * 0.92, Math.sin(angle) * radius);
      const headColor = color.clone().offsetHSL(0, 0.05, 0.12);
      parts.push(paint(head, headColor));
    }
  }
  if (kind === 'grass') {
    for (let i = 0; i < 7; i += 1) {
      const angle = rand() * Math.PI * 2;
      const radius = rand() * 0.45;
      const flower = new PlaneGeometry(0.09, 0.09);
      flower.translate(Math.cos(angle) * radius, 0.22 + rand() * 0.25, Math.sin(angle) * radius);
      const color = new Color(rand() > 0.7 ? 0xc4473a : 0xf0e2a0);
      parts.push(paint(flower, color));
    }
  }
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('tuft');
  const mesh = new Mesh(merged, new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    side: DoubleSide,
  }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

function paint(geo: BufferGeometry, color: Color): BufferGeometry {
  const solid = geo.index ? geo.toNonIndexed() : geo;
  const pos = solid.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  solid.setAttribute('color', new BufferAttribute(colors, 3));
  solid.computeVertexNormals();
  return solid;
}
