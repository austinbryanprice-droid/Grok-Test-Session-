import { Mesh, PlaneGeometry, Vector4 } from 'three';
import { WORLD, computeHeight, crops } from './field';
import { lit } from './lit';
import type { Library } from './textures';

const time = { value: 0 };

export function terrainTime(): { value: number } {
  return time;
}

export function createTerrain(library: Library): Mesh {
  const segments = 256;
  const geometry = new PlaneGeometry(WORLD, WORLD, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    position.setY(i, computeHeight(x, z));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  const normals = geometry.attributes.normal;
  let normalY = 0;
  for (let i = 0; i < normals.count; i += 1) normalY += normals.getY(i);
  if (normalY < 0 && geometry.index) {
    const index = geometry.index;
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const c = index.getX(i + 2);
      index.setX(i, c);
      index.setX(i + 2, a);
    }
    geometry.computeVertexNormals();
  }
  geometry.computeTangents();
  geometry.computeBoundingSphere();

  const material = lit(
    {
      map: library.grass.color,
      normalMap: library.grass.normal,
      roughness: 1,
      metalness: 0,
      envMapIntensity: 0.42,
    },
    (entry) => {
      const previous = entry.onBeforeCompile;
      entry.onBeforeCompile = (shader, renderer) => {
        previous(shader, renderer);
        shader.uniforms.uSplat = { value: library.splat };
        shader.uniforms.uCloud = { value: library.cloud };
        shader.uniforms.uDirtMap = { value: library.dirt.color };
        shader.uniforms.uMudMap = { value: library.mud.color };
        shader.uniforms.uRockMap = { value: library.rock.color };
        shader.uniforms.uDirtNor = { value: library.dirt.normal };
        shader.uniforms.uRockNor = { value: library.rock.normal };
        shader.uniforms.uTime = time;
        shader.uniforms.uCrop = {
          value: crops().map((plot) => new Vector4(plot.x, plot.z, plot.hx, plot.hz)),
        };

        const header = `
uniform sampler2D uSplat;
uniform sampler2D uCloud;
uniform sampler2D uDirtMap;
uniform sampler2D uMudMap;
uniform sampler2D uRockMap;
uniform sampler2D uDirtNor;
uniform sampler2D uRockNor;
uniform float uTime;
uniform vec4 uCrop[2];
varying vec3 vWorld;
`;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n${header}`)
          .replace(
            '#include <begin_vertex>',
            `vec3 transformed = vec3(position);
             vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
          );
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>\n${header}`)
          .replace('#include <map_fragment>', TERRAIN_MAP)
          .replace('#include <roughnessmap_fragment>', TERRAIN_ROUGH);
      };
    },
  );

  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

const SAMPLE = `
vec3 viewDirP = normalize(vViewPosition);
vec2 detailUv = vWorld.xz * 0.155;
#ifdef USE_TANGENT
  vec3 tView = normalize(vec3(dot(viewDirP, vTangent), dot(viewDirP, vBitangent), dot(viewDirP, vNormal)));
  float relief = fract(sin(dot(floor(detailUv * 5.0), vec2(127.1, 311.7))) * 43758.5453);
  detailUv += (tView.xy / max(tView.z, 0.42)) * (relief - 0.5) * 0.04;
#endif
vec2 splatUv = vWorld.xz / ${WORLD}.0 + 0.5;
vec4 splat = texture2D(uSplat, splatUv);
splat /= max(splat.r + splat.g + splat.b + splat.a, 0.001);
`;

const TERRAIN_MAP = `
{
${SAMPLE}
vec3 grassTex = texture2D(map, detailUv).rgb;
vec3 dirtTex = texture2D(uDirtMap, detailUv).rgb;
vec3 mudTex = texture2D(uMudMap, detailUv * 0.85).rgb;
vec3 rockTex = texture2D(uRockMap, detailUv * 0.72).rgb;
float broad = texture2D(uCloud, vWorld.xz * 0.011 + vec2(9.0, 3.0)).r;
float fine = texture2D(uCloud, vWorld.xz * 0.048 + vec2(2.0, 7.0)).r;
vec3 lush = vec3(0.22, 0.5, 0.1);
vec3 gold = vec3(0.5, 0.48, 0.12);
vec3 olive = vec3(0.16, 0.32, 0.07);
vec3 meadow = mix(lush, gold, smoothstep(0.34, 0.76, broad));
meadow = mix(meadow, olive, smoothstep(0.55, 0.88, fine) * 0.55);
float texL = dot(grassTex, vec3(0.25, 0.6, 0.15));
texL = smoothstep(0.02, 0.2, texL);
meadow *= mix(0.88, 1.14, texL);
float stripe = abs(fract(vWorld.x * 3.1 + vWorld.z * 5.4) - 0.5);
float blades = smoothstep(0.22, 0.02, stripe);
float speckle = fract(sin(dot(floor(vWorld.xz * 7.0), vec2(19.1, 73.7))) * 43758.5);
meadow *= 0.9 + 0.14 * blades * speckle;
float crop = 0.0;
for (int i = 0; i < 2; i++) {
  vec2 cropD = abs(vWorld.xz - uCrop[i].xy);
  float mask = 1.0 - smoothstep(0.25, 1.2, max(cropD.x - uCrop[i].z, cropD.y - uCrop[i].w));
  crop = max(crop, mask);
}
float furrow = 0.8 + 0.2 * sin((vWorld.x * 0.35 + vWorld.z) * 9.0);
meadow = mix(meadow, vec3(0.68, 0.48, 0.08) * furrow, crop);
float mottled = texture2D(uCloud, vWorld.xz * 0.085 + vec2(2.2, 8.0)).r;
float hay = texture2D(uCloud, vWorld.xz * 0.21 + vec2(5.4, 1.3)).r;
meadow = mix(meadow, meadow * vec3(0.68, 0.84, 0.5), smoothstep(0.46, 0.82, mottled) * (1.0 - crop) * 0.55);
meadow = mix(meadow, vec3(0.58, 0.5, 0.15), smoothstep(0.6, 0.9, hay) * (1.0 - crop) * splat.r * 0.42);
vec3 dirtCol = dirtTex * vec3(2.3, 2.0, 1.6);
vec3 albedo = mix(meadow, dirtCol, splat.g);
albedo = mix(albedo, mudTex * 1.7, splat.b);
albedo = mix(albedo, rockTex * 2.05, splat.a);
vec2 cell = floor(vWorld.xz * 1.6);
float flowerHash = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5);
float flower = step(0.994, flowerHash);
vec3 flowerCol = fract(flowerHash * 13.0) > 0.72 ? vec3(0.72, 0.16, 0.12) : vec3(0.95, 0.88, 0.55);
albedo = mix(albedo, flowerCol, flower * (1.0 - crop) * splat.r);
float cloudA = texture2D(uCloud, vWorld.xz * 0.007 + vec2(uTime * 0.004, uTime * 0.0012)).r;
float cloudB = texture2D(uCloud, vWorld.xz * 0.016 + vec2(uTime * 0.006, -uTime * 0.002)).r;
float cloud = smoothstep(0.18, 0.82, cloudA * 0.65 + cloudB * 0.35);
albedo *= mix(0.9, 1.0, cloud);
#ifdef USE_SHADOWMAP
  float sunShadow = getShadow(
    directionalShadowMap[0],
    directionalLightShadows[0].shadowMapSize,
    directionalLightShadows[0].shadowIntensity,
    directionalLightShadows[0].shadowBias,
    directionalLightShadows[0].shadowRadius,
    vDirectionalShadowCoord[0]
  );
  albedo *= mix(0.46, 1.0, sunShadow);
#endif
diffuseColor.rgb = albedo;
}
`;

const TERRAIN_ROUGH = `
float roughnessFactor = roughness;
{
${SAMPLE}
vec4 grassR = texture2D(map, detailUv);
vec4 dirtR = texture2D(uDirtMap, detailUv);
vec4 mudR = texture2D(uMudMap, detailUv * 0.85);
vec4 rockR = texture2D(uRockMap, detailUv * 0.72);
roughnessFactor = grassR.a * splat.r + dirtR.a * splat.g + mudR.a * splat.b + rockR.a * splat.a;
roughnessFactor *= mix(1.0, 0.5, splat.b);
}
`;
