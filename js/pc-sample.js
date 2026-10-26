// Open-world military sector. Visual target: hazy sunlit RTS battlefield
// with dusty ground, a dirt road, dry grass, palms, timber buildings,
// sandbags, wire, armor, and smoke.
let scene, camera, renderer;
let terrain, unit, selectionRing, orderPath, fireLight;
let isDragging = false;
let previousMouse = { x: 0, y: 0 };
let dragDist = 0;
let targetRotation = { x: 0.9, y: 0.55 };
let cameraDistance = 86;
const focus = new THREE.Vector3(0, 0, 2);
let moveTarget = null;
let selected = true;
const keys = {};
const clock = new THREE.Clock();
const smokes = [];
const fires = [];
const tracers = [];
const WORLD = 180;

const CRATERS = [
    { x: 14, z: -8, r: 4.4, depth: 0.9, rim: 0.28 },
    { x: -16, z: 18, r: 5.6, depth: 1.05, rim: 0.32 },
    { x: 22, z: 24, r: 3.4, depth: 0.62, rim: 0.2 },
    { x: -8, z: -28, r: 3.8, depth: 0.7, rim: 0.22 },
    { x: 30, z: -22, r: 4.8, depth: 0.8, rim: 0.24 }
];

function mulberry32(seed) {
    let s = seed >>> 0;
    return function rand() {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

function makeNoise(seed) {
    const rand = mulberry32(seed);
    const N = 64;
    const g = new Float32Array(N * N);
    for (let i = 0; i < g.length; i++) g[i] = rand();
    const smooth = (t) => t * t * (3 - 2 * t);
    function sample(x, y) {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const fx = smooth(x - x0);
        const fy = smooth(y - y0);
        const xi = x0 & (N - 1);
        const yi = y0 & (N - 1);
        const xi1 = (xi + 1) & (N - 1);
        const yi1 = (yi + 1) & (N - 1);
        const v00 = g[yi * N + xi];
        const v10 = g[yi * N + xi1];
        const v01 = g[yi1 * N + xi];
        const v11 = g[yi1 * N + xi1];
        return (v00 + (v10 - v00) * fx) * (1 - fy) + (v01 + (v11 - v01) * fx) * fy;
    }
    return function fbm(x, y) {
        let a = 0;
        let amp = 0.5;
        let f = 1;
        let sum = 0;
        for (let i = 0; i < 5; i++) {
            a += sample(x * f, y * f) * amp;
            sum += amp;
            f *= 2;
            amp *= 0.5;
        }
        return a / sum;
    };
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(e0, e1, x) {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
}
function roadCenterX(z) {
    return 2 + Math.sin(z * 0.04) * 16 + Math.sin(z * 0.011) * 6;
}
function pathCenterZ(x) {
    return -4 + Math.sin(x * 0.055) * 8;
}
function onRoad(x, z) {
    return Math.abs(x - roadCenterX(z)) < 7.2 || Math.abs(z - pathCenterZ(x)) < 4.6;
}
function heightAt(x, z) {
    let h = Math.sin(x * 0.031) * Math.cos(z * 0.027) * 1.05;
    h += Math.sin(x * 0.07 + 2) * Math.cos(z * 0.06) * 0.38;
    for (const c of CRATERS) {
        const d = Math.hypot(x - c.x, z - c.z);
        if (d < c.r) {
            const t = d / c.r;
            if (t < 0.7) h -= c.depth * (1 - t / 0.7) * (1 - t / 0.7);
            else h += c.rim * Math.sin(((t - 0.7) / 0.3) * Math.PI);
        }
    }
    const rd = Math.abs(x - roadCenterX(z));
    if (rd < 8) h -= (1 - rd / 8) * 0.2;
    const pd = Math.abs(z - pathCenterZ(x));
    if (pd < 5) h -= (1 - pd / 5) * 0.08;
    return h;
}

function canvasTexture(canvas, anisotropy) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = anisotropy || 4;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
}

function paintGround() {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const data = img.data;
    const n = makeNoise(11);
    const sand = [146, 122, 84];
    const dust = [118, 98, 68];
    const grass = [86, 94, 52];
    const grassDark = [54, 64, 36];
    const road = [132, 110, 76];
    const roadDark = [88, 70, 46];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const wx = (x / size - 0.5) * WORLD;
            const wz = (y / size - 0.5) * WORLD;
            const west = smoothstep(30, -25, wx);
            const macro = n(wx * 0.018, wz * 0.018);
            const mid = n(wx * 0.07 + 3, wz * 0.07);
            const fine = n(wx * 0.28, wz * 0.28);
            let grassT = clamp(west * 0.82 + (macro - 0.5) * 0.45, 0, 1);
            let r = lerp(sand[0], grass[0], grassT);
            let g = lerp(sand[1], grass[1], grassT);
            let b = lerp(sand[2], grass[2], grassT);
            if (grassT > 0.45 && mid > 0.62) {
                r = lerp(r, grassDark[0], 0.55);
                g = lerp(g, grassDark[1], 0.55);
                b = lerp(b, grassDark[2], 0.55);
            }
            const tone = 0.84 + fine * 0.28 + (mid - 0.5) * 0.08;
            r *= tone; g *= tone; b *= tone;
            if (fine > 0.78) {
                r = lerp(r, dust[0], 0.35);
                g = lerp(g, dust[1], 0.35);
                b = lerp(b, dust[2], 0.35);
            }
            const rd = Math.abs(wx - roadCenterX(wz));
            const roadT = 1 - smoothstep(4.6, 7.4, rd);
            if (roadT > 0) {
                const rut = (rd > 1.7 && rd < 2.7) || (rd > 0.15 && rd < 0.85) ? 0.22 : 0;
                const rc = lerp(road[0], roadDark[0], rut + (1 - fine) * 0.15);
                const gc = lerp(road[1], roadDark[1], rut + (1 - fine) * 0.15);
                const bc = lerp(road[2], roadDark[2], rut + (1 - fine) * 0.15);
                r = lerp(r, rc, roadT);
                g = lerp(g, gc, roadT);
                b = lerp(b, bc, roadT);
            }
            const pd = Math.abs(wz - pathCenterZ(wx));
            const pathT = 1 - smoothstep(2.4, 4.8, pd);
            if (pathT > 0) {
                r = lerp(r, road[0] * 0.92, pathT * 0.75);
                g = lerp(g, road[1] * 0.9, pathT * 0.75);
                b = lerp(b, road[2] * 0.82, pathT * 0.75);
            }
            for (const c of CRATERS) {
                const d = Math.hypot(wx - c.x, wz - c.z);
                if (d < c.r) {
                    const t = d / c.r;
                    const dark = t < 0.65 ? (1 - t / 0.65) * 0.55 : 0;
                    const rim = t > 0.68 && t < 0.95 ? 0.18 : 0;
                    r = r * (1 - dark) + 70 * dark + rim * 40;
                    g = g * (1 - dark) + 62 * dark + rim * 36;
                    b = b * (1 - dark) + 48 * dark + rim * 24;
                }
            }
            const i = (y * size + x) * 4;
            data[i] = clamp(r, 0, 255);
            data[i + 1] = clamp(g, 0, 255);
            data[i + 2] = clamp(b, 0, 255);
            data[i + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
}

function paintStripes(base, line, horizontal, count) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = line;
    const step = 256 / count;
    for (let i = 0; i < count; i++) {
        if (horizontal) ctx.fillRect(0, i * step, 256, step * 0.18);
        else ctx.fillRect(i * step, 0, step * 0.16, 256);
    }
    const n = makeNoise(iSeed(base));
    const img = ctx.getImageData(0, 0, 256, 256);
    const d = img.data;
    for (let p = 0; p < d.length; p += 4) {
        const k = 0.9 + n((p / 4) % 256 * 0.05, Math.floor(p / 4 / 256) * 0.05) * 0.18;
        d[p] *= k; d[p + 1] *= k; d[p + 2] *= k;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
}

function iSeed(hex) {
    return (hex.charCodeAt(1) * 17 + hex.charCodeAt(3) * 13) >>> 0;
}

function paintNoiseColor(hex, seed) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(256, 256);
    const d = img.data;
    const n = makeNoise(seed);
    const r0 = parseInt(hex.slice(1, 3), 16);
    const g0 = parseInt(hex.slice(3, 5), 16);
    const b0 = parseInt(hex.slice(5, 7), 16);
    for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
            const v = n(x * 0.04, y * 0.04);
            const f = n(x * 0.15, y * 0.15);
            const k = 0.78 + v * 0.36 + (f - 0.5) * 0.08;
            const dust = y > 170 ? (y - 170) / 86 * 0.18 : 0;
            const i = (y * 256 + x) * 4;
            d[i] = clamp(r0 * k + dust * 40, 0, 255);
            d[i + 1] = clamp(g0 * k + dust * 30, 0, 255);
            d[i + 2] = clamp(b0 * k + dust * 16, 0, 255);
            d[i + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
}

function paintSky() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const grd = ctx.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, '#5d7688');
    grd.addColorStop(0.42, '#8ea6b2');
    grd.addColorStop(0.78, '#c5cdd0');
    grd.addColorStop(1, '#d2c6ae');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 1024, 512);
    const rand = mulberry32(4);
    for (let i = 0; i < 18; i++) {
        const x = rand() * 1024;
        const y = 180 + rand() * 220;
        const rx = 40 + rand() * 120;
        const ry = 10 + rand() * 22;
        ctx.fillStyle = `rgba(255,252,246,${0.08 + rand() * 0.14})`;
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    for (let i = 0; i < 5; i++) {
        ctx.fillStyle = `rgba(70,68,64,${0.18 + rand() * 0.2})`;
        ctx.beginPath();
        ctx.ellipse(120 + i * 190, 300 + rand() * 40, 30, 70 + rand() * 40, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    return canvas;
}

function paintSoft(r, g, b) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grd = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    grd.addColorStop(0, `rgba(${r},${g},${b},1)`);
    grd.addColorStop(0.4, `rgba(${r},${g},${b},0.55)`);
    grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 64, 64);
    return canvas;
}

function lambert(map, color) {
    return new THREE.MeshLambertMaterial({ map: map || null, color: color || 0xffffff });
}

function fillInstances(geometry, material, count, placeFn, shadows) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.castShadow = !!shadows;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
        placeFn(dummy, i);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    return mesh;
}

function scatter(rand, count, avoid) {
    const spots = [];
    let guard = 0;
    while (spots.length < count && guard < count * 40) {
        guard++;
        const x = (rand() - 0.5) * (WORLD - 24);
        const z = (rand() - 0.5) * (WORLD - 24);
        if (onRoad(x, z)) continue;
        if (Math.hypot(x, z - 2) < 7) continue;
        if (avoid && avoid.some((p) => Math.hypot(p.x - x, p.z - z) < (p.r || 4))) continue;
        spots.push({
            x, z,
            ry: rand() * Math.PI * 2,
            s: 0.75 + rand() * 0.7,
            h: 0.7 + rand() * 0.9
        });
    }
    while (spots.length < count) spots.push({ x: 70, z: 70, ry: 0, s: 0.2, h: 0.2 });
    return spots;
}

function addMesh(parent, geo, mat, x, y, z, rx, ry, rz) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx || 0, ry || 0, rz || 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}

function buildTank(mats) {
    const g = new THREE.Group();
    addMesh(g, new THREE.BoxGeometry(2.05, 0.48, 4.5), mats.hull, 0, 0.62, 0);
    addMesh(g, new THREE.BoxGeometry(1.9, 0.36, 2.5), mats.hull, 0, 0.98, 0.15);
    const glacis = addMesh(g, new THREE.BoxGeometry(1.9, 0.16, 1.35), mats.hull, 0, 0.78, 1.85);
    glacis.rotation.x = -0.42;
    addMesh(g, new THREE.BoxGeometry(0.5, 0.62, 4.65), mats.track, -1.2, 0.4, 0);
    addMesh(g, new THREE.BoxGeometry(0.5, 0.62, 4.65), mats.track, 1.2, 0.4, 0);
    addMesh(g, new THREE.BoxGeometry(0.52, 0.08, 4.3), mats.track, -1.2, 0.74, 0);
    addMesh(g, new THREE.BoxGeometry(0.52, 0.08, 4.3), mats.track, 1.2, 0.74, 0);
    addMesh(g, new THREE.BoxGeometry(0.7, 0.16, 0.7), mats.hull, 0.55, 1.12, -1.05);
    addMesh(g, new THREE.CylinderGeometry(0.22, 0.22, 0.08, 8), mats.track, -0.7, 1.22, -1.15);
    const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.18, 10);
    for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 5; i++) {
            const w = addMesh(g, wheelGeo, mats.track, side * 1.28, 0.3, -1.6 + i * 0.8);
            w.rotation.z = Math.PI / 2;
        }
    }
    addMesh(g, new THREE.BoxGeometry(1.45, 0.48, 1.65), mats.turret, 0, 1.38, -0.05);
    addMesh(g, new THREE.CylinderGeometry(0.22, 0.28, 0.16, 8), mats.turret, 0, 1.68, -0.15);
    const barrel = addMesh(g, new THREE.CylinderGeometry(0.07, 0.09, 2.35, 8), mats.gun, 0, 1.42, 1.85);
    barrel.rotation.x = Math.PI / 2;
    addMesh(g, new THREE.BoxGeometry(0.42, 0.28, 0.28), mats.turret, 0, 1.4, 0.78);
    return g;
}

function buildCar(mats) {
    const g = new THREE.Group();
    addMesh(g, new THREE.BoxGeometry(1.7, 0.55, 3.6), mats.hull, 0, 0.72, 0);
    addMesh(g, new THREE.BoxGeometry(1.45, 0.48, 1.5), mats.turret, 0, 1.18, -0.15);
    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.2, 10);
    for (const side of [-1, 1]) {
        for (const z of [-1.15, 1.05]) {
            const w = addMesh(g, wheelGeo, mats.track, side * 0.92, 0.34, z);
            w.rotation.z = Math.PI / 2;
        }
    }
    const barrel = addMesh(g, new THREE.CylinderGeometry(0.05, 0.06, 1.3, 8), mats.gun, 0, 1.22, 1.15);
    barrel.rotation.x = Math.PI / 2;
    return g;
}

function buildSoldier(uniform, skin, gunMat) {
    const g = new THREE.Group();
    addMesh(g, new THREE.BoxGeometry(0.36, 0.5, 0.2), uniform, 0, 0.92, 0);
    addMesh(g, new THREE.SphereGeometry(0.12, 6, 5), skin, 0, 1.28, 0);
    addMesh(g, new THREE.BoxGeometry(0.11, 0.46, 0.12), uniform, -0.09, 0.38, 0);
    addMesh(g, new THREE.BoxGeometry(0.11, 0.46, 0.12), uniform, 0.09, 0.38, 0);
    addMesh(g, new THREE.BoxGeometry(0.05, 0.05, 0.72), gunMat, 0.16, 1.0, 0.28);
    return g;
}

function addBuilding(x, z, ry, kind, mats) {
    const g = new THREE.Group();
    const h = heightAt(x, z);
    if (kind === 'hut') {
        addMesh(g, new THREE.BoxGeometry(3.4, 1.7, 2.8), mats.wood, 0, 0.85, 0);
        const roofL = addMesh(g, new THREE.BoxGeometry(3.7, 0.12, 1.85), mats.roof, 0, 1.95, -0.72);
        roofL.rotation.x = 0.5;
        const roofR = addMesh(g, new THREE.BoxGeometry(3.7, 0.12, 1.85), mats.roof, 0, 1.95, 0.72);
        roofR.rotation.x = -0.5;
        addMesh(g, new THREE.BoxGeometry(0.45, 0.7, 0.08), mats.dark, 0, 0.7, 1.42);
        addMesh(g, new THREE.BoxGeometry(0.55, 0.4, 0.08), mats.dark, -0.9, 1.05, 1.42);
    } else {
        addMesh(g, new THREE.BoxGeometry(8.5, 2.4, 4.2), mats.plaster, 0, 1.2, 0);
        const roof = addMesh(g, new THREE.CylinderGeometry(2.35, 2.35, 8.6, 12, 1, false, 0, Math.PI), mats.roof, 0, 2.35, 0);
        roof.rotation.z = Math.PI / 2;
        addMesh(g, new THREE.BoxGeometry(1.1, 1.6, 0.1), mats.dark, 0, 0.8, 2.12);
        addMesh(g, new THREE.BoxGeometry(0.7, 0.5, 0.1), mats.dark, -2.4, 1.35, 2.12);
        addMesh(g, new THREE.BoxGeometry(0.7, 0.5, 0.1), mats.dark, 2.4, 1.35, 2.12);
    }
    g.position.set(x, h, z);
    g.rotation.y = ry;
    scene.add(g);
    return g;
}

function addWire(x1, z1, x2, z2, mats) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const posts = Math.max(2, Math.round(len / 2.4));
    for (let i = 0; i <= posts; i++) {
        const t = i / posts;
        const x = x1 + dx * t;
        const z = z1 + dz * t;
        const y = heightAt(x, z);
        addMesh(scene, new THREE.CylinderGeometry(0.05, 0.06, 1.15, 5), mats.wood, x, y + 0.55, z);
    }
    for (const lift of [0.45, 0.85]) {
        const cx = (x1 + x2) / 2;
        const cz = (z1 + z2) / 2;
        const y = heightAt(cx, cz) + lift;
        const wire = addMesh(scene, new THREE.BoxGeometry(0.025, 0.025, len), mats.steel, cx, y, cz);
        wire.rotation.y = Math.atan2(dx, dz);
    }
}

function addHedgehog(x, z, mat) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
        const beam = addMesh(g, new THREE.BoxGeometry(0.12, 0.12, 2.15), mat, 0, 0, 0, 0.55, i * Math.PI / 3, 0);
        beam.castShadow = true;
    }
    g.position.set(x, heightAt(x, z) + 0.35, z);
    scene.add(g);
}

function spriteMat(map, opacity, additive) {
    return new THREE.SpriteMaterial({
        map,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
}

function init() {
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xaeb8b4, 130, 320);
    scene.background = new THREE.Color(0x9aabaf);

    camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.4, 700);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x9aabaf);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);
    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const groundMap = canvasTexture(paintGround(), anisotropy);
    const skyMap = canvasTexture(paintSky(), 2);
    skyMap.wrapS = THREE.RepeatWrapping;
    const woodMap = canvasTexture(paintStripes('#8a6a45', '#6d5234', true, 14), anisotropy);
    const roofMap = canvasTexture(paintStripes('#7d5a3a', '#5c4030', false, 18), anisotropy);
    const plasterMap = canvasTexture(paintNoiseColor('#c2b39a', 23), anisotropy);
    const hullMap = canvasTexture(paintNoiseColor('#6d7348', 31), anisotropy);
    const trackMap = canvasTexture(paintNoiseColor('#3c3a36', 37), anisotropy);
    const turretMap = canvasTexture(paintNoiseColor('#5e6640', 41), anisotropy);
    const barkMap = canvasTexture(paintNoiseColor('#6a5340', 53), anisotropy);
    const leafMap = canvasTexture(paintNoiseColor('#3f5334', 59), anisotropy);
    const palmMap = canvasTexture(paintNoiseColor('#2f4a2c', 61), anisotropy);
    const sackMap = canvasTexture(paintNoiseColor('#b7a27a', 67), anisotropy);
    const rockMap = canvasTexture(paintNoiseColor('#8d8a82', 71), anisotropy);

    const mats = {
        ground:         new THREE.MeshLambertMaterial({ map: groundMap }),
        wood: lambert(woodMap),
        roof: lambert(roofMap),
        plaster: lambert(plasterMap),
        hull: new THREE.MeshPhongMaterial({ map: hullMap, shininess: 8, specular: new THREE.Color(0x333320) }),
        turret: new THREE.MeshPhongMaterial({ map: turretMap, shininess: 8, specular: new THREE.Color(0x333320) }),
        track: lambert(trackMap),
        gun: lambert(null, 0x2a2c28),
        bark: lambert(barkMap),
        leaf: lambert(leafMap),
        palm: lambert(palmMap),
        sack: lambert(sackMap),
        rock: lambert(rockMap),
        dark: lambert(null, 0x2a241c),
        steel: lambert(null, 0x6a6e70),
        skin: lambert(null, 0xc2a07a),
        uniform: lambert(null, 0x5c6244),
        scorch: lambert(null, 0x2c2926)
    };

    const hemi = new THREE.HemisphereLight(0xc5d2da, 0x6d5a3e, 0.42);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d2, 0.82);
    sun.position.set(-52, 74, 34);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 180;
    sun.shadow.camera.left = -62;
    sun.shadow.camera.right = 62;
    sun.shadow.camera.top = 62;
    sun.shadow.camera.bottom = -62;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    scene.add(sun);
    scene.add(sun.target);
    const fill = new THREE.DirectionalLight(0xc9d5dc, 0.1);
    fill.position.set(40, 30, -20);
    scene.add(fill);

    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(420, 28, 16),
        new THREE.MeshBasicMaterial({ map: skyMap, side: THREE.BackSide, depthWrite: false, fog: false })
    );
    scene.add(sky);

    createTerrain(mats.ground);
    createWorld(mats);
    createEffects();
    createUnit(mats);
    createSelectionRing();
    setupControls();

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
    const status = document.getElementById('status');
    if (status) status.textContent = 'Vehicle selected — click the ground to move';
    animate();
}

function createTerrain(material) {
    const geometry = new THREE.PlaneGeometry(WORLD, WORLD, 96, 96);
    geometry.rotateX(-Math.PI / 2);
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
    }
    geometry.computeVertexNormals();
    terrain = new THREE.Mesh(geometry, material);
    terrain.receiveShadow = true;
    terrain.castShadow = false;
    scene.add(terrain);
}

function createWorld(mats) {
    const rand = mulberry32(20261026);
    const reserved = [
        { x: 0, z: 2, r: 6 },
        { x: -10, z: -16, r: 6 },
        { x: 24, z: -20, r: 6 },
        { x: -32, z: -6, r: 8 },
        { x: 8, z: 10, r: 5 },
        { x: -18, z: 16, r: 6 }
    ];

    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.28, 4.8, 6);
    trunkGeo.translate(0, 2.4, 0);
    const frondGeo = new THREE.BoxGeometry(0.22, 0.045, 2.5);
    frondGeo.translate(0, 0, 1.15);
    const palms = [];
    const palmRand = mulberry32(8);
    while (palms.length < 16) {
        const x = (palmRand() - 0.35) * 120;
        const z = (palmRand() - 0.6) * 120;
        if (onRoad(x, z)) continue;
        if (x < -10 && palmRand() > 0.35) continue;
        palms.push({ x, z, ry: palmRand() * 6.28, s: 0.85 + palmRand() * 0.55 });
    }
    fillInstances(trunkGeo, mats.bark, palms.length, (dummy, i) => {
        const p = palms[i];
        dummy.position.set(p.x, heightAt(p.x, p.z), p.z);
        dummy.rotation.set(0, p.ry, 0.05);
        dummy.scale.setScalar(p.s);
    }, true);
    fillInstances(frondGeo, mats.palm, palms.length * 7, (dummy, i) => {
        const p = palms[Math.floor(i / 7)];
        const a = p.ry + (i % 7) * (Math.PI * 2 / 7);
        dummy.position.set(p.x, heightAt(p.x, p.z) + 4.55 * p.s, p.z);
        dummy.rotation.set(0.62, a, 0);
        dummy.scale.setScalar(p.s);
    }, true);

    const treeTrunk = new THREE.CylinderGeometry(0.12, 0.22, 2.4, 5);
    treeTrunk.translate(0, 1.2, 0);
    const canopy = new THREE.IcosahedronGeometry(1.15, 1);
    const trees = scatter(mulberry32(3), 18, reserved).map((p) => {
        p.x = -Math.abs(p.x) - 4;
        return p;
    });
    fillInstances(treeTrunk, mats.bark, trees.length, (dummy, i) => {
        const p = trees[i];
        dummy.position.set(p.x, heightAt(p.x, p.z), p.z);
        dummy.rotation.y = p.ry;
        dummy.scale.setScalar(p.s);
    }, true);
    fillInstances(canopy, mats.leaf, trees.length * 3, (dummy, i) => {
        const p = trees[Math.floor(i / 3)];
        const k = i % 3;
        dummy.position.set(
            p.x + (k - 1) * 0.45 * p.s,
            heightAt(p.x, p.z) + (2.5 + (k === 1 ? 0.45 : 0)) * p.s,
            p.z + (k === 2 ? 0.4 : -0.15) * p.s
        );
        dummy.scale.setScalar(p.s * (k === 1 ? 1.15 : 0.85));
    }, true);

    const bushGeo = new THREE.IcosahedronGeometry(0.55, 0);
    const bushes = scatter(mulberry32(15), 36, reserved);
    fillInstances(bushGeo, mats.leaf, bushes.length, (dummy, i) => {
        const p = bushes[i];
        dummy.position.set(p.x, heightAt(p.x, p.z) + 0.3 * p.s, p.z);
        dummy.rotation.y = p.ry;
        dummy.scale.set(p.s, p.s * 0.7, p.s);
    }, false);

    const rockGeo = new THREE.DodecahedronGeometry(0.8, 0);
    const rocks = scatter(mulberry32(21), 14, reserved);
    rocks.push({ x: -18, z: 14, ry: 0.4, s: 2.1, h: 1 });
    rocks.push({ x: -15, z: 17, ry: 1.2, s: 1.4, h: 1 });
    rocks.push({ x: -20, z: 12, ry: 2.1, s: 1.1, h: 1 });
    fillInstances(rockGeo, mats.rock, rocks.length, (dummy, i) => {
        const p = rocks[i];
        dummy.position.set(p.x, heightAt(p.x, p.z) + 0.25 * p.s, p.z);
        dummy.rotation.set(p.ry, p.ry * 0.7, p.ry * 0.3);
        dummy.scale.set(p.s, p.s * 0.72, p.s * 0.9);
    }, true);

    const grassGeo = new THREE.ConeGeometry(0.07, 0.48, 4);
    grassGeo.translate(0, 0.24, 0);
    const grass = scatter(mulberry32(27), 160, reserved);
    fillInstances(grassGeo, mats.leaf, grass.length, (dummy, i) => {
        const p = grass[i];
        dummy.position.set(p.x, heightAt(p.x, p.z), p.z);
        dummy.rotation.y = p.ry;
        dummy.scale.set(p.s, p.h, p.s);
    }, false);

    addBuilding(26, -22, 0.4, 'hut', mats);
    addBuilding(-34, -8, -0.3, 'warehouse', mats);
    addBuilding(-8, -36, 1.1, 'hut', mats);

    const bagGeo = new THREE.SphereGeometry(0.38, 7, 5);
    const bags = [];
    for (let row = 0; row < 2; row++) {
        for (let i = 0; i < 8; i++) {
            const a = -1.05 + (i / 7) * 2.1;
            const rad = 3.1 + row * 0.62;
            bags.push({
                x: 7.2 + Math.sin(a) * rad,
                z: 9.4 + Math.cos(a) * rad * 0.72,
                row,
                ry: a
            });
        }
    }
    fillInstances(bagGeo, mats.sack, bags.length, (dummy, i) => {
        const p = bags[i];
        dummy.position.set(p.x, heightAt(p.x, p.z) + 0.22 + p.row * 0.32, p.z);
        dummy.rotation.y = p.ry;
        dummy.scale.set(1.15, 0.62, 0.85);
    }, true);

    addWire(-2, 20, 18, 16, mats);
    addWire(18, 16, 24, 6, mats);
    addWire(-28, 22, -8, 26, mats);
    for (const h of [[12, 18], [16, 14], [6, 22], [-22, 24], [20, 10]]) {
        addHedgehog(h[0], h[1], mats.steel);
    }

    const crate = new THREE.BoxGeometry(0.7, 0.42, 0.48);
    [[23, -18], [24.2, -18.4], [23.4, -17.2], [28, -16]].forEach((p, i) => {
        addMesh(scene, crate, mats.wood, p[0], heightAt(p[0], p[1]) + 0.22 + (i === 3 ? 0.42 : 0), p[1], 0, i, 0);
    });
    const barrel = new THREE.CylinderGeometry(0.32, 0.34, 0.78, 8);
    [[29, -19], [29.7, -18.4], [-30, -4], [-31, -4.6]].forEach((p) => {
        addMesh(scene, barrel, mats.hull, p[0], heightAt(p[0], p[1]) + 0.4, p[1]);
    });

    const randSoldier = mulberry32(90);
    for (let i = 0; i < 7; i++) {
        const a = -0.8 + i * 0.28;
        const x = 7.2 + Math.sin(a) * 2.1;
        const z = 9.2 + Math.cos(a) * 1.5;
        const s = buildSoldier(mats.uniform, mats.skin, mats.gun);
        s.position.set(x, heightAt(x, z), z);
        s.rotation.y = a + Math.PI;
        scene.add(s);
    }
    for (let i = 0; i < 4; i++) {
        const x = -6 + i * 1.1;
        const z = -30 - (i % 2) * 0.6;
        const s = buildSoldier(mats.uniform, mats.skin, mats.gun);
        s.position.set(x, heightAt(x, z), z);
        s.rotation.y = randSoldier() * 6;
        scene.add(s);
    }

    const wreck = buildTank(mats);
    wreck.traverse((obj) => {
        if (obj.isMesh) obj.material = mats.scorch;
    });
    wreck.position.set(-11, heightAt(-11, -15), -15);
    wreck.rotation.y = 2.2;
    wreck.rotation.z = 0.22;
    scene.add(wreck);

    const ally = buildTank(mats);
    ally.position.set(-26, heightAt(-26, 10), 10);
    ally.rotation.y = 0.8;
    scene.add(ally);

    const car = buildCar(mats);
    car.position.set(18, heightAt(18, -8), -8);
    car.rotation.y = -0.6;
    scene.add(car);

    const truck = new THREE.Group();
    addMesh(truck, new THREE.BoxGeometry(1.8, 0.7, 4.2), mats.hull, 0, 0.85, 0);
    addMesh(truck, new THREE.BoxGeometry(1.6, 0.7, 1.4), mats.turret, 0, 1.35, 1.2);
    truck.position.set(-28, heightAt(-28, -14), -14);
    truck.rotation.y = 1.4;
    scene.add(truck);

    addMesh(scene, new THREE.PlaneGeometry(4.5, 3.2), new THREE.MeshBasicMaterial({
        color: 0x1a1612, transparent: true, opacity: 0.45, depthWrite: false
    }), -11, heightAt(-11, -15) + 0.08, -15, -Math.PI / 2, 0.4, 0);

    const planes = [[-20, 46, -30, 0.4], [24, 52, 18, -0.8]];
    planes.forEach((p) => {
        const g = new THREE.Group();
        addMesh(g, new THREE.BoxGeometry(0.35, 0.12, 2.1), mats.gun, 0, 0, 0);
        addMesh(g, new THREE.BoxGeometry(3.1, 0.05, 0.42), mats.gun, 0, 0, 0.15);
        addMesh(g, new THREE.BoxGeometry(1.05, 0.04, 0.26), mats.gun, 0, 0.05, -0.85);
        g.position.set(p[0], p[1], p[2]);
        g.rotation.y = p[3];
        scene.add(g);
    });
}

function createEffects() {
    const smokeMap = canvasTexture(paintSoft(150, 146, 140));
    const fireMap = canvasTexture(paintSoft(255, 170, 60));
    const blastMap = canvasTexture(paintSoft(255, 220, 160));
    const sources = [
        { x: -11, z: -15, n: 16, h: 1.2, speed: 7, size: 1.4, dark: 0.55 },
        { x: -40, z: -42, n: 8, h: 2, speed: 10, size: 3.2, dark: 0.35 },
        { x: 36, z: -38, n: 8, h: 2, speed: 9, size: 2.8, dark: 0.3 },
        { x: 8, z: 30, n: 6, h: 1, speed: 6, size: 2.2, dark: 0.25 }
    ];
    sources.forEach((src) => {
        for (let i = 0; i < src.n; i++) {
            const mat = spriteMat(smokeMap, 0.35, false);
            mat.color.setScalar(src.dark + Math.random() * 0.2);
            const s = new THREE.Sprite(mat);
            const y0 = heightAt(src.x, src.z) + src.h;
            s.position.set(src.x + (Math.random() - 0.5) * 1.4, y0, src.z + (Math.random() - 0.5) * 1.4);
            s.userData = {
                life: Math.random(),
                speed: src.speed,
                size: src.size * (0.7 + Math.random() * 0.6),
                origin: s.position.clone(),
                drift: (Math.random() - 0.5) * 1.6
            };
            scene.add(s);
            smokes.push(s);
        }
    });
    for (let i = 0; i < 4; i++) {
        const s = new THREE.Sprite(spriteMat(fireMap, 0.85, true));
        s.position.set(-11 + (i - 1.5) * 0.45, heightAt(-11, -15) + 0.7 + i * 0.15, -15 + (i % 2) * 0.3);
        s.userData = { w: 1.1 + i * 0.15, h: 1.6 + i * 0.2, phase: i };
        scene.add(s);
        fires.push(s);
    }
    const blast = new THREE.Sprite(spriteMat(blastMap, 0, true));
    blast.position.set(-11, heightAt(-11, -15) + 1.4, -15);
    blast.userData = { w: 2.2, h: 2.2, phase: 0, blast: true };
    scene.add(blast);
    fires.push(blast);

    fireLight = new THREE.PointLight(0xff7a2a, 1.6, 16, 2);
    fireLight.position.set(-11, heightAt(-11, -15) + 1.6, -15);
    scene.add(fireLight);

    for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.05, 1.4),
            new THREE.MeshBasicMaterial({ color: 0xffe1a0 })
        );
        m.visible = false;
        scene.add(m);
        tracers.push({ mesh: m, life: i * 0.4 });
    }

    const dustMap = canvasTexture(paintSoft(190, 170, 130));
    for (let i = 0; i < 18; i++) {
        const s = new THREE.Sprite(spriteMat(dustMap, 0.08, false));
        s.position.set((Math.random() - 0.5) * 80, 1 + Math.random() * 6, (Math.random() - 0.5) * 80);
        s.scale.setScalar(4 + Math.random() * 6);
        scene.add(s);
        smokes.push({
            position: s.position,
            scale: s.scale,
            material: s.material,
            userData: { life: Math.random(), speed: 0.4, size: 5, origin: s.position.clone(), drift: 2, dust: true },
            isDust: true
        });
    }
}

function createUnit(mats) {
    unit = buildTank(mats);
    const x = 0;
    const z = 2;
    unit.position.set(x, heightAt(x, z), z);
    unit.rotation.y = 0.15;
    scene.add(unit);
}

function createSelectionRing() {
    selectionRing = new THREE.Mesh(
        new THREE.RingGeometry(3.05, 3.42, 64),
        new THREE.MeshBasicMaterial({ color: 0x8fd4ff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.material.polygonOffset = true;
    selectionRing.material.polygonOffsetFactor = -2;
    selectionRing.visible = true;
    scene.add(selectionRing);

    orderPath = new THREE.Group();
    for (let i = 0; i < 8; i++) {
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.16, 0.32, 16),
            new THREE.MeshBasicMaterial({ color: 0x9fd7ff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
        );
        ring.rotation.x = -Math.PI / 2;
        orderPath.add(ring);
    }
    orderPath.visible = false;
    scene.add(orderPath);
    stickRing();
}

function stickRing() {
    selectionRing.position.set(unit.position.x, heightAt(unit.position.x, unit.position.z) + 0.12, unit.position.z);
}

function isDescendant(obj, root) {
    let o = obj;
    while (o) {
        if (o === root) return true;
        o = o.parent;
    }
    return false;
}

function setupControls() {
    const canvas = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) isDragging = true;
        previousMouse = { x: e.clientX, y: e.clientY };
        dragDist = 0;
    });
    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - previousMouse.x;
        const dy = e.clientY - previousMouse.y;
        dragDist += Math.abs(dx) + Math.abs(dy);
        targetRotation.y += dx * 0.005;
        targetRotation.x = Math.max(0.45, Math.min(1.25, targetRotation.x + dy * 0.003));
        previousMouse = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('mouseup', () => { isDragging = false; });
    canvas.addEventListener('mouseleave', () => { isDragging = false; });
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        cameraDistance = Math.max(28, Math.min(120, cameraDistance + e.deltaY * 0.04));
    }, { passive: false });

    canvas.addEventListener('click', (e) => {
        if (dragDist > 6) return;
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects([terrain, unit], true);
        const status = document.getElementById('status');
        if (!hits.length) return;
        const hit = hits[0];
        if (isDescendant(hit.object, unit)) {
            selected = true;
            selectionRing.visible = true;
            stickRing();
            if (status) status.textContent = 'Vehicle selected — click the ground to move';
        } else if (selected && hit.object === terrain) {
            moveTarget = hit.point.clone();
            if (status) status.textContent = 'Moving';
        }
    });
}

function updateOrderPath() {
    if (!moveTarget) {
        orderPath.visible = false;
        return;
    }
    orderPath.visible = true;
    for (let i = 0; i < orderPath.children.length; i++) {
        const t = (i + 1) / (orderPath.children.length + 1);
        const x = unit.position.x + (moveTarget.x - unit.position.x) * t;
        const z = unit.position.z + (moveTarget.z - unit.position.z) * t;
        const m = orderPath.children[i];
        m.position.set(x, heightAt(x, z) + 0.1, z);
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    camera.position.x = focus.x + Math.sin(targetRotation.y) * Math.cos(targetRotation.x) * cameraDistance;
    camera.position.y = focus.y + Math.sin(targetRotation.x) * cameraDistance;
    camera.position.z = focus.z + Math.cos(targetRotation.y) * Math.cos(targetRotation.x) * cameraDistance;
    camera.lookAt(focus);

    const pan = 18 * dt;
    if (keys.w) focus.z -= pan;
    if (keys.s) focus.z += pan;
    if (keys.a) focus.x -= pan;
    if (keys.d) focus.x += pan;

    if (moveTarget && selected) {
        const dir = new THREE.Vector3().subVectors(moveTarget, unit.position);
        dir.y = 0;
        if (dir.length() > 0.45) {
            dir.normalize();
            unit.position.x += dir.x * 8 * dt;
            unit.position.z += dir.z * 8 * dt;
            unit.rotation.y = Math.atan2(dir.x, dir.z);
        } else {
            moveTarget = null;
            const status = document.getElementById('status');
            if (status) status.textContent = 'Vehicle selected — click the ground to move';
        }
        unit.position.y = heightAt(unit.position.x, unit.position.z);
        stickRing();
    }
    updateOrderPath();

    smokes.forEach((s) => {
        const u = s.userData;
        u.life += dt * (u.dust ? 0.08 : 0.18);
        if (u.life > 1) u.life -= 1;
        const life = u.life;
        s.position.y = u.origin.y + life * u.speed;
        s.position.x = u.origin.x + Math.sin(life * 6.2) * u.drift;
        const scale = u.size * (0.45 + life * 1.3);
        s.scale.set(scale, scale, 1);
        if (!u.dust) s.material.opacity = (1 - life) * 0.42;
    });

    fires.forEach((f) => {
        const u = f.userData;
        if (u.blast) {
            const cycle = (t % 4.5) / 4.5;
            const burst = cycle < 0.18 ? cycle / 0.18 : 0;
            f.material.opacity = burst * 0.8;
            const sc = 0.4 + burst * 3.2;
            f.scale.set(u.w * sc, u.h * sc, 1);
        } else {
            const flicker = 0.85 + Math.sin(t * 16 + u.phase) * 0.18;
            f.scale.set(u.w * flicker, u.h * (0.9 + Math.sin(t * 21 + u.phase) * 0.16), 1);
        }
    });
    if (fireLight) fireLight.intensity = 1.2 + Math.sin(t * 18) * 0.45;

    tracers.forEach((tr, i) => {
        tr.life += dt;
        if (tr.life > 1.6) tr.life = 0;
        const show = tr.life < 0.35;
        tr.mesh.visible = show;
        if (!show) return;
        const p = tr.life / 0.35;
        tr.mesh.position.set(-20 + p * 28 + i * 2, 2.2 + i * 0.3, -6 - p * 18);
        tr.mesh.lookAt(-20 + 28, 2.2, -24);
    });

    renderer.render(scene, camera);
}

init();
