/* eslint-env jest */
import * as THREE from 'three';
import CameraController, {
  CAMERA_STATE,
  PROJECTION,
  FLIP_MODE,
  _internals,
} from '../../game/world/CameraController';
import { TRANSITION_CAMERA_ANGLES } from '../../game/worlds/restaurant';

// --- minimal fixtures -------------------------------------------------------

function makeFakeAddScoreText() {
  return { mesh: { lookAt: jest.fn() } };
}

function makeFakeLight() {
  return {
    position: new THREE.Vector3(),
    target: { position: new THREE.Vector3() },
    intensity: 1.0,
  };
}

function makeBottleFixture(labelPos, labelNormal) {
  return {
    position: labelPos.clone(),
    getLabelWorldPosition: () => labelPos.clone(),
    getLabelWorldNormal: () => labelNormal.clone(),
    getLabelDirection: () => new THREE.Vector3(labelNormal.x, labelNormal.y, 0).normalize(),
  };
}

function makeController({ random } = {}) {
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 100);
  const persp = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  ortho.up.set(0, 0, 1);
  persp.up.set(0, 0, 1);
  const light = makeFakeLight();
  const ctrl = new CameraController(ortho, persp, light, makeFakeAddScoreText(), { random });
  return { ctrl, ortho, persp, light };
}

// Block fixture mirroring what GameController.createTableBlock builds:
// _tableIndex drives TRANSITION_CAMERA_ANGLES lookup; mesh.position is
// the world-space center the camera reads via setTarget.
function makeTableBlock(x, y, tableIndex) {
  return {
    mesh: { position: new THREE.Vector3(x, y, 0) },
    body: { position: { z: 0 } },
    height: 0.5,
    _tableIndex: tableIndex,
    _tableAngle: 0,
  };
}

// --- tests ------------------------------------------------------------------

describe('CameraController — state machine', () => {
  it('starts in IDLE with ortho projection and idle params', () => {
    const { ctrl, ortho } = makeController();
    expect(ctrl.state).toBe(CAMERA_STATE.IDLE);
    expect(ctrl.projection).toBe(PROJECTION.ORTHO);
    expect(ctrl.activeCamera).toBe(ortho);
    expect(ctrl._tarFov).toBe(_internals.IDLE_FOV);
    expect(ctrl._tarZoom).toBe(_internals.IDLE_ZOOM);
  });

  it('CHARGE pulls back distance + zooms out', () => {
    const { ctrl } = makeController();
    ctrl.setStateCharge();
    expect(ctrl.state).toBe(CAMERA_STATE.CHARGE);
    expect(ctrl._tarDistance).toBe(_internals.CHARGE_DISTANCE);
    expect(ctrl._tarFov).toBe(_internals.CHARGE_FOV);
    expect(ctrl._tarZoom).toBe(_internals.CHARGE_ZOOM);
  });

  it('FLIP always picks FOLLOW (LOCKED/CINEMATIC retired for tracking reliability)', () => {
    const seq = [0.0, 0.4, 0.9];
    let i = 0;
    const random = () => seq[i++ % seq.length];
    const { ctrl } = makeController({ random });
    const bottle = makeBottleFixture(new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, -1, 0));
    const landing = new THREE.Vector3(2, 0, 0);

    ctrl.setStateFlip(bottle, landing);
    expect(ctrl.flipMode).toBe(FLIP_MODE.FOLLOW);

    ctrl.setStateFlip(bottle, landing);
    expect(ctrl.flipMode).toBe(FLIP_MODE.FOLLOW);

    ctrl.setStateFlip(bottle, landing);
    expect(ctrl.flipMode).toBe(FLIP_MODE.FOLLOW);
  });

  it('FLIP stays in FOLLOW under perspective (legacy LOCKED guard)', () => {
    const random = () => 0.9;
    const { ctrl } = makeController({ random });
    ctrl.setProjection(PROJECTION.PERSP);
    const bottle = makeBottleFixture(new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, -1, 0));
    const landing = new THREE.Vector3(2, 0, 0);
    ctrl.setStateFlip(bottle, landing);
    expect(ctrl.flipMode).toBe(FLIP_MODE.FOLLOW);
  });

  it('LANDING returns to idle params and may swap projection', () => {
    let calls = 0;
    const random = () => (calls++ === 0 ? 0.0 : 0.99); // first call: any flip mode, second call: ortho->persp swap
    const { ctrl } = makeController({ random });
    const bottle = makeBottleFixture(new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, -1, 0));

    ctrl.setStateFlip(bottle, new THREE.Vector3(2, 0, 0));
    ctrl.setStateLanding();
    expect(ctrl.state).toBe(CAMERA_STATE.LANDING);
    expect(ctrl._tarDistance).toBe(_internals.IDLE_DISTANCE);
    expect(ctrl.projection).toBe(PROJECTION.PERSP); // 0.99 >= 0.5
  });

  it('FAILED ramps _failedT toward 1 and applies the fade overlay opacity', () => {
    const overlayOrtho = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
    const overlayPersp = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 100);
    const persp = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    ortho.up.set(0, 0, 1);
    persp.up.set(0, 0, 1);
    const light = makeFakeLight();
    const scene = new THREE.Scene();
    const ctrl = new CameraController(ortho, persp, light, makeFakeAddScoreText(), {
      scene,
      hemi: { intensity: 0.55 },
      ambientLight: { intensity: 0.18 },
      fill: { intensity: 0.25 },
      fadeOverlayOrtho: overlayOrtho,
      fadeOverlayPersp: overlayPersp,
    });
    ctrl.captureBaseline();
    ctrl.setStateFailed();

    const bottle = makeBottleFixture(new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, -1, 0));
    // Drive several frames; opacity should approach FAILED_FADE_ALPHA.
    for (let i = 0; i < 40; i++) ctrl.update(0.05, bottle);
    expect(ctrl._failedT).toBeGreaterThan(0.9);
    expect(overlayOrtho.material.opacity).toBeGreaterThan(0.4);
    expect(light.intensity).toBeLessThan(1.0); // dimmed
  });

  it('IDLE oscillates distance via breathing (period = BREATHE_PERIOD_S)', () => {
    const { ctrl } = makeController();
    const bottle = makeBottleFixture(new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, -1, 0));
    const samples = [];
    // Sample a quarter period — distance must ramp UP (breathe sin > 0).
    for (let i = 0; i < 30; i++) {
      ctrl.update(_internals.BREATHE_PERIOD_S / 4 / 30, bottle);
      samples.push(ctrl._curDistance);
    }
    const last = samples[samples.length - 1];
    expect(last).toBeGreaterThan(_internals.IDLE_DISTANCE * (1 + _internals.BREATHE_AMPLITUDE * 0.5));
  });

  it('camera position sits opposite the block-travel axis with pitch lift', () => {
    const { ctrl } = makeController();
    const labelPos = new THREE.Vector3(0, 0, 0.5);
    const bottle = makeBottleFixture(labelPos, new THREE.Vector3(0, -1, 0));
    // Inject a travel axis pointing +Y so the camera should sit on -Y.
    const cur = { mesh: { position: new THREE.Vector3(0, 0, 0) }, body: { position: { z: 0 } }, height: 0.5 };
    const nxt = { mesh: { position: new THREE.Vector3(0, 4, 0) }, body: { position: { z: 0 } }, height: 0.5 };
    ctrl.setTarget(cur, nxt, true);
    for (let i = 0; i < 200; i++) ctrl.update(0.05, bottle);
    const camPos = ctrl.activeCamera.position;
    // Camera should be pulled back along -Y and lifted UP along +Z by
    // the pitch angle. With distance ~IDLE_DISTANCE and pitch 28°, the
    // vertical lift is ~ distance * sin(28°) ≈ 2.25, so cam.z is
    // labelZ + lift, well above 1.5.
    expect(camPos.y).toBeLessThan(-1);
    expect(camPos.z).toBeGreaterThan(1.5);
  });

  it('forces bottle.setLabelFaceDirection toward the negated travel axis', () => {
    const { ctrl } = makeController();
    const calls = [];
    const bottle = {
      ...makeBottleFixture(new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, -1, 0)),
      setLabelFaceDirection: (dir, force) => calls.push({ x: dir.x, y: dir.y, force }),
    };
    const cur = { mesh: { position: new THREE.Vector3(0, 0, 0) }, body: { position: { z: 0 } }, height: 0.5 };
    const nxt = { mesh: { position: new THREE.Vector3(3, 0, 0) }, body: { position: { z: 0 } }, height: 0.5 };
    ctrl.setTarget(cur, nxt, true);
    ctrl.update(0.05, bottle);
    expect(calls.length).toBeGreaterThan(0);
    // Travel axis is +X, so cameraAxis = -X. setLabelFaceDirection
    // should be called with a vector pointing toward -X.
    const last = calls[calls.length - 1];
    expect(last.x).toBeLessThan(-0.5);
    expect(Math.abs(last.y)).toBeLessThan(0.5);
  });

  it('snap() resets _failedT to 0 and locks current pose without lerp', () => {
    const { ctrl } = makeController();
    const bottle = makeBottleFixture(new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, -1, 0));
    ctrl._failedT = 0.5;
    ctrl.snap(bottle);
    expect(ctrl._failedT).toBe(0);
    expect(ctrl._curDistance).toBe(ctrl._tarDistance);
  });

  it('back-compat shims: startFlipTracking / stopFlipTracking still work', () => {
    const random = () => 0.0;
    const { ctrl } = makeController({ random });
    const bottle = makeBottleFixture(new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, -1, 0));
    ctrl.startFlipTracking(bottle, new THREE.Vector3(2, 0, 0));
    expect(ctrl.state).toBe(CAMERA_STATE.FLIP);
    ctrl.stopFlipTracking();
    expect(ctrl.state).toBe(CAMERA_STATE.IDLE);
  });

  // --- per-transition camera reveal (3→4 and 15→16 dezoom + left orbit) ---
  // Tables 3 and 15 are the ones immediately before a horizontal hand-off
  // where the next table is east of the current one and the player needs
  // to see the landing zone. Both transitions get a `zoomScale: 0.7`
  // dezoom plus a CCW (player-left) orbit so the next table appears in
  // the LEFT half of the frame instead of dead-center behind the bottle.
  describe('3→4 transition reveal', () => {
    const KEY = '3->4';

    it('TRANSITION_CAMERA_ANGLES 3→4 has variants with dezoom + negative angle', () => {
      const override = TRANSITION_CAMERA_ANGLES[KEY];
      expect(override).toBeDefined();
      expect(Array.isArray(override.variants)).toBe(true);
      expect(override.variants.length).toBeGreaterThan(1);
      // Every variant must dezoom and use a negative angle (NW orbit).
      override.variants.forEach(v => {
        expect(v.zoomScale).toBeLessThan(1);
        expect(v.angle).toBeLessThan(0);
      });
    });

    it('setTarget on 3→4 widens the framing (lower zoom OR longer pull-back) vs un-overridden case', () => {
      const { ctrl } = makeController();
      // Real restaurant geometry: table 3 ≈ (-3.11, 17.63), table 4 ≈ (4.76, 18.15).
      const cur = makeTableBlock(-3.11, 17.63, 3);
      const nxt = makeTableBlock(4.76, 18.15, 4);
      ctrl.setTarget(cur, nxt, true);
      const zoomA = ctrl._adaptiveIdleZoom;
      const distA = ctrl._adaptiveIdleDistance;

      // Same physical block layout but no transition entry (tables 5→6).
      const { ctrl: ctrl2 } = makeController();
      const cur2 = makeTableBlock(-3.11, 17.63, 5);
      const nxt2 = makeTableBlock(4.76, 18.15, 6);
      ctrl2.setTarget(cur2, nxt2, true);
      const zoomB = ctrl2._adaptiveIdleZoom;
      const distB = ctrl2._adaptiveIdleDistance;

      // Either zoom dropped or distance grew — both produce a wider view.
      const widerByZoom = zoomA < zoomB - 1e-6;
      const widerByDistance = distA > distB + 1e-6;
      expect(widerByZoom || widerByDistance).toBe(true);
    });

    it('setTarget on 3→4 places the camera in the NW quadrant (player-left orbit)', () => {
      const { ctrl } = makeController();
      const cur = makeTableBlock(-3.11, 17.63, 3);
      const nxt = makeTableBlock(4.76, 18.15, 4);
      ctrl.setTarget(cur, nxt, true);
      // Override travel axis ≈ (cos(-30°), sin(-30°)) = (0.866, -0.5).
      // Camera sits opposite => negative-X, positive-Y direction (NW).
      const ax = ctrl._travelAxis;
      expect(ax.x).toBeGreaterThan(0.5);
      expect(ax.y).toBeLessThan(-0.1);
    });

    it('setTarget on 3→4 puts table 4 in the LEFT half of the camera frame', () => {
      const { ctrl } = makeController();
      const labelPos = new THREE.Vector3(-3.11, 17.63, 0.5);
      const bottle = makeBottleFixture(labelPos, new THREE.Vector3(1, 0, 0));
      const cur = makeTableBlock(-3.11, 17.63, 3);
      const nxt = makeTableBlock(4.76, 18.15, 4);
      ctrl.setTarget(cur, nxt, true);
      for (let i = 0; i < 200; i++) ctrl.update(0.05, bottle);

      const cam = ctrl.activeCamera;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      const t4Rel = new THREE.Vector3(4.76 - (-3.11), 18.15 - 17.63, 0);
      // Table 4 must sit in front of the camera (positive forward).
      expect(t4Rel.dot(fwd)).toBeGreaterThan(0);
      // And on the LEFT half of the frame (negative right-projection).
      expect(t4Rel.dot(right)).toBeLessThan(0);
    });
  });

  describe('15→16 transition reveal', () => {
    const KEY = '15->16';

    it('TRANSITION_CAMERA_ANGLES has a 15→16 ortho close-up override', () => {
      // Retuned 2026-05-05 (round 4): the prior wide-sweep framing
      // (zoomScale 0.65, lookAtShiftScale 5.0) tried to fit both bottle 15
      // and bottle 16 into a single shot but ended up with the camera so
      // far back that the north wall filled the upper half. Now the
      // override pins a CLOSE ortho framing — bottle 15 anchors the
      // foreground; bottle 16 hints in the upper area, no wall in frame.
      const override = TRANSITION_CAMERA_ANGLES[KEY];
      expect(override).toBeDefined();
      expect(typeof override).toBe('object');
      expect(override.zoomScale).toBeGreaterThan(1);   // closer than IDLE
      expect(override.pitchTier).toBe(1);
      expect(override.forceProjection).toBe(PROJECTION.ORTHO);
    });

    it('setTarget on 15→16 sets _adaptiveIdleZoom above MIN_ORTHO_ZOOM (close framing)', () => {
      // Real restaurant geometry: table 15 ≈ (10.68, 18.08), table 16 ≈ (18.82, 18.80).
      const { ctrl } = makeController();
      const cur = makeTableBlock(10.68, 18.08, 15);
      const nxt = makeTableBlock(18.82, 18.80, 16);
      ctrl.setTarget(cur, nxt, true);
      // With zoomScale > 1 the close-up zoom should be greater than the
      // controller's runtime safety floor.
      expect(ctrl._adaptiveIdleZoom).toBeGreaterThan(_internals.MIN_ORTHO_ZOOM);
    });

    it('setTarget on 15→16 leaves _travelAxis on the geometric direction (angle 0 = behind bottle)', () => {
      const { ctrl } = makeController();
      const cur = makeTableBlock(10.68, 18.08, 15);
      const nxt = makeTableBlock(18.82, 18.80, 16);
      ctrl.setTarget(cur, nxt, true);
      // angle 0 means _travelAxis is NOT overwritten by an explicit rotation
      // and stays aligned with the geometric direction toward the next
      // table (mostly +x for 15→16 — table 16 is east of table 15 in world).
      expect(ctrl._travelAxis.x).toBeGreaterThan(0.9);
    });

    it('setTarget on 15→16 honors the modest lookAtShiftScale (no wide-reveal drag)', () => {
      // override has lookAtShiftScale 1.0 — the close-up doesn't want to
      // drag the lookAt 5 world units forward like the prior wide framing.
      // Asserting an upper bound prevents a future PR from re-introducing
      // the dragged lookAt that walked the camera into the north wall.
      const { ctrl } = makeController();
      ctrl.setTarget(
        makeTableBlock(10.68, 18.08, 15),
        makeTableBlock(18.82, 18.80, 16),
        true
      );
      // gapT=1 (gap > 6) gives gapT * 1.2 * 1.0 = 1.2; cap loosely under 2.0.
      expect(ctrl._lookAtShift).toBeLessThan(2.0);
    });

    it('setTarget on 15→16 keeps table 16 in front of the camera', () => {
      const { ctrl } = makeController();
      const labelPos = new THREE.Vector3(10.68, 18.08, 0.5);
      const bottle = makeBottleFixture(labelPos, new THREE.Vector3(1, 0, 0));
      const cur = makeTableBlock(10.68, 18.08, 15);
      const nxt = makeTableBlock(18.82, 18.80, 16);
      ctrl.setTarget(cur, nxt, true);
      for (let i = 0; i < 200; i++) ctrl.update(0.05, bottle);

      const cam = ctrl.activeCamera;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      const t16Rel = new THREE.Vector3(18.82 - 10.68, 18.80 - 18.08, 0);
      // Camera at SW looking NE — table 16 (east of bottle 15) is in front.
      expect(t16Rel.dot(fwd)).toBeGreaterThan(0);
    });
  });

  // 4→5 starts a long south-traveling line (tables 4-9 stack down the
  // middle column). The override mirrors 3→4's player-left orbit + dezoom
  // so the player can see what's coming and read the line at a glance.
  describe('4→5 transition reveal (south-traveling line)', () => {
    const KEY = '4->5';

    it('TRANSITION_CAMERA_ANGLES 4→5 has variants with dezoom + lookAt bias', () => {
      const override = TRANSITION_CAMERA_ANGLES[KEY];
      expect(override).toBeDefined();
      expect(Array.isArray(override.variants)).toBe(true);
      expect(override.variants.length).toBeGreaterThan(1);
      // Every variant should dezoom and use a strongly negative angle
      // (south-facing camera variants for the south-traveling line).
      override.variants.forEach(v => {
        expect(v.zoomScale).toBeLessThan(1);
        expect(v.lookAtShiftScale).toBeGreaterThanOrEqual(2);
        expect(v.angle).toBeLessThanOrEqual(-Math.PI / 3 + 1e-9); // ≤ -60°
      });
    });

    it('setTarget on 4→5 widens the framing vs un-overridden case', () => {
      const { ctrl } = makeController();
      const cur = makeTableBlock(4.76, 18.15, 4);
      const nxt = makeTableBlock(4.84, 12.27, 5);
      ctrl.setTarget(cur, nxt, true);
      const zoomA = ctrl._adaptiveIdleZoom;
      const distA = ctrl._adaptiveIdleDistance;

      const { ctrl: ctrl2 } = makeController();
      const cur2 = makeTableBlock(4.76, 18.15, 7);
      const nxt2 = makeTableBlock(4.84, 12.27, 8);
      ctrl2.setTarget(cur2, nxt2, true);
      const zoomB = ctrl2._adaptiveIdleZoom;
      const distB = ctrl2._adaptiveIdleDistance;

      const widerByZoom = zoomA < zoomB - 1e-6;
      const widerByDistance = distA > distB + 1e-6;
      expect(widerByZoom || widerByDistance).toBe(true);
    });

    it('setTarget on 4→5 always picks a south-ish travelAxis and locks the sweep', () => {
      // Run multiple times because the variants schema randomizes the pick.
      for (let i = 0; i < 5; i++) {
        const { ctrl } = makeController();
        const cur = makeTableBlock(4.76, 18.15, 4);
        const nxt = makeTableBlock(4.84, 12.27, 5);
        ctrl.setTarget(cur, nxt, true);
        // Both variants have angle ≤ -60°, so travelAxis.y is strongly negative.
        expect(ctrl._travelAxis.y).toBeLessThan(-0.5);
        expect(ctrl._lockedToOverrideAxis).toBe(true);
      }
    });

    it('setTarget on 4→5 amplifies _lookAtShift to preview the line ahead', () => {
      const { ctrl: ctrlA } = makeController();
      ctrlA.setTarget(
        makeTableBlock(4.76, 18.15, 4),
        makeTableBlock(4.84, 12.27, 5),
        true
      );
      const shiftA = ctrlA._lookAtShift;

      const { ctrl: ctrlB } = makeController();
      ctrlB.setTarget(
        makeTableBlock(4.76, 18.15, 7),
        makeTableBlock(4.84, 12.27, 8),
        true
      );
      const shiftB = ctrlB._lookAtShift;

      expect(shiftA).toBeGreaterThan(shiftB);
    });

    it('TRANSITION_CAMERA_ANGLES 4→5 variants pin pitchTier and forceProjection', () => {
      // The references in docs/camera-screenshots/refs/4_to_5_v{1,2}.png were
      // captured at perspective + tier-2 pitch. Without these pins the random
      // landing-time projection swap would produce ortho half the time, and the
      // obstacle sweep would auto-pick a different pitch tier — either of which
      // crops bottle 4 out of frame against the reference composition.
      const override = TRANSITION_CAMERA_ANGLES['4->5'];
      override.variants.forEach(v => {
        expect(v.pitchTier).toBe(2);
        expect(v.forceProjection).toBe(PROJECTION.PERSP);
      });
    });

    it('setTarget on 4→5 honors pitchTier override (no obstacle-sweep escalation)', () => {
      const { ctrl } = makeController();
      const cur = makeTableBlock(4.76, 18.15, 4);
      const nxt = makeTableBlock(4.84, 12.27, 5);
      ctrl.setTarget(cur, nxt, true);
      // _overridePitchTier is read by _refreshTargetCameraAxis when the
      // camera locks to the override axis, bypassing the sightline sweep.
      expect(ctrl._overridePitchTier).toBe(2);
      expect(ctrl._lockedToOverrideAxis).toBe(true);
    });

    it('setTarget on 4→5 forces perspective projection (sticky across landing swap)', () => {
      const { ctrl } = makeController();
      const cur = makeTableBlock(4.76, 18.15, 4);
      const nxt = makeTableBlock(4.84, 12.27, 5);
      ctrl.setTarget(cur, nxt, true);
      expect(ctrl._overrideProjection).toBe(PROJECTION.PERSP);
      expect(ctrl.projection).toBe(PROJECTION.PERSP);
      // _maybeSwapProjection should NOT randomize back when the override pin
      // is active — verifies the snap()→setStateLanding→_maybeSwapProjection
      // chain doesn't undo the user-tuned framing on game restart.
      ctrl._maybeSwapProjection();
      expect(ctrl.projection).toBe(PROJECTION.PERSP);
      ctrl._maybeSwapProjection();
      expect(ctrl.projection).toBe(PROJECTION.PERSP);
    });

    it('setTarget on 4→5 lowers _zoomMinFloor so per-frame clamp respects zoomScale', () => {
      const { ctrl } = makeController();
      const cur = makeTableBlock(4.76, 18.15, 4);
      const nxt = makeTableBlock(4.84, 12.27, 5);
      ctrl.setTarget(cur, nxt, true);
      // The override has zoomScale 0.65, which produces _adaptiveIdleZoom
      // below MIN_ORTHO_ZOOM (1.05). Without the floor relaxation, update()
      // would silently clamp _curZoom back up and the wider cinematic view
      // never reaches the camera.
      expect(ctrl._zoomMinFloor).toBeLessThan(_internals.MIN_ORTHO_ZOOM);
      expect(ctrl._adaptiveIdleZoom).toBeLessThan(_internals.MIN_ORTHO_ZOOM);
    });
  });

  // 14→15: smooth lead-in so the camera doesn't swoop ~90° around the bottle
  // when the next setTarget(15, 16) flips the framing to NW. Mirrors the
  // family treatment with player-left orbit + dezoom.
  describe('14→15 transition reveal (lead-in to 15→16)', () => {
    const KEY = '14->15';

    it('TRANSITION_CAMERA_ANGLES 14→15 has variants with dezoom (no rotation, walls)', () => {
      const override = TRANSITION_CAMERA_ANGLES[KEY];
      expect(override).toBeDefined();
      expect(Array.isArray(override.variants)).toBe(true);
      expect(override.variants.length).toBeGreaterThan(1);
      // Every variant must use angle 0 (no rotation — wall-adjacent table)
      // and apply at least some dezoom + lookAt bias.
      override.variants.forEach(v => {
        expect(v.angle).toBe(0);
        expect(v.zoomScale).toBeLessThan(1);
        expect(v.lookAtShiftScale).toBeGreaterThanOrEqual(1);
      });
    });

    it('setTarget on 14→15 leaves _travelAxis as the auto north direction', () => {
      const { ctrl } = makeController();
      const cur = makeTableBlock(10.68, 13.54, 14);
      const nxt = makeTableBlock(10.68, 18.08, 15);
      ctrl.setTarget(cur, nxt, true);
      expect(ctrl._travelAxis.x).toBeCloseTo(0, 1);
      expect(ctrl._travelAxis.y).toBeGreaterThan(0.9);
    });
  });

  // 16→17 begins the long south line down the east column (16-23).
  // Same treatment as 4→5.
  describe('16→17 transition reveal (east-column south line)', () => {
    const KEY = '16->17';

    it('TRANSITION_CAMERA_ANGLES has a 16→17 ortho close-up override', () => {
      // Retuned 2026-05-05 (round 4): the prior wide framing
      // (zoomScale 0.6, lookAtShiftScale 2.5) dragged the lookAt 3 units
      // forward and pulled the camera back so far that walls filled the
      // edges. Now zoomScale > 1 + modest shift = bottle 16 anchors the
      // foreground; the chair/edge of table 17 hints at where it's going.
      const override = TRANSITION_CAMERA_ANGLES[KEY];
      expect(override).toBeDefined();
      expect(typeof override).toBe('object');
      expect(override.zoomScale).toBeGreaterThan(1);
      // User-approved framing at +15°: bottle LEFT, table 17 RIGHT.
      expect(override.angle).toBeCloseTo(15 * Math.PI / 180, 3);
    });

    it('setTarget on 16→17 places _travelAxis NE-ish and locks the sweep', () => {
      const { ctrl } = makeController();
      const cur = makeTableBlock(18.82, 18.80, 16);
      const nxt = makeTableBlock(18.82, 14.68, 17);
      ctrl.setTarget(cur, nxt, true);
      // angle = +15° → travelAxis = (cos 15°, sin 15°) ≈ (0.966, 0.259).
      expect(ctrl._travelAxis.x).toBeGreaterThan(0.9);
      expect(ctrl._travelAxis.y).toBeGreaterThan(0.1);
      expect(ctrl._lockedToOverrideAxis).toBe(true);
    });

    it('TRANSITION_CAMERA_ANGLES 16→17 pins ortho + tier 1 to lock framing to ref', () => {
      // The references inconsistently rendered before pins — random projection
      // swap and obstacle-sweep tier escalation produced different framings
      // across runs. Pinning ortho + tier 1 makes refs/16_to_17.png reproducible.
      const override = TRANSITION_CAMERA_ANGLES[KEY];
      expect(override.pitchTier).toBe(1);
      expect(override.forceProjection).toBe(PROJECTION.ORTHO);
    });
  });

  // 17→18 + 18→19: the east-column tables sit one or two world units west
  // of the east perimeter wall. The default sweep places the camera due-north
  // of the bottle, which puts the wall on screen RIGHT and crops the next
  // table's landing zone. Both transitions add overrides to keep the wall
  // off-screen and the next table fully visible.
  describe('17→18 transition (clear east wall via NW-ish camera)', () => {
    const KEY = '17->18';

    it('TRANSITION_CAMERA_ANGLES 17→18 rotates camera off due-north', () => {
      const override = TRANSITION_CAMERA_ANGLES[KEY];
      expect(override).toBeDefined();
      // angle is rotated from due-south so the camera ends up NW of the bottle
      // instead of due-north (which would put the east wall in frame).
      expect(override.angle).toBeLessThan(-Math.PI / 2 - 0.05); // < -π/2 (i.e., farther counterclockwise from south)
      expect(override.zoomScale).toBeLessThan(1);
      expect(override.pitchTier).toBeGreaterThanOrEqual(0);
      expect(override.forceProjection).toBe(PROJECTION.PERSP);
    });

    it('setTarget on 17→18 keeps the override-locked axis instead of running the sweep', () => {
      const { ctrl } = makeController();
      const cur = makeTableBlock(18.82, 14.68, 17);
      const nxt = makeTableBlock(18.82, 10.56, 18);
      ctrl.setTarget(cur, nxt, true);
      expect(ctrl._lockedToOverrideAxis).toBe(true);
      expect(ctrl._overrideProjection).toBe(PROJECTION.PERSP);
    });
  });

  describe('18→19 transition (dezoom so east wall does not crop)', () => {
    const KEY = '18->19';

    it('TRANSITION_CAMERA_ANGLES 18→19 dezooms with persp projection', () => {
      const override = TRANSITION_CAMERA_ANGLES[KEY];
      expect(override).toBeDefined();
      expect(override.zoomScale).toBeLessThan(1);
      expect(override.zoomScale).toBeGreaterThanOrEqual(0.65); // not too aggressive
      expect(override.forceProjection).toBe(PROJECTION.PERSP);
    });
  });

  // 24→28: south-row "victory line" — user requested ortho mode with the
  // camera behind the bottle so both bottle and the upcoming landing zone
  // fit in one shot.
  describe('24→28 south-row ortho-behind composition', () => {
    const KEYS = ['24->25', '25->26', '26->27', '27->28'];

    KEYS.forEach(key => {
      it(`TRANSITION_CAMERA_ANGLES ${key} is ortho + tier 2 + dezoom`, () => {
        const override = TRANSITION_CAMERA_ANGLES[key];
        expect(override).toBeDefined();
        expect(typeof override).toBe('object');
        expect(override.forceProjection).toBe(PROJECTION.ORTHO);
        expect(override.pitchTier).toBe(2);
        expect(override.zoomScale).toBeLessThan(1);
        expect(override.lookAtShiftScale).toBeGreaterThanOrEqual(2);
      });
    });

    it('setTarget on 24→25 pins ortho even after _maybeSwapProjection', () => {
      // The seeded RNG would otherwise randomize ortho/persp on each landing;
      // verifying _overrideProjection survives the swap is what guarantees
      // every player sees the same ortho-behind shot regardless of RNG state.
      const { ctrl } = makeController();
      const cur = makeTableBlock(11.42, -13.30, 24);
      const nxt = makeTableBlock(7.50, -13.40, 25);
      ctrl.setTarget(cur, nxt, true);
      expect(ctrl.projection).toBe(PROJECTION.ORTHO);
      ctrl._maybeSwapProjection();
      expect(ctrl.projection).toBe(PROJECTION.ORTHO);
    });

    it('27→28 no longer pinned at -π/2 (replaces "+Y line shot" with ortho-behind)', () => {
      // Earlier the override was a bare numeric -π/2 to keep the +Y line shot
      // continuous. Now it's an object with angle 0 + ortho + tier-2, matching
      // the rest of the south row.
      const override = TRANSITION_CAMERA_ANGLES['27->28'];
      expect(typeof override).toBe('object');
      expect(override.angle).toBe(0);
    });
  });

  // Regression: lookAt bias must follow the GEOMETRIC direction to the next
  // table, not the override-rotated _travelAxis. Without this split, when an
  // override rotates the camera 60° away, lookAtShiftScale would push the
  // lookAt point at a 60° angle off the next table — defeating the purpose
  // of the bias and leaving the next table out of frame.
  describe('lookAt-axis split (override doesn\'t corrupt the bias)', () => {
    it('_lookAtAxis stays pointed at the geometric next table when override rotates _travelAxis', () => {
      const { ctrl } = makeController();
      // 16→17: override rotates _travelAxis by +15° off the geometric north
      // (table 17 is south of table 16). Picked because the rotation is
      // large enough to detach _travelAxis from _lookAtAxis but the
      // override's angle field is still non-zero (15→16 was retuned to
      // angle 0 in round 4 so it no longer exercises this path).
      const cur = makeTableBlock(18.82, 18.80, 16);
      const nxt = makeTableBlock(18.82, 14.68, 17);
      ctrl.setTarget(cur, nxt, true);

      // Geometric direction from 16 to 17 is due-south (-Y).
      expect(ctrl._lookAtAxis.y).toBeLessThan(-0.9);

      // Meanwhile _travelAxis has been rotated by the +15° override —
      // it must NOT match _lookAtAxis.
      expect(ctrl._travelAxis.dot(ctrl._lookAtAxis)).toBeLessThan(0.95);
    });

    it('lookAt bias shifts toward the actual next table, not the override direction', () => {
      const { ctrl } = makeController();
      const labelPos = new THREE.Vector3(10.68, 18.08, 0.5);
      const bottle = makeBottleFixture(labelPos, new THREE.Vector3(1, 0, 0));
      const cur = makeTableBlock(10.68, 18.08, 15);
      const nxt = makeTableBlock(18.82, 18.80, 16);
      ctrl.setTarget(cur, nxt, true);
      // First update applies the lookAt bias.
      ctrl.update(0.05, bottle);

      // After the bias, _lookAtTarget should be shifted from the bottle
      // position TOWARD table 16 (mostly +X), not along the override axis.
      const shiftFromBottle = new THREE.Vector3().subVectors(ctrl._lookAtTarget, labelPos);
      expect(shiftFromBottle.x).toBeGreaterThan(0.3);
      // Override _travelAxis is ESE-ish (positive x but strongly negative
      // y). If the bias used _travelAxis, shiftFromBottle.y would be
      // strongly negative. With _lookAtAxis, y stays near zero.
      expect(Math.abs(shiftFromBottle.y)).toBeLessThan(Math.abs(shiftFromBottle.x));
    });
  });

  it('setProjection swaps activeCamera after the blend lerp crosses 0.5', () => {
    const { ctrl, ortho, persp } = makeController();
    const bottle = makeBottleFixture(new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, -1, 0));
    ctrl._idealPosition.set(2, 3, 4);
    ctrl._currentLookAt.set(0, 0, 0.5);
    // setProjection itself does NOT instantly flip activeCamera now —
    // it sets the blend target and pre-poses both cameras. The activeCamera
    // swap is driven by update() once the smoothed blend crosses 0.5.
    ctrl.setProjection(PROJECTION.PERSP);
    expect(ctrl._targetProjectionBlend).toBe(1);
    // Both cameras have the new pose so neither pops when activeCamera
    // crosses over.
    expect(persp.position.x).toBe(2);
    expect(persp.position.y).toBe(3);
    expect(persp.position.z).toBe(4);
    expect(ortho.position.x).toBe(2);
    // Drive update() until the lerp crosses 0.5; activeCamera should
    // flip from ortho to persp.
    for (let i = 0; i < 80; i++) ctrl.update(0.05, bottle);
    expect(ctrl.activeCamera).toBe(persp);
    // Swap back; same story in the other direction.
    ctrl.setProjection(PROJECTION.ORTHO);
    for (let i = 0; i < 80; i++) ctrl.update(0.05, bottle);
    expect(ctrl.activeCamera).toBe(ortho);
  });

  it('setProjection ortho→persp pre-sets persp FOV to size-match the outgoing ortho image', () => {
    const ortho = new THREE.OrthographicCamera(-5.5, 5.5, 5.5, -5.5, -10, 100);
    const persp = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    ortho.up.set(0, 0, 1); persp.up.set(0, 0, 1);
    const ctrl = new CameraController(ortho, persp, makeFakeLight(), makeFakeAddScoreText());
    ctrl._idealPosition.set(0, -4.8, 3);
    ctrl._currentLookAt.set(0, 0, 0.5);
    ortho.zoom = 1.4;
    ortho.updateProjectionMatrix();
    ctrl.setProjection(PROJECTION.PERSP);
    // The matched FOV exceeds MAX_PERSP_FOV, so it clamps. _curFov drives
    // persp.fov, and the perspectiveCamera's own projectionMatrix was
    // refreshed inside setProjection.
    expect(ctrl._curFov).toBe(_internals.MAX_PERSP_FOV);
    expect(persp.fov).toBe(_internals.MAX_PERSP_FOV);
  });

  it('setProjection persp→ortho pre-sets ortho zoom to size-match the outgoing persp image', () => {
    const ortho = new THREE.OrthographicCamera(-5.5, 5.5, 5.5, -5.5, -10, 100);
    const persp = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    ortho.up.set(0, 0, 1); persp.up.set(0, 0, 1);
    const ctrl = new CameraController(ortho, persp, makeFakeLight(), makeFakeAddScoreText());
    // Force initial state to persp first (constructor defaults to ortho).
    ctrl.projection = PROJECTION.PERSP;
    ctrl.activeCamera = persp;
    ctrl._targetProjectionBlend = 1;
    ctrl._smoothedProjectionBlend = 1;
    ctrl._idealPosition.set(0, -4.8, 3);
    ctrl._currentLookAt.set(0, 0, 0.5);
    persp.position.copy(ctrl._idealPosition);
    persp.lookAt(ctrl._currentLookAt);
    persp.fov = 35;
    persp.updateProjectionMatrix();
    ctrl.setProjection(PROJECTION.ORTHO);
    // At ~5.55 distance and FOV 35°, persp visible extent ≈ 3.50.
    // matchZoom = 11 / 3.50 ≈ 3.14 — well above MIN_ORTHO_ZOOM.
    expect(ctrl._curZoom).toBeGreaterThan(2);
    expect(ortho.zoom).toBeCloseTo(ctrl._curZoom, 5);
  });

  it('setProjection no-ops when the requested projection is already active', () => {
    const { ctrl, ortho } = makeController();
    const before = ortho.zoom;
    ctrl.setProjection(PROJECTION.ORTHO); // already ortho
    expect(ortho.zoom).toBe(before);      // untouched
  });

  it('exposes ALL_FLIP_MODES = [FOLLOW] (other modes retired for reliability)', () => {
    expect(_internals.ALL_FLIP_MODES).toEqual([FLIP_MODE.FOLLOW]);
  });

  it('clamps _curDistance to MAX_CAMERA_DISTANCE even when tar overshoots', () => {
    const { ctrl } = makeController();
    const bottle = makeBottleFixture(new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, -1, 0));
    // Force a target distance way beyond the cap.
    ctrl._tarDistance = 50;
    for (let i = 0; i < 200; i++) ctrl.update(0.05, bottle);
    expect(ctrl._curDistance).toBeLessThanOrEqual(_internals.MAX_CAMERA_DISTANCE + 1e-6);
  });

  it('clamps _curZoom to MIN_ORTHO_ZOOM (label-readable floor)', () => {
    const { ctrl } = makeController();
    const bottle = makeBottleFixture(new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, -1, 0));
    ctrl._tarZoom = 0.1; // would shrink label to a speck
    for (let i = 0; i < 200; i++) ctrl.update(0.05, bottle);
    expect(ctrl._curZoom).toBeGreaterThanOrEqual(_internals.MIN_ORTHO_ZOOM - 1e-6);
  });

  it('clamps _curFov to MAX_PERSP_FOV (label-readable ceiling)', () => {
    const { ctrl } = makeController();
    const bottle = makeBottleFixture(new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, -1, 0));
    ctrl._tarFov = 90;
    for (let i = 0; i < 200; i++) ctrl.update(0.05, bottle);
    expect(ctrl._curFov).toBeLessThanOrEqual(_internals.MAX_PERSP_FOV + 1e-6);
  });

  it('PITCH_ANGLE is steeper than 30° so the next platform is visible past the bottle', () => {
    expect(_internals.PITCH_ANGLE).toBeGreaterThan((30 * Math.PI) / 180);
  });

  it('PITCH_TIERS has 4 tiers so the sweep can escalate to overhead-clearance for wall-adjacent tables', () => {
    expect(_internals.PITCH_TIERS.length).toBe(4);
    expect(_internals.MAX_VERTICAL_LIFT_PER_TIER.length).toBe(4);
    // Tier 3 must be steeper than tier 2 with a higher lift cap.
    expect(_internals.PITCH_TIERS[3]).toBeGreaterThan(_internals.PITCH_TIERS[2]);
    expect(_internals.MAX_VERTICAL_LIFT_PER_TIER[3]).toBeGreaterThan(_internals.MAX_VERTICAL_LIFT_PER_TIER[2]);
  });

  it('tier 3 is near-overhead (≥75°) so the camera can fly over perimeter walls', () => {
    expect(_internals.PITCH_TIERS[3]).toBeGreaterThanOrEqual((75 * Math.PI) / 180);
  });

  it('obstacle sweep: picks preferred -travelAxis when nothing blocks', () => {
    // Build a real scene + ortho/persp + light so the controller can
    // run a raycast against an empty world.
    const scene = new THREE.Scene();
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 100);
    const persp = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    ortho.up.set(0, 0, 1); persp.up.set(0, 0, 1);
    scene.add(ortho); scene.add(persp);
    const ctrl = new CameraController(ortho, persp, makeFakeLight(), makeFakeAddScoreText(), {
      scene, hemi: { intensity: 0.5 }, ambientLight: { intensity: 0.1 }, fill: { intensity: 0.1 },
    });
    const bottle = makeBottleFixture(new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, -1, 0));
    const cur = { mesh: { position: new THREE.Vector3(0, 0, 0) }, body: { position: { z: 0 } }, height: 0.5 };
    const nxt = { mesh: { position: new THREE.Vector3(0, 4, 0) }, body: { position: { z: 0 } }, height: 0.5 };
    ctrl.setTarget(cur, nxt, true);
    // First update runs the deferred sweep against an empty world.
    ctrl.update(0.05, bottle);
    // Preferred axis = -travelAxis = (0, -1, 0). With no obstacles
    // the sweep should pick that exact direction.
    expect(ctrl._targetCameraAxis.x).toBeCloseTo(0);
    expect(ctrl._targetCameraAxis.y).toBeCloseTo(-1);
  });

  it('obstacle sweep: deviates around a wall blocking the preferred axis', () => {
    const scene = new THREE.Scene();
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 100);
    const persp = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    ortho.up.set(0, 0, 1); persp.up.set(0, 0, 1);
    scene.add(ortho); scene.add(persp);
    // Plant a wall in the preferred (-Y) direction at distance 2.
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(20, 0.2, 20),
      new THREE.MeshBasicMaterial()
    );
    wall.position.set(0, -2, 0.5);
    wall.updateMatrixWorld(true);
    scene.add(wall);
    scene.updateMatrixWorld(true);
    const ctrl = new CameraController(ortho, persp, makeFakeLight(), makeFakeAddScoreText(), {
      scene, hemi: { intensity: 0.5 }, ambientLight: { intensity: 0.1 }, fill: { intensity: 0.1 },
    });
    const bottle = makeBottleFixture(new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, -1, 0));
    const cur = { mesh: { position: new THREE.Vector3(0, 0, 0) }, body: { position: { z: 0 } }, height: 0.5 };
    const nxt = { mesh: { position: new THREE.Vector3(0, 4, 0) }, body: { position: { z: 0 } }, height: 0.5 };
    ctrl.setTarget(cur, nxt, true);
    ctrl.update(0.05, bottle);
    // The -Y direction is blocked. The sweep should pick a
    // direction that's NOT (0, -1, 0).
    const axis = ctrl._targetCameraAxis;
    const blockedDot = axis.dot(new THREE.Vector3(0, -1, 0));
    // It deviated — dot product with -Y is not 1.
    expect(blockedDot).toBeLessThan(0.99);
    // It still has some component (it's a unit vector).
    expect(axis.lengthSq()).toBeCloseTo(1, 1);
  });

  it('obstacle sweep: fully blocked fallback chooses the least obstructed direction', () => {
    const scene = new THREE.Scene();
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 100);
    const persp = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    ortho.up.set(0, 0, 1); persp.up.set(0, 0, 1);
    scene.add(ortho); scene.add(persp);
    const ctrl = new CameraController(ortho, persp, makeFakeLight(), makeFakeAddScoreText(), {
      scene, hemi: { intensity: 0.5 }, ambientLight: { intensity: 0.1 }, fill: { intensity: 0.1 },
    });
    const bottle = makeBottleFixture(new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, -1, 0));
    ctrl._travelAxis.set(0, 1, 0);
    ctrl._scoreSightline = (labelPos, dir) => ({
      clear: false,
      clearance: dir.x > 0.95 ? 6 : 1,
    });

    ctrl._refreshTargetCameraAxis(bottle);

    expect(ctrl._targetCameraAxis.x).toBeGreaterThan(0.95);
    expect(Math.abs(ctrl._targetCameraAxis.y)).toBeLessThan(0.3);
  });

  it('wall-hug fallback: camera escalates pitch when the only clear shots hug a wall', () => {
    // Build a scene where every horizontal direction at tier-0 distance
    // is "clear of geometry on the sightline" but the sample camera
    // position itself sits inside a tall wall enclosure — exactly the
    // corner-table case in the restaurant. Tier 0 should be rejected
    // (wall-hug); the sweep should escalate to a higher tier (taller
    // pitch, shorter horizontal reach), where the camera ends up
    // farther from the perimeter walls.
    const scene = new THREE.Scene();
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 100);
    const persp = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    ortho.up.set(0, 0, 1); persp.up.set(0, 0, 1);
    scene.add(ortho); scene.add(persp);
    // 4 tall perimeter walls forming a tight 5x5 enclosure at z 0..6.
    // The bottle sits in the middle at (0, 0, 0.5). At tier-0 distance,
    // every sample camera position lands within ~1 unit of one of the
    // walls — wall-hug applies. Higher tiers pull the camera in.
    const wallMat = new THREE.MeshBasicMaterial();
    const mkWall = (x, y, w, d) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, 6), wallMat);
      m.position.set(x, y, 3);
      m.updateMatrixWorld(true);
      scene.add(m);
    };
    mkWall(0, 3, 8, 0.2);
    mkWall(0, -3, 8, 0.2);
    mkWall(3, 0, 0.2, 8);
    mkWall(-3, 0, 0.2, 8);
    scene.updateMatrixWorld(true);

    const ctrl = new CameraController(ortho, persp, makeFakeLight(), makeFakeAddScoreText(), {
      scene, hemi: { intensity: 0.5 }, ambientLight: { intensity: 0.1 }, fill: { intensity: 0.1 },
    });
    const bottle = makeBottleFixture(new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, -1, 0));
    const cur = { mesh: { position: new THREE.Vector3(0, 0, 0) }, body: { position: { z: 0 } }, height: 0.5 };
    const nxt = { mesh: { position: new THREE.Vector3(0, 1, 0) }, body: { position: { z: 0 } }, height: 0.5 };
    ctrl.setTarget(cur, nxt, true);
    ctrl.update(0.05, bottle);

    // Either: a higher pitch tier was picked (overhead shot), OR the
    // distance was scaled below 1 to keep the camera off the walls.
    // Both indicate the wall-hug logic activated correctly.
    const escalated = ctrl._targetPitchIdx > 0 || ctrl._targetDistanceScale < 1 - 1e-3;
    expect(escalated).toBe(true);
  });

  it('caps the vertical lift so the camera does not punch through the ceiling', () => {
    const { ctrl } = makeController();
    const labelPos = new THREE.Vector3(0, 0, 0.5);
    const bottle = makeBottleFixture(labelPos, new THREE.Vector3(0, -1, 0));
    ctrl._tarDistance = 50;
    const cur = { mesh: { position: new THREE.Vector3(0, 0, 0) }, body: { position: { z: 0 } }, height: 0.5 };
    const nxt = { mesh: { position: new THREE.Vector3(0, 4, 0) }, body: { position: { z: 0 } }, height: 0.5 };
    ctrl.setTarget(cur, nxt, true);
    for (let i = 0; i < 200; i++) ctrl.update(0.05, bottle);
    // Camera Z should be at most labelZ + MAX_VERTICAL_LIFT + Z_LIFT
    // (Z_LIFT is tiny, so cap is essentially MAX_VERTICAL_LIFT).
    const labelZ = labelPos.z;
    expect(ctrl.activeCamera.position.z - labelZ).toBeLessThanOrEqual(
      _internals.MAX_VERTICAL_LIFT + _internals.Z_LIFT + 1e-6
    );
  });

  it('setProjection sets a blend TARGET (not an instant swap) and the smoothed blend lerps each frame', () => {
    const { ctrl } = makeController();
    const bottle = makeBottleFixture(new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, -1, 0));
    // Start at ortho idle (blend = 0). Switch to persp — target should be 1,
    // smoothed should NOT instantly become 1; it lerps over many frames.
    ctrl.setProjection(PROJECTION.PERSP);
    expect(ctrl._targetProjectionBlend).toBe(1);
    expect(ctrl._smoothedProjectionBlend).toBeLessThan(0.5); // not instant
    // Drive update() for ~2 seconds and confirm the blend converges.
    for (let i = 0; i < 80; i++) ctrl.update(0.05, bottle);
    expect(ctrl._smoothedProjectionBlend).toBeGreaterThan(0.95);
  });

  it('blend matrix is element-wise lerp of ortho and persp projection matrices', () => {
    const ortho = new THREE.OrthographicCamera(-5.5, 5.5, 5.5, -5.5, -10, 100);
    const persp = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    ortho.up.set(0, 0, 1); persp.up.set(0, 0, 1);
    const ctrl = new CameraController(ortho, persp, makeFakeLight(), makeFakeAddScoreText());
    // Sanity: constructor must have established an activeCamera or the
    // _applyProjectionParams call below would silently no-op the assertions.
    expect(ctrl.activeCamera).toBeDefined();
    ortho.zoom = 1.4; ortho.updateProjectionMatrix();
    persp.fov = 35; persp.updateProjectionMatrix();
    // Force a blend value of exactly 0.5.
    ctrl._smoothedProjectionBlend = 0.5;
    // Both cameras need a known projection. Capture them.
    const mOrtho = ortho.projectionMatrix.elements.slice();
    const mPersp = persp.projectionMatrix.elements.slice();
    // Run the per-frame projection-application path. The active camera's
    // projectionMatrix should be the element-wise mean of the two.
    ctrl._applyProjectionParams();
    const mActive = ctrl.activeCamera.projectionMatrix.elements;
    for (let i = 0; i < 16; i++) {
      const expected = (mOrtho[i] + mPersp[i]) / 2;
      expect(mActive[i]).toBeCloseTo(expected, 5);
    }
  });

  it('blend at endpoints reproduces each camera\'s native projection matrix', () => {
    const ortho = new THREE.OrthographicCamera(-5.5, 5.5, 5.5, -5.5, -10, 100);
    const persp = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    ortho.up.set(0, 0, 1); persp.up.set(0, 0, 1);
    const ctrl = new CameraController(ortho, persp, makeFakeLight(), makeFakeAddScoreText());
    ortho.zoom = 1.4; ortho.updateProjectionMatrix();
    persp.fov = 35; persp.updateProjectionMatrix();

    ctrl._smoothedProjectionBlend = 0;
    ctrl._applyProjectionParams();
    const mAtZero = ctrl.activeCamera.projectionMatrix.elements.slice();
    const mOrtho = ortho.projectionMatrix.elements;
    for (let i = 0; i < 16; i++) {
      expect(mAtZero[i]).toBeCloseTo(mOrtho[i], 5);
    }

    ctrl._smoothedProjectionBlend = 1;
    ctrl._applyProjectionParams();
    const mAtOne = ctrl.activeCamera.projectionMatrix.elements.slice();
    const mPersp = persp.projectionMatrix.elements;
    for (let i = 0; i < 16; i++) {
      expect(mAtOne[i]).toBeCloseTo(mPersp[i], 5);
    }
  });

  it('blend matrix is continuous frame-to-frame during a setProjection transition', () => {
    // The user-visible "brutal cut" symptom is a single-frame jump in
    // the projection matrix. With the lerp, no single update() should
    // change any matrix element by more than ~12% of the total endpoint
    // delta (a hard cut would be 100% on a single frame).
    const { ctrl } = makeController();
    const bottle = makeBottleFixture(new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, -1, 0));
    // Capture the ortho-end matrix and the persp-end matrix.
    ctrl._smoothedProjectionBlend = 0;
    ctrl._applyProjectionParams();
    const mStart = ctrl.activeCamera.projectionMatrix.elements.slice();
    ctrl._smoothedProjectionBlend = 1;
    ctrl._applyProjectionParams();
    const mEnd = ctrl.activeCamera.projectionMatrix.elements.slice();
    // Reset and trigger a swap.
    ctrl._smoothedProjectionBlend = 0;
    ctrl._targetProjectionBlend = 0;
    ctrl.setProjection(PROJECTION.PERSP);
    let prev = null;
    let maxFrameJump = 0;
    for (let i = 0; i < 80; i++) {
      ctrl.update(0.05, bottle);
      const cur = ctrl.activeCamera.projectionMatrix.elements;
      if (prev) {
        for (let k = 0; k < 16; k++) {
          const totalDelta = Math.abs(mEnd[k] - mStart[k]);
          if (totalDelta < 1e-6) continue;
          const frameDelta = Math.abs(cur[k] - prev[k]);
          const ratio = frameDelta / totalDelta;
          if (ratio > maxFrameJump) maxFrameJump = ratio;
        }
      }
      prev = Array.from(cur);
    }
    expect(maxFrameJump).toBeLessThan(0.15);
  });

  it('pose stays mirrored on the inactive camera so the blend host swap does not pop', () => {
    // Regression for a bug caught in code review: update() only lerped
    // activeCamera.position, leaving the inactive camera at whatever pose
    // setProjection synced. The host swap at blend≈0.5 then snapped the
    // renderer to the stale inactive pose. Both cameras must hold
    // identical pose every frame so the swap is a visual no-op.
    const { ctrl, ortho, persp } = makeController();
    const bottle = makeBottleFixture(new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, -1, 0));
    const cur = { mesh: { position: new THREE.Vector3(0, 0, 0) }, body: { position: { z: 0 } }, height: 0.5 };
    const nxt = { mesh: { position: new THREE.Vector3(0, 4, 0) }, body: { position: { z: 0 } }, height: 0.5 };
    ctrl.setTarget(cur, nxt, true);
    // Trigger a transition mid-flight so _idealPosition keeps moving
    // through the breathing animation while activeCamera lerps.
    ctrl.setProjection(PROJECTION.PERSP);
    for (let i = 0; i < 30; i++) {
      ctrl.update(0.05, bottle);
      // After every tick, both cameras should hold identical pose.
      expect(ortho.position.distanceTo(persp.position)).toBeLessThan(1e-5);
      // Quaternion equality via dot product — abs(dot) ≈ 1 means same rotation.
      // (THREE r0.89 has no Quaternion.angleTo helper.)
      const qDot = Math.abs(
        ortho.quaternion.x * persp.quaternion.x +
        ortho.quaternion.y * persp.quaternion.y +
        ortho.quaternion.z * persp.quaternion.z +
        ortho.quaternion.w * persp.quaternion.w
      );
      expect(qDot).toBeGreaterThan(1 - 1e-5);
    }
  });
});
