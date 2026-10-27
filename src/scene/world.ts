import * as THREE from 'three';
import { PRESETS, type QualityName } from '../presets';
import { createStructures, structureMaterialArray } from '../voxels/blocks';
import { createFoliage, updateWind, type Foliage } from './foliage';
import { createPost, type PostStack } from './post';
import { SUN_DIRECTION, createSky, updateSky } from './sky';
import { createTerrain } from './terrain';
import { createWater, type WaterSystem } from './water';

export interface World {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  water: WaterSystem;
  foliage: Foliage;
  sky: THREE.Mesh;
  post: PostStack;
  sun: THREE.DirectionalLight;
  blockMaterial: THREE.MeshStandardMaterial;
  setQuality: (name: QualityName) => void;
  render: (time: number) => void;
  resize: () => void;
}

export function createWorld(canvas: HTMLCanvasElement, quality: QualityName, terrainMode: 'net' | 'height'): World {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xc9b59a, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd2b894, 78, 280);
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(48, 1, 0.15, 640);

  const hemi = new THREE.HemisphereLight(0xc5d4ff, 0xc4a07a, 0.5);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffb15a, 3.15);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(90);
  sun.castShadow = true;
  sun.shadow.camera.near = 8;
  sun.shadow.camera.far = 200;
  const shadowCam = sun.shadow.camera as THREE.OrthographicCamera;
  shadowCam.left = -72;
  shadowCam.right = 72;
  shadowCam.top = 72;
  shadowCam.bottom = -72;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.035;
  sun.target.position.set(62, 12, 76);
  scene.add(sun);
  scene.add(sun.target);

  const sky = createSky();
  scene.add(sky);
  scene.add(createTerrain(terrainMode));
  const water = createWater();
  scene.add(water.mesh);
  const foliage = createFoliage(PRESETS.ultra);
  scene.add(foliage.trunks, foliage.crowns, foliage.grass, foliage.rocks, foliage.flowers, foliage.reeds);
  const structures = createStructures(structureMaterialArray());
  scene.add(structures.mesh);

  const post = createPost(renderer, scene, camera);
  const resolution = new THREE.Vector2();
  let reflection = true;

  const applyBuffer = () => {
    const width = window.innerWidth;
    const height = Math.max(1, window.innerHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    post.composer.setPixelRatio(renderer.getPixelRatio());
    post.setSize(width, height);
  };

  const setQuality = (name: QualityName) => {
    const preset = PRESETS[name];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio));
    sun.shadow.mapSize.set(preset.shadow, preset.shadow);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    post.bloom.enabled = preset.bloom;
    post.grade.uniforms.uShafts.value = preset.shafts ? 1 : 0;
    foliage.applyCounts(preset);
    reflection = preset.reflection;
    applyBuffer();
  };

  setQuality(quality);

  return {
    scene,
    renderer,
    camera,
    water,
    foliage,
    sky,
    post,
    sun,
    blockMaterial: structures.material,
    setQuality,
    resize: applyBuffer,
    render: (time: number) => {
      updateSky(sky, time);
      updateWind(foliage, time);
      renderer.getDrawingBufferSize(resolution);
      water.update(time, reflection, resolution);
      if (reflection) water.renderReflection(renderer, scene, camera);
      post.updateSun(camera, resolution.x, resolution.y);
      post.composer.render();
    },
  };
}
