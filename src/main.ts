import * as THREE from 'three';
import { BUNKER, TOWER, createField, hillHeight } from './military/field';

declare global {
  interface Window {
    __ready?: boolean;
    __fps?: number;
    __error?: string;
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('#view');
if (!canvas) throw new Error('Missing canvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setClearColor(0x8e99a6, 1);

const { scene, update } = createField();
const camera = new THREE.PerspectiveCamera(40, 1, 0.35, 780);

const target = new THREE.Vector3(0, 0, 0);
let theta = 0.28;
let phi = 1.33;
let radius = 54;
const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (shot === 'bunker') {
  target.set(BUNKER.x, 0, BUNKER.z);
  theta = 0.42;
  phi = 1.24;
  radius = 22;
} else if (shot === 'tower') {
  target.set(TOWER.x, 0, TOWER.z);
  theta = -0.85;
  phi = 1.4;
  radius = 30;
} else {
  theta = 0.28;
  phi = 1.33;
  radius = 54;
}

const keys = new Set<string>();
let dragging = false;
const orbiting = !shot;

function applyCamera(): void {
  target.x = THREE.MathUtils.clamp(target.x, -150, 150);
  target.z = THREE.MathUtils.clamp(target.z, -150, 150);
  const lift = shot === 'tower' ? 6.5 : 2.2;
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
  phi = THREE.MathUtils.clamp(phi + event.movementY * 0.003, 1.12, 1.48);
});
canvas.addEventListener('wheel', (event) => {
  if (!orbiting) return;
  radius = THREE.MathUtils.clamp(radius + event.deltaY * 0.035, 18, 120);
}, { passive: true });

let last = performance.now();
let smoothed = 16.7;

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  smoothed = smoothed * 0.9 + dt * 1000 * 0.1;
  window.__fps = 1000 / smoothed;
  if (orbiting) {
    const speed = 22;
    const forward = new THREE.Vector3(-Math.sin(theta), 0, -Math.cos(theta));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    if (keys.has('w') || keys.has('arrowup')) target.addScaledVector(forward, speed * dt);
    if (keys.has('s') || keys.has('arrowdown')) target.addScaledVector(forward, -speed * dt);
    if (keys.has('d') || keys.has('arrowright')) target.addScaledVector(right, speed * dt);
    if (keys.has('a') || keys.has('arrowleft')) target.addScaledVector(right, -speed * dt);
  }
  applyCamera();
  update(now / 1000);
  renderer.render(scene, camera);
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
