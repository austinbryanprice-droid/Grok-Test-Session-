# Golden hour blocks

Top-down 3D scene in Vite, TypeScript, and Three.js. The world is a beveled voxel grid with a generated texture atlas, golden-hour light, and a lake.

```bash
npm install
npm run dev
```

Walk with WASD.

## Numbers worth tuning

These live in `src/tuning.ts`.

| Knob | Value | What it does |
| --- | --- | --- |
| `sunElevationDeg` | 25 | Lower makes the shadows longer. Stay between 20 and 30. |
| `sunAzimuthDeg` | 132 | Swings the shadow direction around the hut. |
| `sunIntensity` | 2.5 | Warm key light. |
| `fogDensity` | 0.012 | How fast the hills disappear into the horizon. |
| `fogColor` | `#d9a877` | Horizon haze. Match it to the sky horizon. |
| `exposure` | 1.1 | ACES exposure. |
| `bloomStrength` | 0.35 | Sun, eyes, and water glints. |
| `bloomRadius` | 0.8 | How wide that glow spreads. |
| `bloomThreshold` | 0.85 | What counts as bright enough to bloom. |
| `bevel` | 0.07 | Chamfer size, about 7% of a block. |
| `cameraPitchDeg` | 58 | Top-down tilt. Keep it between 55 and 60. |
| `cameraHeight` | 18 | Blocks above the player. |
