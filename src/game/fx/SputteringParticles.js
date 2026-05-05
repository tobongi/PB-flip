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
    const height = 0.3;
    // Was allocating 3 Vector3s per particle (direction + 2 clones) plus the
    // tween-target objects, hitting the GC right at the landing frame. We
    // only need the scalar end coords now — no Vector3 allocations.
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      particle.visible = true;

      const angle = Math.random() * 2 * Math.PI;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const startX = dx * 0.15;
      const startY = dy * 0.15;
      const endX = dx * 0.25;
      const endY = dy * 0.25;

      particle.scale.set(0.02, 0.02, 0.02);
      particle.position.set(startX, startY, 0);
      const up = new TWEEN.Tween(particle.position).to({ z: height }, this.duration / 2);
      const down = new TWEEN.Tween(particle.position).to({ z: 0 }, this.duration / 2);
      const move = new TWEEN.Tween(particle.position)
        .to({ x: endX, y: endY }, this.duration)
        .onComplete(() => {
          particle.visible = false;
        });

      up.chain(down).start();
      move.start();
    }
  }

  stop() {
    this.mesh.visible = false;
  }
}
