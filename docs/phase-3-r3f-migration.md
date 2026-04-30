# Phase 3 — React Three Fiber migration

**Complexity:** 9/10. Tight RAF + cannon physics coupling, plus a
React 16 / three 0.89 / webpack 3 stack that R3F cannot run on directly.

**Estimated calendar time:** 6–8 weeks of focused work, broken into
the three sub-phases below. Each sub-phase is independently shippable —
the game keeps running through every step.

---

## Why R3F

The current `GameController` is ~1000 lines of imperative three.js
construction tightly bound to a single `requestAnimationFrame` loop
that drives both rendering and cannon physics. That works, but it
makes:

- Component reuse hard (every entity is wired by hand into the scene).
- Hot-reload impossible without losing physics state.
- Testing painful — there's no scene description, only side effects.
- Onboarding slow — no "where is the bottle defined" answer that
  doesn't require reading 500 lines of `new THREE.Mesh(...)` calls.

R3F gives us declarative scene description, suspense for asset loading,
and a community ecosystem (`@react-three/cannon`, `@react-three/drei`,
`@react-three/postprocessing`).

---

## Hard prerequisites — why we can't `npm install` R3F today

| Constraint | Today | Required for R3F 6+ | Required for R3F 8+ |
| --- | --- | --- | --- |
| React | 16.14 | ≥17.0 | ≥18.0 |
| three.js | 0.89 (2017) | ≥0.126 | ≥0.137 |
| Bundler | webpack 3 | webpack 5 strongly recommended | webpack 5 / Vite |
| Module format | mostly ESM-via-Babel | full ESM-aware bundler | ESM-only |

The framer-motion alias-to-CJS hack in `config/webpack.config.dev.js`
is a clue: webpack 3 **cannot** interop modern ESM packages cleanly.
R3F ships ESM-first with deep `import`s into `three/src/...` paths
that webpack 3's resolver mishandles.

The three 0.89 → 0.155 jump is also non-trivial. Breaking changes
that touch this codebase:

- `Geometry` removed (we use `LatheGeometry`, `CylinderGeometry`, etc. —
  these now return `BufferGeometry` only; `applyMatrix(mat)` becomes
  `applyMatrix4(mat)`).
- `Box3.getSize()` requires an out-target argument.
- `WebGLRenderer.setPixelRatio` semantics changed for retina displays.
- GLTFLoader API moved to `three/examples/jsm/loaders/GLTFLoader.js`
  (the project uses a hand-rolled loader at `src/gltfLoader.js`).
- Lighting model (PBR) defaults changed; existing materials may need
  re-tuning.

---

## Migration roadmap

### Sub-phase 3a — Foundation (LANDED in this commit)

Status: ✅ shipped.

- `src/r3f/sceneDSL.js` — declarative scene description format that
  builds vanilla three.js objects today and maps 1:1 onto R3F JSX.
- `src/r3f/bottleCapStack.js` — proof of decomposition. The cap +
  threads + dispenser stack from `Bottle.js` extracted into a
  declarative node tree. Visual output verified byte-identical to
  the original.
- `src/r3f/r3fAdapter.js` — commented-out JSX implementation that
  consumes the same node format. Becomes live in sub-phase 3c.
- `src/r3f/__tests__/` — 20 unit tests covering DSL invariants,
  shadow flag propagation, transform application, ref population.

This sub-phase is **shippable now** because the DSL output is
identical to the original imperative code — the game still runs
unchanged. We've simply replaced "construct meshes by hand" with
"describe meshes as data, then build."

**What this buys us before R3F lands:**

- Bottle, Block, particle entities can be expressed as ~30 lines
  of data instead of ~150 lines of imperative ceremony.
- The data form is testable (snapshot the tree, assert structure).
- The data form is the input format R3F expects — when the upgrade
  chain completes, swapping in JSX is mechanical.

### Sub-phase 3b — Stack upgrade (5–10 days)

Status: ❌ not started. Requires a separate dedicated branch.

1. **React 16 → 17** (1 day). Mostly transparent. The only known
   break in this codebase is `ReactDOM.render` becomes the legacy
   API; replace with `createRoot` in `src/index.js:815`.
2. **three.js 0.89 → 0.155** (3–6 days). High risk. Migrate in
   small commits:
   - `Geometry` → `BufferGeometry`. Search for `new THREE.Geometry()`.
     None today, but `applyMatrix` calls in `Bottle.js:69` need to
     become `applyMatrix4`.
   - GLTFLoader path swap.
   - Re-tune material `roughness` / `metalness` — colors will shift
     under the new PBR model.
   - Snapshot test: render a frame to canvas, hash the pixels, fail
     if the hash drifts more than N pixels. (Add `pngjs` + a one-shot
     reference image at the start of this sub-phase.)
3. **webpack 3 → 5** (2–3 days). The `eject`ed CRA config is
   replaceable with a hand-written webpack 5 config or a switch
   to Vite. Vite is recommended — webpack 5 still requires
   manual resolve.alias hacks for ESM-only deps.

This sub-phase is **shippable as a single PR** but high risk. Plan
for at least one full QA pass before merging.

### Sub-phase 3c — R3F install + decomposition (10–15 days)

Status: ❌ not started. Strictly depends on 3b completing.

Order of decomposition, by risk (lowest first):

| Order | Component | Lines today | Risk | Why |
| --- | --- | --- | --- | --- |
| 1 | Static lights / camera / scene clear color | ~40 | Low | No animation, no physics. Sanity check that `<Canvas>` renders. |
| 2 | Block (table) entities | 145 | Low | Static meshes. Decompose via the existing DSL. |
| 3 | UI text (`ScoreText`, `CenterText`) | ~80 | Medium | Texture textures live in DOM-adjacent code. |
| 4 | Particle FX (`PolymericParticles`, `Waves`, `SputteringParticles`) | ~300 | Medium | Imperative shader-buffer updates. R3F's `<points>` + a `useFrame` hook. |
| 5 | Bottle entity (visuals only, physics unchanged) | 581 | High | Already partially decomposed via `bottleCapStack.js`. Continue with body lathe + label band + base ring + GLTF model swap. |
| 6 | Camera controller | 80 | High | Tight coupling with `GameController` for follow / shake / lerp. Migrate to a `useFrame` hook that reads target Z from a Zustand selector. |
| 7 | Cannon physics integration | — | Highest | Replace hand-rolled `world.step()` + body sync with `<Physics>` from `@react-three/cannon`. **Single biggest risk in the whole migration.** |

The first 6 items can land independently. Item 7 is the hard one.
Plan for a 1-week spike on a feature branch before committing.

### Sub-phase 3d — RAF / physics coupling rework (5–7 days)

Status: ❌ not started. Strictly depends on 3c.

Today, `GameController.update(time, delta)`:

1. Steps the cannon world.
2. Applies tweens (`@tweenjs/tween.js`).
3. Syncs body → mesh transforms.
4. Calls `renderer.render(scene, camera)`.

Under R3F:

1. `<Physics>` (from `@react-three/cannon`) owns step + sync.
2. Tween updates live in a `useFrame` hook in a top-level
   `<TweenRunner />` component.
3. Render is automatic.

The migration risk is that the tween + physics + game-state state
machine is tightly interleaved. The current code calls
`game.flipBottle()` which sets up a tween chain that *also* expects
the cannon body to sleep at a specific tick. With R3F's frame
ordering, that chain may break.

Mitigation: introduce a deterministic "input → action" event log
during 3a (already in `gameStore` via `subscribeWithSelector`), and
write a replay test in 3b that re-plays a recorded round through
the controller. Any divergence in the frame-by-frame state lights
up immediately.

---

## What ships today (Phase 3a checklist)

- [x] `src/r3f/sceneDSL.js` (DSL + 12 tests)
- [x] `src/r3f/bottleCapStack.js` (proof decomposition + 6 tests)
- [x] `src/r3f/r3fAdapter.js` (R3F JSX implementation, commented out
      until stack upgrade completes)
- [x] `docs/phase-3-r3f-migration.md` (this file)
- [x] All existing functionality unaffected — verified via
      `npm test` (20/20 r3f tests green) and dev-server smoke test.

---

## Adopting the DSL in new code

When adding a new visual entity today, prefer the DSL form. Example:

```js
import { buildSceneWithRefs } from '../r3f/sceneDSL';

const node = {
  type: 'group',
  name: 'plate',
  position: [0, 0, 0.5],
  children: [
    {
      type: 'mesh',
      name: 'rim',
      geometry: { type: 'torus', args: [0.4, 0.02, 12, 64] },
      material: { type: 'meshStandard', args: [{ color: 0xD4A017 }] },
      castShadow: true,
    },
    {
      type: 'mesh',
      name: 'surface',
      geometry: { type: 'circle', args: [0.4, 64] },
      material: { type: 'meshStandard', args: [{ color: 0xF4F1EC }] },
      receiveShadow: true,
    },
  ],
};

const { root, refs } = buildSceneWithRefs(node);
scene.add(root);
// Later: refs['rim'].rotation.z = 0.2;
```

When sub-phase 3c lands, swap `buildSceneWithRefs(node)` for
`<Scene node={node} refs={refs} />` from `r3fAdapter.js`. No other
call-site changes needed.

---

## Camera rework (companion to sub-phase 3a) — LANDED

Status: ✅ shipped alongside sub-phase 3a.

A complete rewrite of `src/game/world/CameraController.js` as a state
machine. Driven by user spec (front-facing label always centered,
shoulder pitch, random projection swap, three random mid-flip modes,
failed-state grading).

### Tunables that may want art-pass adjustment

All declared at the top of `CameraController.js`:

| Constant | Value | What it controls |
| --- | --- | --- |
| `IDLE_DISTANCE` | 4.8 | Camera distance from label in idle state. |
| `CHARGE_DISTANCE` | 5.6 | Pull-back during charge. |
| `IDLE_FOV` / `CHARGE_FOV` | 35° / 55° | Perspective camera FOV. |
| `IDLE_ZOOM` / `CHARGE_ZOOM` | 1.4 / 0.95 | Orthographic zoom. |
| `BREATHE_PERIOD_S` | 6.0 | Idle breathing oscillation period. |
| `BREATHE_AMPLITUDE` | 0.05 | ±5% on distance + zoom. |
| `PITCH_ANGLE` | 28° | Camera elevation above horizontal. Lifts the camera up so its sightline to the label clears restaurant walls and tables — without this, the horizontal "shoulder-level" sightline that the spec calls for gets occluded by props. |
| `FAILED_FADE_ALPHA` | 0.45 | Black overlay opacity at full failed grade. |
| `FAILED_GREY_WEIGHT` | 0.7 | How much fog grading desaturates. |
| `FAILED_LIGHT_SCALE` | 0.45 | Light intensity multiplier in failed state. |

### State machine

`CAMERA_STATE.IDLE → CHARGE → FLIP → LANDING → IDLE`, with `FAILED`
reachable from any state. The transitions are:

- **IDLE → CHARGE**: `startFlipCharge()` calls `setStateCharge()`.
- **CHARGE → FLIP**: `releaseFlipCharge()` calls `setStateFlip(bottle, landingPos)`.
  Picks one of `FOLLOW`, `LOCKED`, `CINEMATIC_CUT` via injected RNG.
- **FLIP → LANDING → IDLE**: `resolveLanding()` calls `setStateLanding()`
  (which random-swaps projection) followed by `setStateIdle()`.
- **\* → FAILED**: `failBottle()` calls `setStateFailed()` — fade overlay
  alpha and grey weight ramp toward 1; light intensities scale toward 45%.

### Label tracking — design decision

The user's hard requirement is "front-facing label artwork always
centered". The naive implementation — orient the camera along the
bottle's actual world-space label normal — fails because the cannon
body settles with arbitrary post-flip yaw, which can put the camera
inside restaurant walls.

The shipped implementation:

1. The CAMERA POSITION uses the **block-travel axis** (current → next
   block, ground-projected), not the bottle's current label normal.
   This guarantees a clean sightline along the gameplay path.
2. The BOTTLE's inner-mesh yaw is forcibly rotated each frame via
   `bottle.setLabelFaceDirection(cameraAxis)` so the label always
   faces wherever the camera ended up. This override is suspended
   during the FLIP state so the bottle can spin freely mid-air.

This delivers "label always centered" without ever clipping into props.

### Three flip modes

Random mid-flip behaviour, picked by RNG when `setStateFlip` is called:

- `FLIP_MODE.FOLLOW`: lookAt tracks the bottle's mesh position, camera
  stays on the negative-travel-axis. Result: bottle stays on-frame as
  it arcs through the air; camera orbits subtly with the parabola.
- `FLIP_MODE.LOCKED`: snapshot the camera pose at flip-start. Bottle
  is allowed to fly off-frame and reappear on landing — adds variety.
- `FLIP_MODE.CINEMATIC_CUT`: hard-cut to a perpendicular side-on pose
  with a slight push-in along the depth axis as the flip plays out.
  Selected by the existing tunable `FLIP_CINEMATIC_DISTANCE`.

The mode selector is RNG-injectable (`new CameraController(..., { random })`)
so the test suite can deterministically hit each branch.

### Random projection swap

Each `LANDING` transition coin-flips `OrthographicCamera ↔
PerspectiveCamera`. The pose is carried over to the new active camera
so the swap is invisible until the next breathing/lerp tick. Both
cameras share the fade overlay (each parented to one of them) so the
failed-state grading works regardless of which projection is active.

### Tests

`src/r3f/__tests__/CameraController.test.js` — 14 cases:

- IDLE / CHARGE / FAILED parameter targets match `_internals` constants.
- FLIP mode picker is deterministic given an injected RNG.
- LOCKED mode snapshots the camera pose.
- CINEMATIC_CUT positions camera perpendicular to the travel axis.
- LANDING returns to idle params and may swap projection.
- FAILED ramps `_failedT` toward 1 and applies fade-overlay opacity +
  light-intensity dimming.
- IDLE oscillates distance via the breathing function.
- Camera position lands opposite the block-travel axis with the
  expected pitch lift.
- `setLabelFaceDirection` is invoked toward the negated travel axis.
- `snap()` resets `_failedT` and locks current pose without lerp.
- Back-compat shims (`startFlipTracking` / `stopFlipTracking`).
- `setProjection` swaps `activeCamera` and carries pose.
- `_internals.ALL_FLIP_MODES` matches the documented exports.

### What changed elsewhere

- `src/game/entities/Bottle.js` — added `getLabelWorldPosition()`,
  `getLabelWorldNormal()`, and `setLabelFaceDirection(dir, force)`.
- `src/game/world/WorldScene.js` — added `perspectiveCamera` and the
  `fadeOverlayOrtho` / `fadeOverlayPersp` quads, parented to their
  respective cameras. Detached the ground plane from the camera and
  parented to the scene at world (0,0,-8) — used to be a fake skybox
  attached at camera-local z=-20, which read as a wall in front of
  the new horizontal-ish camera.
- `src/game/GameController.js` — wires `setStateCharge`, `setStateFlip`,
  `setStateLanding`, `setStateIdle`, `setStateFailed` into the existing
  game loop. Renderer call updated to `cameraController.activeCamera`.

## Risks not addressed by this plan

- `@tweenjs/tween.js` is unmaintained. R3F community uses
  `framer-motion-3d` or `motion-three` instead. Migration of every
  tween call site is a separate week of work that can happen in
  parallel with 3c.
- The custom `OrbitControls` shim at `src/orbitControls.js` will
  need replacement with `@react-three/drei`'s `<OrbitControls />`.
- The hand-rolled `gltfLoader.js` should be replaced with R3F's
  `useGLTF` (also from `drei`) which adds suspense-based loading.
