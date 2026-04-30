import * as THREE from 'three';
import TWEEN from '@tweenjs/tween.js';

import { PB_ORANGE } from '../config/constants';

export default class SputteringParticles {
  mesh = new THREE.Group();
  texture = new THREE.CanvasTexture(this.generateSprite());
  material = new THREE.SpriteMaterial({
    map: this.texture,
    color: PB_ORANGE,
  });

  count = 15;
  duration = 500;

  constructor() {
    for (let index = 0; index < this.count; ++index) {
      const particle = new THREE.Sprite(this.material);
      particle.visible = false;
      this.mesh.add(particle);
    }
  }

  generateSprite() {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      0,
      canvas.width / 2,
      canvas.height / 2,
      canvas.width / 2
    );
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,1)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
  }

  emit() {
    this.mesh.visible = true;
    const particles = this.mesh.children;
    particles.forEach(particle => {
      particle.visible = true;

      const direction = new THREE.Vector3(
        Math.cos(Math.random() * 2 * Math.PI),
        Math.sin(Math.random() * 2 * Math.PI),
        0
      );
      const start = direction.clone().multiplyScalar(0.15);
      const end = direction.clone().multiplyScalar(0.25);
      const height = 0.3;

      particle.scale.set(0.02, 0.02, 0.02);
      particle.position.copy(start);
      const up = new TWEEN.Tween(particle.position).to({ z: height }, this.duration / 2);
      const down = new TWEEN.Tween(particle.position).to({ z: end.z }, this.duration / 2);
      const move = new TWEEN.Tween(particle.position)
        .to({ x: end.x, y: end.y }, this.duration)
        .onComplete(() => {
          particle.visible = false;
        });

      up.chain(down).start();
      move.start();
    });
  }

  stop() {
    this.mesh.visible = false;
  }
}
