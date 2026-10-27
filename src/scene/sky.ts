import * as THREE from 'three';

export const SUN_DIRECTION = new THREE.Vector3(-0.86, 0.32, 0.4).normalize();

export function createSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSunDir: { value: SUN_DIRECTION.clone() },
      uZenith: { value: new THREE.Color(0x7e9ec8) },
      uHorizon: { value: new THREE.Color(0xf6d0a0) },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vDir = normalize(world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 uSunDir;
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform float uTime;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
        return v;
      }
      void main() {
        vec3 dir = normalize(vDir);
        float up = clamp(dir.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uZenith, pow(up, 0.55));
        vec2 cuv = dir.xz / max(dir.y + 0.35, 0.2);
        float clouds = smoothstep(0.52, 0.72, fbm(cuv * 1.6 + vec2(uTime * 0.008, 0.0)));
        col = mix(col, vec3(0.98, 0.95, 0.9), clouds * up * 0.55);
        float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
        float sun = pow(sunDot, 900.0);
        float glow = pow(sunDot, 2.4);
        col += vec3(1.0, 0.62, 0.28) * sun * 3.0;
        col += vec3(1.0, 0.55, 0.22) * glow * 0.42;
        col = mix(col, vec3(0.98, 0.72, 0.42), glow * 0.28);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 20), material);
  mesh.frustumCulled = false;
  mesh.name = 'sky';
  return mesh;
}

export function updateSky(sky: THREE.Mesh, time: number): void {
  const mat = sky.material as THREE.ShaderMaterial;
  mat.uniforms.uTime.value = time;
}
