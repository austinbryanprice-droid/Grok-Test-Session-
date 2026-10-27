import {
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector3,
  Vector4,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { WATER_Y, WORLD } from './field';
import { FOG_COLOR, FOG_DENSITY, LIGHT_DIR } from './look';
import type { Library } from './textures';

const vertexShader = /* glsl */ `
uniform mat4 uTextureMatrix;
uniform float uTime;
varying vec3 vWorld;
varying vec4 vMirror;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  world.y += sin(world.x * 0.33 + uTime * 1.25) * 0.03 + sin(world.z * 0.22 + uTime * 0.85) * 0.022;
  vWorld = world.xyz;
  vMirror = uTextureMatrix * world;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uReflection;
uniform sampler2D uNormal;
uniform sampler2D uMask;
uniform sampler2D uCloud;
uniform float uTime;
uniform vec3 uSun;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFogColor;
uniform float uFogDensity;
varying vec3 vWorld;
varying vec4 vMirror;
void main() {
  vec2 maskUv = vWorld.xz / ${WORLD}.0 + 0.5;
  vec4 mask = texture2D(uMask, maskUv);
  if (mask.r < 0.035) discard;
  vec2 nuv = vWorld.xz * 0.11;
  vec3 n1 = texture2D(uNormal, nuv + vec2(uTime * 0.025, uTime * 0.045)).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(uNormal, nuv * 1.7 - vec2(uTime * 0.02, uTime * 0.035)).xyz * 2.0 - 1.0;
  vec3 n = normalize(vec3((n1.xy + n2.xy) * 0.42, 1.0));
  vec2 mc = vMirror.xy / max(vMirror.w, 0.0001);
  mc += n.xz * 0.03;
  mc = clamp(mc, 0.001, 0.999);
  vec3 refl = texture2D(uReflection, mc).rgb;
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(dot(viewDir, n), 0.0, 1.0), 3.0);
  vec3 water = mix(uShallow, uDeep, smoothstep(0.12, 0.8, mask.r));
  float spec = pow(max(dot(normalize(uSun + viewDir), n), 0.0), 140.0);
  vec3 col = mix(water, refl, clamp(fres * 0.75 + 0.05, 0.0, 0.88));
  col += vec3(1.0, 0.86, 0.62) * spec * 0.6;
  float foamNoise = texture2D(uCloud, vWorld.xz * 0.09 + vec2(uTime * 0.02, 0.0)).r;
  float foam = mask.g * smoothstep(0.42, 0.78, foamNoise);
  col = mix(col, vec3(0.84, 0.81, 0.72), foam * 0.8);
  float cloud = texture2D(uCloud, vWorld.xz * 0.007 + vec2(uTime * 0.004, uTime * 0.001)).r;
  col *= mix(0.7, 1.0, smoothstep(0.2, 0.82, cloud));
  float dist = length(cameraPosition - vWorld);
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

export type River = {
  mesh: Mesh;
  renderReflection: (renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) => void;
  time: { value: number };
};

export function createRiver(library: Library): River {
  const target = new WebGLRenderTarget(1024, 1024, {
    type: HalfFloatType,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: true,
  });
  target.texture.colorSpace = LinearSRGBColorSpace;

  const textureMatrix = new Matrix4();
  const time = { value: 0 };
  const material = new ShaderMaterial({
    uniforms: {
      uTextureMatrix: { value: textureMatrix },
      uReflection: { value: target.texture },
      uNormal: { value: library.waterNormal },
      uMask: { value: library.waterMask },
      uCloud: { value: library.cloud },
      uTime: time,
      uSun: { value: LIGHT_DIR.clone().multiplyScalar(-1) },
      uShallow: { value: new Vector3(0.45, 0.48, 0.32) },
      uDeep: { value: new Vector3(0.05, 0.14, 0.14) },
      uFogColor: { value: FOG_COLOR },
      uFogDensity: { value: FOG_DENSITY },
    },
    vertexShader,
    fragmentShader,
  });

  const geometry = new PlaneGeometry(WORLD, WORLD, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new Mesh(geometry, material);
  mesh.position.y = WATER_Y;
  mesh.renderOrder = 2;

  const virtualCamera = new PerspectiveCamera();
  const normal = new Vector3(0, 1, 0);
  const waterPoint = new Vector3(0, WATER_Y, 0);
  const view = new Vector3();
  const lookTarget = new Vector3();
  const camLook = new Vector3();
  const reflectorPlane = new Plane();
  const clipPlane = new Vector4();
  const q = new Vector4();

  const renderReflection = (renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) => {
    view.subVectors(waterPoint, camera.position);
    if (view.dot(normal) > 0) return;

    view.reflect(normal).negate();
    view.add(waterPoint);
    camLook.set(0, 0, -1).applyQuaternion(camera.quaternion).add(camera.position);
    lookTarget.subVectors(waterPoint, camLook);
    lookTarget.reflect(normal).negate();
    lookTarget.add(waterPoint);

    virtualCamera.position.copy(view);
    virtualCamera.up.set(0, 1, 0).reflect(normal);
    virtualCamera.lookAt(lookTarget);
    virtualCamera.far = camera.far;
    virtualCamera.updateMatrixWorld();
    virtualCamera.projectionMatrix.copy(camera.projectionMatrix);

    textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    textureMatrix.multiply(virtualCamera.projectionMatrix);
    textureMatrix.multiply(virtualCamera.matrixWorldInverse);

    reflectorPlane.setFromNormalAndCoplanarPoint(normal, waterPoint);
    reflectorPlane.applyMatrix4(virtualCamera.matrixWorldInverse);
    clipPlane.set(reflectorPlane.normal.x, reflectorPlane.normal.y, reflectorPlane.normal.z, reflectorPlane.constant);
    const projection = virtualCamera.projectionMatrix;
    q.x = (Math.sign(clipPlane.x) + projection.elements[8]) / projection.elements[0];
    q.y = (Math.sign(clipPlane.y) + projection.elements[9]) / projection.elements[5];
    q.z = -1;
    q.w = (1 + projection.elements[10]) / projection.elements[14];
    clipPlane.multiplyScalar(2 / clipPlane.dot(q));
    projection.elements[2] = clipPlane.x;
    projection.elements[6] = clipPlane.y;
    projection.elements[10] = clipPlane.z + 1;
    projection.elements[14] = clipPlane.w;

    mesh.visible = false;
    const shadows = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, virtualCamera);
    renderer.setRenderTarget(null);
    renderer.shadowMap.enabled = shadows;
    mesh.visible = true;
  };

  return { mesh, renderReflection, time };
}
