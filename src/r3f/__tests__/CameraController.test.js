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

  it('FLIP picks a mid-flip mode using the injected RNG (deterministic)', () => {
    const seq = [0.0, 0.4, 0.9];
    let i = 0;
    const random = () => seq[i++ % seq.length];
    const { ctrl } = makeController({ random });
    const bottle = makeBottleFixture(new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, -1, 0));
    const landing = new THREE.Vector3(2, 0, 0);

    ctrl.setStateFlip(bottle, landing);
    expect(ctrl.flipMode).toBe(FLIP_MODE.FOLLOW);

    ctrl.setStateFlip(bottle, landing);
    expect(ctrl.flipMode).toBe(FLIP_MODE.LOCKED);

    ctrl.setStateFlip(bottle, landing);
    expect(ctrl.flipMode).toBe(FLIP_MODE.CINEMATIC_CUT);
  });

  it('LOCKED flip mode snapshots the camera pose', () => {
    const random = () => 0.4; // hits LOCKED
    const { ctrl } = makeController({ random });
    const bottle = makeBottleFixture(new THREE.Vector3(1, 1, 0.5), new THREE.Vector3(0, -1, 0));
    ctrl.activeCamera.position.set(7, 7, 7);
    ctrl._currentLookAt.set(1, 1, 0.5);

    ctrl.setStateFlip(bottle, new THREE.Vector3(2, 1, 0));
    expect(ctrl._lockedCamPos.x).toBe(7);
    expect(ctrl._lockedCamPos.y).toBe(7);
    expect(ctrl._lockedCamPos.z).toBe(7);
    expect(ctrl._lockedLookAt.equals(new THREE.Vector3(1, 1, 0.5))).toBe(true);
  });

  it('CINEMATIC_CUT positions camera perpendicular to the travel axis', () => {
    const random = () => 0.9; // hits CINEMATIC_CUT
    const { ctrl } = makeController({ random });
    const bottle = makeBottleFixture(new THREE.Vector3(0, 0, 0.5), new THREE.Vector3(0, -1, 0));
    const landing = new THREE.Vector3(4, 0, 0);

    ctrl.setStateFlip(bottle, landing);
    // Travel is along +X. Perpendicular (rotate 90° around Z) is along +Y or -Y.
    const camPos = ctrl._cinematicCamPos;
    expect(Math.abs(camPos.x)).toBeLessThan(1e-3); // ~zero on X axis
    expect(Math.abs(camPos.y)).toBeGreaterThan(0.5);
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

  it('setProjection swaps activeCamera and carries pose', () => {
    const { ctrl, ortho, persp } = makeController();
    ctrl._idealPosition.set(2, 3, 4);
    ctrl._currentLookAt.set(0, 0, 0.5);
    ctrl.setProjection(PROJECTION.PERSP);
    expect(ctrl.activeCamera).toBe(persp);
    expect(persp.position.x).toBe(2);
    expect(persp.position.y).toBe(3);
    expect(persp.position.z).toBe(4);
    ctrl.setProjection(PROJECTION.ORTHO);
    expect(ctrl.activeCamera).toBe(ortho);
  });

  it('exposes ALL_FLIP_MODES with exactly the three documented values', () => {
    expect(_internals.ALL_FLIP_MODES.sort()).toEqual(
      [FLIP_MODE.CINEMATIC_CUT, FLIP_MODE.FOLLOW, FLIP_MODE.LOCKED].sort()
    );
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
});
