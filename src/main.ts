import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BUNKER, TOWER, UNIT, createField, hillHeight } from './military/field';

declare global {
  interface Window {
    __ready?: boolean;
    __fps?: number;
    __error?: string;
  }
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, 0.94);
      float split = smoothstep(0.08, 0.72, luma);
      vec3 tint = mix(vec3(0.96, 0.98, 1.04), vec3(1.04, 1.01, 0.97), split);
      col = mix(col, col * tint, 0.28);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

const canvas = document.querySelector<HTMLCanvasElement>('#view');
if (!canvas) throw new Error('Missing canvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setClearColor(0x8e99a6, 1);

const { scene, update } = createField();
const camera = new THREE.PerspectiveCamera(38, 1, 0.4, 980);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.06, 0.35, 0.92);
composer.addPass(bloom);
composer.addPass(new ShaderPass(GradeShader));
composer.addPass(new OutputPass());

const target = new THREE.Vector3(0, 0, 6);
let theta = -0.38;
let phi = 1.27;
let radius = 70;
const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (shot === 'bunker') {
  target.set(BUNKER.x, 0, BUNKER.z);
  theta = -0.35;
  phi = 1.24;
  radius = 26;
} else if (shot === 'tower') {
  target.set(TOWER.x, 0, TOWER.z);
  theta = -0.9;
  phi = 1.38;
  radius = 32;
} else if (shot === 'unit') {
  target.set(UNIT.x, 0, UNIT.z);
  theta = -1.05;
  phi = 1.3;
  radius = 18;
} else {
  target.set(0, 0, 6);
  theta = -0.38;
  phi = 1.27;
  radius = 70;
}

const keys = new Set<string>();
let dragging = false;
const orbiting = !shot;

function applyCamera(): void {
  target.x = THREE.MathUtils.clamp(target.x, -220, 220);
  target.z = THREE.MathUtils.clamp(target.z, -220, 220);
  const lift = shot === 'tower' ? 6 : shot === 'unit' ? 1.6 : 2.4;
  target.y = hillHeight(target.x, target.z) + lift;
  const sinPhi = Math.sin(phi);
  camera.position.set(
    target.x + radius * sinPhi * Math.sin(theta),
    target.y + radius * Math.cos(phi),
    target.z + radius * sinPhi * Math.cos(theta),
  );
  camera.lookAt(target);
}

function resize(): void {
  const width = window.innerWidth;
  const height = Math.max(1, window.innerHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  composer.setSize(width, height);
  bloom.resolution.set(width, height);
}

window.addEventListener('resize', resize);
window.addEventListener('keydown', (event) => keys.add(event.key.toLowerCase()));
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
canvas.addEventListener('pointerdown', (event) => {
  if (!orbiting) return;
  dragging = true;
  canvas.setPointerCapture(event.pointerId);
});
window.addEventListener('pointerup', () => {
  dragging = false;
});
window.addEventListener('pointermove', (event) => {
  if (!dragging || !orbiting) return;
  theta -= event.movementX * 0.005;
  phi = THREE.MathUtils.clamp(phi + event.movementY * 0.003, 1.12, 1.46);
});
canvas.addEventListener('wheel', (event) => {
  if (!orbiting) return;
  radius = THREE.MathUtils.clamp(radius + event.deltaY * 0.035, 12, 140);
}, { passive: true });

let last = performance.now();
let smoothed = 16.7;

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  smoothed = smoothed * 0.9 + dt * 1000 * 0.1;
  window.__fps = 1000 / smoothed;
  if (orbiting) {
    const speed = 24;
    const forward = new THREE.Vector3(-Math.sin(theta), 0, -Math.cos(theta));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    if (keys.has('w') || keys.has('arrowup')) target.addScaledVector(forward, speed * dt);
    if (keys.has('s') || keys.has('arrowdown')) target.addScaledVector(forward, -speed * dt);
    if (keys.has('d') || keys.has('arrowright')) target.addScaledVector(right, speed * dt);
    if (keys.has('a') || keys.has('arrowleft')) target.addScaledVector(right, -speed * dt);
  }
  applyCamera();
  update(now / 1000);
  composer.render();
  if (!window.__ready) window.__ready = true;
  requestAnimationFrame(frame);
}

try {
  resize();
  applyCamera();
  requestAnimationFrame(frame);
} catch (error) {
  window.__error = error instanceof Error ? error.message : String(error);
  throw error;
}
