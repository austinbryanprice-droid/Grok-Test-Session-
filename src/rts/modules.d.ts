declare module 'n8ao' {
  import type { Camera, Scene } from 'three';
  import { Pass } from 'postprocessing';

  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: {
      aoRadius: number;
      intensity: number;
      halfRes: boolean;
      gammaCorrection: boolean;
      colorMultiply: boolean;
      screenSpaceRadius: boolean;
      transparencyAware: boolean;
      aoSamples: number;
    };
    autoDetectTransparency: boolean;
    setSize(width: number, height: number): void;
  }
}

declare module 'three/addons/csm/CSM.js' {
  import type { Camera, DirectionalLight, Material, Object3D, Vector3 } from 'three';

  export class CSM {
    constructor(data: {
      camera: Camera;
      parent: Object3D;
      cascades?: number;
      maxFar?: number;
      mode?: string;
      shadowMapSize?: number;
      shadowBias?: number;
      lightDirection?: Vector3;
      lightIntensity?: number;
      lightNear?: number;
      lightFar?: number;
      lightMargin?: number;
    });
    lights: DirectionalLight[];
    lightDirection: Vector3;
    cascades: number;
    update(): void;
    updateFrustums(): void;
    setupMaterial(material: Material): void;
    dispose(): void;
    remove(): void;
  }
}
