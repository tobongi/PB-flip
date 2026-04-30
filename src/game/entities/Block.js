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

  stayScore = 0;
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
    this.stayScore = cube.stayScore;
    const model = cube.model.clone();
    model.position.set(0, 0, 0);
    model.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    this.mesh.add(model);
    this.mesh.scale.set(scale, scale, 1);
    this.mesh.updateMatrixWorld(true);

    // Measure the prop's actual silhouette after scaling. Some props extend
    // below mesh-local z=0 (lathe geometries, etc.); shift the model up so
    // its base sits at z=0, then build the collider from real dimensions.
    let bbox = new THREE.Box3().setFromObject(this.mesh);
    if (isFinite(bbox.min.z) && bbox.min.z !== 0) {
      model.position.z = -bbox.min.z;
      this.mesh.updateMatrixWorld(true);
      bbox = new THREE.Box3().setFromObject(this.mesh);
    }
    const size = bbox.getSize ? bbox.getSize(new THREE.Vector3()) : bbox.max.clone().sub(bbox.min);
    this.height = Math.max(size.z, 0.05);
    this.halfX = size.x / 2;
    this.halfY = size.y / 2;
    // Default the landing pad to the prop's own footprint; restaurant
    // mode overwrites this with the table's surface dims after construction.
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

  hitCenter(position) {
    const offset = position.clone().sub(this.mesh.position).setZ(0);
    return offset.length() < 0.08 * Math.min(this.padHalfX, this.padHalfY) * 2;
  }
}
