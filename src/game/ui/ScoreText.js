import { FRUSTUM_HEIGHT, FRUSTUM_SCALE, FRUSTUM_WIDTH } from '../config/constants';
import { ShadowText } from './Text';

export class ScoreText extends ShadowText {
  onUpdate() {
    this.mesh.position.set(FRUSTUM_WIDTH / 2, FRUSTUM_HEIGHT - this.lineHeight / 2 - 40 * FRUSTUM_SCALE, 0);
  }
}

export class CenterText extends ShadowText {
  constructor(text) {
    super(text);
    this.mesh.visible = false;
    this.mesh.scale.set(0.8, 0.65, 1);
  }

  onUpdate() {
    this.mesh.position.set(FRUSTUM_WIDTH / 2, FRUSTUM_HEIGHT / 2, 0);
  }
}

export class AddScoreText {
  text = new ShadowText('0');
  mesh = this.text.mesh;

  constructor() {
    this.mesh.scale.set(3, 3, 3);
    this.mesh.position.set(0, 0, 1);
  }
}
