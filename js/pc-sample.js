// Military RTS PC Open World Sample - matches approved atmosphere
let scene, camera, renderer;
let terrain, particles, unit, selectionRing;
let isDragging = false, previousMouse = {x:0,y:0}, targetRotation = {x:0.3,y:0.5};
let moveTarget = null, selected = false;
const keys = {};

function init() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x8a9a8a, 0.015);
    scene.background = new THREE.Color(0x5a6570);
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(40, 50, 40);
    camera.lookAt(0, 0, 0);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);
    const ambient = new THREE.AmbientLight(0x6a7a6a, 0.4);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xa8b0b8, 0.8);
    directional.position.set(-30, 40, 20);
    directional.castShadow = true;
    directional.shadow.mapSize.set(2048, 2048);
    scene.add(directional);
    createTerrain(); createProps(); createParticles(); createUnit(); createSelectionRing(); setupControls();
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
    window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
    animate();
}
function createTerrain() {
    const geometry = new THREE.PlaneGeometry(100, 100, 50, 50);
    const vertices = geometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
        const x = vertices[i], z = vertices[i + 2];
        vertices[i + 1] = Math.sin(x * 0.1) * Math.cos(z * 0.1) * 3 + Math.sin(x * 0.05) * 2;
    }
    geometry.computeVertexNormals();
    terrain = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: 0x3a4a2a }));
    terrain.rotation.x = -Math.PI / 2; terrain.receiveShadow = true; scene.add(terrain);
}
function createProps() {
    for (let i = 0; i < 30; i++) {
        const tree = new THREE.Mesh(new THREE.ConeGeometry(1.2, 4, 6), new THREE.MeshLambertMaterial({ color: 0x2c3e2c }));
        tree.position.set((Math.random()-0.5)*80, 2, (Math.random()-0.5)*80); tree.castShadow = true; scene.add(tree);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.5), new THREE.MeshLambertMaterial({ color: 0x4a3f35 }));
        trunk.position.copy(tree.position); trunk.position.y = 0.75; trunk.castShadow = true; scene.add(trunk);
    }
    for (let i = 0; i < 20; i++) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(Math.random()*1 + 0.5), new THREE.MeshLambertMaterial({ color: 0x4a3f35 }));
        rock.position.set((Math.random()-0.5)*70, 0.5, (Math.random()-0.5)*70);
        rock.rotation.set(Math.random(), Math.random(), Math.random()); rock.castShadow = true; scene.add(rock);
    }
    const bunker = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 3), new THREE.MeshLambertMaterial({ color: 0x5a5a4a }));
    bunker.position.set(10, 1, -15); bunker.castShadow = true; scene.add(bunker);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 6), new THREE.MeshLambertMaterial({ color: 0x6b5b3a }));
    tower.position.set(-20, 3, 10); tower.castShadow = true; scene.add(tower);
}
function createParticles() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(200 * 3);
    for (let i = 0; i < 200 * 3; i += 3) { pos[i] = (Math.random()-0.5)*100; pos[i+1] = Math.random()*20+5; pos[i+2] = (Math.random()-0.5)*100; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    particles = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x8a9a8a, size: 0.3, transparent: true, opacity: 0.4 }));
    scene.add(particles);
}
function createUnit() {
    unit = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 3.5), new THREE.MeshLambertMaterial({ color: 0x4a5a3a }));
    body.position.y = 0.8; body.castShadow = true; unit.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1, 1.5), new THREE.MeshLambertMaterial({ color: 0x3a4a2a }));
    cab.position.set(0, 1.6, -0.5); cab.castShadow = true; unit.add(cab);
    unit.position.set(0, 0, 0); scene.add(unit);
}
function createSelectionRing() {
    selectionRing = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.1, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffff00 }));
    selectionRing.rotation.x = -Math.PI/2; selectionRing.position.y = 0.2; selectionRing.visible = false; scene.add(selectionRing);
}
function setupControls() {
    const canvas = renderer.domElement, raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2();
    canvas.addEventListener('mousedown', e => { if (e.button === 0) isDragging = true; previousMouse = {x:e.clientX, y:e.clientY}; });
    canvas.addEventListener('mousemove', e => {
        if (!isDragging) return;
        targetRotation.y += (e.clientX - previousMouse.x) * 0.005;
        targetRotation.x = Math.max(-0.2, Math.min(1.0, targetRotation.x + (e.clientY - previousMouse.y) * 0.003));
        previousMouse = {x:e.clientX, y:e.clientY};
    });
    canvas.addEventListener('mouseup', () => isDragging = false);
    canvas.addEventListener('wheel', e => { camera.position.multiplyScalar(1 + e.deltaY * 0.001); });
    canvas.addEventListener('click', e => {
        mouse.x = (e.clientX / window.innerWidth)*2 - 1;
        mouse.y = -(e.clientY / window.innerHeight)*2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects([terrain, unit], true);
        if (hits.length) {
            const hit = hits[0];
            if (hit.object === unit || unit.children.includes(hit.object)) {
                selected = true; selectionRing.visible = true;
                selectionRing.position.set(unit.position.x, 0.2, unit.position.z);
            } else if (selected && hit.object === terrain) {
                moveTarget = hit.point.clone(); moveTarget.y = 0;
            }
        }
    });
}
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
function animate() {
    requestAnimationFrame(animate);
    const r = camera.position.length();
    camera.position.x = Math.sin(targetRotation.y) * Math.cos(targetRotation.x) * r;
    camera.position.z = Math.cos(targetRotation.y) * Math.cos(targetRotation.x) * r;
    camera.position.y = Math.sin(targetRotation.x) * r + 30;
    camera.lookAt(0, 0, 0);
    if (keys.w) camera.position.z -= 0.5;
    if (keys.s) camera.position.z += 0.5;
    if (keys.a) camera.position.x -= 0.5;
    if (keys.d) camera.position.x += 0.5;
    if (moveTarget && selected) {
        const d = new THREE.Vector3().subVectors(moveTarget, unit.position); d.y = 0;
        if (d.length() > 0.4) { d.normalize().multiplyScalar(0.12); unit.position.add(d); selectionRing.position.set(unit.position.x, 0.2, unit.position.z); }
        else moveTarget = null;
    }
    if (particles) {
        const p = particles.geometry.attributes.position.array;
        for (let i = 1; i < p.length; i += 3) { p[i] -= 0.01; if (p[i] < 0) p[i] = 20; }
        particles.geometry.attributes.position.needsUpdate = true;
    }
    renderer.render(scene, camera);
}
init();
