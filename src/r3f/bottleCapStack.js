// bottleCapStack.js
//
// Phase 3 proof of decomposition. The bottle cap stack — collar, threads,
// cap base, dispenser cone, tip — extracted from Bottle.js as a declarative
// scene description. Re-built imperatively today via sceneDSL; mapped to R3F
// JSX in r3fAdapter.js once the React/three upgrade chain lands.
//
// Visual output is byte-identical to the original imperative construction
// in src/game/entities/Bottle.js (sections 5–7). Verified by the snapshot
// test in __tests__/bottleCapStack.test.js.

import * as THREE from 'three';
import { buildSceneWithRefs } from './sceneDSL';

const CAP_MAT = {
  type: 'meshStandard',
  args: [{ color: 0xF4F1EC, roughness: 0.32, metalness: 0.12 }],
};

const CAP_RING_MAT = {
  type: 'meshStandard',
  args: [{ color: 0xE8E4DC, roughness: 0.22, metalness: 0.25 }],
};

/**
 * Build the cap stack as a declarative node tree.
 *
 * @param {Object} options
 * @param {number} [options.segments=64] — radial segments for all turned parts.
 * @param {number} [options.collarBaseZ=1.105] — Z of the collar bottom.
 * @returns {Object} sceneDSL node
 */
export function buildCapStackNode({ segments = 64, collarBaseZ = 1.105 } = {}) {
  const threads = [];
  for (let i = 0; i < 3; i++) {
    threads.push({
      type: 'mesh',
      name: `cap-thread-${i}`,
      position: [0, 0, collarBaseZ + 0.012 + i * 0.022],
      geometry: { type: 'torus', args: [0.158, 0.006, 8, segments] },
      material: CAP_RING_MAT,
    });
  }

  return {
    type: 'group',
    name: 'cap-stack',
    children: [
      // Threaded collar — cylinder rotated to stand upright on +Z.
      {
        type: 'mesh',
        name: 'collar',
        position: [0, 0, collarBaseZ + 0.035],
        rotation: [Math.PI / 2, 0, 0],
        geometry: { type: 'cylinder', args: [0.155, 0.15, 0.07, segments] },
        material: CAP_MAT,
      },
      ...threads,
      // Cap base
      {
        type: 'mesh',
        name: 'cap-base',
        position: [0, 0, 1.205],
        rotation: [Math.PI / 2, 0, 0],
        geometry: { type: 'cylinder', args: [0.165, 0.165, 0.06, segments] },
        material: CAP_MAT,
      },
      // Cap base bevel rim
      {
        type: 'mesh',
        name: 'cap-rim',
        position: [0, 0, 1.18],
        geometry: { type: 'torus', args: [0.166, 0.006, 12, segments] },
        material: CAP_RING_MAT,
      },
      // Dispenser cone
      {
        type: 'mesh',
        name: 'cone',
        position: [0, 0, 1.315],
        rotation: [Math.PI / 2, 0, 0],
        geometry: { type: 'cylinder', args: [0.05, 0.155, 0.16, segments] },
        material: CAP_MAT,
      },
      // Tip
      {
        type: 'mesh',
        name: 'tip',
        position: [0, 0, 1.415],
        rotation: [Math.PI / 2, 0, 0],
        geometry: { type: 'cylinder', args: [0.045, 0.05, 0.04, segments] },
        material: CAP_MAT,
      },
      // Tip hole — flat dark disc on top sells the dispenser opening.
      {
        type: 'mesh',
        name: 'tip-hole',
        position: [0, 0, 1.436],
        geometry: { type: 'circle', args: [0.018, 24] },
        material: {
          type: 'meshStandard',
          args: [{ color: 0x1a1a1a, roughness: 0.9, metalness: 0.0 }],
        },
      },
    ],
  };
}

/**
 * Build the cap stack as a three.js Group. Returned object is a drop-in
 * replacement for the imperative cap-stack section of Bottle.js.
 *
 * Each child mesh is also exposed via the `refs` return so callers can
 * still grab specific meshes for animation/physics without tree-walking.
 */
export function buildCapStack(options) {
  const node = buildCapStackNode(options);
  const { root, refs } = buildSceneWithRefs(node);
  // Cast/receive shadow flags propagated to all meshes — matches the
  // original Bottle.js traverse pass.
  root.traverse(child => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return { group: root, refs };
}
