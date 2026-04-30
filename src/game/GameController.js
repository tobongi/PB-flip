import * as THREE from 'three';
import TWEEN from '@tweenjs/tween.js';
import Rx from 'rxjs/Rx';

import Twister from 'mersenne-twister';

import Bottle, { BOTTLE_MODELS } from './entities/Bottle';
import Block from './entities/Block';
import { cubes, getCubeById } from './entities/blockCatalog';
import InputController from './input/InputController';
import { AddScoreText, CenterText, ScoreText } from './ui/ScoreText';
import { debugConfig, isDebugEnabled } from './config/debug';
import {
  BLOCK_PRESSED_H,
  FLIP_DISTANCE_UNIT,
  FLIP_DURATION,
  FRUSTUM_HEIGHT,
  FRUSTUM_WIDTH,
  LANDING_IMPACT_DURATION,
  RESTAURANT_START_TABLE_INDEX,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  WORLDS,
  updateViewport,
} from './config/constants';
import OrbitControls from '../orbitControls';
import CameraController from './world/CameraController';
import createWorldScene from './world/WorldScene';
import { InitializeRestaurantModel } from './worlds/restaurant';

const IDENTITY_QUATERNION = { x: 0, y: 0, z: 0, w: 1 };
const ZERO_VECTOR = { x: 0, y: 0, z: 0 };

function cloneCheckpoint(checkpoint) {
  return JSON.parse(JSON.stringify(checkpoint));
}

function serializeVector(vector) {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z,
  };
}

function serializeQuaternion(quaternion) {
  return {
    x: quaternion.x,
    y: quaternion.y,
    z: quaternion.z,
    w: quaternion.w,
  };
}

function applyVector(target, value, fallback = ZERO_VECTOR) {
  const source = value || fallback;
  target.set(source.x || 0, source.y || 0, source.z || 0);
}

function applyQuaternion(target, value, fallback = IDENTITY_QUATERNION) {
  const source = value || fallback;
  target.set(source.x || 0, source.y || 0, source.z || 0, source.w === undefined ? 1 : source.w);
}

export default class Game extends THREE.EventDispatcher {
  score = 0;
  combo = 0;

  scroreText = new ScoreText(this.score);
  gameOverText = new CenterText('GAME OVER');
  addScoreText = new AddScoreText();

  gameOver = false;

  time = 0;

  flipping = false;
  falling = false;

  pause = false;

  updates = [];

  gameMode = 'restaurant';
  currentWorld = 'restaurant';
  modeBUnlocked = false;
  flipCount = 0;
  restaurantModel = null;
  restaurantTables = [];
  currentTableIndex = 0;
  floorBounds = null;

  randomSeed = 0;
  randomCalls = 0;
  random = Math.random;

  lastCheckpoint = null;
  pendingFailureTimeout = null;
  pendingStayScoreTimeout = null;
  debugOrbitControls = null;

  bottle = new Bottle();
  blocks = [];
  steps = [];
  step = 0;

  constructor() {
    super();
    this.resetRandom();

    Object.assign(this, createWorldScene());

    this.input = new InputController(this.renderer.domElement);
    this.down$ = this.input.down$;
    this.up$ = this.input.up$;
    this.update$ = this.input.update$;

    this.cameraController = new CameraController(
      this.camera,
      this.perspectiveCamera,
      this.light,
      this.addScoreText,
      {
        scene: this.scene,
        hemi: this.hemi,
        ambientLight: this.ambientLight,
        fill: this.fill,
        fadeOverlayOrtho: this.fadeOverlayOrtho,
        fadeOverlayPersp: this.fadeOverlayPersp,
      }
    );
    this.cameraController.captureBaseline();

    if (isDebugEnabled() && debugConfig.scene && debugConfig.scene.enableOrbitControls) {
      this.debugOrbitControls = new OrbitControls(this.camera, this.renderer.domElement);
      this.debugOrbitControls.enablePan = false;
      this.debugOrbitControls.enableKeys = false;
      this.debugOrbitControls.minPolarAngle = 0.1;
      this.debugOrbitControls.maxPolarAngle = Math.PI / 2 - 0.02;
      this.debugOrbitControls.minZoom = 0.6;
      this.debugOrbitControls.maxZoom = 4;
      this.debugOrbitControls.mouseButtons.ORBIT = THREE.MOUSE.RIGHT;
      this.debugOrbitControls.mouseButtons.PAN = -1;
      this.debugOrbitControls.addEventListener('change', () => this.render());
      console.info('[debug] Right-drag to orbit the scene and use the mouse wheel to zoom.');
    }

    this.UI.add(this.gameOverText.mesh);
    this.scroreText.mesh.visible = false;
    this.UI.add(this.scroreText.mesh);

    this.add(this.bottle);

    this.restart(20);
    this.scroreText.mesh.visible = false;

    const flipped$ = this.down$
      .filter(() => !this.falling && !this.gameOver && !this.flipping)
      .map(() => this.startFlipCharge())
      .debounce(() => this.up$)
      .map(payload => this.releaseFlipCharge(payload))
      .debounce(completes => Rx.Observable.merge(...completes).last())
      .do(() => {
        this.resolveLanding();
      })
      .map((value, index) => index);

    flipped$.subscribe();

    this.setWorld('restaurant');

    InitializeRestaurantModel(this);

    // loadRestaurantModel()
    //   .then(model => {
    //     this.restaurantModel = model;
    //     model.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
    //     model.rotation.x = Math.PI / 2;
    //     model.updateMatrixWorld(true);

    //     const modelBox = new THREE.Box3().setFromObject(model);
    //     const center = modelBox.min.clone().add(modelBox.max).multiplyScalar(0.5);
    //     model.position.x -= center.x;
    //     model.position.y -= center.y;
    //     model.position.z -= modelBox.min.z;
    //     model.updateMatrixWorld(true);

    //     this.restaurantTables = orderTables(extractTables(model));


    //     if (isDebugEnabled() && debugConfig.logTablePositions) {
    //       this.restaurantTables.forEach((table, index) => {
    //         console.log(
    //           'Table',
    //           index,
    //           table.index,
    //           table.name,
    //           'x:',
    //           table.position.x.toFixed(2),
    //           'y:',
    //           table.position.y.toFixed(2),
    //           'angle:',
    //           table.cameraAngle
    //         );
    //       });
    //     }

    //     const box2 = new THREE.Box3().setFromObject(model);
    //     if (this.debugOrbitControls) {
    //       this.debugOrbitControls.target.copy(box2.getCenter(new THREE.Vector3()));
    //       this.debugOrbitControls.update();
    //     }

    //     this.floorBounds = {
    //       minX: box2.min.x + 0.5,
    //       maxX: box2.max.x - 0.5,
    //       minY: box2.min.y + 0.5,
    //       maxY: box2.max.y - 0.5,
    //     };

    //     this.scene.add(model);
    //     this.restart();
    //     this.render();
    //   })
    //   .catch(err => {
    //     console.warn('GLB load failed:', err);
    //   });
  }

  startFlipCharge() {
    this.flipping = true;
    this.cameraController.setStateCharge();
    this.bottle.polymeric.particles.visible = true;
    this.bottle.sputtering.stop();
    this.bottle.groundZ = this.currentBlock.body.position.z + this.currentBlock.height;
    const pressDrop = this.currentBlock.height * (1 - BLOCK_PRESSED_H);
    return {
      time: this.time,
      tweens: [...this.currentBlock.press(), ...this.bottle.press(pressDrop)].map(tween => tween.start()),
    };
  }

  releaseFlipCharge({ time, tweens }) {
    this.bottle.polymeric.particles.visible = false;
    tweens.forEach(tween => {
      tween.stop();
    });

    const interval = Math.min(5000, this.time - time);
    this.flipCount += 1;
    this.steps.push([time, this.time]);

    [...this.currentBlock.bounce(), ...this.bottle.bounce()].forEach(tween => tween.start());

    const direction = this.nextBlock.mesh.position.clone().sub(this.bottle.mesh.position.clone()).setZ(0).normalize();
    const distance = (interval / 1000) * FLIP_DISTANCE_UNIT;
    const landingZ = this.nextBlock.body.position.z + this.nextBlock.height;

    const displacement = direction.clone().multiplyScalar(distance);
    this._flipLandingTarget = this.bottle.mesh.position.clone().add(displacement).setZ(landingZ);

    this.bottle.flip(distance, direction, landingZ).forEach(tween => tween.start());
    if (this.towardsBlock) {
      this.cameraController.setTarget(this.nextBlock, this.towardsBlock);
    } else {
      this.cameraController.setTarget(this.currentBlock, this.nextBlock);
    }

    // Track midpoint of bottle arc + landing zone so both stay in frame
    const landingPos = new THREE.Vector3(
      this.nextBlock.mesh.position.x,
      this.nextBlock.mesh.position.y,
      landingZ,
    );
    // Pass the Bottle entity (not raw mesh) so the camera can read
    // label world position + outward normal for tracking.
    this.cameraController.setStateFlip(this.bottle, landingPos);

    return [Rx.Observable.timer(FLIP_DURATION)];
  }

  resolveLanding() {
    this.flipping = false;
    this.cameraController.setStateLanding();
    this.cameraController.setStateIdle();

    const bottlePos = this._flipLandingTarget || this.bottle.mesh.position.clone();
    this._flipLandingTarget = null;
    this.bottle.mesh.position.copy(bottlePos);

    if (this.currentBlock.canHold(bottlePos)) {
      this.combo = 0;
      this.bottle.groundZ = this.currentBlock.body.position.z + this.currentBlock.height;
      this.bottle.mesh.position.z = this.bottle.groundZ;
      this.syncBottleBody();
      this.cameraController.setTarget(this.currentBlock, this.nextBlock);
      return;
    }

    if (!this.nextBlock.canHold(bottlePos)) {
      this.handleFailedLanding();
      return;
    }

    if (this.nextBlock.hitCenter(bottlePos)) {
      this.bottle.waves.wave(++this.combo);
    } else {
      this.combo = 0;
    }

    this.bottle.groundZ = this.nextBlock.body.position.z + this.nextBlock.height;
    this.bottle.mesh.position.z = this.bottle.groundZ;
    this.scroreText.text = (this.score += 1);

    if (this.score >= 30 && !this.modeBUnlocked) {
      this.modeBUnlocked = true;
      this.dispatchEvent({ type: 'mode-b-unlocked' });
    }

    this.bottle.sputtering.emit();
    this.syncBottleBody();

    const impactScale = this.bottle.mesh.scale;
    const squash = new TWEEN.Tween(impactScale)
      .to({ x: 1.15, y: 1.15, z: 0.8 }, LANDING_IMPACT_DURATION)
      .easing(TWEEN.Easing.Quadratic.Out);
    const restore = new TWEEN.Tween(impactScale)
      .to({ x: 1, y: 1, z: 1 }, LANDING_IMPACT_DURATION * 2)
      .easing(TWEEN.Easing.Elastic.Out);
    squash.chain(restore);
    squash.start();

    this.createBlock();
    this.nextBlock.down();
    this.cameraController.setTarget(this.currentBlock, this.nextBlock);
    this.saveRetryCheckpoint('turn-start');
    this.scheduleStayScore();
  }

  handleFailedLanding() {
    this.clearPendingStayScoreTimeout();
    this.bottle.fall();
    this.falling = true;
    this.gameOver = true;
    this.cameraController.setStateFailed();

    const shouldRetry =
      isDebugEnabled() && debugConfig.retryFromCheckpointOnFailure && this.lastCheckpoint !== null;

    this.pendingFailureTimeout = setTimeout(() => {
      this.pendingFailureTimeout = null;

      if (shouldRetry) {
        this.loadCheckpoint(this.lastCheckpoint, {
          emitEvent: false,
          updateRetryCheckpoint: false,
        });
        return;
      }

      this.falling = false;
      this.scroreText.mesh.visible = false;
      this.dispatchEvent({ type: 'gameover' });
    }, 800);
  }

  syncBottleBody() {
    this.bottle.body.position.copy(
      this.bottle.mesh.position.clone().setZ(this.bottle.groundZ + this.bottle.offset.z)
    );
    this.bottle.body.quaternion.set(0, 0, 0, 1);
    this.bottle.body.velocity.set(0, 0, 0);
    this.bottle.body.angularVelocity.set(0, 0, 0);
    this.bottle.body.sleep();
  }

  scheduleStayScore() {
    this.clearPendingStayScoreTimeout();
    const stepsLength = this.steps.length;
    this.pendingStayScoreTimeout = setTimeout(() => {
      this.pendingStayScoreTimeout = null;
      if (this.steps.length === stepsLength && !this.flipping && !this.falling && !this.gameOver) {
        this.addScore(this.currentBlock.stayScore);
      }
    }, 2000);
  }

  clearPendingFailureTimeout() {
    if (this.pendingFailureTimeout) {
      clearTimeout(this.pendingFailureTimeout);
      this.pendingFailureTimeout = null;
    }
  }

  clearPendingStayScoreTimeout() {
    if (this.pendingStayScoreTimeout) {
      clearTimeout(this.pendingStayScoreTimeout);
      this.pendingStayScoreTimeout = null;
    }
  }

  clearPendingTimeouts() {
    this.clearPendingFailureTimeout();
    this.clearPendingStayScoreTimeout();
  }

  stopGameplayTweens() {
    this.bottle.stopTweens();
    this.blocks.forEach(block => {
      block.stopTweens();
    });
  }

  resetBottleEffects() {
    this.bottle.polymeric.particles.visible = false;
    this.bottle.sputtering.stop();
    this.bottle.sputtering.mesh.children.forEach(particle => {
      particle.visible = false;
      particle.position.set(0, 0, 0);
    });
    this.bottle.waves.rings.forEach(ring => {
      ring.visible = false;
      ring.scale.set(1, 1, 1);
      ring.material.opacity = 1;
    });
  }

  clearBlocks() {
    this.blocks.forEach(block => {
      block.stopTweens();
      this.remove(block);
    });
    this.blocks.length = 0;
  }

  getTurnDirection() {
    if (!this.currentBlock || !this.nextBlock) {
      return new THREE.Vector3(1, 0, 0);
    }

    const direction = this.nextBlock.mesh.position.clone().sub(this.currentBlock.mesh.position).setZ(0);
    if (direction.lengthSq() === 0) {
      return new THREE.Vector3(1, 0, 0);
    }

    return direction.normalize();
  }

  resetBottleForTurn() {
    const currentPosition = this.currentBlock ? this.currentBlock.mesh.position.clone() : new THREE.Vector3();
    const direction = this.getTurnDirection();
    const angle = Math.atan2(direction.y, direction.x);
    const groundZ = this.currentBlock ? this.currentBlock.body.position.z + this.currentBlock.height : 0;

    this.bottle.groundZ = groundZ;
    this.bottle.connected = false;
    this.bottle.mesh.position.copy(currentPosition).setZ(groundZ);
    this.bottle.mesh.quaternion.set(0, 0, 0, 1);
    this.bottle.mesh.scale.set(1, 1, 1);
    if (!this.currentBlock) {
      this.bottle.bottle.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
    }
    this.bottle.body.position.copy(this.bottle.mesh.position.clone().setZ(groundZ + this.bottle.offset.z));
    this.bottle.body.quaternion.set(0, 0, 0, 1);
    this.bottle.body.velocity.set(0, 0, 0);
    this.bottle.body.angularVelocity.set(0, 0, 0);
    this.bottle.body.sleep();
    this.resetBottleEffects();
  }

  getRandomState() {
    return {
      seed: this.randomSeed,
      calls: this.randomCalls,
    };
  }

  resetRandom(seed = Math.floor(Math.random() * 0xffffff), calls = 0) {
    this.randomSeed = seed;
    this.randomCalls = 0;

    const twister = new Twister(seed);
    this.random = () => {
      const value = twister.random();
      this.randomCalls += 1;
      return value;
    };

    for (let index = 0; index < calls; index++) {
      this.random();
    }
  }

  resestRandom(seed = Math.floor(Math.random() * 0xffffff), calls = 0) {
    this.resetRandom(seed, calls);
  }

  serializeBlock(block, logical = false) {
    const meshPosition = logical ? block.body.position : block.mesh.position;
    return {
      cubeId: block.cubeId,
      scale: block.scale,
      stayScore: block.stayScore,
      visible: block.mesh.visible,
      tableAngle: block._tableAngle || 0,
      needsLookAt: Boolean(block._needsLookAt),
      cameraOffsetX: block._cameraOffsetX || 0,
      cameraOffsetY: block._cameraOffsetY || 0,
      padHalfX: block.padHalfX,
      padHalfY: block.padHalfY,
      mesh: {
        position: serializeVector(meshPosition),
        quaternion: serializeQuaternion(block.mesh.quaternion),
        scale: serializeVector(block.mesh.scale),
      },
      body: {
        position: serializeVector(block.body.position),
        quaternion: serializeQuaternion(block.body.quaternion),
      },
    };
  }

  restoreBlock(blockState) {
    const block = new Block(getCubeById(blockState.cubeId), blockState.scale);
    block.stayScore = blockState.stayScore;
    block._tableAngle = blockState.tableAngle || 0;
    block._needsLookAt = Boolean(blockState.needsLookAt);
    block._cameraOffsetX = blockState.cameraOffsetX || 0;
    block._cameraOffsetY = blockState.cameraOffsetY || 0;
    if (typeof blockState.padHalfX === 'number') block.padHalfX = blockState.padHalfX;
    if (typeof blockState.padHalfY === 'number') block.padHalfY = blockState.padHalfY;

    applyVector(block.body.position, blockState.body && blockState.body.position ? blockState.body.position : ZERO_VECTOR);
    applyQuaternion(
      block.body.quaternion,
      blockState.body && blockState.body.quaternion ? blockState.body.quaternion : IDENTITY_QUATERNION
    );
    block.restZ = block.body.position.z;
    applyVector(
      block.mesh.position,
      blockState.mesh && blockState.mesh.position ? blockState.mesh.position : blockState.body && blockState.body.position
    );
    applyQuaternion(
      block.mesh.quaternion,
      blockState.mesh && blockState.mesh.quaternion ? blockState.mesh.quaternion : IDENTITY_QUATERNION
    );
    applyVector(
      block.mesh.scale,
      blockState.mesh && blockState.mesh.scale ? blockState.mesh.scale : { x: block.scale, y: block.scale, z: 1 },
      { x: block.scale, y: block.scale, z: 1 }
    );
    block.mesh.visible = blockState.visible !== false;

    this.blocks.push(block);
    this.add(block);
    return block;
  }

  serializeBottle() {
    return {
      connected: this.bottle.connected,
      mesh: {
        position: serializeVector(this.bottle.mesh.position),
        quaternion: serializeQuaternion(this.bottle.mesh.quaternion),
        scale: serializeVector(this.bottle.mesh.scale),
      },
      bottle: {
        position: serializeVector(this.bottle.bottle.position),
        quaternion: serializeQuaternion(this.bottle.bottle.quaternion),
        scale: serializeVector(this.bottle.bottle.scale),
      },
      body: {
        position: serializeVector(this.bottle.body.position),
        quaternion: serializeQuaternion(this.bottle.body.quaternion),
        velocity: serializeVector(this.bottle.body.velocity),
        angularVelocity: serializeVector(this.bottle.body.angularVelocity),
      },
      effects: {
        polymericVisible: this.bottle.polymeric.particles.visible,
        sputteringVisible: this.bottle.sputtering.mesh.visible,
        waves: this.bottle.waves.rings.map(ring => ({
          visible: ring.visible,
          scale: serializeVector(ring.scale),
          opacity: ring.material.opacity,
        })),
      },
    };
  }

  restoreBottle(bottleState) {
    if (!bottleState) {
      this.resetBottleForTurn();
      return;
    }

    this.bottle.connected = Boolean(bottleState.connected);
    applyVector(
      this.bottle.mesh.position,
      bottleState.mesh && bottleState.mesh.position ? bottleState.mesh.position : { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 1 }
    );
    applyQuaternion(
      this.bottle.mesh.quaternion,
      bottleState.mesh && bottleState.mesh.quaternion ? bottleState.mesh.quaternion : IDENTITY_QUATERNION
    );
    applyVector(
      this.bottle.mesh.scale,
      bottleState.mesh && bottleState.mesh.scale ? bottleState.mesh.scale : { x: 1, y: 1, z: 1 },
      { x: 1, y: 1, z: 1 }
    );
    applyVector(
      this.bottle.bottle.position,
      bottleState.bottle && bottleState.bottle.position ? bottleState.bottle.position : this.bottle.offset,
      this.bottle.offset
    );
    applyQuaternion(
      this.bottle.bottle.quaternion,
      bottleState.bottle && bottleState.bottle.quaternion ? bottleState.bottle.quaternion : IDENTITY_QUATERNION
    );
    applyVector(
      this.bottle.bottle.scale,
      bottleState.bottle && bottleState.bottle.scale ? bottleState.bottle.scale : { x: 0.51, y: 0.51, z: 0.51 },
      { x: 0.51, y: 0.51, z: 0.51 }
    );
    applyVector(
      this.bottle.body.position,
      bottleState.body && bottleState.body.position ? bottleState.body.position : this.bottle.mesh.position
    );
    applyQuaternion(
      this.bottle.body.quaternion,
      bottleState.body && bottleState.body.quaternion ? bottleState.body.quaternion : IDENTITY_QUATERNION
    );
    applyVector(
      this.bottle.body.velocity,
      bottleState.body && bottleState.body.velocity ? bottleState.body.velocity : ZERO_VECTOR
    );
    applyVector(
      this.bottle.body.angularVelocity,
      bottleState.body && bottleState.body.angularVelocity ? bottleState.body.angularVelocity : ZERO_VECTOR
    );

    this.bottle.groundZ = this.currentBlock ? this.currentBlock.body.position.z + this.currentBlock.height : 0;

    if (this.bottle.connected) {
      this.bottle.body.wakeUp();
    } else {
      this.bottle.body.sleep();
    }

    this.resetBottleEffects();

    const effects = bottleState.effects;
    if (!effects) {
      return;
    }

    this.bottle.polymeric.particles.visible = Boolean(effects.polymericVisible);
    this.bottle.sputtering.mesh.visible = Boolean(effects.sputteringVisible);

    if (effects.waves) {
      this.bottle.waves.rings.forEach((ring, index) => {
        const ringState = effects.waves[index];
        if (!ringState) {
          ring.visible = false;
          ring.scale.set(1, 1, 1);
          ring.material.opacity = 1;
          return;
        }

        ring.visible = Boolean(ringState.visible);
        applyVector(ring.scale, ringState.scale, { x: 1, y: 1, z: 1 });
        ring.material.opacity = ringState.opacity === undefined ? 1 : ringState.opacity;
      });
    }
  }

  createCheckpoint({ logical = false, reason = 'manual' } = {}) {
    return {
      meta: {
        version: 1,
        createdAt: Date.now(),
        logical,
        reason,
      },
      seed: this.randomSeed,
      worldId: this.currentWorld,
      mode: this.gameMode,
      tableIndex: this.currentTableIndex,
      score: this.score,
      combo: this.combo,
      flipCount: this.flipCount,
      phase: {
        gameOver: logical ? false : this.gameOver,
        flipping: logical ? false : this.flipping,
        falling: logical ? false : this.falling,
        pause: this.pause,
      },
      steps: this.steps.map(step => step.slice()),
      blocks: this.blocks.map(block => this.serializeBlock(block, logical)),
      bottle: this.serializeBottle(),
      camera: {
        position: serializeVector(this.camera.position),
        quaternion: serializeQuaternion(this.camera.quaternion),
      },
      ui: {
        scoreVisible: this.scroreText.mesh.visible,
        gameOverVisible: this.gameOverText.mesh.visible,
      },
      pendingSpawnState: {
        randomState: this.getRandomState(),
        previewBlockCount: Math.max(0, this.blocks.length - 2),
        currentTableIndex: this.currentTableIndex,
        stepsLength: this.steps.length,
      },
    };
  }

  saveRetryCheckpoint(reason = 'retry') {
    this.lastCheckpoint = cloneCheckpoint(this.createCheckpoint({ logical: true, reason }));
    return cloneCheckpoint(this.lastCheckpoint);
  }

  loadCheckpoint(checkpoint, { emitEvent = true, updateRetryCheckpoint = true } = {}) {
    if (!checkpoint || !checkpoint.blocks || checkpoint.blocks.length < 3) {
      return null;
    }

    const restored = cloneCheckpoint(checkpoint);
    const pendingSpawnState = restored.pendingSpawnState || {};
    const randomState = pendingSpawnState.randomState || {};
    const phase = restored.phase || {};
    const uiState = restored.ui || {};

    this.clearPendingTimeouts();
    this.stopGameplayTweens();
    this.gameMode = restored.mode || this.gameMode;
    this.setWorld(restored.worldId || this.currentWorld || 'restaurant');
    this.resetRandom(
      randomState.seed === undefined ? restored.seed : randomState.seed,
      randomState.calls === undefined ? 0 : randomState.calls
    );

    this.score = restored.score || 0;
    this.combo = restored.combo || 0;
    this.flipCount = restored.flipCount || 0;
    this.steps = restored.steps ? restored.steps.map(step => step.slice()) : [];
    this.currentTableIndex = restored.tableIndex === undefined ? 0 : restored.tableIndex;
    this.gameOver = Boolean(phase.gameOver);
    this.flipping = Boolean(phase.flipping);
    this.falling = Boolean(phase.falling);
    this.pause = Boolean(phase.pause);

    this.scroreText.text = this.score;
    this.scroreText.mesh.visible = uiState.scoreVisible === undefined ? !this.gameOver : Boolean(uiState.scoreVisible);
    this.gameOverText.mesh.visible = Boolean(uiState.gameOverVisible);

    this.clearBlocks();
    restored.blocks.forEach(blockState => {
      this.restoreBlock(blockState);
    });
    this.restoreBottle(restored.bottle);

    this.cameraController.setTarget(this.currentBlock, this.nextBlock, true);
    this.cameraController.snap(this.bottle);

    if (updateRetryCheckpoint) {
      this.lastCheckpoint = cloneCheckpoint(restored);
    }

    this.render();

    if (emitEvent) {
      this.dispatchEvent({
        type: 'checkpoint-restored',
        checkpoint: cloneCheckpoint(restored),
      });
    }

    return cloneCheckpoint(restored);
  }

  retryCheckpoint(options = {}) {
    if (!this.lastCheckpoint) {
      return null;
    }

    return this.loadCheckpoint(this.lastCheckpoint, {
      emitEvent: options.emitEvent === undefined ? true : options.emitEvent,
      updateRetryCheckpoint: false,
    });
  }

  setWorld(worldId) {
    const world = WORLDS[worldId];
    if (!world) return;
    this.currentWorld = worldId;

    const bgColor = new THREE.Color(world.bg);
    this.scene.background = bgColor;
    this.scene.fog = new THREE.FogExp2(bgColor, world.fogDensity || 0.04);
    this.ground.material.color.set(world.ground);
    this.ambientLight.color.set(world.ambient);
    this.ambientLight.intensity = world.ambientIntensity;

    this.render();
  }

  addScore(score) {
    if (score !== 0) {
      this.scroreText.text = (this.score += score);
    }
  }

  createTableBlock() {
    const tableCount = this.restaurantTables.length;
    const tableIndex = ((this.currentTableIndex % tableCount) + tableCount) % tableCount;
    const table = this.restaurantTables[tableIndex];
    const cube = this.randomCube();
    const baseScale = Math.min(table.width, table.depth) * 0.6;
    const scale = Math.max(0.3, baseScale * (1.2 - this.difficulty * 0.5));
    const block = new Block(cube, scale);
    block.body.position.set(table.position.x, table.position.y, table.position.z);
    block.mesh.position.set(table.position.x, table.position.y, table.position.z);
    block.restZ = table.position.z;
    // The player aims at the table, not the prop on it — the table top is
    // the perceived landing pad. Use the table's true footprint for canHold
    // so visually-correct landings register as success even when the prop
    // (a tiny tray, a narrow shaker) only covers part of the table.
    block.padHalfX = table.width / 2;
    block.padHalfY = table.depth / 2;
    block._tableAngle = table.cameraAngle || 0;
    block._needsLookAt = table.needsLookAt || false;
    block._cameraOffsetX = table.cameraOffsetX || 0;
    block._cameraOffsetY = table.cameraOffsetY || 0;
    this.currentTableIndex += 1;
    block.mesh.visible = false;
    this.blocks.push(block);
    this.add(block);
    return block;
  }

  createBlock() {
    if (this.gameMode === 'restaurant' && this.restaurantTables.length > 0) {
      return this.createTableBlock();
    }

    const cube = this.randomCube();
    const scale = 1.2 - this.random() * this.difficulty * 0.6;
    const block = new Block(cube, scale);
    if (this.blocks.length) {
      const direction = this.random() > 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const last = this.blocks[this.blocks.length - 1];
      const position = last.mesh.position
        .clone()
        .add(direction.multiplyScalar(1.2 + this.random() * (1.2 + this.difficulty * 1.2)))
        .setZ(0);
      if (this.floorBounds) {
        position.x = Math.max(this.floorBounds.minX, Math.min(this.floorBounds.maxX, position.x));
        position.y = Math.max(this.floorBounds.minY, Math.min(this.floorBounds.maxY, position.y));
      }
      block.body.position.copy(position);
      block.mesh.position.copy(position);
    } else {
      block.body.position.set(0, 0, 0);
      block.mesh.position.set(0, 0, 0);
    }
    block.restZ = block.body.position.z;
    block.mesh.visible = false;
    this.blocks.push(block);
    this.add(block);

    return block;
  }

  toggleMode() {
    this.gameMode = this.gameMode === 'restaurant' ? 'freeplay' : 'restaurant';
    this.restart();
  }

  get currentBlock() {
    return this.blocks[this.blocks.length - 3];
  }

  get nextBlock() {
    return this.blocks[this.blocks.length - 2];
  }

  get towardsBlock() {
    return this.blocks[this.blocks.length - 1];
  }


  add(object) {
    this.world.addBody(object.body);
    this.scene.add(object.mesh);
  }

  remove(object) {
    this.world.remove(object.body);
    this.scene.remove(object.mesh);
  }

  start() {
    this.pause = false;
    this.render();
    requestAnimationFrame(this.update);
  }

  resolveRestartSeed(seed) {
    if (seed !== undefined && seed !== null) {
      return seed;
    }

    if (this.gameMode === 'freeplay' && isDebugEnabled() && debugConfig.freeplay.startSeed !== null) {
      return debugConfig.freeplay.startSeed;
    }

    return Math.floor(Math.random() * 0xffffff);
  }

  resolveRestartCheckpoint(seed) {
    if (seed !== undefined && seed !== null) {
      return null;
    }

    if (this.gameMode === 'freeplay' && isDebugEnabled() && debugConfig.freeplay.startCheckpoint) {
      return debugConfig.freeplay.startCheckpoint;
    }

    return null;
  }

  resolveRestaurantStartTableIndex() {
    if (this.gameMode === 'restaurant' && isDebugEnabled() && debugConfig.restaurant.startTableIndex !== null) {
      return debugConfig.restaurant.startTableIndex;
    }

    return RESTAURANT_START_TABLE_INDEX;
  }

  restart(seed = undefined) {
    const debugCheckpoint = this.resolveRestartCheckpoint(seed);
    if (debugCheckpoint) {
      return this.loadCheckpoint(debugCheckpoint, {
        emitEvent: false,
        updateRetryCheckpoint: true,
      });
    }

    this.clearPendingTimeouts();
    this.stopGameplayTweens();
    this.resetRandom(this.resolveRestartSeed(seed));
    this.gameOver = false;
    this.flipping = false;
    this.falling = false;
    this.pause = false;
    this.score = 0;
    this.combo = 0;
    this.flipCount = 0;
    this.time = 0;
    this.steps = [];
    this.currentTableIndex = this.gameMode === 'restaurant' ? this.resolveRestaurantStartTableIndex() : 0;
    this.scroreText.mesh.visible = true;
    this.gameOverText.mesh.visible = false;
    this.scroreText.text = 0;
    this.clearBlocks();
    this.createBlock();
    this.createBlock().down();
    this.createBlock();
    const modelUrl = BOTTLE_MODELS[Math.floor(Math.random() * BOTTLE_MODELS.length)];
    this.bottle.swapModel(modelUrl);
    this.resetBottleForTurn();
    this.cameraController.setTarget(this.currentBlock, this.nextBlock, true);
    this.cameraController.snap(this.bottle);
    this.saveRetryCheckpoint('restart');
    return cloneCheckpoint(this.lastCheckpoint);
  }

  render() {
    this.renderer.render(this.scene, this.cameraController.activeCamera);
  }

  resize() {
    updateViewport();
    this.renderer.setSize(SCREEN_WIDTH, SCREEN_HEIGHT);
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.camera.left = FRUSTUM_WIDTH / -2;
    this.camera.right = FRUSTUM_WIDTH / 2;
    this.camera.top = FRUSTUM_HEIGHT / 2;
    this.camera.bottom = FRUSTUM_HEIGHT / -2;
    this.camera.updateProjectionMatrix();
    if (this.perspectiveCamera) {
      this.perspectiveCamera.aspect = SCREEN_WIDTH / SCREEN_HEIGHT;
      this.perspectiveCamera.updateProjectionMatrix();
    }
    this.UI.position.set(FRUSTUM_WIDTH / -2, FRUSTUM_HEIGHT / -2, 0);
    this.scroreText.text = this.scroreText.text;
    this.render();
  }

  update = time => {
    if (this.pause) return;
    requestAnimationFrame(this.update);

    // Variable-delta fixed-step physics: render at refresh rate, simulate at
    // fixed 1/60s with up to 3 substeps so a 30fps frame still consumes the
    // right amount of simulated time. Clamp dt so a tab-switch pause doesn't
    // spawn dozens of catch-up substeps.
    const previous = this.time || time;
    const dt = Math.min(Math.max((time - previous) / 1000, 0), 1 / 20);
    this.time = time;

    TWEEN.update();
    this.world.step(1 / 60, dt, 3);
    this.bottle.update();
    this.cameraController.update(dt, this.bottle);
    this.update$.next();
    this.render();
  };

  get difficulty() {
    return 1 - Math.pow(0.5, this.steps.length / 28);
  }

  randomCube() {
    let sum = 0;
    cubes.forEach(item => {
      sum += item.prob;
    });

    let random = Math.floor(this.random() * (sum + 1));
    let index = 0;
    for (let cubeIndex = 0; cubeIndex < cubes.length; ++cubeIndex) {
      random -= cubes[cubeIndex].prob;
      if (random <= 0) {
        index = cubeIndex;
        break;
      }
    }

    return cubes[index];
  }
}
