import * as THREE from 'three';
import * as CANNON from 'cannon';
import TWEEN from '@tweenjs/tween.js';

import { BLOCK_PRESSED_H, BOUNCE_DURATION, PRESS_DURATION } from '../config/constants';

export default class Block {
  mesh = new THREE.Group();
  body = new CANNON.Body({
    mass: 0,
  });
  tweens = [];

  scale = 1;
  // Actual prop dimensions in world units, derived from the loaded mesh.
  // Each prop has a different silhouette, so the collider and landing
  // surface must be sized per-prop instead of a global BLOCK_HEIGHT.
  height = 1;
  halfX = 0.5;
  halfY = 0.5;
  // Landing-pad half-extents used by canHold(). Defaults to the prop's
  // own halfX/halfY (free-play mode), but in restaurant mode the
  // GameController overrides these with the table's surface footprint —
  // because the player perceives the table top as the platform, not the
  // small prop sitting on it. A tray (halfX=0.3) on a 1m-wide table
  // would otherwise reject visually-correct landings as "fell off".
  padHalfX = 0.5;
  padHalfY = 0.5;
  // World-space Z the block's mesh rests at — matches body.position.z.
  // Set by GameController per spawn so restaurant-table blocks animate
  // to their table top instead of z=0.
  restZ = 0;

  constructor(cube, scale = 1) {
    this.cubeId = cube.id;
    this.scale = scale;
    const model = cube.model.clone();
    // Shadows are disabled in WorldScene, so don't traverse — saves ~5-30
    // mesh visits per Block construction on every landing.
    this.mesh.add(model);
    this.mesh.scale.set(scale, scale, 1);

    // Cache the prop's intrinsic (unit-scale) dimensions once per cube
    // definition. Was running two THREE.Box3.setFromObject walks of the
    // mesh hierarchy per Block construction — cumulative ~mesh-count × 2
    // mesh visits dropped right onto the landing frame. Now: one walk
    // total per cube ID, ever.
    if (!cube._cachedDims) {
      const probeMesh = new THREE.Group();
      probeMesh.add(cube.model.clone());
      probeMesh.updateMatrixWorld(true);
      let probeBox = new THREE.Box3().setFromObject(probeMesh);
      let baseShift = 0;
      if (isFinite(probeBox.min.z) && probeBox.min.z !== 0) {
        baseShift = -probeBox.min.z;
        probeMesh.children[0].position.z = baseShift;
        probeMesh.updateMatrixWorld(true);
        probeBox = new THREE.Box3().setFromObject(probeMesh);
      }
      const probeSize = probeBox.getSize(new THREE.Vector3());
      cube._cachedDims = {
        baseShift,
        height: Math.max(probeSize.z, 0.05),
        halfX: probeSize.x / 2,
        halfY: probeSize.y / 2,
      };
    }
    const dims = cube._cachedDims;
    if (dims.baseShift) {
      model.position.z = dims.baseShift;
    }
    // Apply the runtime scale. The cube's cached dims are at unit scale, so
    // halfX/halfY scale linearly; height keeps its z=1 scaling (the mesh's
    // z scale is fixed at 1 above, so the base height is preserved).
    this.height = dims.height;
    this.halfX = dims.halfX * scale;
    this.halfY = dims.halfY * scale;
    this.padHalfX = this.halfX;
    this.padHalfY = this.halfY;

    this.body.addShape(
      new CANNON.Box(new CANNON.Vec3(this.halfX, this.halfY, this.height / 2)),
      new CANNON.Vec3(0, 0, this.height / 2)
    );
  }

  update() {}

  trackTween(tween) {
    const stop = tween.stop.bind(tween);
    tween.stop = () => {
      this.tweens = this.tweens.filter(activeTween => activeTween !== tween);
      return stop();
    };
    this.tweens.push(tween);
    return tween;
  }

  stopTweens() {
    this.tweens.slice().forEach(tween => tween.stop());
    this.tweens = [];
  }

  press() {
    this.mesh.scale.z = 1;
    let tween = null;
    tween = this.trackTween(
      new TWEEN.Tween(this.mesh.scale)
        .to({ z: BLOCK_PRESSED_H }, PRESS_DURATION)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onComplete(() => {
          this.tweens = this.tweens.filter(activeTween => activeTween !== tween);
        })
    );
    return [tween];
  }

  bounce() {
    let tween = null;
    tween = this.trackTween(
      new TWEEN.Tween(this.mesh.scale)
        .to({ z: 1 }, BOUNCE_DURATION)
        .easing(TWEEN.Easing.Bounce.Out)
        .onComplete(() => {
          this.tweens = this.tweens.filter(activeTween => activeTween !== tween);
        })
    );
    return [tween];
  }

  down() {
    this.mesh.position.z = this.restZ + 3;
    this.mesh.visible = true;
    let tween = null;
    tween = this.trackTween(
      new TWEEN.Tween(this.mesh.position)
        .to({ z: this.restZ }, 800)
        .easing(TWEEN.Easing.Bounce.Out)
        .onComplete(() => {
          this.tweens = this.tweens.filter(activeTween => activeTween !== tween);
        })
    );
    return tween.start();
  }

  canHold(position) {
    const offset = position.clone().sub(this.mesh.position).setZ(0);
    const canHoldX = Math.abs(offset.x) <= this.padHalfX;
    const canHoldY = Math.abs(offset.y) <= this.padHalfY;
    return canHoldX && canHoldY;
  }
}
