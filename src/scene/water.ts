import * as THREE from 'three';
import { createShoreTexture } from '../voxels/textures';
import { SUN_DIRECTION } from './sky';

export const WATER_Y = 8.2;

export interface WaterSystem {
  mesh: THREE.Mesh;
  target: THREE.WebGLRenderTarget;
  camera: THREE.PerspectiveCamera;
  renderReflection: (renderer: THREE.WebGLRenderer, scene: THREE.Scene, view: THREE.Camera) => void;
  update: (time: number, hasReflection: boolean, resolution: THREE.Vector2) => void;
}

export function createWater(): WaterSystem {
  const rt = new THREE.WebGLRenderTarget(640, 360, {
    type: THREE.HalfFloatType,
    depthBuffer: true,
  });
  const shore = createShoreTexture(WATER_Y);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uReflection: { value: rt.texture },
      uShore: { value: shore },
      uHasReflection: { value: 1 },
      uResolution: { value: new THREE.Vector2(1280, 720) },
      uSunDir: { value: SUN_DIRECTION.clone() },
      uDeep: { value: new THREE.Color(0x1e6a72) },
      uShallow: { value: new THREE.Color(0x4ea3a2) },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        vUv = uv;
        vec3 pos = position;
        float wave = sin(pos.x * 0.35 + uTime * 0.8) * 0.05 + cos(pos.y * 0.28 + uTime * 0.6) * 0.04;
        pos.z += wave;
        vec4 world = modelMatrix * vec4(pos, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * vec3(-cos(pos.x * 0.35 + uTime * 0.8) * 0.35 * 0.05, -sin(pos.y * 0.28) * 0.02, 1.0));
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform sampler2D uReflection;
      uniform sampler2D uShore;
      uniform float uHasReflection;
      uniform vec2 uResolution;
      uniform vec3 uSunDir;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      varying vec3 vWorld;
      varying vec2 vUv;
      varying vec3 vNormal;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);
        vec3 n = normalize(vNormal);
        float fres = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);
        vec2 screen = gl_FragCoord.xy / uResolution;
        vec2 distort = n.xz * 0.03;
        vec3 reflected = texture2D(uReflection, screen + distort).rgb;
        vec3 skyFallback = mix(vec3(0.55, 0.62, 0.7), vec3(0.95, 0.78, 0.55), 0.35);
        vec3 mirror = mix(skyFallback, reflected, uHasReflection);
        vec3 water = mix(uDeep, uShallow, fres * 0.18) * 0.48;
        vec3 col = mix(water, mirror * 0.5, 0.1 + fres * 0.58);
        float foam = texture2D(uShore, vec2(vWorld.x / 120.0, vWorld.z / 120.0)).r;
        col = mix(col, vec3(0.93, 0.9, 0.82), foam * 0.75);
        float spec = pow(max(dot(reflect(-uSunDir, n), viewDir), 0.0), 80.0);
        col += vec3(1.0, 0.85, 0.6) * spec * 0.35;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(54, 46, 48, 40), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(96, WATER_Y, 42);
  mesh.name = 'water';
  mesh.receiveShadow = true;
  const camera = new THREE.PerspectiveCamera();
  const normal = new THREE.Vector3();
  const mirrorWorld = new THREE.Vector3();
  const cameraWorld = new THREE.Vector3();
  const rotation = new THREE.Matrix4();
  const viewVec = new THREE.Vector3();
  const lookPoint = new THREE.Vector3();
  const mirrorTarget = new THREE.Vector3();
  const reflectorPlane = new THREE.Plane();
  const clipPlane = new THREE.Vector4();
  const q = new THREE.Vector4();
  const renderReflection = (renderer: THREE.WebGLRenderer, scene: THREE.Scene, view: THREE.Camera) => {
    const src = view as THREE.PerspectiveCamera;
    mesh.updateWorldMatrix(true, false);
    mirrorWorld.setFromMatrixPosition(mesh.matrixWorld);
    cameraWorld.setFromMatrixPosition(src.matrixWorld);
    rotation.extractRotation(mesh.matrixWorld);
    normal.set(0, 0, 1).applyMatrix4(rotation);
    viewVec.subVectors(mirrorWorld, cameraWorld);
    if (viewVec.dot(normal) > 0) return;
    viewVec.reflect(normal).negate().add(mirrorWorld);
    rotation.extractRotation(src.matrixWorld);
    lookPoint.set(0, 0, -1).applyMatrix4(rotation).add(cameraWorld);
    mirrorTarget.subVectors(mirrorWorld, lookPoint).reflect(normal).negate().add(mirrorWorld);
    camera.position.copy(viewVec);
    camera.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
    camera.lookAt(mirrorTarget);
    camera.far = src.far;
    camera.near = src.near;
    camera.fov = src.fov;
    camera.aspect = src.aspect;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    reflectorPlane.setFromNormalAndCoplanarPoint(normal, mirrorWorld);
    reflectorPlane.applyMatrix4(camera.matrixWorldInverse);
    clipPlane.set(reflectorPlane.normal.x, reflectorPlane.normal.y, reflectorPlane.normal.z, reflectorPlane.constant);
    const projection = camera.projectionMatrix;
    q.set(
      (Math.sign(clipPlane.x) + projection.elements[8]) / projection.elements[0],
      (Math.sign(clipPlane.y) + projection.elements[9]) / projection.elements[5],
      -1,
      (1 + projection.elements[10]) / projection.elements[14],
    );
    clipPlane.multiplyScalar(2 / clipPlane.dot(q));
    projection.elements[2] = clipPlane.x;
    projection.elements[6] = clipPlane.y;
    projection.elements[10] = clipPlane.z + 1;
    projection.elements[14] = clipPlane.w;
    mesh.visible = false;
    const previous = renderer.getRenderTarget();
    const shadows = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(previous);
    renderer.shadowMap.enabled = shadows;
    mesh.visible = true;
  };
  return {
    mesh,
    target: rt,
    camera,
    renderReflection,
    update: (time: number, hasReflection: boolean, resolution: THREE.Vector2) => {
      material.uniforms.uTime.value = time;
      material.uniforms.uHasReflection.value = hasReflection ? 1 : 0;
      material.uniforms.uResolution.value.copy(resolution);
    },
  };
}
