import { Color, Vector3 } from 'three';

export const FOG_COLOR = new Color(0xc5d3df);
export const FOG_DENSITY = 0.0032;

/**
 * Sunlight travel direction. Elevation is about 42 degrees so meadow
 * shadows stay short and dark, and the lit faces point toward the
 * southwest camera.
 */
const elevation = (42 * Math.PI) / 180;
const azimuth = -2.25;
const horizontal = Math.cos(elevation);
export const LIGHT_DIR = new Vector3(
  Math.sin(azimuth) * horizontal,
  -Math.sin(elevation),
  Math.cos(azimuth) * horizontal,
).normalize();

export const SUN_COLOR = new Color(0xffc48a);
export const CLOUD_SUN_COLOR = new Color(0xc9b3a2);
export const SKY_FILL = new Color(0xd5e4f2);
export const GROUND_BOUNCE = new Color(0x6d7348);
