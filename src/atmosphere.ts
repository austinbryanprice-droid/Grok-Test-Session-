import { FogExp2, HemisphereLight, Mesh, Scene, ShaderMaterial } from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { FOG_COLOR, FOG_DENSITY, GROUND_BOUNCE, LIGHT_DIR, SKY_FILL } from './look';

export const cloudTime = { value: 0 };

export function createAtmosphere(scene: Scene): { sky: Mesh; fill: HemisphereLight } {
  scene.fog = new FogExp2(FOG_COLOR, FOG_DENSITY);

  const sky = new Sky();
  const material = sky.material as ShaderMaterial;
  material.uniforms.turbidity.value = 4.2;
  material.uniforms.rayleigh.value = 2.8;
  material.uniforms.mieCoefficient.value = 0.0065;
  material.uniforms.mieDirectionalG.value = 0.84;
  material.uniforms.sunPosition.value.copy(LIGHT_DIR).multiplyScalar(-1);
  material.uniforms.uCloudTime = cloudTime;
  material.fog = false;
  material.depthWrite = false;
  material.fragmentShader = material.fragmentShader
    .replace(
      'uniform vec3 up;',
      `uniform vec3 up;
       uniform float uCloudTime;
       float cloudHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
       float cloudNoise(vec2 p) {
         vec2 i = floor(p);
         vec2 f = fract(p);
         float a = cloudHash(i);
         float b = cloudHash(i + vec2(1.0, 0.0));
         float c = cloudHash(i + vec2(0.0, 1.0));
         float d = cloudHash(i + vec2(1.0, 1.0));
         vec2 u = f * f * (3.0 - 2.0 * f);
         return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
       }
       float cloudFbm(vec2 p) {
         float v = 0.0;
         float a = 0.5;
         for (int i = 0; i < 5; i++) {
           v += a * cloudNoise(p);
           p = p * 2.03 + vec2(1.7, 9.2);
           a *= 0.5;
         }
         return v;
       }`,
    )
    .replace(
      'vec3 retColor = pow( texColor, vec3( 1.0 / ( 1.2 + ( 1.2 * vSunfade ) ) ) );',
      `vec3 retColor = pow( texColor, vec3( 1.0 / ( 1.2 + ( 1.2 * vSunfade ) ) ) );
       float above = max(direction.y, 0.0);
       vec3 horizon = vec3(0.28, 0.4, 0.62);
       vec3 zenith = vec3(0.12, 0.28, 0.7);
       retColor = mix(horizon, zenith, smoothstep(0.0, 0.55, above));
       float sunFacing = clamp(dot(normalize(direction), normalize(vSunDirection)), 0.0, 1.0);
       retColor = mix(retColor, vec3(0.9, 0.64, 0.32), pow(sunFacing, 6.0) * 0.5);
       retColor += vec3(1.0, 0.78, 0.42) * pow(sunFacing, 56.0);
       vec2 cuv = direction.xz / max(above, 0.12);
       float cloud = cloudFbm(cuv * 1.35 + vec2(uCloudTime * 0.012, uCloudTime * 0.004));
       cloud = smoothstep(0.48, 0.76, cloud) * smoothstep(0.02, 0.22, above);
       vec3 cloudCol = mix(vec3(0.62, 0.68, 0.74), vec3(1.0, 0.9, 0.75), sunFacing);
       retColor = mix(retColor, cloudCol, cloud * 0.72);`,
    );
  material.needsUpdate = true;
  sky.scale.setScalar(700);
  sky.frustumCulled = false;
  scene.add(sky);

  const fill = new HemisphereLight(SKY_FILL, GROUND_BOUNCE, 0.2);
  scene.add(fill);
  return { sky, fill };
}
