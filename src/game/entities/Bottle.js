import * as THREE from 'three';
import * as CANNON from 'cannon';
import TWEEN from '@tweenjs/tween.js';

import GLTFLoader from '../../gltfLoader';
import PolymericParticles from '../fx/PolymericParticles';
import SputteringParticles from '../fx/SputteringParticles';
import Waves from '../fx/Waves';
import {
  BOTTLE_PRESSED_H,
  BOTTLE_PRESSED_V,
  BOUNCE_DURATION,
  FLIP_DURATION,
  FLIP_HEIGHT,
  PRESS_DURATION,
} from '../config/constants';

export const BOTTLE_MODELS = [
  '/models/sauce_verte_originale.glb',
  '/models/sauce_verte_spicy.glb',
];

const modelCache = {};
function loadBottleModel(url) {
  if (!modelCache[url]) {
    modelCache[url] = new Promise((resolve, reject) => {
      new GLTFLoader().load(url, gltf => resolve(gltf.scene), undefined, reject);
    });
  }
  return modelCache[url];
}

export default class Bottle {
  connected = false;

  boundingBox = new THREE.Box3();
  offset = null;
  tweens = [];

  // World-space Z of the surface the bottle is currently standing on.
  // Each block has its own height, so GameController updates this every
  // turn from the actual block the bottle is standing on.
  groundZ = 0;

  mesh = new THREE.Group();
  bottle = new THREE.Group();

  body = new CANNON.Body({
    mass: 0.4,
    linearDamping: 0.06,
    angularDamping: 0.55,
    allowSleep: true,
    sleepSpeedLimit: 0.15,
    sleepTimeLimit: 0.5,
  });

  polymeric = new PolymericParticles();
  waves = new Waves();
  sputtering = new SputteringParticles();

  constructor() {
    // === Restaurant squeeze sauce bottle — properly modeled ===
    // Profile uses a single continuous LatheGeometry for the body so there are
    // no material seams along the silhouette. Cap, threaded collar, label band,
    // and base ring are separate meshes for distinct materials.
    const segments = 64;
    const rotMatrix = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    const rotateGeo = geo => {
      geo.applyMatrix(rotMatrix);
      return geo;
    };

    const greenMat = new THREE.MeshStandardMaterial({
      color: 0x8BA847,
      roughness: 0.38,
      metalness: 0.06,
    });
    const greenDeepMat = new THREE.MeshStandardMaterial({
      color: 0x6E8A36,
      roughness: 0.45,
      metalness: 0.04,
    });
    const capMat = new THREE.MeshStandardMaterial({
      color: 0xF4F1EC,
      roughness: 0.32,
      metalness: 0.12,
    });
    const capRingMat = new THREE.MeshStandardMaterial({
      color: 0xE8E4DC,
      roughness: 0.22,
      metalness: 0.25,
    });
    const labelTrimMat = new THREE.MeshStandardMaterial({
      color: 0xD4A017,
      roughness: 0.28,
      metalness: 0.85,
    });
    const labelBaseMat = new THREE.MeshStandardMaterial({
      color: 0x2A3320,
      roughness: 0.6,
      metalness: 0.05,
    });

    // -------- 1. Main bottle body (single continuous lathe profile) --------
    // Profile from base punt → body → waist → shoulder → neck top.
    // (radius, height) pairs. Keep tangent slopes smooth where possible.
    const bodyProfile = [
      // Closed flat base (creates the underside disc)
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.255, 0.0),
      // Small chamfer out at bottom for a base ring
      new THREE.Vector2(0.265, 0.015),
      new THREE.Vector2(0.275, 0.04),
      // Lower body — straight wall
      new THREE.Vector2(0.285, 0.10),
      new THREE.Vector2(0.292, 0.18),
      new THREE.Vector2(0.295, 0.28),
      // Subtle waist taper for ergonomic squeeze grip
      new THREE.Vector2(0.288, 0.36),
      new THREE.Vector2(0.282, 0.44),
      new THREE.Vector2(0.282, 0.54),
      new THREE.Vector2(0.288, 0.62),
      new THREE.Vector2(0.295, 0.70),
      // Shoulder curve
      new THREE.Vector2(0.288, 0.78),
      new THREE.Vector2(0.265, 0.84),
      new THREE.Vector2(0.225, 0.89),
      new THREE.Vector2(0.18, 0.93),
      new THREE.Vector2(0.15, 0.96),
      // Neck
      new THREE.Vector2(0.135, 0.99),
      new THREE.Vector2(0.13, 1.02),
      new THREE.Vector2(0.13, 1.08),
      // Neck top lip flare
      new THREE.Vector2(0.142, 1.085),
      new THREE.Vector2(0.142, 1.10),
      new THREE.Vector2(0.13, 1.105),
    ];
    this.bottle.add(new THREE.Mesh(rotateGeo(new THREE.LatheGeometry(bodyProfile, segments)), greenMat));

    // -------- 2. Inner sauce visible through translucent green (back face) --------
    // Slightly smaller inner shell rendered with BackSide gives depth illusion.
    const innerProfile = bodyProfile
      .filter(p => p.y > 0.06 && p.y < 1.0)
      .map(p => new THREE.Vector2(Math.max(0.001, p.x - 0.012), p.y));
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0xA8C25A,
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.BackSide,
    });
    this.bottle.add(new THREE.Mesh(rotateGeo(new THREE.LatheGeometry(innerProfile, segments)), innerMat));

    // -------- 3. Embossed label band — raised cylinder wrapping the waist --------
    const labelTexture = new THREE.TextureLoader().load('/sauce-label.png');
    labelTexture.wrapS = THREE.ClampToEdgeWrapping;
    labelTexture.wrapT = THREE.ClampToEdgeWrapping;
    const labelMat = new THREE.MeshStandardMaterial({
      map: labelTexture,
      roughness: 0.55,
      metalness: 0.04,
      transparent: true,
      side: THREE.DoubleSide,
    });
    // Curved label band that follows the waist taper — uses a 2-segment lathe
    // matching the body profile so the label sits flush against the bottle.
    const labelTopY = 0.66;
    const labelBotY = 0.40;
    const labelBandProfile = [
      new THREE.Vector2(0.290, labelBotY),
      new THREE.Vector2(0.286, (labelBotY + labelTopY) / 2),
      new THREE.Vector2(0.290, labelTopY),
    ];
    // Backing layer (dark) — flush, gives the label its background
    const labelBackingProfile = labelBandProfile.map(p => new THREE.Vector2(p.x + 0.001, p.y));
    this.bottle.add(new THREE.Mesh(rotateGeo(new THREE.LatheGeometry(labelBackingProfile, segments)), labelBaseMat));
    // Label artwork — slightly raised above the backing
    const labelArtProfile = labelBandProfile.map(p => new THREE.Vector2(p.x + 0.005, p.y));
    this.bottle.add(new THREE.Mesh(rotateGeo(new THREE.LatheGeometry(labelArtProfile, segments)), labelMat));

    // Metallic gold trim rings at top & bottom of the label
    const trimRingTop = new THREE.Mesh(
      new THREE.TorusGeometry(0.292, 0.008, 12, segments),
      labelTrimMat
    );
    trimRingTop.position.z = labelTopY;
    trimRingTop.rotation.x = 0;
    this.bottle.add(trimRingTop);
    const trimRingBot = new THREE.Mesh(
      new THREE.TorusGeometry(0.292, 0.008, 12, segments),
      labelTrimMat
    );
    trimRingBot.position.z = labelBotY;
    this.bottle.add(trimRingBot);

    // -------- 4. Base accent ring (deeper green) at bottle bottom --------
    const baseRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.255, 0.012, 12, segments),
      greenDeepMat
    );
    baseRing.position.z = 0.025;
    this.bottle.add(baseRing);

    // -------- 5. Threaded collar (white) above the neck --------
    const collarMat = capMat;
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.155, 0.15, 0.07, segments),
      collarMat
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.z = 1.105 + 0.035;
    this.bottle.add(collar);
    // Three thin thread rings on the collar
    for (let index = 0; index < 3; index++) {
      const thread = new THREE.Mesh(
        new THREE.TorusGeometry(0.158, 0.006, 8, segments),
        capRingMat
      );
      thread.position.z = 1.105 + 0.012 + index * 0.022;
      this.bottle.add(thread);
    }

    // -------- 6. Cap base (cylinder) --------
    const capBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.165, 0.165, 0.06, segments),
      capMat
    );
    capBase.rotation.x = Math.PI / 2;
    capBase.position.z = 1.205;
    this.bottle.add(capBase);
    // Cap base bottom rim (slight bevel highlight)
    const capRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.166, 0.006, 12, segments),
      capRingMat
    );
    capRim.position.z = 1.18;
    this.bottle.add(capRim);

    // -------- 7. Conical dispenser nozzle (classic kitchen squeeze cap) --------
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.155, 0.16, segments),
      capMat
    );
    cone.rotation.x = Math.PI / 2;
    cone.position.z = 1.315;
    this.bottle.add(cone);

    // Tip with hole
    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.05, 0.04, segments),
      capMat
    );
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 1.415;
    this.bottle.add(tip);
    // The hole — a small dark disc on top sells the dispenser
    const tipHole = new THREE.Mesh(
      new THREE.CircleGeometry(0.018, 24),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, metalness: 0.0 })
    );
    tipHole.position.z = 1.436;
    this.bottle.add(tipHole);

    // Scale bottle to game size — new bottle is taller (cap + nozzle stack),
    // so we shrink overall to keep similar in-game footprint.
    this.bottle.scale.set(0.4, 0.4, 0.4);

    // Cast shadows on every part of the bottle
    this.bottle.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.mesh.add(this.bottle);
    this.mesh.position.z = 1;

    // Soft contact shadow blob — radial gradient sprite, sits just below the bottle
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const ctx = shadowCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.55),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
      })
    );
    contactShadow.position.z = 0.02;
    contactShadow.renderOrder = 1;
    this.contactShadow = contactShadow;
    this.mesh.add(contactShadow);

    this.computeBoundingBox();
    const size = this.boundingBox.getSize();
    this.bottle.position.set(0, 0, -this.boundingBox.min.z);

    // Compound collider: a wider box for the body and a narrow box for the
    // cap stack. Closer to the real silhouette than a single AABB → bottle
    // actually topples from the cap instead of rolling like a brick.
    const halfSize = new CANNON.Vec3().copy(size.clone().multiplyScalar(0.5));
    const bodyHalfH = halfSize.z * 0.78;
    const capHalfH = halfSize.z * 0.22;
    const bodyHalfXY = Math.min(halfSize.x, halfSize.y);
    const capHalfXY = bodyHalfXY * 0.55;

    // Offset.z = halfSize.z so mesh.position.z = body.position.z - halfSize.z
    // i.e. the mesh's origin tracks the collider's BOTTOM in world space.
    // Combined with this.bottle.position.z = -boundingBox.min.z (bottle's
    // visible base anchored at mesh origin), this makes the visible bottle
    // sit flush on the collider floor instead of floating at the body center.
    this.offset = new THREE.Vector3(0, 0, halfSize.z);

    // Body shape — covers the lower 78% (lathe body, label band, neck)
    this.body.addShape(
      new CANNON.Box(new CANNON.Vec3(bodyHalfXY, bodyHalfXY, bodyHalfH)),
      new CANNON.Vec3(0, 0, -halfSize.z + bodyHalfH)
    );
    // Cap shape — covers the upper 22% (collar + cap base + dispenser cone)
    this.body.addShape(
      new CANNON.Box(new CANNON.Vec3(capHalfXY, capHalfXY, capHalfH)),
      new CANNON.Vec3(0, 0, halfSize.z - capHalfH)
    );

    // Inertia is recomputed from shapes; do it explicitly so damping/mass
    // pair behaves predictably from the first step.
    this.body.updateMassProperties();
    this.body.sleep();

    this.mesh.add(this.polymeric.particles);
    this.mesh.add(this.sputtering.mesh);
    this.mesh.add(this.waves.mesh);

    this._proceduralLocalSize = new THREE.Box3().setFromObject(this.bottle).getSize();
    this._parentScale = this.bottle.scale.x;

    const initialUrl = BOTTLE_MODELS[Math.floor(Math.random() * BOTTLE_MODELS.length)];
    this.swapModel(initialUrl);
  }

  swapModel(url) {
    this._currentModelUrl = url;
    const proceduralLocalSize = this._proceduralLocalSize;
    const parentScale = this._parentScale;

    loadBottleModel(url)
      .then(gltfScene => {
        if (this._currentModelUrl !== url) return;

        const model = gltfScene.clone(true);
        model.rotation.x = Math.PI / 2;
        model.updateMatrixWorld(true);

        const modelSize = new THREE.Box3().setFromObject(model).getSize();

        const targetX = proceduralLocalSize.x / parentScale;
        const targetY = proceduralLocalSize.y / parentScale;
        const targetZ = proceduralLocalSize.z / parentScale;
        const fit = Math.max(
          targetX / Math.max(modelSize.x, 1e-6),
          targetY / Math.max(modelSize.y, 1e-6),
          targetZ / Math.max(modelSize.z, 1e-6)
        );
        model.scale.multiplyScalar(fit);
        model.updateMatrixWorld(true);

        const scaledBox = new THREE.Box3().setFromObject(model);
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        model.position.x -= scaledCenter.x;
        model.position.y -= scaledCenter.y;
        model.position.z -= scaledBox.min.z;
        model.position.z += this.boundingBox.min.z / parentScale;

        model.traverse(child => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        for (let i = this.bottle.children.length - 1; i >= 0; i--) {
          this.bottle.remove(this.bottle.children[i]);
        }
        this.bottle.add(model);
      })
      .catch(err => {
        console.warn('Bottle GLB load failed, keeping current mesh:', err);
      });
  }

  _tmpVec = new THREE.Vector3();
  _tmpOffset = new THREE.Vector3();
  _labelLocal = new THREE.Vector3(0, -1, 0);
  _labelWorld = new THREE.Vector3();
  _worldQ = new THREE.Quaternion();

  update() {
    if (this.connected) {
      this._tmpOffset.copy(this.offset).applyQuaternion(this.body.quaternion);
      this._tmpVec.copy(this.body.position).sub(this._tmpOffset);
      this.mesh.position.copy(this._tmpVec);
      this.mesh.quaternion.copy(this.body.quaternion);
    }
  }

  getLabelDirection() {
    this._worldQ.copy(this.mesh.quaternion).multiply(this.bottle.quaternion);
    this._labelWorld.copy(this._labelLocal).applyQuaternion(this._worldQ);
    this._labelWorld.z = 0;
    if (this._labelWorld.lengthSq() > 0.001) this._labelWorld.normalize();
    return this._labelWorld;
  }

  computeBoundingBox() {
    const boundingBox = object => {
      if (object instanceof THREE.Mesh) {
        const { geometry } = object;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        return geometry.boundingBox;
      }
      return new THREE.Box3();
    };

    const compute = object => {
      const box = boundingBox(object);
      object.children.forEach(child => {
        box.union(compute(child));
      });
      box.min.multiply(object.scale).applyEuler(object.rotation);
      box.max.multiply(object.scale).applyEuler(object.rotation);
      return box;
    };

    this.boundingBox = compute(this.mesh);
    return this.boundingBox;
  }

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

  flip(distance, direction, landingZ = this.groundZ) {
    const displacement = direction.clone().multiplyScalar(distance);
    const tumbleAxis = direction.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2).normalize();

    const { x, y } = this.mesh.position.clone().add(displacement);
    const startZ = this.mesh.position.z;
    // Arc clears the higher of source/landing surface — restaurant tables
    // have varying heights, so a fixed peak relative to source can dip below
    // the destination table.
    const peakZ = Math.max(startZ, landingZ) + FLIP_HEIGHT;
    let move = null;
    let rotate = null;
    let up = null;
    let down = null;

    move = this.trackTween(
      new TWEEN.Tween(this.mesh.position)
        .to({ x, y }, FLIP_DURATION)
        .onComplete(() => {
          this.tweens = this.tweens.filter(activeTween => activeTween !== move);
        })
    );

    const startYaw = new THREE.Euler().setFromQuaternion(this.bottle.quaternion, 'ZYX').z;
    const travelYaw = Math.atan2(direction.y, direction.x);
    let yawDelta = travelYaw - startYaw;
    while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
    while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;

    rotate = this.trackTween(
      new TWEEN.Tween({ angle: 0, yaw: startYaw })
        .to({ angle: Math.PI * 2, yaw: startYaw + yawDelta }, FLIP_DURATION)
        .easing(TWEEN.Easing.Sinusoidal.InOut)
        .onUpdate(({ angle, yaw }) => {
          const tumble = new THREE.Quaternion().setFromAxisAngle(tumbleAxis, angle);
          const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), yaw);
          this.bottle.quaternion.copy(tumble).multiply(yawQ);
        })
        .onComplete(() => {
          this.bottle.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), travelYaw);
          this.tweens = this.tweens.filter(activeTween => activeTween !== rotate);
        })
    );

    up = this.trackTween(
      new TWEEN.Tween(this.mesh.position)
        .to({ z: peakZ }, FLIP_DURATION / 2)
        .easing(TWEEN.Easing.Cubic.Out)
        .onComplete(() => {
          this.tweens = this.tweens.filter(activeTween => activeTween !== up);
        })
    );

    down = this.trackTween(
      new TWEEN.Tween(this.mesh.position)
        .to({ z: landingZ }, FLIP_DURATION / 2)
        .easing(TWEEN.Easing.Cubic.In)
        .onComplete(() => {
          this.tweens = this.tweens.filter(activeTween => activeTween !== down);
        })
    );

    up.chain(down);

    return [move, up, rotate];
  }

  fall() {
    this.body.position.copy(this.mesh.position.clone().setZ(this.groundZ + this.offset.z));
    this.body.quaternion.set(0, 0, 0, 1);
    this.body.wakeUp();
    this.connected = true;
  }

  press(pressDrop = 0) {
    this.mesh.scale.set(1, 1, 1);
    this.mesh.position.z = this.groundZ;
    let scaleTween = null;
    let positionTween = null;

    // Block compresses by `pressDrop` world units; the bottle follows that
    // drop or it'll float above the squashed block. Caller passes the
    // per-block drop based on its actual height.
    const pressedZ = this.groundZ - pressDrop;

    scaleTween = this.trackTween(
      new TWEEN.Tween(this.mesh.scale)
        .to({ x: BOTTLE_PRESSED_H, y: BOTTLE_PRESSED_H, z: BOTTLE_PRESSED_V }, PRESS_DURATION)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onComplete(() => {
          this.tweens = this.tweens.filter(activeTween => activeTween !== scaleTween);
        })
    );

    positionTween = this.trackTween(
      new TWEEN.Tween(this.mesh.position)
        .to({ z: pressedZ }, PRESS_DURATION)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onComplete(() => {
          this.tweens = this.tweens.filter(activeTween => activeTween !== positionTween);
        })
    );

    return [scaleTween, positionTween];
  }

  bounce() {
    let tween = null;
    tween = this.trackTween(
      new TWEEN.Tween(this.mesh.scale)
        .to({ x: 1, y: 1, z: 1 }, BOUNCE_DURATION)
        .easing(TWEEN.Easing.Elastic.Out)
        .onComplete(() => {
          this.tweens = this.tweens.filter(activeTween => activeTween !== tween);
        })
    );
    return [tween];
  }
}
