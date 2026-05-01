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
const MAX_PERSP_FOV = 52;

// Orthographic zoom (THREE camera.zoom). Smaller = wider FOV.
// MIN_ORTHO_ZOOM ensures the label band always renders at >= ~15%
// of screen height regardless of which state we're in.
const IDLE_ZOOM = 1.4;
const CHARGE_ZOOM = 1.10;
const FLIP_FOLLOW_ZOOM = 1.20;
const FLIP_LOCKED_ZOOM = 1.4;
const MIN_ORTHO_ZOOM = 1.05;

// Breathing-zoom oscillation (idle only).
const BREATHE_PERIOD_S = 6.0;
const BREATHE_AMPLITUDE = 0.05; // ±5% on distance + zoom

// Pitch: a shoulder-level *feel* without an actual horizontal sightline.
// A truly horizontal camera at label-height runs into restaurant walls,
// chairs, and far tables — anything in the line between the camera and
// the bottle obstructs the shot. We tilt the camera DOWN by the active
// pitch, which keeps the bottle's vertical silhouette near label height
// in the frame while moving the camera up-and-back so its sightline
// clears the surrounding props. The label still appears at the center
// of the frame because we lookAt the label position; the pitch only
// affects the camera's elevation.
//
// Three pitch tiers — the sweep escalates through them when the
// preferred horizontal axis is wall-bound. Tier 0 is the cinematic
// shoulder shot; tier 1 leans the camera over chairs/short walls;
// tier 2 is a near-overhead diagonal that clears the tall brick
// walls along the restaurant perimeter. Whatever tier wins, the
// camera lookAts the label so the bottle stays centered.
const PITCH_TIERS = [
  (36 * Math.PI) / 180,
  (52 * Math.PI) / 180,
  (68 * Math.PI) / 180,
];
const PITCH_ANGLE = PITCH_TIERS[0];
// Hard cap on lift used by the smoothed/idealPosition path — kept
// loose so the highest pitch tier can actually clear ceiling-level
// brick walls. The runtime still clamps to the pitch-tier-specific
// lift so the cinematic shot never ramps up to overhead.
const MAX_VERTICAL_LIFT_PER_TIER = [2.6, 4.2, 5.6];
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

// Damping for the ortho ↔ persp projection-matrix lerp. Lower than the
// state damping on purpose — the transition needs to feel like a slow
// dolly-zoom, not a state change. 1.6 gives ~95% in 1.9 s, which is the
// sweet spot where the user no longer perceives "two camera modes" but
// also doesn't notice the transition starting/ending. Bumping above ~3
// re-introduces the brutal-feeling snap; below ~1.0 it drags so long
// that the next flip can interrupt mid-blend.
const PROJECTION_BLEND_DAMPING = 1.6;

// Camera-axis collision sweep. Number of horizontal directions sampled
// around the bottle when the preferred -travelAxis is occluded.
const SWEEP_SAMPLES = 24;
// Margin under MAX_CAMERA_DISTANCE for the collision raycast — gives
// the camera a small buffer so it isn't kissing the wall.
const SWEEP_MARGIN = 0.4;
// Minimum distance the sample camera position must keep from any
// occluder bbox face. Below this, the sweep treats the position as
// wall-hugged — the direct sightline may be clear but a tall wall fills
// the FOV periphery. The value is tuned for the corner-table cases
// where the camera ends up ~1.4 actual units from the perimeter brick
// wall, with ~0.5 units of slop in the shell-mesh bbox vs. the real
// wall surface — so the constant is set ~2.2 = real-buffer of ~1.7.
const WALL_HUG_MIN_DISTANCE = 2.2;
// Cast a small bundle of rays across the label area. A single center ray
// can report "clear" while a chair/table edge still covers most of the
// artwork on screen.
const LABEL_VIS_HALF_WIDTH = 0.24;
const LABEL_VIS_HALF_HEIGHT = 0.28;
const LABEL_HIT_CLEARANCE = 0.12;

// Occlusion fading: meshes between camera and bottle fade to transparent
// so the player always sees the bottle/label clearly.
const OCCLUDE_FADE_OUT_SPEED = 8.0;   // how fast blockers become transparent
const OCCLUDE_FADE_IN_SPEED = 4.0;    // how fast they restore when no longer blocking
const OCCLUDE_MIN_OPACITY = 0.12;     // ghostly, not invisible
// Proximity fade: walls/geometry closer than this to the camera get faded
// even if they don't block the direct camera→bottle sightline. Catches
// the "camera is inside/behind a wall" case where the wall fills the
// screen without crossing the center ray.
const OCCLUDE_PROXIMITY_RADIUS = 2.2;
// Additional fan rays cast from camera in a cone around the view direction
// to detect walls that fill the screen periphery.
const OCCLUDE_FAN_HALF_ANGLE = 0.5;   // radians, ~29°
const OCCLUDE_FAN_DISTANCE = 6.0;     // how far fan rays extend
// Once a mesh is detected as blocking, keep it in the blocking set for
// at least this many seconds. Prevents flicker from breathing animation
// causing frame-to-frame detection oscillation.
const OCCLUDE_BLOCKING_COOLDOWN = 0.6;
// Only run the full raycast every N frames to keep per-frame cost low.
// The fade animation still runs every frame for smooth visuals.
const OCCLUDE_RAYCAST_INTERVAL = 4;

// Mid-flip behaviour modes. Only FOLLOW is used for all flips since it provides
// the most reliable tracking with active obstacle avoidance.
export const FLIP_MODE = Object.freeze({
  FOLLOW: 'follow',
  LOCKED: 'locked',
});
const ALL_FLIP_MODES = [FLIP_MODE.FOLLOW];

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

  _lookAtTarget = new THREE.Vector3();
  _currentLookAt = new THREE.Vector3();
  _idealPosition = new THREE.Vector3();
  _lookMatrix = new THREE.Matrix4();
  _targetQ = new THREE.Quaternion();

  // Scratch matrix for the per-frame projection-blend lerp. Reused
  // across frames so we don't allocate every render.
  _blendedProjMatrix = new THREE.Matrix4();

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

  // Pitch tier picked by the sweep. Index into PITCH_TIERS — 0 = idle
  // shoulder shot, larger = more overhead. The smoothed value is what
  // the renderer actually uses each frame so the lift transitions
  // visibly rather than snapping when a wall forces tier 2.
  _targetPitchIdx = 0;
  _smoothedPitch = PITCH_TIERS[0];

  // Distance scale (0..1) chosen by the sweep when no axis fits at
  // full distance. 1 = use full distance, < 1 = pull the camera in to
  // avoid wrapping a wall around the FOV.
  _targetDistanceScale = 1;
  _smoothedDistanceScale = 1;

  // Projection blend: 0 = pure ortho, 1 = pure persp. The TARGET flips
  // instantly when setProjection is called; the SMOOTHED value lerps
  // toward the target each frame and drives both the per-frame
  // projection-matrix override and the activeCamera selection.
  _targetProjectionBlend = 0;
  _smoothedProjectionBlend = 0;

  // Reusable raycaster for the collision sweep.
  _raycaster = null;
  // Tmp vec to avoid allocating per ray.
  _sweepDir = new THREE.Vector3();
  _sweepCamPos = new THREE.Vector3();
  _sweepTarget = new THREE.Vector3();
  _sweepRight = new THREE.Vector3();
  _sweepViewDir = new THREE.Vector3();

  // Latest world position of the label, cached from the last update tick
  // so snap() and the test suite can read it without re-walking the
  // bottle's matrix chain.
  _labelPosCache = new THREE.Vector3();

  // Occlusion fading: tracks meshes currently faded and their original
  // opacity so we can restore them when no longer blocking.
  _fadedMeshes = new Map(); // mesh → [{ originalOpacity, originalTransparent }]
  _blockingCooldowns = new Map(); // mesh → seconds remaining
  _occlusionRaycaster = null;
  _occRayDir = new THREE.Vector3();
  _occFrameCounter = 0;
  _occCachedMeshes = null;

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

    // The starting projection (ortho) is also the starting blend value.
    // Setting both target + smoothed avoids a one-shot lerp on first frame.
    this._targetProjectionBlend = (this.projection === PROJECTION.PERSP) ? 1 : 0;
    this._smoothedProjectionBlend = this._targetProjectionBlend;
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

    // UX rule: when we're in perspective projection, keep mid-flip camera in
    // FOLLOW mode only (LOCKED/CINEMATIC read as "broken" with the perspective lens).
    if (this.projection === PROJECTION.PERSP) {
      this.flipMode = FLIP_MODE.FOLLOW;
    } else {
      const idx = Math.floor(this._rand() * ALL_FLIP_MODES.length);
      this.flipMode = ALL_FLIP_MODES[Math.min(ALL_FLIP_MODES.length - 1, idx)];
    }

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

    // Smooth ortho ↔ persp transition. Both cameras stay alive; the
    // renderer keeps using whichever is `activeCamera`. What changes
    // here is the BLEND TARGET — the actual switch (which camera is
    // active and what projection matrix it renders with) is driven
    // by `update()` over ~1.9 s of damping. At swap time we still
    // size-match the bottle on the *incoming* camera so its endpoint
    // visible extent matches the *outgoing* one — combined with the
    // matrix-lerp in update(), the user can't tell two modes exist.
    const dist = Math.max(
      0.5, this.activeCamera.position.distanceTo(this._currentLookAt)
    );
    const orthoFrustumHeight = this.orthoCamera.top - this.orthoCamera.bottom;
    let outgoingExtent;
    if (this.projection === PROJECTION.ORTHO) {
      outgoingExtent = orthoFrustumHeight / Math.max(1e-3, this.orthoCamera.zoom);
    } else {
      outgoingExtent = 2 * dist * Math.tan((this.perspectiveCamera.fov * Math.PI) / 360);
    }

    this.projection = p;
    this._targetProjectionBlend = (p === PROJECTION.PERSP) ? 1 : 0;

    // Pre-set the incoming camera's zoom/FOV so the steady-state image
    // at the END of the lerp matches the steady-state image at the START.
    // The matrix-lerp in update() handles everything BETWEEN those endpoints.
    if (p === PROJECTION.ORTHO) {
      const matchZoom = orthoFrustumHeight / Math.max(0.01, outgoingExtent);
      this._curZoom = Math.max(MIN_ORTHO_ZOOM, matchZoom);
      this.orthoCamera.zoom = this._curZoom;
      this.orthoCamera.updateProjectionMatrix();
    } else {
      const matchFov = (Math.atan(outgoingExtent / (2 * dist)) * 360) / Math.PI;
      this._curFov = Math.min(MAX_PERSP_FOV, Math.max(10, matchFov));
      this.perspectiveCamera.fov = this._curFov;
      this.perspectiveCamera.updateProjectionMatrix();
    }

    // Both cameras need the current pose (the renderer might switch from
    // one to the other during the lerp; if either is stale you get a
    // visible pop at the crossover frame).
    this.orthoCamera.position.copy(this._idealPosition);
    this.perspectiveCamera.position.copy(this._idealPosition);
    this.orthoCamera.up.set(0, 0, 1);
    this.perspectiveCamera.up.set(0, 0, 1);
    this.orthoCamera.lookAt(this._currentLookAt);
    this.perspectiveCamera.lookAt(this._currentLookAt);
    // activeCamera is NOT switched here — update() decides per frame
    // based on the smoothed blend, so the swap happens at blend≈0.5
    // when both cameras would render the same blended matrix anyway.
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
    // 0. Run the obstacle sweep if it's dirty (set on every setTarget).
    //    Done before computing labelPos so the sweep uses the same
    //    label position as the rest of the frame.
    if (this._sweepDirty && bottle) {
      this._refreshTargetCameraAxis(bottle);
      this._sweepDirty = false;
      if (this._sweepSnap) {
        this._smoothedCameraAxis.copy(this._targetCameraAxis);
        this._sweepSnap = false;
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
    // Smooth-rotate the camera axis toward the obstacle-clear target.
    // Bottle visually rotates with this axis (setLabelFaceDirection
    // below) so the user reads it as "the bottle turning to face
    // wherever the camera can see clearly", which is exactly the
    // failure mode they wanted fixed.
    const axisT = 1 - Math.exp(-AXIS_SLERP_DAMPING * dt);
    this._smoothedCameraAxis.lerp(this._targetCameraAxis, axisT).normalize();
    const cameraAxis = this._smoothedCameraAxis;
    if (cameraAxis.lengthSq() < 1e-6) cameraAxis.set(0, -1, 0);

    // Smooth pitch + distance-scale toward whatever tier the sweep chose.
    // Both transitions ride the same axis-slerp damping so they move
    // visibly in lockstep — the camera "lifts up and pulls in" together
    // when a wall forces an overhead shot, then "settles back down" when
    // the next clear axis is found.
    const targetPitch = PITCH_TIERS[
      Math.min(PITCH_TIERS.length - 1, Math.max(0, this._targetPitchIdx))
    ];
    this._smoothedPitch += (targetPitch - this._smoothedPitch) * axisT;
    this._smoothedDistanceScale +=
      (this._targetDistanceScale - this._smoothedDistanceScale) * axisT;
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
      this._lookAtTarget.copy(this._lockedLookAt);
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
    } else if (cameraAxis && cameraAxis.lengthSq() > 0.001) {
      // Camera sits at labelPos + cameraAxis * (distance * cos(pitch))
      //                       + Z       * (distance * sin(pitch)).
      // Pitch and distance-scale both come from the obstacle sweep —
      // when a wall forces the sweep into a higher tier, the camera
      // pulls in (smaller scale) AND tilts overhead (steeper pitch)
      // so the bottle stays clearly framed against the floor instead
      // of a wrap-around brick wall.
      const pitchCos = Math.cos(this._smoothedPitch);
      const pitchSin = Math.sin(this._smoothedPitch);
      const tierIdx = Math.min(
        MAX_VERTICAL_LIFT_PER_TIER.length - 1,
        Math.max(0, Math.round(this._targetPitchIdx))
      );
      const liftCap = MAX_VERTICAL_LIFT_PER_TIER[tierIdx];
      const scaledDist = this._curDistance * this._smoothedDistanceScale;
      this._idealPosition
        .copy(labelPos)
        .addScaledVector(cameraAxis, scaledDist * pitchCos);
      const verticalLift = Math.min(scaledDist * pitchSin, liftCap);
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

    // 7. Occlusion fading: fade meshes that block the camera→bottle sightline.
    this._updateOcclusionFading(dt, labelPos);

    // 8. Score-popup billboarding (preserves original behaviour).
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

  // ---- Occlusion fading -------------------------------------------------
  // Raycasts are expensive (~60ms on 241 meshes) so the detection pass
  // only runs every OCCLUDE_RAYCAST_INTERVAL frames.  The smooth fade
  // animation runs every frame using the last known blocking set.
  _updateOcclusionFading(dt, labelPos) {
    if (!this.scene || !labelPos) return;

    this._occFrameCounter++;
    const runDetection = this._occFrameCounter % OCCLUDE_RAYCAST_INTERVAL === 0;

    // Always tick cooldowns and apply fading (cheap).
    // Only run raycasts on detection frames.
    if (runDetection) {
      if (!this._occlusionRaycaster) {
        this._occlusionRaycaster = new THREE.Raycaster();
        this._occlusionRaycaster.near = 0.05;
      }

      const camPos = this.activeCamera.position;
      this._occRayDir.subVectors(labelPos, camPos);
      const totalDist = this._occRayDir.length();
      if (totalDist < 0.1) { this._applyOcclusionFade(dt); return; }
      this._occRayDir.multiplyScalar(1 / totalDist);

      const up = new THREE.Vector3(0, 0, 1);
      const right = new THREE.Vector3().crossVectors(this._occRayDir, up).normalize();
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      const camUp = new THREE.Vector3().crossVectors(right, this._occRayDir).normalize();
      const tmpDir = new THREE.Vector3();
      const tmpTarget = new THREE.Vector3();

      const meshes = this._getOccluderMeshes();

      // --- A) Sightline rays (3 rays: center + horizontal spread) ---
      const sightOffsets = [[0, 0], [LABEL_VIS_HALF_WIDTH, 0], [-LABEL_VIS_HALF_WIDTH, 0]];
      for (const [rOff, uOff] of sightOffsets) {
        tmpTarget.copy(labelPos).addScaledVector(right, rOff).addScaledVector(camUp, uOff);
        tmpDir.subVectors(tmpTarget, camPos);
        const dist = tmpDir.length();
        if (dist < 0.1) continue;
        tmpDir.multiplyScalar(1 / dist);
        this._occlusionRaycaster.set(camPos, tmpDir);
        this._occlusionRaycaster.far = dist - LABEL_HIT_CLEARANCE;
        const hits = this._occlusionRaycaster.intersectObjects(meshes, false);
        for (const hit of hits) {
          this._blockingCooldowns.set(hit.object, OCCLUDE_BLOCKING_COOLDOWN);
        }
      }

      // --- B) Fan rays (5 directions) ---
      const a = OCCLUDE_FAN_HALF_ANGLE;
      const fanOffsets = [[a, 0], [-a, 0], [0, -a], [0, -a * 1.4], [a * 0.7, -a * 0.7]];
      for (const [rAngle, uAngle] of fanOffsets) {
        tmpDir.copy(this._occRayDir)
          .addScaledVector(right, Math.tan(rAngle))
          .addScaledVector(camUp, Math.tan(uAngle))
          .normalize();
        this._occlusionRaycaster.set(camPos, tmpDir);
        this._occlusionRaycaster.far = OCCLUDE_FAN_DISTANCE;
        const hits = this._occlusionRaycaster.intersectObjects(meshes, false);
        for (const hit of hits) {
          this._blockingCooldowns.set(hit.object, OCCLUDE_BLOCKING_COOLDOWN);
        }
      }

      // --- C) Proximity check ---
      this._collectProximityOccluders(camPos, labelPos, meshes);
    }

    // --- Tick cooldowns → build blocking set ---
    const blockingNow = this._tickCooldowns(dt);

    // --- Apply fading ---
    this._applyOcclusionFade(dt, blockingNow);
  }

  _tickCooldowns(dt) {
    const blockingNow = new Set();
    for (const [mesh, remaining] of this._blockingCooldowns) {
      const left = remaining - dt;
      if (left > 0) {
        this._blockingCooldowns.set(mesh, left);
        blockingNow.add(mesh);
      } else {
        this._blockingCooldowns.delete(mesh);
      }
    }
    return blockingNow;
  }

  _collectProximityOccluders(camPos, labelPos, meshes) {
    const radiusSq = OCCLUDE_PROXIMITY_RADIUS * OCCLUDE_PROXIMITY_RADIUS;
    const camToLabel = new THREE.Vector3().subVectors(labelPos, camPos);
    const camToLabelDist = Math.max(1e-3, camToLabel.length());
    const viewDir = camToLabel.clone().multiplyScalar(1 / camToLabelDist);
    const tmpBox = new THREE.Box3();
    const tmpPoint = new THREE.Vector3();
    const tmpRel = new THREE.Vector3();
    // Reject only when the bbox's CLOSEST point to the camera sits behind
    // the view plane. Big walls (e.g. perimeter brick) have a center that
    // can land behind the camera while the wall surface still wraps the
    // FOV — that case is exactly what the player sees as "wall obstruction"
    // even though no ray crosses the camera→bottle segment. The closest-
    // point test fades them; the dot-product check on the bbox center
    // (the previous rule) skipped them.
    for (let i = 0; i < meshes.length; i++) {
      const node = meshes[i];
      if (!node.visible) continue;
      if (!node.geometry) continue;
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      tmpBox.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);
      tmpBox.clampPoint(camPos, tmpPoint);
      const distSq = tmpPoint.distanceToSquared(camPos);
      if (distSq >= radiusSq) continue;
      tmpRel.subVectors(tmpPoint, camPos);
      // Closest point must be in front of the camera (positive view
      // dot) — strictly behind means the bbox is fully behind, fade
      // is unnecessary. The threshold is slightly negative so meshes
      // straddling the view plane (camera tangent to a wall) still fade.
      if (tmpRel.dot(viewDir) < -OCCLUDE_PROXIMITY_RADIUS * 0.25) continue;
      this._blockingCooldowns.set(node, OCCLUDE_BLOCKING_COOLDOWN);
    }
  }

  _getOccluderMeshes() {
    if (this._occCachedMeshes) return this._occCachedMeshes;
    const meshes = [];
    if (!this.scene) return meshes;
    const _tmpSize = new THREE.Vector3();
    this.scene.traverse(node => {
      if (!node.isMesh || !node.visible) return;
      if (!node.userData || !node.userData.cameraOccluder) return;
      if (node.name && node.name.startsWith('PB_')) return;
      let p = node.parent;
      while (p) { if (p.name && p.name.startsWith('PB_')) return; p = p.parent; }
      if (node.geometry) {
        if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
        const worldBox = new THREE.Box3()
          .copy(node.geometry.boundingBox)
          .applyMatrix4(node.matrixWorld);
        worldBox.getSize(_tmpSize);
        if (_tmpSize.x * _tmpSize.y > 400) return;
      }
      meshes.push(node);
    });
    this._occCachedMeshes = meshes;
    return meshes;
  }

  _applyOcclusionFade(dt, blockingNow) {
    if (!blockingNow) {
      blockingNow = this._tickCooldowns(dt);
    }

    // Fade OUT meshes that are blocking.
    for (const mesh of blockingNow) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (!this._fadedMeshes.has(mesh)) {
        this._fadedMeshes.set(mesh, mats.map(m => ({
          originalOpacity: m.opacity,
          originalTransparent: m.transparent,
        })));
      }
      const fadeT = 1 - Math.exp(-OCCLUDE_FADE_OUT_SPEED * dt);
      for (const m of mats) {
        m.transparent = true;
        m.opacity += (OCCLUDE_MIN_OPACITY - m.opacity) * fadeT;
        m.depthWrite = m.opacity > 0.5;
        m.needsUpdate = true;
      }
    }

    // Fade IN meshes that are no longer blocking.
    for (const [mesh, originals] of this._fadedMeshes) {
      if (blockingNow.has(mesh)) continue;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const fadeT = 1 - Math.exp(-OCCLUDE_FADE_IN_SPEED * dt);
      let allRestored = true;
      for (let i = 0; i < mats.length; i++) {
        const m = mats[i];
        const orig = originals[i] || { originalOpacity: 1, originalTransparent: false };
        m.opacity += (orig.originalOpacity - m.opacity) * fadeT;
        if (Math.abs(m.opacity - orig.originalOpacity) < 0.01) {
          m.opacity = orig.originalOpacity;
          m.transparent = orig.originalTransparent;
          m.depthWrite = true;
        } else {
          allRestored = false;
        }
        m.needsUpdate = true;
      }
      if (allRestored) {
        this._fadedMeshes.delete(mesh);
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
      // Run the sweep immediately and snap to the obstacle-clear axis
      // so the snapped pose matches what the eventual idle update lands on.
      this._refreshTargetCameraAxis(bottle);
      this._smoothedCameraAxis.copy(this._targetCameraAxis);
      this._smoothedPitch = PITCH_TIERS[
        Math.min(PITCH_TIERS.length - 1, Math.max(0, this._targetPitchIdx))
      ];
      this._smoothedDistanceScale = this._targetDistanceScale;
      this._sweepDirty = false;
      const cameraAxis = this._smoothedCameraAxis;
      if (cameraAxis.lengthSq() < 1e-6) cameraAxis.set(0, -1, 0);
      if (bottle.setLabelFaceDirection) {
        bottle.setLabelFaceDirection(cameraAxis, true);
      }
      // Match the lerped update path's pitch math so snap() lands at
      // the same pose as the eventual idle steady state.
      const pitchCos = Math.cos(this._smoothedPitch);
      const pitchSin = Math.sin(this._smoothedPitch);
      const tierIdx = Math.min(
        MAX_VERTICAL_LIFT_PER_TIER.length - 1,
        Math.max(0, Math.round(this._targetPitchIdx))
      );
      const liftCap = MAX_VERTICAL_LIFT_PER_TIER[tierIdx];
      const scaledDist = this._curDistance * this._smoothedDistanceScale;
      this._idealPosition
        .copy(labelPos)
        .addScaledVector(cameraAxis, scaledDist * pitchCos);
      const verticalLift = Math.min(scaledDist * pitchSin, liftCap);
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
  // Sample SWEEP_SAMPLES horizontal directions around the bottle and try
  // increasingly steep pitch tiers (shoulder → tilted → near-overhead).
  // Pick the lowest-pitch / most-preferred-direction combo that produces
  // a clear sightline AND doesn't have a wall hugging the camera body.
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
      this._targetPitchIdx = 0;
      this._targetDistanceScale = 1;
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

    // Build the candidate excludelist: the bottle's whole subtree, the
    // camera and overlay quads, and the lights (Object3D leaves).
    const excludeBottle = bottle.mesh || null;
    const candidates = this.scene.children.filter(c => {
      if (!c.visible) return false;
      if (c === this.orthoCamera || c === this.perspectiveCamera) return false;
      if (excludeBottle && c === excludeBottle) return false;
      // Skip pure non-visual nodes (lights, helpers, the gameOverText group, etc).
      // Heuristic: keep Mesh + Group + Object3D (which can contain meshes).
      const t = c.type;
      if (t === 'DirectionalLight' || t === 'HemisphereLight' ||
          t === 'AmbientLight' || t === 'PointLight') return false;
      return true;
    });

    // Sort directions by alignment with the preferred axis. Same list is
    // reused across all pitch tiers — the only thing that changes per
    // tier is the pitch / lift / horizontal reach.
    const samples = [];
    for (let i = 0; i < SWEEP_SAMPLES; i++) {
      const angle = (i / SWEEP_SAMPLES) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
      samples.push({ dir, score: preferred.dot(dir) });
    }
    samples.sort((a, b) => b.score - a.score);

    let chosen = null;
    let fallback = null;
    for (let tier = 0; tier < PITCH_TIERS.length; tier++) {
      const pitch = PITCH_TIERS[tier];
      const liftCap = MAX_VERTICAL_LIFT_PER_TIER[tier];
      const horizontalReach = Math.max(0.1, sweepDistance * Math.cos(pitch) - SWEEP_MARGIN);
      const verticalLift = Math.min(sweepDistance * Math.sin(pitch), liftCap) + Z_LIFT;

      for (const s of samples) {
        const visibility = this._scoreSightline(labelPos, s.dir, horizontalReach, verticalLift, candidates);
        // Also require the camera body itself isn't right next to a wall —
        // this catches the "brick wall fills the perimeter" case where the
        // direct sightline is clear but a tall wall hugs the FOV edge.
        if (visibility.clear) {
          const wallProx = this._wallProximity(this._sweepCamPos, candidates);
          if (wallProx >= WALL_HUG_MIN_DISTANCE) {
            chosen = { dir: s.dir, tier, distScale: 1 };
            break;
          }
          if (
            !fallback ||
            wallProx > fallback.proximity + 1e-4 ||
            (Math.abs(wallProx - fallback.proximity) <= 1e-4 && s.score > fallback.score)
          ) {
            fallback = {
              dir: s.dir, tier, score: s.score,
              clearance: visibility.clearance, proximity: wallProx,
              distScale: Math.min(1, Math.max(0.55, wallProx / WALL_HUG_MIN_DISTANCE)),
            };
          }
          continue;
        }
        if (
          !fallback ||
          visibility.clearance > fallback.clearance + 1e-4 ||
          (Math.abs(visibility.clearance - fallback.clearance) <= 1e-4 && s.score > fallback.score)
        ) {
          fallback = {
            dir: s.dir, tier, score: s.score,
            clearance: visibility.clearance, proximity: 0,
            distScale: Math.min(1, Math.max(0.55, visibility.clearance / horizontalReach)),
          };
        }
      }
      if (chosen) break;
    }

    if (chosen) {
      this._targetCameraAxis.copy(chosen.dir);
      this._targetPitchIdx = chosen.tier;
      this._targetDistanceScale = chosen.distScale;
    } else if (fallback) {
      this._targetCameraAxis.copy(fallback.dir);
      this._targetPitchIdx = fallback.tier;
      this._targetDistanceScale = fallback.distScale;
    } else {
      this._targetCameraAxis.copy(preferred);
      this._targetPitchIdx = PITCH_TIERS.length - 1;
      this._targetDistanceScale = 0.7;
    }
  }

  // Distance from `pos` to the nearest occluder bbox surface. Used by the
  // sweep to reject sample camera positions that have a wall pressed up
  // against them — those positions yield a "clear" raycast but still wrap
  // a wall around the FOV. Walks the scene-level candidate list (groups +
  // meshes) shallowly: a pre-computed worldBox per group is approximated
  // by traversing leaf meshes' bounding boxes.
  _wallProximity(pos, candidates) {
    if (!this._wallProxBox) this._wallProxBox = new THREE.Box3();
    if (!this._wallProxClamp) this._wallProxClamp = new THREE.Vector3();
    if (!this._wallProxState) this._wallProxState = { minDist: 0, pos: null };
    this._wallProxState.minDist = WALL_HUG_MIN_DISTANCE * 2;
    this._wallProxState.pos = pos;
    for (let i = 0; i < candidates.length; i++) {
      const root = candidates[i];
      if (!root.traverse) continue;
      root.traverse(this._wallProxVisitor);
      if (this._wallProxState.minDist <= 0.01) break;
    }
    return this._wallProxState.minDist;
  }

  // Pre-bound visitor for _wallProximity — declared as a property so the
  // inner closure isn't recreated each sweep call (and so the lint rule
  // about closures-in-loops is satisfied). Only TALL geometry counts —
  // chairs and table tops are below the camera and won't dominate the
  // FOV; walls extend to ceiling height and DO wrap the perimeter.
  _wallProxVisitor = (node) => {
    if (!node.isMesh || !node.visible) return;
    if (!node.geometry) return;
    if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    this._wallProxBox.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);
    // Skip floor-level props: if the bbox top is below the camera height,
    // the mesh appears as a foreground floor element rather than a wall
    // wrapping the FOV. Chairs/tables fail this; walls pass.
    const pos = this._wallProxState.pos;
    const box = this._wallProxBox;
    if (box.max.z < pos.z - 0.4) return;
    // The restaurant model has a "shell" mesh whose bbox encloses the
    // entire interior — the camera is INSIDE that bbox, so clampPoint
    // would return distance 0 even though the wall surface is several
    // units away. Detect inside-bbox and compute distance to the
    // nearest face instead. Outside-bbox uses the standard
    // clampPoint Euclidean distance.
    const inside = (
      pos.x >= box.min.x && pos.x <= box.max.x &&
      pos.y >= box.min.y && pos.y <= box.max.y &&
      pos.z >= box.min.z && pos.z <= box.max.z
    );
    let d;
    if (inside) {
      // Lateral distance to nearest wall face only — vertical
      // distance to floor/ceiling isn't a "wall hug", it's just
      // headroom, so the Z faces are excluded here.
      d = Math.min(
        pos.x - box.min.x, box.max.x - pos.x,
        pos.y - box.min.y, box.max.y - pos.y
      );
    } else {
      box.clampPoint(pos, this._wallProxClamp);
      d = this._wallProxClamp.distanceTo(pos);
    }
    if (d < this._wallProxState.minDist) this._wallProxState.minDist = d;
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
  FLIP_FOLLOW_DISTANCE,
  FLIP_LOCKED_DISTANCE,
  FLIP_FOLLOW_FOV,
  FLIP_LOCKED_FOV,
  FLIP_FOLLOW_ZOOM,
  FLIP_LOCKED_ZOOM,
  ALL_FLIP_MODES,
};
