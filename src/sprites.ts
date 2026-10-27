import {
  AmbientLight,
  Box3,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  LinearSRGBColorSpace,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  Sphere,
  UnsignedByteType,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type FoliageSprites = {
  tree: Texture;
  grass: Texture;
  wheat: Texture;
};

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

export function billboardMaterial(map: Texture, color = 0xffffff): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    map,
    color,
    roughness: 1,
    metalness: 0,
    alphaTest: 0.18,
    side: DoubleSide,
    depthWrite: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', BILLBOARD);
  };
  return material;
}

/** Render a full color image of a subject, then box-filter it down to a sprite. */
export function renderToSprite(
  renderer: WebGLRenderer,
  subject: Object3D,
  resolution = 1024,
  output = 256,
): Texture {
  const scene = new Scene();
  scene.add(subject);
  scene.add(new AmbientLight(0xffffff, 1));
  const key = new DirectionalLight(0xfff4e4, 1.35);
  key.position.set(6, 10, 5);
  scene.add(key);

  subject.updateWorldMatrix(true, true);
  const bounds = new Box3().setFromObject(subject);
  const center = bounds.getCenter(new Vector3());
  const radius = bounds.getBoundingSphere(new Sphere()).radius * 1.05;
  const camera = new OrthographicCamera(-radius, radius, radius, -radius, 0.05, radius * 12);
  camera.position.copy(center).add(new Vector3(radius * 0.85, radius * 1.15, radius * 0.95));
  camera.lookAt(center);
  camera.updateProjectionMatrix();

  const target = new WebGLRenderTarget(resolution, resolution, {
    format: RGBAFormat,
    type: UnsignedByteType,
  });
  target.texture.colorSpace = LinearSRGBColorSpace;
  const previousTarget = renderer.getRenderTarget();
  const previousColor = new Color();
  renderer.getClearColor(previousColor);
  const previousAlpha = renderer.getClearAlpha();
  const previousShadows = renderer.shadowMap.enabled;
  const previousAutoClear = renderer.autoClear;

  renderer.shadowMap.enabled = false;
  renderer.autoClear = true;
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);

  const pixels = new Uint8Array(resolution * resolution * 4);
  renderer.readRenderTargetPixels(target, 0, 0, resolution, resolution, pixels);
  renderer.setRenderTarget(previousTarget);
  renderer.setClearColor(previousColor, previousAlpha);
  renderer.shadowMap.enabled = previousShadows;
  renderer.autoClear = previousAutoClear;
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
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = LinearSRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function bakeFoliageSprites(renderer: WebGLRenderer): FoliageSprites {
  return {
    tree: renderToSprite(renderer, buildTreeImage(), 1024, 256),
    grass: renderToSprite(renderer, buildGrassImage(0x6fbf45), 512, 128),
    wheat: renderToSprite(renderer, buildGrassImage(0xc6a04a), 512, 128),
  };
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
      const x1 = Math.floor((x + 1) * block);
      const y1 = Math.floor((y + 1) * block);
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

function buildTreeImage(): Group {
  const group = new Group();
  const trunk = new Mesh(
    new CylinderGeometry(0.12, 0.22, 1.6, 7),
    new MeshStandardMaterial({ color: 0x6a4632, roughness: 0.9 }),
  );
  trunk.position.y = 0.8;
  group.add(trunk);
  const lobes: Array<[number, number, number, number]> = [
    [0, 2.15, 0, 0.95],
    [0.55, 1.9, 0.15, 0.62],
    [-0.5, 1.85, 0.1, 0.58],
    [0.1, 2.45, -0.35, 0.5],
    [-0.15, 1.7, 0.45, 0.48],
  ];
  const parts = lobes.map(([x, y, z, scale]) => {
    const geometry = new IcosahedronGeometry(scale, 2);
    geometry.translate(x, y, z);
    return geometry;
  });
  const canopy = new Mesh(
    mergeGeometries(parts, false),
    new MeshStandardMaterial({ color: 0x3e8a34, roughness: 0.85 }),
  );
  group.add(canopy);
  const cards = leafCardGeometry();
  group.add(new Mesh(cards, new MeshStandardMaterial({
    map: leafBlob(),
    color: 0x67b043,
    alphaTest: 0.3,
    roughness: 0.8,
    side: DoubleSide,
  })));
  return group;
}

function buildGrassImage(color: number): Group {
  const group = new Group();
  const material = new MeshStandardMaterial({
    color,
    roughness: 0.86,
    side: DoubleSide,
  });
  const blade = new PlaneGeometry(0.22, 0.9);
  blade.translate(0, 0.45, 0);
  for (let i = 0; i < 24; i += 1) {
    const mesh = new Mesh(blade, material);
    const angle = (i / 24) * Math.PI * 2;
    const ring = i % 3;
    mesh.position.set(Math.cos(angle) * (0.08 + ring * 0.12), 0, Math.sin(angle) * (0.08 + ring * 0.12));
    mesh.rotation.y = angle * 0.5;
    mesh.scale.y = 0.7 + (i % 4) * 0.16;
    group.add(mesh);
  }
  return group;
}

function leafBlob(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('leaf blob');
  context.clearRect(0, 0, 64, 64);
  context.fillStyle = '#4ea03a';
  context.beginPath();
  context.ellipse(32, 36, 14, 24, 0.2, 0, Math.PI * 2);
  context.fill();
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function leafCardGeometry(): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vertex = 0;
  for (let i = 0; i < 18; i += 1) {
    const theta = (i / 18) * Math.PI * 2;
    const y = 1.7 + (i % 5) * 0.18;
    const radius = 0.45 + (i % 3) * 0.18;
    const cx = Math.cos(theta) * radius;
    const cz = Math.sin(theta) * radius;
    const size = 0.28;
    const dx = Math.cos(theta + 1.2) * size;
    const dz = Math.sin(theta + 1.2) * size;
    const corners = [
      [cx - dx, y - size, cz - dz],
      [cx + dx, y - size, cz + dz],
      [cx + dx, y + size, cz + dz],
      [cx - dx, y + size, cz - dz],
    ];
    for (const corner of corners) positions.push(corner[0], corner[1], corner[2]);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3);
    vertex += 4;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
