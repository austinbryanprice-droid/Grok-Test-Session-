import { Color, Vector3 } from 'three';

export const FOG_COLOR = new Color(0xd7c4aa);
export const FOG_DENSITY = 0.0046;

/** Direction sunlight travels, late afternoon from the southwest. */
export const LIGHT_DIR = new Vector3(-0.72, -0.32, -0.48).normalize();

export const SUN_COLOR = new Color(0xffc48a);
export const CLOUD_SUN_COLOR = new Color(0xc9b3a2);
export const SKY_FILL = new Color(0xd5e4f2);
export const GROUND_BOUNCE = new Color(0x6d7348);
