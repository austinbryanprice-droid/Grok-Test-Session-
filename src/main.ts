import {
  ACESFilmicToneMapping,
  DirectionalLight,
  PCFShadowMap,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { createAtmosphere, cloudTime } from './atmosphere';
import { createSettlement } from './buildings';
import { Rig } from './camera';
import { createCliffs } from './cliffs';
import { createFoliage, foliageTime } from './foliage';
import { bakeFoliageSprites } from './sprites';
import { applyMaterials } from './lit';
import { CLOUD_SUN_COLOR, LIGHT_DIR, SUN_COLOR } from './look';
import { settlement as homeSite } from './field';
import { noise2, smoothstep } from './noise';
import { createPipeline } from './post';
import { createTerrain, terrainTime } from './terrain';
import { createLibrary } from './textures';
import { createRiver } from './water';

const canvas = document.querySelector<HTMLCanvasElement>('#view');
if (!canvas) throw new Error('Missing canvas');

const library = createLibrary();
const scene = new Scene();
scene.add(createTerrain(library));
const cliffs = createCliffs(library);
scene.add(cliffs.cliff);
scene.add(cliffs.rocks);
const river = createRiver(library);
scene.add(river.mesh);
const settlement = createSettlement(library);
scene.add(settlement.object);
const atmosphere = createAtmosphere(scene);

const rig = new Rig();
rig.frameFar();
rig.bind(canvas);

const home = homeSite();
const sun = new DirectionalLight(SUN_COLOR, 3.35);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.00018;
sun.shadow.normalBias = 0.012;
sun.shadow.radius = 2;
sun.shadow.intensity = 1;
const shadowCamera = sun.shadow.camera;
shadowCamera.near = 12;
shadowCamera.far = 150;
shadowCamera.left = -72;
shadowCamera.right = 72;
shadowCamera.top = 72;
shadowCamera.bottom = -72;
shadowCamera.updateProjectionMatrix();
sun.position.copy(LIGHT_DIR).multiplyScalar(-78).add(new Vector3(home.x, home.y + 3, home.z));
sun.target.position.set(home.x, home.y + 1.5, home.z);
scene.add(sun);
scene.add(sun.target);

const renderer = new WebGLRenderer({
  canvas,
  antialias: false,
  stencil: true,
  powerPreference: 'high-performance',
});
renderer.setClearColor(0xc5d3df, 1);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;
library.setAnisotropy(renderer.capabilities.getMaxAnisotropy());
const sprites = bakeFoliageSprites(renderer);
const foliage = createFoliage(library, sprites);
scene.add(foliage.trunks);
scene.add(foliage.canopies);
scene.add(foliage.volumes);
scene.add(foliage.shrubs);
scene.add(foliage.grass);
scene.add(foliage.wheat);
applyMaterials();

const pmrem = new PMREMGenerator(renderer);
const probe = new Scene();
probe.add(atmosphere.sky);
scene.environment = pmrem.fromScene(probe, 0.04, 1, 700).texture;
scene.environmentIntensity = 0.24;
scene.add(atmosphere.sky);

const pipeline = createPipeline(renderer, scene, rig.camera);
const viewParams = new URLSearchParams(location.search);

const resize = () => {
  const width = window.innerWidth;
  const height = Math.max(1, window.innerHeight);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  rig.camera.aspect = width / height;
  rig.camera.updateProjectionMatrix();
  pipeline.resize(width, height, pixelRatio);
};
resize();
window.addEventListener('resize', resize);

window.__frame = (name) => {
  if (name === 'near') rig.frameNear();
  else rig.frameFar();
};
window.__debug = () => ({
  azimuth: rig.azimuth,
  polar: rig.polar,
  distance: rig.distance,
  target: { x: rig.target.x, y: rig.target.y, z: rig.target.z },
  hdr: pipeline.hdr,
});

let frames = 0;
const started = performance.now();

function tick() {
  try {
    const time = (performance.now() - started) / 1000;
    cloudTime.value = time;
    terrainTime().value = time;
    foliageTime().value = time;
    river.time.value = time;
    settlement.update(time);

    const shade = smoothstep(0.32, 0.74, noise2(time * 0.05, 2.4));
    sun.color.copy(SUN_COLOR).lerp(CLOUD_SUN_COLOR, 1 - shade);
    sun.intensity = 3.35 * (0.86 + 0.14 * shade);

    rig.apply();
    renderer.shadowMap.enabled = true;
    river.renderReflection(renderer, scene, rig.camera);
    renderer.shadowMap.enabled = true;
    if (viewParams.has('plain')) renderer.render(scene, rig.camera);
    else pipeline.composer.render();
    frames += 1;
    if (frames === 2) window.__ready = true;
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    const note = document.createElement('pre');
    note.textContent = message;
    note.style.cssText = 'position:fixed;inset:12px;color:#fff;background:#3a1010;white-space:pre-wrap;z-index:3;margin:0';
    document.body.appendChild(note);
    return;
  }
  requestAnimationFrame(tick);
}

window.__ready = false;
tick();
