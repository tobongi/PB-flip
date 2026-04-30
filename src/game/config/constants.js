import * as THREE from 'three';

// Read viewport from window — available immediately, no layout dependency.
// body.offsetWidth/Height returned 0 in some headless/early-load contexts,
// freezing every derived dimension at 0 forever.
const rawWidth = window.innerWidth || window.document.documentElement.clientWidth || 360;
const rawHeight = window.innerHeight || window.document.documentElement.clientHeight || 640;

export const BODY_WIDTH = Math.min(rawWidth, 540);
export const BODY_HEIGHT = rawHeight;
export const ASPECT = BODY_WIDTH / BODY_HEIGHT;
export const SCREEN_HEIGHT = BODY_HEIGHT;
export const SCREEN_WIDTH = SCREEN_HEIGHT * ASPECT;
export const FRUSTUM_HEIGHT = 8;
export const FRUSTUM_WIDTH = FRUSTUM_HEIGHT * ASPECT;
export const FRUSTUM_SCALE = FRUSTUM_HEIGHT / SCREEN_HEIGHT;

export const FLIP_DISTANCE_UNIT = 2.5;
export const FLIP_HEIGHT = 1.5;
export const FLIP_DURATION = 500;

export const RESTAURANT_START_TABLE_INDEX = 0;
export const CAMERA_MOVE_DURATION = 600;
export const CAMERA_ROTATE_DURATION = 1200;

export const BOTTLE_PRESSED_H = 1.2;
export const BOTTLE_PRESSED_V = 0.45;
export const BLOCK_PRESSED_H = 0.5;
export const BLOCK_HEIGHT = 1;

export const PRESS_DURATION = 1500;
export const BOUNCE_DURATION = 500;
export const LANDING_IMPACT_DURATION = 200;

export const font = new THREE.FontLoader().parse(require('../../assets/font.json'));

// === La Maison PB — Design Tokens ===
export const PB_ORANGE = 0xE8750A;
export const PB_VERT_FONCE = 0x2D3319;
export const PB_VERT_CLAIR = 0x8CB33F;
export const PB_WHITE = 0xFFFFFF;
export const PB_CREAM = 0xFFF3E0;
export const PB_BRUN_BOIS = 0x6B3A1B;
export const PB_GRIS_FONTE = 0x3A3A3A;
export const PB_OR = 0xD4A017;

export const MODEL_SCALE = 0.8;

export const WORLDS = {
  restaurant: {
    name: 'Restaurant',
    bg: 0x2D3319,
    ground: 0xFFF3E0,
    ambient: 0xFFE0AA,
    ambientIntensity: 0.9,
    fogDensity: 0.006,
  },
};
