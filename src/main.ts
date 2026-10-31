import * as THREE from 'three/webgpu';
import { emissive, mrt, output, pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { sharpen } from 'three/addons/tsl/display/SharpenNode.js';
import { createArena } from './arena.ts';
import { FLOOR_Y, followView, stepMove, type MoveInput, type Pose } from './control.ts';
import { createWerewolf } from './werewolf.ts';

const overlay = document.querySelector('#overlay');
const status = document.querySelector('#status');
const gpuNote = document.querySelector('#gpu');

function setText(node: Element | null, text: string): void {
  if (node) node.textContent = text;
}

function envMap(): any {
  const faces = ['#2a3340', '#1a2430', '#303848', '#12100e', '#243044', '#1c2834'];
  const images = faces.map((color) => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('env canvas unavailable');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 32, 32);
    return canvas;
  });
  const texture = new THREE.CubeTexture(images);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

async function gpuDescription(): Promise<string> {
  if (!navigator.gpu) return 'WebGPU is unavailable in this browser.';
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return 'No WebGPU adapter. In Windows Graphics settings, set this browser to the high-performance GPU.';
  const info = 'info' in adapter ? adapter.info : undefined;
  const record = info as { description?: string; vendor?: string; architecture?: string } | undefined;
  const description = [record?.vendor, record?.architecture, record?.description].filter(Boolean).join(' ');
  const label = description || 'high-performance adapter';
  const integrated = /intel|uhd|iris|microsoft basic/i.test(label) && !/nvidia|radeon|rtx|gtx/i.test(label);
  if (integrated) {
    return `Integrated GPU in use (${label}). Windows Graphics settings can switch the browser to the high-performance GPU.`;
  }
  return `GPU: ${label}`;
}

async function main(): Promise<void> {
  setText(gpuNote, await gpuDescription());
  const canvasQuery = document.querySelector('canvas');
  if (!(canvasQuery instanceof HTMLCanvasElement)) throw new Error('canvas missing');
  const canvas: HTMLCanvasElement = canvasQuery;

  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    trackTimestamp: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.45;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  await renderer.init();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a2430);
  scene.fog = new THREE.Fog(0x1a2430, 8, 26);
  scene.environment = envMap();
  scene.environmentIntensity = 0.35;

  const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.08, 80);
  const pose: Pose = { x: 0, y: FLOOR_Y, z: 0, yaw: 0 };
  const held = new Set<string>();

  const rememberKey = (event: KeyboardEvent, down: boolean) => {
    if (event.code) {
      if (down) held.add(event.code);
      else held.delete(event.code);
    }
    if (event.key) {
      if (down) held.add(event.key);
      else held.delete(event.key);
    }
    if (event.code.startsWith('Arrow') || /^Key[WASD]$/.test(event.code)) event.preventDefault();
  };
  window.addEventListener('keydown', (event) => rememberKey(event, true));
  window.addEventListener('keyup', (event) => rememberKey(event, false));

  const sun = new THREE.DirectionalLight(0xd5e2f6, 4.2);
  sun.position.set(-0.5, 2.8, -3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 18;
  sun.shadow.camera.left = -2.6;
  sun.shadow.camera.right = 2.6;
  sun.shadow.camera.top = 2.6;
  sun.shadow.camera.bottom = -2.6;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.025;
  sun.target.position.set(-0.1, 0.5, -0.4);
  const fill = new THREE.DirectionalLight(0x8aa4c4, 0.7);
  fill.position.set(2.2, 1.6, 1.2);
  const hemi = new THREE.HemisphereLight(0x31445c, 0x1a1410, 0.55);
  scene.add(sun, sun.target, fill, hemi);

  const arena = createArena();
  const werewolf = await createWerewolf();
  scene.add(arena.object, werewolf.object);

  function readMove(): MoveInput {
    const down = (...names: string[]) => names.some((name) => held.has(name));
    let forward = 0;
    let strafe = 0;
    if (down('KeyW', 'ArrowUp', 'w')) forward += 1;
    if (down('KeyS', 'ArrowDown', 's')) forward -= 1;
    if (down('KeyD', 'ArrowRight', 'd')) strafe += 1;
    if (down('KeyA', 'ArrowLeft', 'a')) strafe -= 1;
    return { forward, strafe };
  }

  function place(): void {
    werewolf.object.position.set(pose.x, pose.y, pose.z);
    werewolf.object.rotation.y = pose.yaw;
    const view = followView(pose);
    camera.position.set(view.x, view.y, view.z);
    camera.lookAt(view.lookX, view.lookY, view.lookZ);
    sun.position.set(pose.x - 0.5, pose.y + 2.8, pose.z - 3.1);
    sun.target.position.set(pose.x, pose.y + 0.5, pose.z);
    const x = pose.x.toFixed(4);
    const y = pose.y.toFixed(4);
    const z = pose.z.toFixed(4);
    const yaw = pose.yaw.toFixed(4);
    document.documentElement.dataset.x = x;
    document.documentElement.dataset.y = y;
    document.documentElement.dataset.z = z;
    document.documentElement.dataset.yaw = yaw;
    canvas.dataset.x = x;
    canvas.dataset.y = y;
    canvas.dataset.z = z;
    canvas.dataset.yaw = yaw;
  }

  place();

  const scenePass = pass(scene, camera);
  scenePass.setMRT(mrt({ output, emissive }));
  const colorNode = scenePass.getTextureNode('output');
  const bloomNode = bloom(scenePass.getTextureNode('emissive'), 0.7, 0.4, 0);
  const pipeline = new THREE.RenderPipeline(renderer);
  pipeline.outputNode = sharpen(colorNode, 1.45).add(bloomNode);

  await renderer.compileAsync(scene, camera);
  pipeline.render();

  setText(status, '');
  const shot = new URLSearchParams(window.location.search).has('shot');
  let frames = 0;
  let fpsAccum = 0;
  let fpsFrames = 0;
  let last = performance.now();
  let cpuMs = 0;
  let gpuMs = 0;
  let gpuBusy = false;

  const tick = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frames += 1;
    const next = stepMove(pose, readMove(), dt);
    pose.x = next.x;
    pose.y = next.y;
    pose.z = next.z;
    pose.yaw = next.yaw;
    place();
    werewolf.update(frames / 60);
    arena.update(frames / 60);
    const start = performance.now();
    pipeline.render();
    cpuMs = performance.now() - start;
    if (!gpuBusy && frames % 20 === 0) {
      gpuBusy = true;
      renderer.resolveTimestampsAsync('render').then((value: number) => {
        if (typeof value === 'number' && value > 0 && value < 100) gpuMs = value;
        gpuBusy = false;
      }).catch(() => {
        gpuBusy = false;
      });
    }
    fpsAccum += dt;
    fpsFrames += 1;
    if (fpsAccum >= 0.5 || (shot && frames === 24)) {
      const fps = fpsFrames / Math.max(fpsAccum, 0.001);
      const info = renderer.info.render;
      setText(overlay, [
        `fps ${fps.toFixed(0)}`,
        `cpu ${cpuMs.toFixed(2)} ms`,
        `gpu ${gpuMs > 0 ? gpuMs.toFixed(2) : 'n/a'} ms`,
        `draws ${info.drawCalls || info.frameCalls}`,
        `triangles ${info.triangles}`,
      ].join('  ·  '));
      if (shot && frames >= 24) {
        document.documentElement.dataset.ready = '1';
        document.documentElement.dataset.fps = fps.toFixed(1);
      }
      if (fpsAccum >= 0.5) {
        fpsAccum = 0;
        fpsFrames = 0;
      }
    }
    if (shot) window.setTimeout(tick, 16);
    else requestAnimationFrame(tick);
  };
  if (shot) window.setTimeout(tick, 16);
  else requestAnimationFrame(tick);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  setText(status, message);
});
