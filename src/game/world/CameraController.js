import * as THREE from 'three';

export default class CameraController {
  _lookAtTarget = new THREE.Vector3();
  _currentLookAt = new THREE.Vector3();
  _idealPosition = new THREE.Vector3();
  _lookMatrix = new THREE.Matrix4();
  _targetQ = new THREE.Quaternion();

  radius = 7.5;
  camH = 4.5;
  orbitAngle = 0;
  damping = 4;

  constructor(camera, light, addScoreText) {
    this.camera = camera;
    this.light = light;
    this.addScoreText = addScoreText;
  }

  setTarget(currentBlock, nextBlock, snap = false) {
    const sourceZ = currentBlock ? currentBlock.body.position.z + currentBlock.height : 0;
    const destZ = nextBlock ? nextBlock.body.position.z + nextBlock.height : sourceZ;
    const lookZ = (sourceZ + destZ) / 2;

    if (currentBlock && nextBlock) {
      this._lookAtTarget
        .copy(nextBlock.mesh.position).setZ(lookZ)
        .add(currentBlock.mesh.position.clone().setZ(lookZ))
        .divideScalar(2);
    } else {
      this._lookAtTarget.set(0, 0, 0);
    }

    if (snap) {
      this._currentLookAt.copy(this._lookAtTarget);
    }

    const lightOffset = new THREE.Vector3(2, -10, 15);
    this.light.position.copy(lightOffset.add(this._lookAtTarget));
    this.light.target.position.copy(this._lookAtTarget);
  }

  update(dt, labelDir) {
    if (labelDir && labelDir.lengthSq() > 0.001) {
      const targetAngle = Math.atan2(labelDir.y, labelDir.x);
      let delta = targetAngle - this.orbitAngle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const t = 1 - Math.exp(-this.damping * dt);
      this.orbitAngle += delta * t;
    }

    const lerpT = 1 - Math.exp(-this.damping * dt);
    this._currentLookAt.lerp(this._lookAtTarget, lerpT);

    this._idealPosition.set(
      Math.cos(this.orbitAngle) * this.radius,
      Math.sin(this.orbitAngle) * this.radius,
      this.camH
    ).add(this._currentLookAt);

    this.camera.position.lerp(this._idealPosition, lerpT);

    this._lookMatrix.lookAt(this.camera.position, this._currentLookAt, this.camera.up);
    this._targetQ.setFromRotationMatrix(this._lookMatrix);
    this.camera.quaternion.slerp(this._targetQ, lerpT);

    this.addScoreText.mesh.lookAt(
      new THREE.Vector3(
        Math.cos(this.orbitAngle) * this.radius,
        Math.sin(this.orbitAngle) * this.radius,
        this.camH
      )
    );
  }

  snap(labelDir) {
    if (labelDir && labelDir.lengthSq() > 0.001) {
      this.orbitAngle = Math.atan2(labelDir.y, labelDir.x);
    }
    this._currentLookAt.copy(this._lookAtTarget);

    this._idealPosition.set(
      Math.cos(this.orbitAngle) * this.radius,
      Math.sin(this.orbitAngle) * this.radius,
      this.camH
    ).add(this._currentLookAt);

    this.camera.position.copy(this._idealPosition);

    this._lookMatrix.lookAt(this.camera.position, this._currentLookAt, this.camera.up);
    this._targetQ.setFromRotationMatrix(this._lookMatrix);
    this.camera.quaternion.copy(this._targetQ);
  }
}
