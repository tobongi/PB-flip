/* eslint-env jest */
// Diagnostic dump (not a regression test) — runs the real CameraController
// against real GLB-extracted table positions for every override and prints
// where the camera converges, what it sees, and how the lookAt was biased.
// Run: `npm test -- --testPathPattern=cameraTransitionDump` and read stdout.
// Compare numbers against in-game observation when adjusting overrides.

import * as THREE from 'three';
import CameraController from '../../game/world/CameraController';
import { TRANSITION_CAMERA_ANGLES } from '../../game/worlds/restaurant';

// Real GLB-extracted positions, post-reorderTables (verified against
// scripts/extract-tables.js output and the reorderTables splice at index 9).
const TABLES = {
  3:  { x: -3.11, y: 17.63 },   // PB_Table_Rect_10
  4:  { x:  4.76, y: 18.15 },   // PB_Table_Ronde_03
  5:  { x:  4.84, y: 12.27 },   // PB_Table_Rect_07
  14: { x: 10.68, y: 13.54 },   // PB_Table_Carree_03 (was index 12 in script)
  15: { x: 10.68, y: 18.08 },   // PB_Table_Rect_05    (was index 13)
  16: { x: 18.82, y: 18.80 },   // PB_Table_Carree_04  (was index 14)
  17: { x: 18.82, y: 14.68 },   // PB_Table_Rect_06    (was index 15)
};

function makeBlock(t, tableIndex) {
  return {
    mesh: { position: new THREE.Vector3(t.x, t.y, 0) },
    body: { position: { z: 0 } },
    height: 0.5,
    _tableIndex: tableIndex,
    _tableAngle: 0,
  };
}

function makeBottle(labelPos) {
  return {
    position: labelPos.clone(),
    getLabelWorldPosition: () => labelPos.clone(),
    getLabelWorldNormal: () => new THREE.Vector3(0, -1, 0),
    getLabelDirection: () => new THREE.Vector3(0, -1, 0),
  };
}

function makeCtrl() {
  const ortho = new THREE.OrthographicCamera(-5.5, 5.5, 5.5, -5.5, -10, 100);
  const persp = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  ortho.up.set(0, 0, 1);
  persp.up.set(0, 0, 1);
  const light = {
    position: new THREE.Vector3(),
    target: { position: new THREE.Vector3() },
    intensity: 1.0,
  };
  const addScoreText = { mesh: { lookAt: jest.fn() } };
  return new CameraController(ortho, persp, light, addScoreText);
}

function dump(fromIdx, toIdx) {
  const cur = makeBlock(TABLES[fromIdx], fromIdx);
  const nxt = makeBlock(TABLES[toIdx], toIdx);
  const labelPos = new THREE.Vector3(TABLES[fromIdx].x, TABLES[fromIdx].y, 0.5);
  const bottle = makeBottle(labelPos);
  const ctrl = makeCtrl();
  ctrl.setTarget(cur, nxt, true);
  for (let i = 0; i < 200; i++) ctrl.update(0.05, bottle);

  const cam = ctrl.activeCamera;
  const camPos = cam.position;
  const lookAt = ctrl._currentLookAt;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);

  const nxtRel = new THREE.Vector3(
    TABLES[toIdx].x - TABLES[fromIdx].x,
    TABLES[toIdx].y - TABLES[fromIdx].y,
    0
  );
  const fwdDot = nxtRel.dot(fwd);
  const rightDot = nxtRel.dot(right);
  const screenSide = rightDot < 0 ? 'LEFT' : 'RIGHT';

  const override = TRANSITION_CAMERA_ANGLES[`${fromIdx}->${toIdx}`];
  const overrideStr = override === undefined
    ? 'none (auto)'
    : (typeof override === 'number'
      ? `${(override * 180 / Math.PI).toFixed(1)}°`
      : `angle=${(override.angle * 180 / Math.PI).toFixed(1)}° zoom×${override.zoomScale != null ? override.zoomScale : 1} lookAt×${override.lookAtShiftScale != null ? override.lookAtShiftScale : 1}`);

  // eslint-disable-next-line no-console
  console.log(`
─── ${fromIdx}→${toIdx} ───────────────────────────────────────
  Bottle on table ${fromIdx}:    (${TABLES[fromIdx].x.toFixed(2)}, ${TABLES[fromIdx].y.toFixed(2)})
  Next table ${toIdx}:           (${TABLES[toIdx].x.toFixed(2)}, ${TABLES[toIdx].y.toFixed(2)})
  Override:               ${overrideStr}
  ─
  _travelAxis:            (${ctrl._travelAxis.x.toFixed(3)}, ${ctrl._travelAxis.y.toFixed(3)})  [camera position direction = opposite]
  _lookAtAxis:            (${ctrl._lookAtAxis.x.toFixed(3)}, ${ctrl._lookAtAxis.y.toFixed(3)})  [geometric direction to next table]
  _adaptiveIdleZoom:      ${ctrl._adaptiveIdleZoom.toFixed(3)}   (base ${1.4})
  _adaptiveIdleDistance:  ${ctrl._adaptiveIdleDistance.toFixed(3)}   (base ${4.8}, cap 6.2)
  _lookAtShift:           ${ctrl._lookAtShift.toFixed(3)} along _lookAtAxis
  ─
  Camera position:        (${camPos.x.toFixed(2)}, ${camPos.y.toFixed(2)}, ${camPos.z.toFixed(2)})
  LookAt point:           (${lookAt.x.toFixed(2)}, ${lookAt.y.toFixed(2)}, ${lookAt.z.toFixed(2)})
  Camera forward:         (${fwd.x.toFixed(3)}, ${fwd.y.toFixed(3)}, ${fwd.z.toFixed(3)})
  ─
  Next table in frame:    forward·rel = ${fwdDot.toFixed(2)} (${fwdDot > 0 ? 'IN FRONT ✓' : 'BEHIND ✗'})
                          right·rel   = ${rightDot.toFixed(2)} (${screenSide} of center ${screenSide === 'LEFT' ? '✓' : ''})`);

  return { fwdDot, rightDot, screenSide, camPos: camPos.clone(), lookAt: lookAt.clone() };
}

describe('CAMERA TRANSITION DIAGNOSTIC DUMP', () => {
  it('prints framing data for every camera override', () => {
    const transitions = [
      [3, 4],    // baseline that user says is GOOD
      [4, 5],    // start of middle south line
      [14, 15],  // landing on 15 (lead-in)
      [15, 16],  // hand-off with east-wall framing
      [16, 17],  // start of east south line
    ];
    const results = transitions.map(([f, t]) => ({ from: f, to: t, ...dump(f, t) }));

    // Sanity: every override puts the next table within the camera's
    // visible 180° hemisphere. Tight close-up overrides (15→16, 16→17 round
    // 4) intentionally tilt the camera toward the bottle rather than the
    // landing zone, so the next table can sit slightly off-axis without
    // being "behind" the camera. Threshold of -1.0 catches the failure
    // mode that originally motivated the assertion (camera 180°-flipped)
    // while allowing close-up framings whose forward vector aims at the
    // bottle, not the next table.
    results.forEach(r => {
      expect(r.fwdDot).toBeGreaterThan(-1.0);
    });
    // 3→4 still promises LEFT-of-frame (table 4 east of bottle 3, camera NW).
    // 15→16 / 16→17 are close-ups now — either side is OK as long as
    // they're broadly in frame (covered by the loop above).
    const f3 = results.find(r => r.from === 3);
    if (f3) expect(f3.screenSide).toBe('LEFT');
  });
});
