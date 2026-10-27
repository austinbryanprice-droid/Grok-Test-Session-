import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { tuning } from './tuning';

const vertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vDir = normalize(world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  varying vec3 vDir;
  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, pow(h, 0.7));
    float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
    col += uSunColor * pow(sunDot, 220.0) * 4.0;
    col += uSunColor * pow(sunDot, 12.0) * 0.45;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createSky(): { mesh: Mesh; sunDir: Vector3 } {
  const sunDir = new Vector3();
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: {
      uHorizon: { value: new Color(tuning.fogColor) },
      uZenith: { value: new Color(0x1a3d78) },
      uSunColor: { value: new Color(tuning.sunColor) },
      uSunDir: { value: sunDir },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
  });
  const mesh = new Mesh(new SphereGeometry(420, 32, 20), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return { mesh, sunDir };
}
