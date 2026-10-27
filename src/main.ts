import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  PMREMGenerator,
  Scene,
  ShaderChunk,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import { createAtmosphere, cloudTime } from './atmosphere';
import { createSettlement } from './buildings';
import { Rig } from './camera';
import { createCliffs } from './cliffs';
import { createFoliage, foliageTime } from './foliage';
import { applyCSM } from './lit';
import { CLOUD_SUN_COLOR, LIGHT_DIR, SUN_COLOR } from './look';
import { smoothstep, noise2 } from './noise';
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
const foliage = createFoliage(library);
scene.add(foliage.trunks);
scene.add(foliage.canopies);
scene.add(foliage.shrubs);
scene.add(foliage.grass);
const settlement = createSettlement(library);
scene.add(settlement.object);
const atmosphere = createAtmosphere(scene);

const rig = new Rig();
rig.frameFar();
rig.bind(canvas);

const csm = new CSM({
  camera: rig.camera,
  parent: scene,
  cascades: 3,
  maxFar: 190,
  mode: 'practical',
  shadowMapSize: 2048,
  shadowBias: -0.00012,
  lightDirection: LIGHT_DIR.clone(),
  lightIntensity: 2.15,
  lightNear: 1,
  lightFar: 800,
  lightMargin: 120,
});
csm.fade = true;
ShaderChunk.lights_fragment_begin = ShaderChunk.lights_fragment_begin.replaceAll(
  'getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowBias,',
  'getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias,',
);
for (const light of csm.lights) {
  light.color.copy(SUN_COLOR);
  light.shadow.normalBias = 0.04;
  light.shadow.radius = 2.4;
  light.shadow.mapSize.set(2048, 2048);
}
applyCSM(csm);
csm.updateFrustums();

const renderer = new WebGLRenderer({
  canvas,
  antialias: false,
  stencil: true,
  powerPreference: 'high-performance',
});
renderer.setClearColor(0xd7c4aa, 1);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
library.setAnisotropy(renderer.capabilities.getMaxAnisotropy());

const pmrem = new PMREMGenerator(renderer);
const probe = new Scene();
probe.add(atmosphere.sky);
scene.environment = pmrem.fromScene(probe, 0.04, 1, 700).texture;
scene.environmentIntensity = 0.48;
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
  csm.updateFrustums();
};
resize();
window.addEventListener('resize', resize);

window.__frame = (name) => {
  if (name === 'near') rig.frameNear();
  else rig.frameFar();
  csm.updateFrustums();
  csm.update();
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
    for (const light of csm.lights) {
      light.color.copy(SUN_COLOR).lerp(CLOUD_SUN_COLOR, 1 - shade);
      light.intensity = 2.15 * (0.82 + 0.18 * shade);
    }

    rig.apply();
    csm.update();
    river.renderReflection(renderer, scene, rig.camera);
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
