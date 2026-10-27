export type QualityName = 'low' | 'balanced' | 'ultra';

export interface QualityPreset {
  shadow: number;
  bloom: boolean;
  shafts: boolean;
  reflection: boolean;
  grass: number;
  trees: number;
  rocks: number;
  reeds: number;
  pixelRatio: number;
}

export const PRESETS: Record<QualityName, QualityPreset> = {
  low: {
    shadow: 512,
    bloom: false,
    shafts: false,
    reflection: false,
    grass: 500,
    trees: 50,
    rocks: 24,
    reeds: 40,
    pixelRatio: 1,
  },
  balanced: {
    shadow: 1024,
    bloom: true,
    shafts: true,
    reflection: true,
    grass: 1400,
    trees: 110,
    rocks: 50,
    reeds: 90,
    pixelRatio: 1.25,
  },
  ultra: {
    shadow: 2048,
    bloom: true,
    shafts: true,
    reflection: true,
    grass: 2600,
    trees: 180,
    rocks: 80,
    reeds: 140,
    pixelRatio: 1.5,
  },
};

export function parseQuality(value: string | null): QualityName {
  if (value === 'low' || value === 'balanced' || value === 'ultra') return value;
  return 'ultra';
}
