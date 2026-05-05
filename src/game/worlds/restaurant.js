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

// Promotes specific tables to earlier positions in the run order.
// insertions: [{ names: [...], at: targetIndex }] in desired insertion order.
function reorderTables(tables) {
  const insertions = [
    { names: ['PB_Table_Grande_02', 'PB_Table_Rect_13'], at: 9 },
  ];

  let result = tables.slice();

  for (let i = 0; i < insertions.length; i++) {
    const insertion = insertions[i];
    const nameSet = insertion.names;
    const toMove = [];
    for (let n = 0; n < nameSet.length; n++) {
      const found = result.find(t => t.name === nameSet[n]);
      if (found) toMove.push(found);
    }
    result = result.filter(t => nameSet.indexOf(t.name) === -1);
    result.splice(insertion.at, 0, ...toMove);
  }

  result.forEach((t, i) => { t.index = i; });
  return result;
}

// Per-transition camera angle overrides (radians).
// Key: `${fromTableIndex}->${toTableIndex}`. Camera azimuth = angle + π.
// When set, this overrides both the auto-computed travel axis AND the
// per-table fallback angle for that single transition.
// Value can be a number (angle only) or
//   { angle, zoomScale, lookAtShiftScale }
// where:
//   - zoomScale < 1 dezooms (wider view) so the next table is clearly framed
//   - lookAtShiftScale > 1 pushes the lookAt further toward the actual next
//     table (along the GEOMETRIC direction, not the override). When wall
//     constraints cap the camera-pull-back, the lookAt bias pulls the
//     next table toward the center of the frame even though the camera
//     itself couldn't physically move further.
//   - angle = 0 in object form is a SIGNAL: keep camera at auto-direction
//     position (no rotation) but still apply zoomScale and lookAtShiftScale.
//     Useful for tables near walls where any rotation pushes the camera
//     into / past a wall.
//
// Wall constraints to remember when tuning:
//   - North perimeter wall sits around y ≈ 20-22. Tables 3, 4, 14, 15, 16
//     are all in the y ≈ 13-19 band, so any large camera-rotation that
//     pushes the camera further north hits the wall and the obstacle
//     sweep escalates pitch (top-down), losing the orbit-left feel.
//   - Tables 16-23 sit against x ≈ 18.8 (east wall around x ≈ 20-22),
//     so eastward camera positions hit the same problem on that side.
// Strategy: keep rotations small (≤ ~30°) so the camera stays inside
// the room, and let lookAtShiftScale do the heavy lifting for "show
// where the bottle will land."
// Final tuned values from scripts/sweep-camera-transitions.js (~250 combos
// scored against a composite geometric+pixel quality metric, see
// docs/camera-screenshots/_sweep-results.json and TUNING_LOG.md). The
// process: the harness mutates window.__sweepOverride for each combo,
// triggers a restart at the source table, screenshots in headless Chrome,
// then composites a quality score (centeredness + separation + forward
// + wall-dominance penalty). Best per transition wins.
export const TRANSITION_CAMERA_ANGLES = {
  '2->3':   Math.PI * 0.5,    // approach 3 from -Y; clears back wall and pre-stages 3->4
  '3->4': { angle: -20 * Math.PI / 180, zoomScale: 0.75, lookAtShiftScale: 2, forceProjection: 'persp' },
  // 4→5 alternates between two cinematic close-ups, both with the bottle
  // prominent in the foreground and the line of tables 5+ receding into
  // the upper area of the frame. Pinned to perspective + tier 2 pitch +
  // shift 1.5 to match docs/camera-screenshots/refs/4_to_5_v{1,2}.png. Why
  // each pin is load-bearing:
  //   - forceProjection 'persp': random ortho/persp swap on landing would
  //     otherwise produce ortho half the time, which (combined with the
  //     restaurant's north wall) crops bottle 4 out of frame against the
  //     reference composition. Perspective FOV at modest zoom keeps both
  //     bottle 4 (foreground) and table 5 (distance) in shot.
  //   - pitchTier 2: the obstacle sweep at tier 0 says the sightline is
  //     blocked (chair north of bottle 4 brushes the ray) and would
  //     escalate anyway; pinning skips the per-frame variance and locks
  //     in the cinematic top-quarter elevation the references show.
  //   - lookAtShiftScale 1.5: pulls the lookAt 1.75 world units toward
  //     table 5 so it reads as the destination of the shot while bottle
  //     4 still anchors the foreground.
  '4->5': {
    variants: [
      // Pure-south camera looking down the line (matches refs/4_to_5_v1.png).
      {
        angle: -90 * Math.PI / 180,
        zoomScale: 0.65,
        lookAtShiftScale: 2.0,
        pitchTier: 2,
        forceProjection: 'persp',
      },
      // Slight east tilt — bottle in lower-left, line on the right
      // (matches refs/4_to_5_v2.png).
      {
        angle: -60 * Math.PI / 180,
        zoomScale: 0.65,
        lookAtShiftScale: 2.0,
        pitchTier: 2,
        forceProjection: 'persp',
      },
    ],
  },
  '5->6': { forceProjection: 'persp' },
  '13->14': Math.PI * 0.5,    // smooth lerp into band B
  // 14→15 alternates between a tight close-up and a wide line preview
  // every restart (uses the controller's seeded RNG so it's deterministic
  // per session but varies across runs).
  '14->15': {
    variants: [
      // Close-up: bottle dominant in lower half, tray on table 15 visible
      // upper half. Camera south of bottle, modest dezoom + small lookAt
      // shift toward table 15.
      { angle: 0 * Math.PI / 180, zoomScale: 0.8, lookAtShiftScale: 1.5 },
      // Line preview: bottle smaller, full column of tables 15..18 visible
      // receding into the distance. Heavy dezoom + heavy lookAt shift.
      { angle: 0, zoomScale: 0.75, lookAtShiftScale: 2.5 },
    ],
  },
  // 15→16: hand-tuned pose captured via the debug-orbit harness on
  // 2026-05-05. The default placement+rotation knobs (angle/zoomScale/
  // lookAtShiftScale) repeatedly produced framings where one of the two
  // tables landed off-screen — table 15 is at (10.00, 18.35), table 16 at
  // (18.14, 19.08), both pressed against the north wall (y≈20-22) and 16
  // hard against the east wall (x≈18.8). Any rotation that put the camera
  // far enough away to fit both tables also drove it through a wall, and
  // the obstacle-sweep response was to escalate pitch (top-down framing).
  // Solution: bypass the derived knobs entirely with a `rawPose` that pins
  // world-space camera position + lookAt + FOV. The CameraController copies
  // these onto the active camera each frame while the transition is live.
  '15->16': {
    forceProjection: 'persp',
    rawPose: {
      camPos: [17.12, -0.58, 12.63],
      lookAt: [14.07, 18.71, 1.79],
      fov: 43,
    },
  },
  // 16→17: hand-tuned pose captured via the debug-orbit harness on
  // 2026-05-05. Same wall-trapped problem as 15→16 — table 17 is directly
  // south of table 16 (16 at (18.14, 19.08), 17 at (18.14, 14.96)) and
  // both sit hard against the east wall (x≈20-22), so derived knobs that
  // try to fit both tables in frame either drive the camera through the
  // east wall or escalate the obstacle sweep into a top-down framing.
  // The captured pose places the camera NE-of-16 at moderate elevation,
  // looking SE down the column so 16 is foreground and 17 recedes into
  // the lower part of the frame. Smooth blending in CameraController
  // glides between this pose and the neighboring transitions.
  '16->17': {
    forceProjection: 'persp',
    rawPose: {
      camPos: [15.29, 21.28, 9.81],
      lookAt: [18.14, 17.02, 1.79],
      fov: 39.2,
    },
  },
  // 17→18 + 18→19: east-column tables right next to the east perimeter wall.
  // The default sweep keeps the camera due-north which puts the wall on screen
  // RIGHT. Rotate the override slightly counterclockwise (positive angle bias
  // off due-south travel) so the camera sits NW-of-bottle instead of N-of-bottle
  // and the wall slides off the right edge of frame. Modest dezoom + persp keeps
  // the next table visible past the bottle.
  '17->18': {
    angle: -110 * Math.PI / 180,  // travel south, rotate camera counter-clockwise so it sits NW
    zoomScale: 0.75,
    lookAtShiftScale: 2.0,
    pitchTier: 1,
    forceProjection: 'persp',
  },
  '18->19': {
    angle: -90 * Math.PI / 180,   // pure south, just dezoom so the wall doesn't crop
    zoomScale: 0.7,
    lookAtShiftScale: 2.0,
    pitchTier: 1,
    forceProjection: 'persp',
  },
  // 24→28: south-row tables, traveling WEST. User asked for ortho with the
  // camera BEHIND the bottle so both bottle and the upcoming landing zone
  // fit in one shot. tier-2 high cinematic pitch + dezoom + lookAt shift
  // toward the next table; the lookAt-shift uses the geometric `_lookAtAxis`
  // so it always points at the actual landing zone even when `angle` rotates
  // the camera elsewhere for wall-clearance.
  //
  // 24→25 and 25→26 are special: bottles 24/25 sit against the SE corner of
  // the floor, so the natural east-of-bottle camera position would clip
  // through the east wall (visible as a brick wall filling the frame). Pin
  // the override to angle=-π/2 (camera due NORTH of the bottle) so the
  // camera position stays inside the floor area, looking SOUTH-WEST toward
  // bottle 25/26. The geometric `_lookAtAxis` still points at the next
  // table so the landing zone reads in frame.
  '24->25': { angle: -90 * Math.PI / 180, zoomScale: 0.65, lookAtShiftScale: 2.0, pitchTier: 2, forceProjection: 'ortho' },
  '25->26': { angle: -90 * Math.PI / 180, zoomScale: 0.65, lookAtShiftScale: 2.0, pitchTier: 2, forceProjection: 'ortho' },
  // 26→27 and 27→28 sit far enough from the east wall that the natural
  // east-of-bottle camera (angle=0 keeps `_travelAxis` aligned with the
  // geometric direction toward the next table) stays inside the floor and
  // produces the desired "behind the bottle" composition the user asked for.
  '26->27': { angle: 0, zoomScale: 0.7, lookAtShiftScale: 2.0, pitchTier: 2, forceProjection: 'persp' },
  // 27→28 was previously pinned at -π/2 to "hold the +Y line shot" through the
  // final beat. Replaced with the ortho-behind framing the user asked for so
  // the win-frame composition is consistent with the rest of the south row.
  '27->28': { angle: 0, zoomScale: 1.5, lookAtShiftScale: 2.0, pitchTier: 2, forceProjection: 'ortho' },
};

function assignCameraAngle(tables) {
  for (let index = 0; index < tables.length; index++) {
    const table = tables[index];
    if (table.index <= 10) {
      table.cameraAngle = 0;
    } else if (table.index <= 14) {
      table.cameraAngle = Math.PI / 2;
    } else if (table.index <= 22) {
      table.cameraAngle = 0;
    } else if (table.index <= 27) {
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
    // Partition + window-frame stack between bottle 25 and table 26 (visible
    // in 25_on_table_25_facing_26.png as a vertical wall splitting the shot).
    // Identified via scripts/probe-25-26-divider.js — four overlapping meshes
    // at world (8.23, -16.73, z 1.8..5.5) right at the midpoint of the 25↔26
    // line. Hiding the stack restores a clean line of sight to the landing zone.
    'Cube054',
    'Cube055',
    'Cube056',
    'Cube057',
    // Tall green column behind the brick veneer above (z 0..8, world ~(8.26,
    // -19.58, 4.07)). The brick stack is the front face — Cube119 is the
    // structural wall behind it that still occluded the 25→26 sightline after
    // the front-face fix. Both layers off = clean shot.
    'Cube119',
    // Internal partition between band B (south column 11-14) and band C
    // (east column 15-23). Thin slab (0.05x2.43x2.40) at world (7.03, 17.36,
    // 5.79) with a "BRAISÉ" poster baked in. Identified via
    // scripts/probe-15-occluder.js — blocked the 15→16 cinematic camera
    // when it sat at SW-of-bottle 15 to mirror the 3→4 v1 reference.
    'Cube148',
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
      gameController.restaurantTables = reorderTables(orderTables(extractTables(model)));
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
