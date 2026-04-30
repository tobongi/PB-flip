import * as THREE from 'three';
import TWEEN from '@tweenjs/tween.js';

import { PB_ORANGE, PB_VERT_CLAIR } from '../config/constants';

export default class PolymericParticles {
  particles = new THREE.Group();
  count = 15;
  interval = 15;

  texture = new THREE.CanvasTexture(this.generateSprite());

  whiteMaterial = new THREE.SpriteMaterial({
    map: this.texture,
    color: PB_ORANGE,
  });

  greenMaterial = new THREE.SpriteMaterial({
    map: this.texture,
    color: PB_VERT_CLAIR,
  });

  constructor() {
    for (let index = 0; index < this.count; index++) {
      const particle = new THREE.Sprite(index % 3 ? this.whiteMaterial : this.greenMaterial);
      this.step(particle, index * this.interval);
      this.particles.add(particle);
    }
    this.particles.visible = false;
  }

  step(particle, delay) {
    const position = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .normalize()
      .multiplyScalar(Math.random() * 0.2 + 0.4);

    particle.scale.set(0.03, 0.03, 0.03);
    particle.position.copy(position);
    particle.visible = false;

    new TWEEN.Tween(particle.position)
      .delay(delay)
      .to({ x: 0, y: 0, z: 0 }, this.count * this.interval)
      .easing(TWEEN.Easing.Quadratic.In)
      .start()
      .onStart(() => {
        particle.visible = true;
      })
      .onComplete(() => {
        this.step(particle, delay);
      });
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
}
