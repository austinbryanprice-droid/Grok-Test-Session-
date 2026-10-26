// Military RTS PC Open World Sample - camera zoom bug fixed
let scene, camera, renderer;
let terrain, particles, unit, selectionRing;
let isDragging = false, previousMouse = {x:0,y:0};
let targetRotation = {x:0.55, y:0.7};
let cameraDistance = 48; // independent of position to prevent zoom-out feedback
let moveTarget = null, selected = false;
const keys = {};

function init() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x8a9a8a, 0.01);
    scene.background = new THREE.Color(0x5a6570);

    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 800);
    camera.position.set(40, 45, 40);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x5a6570);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0x6a7a6a, 0.55);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xa8b0b8, 0.95);
    directional.position.set(-35, 45, 15);
    directional.castShadow = true;
    scene.add(directional);

    // Orange marker for visibility confirmation
    const marker = new THREE.Mesh(
        new THREE.SphereGeometry(1.8, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffaa00 })
    );
    marker.position.set(0, 4, 0);
    scene.add(marker);

    createTerrain();
    createProps();
    createParticles();
    createUnit();
    createSelectionRing();
    setupControls();

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
    window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

    animate();
}

function createTerrain() {
    const geometry = new THREE.PlaneGeometry(100, 100, 40, 40);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        positions.setY(i, Math.sin(x * 0.09) * Math.cos(z * 0.09) * 3.5 + Math.sin(x * 0.045) * 1.8);
    }
    geometry.computeVertexNormals();
    terrain = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: 0x3a4a2a }));
    terrain.rotation.x = -Math.PI / 2;
    terrain.receiveShadow = true;
    scene.add(terrain);
}

function createProps() {
    const treeMat = new THREE.MeshLambertMaterial({ color: 0x2c3e2c });
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3f35 });
    for (let i = 0; i < 28; i++) {
        const tree = new THREE.Mesh(new THREE.ConeGeometry(1.4, 5, 6), treeMat);
        tree.position.set((Math.random()-0.5)*85, 2.5, (Math.random()-0.5)*85);
        tree.castShadow = true;
        scene.add(tree);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.6), trunkMat);
        trunk.position.copy(tree.position);
        trunk.position.y = 0.8;
        trunk.castShadow = true;
        scene.add(trunk);
    }
    for (let i = 0; i < 18; i++) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(Math.random()*1.1 + 0.5), new THREE.MeshLambertMaterial({ color: 0x4a3f35 }));
        rock.position.set((Math.random()-0.5)*75, 0.5, (Math.random()-0.5)*75);
        rock.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
        rock.castShadow = true;
        scene.add(rock);
    }
    const bunker = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 3.5), new THREE.MeshLambertMaterial({ color: 0x5a5a4a }));
    bunker.position.set(10, 1, -16);
    bunker.castShadow = true;
    scene.add(bunker);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 6.5), new THREE.MeshLambertMaterial({ color: 0x6b5b3a }));
    tower.position.set(-18, 3.25, 10);
    tower.castShadow = true;
    scene.add(tower);
}

function createParticles() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(120 * 3);
    for (let i = 0; i < 120 * 3; i += 3) {
        pos[i] = (Math.random()-0.5)*90;
        pos[i+1] = Math.random()*12 + 3;
        pos[i+2] = (Math.random()-0.5)*90;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    particles = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x8a9a8a, size: 0.35, transparent: true, opacity: 0.45 }));
    scene.add(particles);
}

function createUnit() {
    unit = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 3.8), new THREE.MeshLambertMaterial({ color: 0x5a6a4a }));
    body.position.y = 0.9;
    body.castShadow = true;
    unit.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.1, 1.6), new THREE.MeshLambertMaterial({ color: 0x4a5a3a }));
    cab.position.set(0, 1.7, -0.5);
    cab.castShadow = true;
    unit.add(cab);
    unit.position.set(0, 0, 0);
    scene.add(unit);
}

function createSelectionRing() {
    selectionRing = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.1, 8, 20), new THREE.MeshBasicMaterial({ color: 0xffff00 }));
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.position.y = 0.25;
    selectionRing.visible = false;
    scene.add(selectionRing);
}

function setupControls() {
    const canvas = renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    canvas.addEventListener('mousedown', e => {
        if (e.button === 0) isDragging = true;
        previousMouse = {x: e.clientX, y: e.clientY};
    });
    canvas.addEventListener('mousemove', e => {
        if (!isDragging) return;
        targetRotation.y += (e.clientX - previousMouse.x) * 0.005;
        targetRotation.x = Math.max(0.25, Math.min(1.15, targetRotation.x + (e.clientY - previousMouse.y) * 0.003));
        previousMouse = {x: e.clientX, y: e.clientY};
    });
    canvas.addEventListener('mouseup', () => isDragging = false);
    canvas.addEventListener('mouseleave', () => isDragging = false);

    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        cameraDistance = Math.max(22, Math.min(80, cameraDistance + e.deltaY * 0.05));
    }, { passive: false });

    canvas.addEventListener('click', e => {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects([terrain, unit], true);
        if (hits.length) {
            const hit = hits[0];
            if (hit.object === unit || (unit && unit.children.includes(hit.object))) {
                selected = true;
                selectionRing.visible = true;
                selectionRing.position.set(unit.position.x, 0.25, unit.position.z);
            } else if (selected && hit.object === terrain) {
                moveTarget = hit.point.clone();
                moveTarget.y = 0;
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

    // Stable orbit using independent distance — no feedback loop
    camera.position.x = Math.sin(targetRotation.y) * Math.cos(targetRotation.x) * cameraDistance;
    camera.position.z = Math.cos(targetRotation.y) * Math.cos(targetRotation.x) * cameraDistance;
    camera.position.y = Math.sin(targetRotation.x) * cameraDistance + 18;
    camera.lookAt(0, 0, 0);

    // Light WASD pan (optional, relative)
    const pan = 0.3;
    if (keys['w']) camera.position.z -= pan;
    if (keys['s']) camera.position.z += pan;
    if (keys['a']) camera.position.x -= pan;
    if (keys['d']) camera.position.x += pan;

    if (moveTarget && selected) {
        const dir = new THREE.Vector3().subVectors(moveTarget, unit.position);
        dir.y = 0;
        if (dir.length() > 0.5) {
            dir.normalize().multiplyScalar(0.18);
            unit.position.add(dir);
            selectionRing.position.set(unit.position.x, 0.25, unit.position.z);
        } else {
            moveTarget = null;
        }
    }

    if (particles) {
        const p = particles.geometry.attributes.position.array;
        for (let i = 1; i < p.length; i += 3) {
            p[i] -= 0.006;
            if (p[i] < 0) p[i] = 15;
        }
        particles.geometry.attributes.position.needsUpdate = true;
    }

    renderer.render(scene, camera);
}

init();
