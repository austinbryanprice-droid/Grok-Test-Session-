# Marchfield

A small browser RTS scene in a painterly, sunlit style. Vite, TypeScript, and Three.js r170 render it with WebGL2. Meshes and textures are generated in the page. Nothing here is copied from another game.

```bash
npm install
npm run dev
```

WASD pans. The wheel zooms. Drag to yaw. The camera stays between a 30 px and 120 px figure at 1080p, with a 32° vertical field of view. Quality buttons are Low, Medium, High, and Ultra.

```
/?shot=default&quality=medium
/?shot=near
/?shot=far
/?quality=low
/?units=200
```

`shot` locks the camera for captures. `units=200` instances extra soldiers without adding draw calls. Medium is the 1080p target: one shadow map, a color LUT, bloom, and SMAA. High and Ultra add n8ao and cascaded shadows. Low renders directly, with the renderer's neutral tonemap and no post stack.

The art notes are in [docs/art-guide.md](docs/art-guide.md). Authored glTF, meshopt, and KTX2 export commands are in [docs/asset-pipeline.md](docs/asset-pipeline.md).
