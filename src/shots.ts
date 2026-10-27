export interface Shot {
  name: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  hud: boolean;
}

export const SHOTS: Shot[] = [
  { name: 'village', position: [66, 18.2, 64], target: [56, 15.2, 82], fov: 40, hud: false },
  { name: 'forest', position: [92, 17.6, 102], target: [78, 15.4, 116], fov: 48, hud: false },
  { name: 'lake', position: [82, 10.4, 42], target: [108, 8.35, 46], fov: 46, hud: false },
  { name: 'wood', position: [47.6, 15.5, 69.4], target: [53.5, 14.55, 74.2], fov: 36, hud: false },
  { name: 'cottage', position: [44, 17.4, 74], target: [58, 16.6, 79], fov: 38, hud: false },
  { name: 'roof', position: [46, 15.2, 64], target: [58, 20.2, 78], fov: 40, hud: false },
  { name: 'hud', position: [66, 18.2, 64], target: [56, 15.2, 82], fov: 40, hud: true },
  { name: 'vista', position: [112, 24, 102], target: [62, 11, 56], fov: 48, hud: false },
];

export function findShot(name: string | null): Shot | null {
  if (!name) return null;
  return SHOTS.find((shot) => shot.name === name) ?? null;
}
