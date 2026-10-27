import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SUN_DIRECTION } from './sky';

const GradeShader: THREE.ShaderMaterialParameters = {
  uniforms: {
    tDiffuse: { value: null },
    uSun: { value: new THREE.Vector2(0.2, 0.7) },
    uShafts: { value: 1 },
    uVignette: { value: 0.42 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uSun;
    uniform float uShafts;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      if (uShafts > 0.5) {
        vec2 delta = (uSun - vUv) / 12.0;
        vec3 shafts = vec3(0.0);
        float weight = 0.0;
        for (int i = 0; i < 10; i++) {
          float w = float(i) / 10.0;
          shafts += texture2D(tDiffuse, vUv + delta * w).rgb * (1.0 - w);
          weight += (1.0 - w);
        }
        shafts /= max(weight, 0.001);
        float toward = smoothstep(0.42, 0.0, length(vUv - uSun));
        col += shafts * toward * vec3(1.0, 0.62, 0.28) * 0.07;
      }
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col *= mix(vec3(0.84, 0.93, 1.08), vec3(1.32, 1.04, 0.74), smoothstep(0.02, 0.32, luma));
      col += vec3(0.012, 0.016, 0.026) * (1.0 - smoothstep(0.0, 0.07, luma));
      float vig = smoothstep(0.35, 1.05, length(vUv - 0.5));
      col *= mix(1.0, 1.0 - uVignette, vig);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export interface PostStack {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  grade: ShaderPass;
  setSize: (width: number, height: number) => void;
  updateSun: (camera: THREE.Camera, width: number, height: number) => void;
}

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): PostStack {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.16, 0.32, 1.08);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  return {
    composer,
    bloom,
    grade,
    setSize: (width: number, height: number) => {
      composer.setSize(width, height);
      bloom.setSize(width, height);
    },
    updateSun: (cam: THREE.Camera, width: number, height: number) => {
      const sunWorld = SUN_DIRECTION.clone().multiplyScalar(200);
      const projected = sunWorld.project(cam);
      const sx = (projected.x * 0.5 + 0.5);
      const sy = (projected.y * 0.5 + 0.5);
      grade.uniforms.uSun.value.set(
        THREE.MathUtils.clamp(sx, -0.2, 1.2),
        THREE.MathUtils.clamp(sy, -0.2, 1.2),
      );
      void width;
      void height;
    },
  };
}
