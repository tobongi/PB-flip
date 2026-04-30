import * as THREE from 'three';

const GAME_ASPECT = 9 / 16; // portrait — enforced on all platforms

function computeGameSize(windowW, windowH) {
  if (windowW / windowH > GAME_ASPECT) {
    // Window is wider than 9:16 → pillarbox: constrain by height
    return { w: Math.round(windowH * GAME_ASPECT), h: windowH };
  }
  // Window is taller than 9:16 → letterbox: constrain by width
  return { w: windowW, h: Math.round(windowW / GAME_ASPECT) };
}

const windowW0 = window.innerWidth || window.document.documentElement.clientWidth || 360;
const windowH0 = window.innerHeight || window.document.documentElement.clientHeight || 640;
const { w: rawWidth, h: rawHeight } = computeGameSize(windowW0, windowH0);

export let BODY_WIDTH = rawWidth;
export let BODY_HEIGHT = rawHeight;
export let ASPECT = BODY_WIDTH / BODY_HEIGHT;
export let SCREEN_HEIGHT = BODY_HEIGHT;
export let SCREEN_WIDTH = BODY_WIDTH;
export let FRUSTUM_HEIGHT = 11.0;
export let FRUSTUM_WIDTH = FRUSTUM_HEIGHT * ASPECT;
export let FRUSTUM_SCALE = FRUSTUM_HEIGHT / SCREEN_HEIGHT;

export function updateViewport() {
  const ww = window.innerWidth || window.document.documentElement.clientWidth || 360;
  const wh = window.innerHeight || window.document.documentElement.clientHeight || 640;
  const { w, h } = computeGameSize(ww, wh);
  BODY_WIDTH = w;
  BODY_HEIGHT = h;
  ASPECT = BODY_WIDTH / BODY_HEIGHT;
  SCREEN_HEIGHT = BODY_HEIGHT;
  SCREEN_WIDTH = BODY_WIDTH;
  FRUSTUM_WIDTH = FRUSTUM_HEIGHT * ASPECT;
  FRUSTUM_SCALE = FRUSTUM_HEIGHT / SCREEN_HEIGHT;
}

export const FLIP_DISTANCE_UNIT = 6.0;
export const FLIP_HEIGHT = 3.5;
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

export const MODEL_SCALE = 2.0;

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
