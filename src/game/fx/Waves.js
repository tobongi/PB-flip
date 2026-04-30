import * as THREE from 'three';
import TWEEN from '@tweenjs/tween.js';

import { PB_ORANGE } from '../config/constants';

export default class Waves {
  mesh = new THREE.Group();
  rings = [];
  count = 5;
  duration = 2000;
  interval = this.duration / 10;

  constructor() {
    for (let index = 0; index < this.count; ++index) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.3, 0.4, 50, 50),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, color: PB_ORANGE })
      );
      ring.visible = false;
      ring.position.z = 0.01;
      this.rings.push(ring);
      this.mesh.add(ring);
    }
  }

  wave(count) {
    this.rings.forEach(ring => {
      ring.visible = false;
    });

    count = Math.min(this.count, count);
    for (let index = 0; index < count; ++index) {
      const ring = this.rings[index];

      ring.scale.set(1, 1, 1);
      new TWEEN.Tween(ring.scale)
        .delay(this.interval * index)
        .to({ x: 4, y: 4 }, this.duration)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onStart(() => {
          ring.visible = true;
        })
        .start();

      ring.material.opacity = 0.8;
      new TWEEN.Tween(ring.material)
        .delay(this.interval * index)
        .to({ opacity: 0 }, this.duration)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();
    }
  }
}
