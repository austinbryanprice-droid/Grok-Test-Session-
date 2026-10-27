import { Mesh, PlaneGeometry, Vector2 } from 'three';
import { WORLD, computeHeight, settlement } from './field';
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
        const home = settlement();
        shader.uniforms.uWheat = { value: new Vector2(home.x + 12, home.z - 1) };

        const header = `
uniform sampler2D uSplat;
uniform sampler2D uCloud;
uniform sampler2D uDirtMap;
uniform sampler2D uMudMap;
uniform sampler2D uRockMap;
uniform sampler2D uDirtNor;
uniform sampler2D uRockNor;
uniform float uTime;
uniform vec2 uWheat;
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
vec4 grass = texture2D(map, detailUv);
vec4 dirt = texture2D(uDirtMap, detailUv);
vec4 mud = texture2D(uMudMap, detailUv * 0.85);
vec4 rock = texture2D(uRockMap, detailUv * 0.72);
float broad = texture2D(uCloud, vWorld.xz * 0.012 + vec2(9.0, 3.0)).r;
float wheat = 1.0 - smoothstep(4.0, 10.5, length(vWorld.xz - uWheat));
vec3 meadow = mix(vec3(0.16, 0.78, 0.14), vec3(0.58, 0.7, 0.16), smoothstep(0.45, 0.82, broad));
meadow = mix(meadow, grass.rgb, 0.12);
meadow = mix(meadow, vec3(0.8, 0.62, 0.12), wheat);
vec3 albedo = mix(meadow, vec3(0.48, 0.34, 0.14), splat.g);
albedo = mix(albedo, mud.rgb, splat.b);
albedo = mix(albedo, rock.rgb, splat.a);
float cloudA = texture2D(uCloud, vWorld.xz * 0.007 + vec2(uTime * 0.004, uTime * 0.0012)).r;
float cloudB = texture2D(uCloud, vWorld.xz * 0.016 + vec2(uTime * 0.006, -uTime * 0.002)).r;
float cloud = smoothstep(0.18, 0.82, cloudA * 0.65 + cloudB * 0.35);
albedo *= mix(0.84, 1.0, cloud);
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
