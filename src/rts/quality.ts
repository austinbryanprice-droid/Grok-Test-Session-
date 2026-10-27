export type QualityName = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityPreset {
  name: QualityName;
  composer: boolean;
  antialias: boolean;
  shadowMapSize: number;
  cascades: number;
  ssao: false | 'half' | 'full';
  msaa: number;
  smaa: boolean;
  pixelRatioCap: number;
  foliage: number;
}

export const PRESETS: Record<QualityName, QualityPreset> = {
  low: {
    name: 'low',
    composer: false,
    antialias: true,
    shadowMapSize: 1024,
    cascades: 1,
    ssao: false,
    msaa: 0,
    smaa: false,
    pixelRatioCap: 1,
    foliage: 0.5,
  },
  medium: {
    name: 'medium',
    composer: true,
    antialias: false,
    shadowMapSize: 2048,
    cascades: 1,
    ssao: false,
    msaa: 0,
    smaa: true,
    pixelRatioCap: 1.5,
    foliage: 1,
  },
  high: {
    name: 'high',
    composer: true,
    antialias: false,
    shadowMapSize: 2048,
    cascades: 2,
    ssao: 'half',
    msaa: 4,
    smaa: false,
    pixelRatioCap: 1.5,
    foliage: 1,
  },
  ultra: {
    name: 'ultra',
    composer: true,
    antialias: false,
    shadowMapSize: 2048,
    cascades: 3,
    ssao: 'full',
    msaa: 4,
    smaa: false,
    pixelRatioCap: 2,
    foliage: 1,
  },
};

export function parseQuality(value: string | null): QualityName | null {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'ultra') return value;
  return null;
}

export function autoQuality(): QualityName {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) return 'low';
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '';
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  if (/swiftshader|llvmpipe|softpipe|microsoft basic render/i.test(renderer)) return 'low';
  if (/rtx|radeon rx|apple m|geforce gtx|geforce rtx|arc\(tm\)/i.test(renderer)) return 'high';
  return 'medium';
}
