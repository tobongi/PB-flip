# Seamless Ortho ↔ Persp Projection Blend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ortho ↔ persp camera transition truly seamless. The current implementation only matches the bottle's size at swap-time; the projection matrix still flips instantaneously, so distant objects snap (foreshortening appears/disappears all at once). The user calls this "still too brutal." Fix: lerp the actual projection matrix element-by-element over a 1.5-second window, so the foreshortening property fades in/out continuously instead of switching.

**Architecture:** Both `OrthographicCamera` and `PerspectiveCamera` instances stay alive in the scene graph (so existing UI/fade-overlay parenting is untouched). The renderer continues to use `cameraController.activeCamera`, which is now picked based on a smoothed blend value (0..1). During the transition the chosen "host" camera's `projectionMatrix` is OVERRIDDEN every frame with an element-wise lerp of the two cameras' projection matrices. At blend=0 the override is a no-op (matrix equals ortho's own), at blend=1 the override is a no-op (equals persp's own). In between, the rendered image is a continuous warp between the two projections — the user perceives a smooth dolly-zoom rather than a mode swap.

**Tech Stack:** THREE.js r0.89, the existing `CameraController` state machine, Jest for tests, webpack-dev-server (already running on :3001) for visual verification.

---

## File Structure

**Modify:**
- `src/game/world/CameraController.js` — add `_targetProjectionBlend` / `_smoothedProjectionBlend` state + a `PROJECTION_BLEND_DAMPING` tunable; rewrite `setProjection` to set a target instead of swapping instantly; rewrite `_applyProjectionParams` to compute and write a blended projection matrix; pick `activeCamera` based on the smoothed blend.
- `src/r3f/__tests__/CameraController.test.js` — update the three existing `setProjection` tests (the activeCamera no longer flips on the same frame the call is made; it flips when the smoothed blend crosses 0.5 during `update()`); add new tests for matrix-lerp continuity and blend-damping convergence.

**Untouched but read for context:**
- `src/game/world/WorldScene.js` — fade-overlay parenting and UI parenting must keep working (UI is on ortho camera, fade overlays are on each camera). The blend approach preserves this — both cameras render their own matrix at their own endpoints; the override only kicks in mid-transition.
- `src/game/GameController.js` — `renderer.render(scene, cameraController.activeCamera)` path is unchanged. We just change WHICH camera `activeCamera` points to and override its `projectionMatrix`.

---

## Task 1: Failing test for blend state

**Files:**
- Modify: `src/r3f/__tests__/CameraController.test.js` (add a new `describe` block at end)

- [ ] **Step 1: Open the test file at the bottom and write the failing test**

Add this test at the end of the existing `describe('CameraController — state machine'` block, just before the closing `});`:

```javascript
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
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:
```
CI=true npm test -- --testPathPattern="CameraController" --watchAll=false 2>&1 | tail -10
```
Expected: the new test fails because `_targetProjectionBlend` and `_smoothedProjectionBlend` don't exist yet on the controller (`expect(undefined).toBe(1)`).

- [ ] **Step 3: Commit the failing test**

```bash
git add src/r3f/__tests__/CameraController.test.js
git commit -m "test(camera): add failing test for projection blend state"
```

---

## Task 2: Add blend state fields + damping constant

**Files:**
- Modify: `src/game/world/CameraController.js` — add tunable + class fields

- [ ] **Step 1: Add the damping tunable**

Find the line `const AXIS_SLERP_DAMPING = 3.0;` near the top of the file. Add this block IMMEDIATELY after it:

```javascript
// Damping for the ortho ↔ persp projection-matrix lerp. Lower than the
// state damping on purpose — the transition needs to feel like a slow
// dolly-zoom, not a state change. 1.6 gives ~95% in 1.9 s, which is the
// sweet spot where the user no longer perceives "two camera modes" but
// also doesn't notice the transition starting/ending. Bumping above ~3
// re-introduces the brutal-feeling snap; below ~1.0 it drags so long
// that the next flip can interrupt mid-blend.
const PROJECTION_BLEND_DAMPING = 1.6;
```

- [ ] **Step 2: Add the runtime fields on the class**

Find the line `_smoothedCameraAxis = new THREE.Vector3(0, -1, 0);` in the `class CameraController` body. Add these fields IMMEDIATELY after the `_smoothedDistanceScale = 1;` field that sits a few lines below it:

```javascript
  // Projection blend: 0 = pure ortho, 1 = pure persp. The TARGET flips
  // instantly when setProjection is called; the SMOOTHED value lerps
  // toward the target each frame and drives both the per-frame
  // projection-matrix override and the activeCamera selection.
  _targetProjectionBlend = 0;
  _smoothedProjectionBlend = 0;
```

- [ ] **Step 3: Initialize blend from the initial projection in the constructor**

Find the constructor block in `CameraController.js`:

```javascript
    // Initial projection picked deterministically (ortho first round).
    this.activeCamera = orthoCamera;
    this.orthoCamera.zoom = this._curZoom;
    this.orthoCamera.updateProjectionMatrix();
    this.perspectiveCamera.fov = this._curFov;
    this.perspectiveCamera.updateProjectionMatrix();
```

Add this line immediately after, before the constructor's closing `}`:

```javascript
    // The starting projection (ortho) is also the starting blend value.
    // Setting both target + smoothed avoids a one-shot lerp on first frame.
    this._targetProjectionBlend = (this.projection === PROJECTION.PERSP) ? 1 : 0;
    this._smoothedProjectionBlend = this._targetProjectionBlend;
```

- [ ] **Step 4: Re-run the failing test from Task 1 and confirm it now hits a different assertion**

Run:
```
CI=true npm test -- --testPathPattern="CameraController" --watchAll=false 2>&1 | tail -10
```
Expected: the test still fails, but now on a different line — the smoothed-blend assertion (`expect(0).toBeGreaterThan(0.95)`) — because `setProjection` doesn't yet change the target, and the lerp doesn't run in `update()`. Confirm this is the new failure (NOT the original `_targetProjectionBlend undefined` failure).

- [ ] **Step 5: Commit the state fields**

```bash
git add src/game/world/CameraController.js
git commit -m "feat(camera): add projection blend state fields"
```

---

## Task 3: Make setProjection set the blend TARGET only, not flip activeCamera

**Files:**
- Modify: `src/game/world/CameraController.js` — `setProjection` method

- [ ] **Step 1: Replace the body of `setProjection`**

Find the `setProjection(p)` method (it currently does the size-match logic and assigns `this.activeCamera`). Replace the WHOLE method with:

```javascript
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
```

- [ ] **Step 2: Run the existing setProjection tests and confirm three fail (the ones that assert activeCamera flipped on the same call)**

Run:
```
CI=true npm test -- --testPathPattern="CameraController" --watchAll=false 2>&1 | tail -30
```
Expected: the three tests `setProjection swaps activeCamera and carries pose`, `setProjection ortho→persp matches outgoing visible extent...`, `setProjection persp→ortho matches outgoing visible extent...` all fail their `activeCamera` assertions. The new Task-1 test from Task 1 still fails too (the lerp still doesn't run). This is expected — Task 4 fixes them.

- [ ] **Step 3: Commit the setProjection rewrite**

```bash
git add src/game/world/CameraController.js
git commit -m "feat(camera): setProjection sets blend target instead of flipping activeCamera"
```

---

## Task 4: Lerp the smoothed blend each frame in update()

**Files:**
- Modify: `src/game/world/CameraController.js` — `update` method

- [ ] **Step 1: Lerp `_smoothedProjectionBlend` in update()**

Find the block in `update(dt, bottle)` that does the axis slerp:

```javascript
    const axisT = 1 - Math.exp(-AXIS_SLERP_DAMPING * dt);
    this._smoothedCameraAxis.lerp(this._targetCameraAxis, axisT).normalize();
```

Add this block IMMEDIATELY after that snippet (before the `cameraAxis` const that follows):

```javascript
    // Drive the projection blend toward its target. The damping is
    // intentionally lower than the state/axis damping so the transition
    // feels like a slow dolly-zoom rather than a snappy state change.
    const blendT = 1 - Math.exp(-PROJECTION_BLEND_DAMPING * dt);
    this._smoothedProjectionBlend +=
      (this._targetProjectionBlend - this._smoothedProjectionBlend) * blendT;
```

- [ ] **Step 2: Re-run the Task-1 test and confirm it now passes**

Run:
```
CI=true npm test -- --testPathPattern="CameraController" --watchAll=false 2>&1 | tail -15
```
Expected: the Task-1 test (`setProjection sets a blend TARGET ... and lerps`) PASSES. Three other tests still fail (the activeCamera-flip ones from Task 3) — Task 6 will fix them.

- [ ] **Step 3: Commit the lerp**

```bash
git add src/game/world/CameraController.js
git commit -m "feat(camera): lerp projection blend each update tick"
```

---

## Task 5: Failing test for matrix-lerp continuity

**Files:**
- Modify: `src/r3f/__tests__/CameraController.test.js`

- [ ] **Step 1: Add the failing test at the end of the describe block**

Add immediately after the test added in Task 1:

```javascript
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
```

- [ ] **Step 2: Run and confirm both new tests fail**

Run:
```
CI=true npm test -- --testPathPattern="CameraController" --watchAll=false 2>&1 | tail -25
```
Expected: both new tests fail (matrix elements don't match) because `_applyProjectionParams` doesn't yet write a blended matrix.

- [ ] **Step 3: Commit the failing tests**

```bash
git add src/r3f/__tests__/CameraController.test.js
git commit -m "test(camera): add failing tests for matrix-lerp continuity"
```

---

## Task 6: Apply blended projection matrix + pick activeCamera by blend

**Files:**
- Modify: `src/game/world/CameraController.js` — `_applyProjectionParams` method

- [ ] **Step 1: Add a Matrix4 scratch field to the class**

Find the field block where other reusable scratch fields live (near `_lookMatrix = new THREE.Matrix4();`). Add:

```javascript
  // Scratch matrix for the per-frame projection-blend lerp. Reused
  // across frames so we don't allocate every render.
  _blendedProjMatrix = new THREE.Matrix4();
```

- [ ] **Step 2: Replace the body of `_applyProjectionParams`**

Find the existing method:

```javascript
  _applyProjectionParams() {
    if (this.projection === PROJECTION.ORTHO) {
      this.orthoCamera.zoom = this._curZoom;
      this.orthoCamera.updateProjectionMatrix();
    } else {
      this.perspectiveCamera.fov = this._curFov;
      this.perspectiveCamera.updateProjectionMatrix();
    }
  }
```

Replace it WHOLE with:

```javascript
  _applyProjectionParams() {
    // Always refresh BOTH cameras' native projection matrices — the
    // blend lerp reads them every frame regardless of which projection
    // is "logically active".
    this.orthoCamera.zoom = this._curZoom;
    this.orthoCamera.updateProjectionMatrix();
    this.perspectiveCamera.fov = this._curFov;
    this.perspectiveCamera.updateProjectionMatrix();

    // Pick the host camera that the renderer will actually use this
    // frame. Choosing by the smoothed blend's side of 0.5 keeps the
    // visible result stable: both cameras render with the same blended
    // matrix below, so the host swap at blend=0.5 is a visual no-op.
    const blend = Math.min(1, Math.max(0, this._smoothedProjectionBlend));
    const hostIsPersp = blend >= 0.5;
    this.activeCamera = hostIsPersp ? this.perspectiveCamera : this.orthoCamera;

    // Element-wise lerp the two projection matrices. At blend = 0 this
    // equals the ortho matrix; at blend = 1 it equals the persp matrix;
    // in between it is a smooth warp between the two so the user
    // experiences a continuous dolly-zoom-like effect rather than a
    // mode swap.
    const mOrtho = this.orthoCamera.projectionMatrix.elements;
    const mPersp = this.perspectiveCamera.projectionMatrix.elements;
    const out = this._blendedProjMatrix.elements;
    for (let i = 0; i < 16; i++) {
      out[i] = mOrtho[i] * (1 - blend) + mPersp[i] * blend;
    }
    this.activeCamera.projectionMatrix.copy(this._blendedProjMatrix);
    this.activeCamera.projectionMatrixInverse
      .copy(this._blendedProjMatrix).invert();
  }
```

- [ ] **Step 3: Run the new matrix-lerp tests and confirm they pass**

Run:
```
CI=true npm test -- --testPathPattern="CameraController" --watchAll=false 2>&1 | tail -30
```
Expected: the two new matrix-lerp tests PASS. The three pre-existing setProjection tests still fail because they assert activeCamera flips on the same call — Task 7 fixes those.

- [ ] **Step 4: Commit the matrix lerp**

```bash
git add src/game/world/CameraController.js
git commit -m "feat(camera): blend projection matrices each frame"
```

---

## Task 7: Update the three pre-existing setProjection tests

**Files:**
- Modify: `src/r3f/__tests__/CameraController.test.js`

- [ ] **Step 1: Update `setProjection swaps activeCamera and carries pose`**

Find the test (around line 235 in the file) and replace its body with:

```javascript
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
```

- [ ] **Step 2: Update `setProjection ortho→persp matches outgoing visible extent then lerps to idle FOV`**

Find this test and replace with:

```javascript
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
```

- [ ] **Step 3: Update `setProjection persp→ortho matches outgoing visible extent then lerps to idle zoom`**

Replace with:

```javascript
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
```

- [ ] **Step 4: Run the suite and confirm everything passes**

Run:
```
CI=true npm test -- --testPathPattern="CameraController" --watchAll=false 2>&1 | tail -35
```
Expected: ALL camera tests pass — the three updated ones plus the three new ones from Tasks 1, 5.

- [ ] **Step 5: Commit the test updates**

```bash
git add src/r3f/__tests__/CameraController.test.js
git commit -m "test(camera): update setProjection tests to match blend-driven activeCamera swap"
```

---

## Task 8: Add "no perceptual snap" regression test

**Files:**
- Modify: `src/r3f/__tests__/CameraController.test.js`

- [ ] **Step 1: Add the test at the end of the describe block**

Add immediately after the matrix-endpoint test from Task 5:

```javascript
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
```

- [ ] **Step 2: Run and confirm it passes**

Run:
```
CI=true npm test -- --testPathPattern="CameraController" --watchAll=false 2>&1 | tail -15
```
Expected: the new test passes — the per-frame jump is well under 15% of the total endpoint delta because the lerp distributes the change over ~30 frames.

- [ ] **Step 3: Commit**

```bash
git add src/r3f/__tests__/CameraController.test.js
git commit -m "test(camera): regression test for continuous projection blend"
```

---

## Task 9: Verify visually in the running dev server

**Files:**
- No file changes — the dev server at `http://localhost:3001` watches both source files automatically.

- [ ] **Step 1: Confirm webpack picked up all the changes**

Run:
```
tail -5 .devserver.log
```
Expected: last line is `Compiled successfully!` (no errors).

- [ ] **Step 2: Reload the page in the integrated browser**

Use the integrated browser MCP to navigate:
```
browser_navigate http://localhost:3001
```

Then run this script via `browser_eval` to confirm the game is up:
```javascript
new Promise(r => setTimeout(() => {
  const overlay = document.querySelector('[data-id="landing-screen"]');
  if (overlay) overlay.remove();
  r({ready: !!window.__game});
}, 3000))
```
Expected: `{ready: true}`.

- [ ] **Step 3: Capture a baseline at ortho idle**

Run via `browser_eval`:
```javascript
(() => {
  const g = window.__game;
  const cc = g.cameraController;
  g.currentTableIndex = 0;
  g.clearBlocks(); g.createBlock(); g.createBlock().down(); g.createBlock();
  g.resetBottleForTurn();
  cc.setProjection('ortho');
  cc._smoothedProjectionBlend = 0;
  cc._targetProjectionBlend = 0;
  cc.setTarget(g.currentBlock, g.nextBlock, true);
  cc.snap(g.bottle);
  for (let i = 0; i < 60; i++) cc.update(0.05, g.bottle);
  g.render();
  return {proj: cc.projection, blend: cc._smoothedProjectionBlend};
})()
```
Expected: `{proj: "ortho", blend: 0}`.

Take a screenshot. Save mental note of the bottle's apparent size and the perspective foreshortening on distant tables.

- [ ] **Step 4: Trigger an ortho→persp swap and capture three frames during the transition**

Via `browser_eval`:
```javascript
(() => {
  const g = window.__game;
  const cc = g.cameraController;
  cc.setProjection('persp');
  // Frame at 25% blend.
  for (let i = 0; i < 8; i++) cc.update(0.05, g.bottle);
  g.render();
  return {blend: cc._smoothedProjectionBlend.toFixed(2), active: cc.activeCamera === cc.orthoCamera ? 'ortho' : 'persp'};
})()
```
Take a screenshot.

Then advance to ~50% blend and screenshot:
```javascript
(() => {
  const g = window.__game;
  for (let i = 0; i < 8; i++) g.cameraController.update(0.05, g.bottle);
  g.render();
  return {blend: g.cameraController._smoothedProjectionBlend.toFixed(2)};
})()
```
Then advance to ~95% blend and screenshot:
```javascript
(() => {
  const g = window.__game;
  for (let i = 0; i < 60; i++) g.cameraController.update(0.05, g.bottle);
  g.render();
  return {blend: g.cameraController._smoothedProjectionBlend.toFixed(2)};
})()
```

Expected outcome across the four screenshots (baseline, 25%, 50%, 95%): the bottle's apparent size stays roughly constant. The "perspective foreshortening" on distant tables increases gradually over the four frames — no single frame shows a sudden switch. The user's "brutal cut" complaint is gone.

- [ ] **Step 5: Repeat for persp→ortho**

Run:
```javascript
(() => {
  const g = window.__game;
  const cc = g.cameraController;
  // Confirm we are at persp idle.
  cc._smoothedProjectionBlend = 1;
  for (let i = 0; i < 30; i++) cc.update(0.05, g.bottle);
  cc.setProjection('ortho');
  return {blend: cc._smoothedProjectionBlend.toFixed(2)};
})()
```
Take a screenshot at 25%, 50%, 95% just like Step 4 (the transition is symmetric). Confirm visually.

- [ ] **Step 6: If the blend feels too slow or too fast, tune `PROJECTION_BLEND_DAMPING`**

If the transition looks sluggish, increase the constant (try 2.0 → ~95% in 1.5 s). If it looks brutal again, decrease (try 1.2 → ~95% in 2.5 s). Commit any tuning change as `tune(camera): adjust projection blend damping to <value>`.

- [ ] **Step 7: Final commit (only if Step 6 changed the constant)**

```bash
git add src/game/world/CameraController.js
git commit -m "tune(camera): adjust projection blend damping for visual feel"
```

---

## Task 10: Run the full test suite + confirm clean tree

**Files:**
- No file changes — verification only.

- [ ] **Step 1: Run the entire jest suite**

Run:
```
CI=true npm test -- --watchAll=false 2>&1 | tail -10
```
Expected: all suites pass. The CameraController suite should report 28 tests passing (25 prior + 3 new from Tasks 1, 5, 8).

- [ ] **Step 2: Confirm no compile errors and no leftover lint warnings on the touched lines**

Run:
```
tail -5 .devserver.log
```
Expected: ends with `Compiled successfully!` (a harmless `no-loop-func` warning on an unrelated line is acceptable as it pre-existed).

- [ ] **Step 3: Confirm git tree is clean**

Run:
```
git status -s
```
Expected: clean (everything committed) OR only untracked files unrelated to this work (e.g. `.devserver.log`, `docs/playtest-*.png`).

---

## Self-Review

**Spec coverage:**
- "Real cross-fade or projection-blend approach": Tasks 6, 7 deliver an element-wise lerp of the two projection matrices applied every frame.
- "Truly seamless transition so the user never perceives them as two different camera modes": Task 4 lerps the blend over ~1.9 s with `PROJECTION_BLEND_DAMPING = 1.6`. Task 6 keeps the bottle size matched at endpoints (carried over from the prior smooth-match logic), and the matrix lerp continuously warps foreshortening rather than snapping it.
- Test coverage: Task 1 covers blend-state plumbing. Task 5 covers matrix-lerp math correctness at endpoints + midpoint. Task 8 is the regression test that the user's reported "brutal cut" cannot recur (per-frame matrix delta is bounded).
- Visual verification: Task 9 captures four screenshots at 0%/25%/50%/95% blend in both directions.

**Placeholder scan:** None. Every step shows actual code or an exact command. No "TBD" / "implement appropriately" anywhere.

**Type consistency:**
- `_targetProjectionBlend` / `_smoothedProjectionBlend`: number ∈ [0, 1]. Used identically in Tasks 2, 3, 4, 6, 7, 8.
- `_blendedProjMatrix`: `THREE.Matrix4`. Defined in Task 6, used same task.
- `PROJECTION_BLEND_DAMPING`: number constant. Defined Task 2, used Task 4.
- `_applyProjectionParams()`: existing method, signature unchanged. Tasks 5, 6, 8 reference its updated behavior.
- `setProjection(p: PROJECTION)`: signature unchanged. Tasks 3, 7 reference its updated behavior.

No drift. Plan is ready for execution.
