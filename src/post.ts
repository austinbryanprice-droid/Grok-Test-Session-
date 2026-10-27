import {
  Color,
  HalfFloatType,
  UnsignedByteType,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color *= mix(vec3(1.0), vec3(1.07, 0.98, 0.86), smoothstep(0.04, 0.55, luma));
      color = max(color, vec3(0.0));
      float vignette = smoothstep(1.05, 0.28, length(vUv - 0.5));
      color *= mix(0.9, 1.0, vignette);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export type Pipeline = {
  composer: EffectComposer;
  hdr: boolean;
  resize: (width: number, height: number, pixelRatio: number) => void;
};

export function createPipeline(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera): Pipeline {
  const hdr = supportsHalfFloat(renderer);
  const composer = hdr
    ? new EffectComposer(renderer)
    : new EffectComposer(renderer, new WebGLRenderTarget(1, 1, { type: UnsignedByteType }));
  composer.addPass(new RenderPass(scene, camera));

  let gtao: GTAOPass | null = null;
  let bloom: UnrealBloomPass | null = null;
  let smaa: SMAAPass | null = null;
  const fxaa = hdr ? null : new ShaderPass(FXAAShader);

  if (hdr) {
    gtao = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
    gtao.blendIntensity = 0.65;
    gtao.updateGtaoMaterial({ radius: 1.7, thickness: 2.2, distanceFallOff: 1.4 });
    composer.addPass(gtao);
    bloom = new UnrealBloomPass(new Vector2(window.innerWidth, window.innerHeight), 0.12, 0.4, 0.92);
    composer.addPass(bloom);
  }

  composer.addPass(new ShaderPass(GradeShader));

  if (hdr) {
    smaa = new SMAAPass(window.innerWidth, window.innerHeight);
    composer.addPass(smaa);
  } else if (fxaa) {
    composer.addPass(fxaa);
  }
  composer.addPass(new OutputPass());

  const resize = (width: number, height: number, pixelRatio: number) => {
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    const bufferWidth = Math.max(1, Math.floor(width * pixelRatio));
    const bufferHeight = Math.max(1, Math.floor(height * pixelRatio));
    gtao?.setSize(bufferWidth, bufferHeight);
    bloom?.setSize(bufferWidth, bufferHeight);
    smaa?.setSize(bufferWidth, bufferHeight);
    if (fxaa) fxaa.uniforms.resolution.value.set(1 / bufferWidth, 1 / bufferHeight);
  };

  return { composer, hdr, resize };
}

function supportsHalfFloat(renderer: WebGLRenderer): boolean {
  const gl = renderer.getContext();
  if (!gl.getExtension('EXT_color_buffer_float')) return false;
  const target = new WebGLRenderTarget(4, 4, { type: HalfFloatType });
  const previous = new Color();
  renderer.getClearColor(previous);
  const alpha = renderer.getClearAlpha();
  renderer.setRenderTarget(target);
  renderer.setClearColor(0xff4400, 1);
  renderer.clear();
  const pixel = new Uint16Array(4);
  let ok = false;
  try {
    renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixel);
    ok = pixel[0] > 0;
  } catch {
    ok = false;
  }
  renderer.setClearColor(previous, alpha);
  renderer.setRenderTarget(null);
  target.dispose();
  return ok;
}
