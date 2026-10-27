import * as THREE from 'three';

export class MeshData {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  mask: number[] = [];
  surf: number[] = [];
  wind: number[] = [];

  get count(): number {
    return this.pos.length / 3;
  }

  addBox(
    matrix: THREE.Matrix4,
    size: [number, number, number],
    color: THREE.Color,
    mask = 0,
    rough = 0.86,
    metal = 0,
    wind = 0,
  ): void {
    const hx = size[0] / 2;
    const hy = size[1] / 2;
    const hz = size[2] / 2;
    const faces: { n: [number, number, number]; p: [number, number, number][]; uv: number }[] = [
      { n: [1, 0, 0], uv: size[2], p: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
      { n: [-1, 0, 0], uv: size[2], p: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
      { n: [0, 1, 0], uv: size[0], p: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
      { n: [0, -1, 0], uv: size[0], p: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
      { n: [0, 0, 1], uv: size[0], p: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
      { n: [0, 0, -1], uv: size[0], p: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
    ];
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const n = new THREE.Vector3();
    const v = new THREE.Vector3();
    const tint = new THREE.Color();
    for (const face of faces) {
      n.set(face.n[0], face.n[1], face.n[2]).applyMatrix3(normalMatrix).normalize();
      const corner = [0, 1, 2, 0, 2, 3];
      for (const k of corner) {
        const p = face.p[k];
        v.set(p[0], p[1], p[2]).applyMatrix4(matrix);
        const y01 = hy === 0 ? 1 : (p[1] / hy + 1) * 0.5;
        let shade = 0.86 + 0.14 * y01;
        if (face.n[1] > 0.6) shade *= 1.1;
        if (face.n[1] < -0.6) shade *= 0.9;
        tint.copy(color).multiplyScalar(shade);
        if (face.n[1] > 0.6) {
          tint.r = Math.min(1, tint.r * 1.05);
          tint.g = Math.min(1, tint.g * 1.02);
        }
        this.pos.push(v.x, v.y, v.z);
        this.nrm.push(n.x, n.y, n.z);
        const u = k === 1 || k === 2 ? 1 : 0;
        const vv = k === 2 || k === 3 ? 1 : 0;
        this.uv.push(u * Math.max(1, face.uv), vv * Math.max(1, size[1]));
        this.col.push(tint.r, tint.g, tint.b);
        this.mask.push(mask);
        this.surf.push(rough, metal);
        this.wind.push(wind);
      }
    }
  }

  addCylinder(
    matrix: THREE.Matrix4,
    radiusTop: number,
    radiusBottom: number,
    height: number,
    segments: number,
    color: THREE.Color,
    mask = 0,
    rough = 0.9,
    metal = 0,
  ): void {
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    const tint = new THREE.Color();
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const ring = [
        [Math.cos(a0) * radiusBottom, 0, Math.sin(a0) * radiusBottom],
        [Math.cos(a1) * radiusBottom, 0, Math.sin(a1) * radiusBottom],
        [Math.cos(a1) * radiusTop, height, Math.sin(a1) * radiusTop],
        [Math.cos(a0) * radiusTop, height, Math.sin(a0) * radiusTop],
      ];
      const mid = new THREE.Vector3(Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2));
      n.copy(mid).applyMatrix3(normalMatrix).normalize();
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const p = ring[k];
        v.set(p[0], p[1], p[2]).applyMatrix4(matrix);
        const y01 = height === 0 ? 1 : p[1] / height;
        tint.copy(color).multiplyScalar(0.88 + 0.12 * y01);
        this.pos.push(v.x, v.y, v.z);
        this.nrm.push(n.x, n.y, n.z);
        this.uv.push(i / segments, y01);
        this.col.push(tint.r, tint.g, tint.b);
        this.mask.push(mask);
        this.surf.push(rough, metal);
        this.wind.push(0);
      }
    }
  }

  toGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setAttribute('aTeamMask', new THREE.Float32BufferAttribute(this.mask, 1));
    geo.setAttribute('aSurface', new THREE.Float32BufferAttribute(this.surf, 2));
    geo.setAttribute('aWind', new THREE.Float32BufferAttribute(this.wind, 1));
    geo.computeBoundingSphere();
    return geo;
  }
}

export function placed(x: number, y: number, z: number, rotY = 0, rotX = 0, rotZ = 0): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'XYZ'));
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
  return m;
}

export function multiplied(parent: THREE.Matrix4, local: THREE.Matrix4): THREE.Matrix4 {
  return new THREE.Matrix4().multiplyMatrices(parent, local);
}
