import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type Werewolf = {
  object: any;
  update: (time: number) => void;
};

// Head centroid minus feet centroid in public/werewolf.glb. +z is the larger component,
// which matches the glTF forward axis. Mounted onto local -z below.
const ASSET_FRONT = new THREE.Vector3(0.145, 0, 0.203).normalize();

export async function createWerewolf(): Promise<Werewolf> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync('/werewolf.glb');
  const model = gltf.scene;
  model.traverse((obj: any) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    obj.frustumCulled = false;
  });

  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  const scale = size.y > 0 ? 1.05 / size.y : 1;
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);
  box.setFromObject(model);
  const center = new THREE.Vector3();
  box.getCenter(center);
  model.position.set(-center.x, -box.min.y, -center.z);

  const group = new THREE.Group();
  group.name = 'werewolf';
  group.add(model);
  group.quaternion.setFromUnitVectors(ASSET_FRONT, new THREE.Vector3(0, 0, -1));

  return {
    object: group,
    update: () => {},
  };
}
