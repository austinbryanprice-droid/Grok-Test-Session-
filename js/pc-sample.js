// Military RTS PC Open World Sample - fixed for visibility
let scene, camera, renderer;
let terrain, particles, unit, selectionRing;
let isDragging = false, previousMouse = {x:0,y:0}, targetRotation = {x:0.6,y:0.8};
let moveTarget = null, selected = false;
const keys = {};

function init() {
    try {
        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x8a9a8a, 0.012);
        scene.background = new THREE.Color(0x5a6570);

        camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(50, 60, 50);
        camera.lookAt(0, 0, 0);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x5a6570);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(renderer.domElement);

        const ambient = new THREE.AmbientLight(0x6a7a6a, 0.6);
        scene.add(ambient);
        const directional = new THREE.DirectionalLight(0xa8b0b8, 1.0);
        directional.position.set(-40, 50, 20);
        directional.castShadow = true;
        scene.add(directional);

        // Bright test marker so we know rendering works
        const marker = new THREE.Mesh(
            new THREE.SphereGeometry(1.5, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xffaa00 })
        );
        marker.position.set(0, 3, 0);
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
        console.log('Scene initialized successfully');
    } catch (err) {
        console.error('Init error:', err);
        document.body.innerHTML += '<div style="color:red;position:absolute;top:50px;">Error: ' + err.message + '</div>';
    }
}

function createTerrain() {
    const geometry = new THREE.PlaneGeometry(120, 120, 40, 40);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        const y = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 4 + Math.sin(x * 0.04) * 2;
        positions.setY(i, y);
    }
    geometry.computeVertexNormals();
    const material = new THREE.MeshLambertMaterial({ color: 0x3a4a2a });
    terrain = new THREE.Mesh(geometry, material);
    terrain.rotation.x = -Math.PI / 2;
    terrain.receiveShadow = true;
    scene.add(terrain);
}

function createProps() {
    const treeMat = new THREE.MeshLambertMaterial({ color: 0x2c3e2c });
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3f35 });
    for (let i = 0; i < 25; i++) {
        const tree = new THREE.Mesh(new THREE.ConeGeometry(1.5, 5, 6), treeMat);
        tree.position.set((Math.random()-0.5)*90, 2.5, (Math.random()-0.5)*90);
        tree.castShadow = true;
        scene.add(tree);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.8), trunkMat);
        trunk.position.copy(tree.position);
        trunk.position.y = 0.9;
        trunk.castShadow = true;
        scene.add(trunk);
    }
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x4a3f35 });
    for (let i = 0; i < 15; i++) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(Math.random()*1.2 + 0.6), rockMat);
        rock.position.set((Math.random()-0.5)*80, 0.6, (Math.random()-0.5)*80);
        rock.rotation.set(Math.random()*2, Math.random()*2, Math.random()*2);
        rock.castShadow = true;
        scene.add(rock);
    }
    const bunker = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 4), new THREE.MeshLambertMaterial({ color: 0x5a5a4a }));
    bunker.position.set(12, 1.1, -18);
    bunker.castShadow = true;
    scene.add(bunker);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 7), new THREE.MeshLambertMaterial({ color: 0x6b5b3a }));
    tower.position.set(-22, 3.5, 12);
    tower.castShadow = true;
    scene.add(tower);
}

function createParticles() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(150 * 3);
    for (let i = 0; i < 150 * 3; i += 3) {
        pos[i] = (Math.random()-0.5)*100;
        pos[i+1] = Math.random()*15 + 4;
        pos[i+2] = (Math.random()-0.5)*100;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    particles = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x8a9a8a, size: 0.4, transparent: true, opacity: 0.5 }));
    scene.add(particles);
}

function createUnit() {
    unit = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.4, 4), new THREE.MeshLambertMaterial({ color: 0x5a6a4a }));
    body.position.y = 1.0;
    body.castShadow = true;
    unit.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 1.8), new THREE.MeshLambertMaterial({ color: 0x4a5a3a }));
    cab.position.set(0, 1.8, -0.6);
    cab.castShadow = true;
    unit.add(cab);
    unit.position.set(0, 0, 0);
    scene.add(unit);
}

function createSelectionRing() {
    selectionRing = new THREE.Mesh(new THREE.TorusGeometry(3, 0.12, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffff00 }));
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.position.y = 0.3;
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
        const dx = e.clientX - previousMouse.x;
        const dy = e.clientY - previousMouse.y;
        targetRotation.y += dx * 0.005;
        targetRotation.x = Math.max(0.2, Math.min(1.2, targetRotation.x + dy * 0.003));
        previousMouse = {x: e.clientX, y: e.clientY};
    });
    canvas.addEventListener('mouseup', () => isDragging = false);
    canvas.addEventListener('wheel', e => {
        const len = camera.position.length();
        camera.position.multiplyScalar(1 + e.deltaY * 0.001);
        if (camera.position.length() < 20) camera.position.setLength(20);
        if (camera.position.length() > 100) camera.position.setLength(100);
    });

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
                selectionRing.position.set(unit.position.x, 0.3, unit.position.z);
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

    const radius = Math.max(30, camera.position.length());
    camera.position.x = Math.sin(targetRotation.y) * Math.cos(targetRotation.x) * radius;
    camera.position.z = Math.cos(targetRotation.y) * Math.cos(targetRotation.x) * radius;
    camera.position.y = Math.sin(targetRotation.x) * radius + 25;
    camera.lookAt(0, 0, 0);

    const speed = 0.4;
    if (keys['w']) camera.position.z -= speed;
    if (keys['s']) camera.position.z += speed;
    if (keys['a']) camera.position.x -= speed;
    if (keys['d']) camera.position.x += speed;

    if (moveTarget && selected) {
        const dir = new THREE.Vector3().subVectors(moveTarget, unit.position);
        dir.y = 0;
        if (dir.length() > 0.6) {
            dir.normalize().multiplyScalar(0.15);
            unit.position.add(dir);
            selectionRing.position.set(unit.position.x, 0.3, unit.position.z);
        } else {
            moveTarget = null;
        }
    }

    if (particles) {
        const p = particles.geometry.attributes.position.array;
        for (let i = 1; i < p.length; i += 3) {
            p[i] -= 0.008;
            if (p[i] < 0) p[i] = 18;
        }
        particles.geometry.attributes.position.needsUpdate = true;
    }

    renderer.render(scene, camera);
}

init();
