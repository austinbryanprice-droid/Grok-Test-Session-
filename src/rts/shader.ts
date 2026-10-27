import * as THREE from 'three';
import type { CSM } from 'three/addons/csm/CSM.js';
import { frame } from './frame';
import type { TerrainTextures } from './textures';

export type LitKind = 'lit' | 'vat' | 'foliage' | 'flag' | 'terrain' | 'silhouette';

export interface LitOptions {
  kind: LitKind;
  team?: THREE.Color;
  vatPos?: THREE.Texture;
  vatNrm?: THREE.Texture;
  vatSize?: THREE.Vector2;
  terrain?: TerrainTextures;
  csm: CSM | null;
}

const TERRAIN_PARS = /* glsl */`
uniform sampler2DArray tLayers;
uniform sampler2DArray tLayerN;
uniform sampler2D tSplat;
uniform sampler2D tMacro;
uniform sampler2D tCloud;
uniform sampler2D uFowMap;
uniform vec2 uCloudOffset;
uniform float uMapSize;
uniform float uTime;
uniform vec3 uSunTravel;
uniform vec3 uRimColor;
uniform float uZoomOut;
uniform vec3 uTeamColor;
uniform vec2 uCursor;
varying vec3 vWorld;
varying float vTeamMask;
varying vec3 vTeamLit;
varying vec2 vSurface;
`;

const VAT_VERTEX = /* glsl */`
uniform sampler2D uVatPos;
uniform sampler2D uVatNrm;
uniform vec2 uVatSize;
attribute vec4 aAnim;
vec2 vatUv(float frame) {
  return (vec2(float(gl_VertexID), frame) + 0.5) / uVatSize;
}
void vatSample(out vec3 posed, out vec3 posedNormal) {
  float frameF = mod(uTime * aAnim.z + aAnim.w, max(aAnim.y, 1.0));
  float f0 = floor(frameF);
  float f1 = mod(f0 + 1.0, max(aAnim.y, 1.0));
  float blend = fract(frameF);
  vec3 p0 = texture2D(uVatPos, vatUv(aAnim.x + f0)).xyz;
  vec3 p1 = texture2D(uVatPos, vatUv(aAnim.x + f1)).xyz;
  vec3 n0 = texture2D(uVatNrm, vatUv(aAnim.x + f0)).xyz;
  vec3 n1 = texture2D(uVatNrm, vatUv(aAnim.x + f1)).xyz;
  posed = mix(p0, p1, blend);
  posedNormal = normalize(mix(n0, n1, blend));
}
`;

function cacheKey(options: LitOptions): string {
  return `march-${options.kind}-csm${options.csm?.cascades ?? 0}`;
}

export function bindLit(material: THREE.Material, options: LitOptions): void {
  const previous = options.csm ? undefined : material.onBeforeCompile;
  if (options.csm) options.csm.setupMaterial(material);
  const csmCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (options.csm) csmCompile.call(material, shader, renderer);
    else previous?.call(material, shader, renderer);
    inject(shader, options);
  };
  material.customProgramCacheKey = () => cacheKey(options);
  material.needsUpdate = true;
}

function inject(shader: THREE.WebGLProgramParametersWithUniforms, options: LitOptions): void {
  shader.uniforms.uTime = frame.uTime;
  shader.uniforms.uZoomOut = frame.uZoomOut;
  shader.uniforms.uSunTravel = frame.uSunTravel;
  shader.uniforms.uRimColor = frame.uRimColor;
  shader.uniforms.uFowMap = frame.uFowMap;
  shader.uniforms.uMapSize = frame.uMapSize;
  shader.uniforms.uCloudOffset = frame.uCloudOffset;
  shader.uniforms.uCursor = frame.uCursor;
  shader.uniforms.uTeamColor = { value: (options.team ?? new THREE.Color(0xffffff)).clone() };
  if (options.vatPos && options.vatNrm && options.vatSize) {
    shader.uniforms.uVatPos = { value: options.vatPos };
    shader.uniforms.uVatNrm = { value: options.vatNrm };
    shader.uniforms.uVatSize = { value: options.vatSize };
  }
  if (options.terrain) {
    shader.uniforms.tLayers = { value: options.terrain.layers };
    shader.uniforms.tLayerN = { value: options.terrain.normals };
    shader.uniforms.tSplat = { value: options.terrain.splat };
    shader.uniforms.tMacro = { value: options.terrain.macro };
    shader.uniforms.tCloud = { value: options.terrain.cloud };
  }

  const teamAttribute = options.kind === 'vat' || options.kind === 'silhouette'
    ? 'attribute vec3 aTeamColor;\n'
    : '';
  const attributes = options.kind === 'terrain'
    ? ''
    : `attribute float aTeamMask;\nattribute vec2 aSurface;\nattribute float aWind;\n${teamAttribute}`;
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform vec3 uTeamColor;\n${options.kind === 'vat' || options.kind === 'silhouette' ? VAT_VERTEX : ''}\n${attributes}varying vec3 vWorld;\nvarying float vTeamMask;\nvarying vec3 vTeamLit;\nvarying vec2 vSurface;\n`);

  shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', beginNormal(options.kind));
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', beginVertex(options.kind));
  if (options.kind === 'terrain') shader.vertexShader = `#define MARCH_TERRAIN\n${shader.vertexShader}`;
  if (options.kind === 'vat' || options.kind === 'silhouette') shader.vertexShader = `#define MARCH_VAT\n${shader.vertexShader}`;
  shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n${WORLD_VARYING}`);

  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${TERRAIN_PARS}`);

  if (options.kind === 'terrain') {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', TERRAIN_MAP);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', TERRAIN_NORMAL);
  }

  shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n${options.kind === 'silhouette' ? SILHOUETTE_COLOR : TEAM_COLOR}\n${FOW_COLOR}`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${options.kind === 'terrain' ? TERRAIN_ROUGH : SURFACE_ROUGH}`);

  if (options.kind === 'foliage' || options.kind === 'lit' || options.kind === 'vat' || options.kind === 'flag') {
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>\n${options.kind === 'foliage' ? FOLIAGE_RIM : RIM_LIGHT}`);
  }
  if (options.kind === 'foliage') {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `${FOLIAGE_DITHER}\n#include <opaque_fragment>`);
  }
}

const WORLD_VARYING = /* glsl */`
vec4 marchWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  marchWorld = instanceMatrix * marchWorld;
#endif
marchWorld = modelMatrix * marchWorld;
vWorld = marchWorld.xyz;
#if defined(MARCH_TERRAIN)
  vTeamMask = 0.0;
  vSurface = vec2(0.94, 0.0);
  vTeamLit = vec3(1.0);
#elif defined(MARCH_VAT)
  vTeamMask = aTeamMask;
  vSurface = aSurface;
  vTeamLit = aTeamColor;
#else
  vTeamMask = aTeamMask;
  vSurface = aSurface;
  vTeamLit = uTeamColor;
#endif
`;

function beginNormal(kind: LitKind): string {
  if (kind === 'vat') {
    return /* glsl */`
vec3 vatPos;
vec3 vatNrm;
vatSample(vatPos, vatNrm);
vec3 objectNormal = vatNrm;
#ifdef USE_TANGENT
  vec3 objectTangent = vec3(tangent.xyz);
#endif
`;
  }
  return '#include <beginnormal_vertex>';
}

function beginVertex(kind: LitKind): string {
  if (kind === 'vat') return 'vec3 transformed = vatPos;';
  if (kind === 'silhouette') {
    return /* glsl */`
vec3 vatPos;
vec3 vatNrm;
vatSample(vatPos, vatNrm);
vec3 transformed = vatPos;
`;
  }
  if (kind === 'foliage') {
    return /* glsl */`
#include <begin_vertex>
vec3 instOffset = vec3(0.0);
#ifdef USE_INSTANCING
  instOffset = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#endif
float phase = instOffset.x * 0.17 + instOffset.z * 0.13;
float sway = sin(uTime * 0.65 + phase) * 0.22 + sin(uTime * 1.15 + phase * 1.7) * 0.07;
transformed.x += sway * uv.y;
transformed.z += cos(uTime * 0.55 + phase) * 0.16 * uv.y;
`;
  }
  if (kind === 'flag') {
    return /* glsl */`
#include <begin_vertex>
float flutter = sin(uTime * 2.1 + position.x * 1.7 + position.y * 0.4) * aWind;
transformed.x += flutter * 0.35;
transformed.z += cos(uTime * 1.6 + position.x * 1.3) * aWind * 0.22;
`;
  }
  return '#include <begin_vertex>';
}

const TEAM_COLOR = /* glsl */`
float luma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
float boost = mix(1.0, 1.22, clamp(uZoomOut, 0.0, 1.0));
vec3 teamTint = luma * vTeamLit * 1.2 * boost;
float teamMask = clamp(vTeamMask * mix(1.0, 1.12, clamp(uZoomOut, 0.0, 1.0)), 0.0, 1.0);
diffuseColor.rgb = mix(diffuseColor.rgb, teamTint, teamMask);
`;

const SILHOUETTE_COLOR = /* glsl */`
diffuseColor.rgb = vTeamLit;
`;

const FOW_COLOR = /* glsl */`
float vis = texture2D(uFowMap, vWorld.xz / uMapSize + vec2(0.5)).r;
float lumaF = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
vec3 explored = mix(vec3(lumaF), diffuseColor.rgb, 0.4) * 0.65;
vec3 hidden = diffuseColor.rgb * 0.12;
float hiddenW = 1.0 - smoothstep(0.2, 0.45, vis);
float exploredW = smoothstep(0.2, 0.45, vis) * (1.0 - smoothstep(0.7, 0.9, vis));
float visibleW = smoothstep(0.7, 0.9, vis);
diffuseColor.rgb = hidden * hiddenW + explored * exploredW + diffuseColor.rgb * visibleW;
`;

const SURFACE_ROUGH = /* glsl */`
roughnessFactor = clamp(vSurface.x, 0.04, 1.0);
metalnessFactor = clamp(vSurface.y, 0.0, 1.0);
`;

const TERRAIN_ROUGH = /* glsl */`
roughnessFactor = mix(mix(mix(0.94, 0.9, blendW.g), 0.96, blendW.b), 0.9, blendW.a);
metalnessFactor = 0.0;
`;

const TERRAIN_MAP = /* glsl */`
vec2 wuv = clamp(vWorld.xz / uMapSize + vec2(0.5), 0.001, 0.999);
vec4 splat = texture2D(tSplat, wuv);
vec2 tuv = vWorld.xz / 4.0;
vec4 l0 = texture2D(tLayers, vec3(tuv, 0.0));
vec4 l1 = texture2D(tLayers, vec3(tuv, 1.0));
vec4 l2 = texture2D(tLayers, vec3(tuv * 0.85, 2.0));
vec4 l3 = texture2D(tLayers, vec3(tuv * 0.7, 3.0));
l0.rgb = sRGBTransferEOTF(vec4(l0.rgb, 1.0)).rgb;
l1.rgb = sRGBTransferEOTF(vec4(l1.rgb, 1.0)).rgb;
l2.rgb = sRGBTransferEOTF(vec4(l2.rgb, 1.0)).rgb;
l3.rgb = sRGBTransferEOTF(vec4(l3.rgb, 1.0)).rgb;
vec4 heights = vec4(l0.a, l1.a, l2.a, l3.a);
float maxH = max(max(heights.r, heights.g), max(heights.b, heights.a));
vec4 blendW = splat * max(heights - maxH + 0.22, 0.0);
float blendSum = dot(blendW, vec4(1.0)) + 0.0001;
blendW /= blendSum;
vec3 albedo = l0.rgb * blendW.r + l1.rgb * blendW.g + l2.rgb * blendW.b + l3.rgb * blendW.a;
vec3 macro = texture2D(tMacro, wuv).rgb * 2.0;
albedo *= macro;
float cloud = texture2D(tCloud, vWorld.xz * 0.02 + uCloudOffset).r;
albedo *= mix(1.0, 0.85, smoothstep(0.45, 0.82, cloud));
diffuseColor.rgb *= albedo;
`;

const TERRAIN_NORMAL = /* glsl */`
vec3 n0 = texture2D(tLayerN, vec3(tuv, 0.0)).xyz * 2.0 - 1.0;
vec3 n1 = texture2D(tLayerN, vec3(tuv, 1.0)).xyz * 2.0 - 1.0;
vec3 n2 = texture2D(tLayerN, vec3(tuv * 0.85, 2.0)).xyz * 2.0 - 1.0;
vec3 n3 = texture2D(tLayerN, vec3(tuv * 0.7, 3.0)).xyz * 2.0 - 1.0;
vec3 mapN = n0 * blendW.r + n1 * blendW.g + n2 * blendW.b + n3 * blendW.a;
mapN.xy *= 0.65;
normal = normalize(normal + vec3(mapN.x, mapN.y, 0.0));
`;

const RIM_LIGHT = /* glsl */`
totalEmissiveRadiance += pow(1.0 - saturate(dot(normal, geometryViewDir)), 4.0) * uRimColor * 0.2;
`;

const FOLIAGE_RIM = /* glsl */`
totalEmissiveRadiance += pow(1.0 - saturate(dot(normal, geometryViewDir)), 4.0) * uRimColor * 0.12;
vec3 sunV = normalize(mat3(viewMatrix) * uSunTravel);
float trans = pow(saturate(dot(geometryViewDir, -sunV)), 3.0);
totalEmissiveRadiance += trans * vec3(0.72, 0.78, 0.28) * 0.35;
`;

const FOLIAGE_DITHER = /* glsl */`
float cursorDist = distance(vWorld.xz, uCursor);
if (cursorDist < 5.0) {
  float keep = mix(0.45, 1.0, cursorDist / 5.0);
  if (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) > keep) discard;
}
`;

export const WATER_VERTEX = /* glsl */`
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

export const WATER_FRAGMENT = /* glsl */`
uniform sampler2D tShore;
uniform sampler2D tWave;
uniform float uTime;
uniform vec3 uSunTravel;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec2 uShoreOrigin;
uniform float uShoreSpan;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 uv = vWorld.xz * 0.08;
  vec3 n1 = texture2D(tWave, uv + vec2(uTime * 0.015, uTime * 0.008)).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(tWave, uv * 1.7 + vec2(-uTime * 0.012, uTime * 0.02)).xyz * 2.0 - 1.0;
  vec3 normal = normalize(vec3((n1.xy + n2.xy) * 0.18, 1.0));
  vec2 shoreUv = (vWorld.xz - uShoreOrigin) / uShoreSpan;
  vec4 shore = texture2D(tShore, shoreUv);
  if (shore.b < 0.5) discard;
  float deep = shore.r;
  float shoreDist = shore.g * 8.0;
  vec3 water = mix(uShallow, uDeep, smoothstep(0.05, 0.85, deep));
  vec3 bottom = vec3(0.62, 0.58, 0.42);
  water = mix(bottom, water, smoothstep(0.0, 0.35, deep));
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - saturate(dot(viewDir, normalize(normal))), 3.0);
  vec3 sky = mix(uSkyHorizon, uSkyTop, 0.35);
  vec3 color = mix(water, sky, fres * 0.55);
  vec3 halfV = normalize(viewDir + normalize(-uSunTravel));
  float spec = pow(saturate(dot(normalize(normal), halfV)), 96.0);
  color += spec * vec3(1.0, 0.96, 0.88) * 1.15;
  float foam = (1.0 - smoothstep(0.2, 0.95, shoreDist)) * (0.65 + 0.35 * sin(uTime * 1.6 + shoreDist * 5.0 + vWorld.x * 0.4));
  foam *= smoothstep(0.0, 0.08, shoreDist);
  color = mix(color, vec3(0.93, 0.95, 0.92), clamp(foam, 0.0, 1.0));
  gl_FragColor = vec4(color, 1.0);
  #include <fog_fragment>
}
`;
