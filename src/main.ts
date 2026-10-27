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
      col = mix(vec3(luma), col, 0.88);
      float split = smoothstep(0.18, 0.7, luma);
      vec3 tint = mix(vec3(0.94, 0.97, 1.03), vec3(1.04, 1.01, 0.96), split);
      col = mix(col, col * tint, 0.55);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

const canvas = document.querySelector<HTMLCanvasElement>('#view');
if (!canvas) throw new Error('Missing canvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setClearColor(0x929a94, 1);

const { scene, terrain, unit, update, focusShadow } = createField();
const camera = new THREE.PerspectiveCamera(46, 1, 0.4, 980);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.045, 0.4, 0.94);
composer.addPass(bloom);
composer.addPass(new ShaderPass(GradeShader));
composer.addPass(new OutputPass());

const ring = new THREE.Mesh(
  new THREE.TorusGeometry(3.4, 0.08, 8, 28),
  new THREE.MeshBasicMaterial({ color: 0xe6d56a }),
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.22;
ring.visible = false;
ring.name = 'selection';
unit.add(ring);

const target = new THREE.Vector3(0, 0, 6);
let theta = -0.55;
let phi = 0.7;
let radius = 86;
const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (shot === 'bunker') {
  target.set(BUNKER.x, 0, BUNKER.z);
  theta = -0.4;
  phi = 0.78;
  radius = 32;
} else if (shot === 'tower') {
  target.set(TOWER.x, 0, TOWER.z);
  theta = -0.95;
  phi = 0.76;
  radius = 36;
} else if (shot === 'unit') {
  target.set(UNIT.x, 0, UNIT.z);
  theta = 0.4;
  phi = 0.82;
  radius = 22;
} else {
  target.set(0, 0, 8);
  theta = -0.55;
  phi = 0.7;
  radius = 86;
}

const keys = new Set<string>();
let dragging = false;
let pointerDown = false;
let downX = 0;
let downY = 0;
const orbiting = !shot;
let selected = false;
let moveTarget: THREE.Vector3 | null = null;
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const statusEl = document.querySelector<HTMLElement>('#status');

function setStatus(text: string): void {
  if (statusEl) statusEl.textContent = text;
}

if (shot) document.getElementById('hud')?.remove();

function belongsToUnit(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current === unit) return true;
    current = current.parent;
  }
  return false;
}

function onPointerSelect(clientX: number, clientY: number): void {
  const rect = canvas!.getBoundingClientRect();
  ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects([terrain, unit], true);
  if (!hits.length) return;
  const hit = hits[0];
  if (belongsToUnit(hit.object)) {
    selected = true;
    ring.visible = true;
    moveTarget = null;
    setStatus('Selected. Left-click the ground to move.');
    return;
  }
  if (selected && hit.object === terrain) {
    moveTarget = hit.point.clone();
    setStatus('Moving');
  }
}

function stepUnit(dt: number): void {
  if (!selected || !moveTarget) return;
  const dx = moveTarget.x - unit.position.x;
  const dz = moveTarget.z - unit.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.45) {
    moveTarget = null;
    setStatus('Arrived');
    return;
  }
  const step = Math.min(dist, 9 * dt);
  const x = unit.position.x + (dx / dist) * step;
  const z = unit.position.z + (dz / dist) * step;
  unit.position.set(x, hillHeight(x, z), z);
  unit.rotation.y = Math.atan2(dx, dz);
}

function applyCamera(): void {
  target.x = THREE.MathUtils.clamp(target.x, -220, 220);
  target.z = THREE.MathUtils.clamp(target.z, -220, 220);
  const lift = shot === 'tower' ? 8 : shot === 'unit' ? 1.8 : 2.2;
  target.y = hillHeight(target.x, target.z) + lift;
  const sinPhi = Math.sin(phi);
  camera.position.set(
    target.x + radius * sinPhi * Math.sin(theta),
    target.y + radius * Math.cos(phi),
    target.z + radius * sinPhi * Math.cos(theta),
  );
  camera.lookAt(target);
  focusShadow(target.x, target.z);
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
  if (!orbiting || event.button !== 0) return;
  dragging = true;
  pointerDown = true;
  downX = event.clientX;
  downY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});
window.addEventListener('pointerup', (event) => {
  if (!pointerDown) return;
  const moved = Math.hypot(event.clientX - downX, event.clientY - downY);
  dragging = false;
  pointerDown = false;
  if (orbiting && moved < 6) onPointerSelect(event.clientX, event.clientY);
});
window.addEventListener('pointermove', (event) => {
  if (!dragging || !orbiting) return;
  theta -= event.movementX * 0.005;
  phi = THREE.MathUtils.clamp(phi + event.movementY * 0.003, 0.58, 1.05);
});
canvas.addEventListener('wheel', (event) => {
  if (!orbiting) return;
  event.preventDefault();
  radius = THREE.MathUtils.clamp(radius + event.deltaY * 0.035, 16, 140);
}, { passive: false });

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
  stepUnit(dt);
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
