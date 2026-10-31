import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { emissive, mrt, output, pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { sharpen } from 'three/addons/tsl/display/SharpenNode.js';
import { createArena } from './arena.ts';
import { createWerewolf } from './werewolf.ts';

const overlay = document.querySelector('#overlay');
const status = document.querySelector('#status');
const gpuNote = document.querySelector('#gpu');

function setText(node: Element | null, text: string): void {
  if (node) node.textContent = text;
}

function envMap(): any {
  const faces = ['#f4d7b0', '#9eb6d4', '#f7f1e6', '#3a2c24', '#e7d3b0', '#d5e2f0'];
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
  const canvas = document.querySelector('canvas');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('canvas missing');

  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    trackTimestamp: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  await renderer.init();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc5ced6);
  scene.fog = new THREE.Fog(0xc5ced6, 30, 78);
  scene.environment = envMap();
  scene.environmentIntensity = 1;

  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.08, 120);
  // Group yaw +0.7 sends local -z toward (-0.64, 0, -0.77). Sit off that ray, low, so the snout has length.
  camera.position.set(-2.4, 0.7, -2.15);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0.05, 0.74, -0.2);
  controls.enableDamping = true;
  controls.maxDistance = 12;
  controls.minDistance = 1.6;
  controls.update();

  const sun = new THREE.DirectionalLight(0xffe0b8, 3.1);
  sun.position.set(4.5, 9.5, -3.5);
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
  sun.target.position.set(0, 0.7, -0.2);
  const fill = new THREE.DirectionalLight(0xb7cbe2, 1.15);
  fill.position.set(-7, 5.5, 6);
  const hemi = new THREE.HemisphereLight(0xd5e2f2, 0x3a2a22, 0.45);
  scene.add(sun, sun.target, fill, hemi);

  const arena = createArena();
  const werewolf = createWerewolf();
  scene.add(arena.object, werewolf.object);

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
    werewolf.update(frames / 60);
    arena.update(frames / 60);
    controls.update();
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
    if (!shot || frames < 28) {
      if (shot) window.setTimeout(tick, 16);
      else requestAnimationFrame(tick);
    }
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
