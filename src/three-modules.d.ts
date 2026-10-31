declare module 'three/webgpu' {
  const anyValue: any;
  export {
    anyValue as Vector3,
    anyValue as Quaternion,
    anyValue as Matrix4,
    anyValue as CylinderGeometry,
    anyValue as MeshStandardMaterial,
    anyValue as InstancedMesh,
    anyValue as InstancedBufferAttribute,
    anyValue as CanvasTexture,
    anyValue as ConeGeometry,
    anyValue as SphereGeometry,
    anyValue as TorusGeometry,
    anyValue as CircleGeometry,
    anyValue as SkinnedMesh,
    anyValue as BufferGeometry,
    anyValue as BufferAttribute,
    anyValue as Uint16BufferAttribute,
    anyValue as Float32BufferAttribute,
    anyValue as Bone,
    anyValue as Skeleton,
    anyValue as Group,
    anyValue as Color,
    anyValue as Mesh,
    anyValue as DodecahedronGeometry,
    anyValue as Fog,
    anyValue as PerspectiveCamera,
    anyValue as DirectionalLight,
    anyValue as HemisphereLight,
    anyValue as NeutralToneMapping,
    anyValue as SRGBColorSpace,
    anyValue as PCFShadowMap,
    anyValue as RepeatWrapping,
    anyValue as DoubleSide,
    anyValue as RenderPipeline,
    anyValue as CubeTexture,
    anyValue as WebGPURenderer,
    anyValue as Scene,
  };
}

declare module 'three/tsl' {
  export const emissive: any;
  export const mrt: any;
  export const output: any;
  export const pass: any;
}

declare module 'three/addons/controls/OrbitControls.js' {
  export const OrbitControls: any;
}

declare module 'three/addons/tsl/display/BloomNode.js' {
  export const bloom: any;
}

declare module 'three/addons/tsl/display/SharpenNode.js' {
  export const sharpen: any;
}

declare module 'three/addons/utils/BufferGeometryUtils.js' {
  export function mergeGeometries(geometries: any[]): any;
}

interface GPUAdapterInfo {
  description?: string;
  vendor?: string;
  architecture?: string;
}

interface Navigator {
  gpu?: {
    requestAdapter: (options?: { powerPreference?: string }) => Promise<{ info?: GPUAdapterInfo } | null>;
  };
}
