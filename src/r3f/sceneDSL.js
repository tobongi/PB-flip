// sceneDSL.js
//
// Phase 3 (R3F migration) foundation.
//
// A declarative scene description format that builds vanilla three.js objects
// today, but maps 1:1 onto @react-three/fiber JSX once the React 16 -> 17 and
// three 0.89 -> 0.155 upgrades land. The shape of every node is intentionally
// the same as R3F's prop conventions:
//
//   { type: 'mesh', position: [x, y, z], rotation: [rx, ry, rz], scale: [s] | s,
//     geometry: { type: 'lathe', args: [points, segments] },
//     material: { type: 'meshStandard', args: [{ color, roughness, metalness }] },
//     children: [...] }
//
// Once R3F is installed, the same node tree drives JSX (see r3fAdapter.js),
// so the migration becomes mechanical: replace `buildScene(node)` with
// `<Scene node={node} />` per entity.
//
// Why this matters now (before the actual R3F install can happen):
//   * Removes hundreds of lines of imperative `new THREE.Mesh(...)` ceremony.
//   * Makes scene structure data — testable, serializable, snapshot-friendly.
//   * Decouples geometry/material catalogs from layout — paves the way for
//     scene streaming, hot-reload, and the eventual JSX swap.

import * as THREE from 'three';

// ----- geometry factories ----------------------------------------------------

const GEOMETRY_FACTORIES = {
  lathe: ([points, segments = 32]) =>
    new THREE.LatheGeometry(points, segments),
  cylinder: ([radiusTop, radiusBottom, height, radialSegments = 32]) =>
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments),
  torus: ([radius, tube, radialSegments = 12, tubularSegments = 32]) =>
    new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments),
  circle: ([radius, segments = 24]) =>
    new THREE.CircleGeometry(radius, segments),
  plane: ([width, height = width]) =>
    new THREE.PlaneGeometry(width, height),
  box: ([width, height = width, depth = width]) =>
    new THREE.BoxGeometry(width, height, depth),
};

// ----- material factories ----------------------------------------------------

const MATERIAL_FACTORIES = {
  meshStandard: ([params = {}]) => new THREE.MeshStandardMaterial(params),
  meshBasic: ([params = {}]) => new THREE.MeshBasicMaterial(params),
};

// ----- public API -----------------------------------------------------------

/**
 * Build a three.js Object3D tree from a declarative node description.
 *
 * Errors are thrown synchronously — every supported `type` and every
 * factory is whitelisted, so a typo surfaces at construction time rather
 * than as silent visual drift.
 *
 * @param {Object} node — see file header for shape.
 * @param {Object} [refs] — optional `{ name: object }` map populated for
 *   any node carrying `name`. Lets callers grab specific meshes for
 *   imperative tweaks (animations, physics binding) without traversing.
 * @returns {THREE.Object3D}
 */
export function buildScene(node, refs = {}) {
  if (!node || typeof node !== 'object') {
    throw new TypeError(`buildScene: node must be an object, got ${typeof node}`);
  }
  const obj = createObject(node);
  applyTransform(obj, node);
  if (node.name) {
    obj.name = node.name;
    refs[node.name] = obj;
  }
  if (Array.isArray(node.children)) {
    for (const childNode of node.children) {
      obj.add(buildScene(childNode, refs));
    }
  }
  return obj;
}

/**
 * Convenience: build a scene and return both the root and the refs map
 * in one call.
 */
export function buildSceneWithRefs(node) {
  const refs = {};
  const root = buildScene(node, refs);
  return { root, refs };
}

// ----- internals ------------------------------------------------------------

function createObject(node) {
  switch (node.type) {
    case 'group':
      return new THREE.Group();
    case 'mesh': {
      const geometry = createGeometry(node.geometry);
      const material = createMaterial(node.material);
      const mesh = new THREE.Mesh(geometry, material);
      if (node.castShadow !== undefined) mesh.castShadow = node.castShadow;
      if (node.receiveShadow !== undefined) mesh.receiveShadow = node.receiveShadow;
      if (node.renderOrder !== undefined) mesh.renderOrder = node.renderOrder;
      return mesh;
    }
    case 'object3d':
      return new THREE.Object3D();
    default:
      throw new Error(`sceneDSL: unsupported node type "${node.type}"`);
  }
}

function createGeometry(spec) {
  if (!spec) {
    throw new Error('sceneDSL: mesh node missing `geometry` spec');
  }
  if (spec instanceof THREE.BufferGeometry || spec instanceof THREE.Geometry) {
    return spec;
  }
  const factory = GEOMETRY_FACTORIES[spec.type];
  if (!factory) {
    throw new Error(`sceneDSL: unsupported geometry type "${spec.type}"`);
  }
  const geometry = factory(spec.args || []);
  if (spec.rotateX !== undefined) {
    geometry.applyMatrix(new THREE.Matrix4().makeRotationX(spec.rotateX));
  }
  if (spec.rotateY !== undefined) {
    geometry.applyMatrix(new THREE.Matrix4().makeRotationY(spec.rotateY));
  }
  if (spec.rotateZ !== undefined) {
    geometry.applyMatrix(new THREE.Matrix4().makeRotationZ(spec.rotateZ));
  }
  return geometry;
}

function createMaterial(spec) {
  if (!spec) {
    throw new Error('sceneDSL: mesh node missing `material` spec');
  }
  if (spec instanceof THREE.Material) {
    return spec;
  }
  const factory = MATERIAL_FACTORIES[spec.type];
  if (!factory) {
    throw new Error(`sceneDSL: unsupported material type "${spec.type}"`);
  }
  return factory(spec.args || []);
}

function applyTransform(obj, node) {
  if (node.position) obj.position.set(...node.position);
  if (node.rotation) obj.rotation.set(...node.rotation);
  if (Array.isArray(node.scale)) {
    var sx = node.scale[0];
    var sy = node.scale[1] === undefined ? sx : node.scale[1];
    var sz = node.scale[2] === undefined ? sx : node.scale[2];
    obj.scale.set(sx, sy, sz);
  } else if (typeof node.scale === 'number') {
    obj.scale.set(node.scale, node.scale, node.scale);
  }
}
