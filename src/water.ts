import {
  Color,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  type DataTexture,
  type Texture,
} from 'three';
import { WORLD_X, WORLD_Z } from './blocks';
import { tuning } from './tuning';

const vertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D uNormal;
  uniform sampler2D uReflection;
  uniform sampler2D uHeight;
  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform vec3 uSunDir;
  uniform float uWaterY;
  varying vec3 vWorld;

  void main() {
    vec2 uv = vWorld.xz / vec2(${WORLD_X.toFixed(1)}, ${WORLD_Z.toFixed(1)});
    float terrainH = texture2D(uHeight, uv).r;
    float depthDiff = uWaterY - terrainH;
    if (depthDiff < -0.04) discard;

    vec2 nUvA = vWorld.xz * 0.09 + vec2(uTime * 0.025, uTime * 0.012);
    vec2 nUvB = vWorld.xz * 0.16 + vec2(-uTime * 0.018, uTime * 0.02);
    vec3 nA = texture2D(uNormal, nUvA).xyz * 2.0 - 1.0;
    vec3 nB = texture2D(uNormal, nUvB).xyz * 2.0 - 1.0;
    vec3 normal = normalize(vec3(nA.x + nB.x, 2.4, nA.y + nB.y));

    vec3 viewDir = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
    vec2 screenUv = gl_FragCoord.xy / uResolution;
    vec2 reflUv = screenUv + normal.xz * 0.035;
    vec3 refl = texture2D(uReflection, reflUv).rgb;

    vec3 deep = vec3(0.04, 0.16, 0.2);
    vec3 shallow = vec3(0.22, 0.48, 0.4);
    vec3 waterCol = mix(shallow, deep, smoothstep(0.15, 2.4, depthDiff));
    float reflectMix = clamp(0.38 + fres * 0.55, 0.0, 0.86);
    vec3 col = mix(waterCol, refl, reflectMix);

    vec3 halfDir = normalize(normalize(uSunDir) + viewDir);
    float spec = pow(max(dot(normal, halfDir), 0.0), 80.0);
    col += vec3(1.0, 0.82, 0.55) * spec * 0.85;

    float foamNoise = 0.65 + 0.35 * sin(vWorld.x * 5.5 + vWorld.z * 4.2 + uTime * 1.8);
    float foam = smoothstep(0.62, 0.05, depthDiff) * foamNoise;
    col = mix(col, vec3(0.86, 0.93, 0.9), foam);

    float dist = distance(cameraPosition, vWorld);
    float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
    col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));

    float alpha = mix(0.78, 0.92, fres) * smoothstep(-0.04, 0.12, depthDiff);
    gl_FragColor = vec4(col, alpha);
  }
`;

export function createWater(heightTex: DataTexture, normalTex: Texture): {
  mesh: Mesh;
  sunDir: Vector3;
  uniforms: {
    uTime: { value: number };
    uResolution: { value: Vector2 };
    uReflection: { value: Texture | null };
  };
} {
  const sunDir = new Vector3(0, 1, 0);
  const uniforms = {
    uNormal: { value: normalTex },
    uReflection: { value: null as Texture | null },
    uHeight: { value: heightTex },
    uTime: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
    uFogColor: { value: new Color(tuning.fogColor) },
    uFogDensity: { value: tuning.fogDensity },
    uSunDir: { value: sunDir },
    uWaterY: { value: tuning.waterY },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new Mesh(new PlaneGeometry(56, 52, 1, 1), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(62, tuning.waterY, 54);
  mesh.renderOrder = 2;
  return {
    mesh,
    sunDir,
    uniforms: {
      uTime: uniforms.uTime,
      uResolution: uniforms.uResolution,
      uReflection: uniforms.uReflection,
    },
  };
}
