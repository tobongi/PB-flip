/* eslint-env jest */
import * as THREE from 'three';
import CameraController, {
  CAMERA_STATE,
  PROJECTION,
  FLIP_MODE,
  _internals,
} from '../../game/world/CameraController';

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
});
