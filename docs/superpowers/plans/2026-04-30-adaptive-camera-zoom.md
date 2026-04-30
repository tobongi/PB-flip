# Adaptive Camera Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the camera dynamically zoom in/out based on the distance between the bottle and the next landing zone, so both are always visible on screen with comfortable padding.

**Architecture:** The orthographic camera currently has a fixed frustum (FRUSTUM_HEIGHT=11.0). We add a dynamic zoom system to `CameraController` that projects the bottle position and landing zone into view space, computes the required zoom to fit both with padding, and smoothly interpolates `camera.zoom` each frame. UI elements are counter-scaled to maintain their screen size regardless of zoom level.

**Tech Stack:** Three.js r89 orthographic camera (`camera.zoom` property), TWEEN.js-style exponential damping for smooth transitions.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/game/config/constants.js` | Modify | Add zoom-related constants |
| `src/game/world/CameraController.js` | Modify | Core adaptive zoom logic — compute target zoom, lerp, UI compensation |
| `src/game/world/WorldScene.js` | Modify | Enlarge ground plane to cover the extended visible area when zoomed out |
| `src/game/GameController.js` | Modify | Pass UI group reference to CameraController, store block positions for zoom |

---

### Task 1: Add Zoom Constants

**Files:**
- Modify: `src/game/config/constants.js:40-45`

- [ ] **Step 1: Add the three zoom constants after the existing camera constants**

In `src/game/config/constants.js`, after line 46 (`export const CAMERA_ROTATE_DURATION = 1200;`), add:

```javascript
export const CAM_ZOOM_MIN = 0.55;
export const CAM_ZOOM_MAX = 1.0;
export const CAM_ZOOM_PADDING = 1.5;
```

These control:
- `CAM_ZOOM_MIN = 0.55` — maximum zoom-out (camera never zooms out further than this; at 0.55 the visible area is ~1.82× normal)
- `CAM_ZOOM_MAX = 1.0` — maximum zoom-in (the default viewport, never closer than this)
- `CAM_ZOOM_PADDING = 1.5` — world units of margin around both the bottle and landing zone in view space, so they don't sit right at the screen edge

- [ ] **Step 2: Verify the file compiles**

Run: `npm start` (if not already running) and check the console for errors.
Expected: No errors, game loads normally (constants are exported but not used yet).

- [ ] **Step 3: Commit**

```bash
git add src/game/config/constants.js
git commit -m "feat: add adaptive camera zoom constants"
```

---

### Task 2: Enlarge Ground Plane for Zoom-Out Coverage

**Files:**
- Modify: `src/game/world/WorldScene.js:111-112`

**Context:** The ground is a camera-attached plane that fills the background. Currently it's `1.2×` the frustum dimensions. At our minimum zoom (0.55), the visible area grows to `1/0.55 ≈ 1.82×` the frustum. A `1.2×` ground wouldn't cover the screen — you'd see void at the edges. We enlarge it to `3×` to cover any zoom level with margin.

- [ ] **Step 1: Change the ground geometry multiplier from 1.2 to 3.0**

In `src/game/world/WorldScene.js`, change line 112:

```javascript
// Before:
new THREE.PlaneGeometry(FRUSTUM_WIDTH * 1.2, FRUSTUM_HEIGHT * 1.2),

// After:
new THREE.PlaneGeometry(FRUSTUM_WIDTH * 3, FRUSTUM_HEIGHT * 3),
```

- [ ] **Step 2: Verify visually**

Run the game. The ground plane should look exactly the same as before (it extends beyond the screen in both directions). No visual change at this point since zoom is still 1.0.

- [ ] **Step 3: Commit**

```bash
git add src/game/world/WorldScene.js
git commit -m "feat: enlarge ground plane to support camera zoom-out"
```

---

### Task 3: Add Adaptive Zoom to CameraController

**Files:**
- Modify: `src/game/world/CameraController.js` (entire file rewrite — all methods affected)

**Context:** This is the core change. The CameraController gains:
1. A `_computeTargetZoom(posA, posB)` method that projects two world positions into the camera's view space and returns the zoom needed to fit both with padding
2. Zoom state: `_targetZoom` (what we're aiming for), smoothly interpolated each frame
3. A UI group reference, counter-positioned and counter-scaled so score text stays at the screen corner at proper size regardless of zoom
4. Storage of block positions from `setTarget()` so zoom can be computed every frame

- [ ] **Step 1: Add new imports and instance variables**

At the top of `CameraController.js`, add the constants import:

```javascript
import { CAM_ZOOM_MIN, CAM_ZOOM_MAX, CAM_ZOOM_PADDING } from '../config/constants';
```

Add new instance variables after the existing ones (after line 19, `_flipDamping = 14;`):

```javascript
_targetZoom = 1.0;
_zoomDamping = 3;

_blockPosA = new THREE.Vector3();
_blockPosB = new THREE.Vector3();
_hasBlockPositions = false;

// Reusable vectors for zoom computation (avoid per-frame allocation)
_camRight = new THREE.Vector3();
_camUp = new THREE.Vector3();
_zoomOffset = new THREE.Vector3();
```

- [ ] **Step 2: Update the constructor to accept the UI group**

Change the constructor from:

```javascript
constructor(camera, light, addScoreText) {
  this.camera = camera;
  this.light = light;
  this.addScoreText = addScoreText;
}
```

To:

```javascript
constructor(camera, light, addScoreText, uiGroup) {
  this.camera = camera;
  this.light = light;
  this.addScoreText = addScoreText;
  this._uiGroup = uiGroup;
}
```

- [ ] **Step 3: Add the `_computeTargetZoom` method**

Add this method after `stopFlipTracking()` and before `setTarget()`:

```javascript
_computeTargetZoom(posA, posB) {
  this._camRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
  this._camUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);

  let maxExtentX = 0;
  let maxExtentY = 0;
  const midX = (posA.x + posB.x) * 0.5;
  const midY = (posA.y + posB.y) * 0.5;
  const midZ = (posA.z + posB.z) * 0.5;

  const points = [posA, posB];
  for (let i = 0; i < points.length; i++) {
    this._zoomOffset.set(
      points[i].x - midX,
      points[i].y - midY,
      points[i].z - midZ,
    );
    const sx = Math.abs(this._zoomOffset.dot(this._camRight));
    const sy = Math.abs(this._zoomOffset.dot(this._camUp));
    if (sx > maxExtentX) maxExtentX = sx;
    if (sy > maxExtentY) maxExtentY = sy;
  }

  maxExtentX += CAM_ZOOM_PADDING;
  maxExtentY += CAM_ZOOM_PADDING;

  const halfW = (this.camera.right - this.camera.left) / 2;
  const halfH = (this.camera.top - this.camera.bottom) / 2;

  const zoomForX = halfW / maxExtentX;
  const zoomForY = halfH / maxExtentY;

  return Math.max(CAM_ZOOM_MIN, Math.min(CAM_ZOOM_MAX, Math.min(zoomForX, zoomForY)));
}
```

**How it works:**
1. Extracts the camera's local X/Y axes from its current quaternion
2. For each of the two key positions, projects the offset from their midpoint onto those axes — this gives the view-space extent
3. Adds `CAM_ZOOM_PADDING` (1.5 world units) to each axis so objects don't sit at the screen edge
4. Computes the zoom needed for each axis: `frustumHalf / requiredExtent`
5. Takes the smaller zoom (more zoomed out) so both axes fit, clamped to `[0.55, 1.0]`

- [ ] **Step 4: Modify `setTarget()` to store block positions and compute zoom**

In `setTarget()`, inside the `if (currentBlock && nextBlock)` branch, after the `_targetOrbitAngle` computation (after line 52), add:

```javascript
this._blockPosA.copy(currentBlock.mesh.position);
this._blockPosB.copy(nextBlock.mesh.position);
this._hasBlockPositions = true;
this._targetZoom = this._computeTargetZoom(this._blockPosA, this._blockPosB);
```

- [ ] **Step 5: Modify `update()` to interpolate zoom, recompute during flips, and compensate UI**

In the `update()` method, after the flip-tracking lookAt override block (after line 81 `}`), add the zoom recomputation for flip tracking:

```javascript
if (this._trackBottle && this._trackLanding) {
  this._targetZoom = this._computeTargetZoom(
    this._trackBottle.position,
    this._trackLanding,
  );
} else if (this._hasBlockPositions) {
  this._targetZoom = this._computeTargetZoom(this._blockPosA, this._blockPosB);
}
```

Then, at the end of `update()`, after the `addScoreText.mesh.lookAt()` call (after line 105 `);`), add the zoom interpolation and UI compensation:

```javascript
const zoomDamping = this._trackBottle ? this._flipDamping : this._zoomDamping;
const zoomT = 1 - Math.exp(-zoomDamping * dt);
this.camera.zoom += (this._targetZoom - this.camera.zoom) * zoomT;
this.camera.updateProjectionMatrix();

if (this._uiGroup) {
  this._uiGroup.position.set(
    this.camera.left / this.camera.zoom,
    this.camera.bottom / this.camera.zoom,
    0,
  );
  this._uiGroup.scale.setScalar(1 / this.camera.zoom);
}
```

**Why separate damping for flips:** During flips (500ms), the zoom uses `_flipDamping = 14` (same as camera position damping during flips) so the zoom reaches its target before the bottle reaches its arc peak. During idle transitions between blocks, the gentler `_zoomDamping = 3` creates a smooth cinematic zoom.

- [ ] **Step 6: Modify `snap()` to instantly set zoom and compensate UI**

In `snap()`, after the quaternion copy (after line 124 `this.camera.quaternion.copy(this._targetQ);`), add:

```javascript
this.camera.zoom = this._targetZoom;
this.camera.updateProjectionMatrix();

if (this._uiGroup) {
  this._uiGroup.position.set(
    this.camera.left / this.camera.zoom,
    this.camera.bottom / this.camera.zoom,
    0,
  );
  this._uiGroup.scale.setScalar(1 / this.camera.zoom);
}
```

- [ ] **Step 7: Verify the complete CameraController**

The final file should have this structure:
1. Import: `THREE` + zoom constants
2. Class with instance vars: existing ones + `_targetZoom`, `_zoomDamping`, `_blockPosA/B`, `_hasBlockPositions`, `_camRight`, `_camUp`, `_zoomOffset`
3. Constructor: now takes 4 args (camera, light, addScoreText, uiGroup)
4. `startFlipTracking()` — unchanged
5. `stopFlipTracking()` — unchanged
6. `_computeTargetZoom(posA, posB)` — NEW
7. `setTarget()` — now stores block positions and computes `_targetZoom`
8. `update()` — now recomputes zoom during flips, interpolates `camera.zoom`, compensates UI
9. `snap()` — now instantly sets zoom and compensates UI

- [ ] **Step 8: Commit**

```bash
git add src/game/world/CameraController.js
git commit -m "feat: add adaptive camera zoom based on bottle-to-landing distance"
```

---

### Task 4: Wire Up UI Group in GameController

**Files:**
- Modify: `src/game/GameController.js:118`

**Context:** The CameraController constructor now requires the UI group as its 4th argument. GameController creates the CameraController in its constructor and needs to pass `this.UI`.

- [ ] **Step 1: Update the CameraController instantiation**

In `src/game/GameController.js`, change line 118:

```javascript
// Before:
this.cameraController = new CameraController(this.camera, this.light, this.addScoreText);

// After:
this.cameraController = new CameraController(this.camera, this.light, this.addScoreText, this.UI);
```

`this.UI` is already available at this point — it's created by `createWorldScene()` which is called via `Object.assign(this, createWorldScene())` on line 111 (the constructor runs the scene factory before creating the camera controller).

- [ ] **Step 2: Verify the game loads and runs**

Run: `npm start`
Expected: Game loads. When you flip the bottle, the camera should now zoom out when the landing zone is far from the bottle, and zoom back to normal when they're close.

- [ ] **Step 3: Commit**

```bash
git add src/game/GameController.js
git commit -m "feat: pass UI group to CameraController for zoom-aware positioning"
```

---

### Task 5: Visual Verification and Tuning

**Files:**
- Potentially tune: `src/game/config/constants.js` (zoom constants)
- Potentially tune: `src/game/world/CameraController.js` (`_zoomDamping`)

- [ ] **Step 1: Test with close blocks**

Play the game in restaurant mode with nearby tables. The camera should stay at zoom ≈ 1.0 (normal view). Both the bottle and the next table should be clearly visible.

- [ ] **Step 2: Test with distant blocks**

Play through several flips until the game reaches tables that are far apart. The camera should zoom out smoothly to keep both the bottle and the distant landing zone in frame. Both should be visible with comfortable margin.

- [ ] **Step 3: Test flip arc visibility**

During a flip to a distant table, verify:
- The bottle's arc (which peaks at startZ + 3.5 world units) stays visible
- The landing zone stays visible
- The zoom smoothly transitions — no jarring jumps

- [ ] **Step 4: Test the zoom-in after landing**

After landing on a distant table, the next target might be closer. Verify:
- Camera smoothly zooms back in toward 1.0
- The transition feels natural, not abrupt

- [ ] **Step 5: Test restart and checkpoint restore**

Verify:
- On restart, the camera snaps to the correct zoom for the initial block layout (no weird zoom animation on restart)
- If checkpoint restore is triggered (debug mode), the camera snaps to the correct zoom

- [ ] **Step 6: Test window resize during gameplay**

Resize the browser window while playing. Verify:
- Score text stays at the bottom-left corner
- The game doesn't glitch or show incorrect zoom
- The frustum adjusts correctly

- [ ] **Step 7: Tune constants if needed**

If the zoom feels too aggressive (zooms out too much), increase `CAM_ZOOM_MIN` from 0.55 toward 0.65.
If the zoom doesn't zoom out enough (objects still clipped), decrease `CAM_ZOOM_MIN` toward 0.45.
If the padding is too tight (objects too close to edges), increase `CAM_ZOOM_PADDING` from 1.5 to 2.0.
If the padding is too loose (too much empty space), decrease `CAM_ZOOM_PADDING` to 1.0.
If the zoom transition is too slow, increase `_zoomDamping` from 3 to 5.
If the zoom transition is too jarring, decrease `_zoomDamping` from 3 to 2.

- [ ] **Step 8: Commit any tuning changes**

```bash
git add -A
git commit -m "fix: tune adaptive camera zoom constants"
```

---

## Summary of All Changes

| File | Lines Changed | What Changed |
|------|--------------|--------------|
| `src/game/config/constants.js` | +3 lines | Added `CAM_ZOOM_MIN`, `CAM_ZOOM_MAX`, `CAM_ZOOM_PADDING` |
| `src/game/world/WorldScene.js` | 1 line | Ground plane `1.2×` → `3×` frustum size |
| `src/game/world/CameraController.js` | ~60 lines added | Import zoom constants, add zoom state vars, `_computeTargetZoom()` method, zoom interpolation in `update()`, zoom snap in `snap()`, UI compensation |
| `src/game/GameController.js` | 1 line | Pass `this.UI` as 4th arg to CameraController |

**Total: ~65 lines added/changed across 4 files.**
