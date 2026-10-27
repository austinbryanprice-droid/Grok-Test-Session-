/** Section 4 starting colors. Environment saturation stays in the painted set; team colors are the saturated accents. */
export const ENV = {
  grass: 0x7e9a4b,
  grassLight: 0x9db35e,
  grassDark: 0x5f7a3a,
  dry: 0xb7a660,
  dirt: 0xa88b62,
  soil: 0x6e5338,
  sand: 0xd8c49a,
  rockLight: 0xb8ae9c,
  rockDark: 0x7d7466,
  wood: 0x7a5a3c,
  woodLight: 0xa08566,
  thatch: 0xb89a5e,
  clay: 0xa5533b,
  slate: 0x5e6670,
  plaster: 0xe7dcc6,
  stone: 0xc2b59d,
  waterDeep: 0x2f5f73,
  waterShallow: 0x5fa6a0,
  foliageA: 0x5e7f3a,
  foliageB: 0x87a548,
  pine: 0x3f5e3a,
  skin: 0xc8966a,
  cloth: 0x6e6458,
  clothB: 0x7a6a58,
  steel: 0xc5c8ce,
  gold: 0xd9a93a,
  wheat: 0xd9b95a,
  flowerYellow: 0xc4b15e,
  flowerWhite: 0xe4e0d4,
  flowerPurple: 0x8e74a8,
  flowerRed: 0xb85a52,
  hair: 0x4a3428,
  rope: 0x8a7048,
  wool: 0xe4e0d4,
  leather: 0x6a4a32,
} as const;

export const TEAM = {
  blue: 0x2f6fe0,
  red: 0xd8312b,
  yellow: 0xf2c230,
  green: 0x3faf3f,
  purple: 0x8a44c8,
  orange: 0xf07f1e,
  teal: 0x2bb5b5,
  pink: 0xe35da4,
} as const;

export const LIGHT = {
  sun: 0xfff1dc,
  hemiSky: 0xa9c4e0,
  hemiGround: 0x8c8a6e,
  fog: 0xbfd3e6,
  skyTop: 0x7fa8d8,
  skyHorizon: 0xc9dbea,
  rim: 0xfff6e0,
  highlight: 0xfff0d8,
  shadowTint: 0xa9b8d8,
} as const;

export const GAME = {
  selectOwn: 0x6cff6c,
  selectEnemy: 0xff4a4a,
  fireCore: 0xffd27a,
  fireEdge: 0xff6a1e,
  healthGreen: 0x4cd04c,
  healthRed: 0xe03a3a,
  torch: 0xff9a40,
} as const;

export const MAP_SIZE = 128;
export const PERSON_HEIGHT = 2.2;

export function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}
