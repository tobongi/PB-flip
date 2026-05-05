import * as THREE from 'three';

// === Tunables ============================================================
// These values are the spec the user signed off on. Constants live up here
// so the test suite can sanity-check them and so an art pass can re-tune
// the camera without touching the state machine logic.

// Distance from label to camera (world units). Chosen so the label band
// fills ~15% of screen height with the IDLE_FOV while keeping the next
// table visible (the user's two competing constraints — see migration doc).
// Distances stay tight because the restaurant scene model has walls
// ~6-8 units back from the bottle; pulling further punches through.
const IDLE_DISTANCE = 4.8;
const CHARGE_DISTANCE = 5.6;        // gentle pull-back, FOV does the rest
const FLIP_FOLLOW_DISTANCE = 5.0;
const FLIP_LOCKED_DISTANCE = 5.0;
const FLIP_CINEMATIC_DISTANCE = 5.4;

// Hard cap on `_curDistance`. Anything beyond starts clipping into
// walls or shows the bottle as an unreadable speck — clamp before
// applying so breathing oscillation, lerp overshoot, or future tunable
// edits can't punch through.
const MAX_CAMERA_DISTANCE = 6.2;

// Hard cap on how far above the label the camera can climb. Without
// this, the pitch * distance product can lift the camera into the
// ceiling/upper-wall sections of the restaurant model — visible as
// a "looking at a wall" shot. 2.6 keeps the cam at ~labelZ+2.6 max,
// which sits comfortably below the GLB ceiling but above all the
// chairs/tables/plates the player needs to see beyond the bottle.
const MAX_VERTICAL_LIFT = 2.6;

// Perspective FOVs (degrees). MAX_PERSP_FOV caps the widest FOV reach
// so the label stays readable even when the user holds charge for the
// full breathing window.
const IDLE_FOV = 35;
const CHARGE_FOV = 50;
const FLIP_FOLLOW_FOV = 42;
const FLIP_LOCKED_FOV = 40;
const FLIP_CINEMATIC_FOV = 36;
const MAX_PERSP_FOV = 52;

// Orthographic zoom (THREE camera.zoom). Smaller = wider FOV.
// MIN_ORTHO_ZOOM ensures the label band always renders at >= ~15%
// of screen height regardless of which state we're in.
const IDLE_ZOOM = 1.4;
const CHARGE_ZOOM = 1.10;
const FLIP_FOLLOW_ZOOM = 1.20;
const FLIP_LOCKED_ZOOM = 1.22;
const FLIP_CINEMATIC_ZOOM = 1.32;
const MIN_ORTHO_ZOOM = 1.05;

// Breathing-zoom oscillation (idle only).
const BREATHE_PERIOD_S = 6.0;
const BREATHE_AMPLITUDE = 0.05; // ±5% on distance + zoom

// Pitch: a shoulder-level *feel* without an actual horizontal sightline.
// A truly horizontal camera at label-height runs into restaurant walls,
// chairs, and far tables — anything in the line between the camera and
// the bottle obstructs the shot. We tilt the camera DOWN by PITCH_ANGLE,
// which keeps the bottle's vertical silhouette near label height in the
// frame (no over-the-shoulder bird's-eye look) while moving the camera
// up-and-back so its sightline clears the surrounding props. The label
// still appears at the center of the frame because we lookAt the label
// position; the pitch only affects the camera's elevation.
//
// Bumped from 28° to 36° on the second art pass — the lower angle was
// hiding the next-landing platform behind the bottle's silhouette.
// 36° lets the player see the platform layout beyond the bottle while
// still reading as a "cinematic shoulder shot" rather than a top-down.
const PITCH_ANGLE = (36 * Math.PI) / 180;
const PITCH_COS = Math.cos(PITCH_ANGLE);
const PITCH_SIN = Math.sin(PITCH_ANGLE);
// Tiny extra vertical lift so the optical axis hits just above the
// label band's vertical center — gives the artwork a slightly
// upward-from-below presentation that reads as more cinematic than
// dead-center.
const Z_LIFT = 0.05;

// Failed-landing target alpha + grey weight + light dimming.
const FAILED_FADE_ALPHA = 0.45;
const FAILED_GREY_WEIGHT = 0.7;
const FAILED_LIGHT_SCALE = 0.45;

// Lerp damping (1 - exp(-k*dt)).
const STATE_DAMPING = 4.0;
const FLIP_DAMPING = 10.0;
const FAILED_DAMPING = 2.0;
// Slerp speed for the bottle-yaw + camera-axis convergence when an
// obstacle forces a direction change. Slow enough to feel like the
// bottle "rotates on itself" rather than snapping.
const AXIS_SLERP_DAMPING = 3.0;

// Camera-axis collision sweep. Number of horizontal directions sampled
// around the bottle when the preferred -travelAxis is occluded.
const SWEEP_SAMPLES = 24;
// Margin under MAX_CAMERA_DISTANCE for the collision raycast — gives
// the camera a small buffer so it isn't kissing the wall.
const SWEEP_MARGIN = 0.4;
// Cast a small bundle of rays across the label area. A single center ray
// can report "clear" while a chair/table edge still covers most of the
// artwork on screen.
const LABEL_VIS_HALF_WIDTH = 0.24;
const LABEL_VIS_HALF_HEIGHT = 0.28;
const LABEL_HIT_CLEARANCE = 0.12;
const CONTINUOUS_SWEEP_INTERVAL_S = 0.12;

// Idle/charge framing: aim slightly toward the next block so the player can
// see the upcoming landing zone while keeping the bottle label readable.
const BLOCK_AIM_BLEND = 0.62;
const FAILED_BLOCK_AIM_BLEND = 0.45;

// Flip shot composition: keep bottle readable but include landing zone.
const LOCKED_LANDING_BLEND = 0.22;
const CINEMATIC_LANDING_BLEND = 0.65;
const BOTTLE_AIM_Z_OFFSET = 0.6;
const CINEMATIC_CUT_EXTRA_Z = 0.55;

// === Occlusion Solver (PLAN_v2) ==========================================
// Primary fix: orbit to a clear axis. Backup: clamp the camera in front of
// the first hit along anchor->camera. Last resort: fade ONE mesh (closest hit).
const MIN_ANCHOR_DIST = 1.2;
const CAMERA_MARGIN = 0.25;
const COMFORT_DIST = 2.0;
const SNAP_DAMPING = 0.85;
const MAX_SNAP_FRAMES = 3;
const MAX_CLAMPED_FRAMES = 8;
const NEXT_TARGET_WEIGHT = 0.35;
const CONTINUITY_WEIGHT = 0.15;
// Stage C fade: walls should be barely-there, posters should fully disappear.
const STAGEC_WALL_ALPHA = 0.08;
// If the blocker is very close to the camera, any partial alpha reads as a
// huge blurry smear. Fade it out completely.
const STAGEC_NEAR_FADE_START = 0.35;
const STAGEC_NEAR_FADE_RANGE = 0.9;

// Mid-flip behaviour modes.
export const FLIP_MODE = Object.freeze({
  FOLLOW: 'follow',
  LOCKED: 'locked',
  CINEMATIC_CUT: 'cinematic-cut',
});
const ALL_FLIP_MODES = [FLIP_MODE.FOLLOW, FLIP_MODE.LOCKED, FLIP_MODE.CINEMATIC_CUT];

// Top-level states.
export const CAMERA_STATE = Object.freeze({
  IDLE: 'idle',
  CHARGE: 'charge',
  FLIP: 'flip',
  LANDING: 'landing',
  FAILED: 'failed',
});

// Projection types.
export const PROJECTION = Object.freeze({
  ORTHO: 'ortho',
  PERSP: 'persp',
});

// =========================================================================

export default class CameraController {
  // --- runtime state -----------------------------------------------------
  state = CAMERA_STATE.IDLE;
  flipMode = FLIP_MODE.FOLLOW;
  projection = PROJECTION.ORTHO;
  elapsed = 0;
  _continuousSweepElapsed = 0;

  // smoothed camera params
  _curDistance = IDLE_DISTANCE;
  _tarDistance = IDLE_DISTANCE;
  _curFov = IDLE_FOV;
  _tarFov = IDLE_FOV;
  _curZoom = IDLE_ZOOM;
  _tarZoom = IDLE_ZOOM;

  // failed-state interpolation: 0 = normal, 1 = fully failed.
  _failedT = 0;

  // saved baselines so failed-state can ungrade if needed.
  _baseLightI = null;
  _baseHemiI = null;
  _baseAmbientI = null;
  _baseFillI = null;
  _baseSceneBg = null;

  // FLIP_MODE.LOCKED records the camera pose at flip start so it can
  // hold position while the bottle leaves the frame.
  _lockedCamPos = new THREE.Vector3();
  _lockedLookAt = new THREE.Vector3();
  _lockedStartLookAt = new THREE.Vector3();

  // FLIP_MODE.CINEMATIC_CUT records a perpendicular side-on pose.
  _cinematicCamPos = new THREE.Vector3();
  _cinematicLookAt = new THREE.Vector3();
  _cinematicDir = new THREE.Vector3(1, 0, 0);

  _lookAtTarget = new THREE.Vector3();
  _currentLookAt = new THREE.Vector3();
  _blockLookAtTarget = new THREE.Vector3();
  _hasBlockTarget = false;
  _nextLandablePos = new THREE.Vector3();
  _hasNextLandable = false;
  _idealPosition = new THREE.Vector3();
  _lookMatrix = new THREE.Matrix4();
  _targetQ = new THREE.Quaternion();

  _trackBottle = null;
  _trackLanding = null;
  _flipStartLabelPos = new THREE.Vector3();

  // Block-travel axis: unit vector from currentBlock toward nextBlock,
  // ground-projected. The camera sits on the OPPOSITE side of this axis
  // (i.e. behind the bottle relative to the upcoming flip), which is
  // usually a clear sightline because the gameplay path is laid out
  // along these axes. Defaults to +Y (typical first-block direction).
  _travelAxis = new THREE.Vector3(0, 1, 0);

  // Best camera axis after the obstacle-collision sweep. May differ
  // from -travelAxis when the preferred direction is blocked by a
  // wall, chair, or upcoming table. Smoothed toward over a few
  // frames so the bottle visibly rotates rather than snapping.
  _targetCameraAxis = new THREE.Vector3(0, -1, 0);
  _smoothedCameraAxis = new THREE.Vector3(0, -1, 0);

  // Reusable raycaster for the collision sweep.
  _raycaster = null;
  // Tmp vec to avoid allocating per ray.
  _sweepDir = new THREE.Vector3();
  _sweepCamPos = new THREE.Vector3();
  _sweepCamPos2 = new THREE.Vector3();
  _sweepTarget = new THREE.Vector3();
  _sweepRight = new THREE.Vector3();
  _sweepViewDir = new THREE.Vector3();
  _worldUp = new THREE.Vector3(0, 0, 1);

  // Stage C: we fade exactly one mesh at a time (closest hit).
  _fadedMesh = null;
  _fadeBase = new Map(); // Mesh -> base material state array
  _fadeAlpha = 1;
  // Debug: which occluders were hit this frame (name + distance from camera).
  lastOccluders = [];
  _orbitSnapFramesLeft = 0;
  _clampedFrames = 0;

  // Latest world position of the label, cached from the last update tick
  // so snap() and the test suite can read it without re-walking the
  // bottle's matrix chain.
  _labelPosCache = new THREE.Vector3();
  _occlusionAnchorCache = new THREE.Vector3();
  _candidatePos = new THREE.Vector3();
  _tmpLookAt = new THREE.Vector3();

  // RNG hook — caller may inject a seeded RNG for tests.
  _rand = Math.random;

  constructor(orthoCamera, perspectiveCamera, light, addScoreText, opts = {}) {
    this.orthoCamera = orthoCamera;
    this.perspectiveCamera = perspectiveCamera;
    this.light = light;
    this.addScoreText = addScoreText;

    // Scene refs for failed-state grading. Optional — pass via opts so the
    // existing test fixtures don't need to construct a full scene.
    this.scene = opts.scene || null;
    this.hemi = opts.hemi || null;
    this.ambientLight = opts.ambientLight || null;
    this.fill = opts.fill || null;
    this.fadeOverlayOrtho = opts.fadeOverlayOrtho || null;
    this.fadeOverlayPersp = opts.fadeOverlayPersp || null;

    if (typeof opts.random === 'function') this._rand = opts.random;

    // Initial projection picked deterministically (ortho first round).
    this.activeCamera = orthoCamera;
    this.orthoCamera.zoom = this._curZoom;
    this.orthoCamera.updateProjectionMatrix();
    this.perspectiveCamera.fov = this._curFov;
    this.perspectiveCamera.updateProjectionMatrix();
  }

  // ---- lifecycle helpers used by GameController ------------------------

  setRandom(rng) {
    if (typeof rng === 'function') this._rand = rng;
  }

  // Capture initial scene grading values so failed-state can lerp from
  // the real baseline. Call once after WorldScene construction.
  captureBaseline() {
    if (this.light) this._baseLightI = this.light.intensity;
    if (this.hemi) this._baseHemiI = this.hemi.intensity;
    if (this.ambientLight) this._baseAmbientI = this.ambientLight.intensity;
    if (this.fill) this._baseFillI = this.fill.intensity;
    if (this.scene && this.scene.background && this.scene.background.isTexture) {
      // Background is a CanvasTexture (gradient). We can't easily grey
      // a texture in-place, so instead we apply a global scene fog that
      // we can interpolate. Fog is null by default; hook it up here.
      this._baseSceneBg = this.scene.background;
    }
  }

  // ---- public state-machine API ---------------------------------------

  setStateIdle() {
    this.state = CAMERA_STATE.IDLE;
    this._tarDistance = IDLE_DISTANCE;
    this._tarFov = IDLE_FOV;
    this._tarZoom = IDLE_ZOOM;
  }

  setStateCharge() {
    this.state = CAMERA_STATE.CHARGE;
    this._tarDistance = CHARGE_DISTANCE;
    this._tarFov = CHARGE_FOV;
    this._tarZoom = CHARGE_ZOOM;
  }

  // Begin tracking a bottle through a flip. Picks the random flip mode.
  setStateFlip(bottle, landingPos) {
    this.state = CAMERA_STATE.FLIP;
    this._trackBottle = bottle;
    this._trackLanding = landingPos ? landingPos.clone() : null;

    const idx = Math.floor(this._rand() * ALL_FLIP_MODES.length);
    this.flipMode = ALL_FLIP_MODES[Math.min(ALL_FLIP_MODES.length - 1, idx)];

    // Snapshot label-pos at flip start so LOCKED + CINEMATIC_CUT have
    // a stable anchor.
    if (bottle && bottle.getLabelWorldPosition) {
      this._flipStartLabelPos.copy(bottle.getLabelWorldPosition());
    } else if (bottle && bottle.position) {
      this._flipStartLabelPos.copy(bottle.position);
    } else {
      this._flipStartLabelPos.set(0, 0, 0);
    }

    if (this.flipMode === FLIP_MODE.FOLLOW) {
      this._tarDistance = FLIP_FOLLOW_DISTANCE;
      this._tarFov = FLIP_FOLLOW_FOV;
      this._tarZoom = FLIP_FOLLOW_ZOOM;
    } else if (this.flipMode === FLIP_MODE.LOCKED) {
      this._tarDistance = FLIP_LOCKED_DISTANCE;
      this._tarFov = FLIP_LOCKED_FOV;
      this._tarZoom = FLIP_LOCKED_ZOOM;
      // Save current camera pose — the renderer will keep using it.
      this._lockedCamPos.copy(this.activeCamera.position);
      // Snapshot legacy locked lookAt (tests + back-compat), but also
      // seed the actual locked shot to start on the bottle immediately.
      this._lockedLookAt.copy(this._currentLookAt);
      if (bottle && bottle.mesh) {
        this._lockedStartLookAt.copy(bottle.mesh.position);
        this._lockedStartLookAt.z += BOTTLE_AIM_Z_OFFSET;
      } else {
        this._lockedStartLookAt.copy(this._flipStartLabelPos);
      }
      this._currentLookAt.copy(this._lockedStartLookAt);
    } else {
      // CINEMATIC_CUT: snap to a perpendicular side-on pose around the
      // start label position, looking toward the landing target so the
      // bottle's arc plays out across the X axis of the frame.
      this._tarDistance = FLIP_CINEMATIC_DISTANCE;
      this._tarFov = FLIP_CINEMATIC_FOV;
      this._tarZoom = FLIP_CINEMATIC_ZOOM;
      const start = this._flipStartLabelPos;
      const end = this._trackLanding || start;
      const travel = new THREE.Vector3().subVectors(end, start);
      // Perpendicular (rotate 90° around Z) gives the side-on axis.
      const perp = new THREE.Vector3(-travel.y, travel.x, 0);
      if (perp.lengthSq() < 1e-6) perp.set(1, 0, 0);
      perp.normalize().multiplyScalar(FLIP_CINEMATIC_DISTANCE);

      // Prefer the side with a clearer sightline to the bottle at flip start.
      const labelNow = (bottle && bottle.getLabelWorldPosition) ? bottle.getLabelWorldPosition() : start;
      const lookAt = new THREE.Vector3().copy(start).lerp(end, CINEMATIC_LANDING_BLEND);
      const lift = Math.min(FLIP_CINEMATIC_DISTANCE * PITCH_SIN, MAX_VERTICAL_LIFT) + Z_LIFT + CINEMATIC_CUT_EXTRA_Z;

      const c1 = new THREE.Vector3().copy(start).add(perp);
      c1.z += lift;
      const c2 = new THREE.Vector3().copy(start).sub(perp);
      c2.z += lift;

      const d1 = this._calcSightlineClearance(labelNow, c1, bottle);
      const d2 = this._calcSightlineClearance(labelNow, c2, bottle);
      const chosen = (d2 > d1) ? c2 : c1;

      this._cinematicLookAt.copy(lookAt);
      // Keep _cinematicCamPos anchored around the start label (perp to travel)
      // so the shot is a true side-on cut and matches the tests.
      this._cinematicCamPos.copy(chosen);
      this.activeCamera.position.copy(this._cinematicCamPos);
      this._currentLookAt.copy(this._cinematicLookAt);
    }
  }

  setStateLanding() {
    this.state = CAMERA_STATE.LANDING;
    this._trackBottle = null;
    this._trackLanding = null;
    this._tarDistance = IDLE_DISTANCE;
    this._tarFov = IDLE_FOV;
    this._tarZoom = IDLE_ZOOM;

    // Random projection swap on landing — next round can be ortho or persp.
    this._maybeSwapProjection();
  }

  setStateFailed() {
    this.state = CAMERA_STATE.FAILED;
    this._trackBottle = null;
    // distance/fov/zoom held at whatever idle target is.
  }

  _maybeSwapProjection() {
    const want = this._rand() < 0.5 ? PROJECTION.ORTHO : PROJECTION.PERSP;
    this.setProjection(want);
  }

  setProjection(p) {
    if (p === this.projection) return;
    this.projection = p;
    if (p === PROJECTION.ORTHO) {
      this.activeCamera = this.orthoCamera;
    } else {
      this.activeCamera = this.perspectiveCamera;
    }
    // Carry over current pose to the newly-active camera.
    this.activeCamera.position.copy(this._idealPosition);
    this.activeCamera.up.set(0, 0, 1);
    this.activeCamera.lookAt(this._currentLookAt);
  }

  // ---- pre-flip aim (block-to-block) ----------------------------------
  // Called by GameController when current/next block changes. Updates the
  // light + the lookAt target around the midpoint between blocks.
  setTarget(currentBlock, nextBlock, snap = false) {
    const sourceZ = currentBlock ? currentBlock.body.position.z + currentBlock.height : 0;
    const destZ = nextBlock ? nextBlock.body.position.z + nextBlock.height : sourceZ;
    const lookZ = (sourceZ + destZ) / 2;

    if (currentBlock && nextBlock) {
      const cur = currentBlock.mesh.position.clone().setZ(lookZ);
      const nxt = nextBlock.mesh.position.clone().setZ(lookZ);
      this._lookAtTarget.lerpVectors(cur, nxt, 0.45);
      this._blockLookAtTarget.copy(this._lookAtTarget);
      this._hasBlockTarget = true;
      this._nextLandablePos.copy(nextBlock.mesh.position).setZ(destZ);
      this._hasNextLandable = true;
      // Travel axis = direction toward the next block, ground-projected.
      // Camera sits on the OPPOSITE side (behind currentBlock) so the
      // player sees the bottle and the next block in the same shot.
      const travel = new THREE.Vector3().subVectors(
        nextBlock.mesh.position, currentBlock.mesh.position
      ).setZ(0);
      if (travel.lengthSq() > 1e-6) {
        this._travelAxis.copy(travel.normalize());
      }
    } else {
      this._lookAtTarget.set(0, 0, 0);
      this._blockLookAtTarget.set(0, 0, 0);
      this._hasBlockTarget = false;
      this._nextLandablePos.set(0, 0, 0);
      this._hasNextLandable = false;
    }

    // Defer the obstacle-clear camera-axis sweep to the next update()
    // tick — at that point the bottle's matrices are up-to-date and we
    // can run the raycast against the actual labelPos. setTarget is
    // called at every block transition so the sweep runs once per turn.
    this._sweepDirty = true;
    this._sweepSnap = !!snap;

    if (snap) {
      this._currentLookAt.copy(this._lookAtTarget);
      this._curDistance = this._tarDistance;
      this._curFov = this._tarFov;
      this._curZoom = this._tarZoom;
      this._applyProjectionParams();
    }

    const lightOffset = new THREE.Vector3(2, -10, 15);
    this.light.position.copy(lightOffset.add(this._lookAtTarget));
    this.light.target.position.copy(this._lookAtTarget);
  }

  _setIdleLookAt(labelPos) {
    if (!labelPos) return;
    this._lookAtTarget.copy(labelPos);
    if (!this._hasBlockTarget) return;

    const blend = (this.state === CAMERA_STATE.FAILED) ? FAILED_BLOCK_AIM_BLEND : BLOCK_AIM_BLEND;
    // Use the block-to-block midpoint for XY so the next table stays in frame,
    // but keep the label's Z so we don't aim down into the table surface.
    this._tmpLookAt.copy(this._blockLookAtTarget);
    this._tmpLookAt.z = this._lookAtTarget.z;
    this._lookAtTarget.lerp(this._tmpLookAt, blend);
  }

  _getOcclusionAnchor(bottle, labelPosHint = null) {
    if (!bottle) return null;
    const out = this._occlusionAnchorCache;

    // Mid-flip: use a stable anchor near the bottle center (label jitters).
    if (this.state === CAMERA_STATE.FLIP) {
      if (bottle.mesh && bottle.mesh.position) {
        out.copy(bottle.mesh.position);
        out.z += BOTTLE_AIM_Z_OFFSET;
        return out;
      }
    }

    // Non-flip states: prefer the current labelPos we already computed.
    if (labelPosHint) {
      out.copy(labelPosHint);
      return out;
    }

    if (bottle.getLabelWorldPosition) {
      out.copy(bottle.getLabelWorldPosition());
      return out;
    }

    if (bottle.mesh && bottle.mesh.position) {
      out.copy(bottle.mesh.position);
      return out;
    }

    return null;
  }

  _getOcclusionExtraTarget() {
    if (this._trackLanding) return this._trackLanding;
    if (this._hasNextLandable) return this._nextLandablePos;
    return null;
  }

  // ---- frame update ----------------------------------------------------
  update(dt, bottle) {
    this.elapsed += dt;
    this._continuousSweepElapsed += dt;

    // 1. Where IS the label, in world space?  Falls back to lookAtTarget
    //    if the bottle isn't attached (e.g. between rounds). The CAMERA
    //    AXIS is the negated travel direction (away from the next block),
    //    so the camera always sits in a clean sightline regardless of
    //    where the bottle's body has settled. The bottle's inner mesh
    //    is then yawed via setLabelFaceDirection so the label artwork
    //    keeps facing the camera — that's how we deliver "always tracking
    //    the label" without ending up clipped into restaurant walls.
    // 0. Run the obstacle sweep if it's dirty (set on every setTarget).
    //    Done before computing labelPos so the sweep uses the same
    //    label position as the rest of the frame.
    const shouldRunContinuousSweep = bottle && this._continuousSweepElapsed >= CONTINUOUS_SWEEP_INTERVAL_S;
    if ((this._sweepDirty || shouldRunContinuousSweep) && bottle) {
      this._refreshTargetCameraAxis(bottle);
      this._continuousSweepElapsed = 0;
      if (this._sweepDirty) {
        this._sweepDirty = false;
        if (this._sweepSnap) {
          this._smoothedCameraAxis.copy(this._targetCameraAxis);
          this._sweepSnap = false;
        }
      }
    }

    let labelPos = this._lookAtTarget;
    if (bottle && bottle.getLabelWorldPosition) {
      // While flipping the bottle is rotating wildly — using the
      // label position would yank the camera around with each spin.
      // Use the mesh center instead during flight, then fall back to
      // the label center while idle/charge/landing.
      if (this.state === CAMERA_STATE.FLIP && bottle.mesh) {
        this._labelPosCache.copy(bottle.mesh.position);
        // Aim the lookAt toward the label-band Z height so the bottle
        // sits a touch lower than centered, like the idle shot.
        this._labelPosCache.z += 0.6;
        labelPos = this._labelPosCache;
      } else {
        labelPos = bottle.getLabelWorldPosition();
        this._labelPosCache.copy(labelPos);
      }
    }
    const occlusionAnchor = this._getOcclusionAnchor(bottle, labelPos);
    // Smooth-rotate the camera axis toward the obstacle-clear target.
    // Bottle visually rotates with this axis (setLabelFaceDirection
    // below) so the user reads it as "the bottle turning to face
    // wherever the camera can see clearly", which is exactly the
    // failure mode they wanted fixed.
    if (this._orbitSnapFramesLeft > 0) {
      this._smoothedCameraAxis.lerp(this._targetCameraAxis, SNAP_DAMPING).normalize();
      this._orbitSnapFramesLeft = Math.max(0, this._orbitSnapFramesLeft - 1);
    } else {
      const axisT = 1 - Math.exp(-AXIS_SLERP_DAMPING * dt);
      this._smoothedCameraAxis.lerp(this._targetCameraAxis, axisT).normalize();
    }
    const cameraAxis = this._smoothedCameraAxis;
    if (cameraAxis.lengthSq() < 1e-6) cameraAxis.set(0, -1, 0);
    // Force the bottle's inner-mesh yaw to face the (smoothed) camera
    // axis. Skipped mid-flip — the bottle should be free to spin in
    // the air without our override fighting the physics rotation.
    if (
      bottle && bottle.setLabelFaceDirection &&
      this.state !== CAMERA_STATE.FLIP
    ) {
      bottle.setLabelFaceDirection(cameraAxis, true);
    }

    // 2. Decide where the camera SHOULD look.
    if (this.state === CAMERA_STATE.FLIP && this.flipMode === FLIP_MODE.LOCKED) {
      // Tripod-style shot: camera position is locked, but we pan the lookAt
      // slightly toward the landing zone so the player sees what's next.
      const bottlePos = this._trackBottle && this._trackBottle.mesh
        ? this._trackBottle.mesh.position
        : (this._trackBottle ? this._trackBottle.position : this._lockedStartLookAt);
      this._lookAtTarget.copy(bottlePos);
      this._lookAtTarget.z += BOTTLE_AIM_Z_OFFSET;
      if (this._trackLanding) {
        this._tmpLookAt.copy(this._trackLanding);
        this._tmpLookAt.z = this._lookAtTarget.z;
        this._lookAtTarget.lerp(this._tmpLookAt, LOCKED_LANDING_BLEND);
      }
    } else if (this.state === CAMERA_STATE.FLIP && this.flipMode === FLIP_MODE.CINEMATIC_CUT) {
      this._lookAtTarget.copy(this._cinematicLookAt);
    } else if (this.state === CAMERA_STATE.FLIP && this.flipMode === FLIP_MODE.FOLLOW
               && this._trackBottle) {
      // Mid-air follow: lookAt directly tracks the bottle so the
      // bottle stays on-frame as it arcs through the air. The camera
      // POSITION is held by the same -travelAxis logic as IDLE, so
      // we get a stable orbit-and-track shot rather than the bottle
      // drifting off-screen toward the landing midpoint.
      const bottlePos = this._trackBottle.mesh
        ? this._trackBottle.mesh.position
        : this._trackBottle.position;
      this._lookAtTarget.copy(bottlePos);
    } else if (bottle && bottle.getLabelWorldPosition) {
      // IDLE / CHARGE / LANDING / FAILED: lookAt the label center.
      this._setIdleLookAt(labelPos);
    }
    // else: keep whatever setTarget() last established.

    const damping = (this.state === CAMERA_STATE.FLIP) ? FLIP_DAMPING : STATE_DAMPING;
    const t = 1 - Math.exp(-damping * dt);
    this._currentLookAt.lerp(this._lookAtTarget, t);

    // 3. Smooth dist/fov/zoom toward target with breathing oscillation
    //    on idle.
    let breathe = 0;
    if (this.state === CAMERA_STATE.IDLE) {
      breathe = Math.sin((this.elapsed / BREATHE_PERIOD_S) * Math.PI * 2);
    }
    const tarDistanceRaw = this._tarDistance * (1 + BREATHE_AMPLITUDE * breathe);
    const tarZoomRaw = this._tarZoom * (1 - BREATHE_AMPLITUDE * 0.5 * breathe);
    // Clamp to readability + sightline limits so neither tunable edits
    // nor breathing/lerp overshoot can pull the camera into the walls
    // or shrink the label below the readable threshold.
    const tarDistance = Math.min(tarDistanceRaw, MAX_CAMERA_DISTANCE);
    const tarZoom = Math.max(tarZoomRaw, MIN_ORTHO_ZOOM);
    const tarFov = Math.min(this._tarFov, MAX_PERSP_FOV);
    this._curDistance += (tarDistance - this._curDistance) * t;
    this._curFov += (tarFov - this._curFov) * t;
    this._curZoom += (tarZoom - this._curZoom) * t;
    // Belt-and-braces post-clamp in case the lerp overshoots once
    // a frame at very high dt (alt-tab, devtools open, etc).
    if (this._curDistance > MAX_CAMERA_DISTANCE) this._curDistance = MAX_CAMERA_DISTANCE;
    if (this._curZoom < MIN_ORTHO_ZOOM) this._curZoom = MIN_ORTHO_ZOOM;
    if (this._curFov > MAX_PERSP_FOV) this._curFov = MAX_PERSP_FOV;

    // 4. Compute ideal camera position.
    if (this.state === CAMERA_STATE.FLIP && this.flipMode === FLIP_MODE.LOCKED) {
      // Hold the locked camera pose. No update.
      this._idealPosition.copy(this._lockedCamPos);
    } else if (this.state === CAMERA_STATE.FLIP && this.flipMode === FLIP_MODE.CINEMATIC_CUT) {
      // Hold a stable side-on camera position; composition comes from the
      // cut + lookAt framing rather than a drifting dolly.
      this._idealPosition.copy(this._cinematicCamPos);
    } else if (cameraAxis && cameraAxis.lengthSq() > 0.001) {
      // Camera sits at labelPos + cameraAxis * (distance * cos(pitch))
      //                       + Z       * (distance * sin(pitch)).
      // The horizontal pull-back × cos keeps the on-screen distance the
      // same as a non-pitched setup; the vertical lift × sin clears the
      // restaurant clutter — but is hard-capped at MAX_VERTICAL_LIFT
      // so we don't punch through the ceiling at extreme distances.
      this._idealPosition
        .copy(occlusionAnchor || labelPos)
        .addScaledVector(cameraAxis, this._curDistance * PITCH_COS);
      const verticalLift = Math.min(this._curDistance * PITCH_SIN, MAX_VERTICAL_LIFT);
      this._idealPosition.z += verticalLift + Z_LIFT;
    } else {
      // No bottle — fall back to a fixed offset behind/above the lookAt.
      this._idealPosition
        .copy(this._currentLookAt)
        .add(new THREE.Vector3(this._curDistance * 0.7, -this._curDistance * 0.7, this._curDistance * 0.5));
    }

    // Smooth toward ideal position, then apply occlusion solving to the
    // final position we will actually render this frame.
    this._candidatePos.copy(this.activeCamera.position).lerp(this._idealPosition, t);
    if (occlusionAnchor && bottle) {
      const allowOrbit =
        !(this.state === CAMERA_STATE.FLIP &&
          (this.flipMode === FLIP_MODE.LOCKED || this.flipMode === FLIP_MODE.CINEMATIC_CUT));
      this._runOcclusionSolver(dt, occlusionAnchor, this._candidatePos, bottle, { allowOrbit });
    } else {
      this._restoreFadedMesh();
      this._clampedFrames = 0;
    }
    this.activeCamera.position.copy(this._candidatePos);

    // 5. Aim the camera. lookAt → quaternion slerp keeps it smooth even
    //    when the lookAt target jumps (CINEMATIC_CUT case).
    this._lookMatrix.lookAt(this.activeCamera.position, this._currentLookAt, this.activeCamera.up);
    this._targetQ.setFromRotationMatrix(this._lookMatrix);
    this.activeCamera.quaternion.slerp(this._targetQ, t);

    this._applyProjectionParams();

    // 6. Failed-state grading.
    const failedTar = (this.state === CAMERA_STATE.FAILED) ? 1 : 0;
    const ft = 1 - Math.exp(-FAILED_DAMPING * dt);
    this._failedT += (failedTar - this._failedT) * ft;
    this._applyFailedGrade();

    // 7. Score-popup billboarding (preserves original behaviour).
    if (this.addScoreText && this.addScoreText.mesh) {
      this.addScoreText.mesh.lookAt(this.activeCamera.position);
    }
  }

  _applyProjectionParams() {
    if (this.projection === PROJECTION.ORTHO) {
      this.orthoCamera.zoom = this._curZoom;
      this.orthoCamera.updateProjectionMatrix();
    } else {
      this.perspectiveCamera.fov = this._curFov;
      this.perspectiveCamera.updateProjectionMatrix();
    }
  }

  _applyFailedGrade() {
    const t = this._failedT;
    if (this.light && this._baseLightI != null) {
      this.light.intensity = this._baseLightI * (1 - (1 - FAILED_LIGHT_SCALE) * t);
    }
    if (this.hemi && this._baseHemiI != null) {
      this.hemi.intensity = this._baseHemiI * (1 - (1 - FAILED_LIGHT_SCALE) * t);
    }
    if (this.ambientLight && this._baseAmbientI != null) {
      this.ambientLight.intensity = this._baseAmbientI * (1 - 0.6 * t);
    }
    if (this.fill && this._baseFillI != null) {
      this.fill.intensity = this._baseFillI * (1 - 0.6 * t);
    }
    if (this.fadeOverlayOrtho && this.fadeOverlayOrtho.material) {
      this.fadeOverlayOrtho.material.opacity = FAILED_FADE_ALPHA * t;
    }
    if (this.fadeOverlayPersp && this.fadeOverlayPersp.material) {
      this.fadeOverlayPersp.material.opacity = FAILED_FADE_ALPHA * t;
    }
    // Greying: scene.fog interpolates toward grey. Fog blends based on
    // distance from camera, so the further parts grey out first — works
    // well for the table being "consumed" by a grey haze.
    if (this.scene) {
      const greyT = FAILED_GREY_WEIGHT * t;
      if (greyT > 0.001) {
        if (!this.scene.fog) {
          this.scene.fog = new THREE.Fog(0x6e7570, 0.5, 30);
        }
        this.scene.fog.color.setRGB(0.43 * greyT, 0.46 * greyT, 0.44 * greyT);
        this.scene.fog.near = THREE.Math.lerp(40, 0.5, greyT);
        this.scene.fog.far = THREE.Math.lerp(80, 12, greyT);
      } else if (this.scene.fog) {
        // ungrade: detach fog completely so it stops contributing to
        // shading (just pushing far=1000 with near=0.1 still fogs ~99%
        // of the scene because the linear Fog ramp ignores `far`).
        this.scene.fog = null;
      }
    }
  }

  // ---- LANDING snap (instant) -----------------------------------------
  // Called when the bottle has just landed on the next block. Resets to
  // idle framing in one frame.
  snap(bottle) {
    this.setStateLanding();
    this.setStateIdle();
    this._curDistance = this._tarDistance;
    this._curFov = this._tarFov;
    this._curZoom = this._tarZoom;
    this._failedT = 0;

    if (bottle && bottle.getLabelWorldPosition) {
      const labelPos = bottle.getLabelWorldPosition();
      this._setIdleLookAt(labelPos);
      this._currentLookAt.copy(this._lookAtTarget);
      // Run the sweep immediately and snap to the obstacle-clear axis
      // so the snapped pose matches what the eventual idle update lands on.
      this._refreshTargetCameraAxis(bottle);
      this._smoothedCameraAxis.copy(this._targetCameraAxis);
      this._sweepDirty = false;
      const cameraAxis = this._smoothedCameraAxis;
      if (cameraAxis.lengthSq() < 1e-6) cameraAxis.set(0, -1, 0);
      if (bottle.setLabelFaceDirection) {
        bottle.setLabelFaceDirection(cameraAxis, true);
      }
      // Match the lerped update path's pitch math so snap() lands at
      // the same pose as the eventual idle steady state.
      this._idealPosition
        .copy(labelPos)
        .addScaledVector(cameraAxis, this._curDistance * PITCH_COS);
      const verticalLift = Math.min(this._curDistance * PITCH_SIN, MAX_VERTICAL_LIFT);
      this._idealPosition.z += verticalLift + Z_LIFT;
    } else {
      this._idealPosition
        .copy(this._currentLookAt)
        .add(new THREE.Vector3(0, -this._curDistance, this._curDistance * 0.3));
    }

    this.activeCamera.position.copy(this._idealPosition);
    this._lookMatrix.lookAt(this.activeCamera.position, this._currentLookAt, this.activeCamera.up);
    this._targetQ.setFromRotationMatrix(this._lookMatrix);
    this.activeCamera.quaternion.copy(this._targetQ);

    this._applyProjectionParams();
    this._applyFailedGrade();
  }

  // ---- Obstacle-clear camera axis sweep -------------------------------
  // Sample SWEEP_SAMPLES horizontal directions around the bottle, find
  // the ones with no scene-mesh hit within MAX_CAMERA_DISTANCE, and
  // pick the one closest to the preferred direction (-travelAxis).
  // The bottle is visually rotated to face the chosen axis via
  // setLabelFaceDirection, so the player reads it as "the bottle
  // turning so the camera can see it clearly".
  _refreshTargetCameraAxis(bottle) {
    const preferred = new THREE.Vector3()
      .copy(this._travelAxis).negate().setZ(0);
    if (preferred.lengthSq() < 1e-6) preferred.set(0, -1, 0);
    preferred.normalize();

    if (!this.scene || !bottle || !bottle.getLabelWorldPosition) {
      this._targetCameraAxis.copy(preferred);
      return;
    }
    if (!this._raycaster) {
      this._raycaster = new THREE.Raycaster();
      this._raycaster.near = 0.001;
    }
    if (this.scene.updateMatrixWorld) {
      this.scene.updateMatrixWorld(true);
    }
    const labelPos = bottle.getLabelWorldPosition();
    const sweepDistance = Math.min(this._tarDistance || IDLE_DISTANCE, MAX_CAMERA_DISTANCE);
    const horizontalReach = Math.max(0.1, sweepDistance * PITCH_COS - SWEEP_MARGIN);
    const verticalLift = Math.min(sweepDistance * PITCH_SIN, MAX_VERTICAL_LIFT) + Z_LIFT;
    const candidates = this._buildOcclusionCandidates(bottle);
    const extraTarget = this._getOcclusionExtraTarget();
    this._sweepDir.copy(this._smoothedCameraAxis);
    if (this._sweepDir.lengthSq() < 1e-6) this._sweepDir.copy(preferred);
    this._sweepDir.normalize();

    // Build sorted candidate list — preferred direction first, then
    // increasing angular deviation.  Iterate and pick the first that
    // raycast-clears.  This visits at most SWEEP_SAMPLES directions
    // and short-circuits on the first hit (typically the preferred).
    const samples = [];
    for (let i = 0; i < SWEEP_SAMPLES; i++) {
      const angle = (i / SWEEP_SAMPLES) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
      samples.push({ dir, score: preferred.dot(dir) });
    }
    samples.sort((a, b) => b.score - a.score);

    let best = null;
    for (const s of samples) {
      const bottleVis = this._scoreSightline(labelPos, s.dir, horizontalReach, verticalLift, candidates);
      this._sweepCamPos2.copy(this._sweepCamPos);

      const nextClear = extraTarget
        ? this._isSightlineClearFromPositionCandidates(extraTarget, this._sweepCamPos2, candidates)
        : true;
      const nextClearance = extraTarget
        ? this._calcSightlineClearanceCandidates(extraTarget, this._sweepCamPos2, candidates)
        : Number.MAX_VALUE;
      const continuity = Math.max(0, this._sweepDir.dot(s.dir));

      const cand = {
        dir: s.dir,
        preferredScore: s.score,
        bottleClear: bottleVis.clear,
        bottleClearance: bottleVis.clearance,
        nextClear,
        nextClearance,
        continuity,
      };

      if (!best) {
        best = cand;
        continue;
      }

      // Lexicographic ordering matching PLAN_v2 weights:
      // 1) bottle clear (1.0), 2) next clear (0.35), 3) continuity (0.15), 4) preferred.
      if (cand.bottleClear !== best.bottleClear) {
        if (cand.bottleClear) best = cand;
        continue;
      }
      if (cand.bottleClear) {
        if (cand.nextClear !== best.nextClear) {
          if (cand.nextClear) best = cand;
          continue;
        }
        if (cand.continuity > best.continuity + 1e-4) {
          best = cand;
          continue;
        }
        if (Math.abs(cand.continuity - best.continuity) <= 1e-4 && cand.preferredScore > best.preferredScore) {
          best = cand;
        }
        continue;
      }

      // Boxed-in fallback: maximize clearance (keep blocker far from camera).
      if (cand.bottleClearance > best.bottleClearance + 1e-4) {
        best = cand;
        continue;
      }
      if (Math.abs(cand.bottleClearance - best.bottleClearance) <= 1e-4) {
        if (cand.nextClearance > best.nextClearance + 1e-4) {
          best = cand;
          continue;
        }
        if (Math.abs(cand.nextClearance - best.nextClearance) <= 1e-4 && cand.preferredScore > best.preferredScore) {
          best = cand;
        }
      }
    }

    if (best) {
      this._targetCameraAxis.copy(best.dir);
    } else {
      this._targetCameraAxis.copy(preferred);
    }
  }

  _scoreSightline(labelPos, dir, horizontalReach, verticalLift, candidates) {
    this._sweepCamPos
      .copy(labelPos)
      .addScaledVector(dir, horizontalReach);
    this._sweepCamPos.z += verticalLift;

    this._sweepViewDir.subVectors(labelPos, this._sweepCamPos);
    const sightDistance = this._sweepViewDir.length();
    if (sightDistance <= LABEL_HIT_CLEARANCE) {
      return { clear: true, clearance: sightDistance };
    }
    this._sweepViewDir.multiplyScalar(1 / sightDistance);

    this._sweepRight.set(-dir.y, dir.x, 0);
    if (this._sweepRight.lengthSq() < 1e-6) this._sweepRight.set(1, 0, 0);
    this._sweepRight.normalize();

    const offsets = [
      [0, 0],
      [LABEL_VIS_HALF_WIDTH, 0],
      [-LABEL_VIS_HALF_WIDTH, 0],
      [0, LABEL_VIS_HALF_HEIGHT],
      [0, -LABEL_VIS_HALF_HEIGHT],
    ];

    let minClearance = Infinity;
    for (const offset of offsets) {
      this._sweepTarget
        .copy(labelPos)
        .addScaledVector(this._sweepRight, offset[0]);
      this._sweepTarget.z += offset[1];

      this._sweepViewDir.subVectors(this._sweepTarget, this._sweepCamPos);
      const rayDistance = this._sweepViewDir.length();
      if (rayDistance <= LABEL_HIT_CLEARANCE) continue;
      this._sweepViewDir.multiplyScalar(1 / rayDistance);
      this._raycaster.far = Math.max(0.001, rayDistance - LABEL_HIT_CLEARANCE);
      this._raycaster.set(this._sweepCamPos, this._sweepViewDir);
      const hits = this._raycaster.intersectObjects(candidates, true);
      if (hits.length > 0) {
        minClearance = Math.min(minClearance, hits[0].distance);
      }
    }

    return {
      clear: minClearance === Infinity,
      clearance: minClearance === Infinity ? Number.MAX_VALUE : minClearance,
    };
  }

  _runOcclusionSolver(dt, anchorPos, cameraPos, bottle, { allowOrbit = true } = {}) {
    if (!this.scene) return;
    if (!anchorPos || !cameraPos) return;
    if (!this._raycaster) {
      this._raycaster = new THREE.Raycaster();
      this._raycaster.near = 0.001;
    }
    if (this.scene.updateMatrixWorld) {
      this.scene.updateMatrixWorld(true);
    }

    const candidates = this._buildOcclusionCandidates(bottle);
    if (candidates.length === 0) {
      this._restoreFadedMesh();
      this._clampedFrames = 0;
      return;
    }

    const extraTarget = this._getOcclusionExtraTarget();
    const clearBottle = this._isSightlineClearFromPositionCandidates(anchorPos, cameraPos, candidates);
    const clearExtra = extraTarget
      ? this._isSightlineClearFromPositionCandidates(extraTarget, cameraPos, candidates)
      : true;
    if (clearBottle && clearExtra) {
      this._restoreFadedMesh();
      this._clampedFrames = 0;
      return;
    }

    // [Stage A] Orbit immediately toward a clear axis.
    if (allowOrbit && bottle) {
      this._refreshTargetCameraAxis(bottle);
      this._smoothedCameraAxis.lerp(this._targetCameraAxis, SNAP_DAMPING).normalize();
      this._orbitSnapFramesLeft = MAX_SNAP_FRAMES;

      // Nudge the camera toward the new axis this frame (no hard snap).
      this._sweepCamPos
        .copy(anchorPos)
        .addScaledVector(this._smoothedCameraAxis, this._curDistance * PITCH_COS);
      const verticalLift = Math.min(this._curDistance * PITCH_SIN, MAX_VERTICAL_LIFT);
      this._sweepCamPos.z += verticalLift + Z_LIFT;
      cameraPos.lerp(this._sweepCamPos, 0.75);
    }

    // [Stage B] Clamp camera in front of the first hit along anchor->camera.
    this._sweepViewDir.subVectors(cameraPos, anchorPos);
    const maxDist = this._sweepViewDir.length();
    if (maxDist <= 1e-4) return;
    this._sweepViewDir.multiplyScalar(1 / maxDist);

    const hit = this._raycastAgainstOccluders(anchorPos, this._sweepViewDir, maxDist, candidates);
    let dSafe = maxDist;
    if (hit) {
      dSafe = Math.max(MIN_ANCHOR_DIST, hit.distance - CAMERA_MARGIN);
    }
    cameraPos.copy(anchorPos).addScaledVector(this._sweepViewDir, dSafe);

    const clamped = !!hit && dSafe < (maxDist - 1e-4);
    this.lastOccluders = hit
      ? [{ name: (hit.object && hit.object.name) || '(unnamed)', distance: hit.distance }]
      : [];

    // [Stage C] Fade only when boxed-in or uncomfortably close.
    if (hit && dSafe < COMFORT_DIST) {
      this._applyStageCFade(hit, maxDist);
    } else {
      this._restoreFadedMesh();
    }

    // LOCKED/CINEMATIC_CUT integration: keep intent unless clamped for too long.
    if (
      this.state === CAMERA_STATE.FLIP &&
      !allowOrbit &&
      this.flipMode !== FLIP_MODE.FOLLOW &&
      clamped
    ) {
      this._clampedFrames += 1;
      if (this._clampedFrames > MAX_CLAMPED_FRAMES) {
        this.flipMode = FLIP_MODE.FOLLOW;
        this._tarDistance = FLIP_FOLLOW_DISTANCE;
        this._tarFov = FLIP_FOLLOW_FOV;
        this._tarZoom = FLIP_FOLLOW_ZOOM;
        this._refreshTargetCameraAxis(bottle);
        this._smoothedCameraAxis.copy(this._targetCameraAxis);
        this._continuousSweepElapsed = 0;
        this._clampedFrames = 0;
      }
    } else if (!clamped) {
      this._clampedFrames = 0;
    }
  }

  _raycastAgainstOccluders(origin, dir, maxDist, candidates) {
    if (!this._raycaster) return null;
    this._raycaster.far = Math.max(0.001, maxDist);
    this._raycaster.set(origin, dir);
    const hits = this._raycaster.intersectObjects(candidates, true);
    return hits && hits.length ? hits[0] : null;
  }

  _isSightlineClearFromPositionCandidates(targetPos, cameraPos, candidates) {
    if (!candidates || candidates.length === 0) return true;

    this._sweepViewDir.subVectors(targetPos, cameraPos);
    const baseDistance = this._sweepViewDir.length();
    if (baseDistance <= LABEL_HIT_CLEARANCE) return true;
    this._sweepViewDir.multiplyScalar(1 / baseDistance);

    this._sweepRight.crossVectors(this._worldUp, this._sweepViewDir);
    if (this._sweepRight.lengthSq() < 1e-6) this._sweepRight.set(1, 0, 0);
    this._sweepRight.normalize();

    const offsets = [
      [0, 0],
      [LABEL_VIS_HALF_WIDTH, 0],
      [-LABEL_VIS_HALF_WIDTH, 0],
      [0, LABEL_VIS_HALF_HEIGHT],
      [0, -LABEL_VIS_HALF_HEIGHT],
    ];

    for (const offset of offsets) {
      this._sweepTarget.copy(targetPos).addScaledVector(this._sweepRight, offset[0]);
      this._sweepTarget.z += offset[1];
      this._sweepViewDir.subVectors(this._sweepTarget, cameraPos);
      const rayDistance = this._sweepViewDir.length();
      if (rayDistance <= LABEL_HIT_CLEARANCE) continue;
      this._sweepViewDir.multiplyScalar(1 / rayDistance);
      this._raycaster.far = Math.max(0.001, rayDistance - LABEL_HIT_CLEARANCE);
      this._raycaster.set(cameraPos, this._sweepViewDir);
      const hits = this._raycaster.intersectObjects(candidates, true);
      if (hits.length > 0) return false;
    }
    return true;
  }

  _calcSightlineClearanceCandidates(targetPos, cameraPos, candidates) {
    if (!candidates || candidates.length === 0) return Number.MAX_VALUE;
    this._sweepViewDir.subVectors(targetPos, cameraPos);
    const dist = this._sweepViewDir.length();
    if (dist <= LABEL_HIT_CLEARANCE) return Number.MAX_VALUE;
    this._sweepViewDir.multiplyScalar(1 / dist);
    this._raycaster.far = Math.max(0.001, dist - LABEL_HIT_CLEARANCE);
    this._raycaster.set(cameraPos, this._sweepViewDir);
    const hits = this._raycaster.intersectObjects(candidates, true);
    return hits.length ? hits[0].distance : Number.MAX_VALUE;
  }

  _isPosterLikeMesh(mesh) {
    if (!mesh || !mesh.material) return false;
    if (mesh.geometry && (mesh.geometry.type === 'PlaneGeometry' || mesh.geometry.type === 'PlaneBufferGeometry')) {
      return true;
    }
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return mats.some(m => m && m.map && (m.transparent || (m.alphaTest && m.alphaTest > 0)));
  }

  _applyStageCFade(hit, maxDist) {
    const mesh = hit ? this._findFadeMesh(hit.object) : null;
    if (!mesh) {
      this._restoreFadedMesh();
      return;
    }

    const base = this._getFadeBase(mesh);
    const baseOpacity = base[0] ? base[0].opacity : 1;
    const cameraToBlocker = Math.max(0, maxDist - hit.distance);

    let alpha = baseOpacity;
    if (this._isPosterLikeMesh(mesh)) {
      alpha = 0.0;
    } else {
      const farAlpha = Math.min(baseOpacity, STAGEC_WALL_ALPHA);
      const t = Math.max(
        0,
        Math.min(1, (cameraToBlocker - STAGEC_NEAR_FADE_START) / STAGEC_NEAR_FADE_RANGE)
      );
      alpha = farAlpha * t;
    }

    this._fadeMesh(mesh, alpha, base);
  }

  _getFadeBase(mesh) {
    const existing = this._fadeBase.get(mesh);
    if (existing) return existing;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const base = mats.map(m => ({
      transparent: !!m.transparent,
      opacity: (m.opacity === undefined ? 1 : m.opacity),
      depthWrite: (m.depthWrite === undefined ? true : m.depthWrite),
    }));
    this._fadeBase.set(mesh, base);
    return base;
  }

  _fadeMesh(mesh, alpha, base = null) {
    if (!mesh) return;
    if (this._fadedMesh && this._fadedMesh !== mesh) {
      this._restoreFadedMesh();
    }
    const b = base || this._getFadeBase(mesh);
    this._fadedMesh = mesh;
    this._fadeAlpha = alpha;
    this._applyOccluderMaterial(mesh, alpha, b);
  }

  _restoreFadedMesh() {
    if (!this._fadedMesh) return;
    const mesh = this._fadedMesh;
    const base = this._fadeBase.get(mesh);
    if (base) {
      const baseOpacity = base[0] ? base[0].opacity : 1;
      this._applyOccluderMaterial(mesh, baseOpacity, base, true);
    }
    this._fadedMesh = null;
    this._fadeAlpha = 1;
  }

  _findFadeMesh(obj) {
    // Prefer meshes explicitly tagged as camera occluders (restaurant GLB),
    // otherwise allow any mesh under an occluder root (so PB_ poster/signage
    // meshes also fade when they block the shot).
    let cur = obj;
    let firstMesh = null;
    let underOccluderRoot = false;
    while (cur) {
      if (!firstMesh && cur.isMesh) firstMesh = cur;
      if (cur.isMesh && cur.userData && cur.userData.cameraOccluder) return cur;
      if (cur.userData && cur.userData.cameraOccluderRoot) underOccluderRoot = true;
      cur = cur.parent;
    }
    return underOccluderRoot ? firstMesh : null;
  }

  _applyOccluderMaterial(mesh, alpha, base, forceRestore = false) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      const b = base[i] || base[0] || { transparent: false, opacity: 1, depthWrite: true };
      const wantRestore = forceRestore || alpha >= (b.opacity - 1e-4);

      if (wantRestore) {
        if (m.transparent !== b.transparent) m.transparent = b.transparent;
        if (m.opacity !== b.opacity) m.opacity = b.opacity;
        if (m.depthWrite !== b.depthWrite) m.depthWrite = b.depthWrite;
        continue;
      }

      if (!m.transparent) {
        m.transparent = true;
        m.needsUpdate = true;
      }
      m.opacity = Math.max(0, Math.min(1, alpha));
      m.depthWrite = false;
    }
  }

  _buildOcclusionCandidates(bottle) {
    if (!this.scene) return [];
    const excludeBottle = bottle && bottle.mesh ? bottle.mesh : null;
    return this.scene.children.filter(c => {
      if (!c.visible) return false;
      if (c === this.orthoCamera || c === this.perspectiveCamera) return false;
      if (excludeBottle && c === excludeBottle) return false;
      const t = c.type;
      if (t === 'DirectionalLight' || t === 'HemisphereLight' ||
          t === 'AmbientLight' || t === 'PointLight') return false;
      return true;
    });
  }

  _isCurrentFlipShotClear(labelPos, bottle) {
    if (!this.scene) return true;
    if (this.flipMode === FLIP_MODE.LOCKED) {
      return this._isSightlineClearFromPosition(labelPos, this._lockedCamPos, bottle);
    }
    if (this.flipMode === FLIP_MODE.CINEMATIC_CUT) {
      return this._isSightlineClearFromPosition(labelPos, this._cinematicCamPos, bottle);
    }
    return true;
  }

  _calcSightlineClearance(labelPos, cameraPos, bottle) {
    if (!this.scene) return 0;
    if (!this._raycaster) {
      this._raycaster = new THREE.Raycaster();
      this._raycaster.near = 0.001;
    }
    if (this.scene.updateMatrixWorld) {
      this.scene.updateMatrixWorld(true);
    }
    const candidates = this._buildOcclusionCandidates(bottle);
    if (candidates.length === 0) return Number.MAX_VALUE;

    this._sweepViewDir.subVectors(labelPos, cameraPos);
    const dist = this._sweepViewDir.length();
    if (dist <= LABEL_HIT_CLEARANCE) return Number.MAX_VALUE;
    this._sweepViewDir.multiplyScalar(1 / dist);
    this._raycaster.far = Math.max(0.001, dist - LABEL_HIT_CLEARANCE);
    this._raycaster.set(cameraPos, this._sweepViewDir);
    const hits = this._raycaster.intersectObjects(candidates, true);
    return hits.length ? hits[0].distance : Number.MAX_VALUE;
  }

  _isSightlineClearFromPosition(labelPos, cameraPos, bottle) {
    if (!this.scene) return true;
    if (!this._raycaster) {
      this._raycaster = new THREE.Raycaster();
      this._raycaster.near = 0.001;
    }
    if (this.scene.updateMatrixWorld) {
      this.scene.updateMatrixWorld(true);
    }
    const candidates = this._buildOcclusionCandidates(bottle);
    if (candidates.length === 0) return true;

    this._sweepViewDir.subVectors(labelPos, cameraPos);
    const baseDistance = this._sweepViewDir.length();
    if (baseDistance <= LABEL_HIT_CLEARANCE) return true;
    this._sweepViewDir.multiplyScalar(1 / baseDistance);

    this._sweepRight.crossVectors(this._worldUp, this._sweepViewDir);
    if (this._sweepRight.lengthSq() < 1e-6) this._sweepRight.set(1, 0, 0);
    this._sweepRight.normalize();

    const offsets = [
      [0, 0],
      [LABEL_VIS_HALF_WIDTH, 0],
      [-LABEL_VIS_HALF_WIDTH, 0],
      [0, LABEL_VIS_HALF_HEIGHT],
      [0, -LABEL_VIS_HALF_HEIGHT],
    ];

    for (const offset of offsets) {
      this._sweepTarget.copy(labelPos).addScaledVector(this._sweepRight, offset[0]);
      this._sweepTarget.z += offset[1];
      this._sweepViewDir.subVectors(this._sweepTarget, cameraPos);
      const rayDistance = this._sweepViewDir.length();
      if (rayDistance <= LABEL_HIT_CLEARANCE) continue;
      this._sweepViewDir.multiplyScalar(1 / rayDistance);
      this._raycaster.far = Math.max(0.001, rayDistance - LABEL_HIT_CLEARANCE);
      this._raycaster.set(cameraPos, this._sweepViewDir);
      const hits = this._raycaster.intersectObjects(candidates, true);
      if (hits.length > 0) {
        return false;
      }
    }
    return true;
  }

  // ---- Back-compat shim for legacy GameController call sites ----------
  // The old API exposed these three methods; keep them so the existing
  // call sites in GameController.js work without a wholesale refactor.
  startFlipTracking(bottleMesh, landingPos) {
    // bottleMesh.parent (entity Bottle.js) holds the label getters; the
    // controller signature changed to accept the entity, but we accept
    // either for safety.
    this.setStateFlip(bottleMesh, landingPos);
  }
  stopFlipTracking() {
    this.setStateLanding();
    this.setStateIdle();
  }
}

// Re-export tunables so tests can assert against them.
export const _internals = {
  IDLE_DISTANCE,
  CHARGE_DISTANCE,
  MAX_CAMERA_DISTANCE,
  MAX_VERTICAL_LIFT,
  IDLE_FOV,
  CHARGE_FOV,
  MAX_PERSP_FOV,
  IDLE_ZOOM,
  CHARGE_ZOOM,
  MIN_ORTHO_ZOOM,
  BREATHE_PERIOD_S,
  BREATHE_AMPLITUDE,
  FAILED_FADE_ALPHA,
  FAILED_GREY_WEIGHT,
  FAILED_LIGHT_SCALE,
  Z_LIFT,
  PITCH_ANGLE,
  MIN_ANCHOR_DIST,
  CAMERA_MARGIN,
  COMFORT_DIST,
  SNAP_DAMPING,
  MAX_SNAP_FRAMES,
  MAX_CLAMPED_FRAMES,
  NEXT_TARGET_WEIGHT,
  CONTINUITY_WEIGHT,
  ALL_FLIP_MODES,
};
