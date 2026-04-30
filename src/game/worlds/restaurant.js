import * as THREE from 'three';

import GLTFLoader from '../../gltfLoader';
import { MODEL_SCALE } from "../config/constants";
import { debugConfig, isDebugEnabled } from "../config/debug";

function loadRestaurantModel() {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      '/models/Poulet_Braise.glb',
      gltf => {
        resolve(gltf.scene);
      },
      undefined,
      reject
    );
  });
}

// Min XY footprint a candidate must have to count as a table. Some GLBs
// have stray PB_ tagged hardware (legs, knobs) — without this they'd
// become "false tables" the bottle has to land on.
const MIN_TABLE_FOOTPRINT = 0.3;

function hasPBAncestor(node) {
  let parent = node.parent;
  while (parent) {
    if (parent.name && parent.name.startsWith('PB_')) return true;
    parent = parent.parent;
  }
  return false;
}

function extractTables(model) {
  const tables = [];
  model.traverse(node => {
    if (!node.name || !node.name.startsWith('PB_')) return;
    // Only collect top-level PB_ groups — skip PB_-prefixed sub-meshes
    // (table tops, legs) so one physical table doesn't become several.
    if (hasPBAncestor(node)) return;

    const box = new THREE.Box3().setFromObject(node);
    if (!isFinite(box.min.x) || !isFinite(box.max.x)) return;
    const size = box.getSize ? box.getSize() : box.max.clone().sub(box.min);
    if (size.x < MIN_TABLE_FOOTPRINT || size.y < MIN_TABLE_FOOTPRINT) return;

    const center = box.min.clone().add(box.max).multiplyScalar(0.5);
    tables.push({
      index: -1,  // will be assigned later
      name: node.name,
      position: new THREE.Vector3(center.x, center.y, box.max.z),
      width: size.x,
      depth: size.y,
      cameraAngle: 0, // will be assigned later
    });
  });

  return tables;
}

function orderTables(tables) {
  if (tables.length === 0) return tables;

  const origin = new THREE.Vector3(0, 0, 0);
  const remaining = tables.slice();
  const ordered = [];
  let minDist = Infinity;
  let minIdx = 0;

  for (let index = 0; index < remaining.length; index++) {
    const table = remaining[index];
    const distance = table.position.distanceToSquared(origin);
    if (distance < minDist) {
      minDist = distance;
      minIdx = index;
    }
  }

  let tableIndex = 0;
  let closestTable = remaining.splice(minIdx, 1)[0];
  closestTable.index = tableIndex++;
  ordered.push(closestTable);

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    minDist = Infinity;
    minIdx = 0;

    for (let index = 0; index < remaining.length; index++) {
      const table = remaining[index];
      const distance = table.position.distanceToSquared(last.position);
      if (distance < minDist) {
        minDist = distance;
        minIdx = index;
      }
    }

    closestTable = remaining.splice(minIdx, 1)[0];
    closestTable.index = tableIndex++;
    ordered.push(closestTable);
  }

  return ordered;
}

function assignCameraAngle(tables) {
  for (let index = 0; index < tables.length; index++) {
    const table = tables[index];
    if (table.index <= 8) {
      table.cameraAngle = 0;
    } else if (table.index <= 12) {
      table.cameraAngle = Math.PI / 2;
    } else if (table.index <= 13) {
      table.cameraAngle = Math.PI / 4;
    } else if (table.index <= 20) {
      table.cameraAngle = 0;
    } else if (table.index <= 25) {
      table.cameraAngle = -Math.PI / 2;
    } else if (table.index <= 30) {
      table.cameraAngle = -Math.PI;
    }
  }
}

function correctProblematicTablePositions(tables) {
  const corrections = {
  };

  tables.forEach(table => {
    const correction = corrections[table.index];
    if (correction) {
      table.position.x += correction.offsetX;
      table.position.y += correction.offsetY;
    }
  });
}

function clipWallSection(mesh, yMin, yMax) {
  const mat = mesh.material.clone();
  mat.clippingPlanes = [
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -yMin),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), yMax),
  ];
  mat.clipIntersection = true;
  mesh.material = mat;
}

function makeWallsOpaque(model) {
  model.traverse(node => {
    if (!node.isMesh) return;
    if (node.name.startsWith('PB_') || hasPBAncestor(node)) return;
    const mat = Array.isArray(node.material)
      ? node.material.map(m => { const c = m.clone(); c.transparent = false; c.opacity = 1.0; c.depthWrite = true; return c; })
      : (() => { const c = node.material.clone(); c.transparent = false; c.opacity = 1.0; c.depthWrite = true; return c; })();
    node.material = mat;
  });
}

function createWallOpenings(model) {
  const hideNames = new Set([
    'Cube004',
    'Cube028',
    'Cube044',
    'Cube151',
    'Cube146',
    'Cube153',
    'Cube012',
    'Cube029',
    'Cube016',
    'Cube024',
    'Cube025',
    'Cube026',
    'Cube032',
    'Cube033',
    'Cube034',
    'Cube035',
    'Cube058',
    'Cube027',
  ]);
  model.traverse(node => {
    if (!node.isMesh) return;
    if (hideNames.has(node.name)) {
      node.visible = false;
      return;
    }
    if (node.name === 'Cube021') {
      clipWallSection(node, -1.5, 2.2);
    }
  });
}

export function InitializeRestaurantModel(gameController) {
  loadRestaurantModel()
    .then(model => {
      gameController.restaurantModel = model;
      model.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
      model.rotation.x = Math.PI / 2;
      model.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      model.updateMatrixWorld(true);

      const modelBox = new THREE.Box3().setFromObject(model);
      const center = modelBox.min.clone().add(modelBox.max).multiplyScalar(0.5);
      model.position.x -= center.x;
      model.position.y -= center.y;
      model.position.z -= modelBox.min.z;
      model.updateMatrixWorld(true);

      createWallOpenings(model);
      makeWallsOpaque(model);
      gameController.restaurantTables = orderTables(extractTables(model));
      correctProblematicTablePositions(gameController.restaurantTables);
      assignCameraAngle(gameController.restaurantTables);

      if (isDebugEnabled() && debugConfig.logTablePositions) {
        gameController.restaurantTables.forEach((table, index) => {
          console.log(
            'Table',
            index,
            table.index,
            table.name,
            'x:',
            table.position.x.toFixed(2),
            'y:',
            table.position.y.toFixed(2),
            'angle:',
            table.cameraAngle
          );
        });
      }

      const box2 = new THREE.Box3().setFromObject(model);
      if (gameController.debugOrbitControls) {
        gameController.debugOrbitControls.target.copy(box2.getCenter(new THREE.Vector3()));
        gameController.debugOrbitControls.update();
      }

      gameController.floorBounds = {
        minX: box2.min.x + 0.5,
        maxX: box2.max.x - 0.5,
        minY: box2.min.y + 0.5,
        maxY: box2.max.y - 0.5,
      };

      gameController.scene.add(model);
      gameController.restart();
      gameController.render();
    })
    .catch(err => {
      console.warn('GLB load failed:', err);
    });
}