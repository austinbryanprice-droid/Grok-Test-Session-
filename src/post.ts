import { NoBlending, Vector2, WebGLRenderer, type Texture } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { tuning } from './tuning';

const blitShader = {
  uniforms: { tScene: { value: null as Texture | null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tScene;
    varying vec2 vUv;
    void main() {
      gl_FragColor = texture2D(tScene, vUv);
    }
  `,
};

const gradeShader = {
  uniforms: {
    tDiffuse: { value: null as Texture | null },
    uTime: { value: 0 },
    uGrain: { value: tuning.grain },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    varying vec2 vUv;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float vig = smoothstep(0.96, 0.38, length(vUv - 0.5));
      col *= mix(0.76, 1.0, vig);
      float g = hash(vUv * vec2(1600.0, 900.0) + fract(uTime * 0.37) * 17.0) - 0.5;
      col += g * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createComposer(renderer: WebGLRenderer, sceneTexture: Texture): {
  composer: EffectComposer;
  time: { value: number };
  setSize: (width: number, height: number) => void;
} {
  const composer = new EffectComposer(renderer);
  const blit = new ShaderPass(blitShader);
  blit.uniforms.tScene.value = sceneTexture;
  blit.material.blending = NoBlending;
  blit.clear = true;

  const bloom = new UnrealBloomPass(
    new Vector2(window.innerWidth, window.innerHeight),
    tuning.bloomStrength,
    tuning.bloomRadius,
    tuning.bloomThreshold,
  );

  const grade = new ShaderPass(gradeShader);
  grade.material.blending = NoBlending;
  grade.clear = true;

  const output = new OutputPass();
  composer.addPass(blit);
  composer.addPass(bloom);
  composer.addPass(grade);
  composer.addPass(output);

  return {
    composer,
    time: grade.uniforms.uTime,
    setSize: (width: number, height: number) => {
      composer.setSize(width, height);
      bloom.setSize(width, height);
    },
  };
}
