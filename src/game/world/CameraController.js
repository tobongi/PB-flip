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
const FLIP_LOCKED_FOV = 35;
const FLIP_CINEMATIC_FOV = 28;
const MAX_PERSP_FOV = 52;

// Orthographic zoom (THREE camera.zoom). Smaller = wider FOV.
// MIN_ORTHO_ZOOM ensures the label band always renders at >= ~15%
// of screen height regardless of which state we're in.
const IDLE_ZOOM = 1.4;
const CHARGE_ZOOM = 1.10;
const FLIP_FOLLOW_ZOOM = 1.20;
const FLIP_LOCKED_ZOOM = 1.4;
const FLIP_CINEMATIC_ZOOM = 1.55;
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

  // FLIP_MODE.CINEMATIC_CUT records a perpendicular side-on pose.
  _cinematicCamPos = new THREE.Vector3();
  _cinematicLookAt = new THREE.Vector3();

  _lookAtTarget = new THREE.Vector3();
  _currentLookAt = new THREE.Vector3();
  _idealPosition = new THREE.Vector3();
  _lookMatrix = new THREE.Matrix4();
  _targetQ = new THREE.Quaternion();

  _trackBottle = null;
  _trackLanding = null;
  _flipStartLabelPos = new THREE.Vector3();

  // Block-travel axis: unit vector from currentBlock toward nextBlock,
  // ground-projected. The camera sits on the OPPOSITE side of this axis
  // (i.e. behind the bottle relative to the upcoming flip), which is
  // always a clear sightline because the gameplay path is laid out
  // along these axes. Defaults to +Y (typical first-block direction).
  _travelAxis = new THREE.Vector3(0, 1, 0);

  // Latest world position of the label, cached from the last update tick
  // so snap() and the test suite can read it without re-walking the
  // bottle's matrix chain.
  _labelPosCache = new THREE.Vector3();

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
      this._lockedLookAt.copy(this._currentLookAt);
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
      this._cinematicCamPos.copy(start).add(perp);
      this._cinematicCamPos.z += Z_LIFT + 0.4; // slight high-angle for cinema feel
      this._cinematicLookAt.copy(start).lerp(end, 0.5);
      // Snap camera to cinematic pose immediately — this is the "cut".
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
    }

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

  // ---- frame update ----------------------------------------------------
  update(dt, bottle) {
    this.elapsed += dt;

    // 1. Where IS the label, in world space?  Falls back to lookAtTarget
    //    if the bottle isn't attached (e.g. between rounds). The CAMERA
    //    AXIS is the negated travel direction (away from the next block),
    //    so the camera always sits in a clean sightline regardless of
    //    where the bottle's body has settled. The bottle's inner mesh
    //    is then yawed via setLabelFaceDirection so the label artwork
    //    keeps facing the camera — that's how we deliver "always tracking
    //    the label" without ending up clipped into restaurant walls.
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
    // Negate travelAxis to get the direction FROM bottle TO camera.
    const cameraAxis = this._travelAxis.clone().negate();
    if (cameraAxis.lengthSq() < 1e-6) cameraAxis.set(0, -1, 0);
    // Force the bottle's inner-mesh yaw to face the camera. Skipped
    // mid-flip — the bottle should be free to spin in the air.
    if (
      bottle && bottle.setLabelFaceDirection &&
      this.state !== CAMERA_STATE.FLIP
    ) {
      bottle.setLabelFaceDirection(cameraAxis, true);
    }

    // 2. Decide where the camera SHOULD look.
    if (this.state === CAMERA_STATE.FLIP && this.flipMode === FLIP_MODE.LOCKED) {
      this._lookAtTarget.copy(this._lockedLookAt);
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
      this._lookAtTarget.copy(labelPos);
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
      // Slow push-in along the cinematic axis as the flip progresses.
      const dir = new THREE.Vector3().subVectors(this._cinematicCamPos, this._cinematicLookAt).normalize();
      this._idealPosition.copy(this._cinematicLookAt).add(dir.multiplyScalar(this._curDistance));
    } else if (cameraAxis && cameraAxis.lengthSq() > 0.001) {
      // Camera sits at labelPos + cameraAxis * (distance * cos(pitch))
      //                       + Z       * (distance * sin(pitch)).
      // The horizontal pull-back × cos keeps the on-screen distance the
      // same as a non-pitched setup; the vertical lift × sin clears the
      // restaurant clutter — but is hard-capped at MAX_VERTICAL_LIFT
      // so we don't punch through the ceiling at extreme distances.
      this._idealPosition
        .copy(labelPos)
        .addScaledVector(cameraAxis, this._curDistance * PITCH_COS);
      const verticalLift = Math.min(this._curDistance * PITCH_SIN, MAX_VERTICAL_LIFT);
      this._idealPosition.z += verticalLift + Z_LIFT;
    } else {
      // No bottle — fall back to a fixed offset behind/above the lookAt.
      this._idealPosition
        .copy(this._currentLookAt)
        .add(new THREE.Vector3(this._curDistance * 0.7, -this._curDistance * 0.7, this._curDistance * 0.5));
    }

    this.activeCamera.position.lerp(this._idealPosition, t);

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
      this._lookAtTarget.copy(labelPos);
      this._currentLookAt.copy(labelPos);
      const cameraAxis = this._travelAxis.clone().negate();
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
  ALL_FLIP_MODES,
};
