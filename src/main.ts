import * as THREE from 'three';
import { startAmbience } from './audio';
import { parseQuality, type QualityName } from './presets';
import { createWorld } from './scene/world';
import { findShot } from './shots';
import { createBlockMesh, type ShapeName } from './voxels/blocks';

declare global {
  interface Window {
    __ready?: boolean;
    __fps?: number;
    __frameMs?: number;
    __error?: string;
    __quality?: QualityName;
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('#view');
const hud = document.querySelector<HTMLElement>('#hud');
const qualityBar = document.querySelector<HTMLElement>('#quality');
const fpsLabel = document.querySelector<HTMLElement>('#fps');
if (!canvas || !hud || !qualityBar) throw new Error('Missing app shell');

const params = new URLSearchParams(location.search);
const shot = findShot(params.get('shot'));
const terrainMode = params.get('terrain') === 'height' ? 'height' : 'net';
let quality = parseQuality(params.get('quality'));

const world = createWorld(canvas, quality, terrainMode);
const { camera } = world;

if (shot) {
  camera.position.set(...shot.position);
  camera.fov = shot.fov;
  camera.lookAt(...shot.target);
  camera.updateProjectionMatrix();
  document.body.classList.add('capture');
  hud.hidden = !shot.hud;
} else {
  camera.position.set(40, 22, 48);
  camera.lookAt(60, 14, 78);
  hud.hidden = false;
}

qualityBar.querySelectorAll<HTMLButtonElement>('button[data-q]').forEach((button) => {
  button.addEventListener('click', () => {
    quality = button.dataset.q as QualityName;
    world.setQuality(quality);
    window.__quality = quality;
    qualityBar.querySelectorAll('button').forEach((other) => other.classList.toggle('on', other === button));
  });
});
qualityBar.querySelector(`button[data-q="${quality}"]`)?.classList.add('on');
window.__quality = quality;

const buildSlots: Array<{ shape: ShapeName; layer: number }> = [
  { shape: 'box', layer: 0 },
  { shape: 'box', layer: 1 },
  { shape: 'box', layer: 2 },
  { shape: 'box', layer: 3 },
  { shape: 'slab', layer: 0 },
  { shape: 'wedge', layer: 4 },
  { shape: 'gable', layer: 2 },
  { shape: 'box', layer: 3 },
];
let buildSlot = 0;
const slotButtons = [...document.querySelectorAll<HTMLButtonElement>('#hotbar .slot')];
const raycaster = new THREE.Raycaster();

function selectSlot(index: number): void {
  buildSlot = index;
  slotButtons.forEach((button, i) => button.classList.toggle('on', i === index));
}

slotButtons.forEach((button, index) => {
  button.addEventListener('click', () => selectSlot(index));
});

function buildHit(): THREE.Intersection | undefined {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  return raycaster
    .intersectObjects(world.scene.children, true)
    .find((hit) => hit.object.name === 'terrain' || hit.object.name === 'structures' || hit.object.name === 'player-block');
}

function placeBlock(): void {
  const hit = buildHit();
  if (!hit?.face) return;
  const choice = buildSlots[buildSlot];
  const mesh = createBlockMesh(choice.shape, choice.layer, world.blockMaterial);
  const point = hit.point.clone().addScaledVector(hit.face.normal, 0.52);
  mesh.position.set(Math.round(point.x), Math.round(point.y), Math.round(point.z));
  world.scene.add(mesh);
}

function removeBlock(): void {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hit = raycaster.intersectObjects(world.scene.children, true).find((item) => item.object.name === 'player-block');
  if (!hit) return;
  world.scene.remove(hit.object);
}

const keys = new Set<string>();
let yaw = Math.atan2(60 - camera.position.x, 78 - camera.position.z);
let pitch = -0.18;
let dragging = false;
let flying = !shot;

window.addEventListener('keydown', (event) => {
  keys.add(event.key.toLowerCase());
  if (!shot) flying = true;
  const key = event.key.toLowerCase();
  if (key >= '1' && key <= '8') selectSlot(Number(key) - 1);
  if (key === 'f') placeBlock();
  if (key === 'r') removeBlock();
  if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
    flying = true;
  }
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));

canvas.addEventListener('pointerdown', (event) => {
  dragging = true;
  flying = true;
  canvas.setPointerCapture(event.pointerId);
  startAmbience();
});
window.addEventListener('pointerup', () => {
  dragging = false;
});
window.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  yaw -= event.movementX * 0.004;
  pitch = THREE.MathUtils.clamp(pitch + event.movementY * -0.003, -1.2, 1.15);
});
window.addEventListener('resize', () => world.resize());

function fly(dt: number): void {
  if (!flying) return;
  const speed = keys.has('shift') ? 32 : 14;
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  const move = new THREE.Vector3();
  if (keys.has('w') || keys.has('arrowup')) move.add(forward);
  if (keys.has('s') || keys.has('arrowdown')) move.sub(forward);
  if (keys.has('d') || keys.has('arrowright')) move.add(right);
  if (keys.has('a') || keys.has('arrowleft')) move.sub(right);
  if (keys.has('e')) move.y += 1;
  if (keys.has('q')) move.y -= 1;
  if (move.lengthSq() > 0) camera.position.addScaledVector(move.normalize(), speed * dt);
  const look = new THREE.Vector3(
    camera.position.x + Math.sin(yaw) * Math.cos(pitch),
    camera.position.y + Math.sin(pitch),
    camera.position.z + Math.cos(yaw) * Math.cos(pitch),
  );
  camera.lookAt(look);
}

let last = performance.now();
let smoothed = 16.7;
let frames = 0;

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  smoothed = smoothed * 0.9 + dt * 1000 * 0.1;
  frames += 1;
  if (frames > 8) {
    window.__fps = 1000 / smoothed;
    window.__frameMs = smoothed;
    if (fpsLabel) fpsLabel.textContent = `${Math.round(window.__fps)} fps`;
  }
  fly(dt);
  world.render(now / 1000);
  if (!window.__ready) window.__ready = true;
  requestAnimationFrame(frame);
}

try {
  world.resize();
  requestAnimationFrame(frame);
} catch (error) {
  window.__error = error instanceof Error ? error.message : String(error);
  throw error;
}
