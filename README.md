# Golden Hour

A browser voxel scene built with Vite, TypeScript, and Three.js. Terrain, water, cottages, foliage, textures, and the HUD are generated in code.

```bash
npm install
npm run dev
```

Open the dev server, then fly with the mouse and WASD. Q and E move vertically. Keys 1–8 pick a hotbar material or shape, F places a block, and R removes one you placed. Low, Balanced, and Ultra sit at the top right.

Fixed cameras used for the look comparisons:

```
/?shot=village&quality=ultra
/?shot=forest
/?shot=lake
/?shot=wood
/?shot=cottage
/?shot=roof
/?shot=hud
/?shot=vista
```

`?terrain=height` uses the smoothed heightfield instead of the surface net. `npm run look` rebuilds the site and writes side-by-side frames to `screenshots/compare/`.
