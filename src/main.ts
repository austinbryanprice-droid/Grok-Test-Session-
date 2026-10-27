import {
  ACESFilmicToneMapping,
  DirectionalLight,
  FogExp2,
  HalfFloatType,
  HemisphereLight,
  LinearSRGBColorSpace,
  MeshStandardMaterial,
  OrthographicCamera,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';
import { createAtlas } from './atlas';
import { createDust, createFoliage, swayTime } from './foliage';
import { createPlayer } from './player';
import { createComposer } from './post';
import { createSky } from './sky';
import { tuning } from './tuning';
import { createWater } from './water';
import { createWorld } from './world';

declare global {
  interface Window {
    __ready: boolean;
    __debug: () => unknown;
    __frame: (mode: string) => void;
  }
}

function boot(): void {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(tuning.fogColor, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = tuning.exposure;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.localClippingEnabled = true;
  document.body.prepend(renderer.domElement);

  const scene = new Scene();
  scene.fog = new FogExp2(tuning.fogColor, tuning.fogDensity);

  const camera = new PerspectiveCamera(tuning.cameraFov, window.innerWidth / window.innerHeight, 0.1, 800);
  const atlas = createAtlas();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  atlas.color.anisotropy = Math.min(8, maxAniso);
  atlas.normal.anisotropy = Math.min(8, maxAniso);
  atlas.waterNormal.anisotropy = Math.min(8, maxAniso);

  const material = new MeshStandardMaterial({
    map: atlas.color,
    normalMap: atlas.normal,
    roughness: 0.85,
    metalness: 0,
    vertexColors: true,
  });
  material.toneMapped = false;
  material.normalScale.set(1.2, 1.2);

  const world = createWorld(material);
  for (const mesh of world.terrain) scene.add(mesh);
  scene.add(world.foundation, world.roof);
  for (const wall of world.walls) scene.add(wall.mesh);

  const player = createPlayer();
  player.place(world.playerStart.x, world.playerStart.y, world.playerStart.z);
  scene.add(player.group);

  const foliage = createFoliage(atlas.color, world.surfaceBlock, world.groundY);
  scene.add(foliage.grass, foliage.flowers);
  const dust = createDust();
  scene.add(dust.points);

  const sky = createSky();
  scene.add(sky.mesh);

  const water = createWater(world.heightTex, atlas.waterNormal);
  const waterScene = new Scene();
  waterScene.add(water.mesh);

  const hemi = new HemisphereLight(tuning.hemiSky, tuning.hemiGround, tuning.hemiIntensity);
  scene.add(hemi);
  const sun = new DirectionalLight(tuning.sunColor, tuning.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(tuning.shadowMapSize, tuning.shadowMapSize);
  sun.shadow.bias = tuning.shadowBias;
  sun.shadow.normalBias = tuning.shadowNormalBias;
  const shadowCam = sun.shadow.camera as OrthographicCamera;
  const extent = tuning.shadowExtent;
  shadowCam.left = -extent;
  shadowCam.right = extent;
  shadowCam.top = extent;
  shadowCam.bottom = -extent;
  shadowCam.near = 1;
  shadowCam.far = 180;
  shadowCam.updateProjectionMatrix();
  scene.add(sun, sun.target);

  const elev = (tuning.sunElevationDeg * Math.PI) / 180;
  const az = (tuning.sunAzimuthDeg * Math.PI) / 180;
  const sunVector = new Vector3(Math.cos(elev) * Math.cos(az), Math.sin(elev), Math.cos(elev) * Math.sin(az)).normalize();

  const sceneRT = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: true });
  sceneRT.texture.colorSpace = LinearSRGBColorSpace;
  const reflectionRT = new WebGLRenderTarget(1024, 1024, { type: HalfFloatType });
  reflectionRT.texture.colorSpace = LinearSRGBColorSpace;
  water.uniforms.uReflection.value = reflectionRT.texture;

  const post = createComposer(renderer, sceneRT.texture);
  const clipPlane = new Plane(new Vector3(0, 1, 0), 10000);
  renderer.clippingPlanes = [clipPlane];

  const keys = new Set<string>();
  window.addEventListener('keydown', (event) => keys.add(event.code));
  window.addEventListener('keyup', (event) => keys.delete(event.code));

  const desired = new Vector3();
  const lookTarget = new Vector3();
  const forward = new Vector3();
  const right = new Vector3();
  const focus = new Vector3();
  const up = new Vector3(0, 1, 0);
  const reflCam = new PerspectiveCamera(tuning.cameraFov, 1, 0.1, 800);
  const raycaster = new Raycaster();
  const fadeables = [{ mesh: world.roof, material: world.roofMaterial }, ...world.walls];
  let yaw = 0;
  let snap = true;
  let frames = 0;
  let sceneCalls = 0;
  let last = performance.now();

  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    const buffer = renderer.getDrawingBufferSize(new Vector2());
    sceneRT.setSize(buffer.x, buffer.y);
    water.uniforms.uResolution.value.copy(buffer);
    post.setSize(width, height);
  };
  window.addEventListener('resize', resize);
  resize();

  const renderReflection = () => {
    clipPlane.constant = -tuning.waterY;
    reflCam.fov = camera.fov;
    reflCam.aspect = camera.aspect;
    reflCam.position.copy(camera.position);
    reflCam.position.y = tuning.waterY * 2 - camera.position.y;
    camera.getWorldDirection(forward);
    forward.y = -forward.y;
    reflCam.up.set(0, -1, 0);
    lookTarget.copy(reflCam.position).add(forward);
    reflCam.lookAt(lookTarget);
    reflCam.updateProjectionMatrix();
    renderer.setRenderTarget(reflectionRT);
    renderer.clear();
    renderer.render(scene, reflCam);
    renderer.setRenderTarget(null);
    clipPlane.constant = 10000;
  };

  const animate = () => {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
    forward.normalize();
    right.crossVectors(up, forward).normalize();

    let mx = 0;
    let mz = 0;
    if (keys.has('KeyW')) {
      mx += forward.x;
      mz += forward.z;
    }
    if (keys.has('KeyS')) {
      mx -= forward.x;
      mz -= forward.z;
    }
    if (keys.has('KeyD')) {
      mx += right.x;
      mz += right.z;
    }
    if (keys.has('KeyA')) {
      mx -= right.x;
      mz -= right.z;
    }
    const moving = mx * mx + mz * mz > 1e-6;
    if (moving) {
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
      const speed = (keys.has('ShiftLeft') ? 9 : 6) * dt;
      const nx = player.group.position.x + mx * speed;
      const nz = player.group.position.z + mz * speed;
      const gy = world.groundY(nx, nz);
      if (gy >= tuning.waterY - 0.05 && !world.blocked(nx, gy, nz)) {
        player.group.position.set(nx, gy, nz);
      }
      yaw = Math.atan2(mx, mz);
    }
    player.update(dt, moving, yaw);
    swayTime.value += dt;
    water.uniforms.uTime.value += dt;
    post.time.value += dt;
    dust.update(dt);

    const pitch = (tuning.cameraPitchDeg * Math.PI) / 180;
    const back = tuning.cameraHeight / Math.tan(pitch);
    desired.set(
      player.group.position.x - Math.sin(yaw) * back,
      player.group.position.y + tuning.cameraHeight,
      player.group.position.z - Math.cos(yaw) * back,
    );
    camera.position.lerp(desired, snap ? 1 : 1 - (1 - tuning.followLerp) ** (dt * 60));
    lookTarget.set(player.group.position.x, player.group.position.y + 1.1, player.group.position.z);
    camera.lookAt(lookTarget);
    snap = false;

    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 1e-6) forward.normalize();
    else forward.set(0, 0, 1);
    focus.copy(player.group.position).addScaledVector(forward, 8);
    sun.position.copy(focus).addScaledVector(sunVector, 90);
    sun.target.position.copy(focus);
    sky.sunDir.copy(sunVector);
    water.sunDir.copy(sunVector);

    const aim = player.group.position.clone();
    aim.y += 1.2;
    const dir = aim.sub(camera.position.clone());
    const dist = dir.length();
    if (dist > 0.001) {
      dir.multiplyScalar(1 / dist);
      raycaster.set(camera.position, dir);
      raycaster.near = 0;
      raycaster.far = dist;
      const hit = new Set(raycaster.intersectObjects(fadeables.map((piece) => piece.mesh), false).map((item) => item.object));
      const px = player.group.position.x;
      const pz = player.group.position.z;
      const underRoof =
        px > world.hutBounds.x0 - 0.4 &&
        px < world.hutBounds.x1 + 1.4 &&
        pz > world.hutBounds.z0 - 0.4 &&
        pz < world.hutBounds.z1 + 1.4;
      for (const piece of fadeables) {
        const roofBlocks = piece.mesh === world.roof && underRoof;
        const target = hit.has(piece.mesh) || roofBlocks ? 0.12 : 1;
        piece.material.opacity += (target - piece.material.opacity) * 0.25;
        piece.material.depthWrite = piece.material.opacity > 0.85;
      }
    }

    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(sceneRT);
    renderer.clear();
    renderer.render(scene, camera);
    sceneCalls = renderer.info.render.calls;
    renderer.shadowMap.needsUpdate = false;
    renderReflection();
    renderer.setRenderTarget(sceneRT);
    renderer.autoClear = false;
    renderer.render(waterScene, camera);
    renderer.autoClear = true;
    renderer.setRenderTarget(null);
    post.composer.render();

    frames += 1;
    if (frames === 3) window.__ready = true;
  };

  window.__frame = (mode: string) => {
    if (mode === 'inside') {
      player.place(world.inside.x, world.floorY, world.inside.z);
      yaw = 0;
      snap = true;
    }
    if (mode === 'hero') {
      player.place(world.playerStart.x, world.playerStart.y, world.playerStart.z);
      yaw = 0;
      snap = true;
    }
  };
  window.__debug = () => ({
    sceneCalls,
    chunks: world.chunkCount,
    player: player.group.position.toArray(),
    floorY: world.floorY,
    start: world.playerStart,
  });
  window.__ready = false;
  animate();
}

try {
  boot();
} catch (error) {
  const hint = document.getElementById('hint');
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  if (hint) hint.textContent = message;
}
