import {
  BloomEffect,
  Effect,
  EffectComposer,
  EffectPass,
  LUT3DEffect,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import * as THREE from 'three';
import { N8AOPostPass } from 'n8ao';
import { RtsCamera, zoomOutAmount } from './camera';
import { frame } from './frame';
import { createSun } from './lighting';
import { createGradeLut } from './lut';
import { PRESETS, autoQuality, parseQuality, type QualityName } from './quality';
import { applyAnisotropy } from './textures';
import { createWorld } from './world';

declare global {
  interface Window {
    __ready?: boolean;
    __fps?: number;
    __error?: string;
    __stats?: Record<string, number | string>;
  }
}

export async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#view');
  if (!canvas) throw new Error('Missing canvas');
  const params = new URLSearchParams(location.search);
  const quality: QualityName = parseQuality(params.get('quality')) ?? autoQuality();
  const preset = PRESETS[quality];
  const unitBudget = Math.max(1, Number(params.get('units') ?? 46) || 46);
  const shot = params.get('shot');
  const bar = document.querySelector<HTMLElement>('#bar');
  const setProgress = (value: number) => {
    if (bar) bar.style.width = `${Math.round(value * 100)}%`;
  };

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: preset.antialias,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = preset.composer ? THREE.NoToneMapping : THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  renderer.setClearColor(0xbfd3e6, 1);

  const view = new RtsCamera();
  if (shot === 'near') view.pixels = 120;
  if (shot === 'far') view.pixels = 30;
  if (shot) view.orbiting = false;
  if (shot === 'near') view.target.set(-8, 0, 2);

  const scene = new THREE.Scene();
  const resize = () => {
    view.resize(window.innerWidth, window.innerHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, preset.pixelRatioCap) * renderScale;
    renderer.setPixelRatio(ratio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    composer?.setSize(window.innerWidth, window.innerHeight, false);
  };
  let renderScale = 1;
  let composer: EffectComposer | null = null;
  resize();
  const sun = createSun(scene, view.camera, preset);
  setProgress(0.08);
  const world = createWorld(scene, sun.csm, quality, unitBudget, setProgress);
  applyAnisotropy(renderer);
  if (preset.composer) composer = createComposer(renderer, scene, view.camera, preset);
  view.apply(window.innerHeight);
  sun.update(view.camera, 49);
  world.update(view.camera, 0);
  setProgress(0.86);
  await renderer.compileAsync(scene, view.camera);
  if (composer) composer.render(0.016);
  setProgress(1);
  document.querySelector<HTMLElement>('#loading')?.classList.add('hidden');
  const stats = document.querySelector<HTMLElement>('#stats');
  const map = document.querySelector<HTMLCanvasElement>('#map');
  const mapCtx = map?.getContext('2d') ?? null;
  wireInput(canvas, view, scene);
  wireQuality(quality);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    window.__error = 'webgl context lost';
  });
  canvas.addEventListener('webglcontextrestored', () => location.reload());

  let last = performance.now();
  let smoothed = 16.7;
  let hot = 0;
  let cool = 0;
  const keys = new Set<string>();
  window.addEventListener('keydown', (event) => keys.add(event.key.toLowerCase()));
  window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
  window.addEventListener('resize', resize);

  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    smoothed = smoothed * 0.9 + dt * 1000 * 0.1;
    if (view.orbiting) {
      const speed = 18;
      const forward = new THREE.Vector3(-Math.sin(view.yaw), 0, -Math.cos(view.yaw));
      const right = new THREE.Vector3(Math.cos(view.yaw), 0, -Math.sin(view.yaw));
      if (keys.has('w') || keys.has('arrowup')) view.pan(forward.x * speed * dt, forward.z * speed * dt);
      if (keys.has('s') || keys.has('arrowdown')) view.pan(-forward.x * speed * dt, -forward.z * speed * dt);
      if (keys.has('d') || keys.has('arrowright')) view.pan(right.x * speed * dt, right.z * speed * dt);
      if (keys.has('a') || keys.has('arrowleft')) view.pan(-right.x * speed * dt, -right.z * speed * dt);
    }
    const { distance, pitch } = view.apply(window.innerHeight);
    frame.uTime.value = now / 1000;
    frame.uZoomOut.value = zoomOutAmount(view.pixels);
    world.scenery.update(frame.uTime.value);
    sun.update(view.camera, distance);
    world.update(view.camera, dt);
    renderer.info.reset();
    if (composer) composer.render(dt);
    else renderer.render(scene, view.camera);
    const fps = 1000 / smoothed;
    window.__fps = fps;
    window.__stats = {
      fps: Math.round(fps),
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      quality,
      scale: Number(renderScale.toFixed(2)),
      pixels: Math.round(view.pixels),
      pitch: Math.round(pitch),
      distance: Math.round(distance),
    };
    if (stats) {
      const info = window.__stats;
      stats.textContent = `${info.fps} fps  ${info.calls} draws  ${(Number(info.triangles) / 1000).toFixed(0)}k tris  ${quality}  scale ${info.scale}  unit ${info.pixels}px  pitch ${info.pitch}°`;
    }
    drawMap(mapCtx, map, world.minimap);
    if (!shot) {
      if (smoothed > 20) {
        hot += dt;
        cool = 0;
      } else if (smoothed < 14) {
        cool += dt;
        hot = 0;
      } else {
        hot = 0;
        cool = 0;
      }
      if (hot > 2 && renderScale > 0.6) {
        renderScale = Math.max(0.6, renderScale * 0.9);
        hot = 0;
        resize();
      } else if (cool > 2 && renderScale < 0.999) {
        renderScale = Math.min(1, renderScale / 0.9);
        cool = 0;
        resize();
      }
    }
    if (!window.__ready) window.__ready = true;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function createComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  preset: (typeof PRESETS)[QualityName],
): EffectComposer {
  const composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,
    multisampling: preset.msaa,
  });
  composer.addPass(new RenderPass(scene, camera));
  if (preset.ssao) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const ao = new N8AOPostPass(scene, camera, size.x, size.y);
    ao.autoDetectTransparency = false;
    ao.configuration.transparencyAware = false;
    ao.configuration.aoRadius = 1;
    ao.configuration.intensity = 2;
    ao.configuration.halfRes = preset.ssao === 'half';
    ao.configuration.gammaCorrection = false;
    ao.configuration.colorMultiply = true;
    ao.configuration.screenSpaceRadius = false;
    composer.addPass(ao);
  }
  const effects: Effect[] = [
    new BloomEffect({ luminanceThreshold: 0.9, intensity: 0.25, mipmapBlur: true }),
    new LUT3DEffect(createGradeLut(), { inputColorSpace: THREE.LinearSRGBColorSpace }),
    new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
    new VignetteEffect({ darkness: 0.3, offset: 0.4 }),
  ];
  if (preset.smaa) effects.push(new SMAAEffect());
  composer.addPass(new EffectPass(camera, ...effects));
  return composer;
}

function wireInput(canvas: HTMLCanvasElement, view: RtsCamera, scene: THREE.Scene): void {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let dragging = false;
  canvas.addEventListener('pointerdown', (event) => {
    if (!view.orbiting || event.button !== 0) return;
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
  });
  window.addEventListener('pointerup', () => {
    dragging = false;
  });
  window.addEventListener('pointermove', (event) => {
    if (dragging && view.orbiting) view.yaw -= event.movementX * 0.005;
    ndc.x = (event.clientX / window.innerWidth) * 2 - 1;
    ndc.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(ndc, view.camera);
    const hit = raycaster.intersectObjects(scene.children, true).find((item) => item.object.name !== 'sky');
    if (hit) frame.uCursor.value.set(hit.point.x, hit.point.z);
  });
  canvas.addEventListener('wheel', (event) => {
    if (!view.orbiting) return;
    view.zoomBy(event.deltaY);
  }, { passive: true });
}

function wireQuality(current: QualityName): void {
  document.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((button) => {
    if (button.dataset.q === current) button.classList.add('active');
    button.addEventListener('click', () => {
      const url = new URL(location.href);
      url.searchParams.set('quality', button.dataset.q ?? 'medium');
      location.assign(url.toString());
    });
  });
}

function drawMap(
  ctx: CanvasRenderingContext2D | null,
  canvas: HTMLCanvasElement | null,
  markers: { x: number; z: number; team: 'blue' | 'red'; kind: 'unit' | 'building' }[],
): void {
  if (!ctx || !canvas) return;
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#6f8a45';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#5fa6a0';
  ctx.beginPath();
  ctx.arc(size * 0.72, size * 0.48, 12, 0, Math.PI * 2);
  ctx.fill();
  const plot = (value: number) => ((value + 64) / 128) * size;
  for (const marker of markers) {
    ctx.fillStyle = marker.team === 'blue' ? '#2F6FE0' : '#D8312B';
    const span = marker.kind === 'building' ? 5 : 3;
    ctx.fillRect(plot(marker.x) - span / 2, plot(marker.z) - span / 2, span, span);
  }
}
