import * as THREE from 'three';

import { font } from '../config/constants';

export default class Text {
  mesh = new THREE.Group();
  material = null;

  static glyphs = null;

  fontSize = 0.4;
  scale = this.fontSize / font.data.resolution;
  lineHeight = (font.data.boundingBox.yMax - font.data.boundingBox.yMin + font.data.underlineThickness) * this.scale;

  _text = '';

  constructor(text = '', material = new THREE.MeshBasicMaterial({ color: 0xffffff })) {
    if (Text.glyphs === null) {
      Text.glyphs = {};
      '+0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ '.split('').forEach(key => {
        Text.glyphs[key] = {
          geometry: new THREE.TextGeometry(key, {
            font: font,
            size: this.fontSize,
            height: 0.1,
          }),
          width: font.data.glyphs[key].ha * this.scale,
        };
      });
    }

    this.material = material;
    this._text = text.toString();
    this.redraw();
  }

  get text() {
    return this._text;
  }

  set text(text) {
    this._text = text.toString();
    this.redraw();
  }

  redraw() {
    this.mesh.children.length = 0;
    let offset = 0;

    this._text
      .toString()
      .split('')
      .map(key => {
        const glyph = new THREE.Mesh(Text.glyphs[key].geometry, this.material);
        glyph.position.set(offset, 0, 0);
        offset += Text.glyphs[key].width;
        return glyph;
      })
      .forEach(char => {
        char.position.x -= offset / 2;
        this.mesh.add(char);
      });
  }
}

export class ShadowText {
  mesh = new THREE.Group();
  fill = new Text();
  shadow = new Text('', new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, color: 0x000000 }));
  lineHeight = this.fill.lineHeight;
  _text = '';

  constructor(text = '') {
    this.text = text;
    this.shadow.mesh.position.set(0, -0.02, -0.1);
    this.mesh.add(this.fill.mesh, this.shadow.mesh);
  }

  get text() {
    return this._text;
  }

  set text(text) {
    this._text = text;
    this.fill.text = text;
    this.shadow.text = text;
    this.onUpdate();
  }

  onUpdate() {}
}
