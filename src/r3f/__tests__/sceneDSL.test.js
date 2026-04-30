/* eslint-env jest */
import * as THREE from 'three';
import { buildScene, buildSceneWithRefs } from '../sceneDSL';

describe('sceneDSL.buildScene', () => {
  it('throws when given a non-object', () => {
    expect(() => buildScene(null)).toThrow(/must be an object/);
    expect(() => buildScene('mesh')).toThrow(/must be an object/);
  });

  it('throws on unknown node type', () => {
    expect(() => buildScene({ type: 'spaceship' })).toThrow(/unsupported node type "spaceship"/);
  });

  it('builds an empty group', () => {
    const obj = buildScene({ type: 'group' });
    expect(obj).toBeInstanceOf(THREE.Group);
    expect(obj.children).toHaveLength(0);
  });

  it('applies position / rotation / uniform scale', () => {
    const obj = buildScene({
      type: 'group',
      position: [1, 2, 3],
      rotation: [0.1, 0.2, 0.3],
      scale: 2,
    });
    expect(obj.position.x).toBe(1);
    expect(obj.position.y).toBe(2);
    expect(obj.position.z).toBe(3);
    expect(obj.rotation.x).toBeCloseTo(0.1);
    expect(obj.rotation.y).toBeCloseTo(0.2);
    expect(obj.rotation.z).toBeCloseTo(0.3);
    expect(obj.scale.x).toBe(2);
    expect(obj.scale.y).toBe(2);
    expect(obj.scale.z).toBe(2);
  });

  it('applies non-uniform scale arrays', () => {
    const obj = buildScene({ type: 'group', scale: [1, 2, 3] });
    expect(obj.scale.x).toBe(1);
    expect(obj.scale.y).toBe(2);
    expect(obj.scale.z).toBe(3);
  });

  it('builds a mesh with whitelisted geometry + material', () => {
    const mesh = buildScene({
      type: 'mesh',
      geometry: { type: 'box', args: [2, 2, 2] },
      material: { type: 'meshBasic', args: [{ color: 0xff0000 }] },
    });
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    expect(mesh.geometry).toBeInstanceOf(THREE.BoxGeometry);
    expect(mesh.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(mesh.material.color.getHex()).toBe(0xff0000);
  });

  it('rejects mesh without geometry / material', () => {
    expect(() =>
      buildScene({ type: 'mesh', material: { type: 'meshBasic', args: [{}] } })
    ).toThrow(/missing `geometry`/);
    expect(() =>
      buildScene({ type: 'mesh', geometry: { type: 'box', args: [1, 1, 1] } })
    ).toThrow(/missing `material`/);
  });

  it('rejects unknown geometry / material type', () => {
    expect(() =>
      buildScene({
        type: 'mesh',
        geometry: { type: 'fractal', args: [] },
        material: { type: 'meshBasic', args: [{}] },
      })
    ).toThrow(/unsupported geometry type "fractal"/);
    expect(() =>
      buildScene({
        type: 'mesh',
        geometry: { type: 'box', args: [1, 1, 1] },
        material: { type: 'plasma', args: [{}] },
      })
    ).toThrow(/unsupported material type "plasma"/);
  });

  it('passes castShadow / receiveShadow / renderOrder through to mesh', () => {
    const mesh = buildScene({
      type: 'mesh',
      geometry: { type: 'box', args: [1, 1, 1] },
      material: { type: 'meshBasic', args: [{}] },
      castShadow: true,
      receiveShadow: true,
      renderOrder: 7,
    });
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    expect(mesh.renderOrder).toBe(7);
  });

  it('accepts a pre-built THREE.Material as a material spec', () => {
    const sharedMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const mesh = buildScene({
      type: 'mesh',
      geometry: { type: 'box', args: [1, 1, 1] },
      material: sharedMat,
    });
    expect(mesh.material).toBe(sharedMat);
  });

  it('builds nested children recursively', () => {
    const obj = buildScene({
      type: 'group',
      children: [
        { type: 'group', name: 'inner' },
        {
          type: 'mesh',
          geometry: { type: 'box', args: [1, 1, 1] },
          material: { type: 'meshBasic', args: [{}] },
        },
      ],
    });
    expect(obj.children).toHaveLength(2);
    expect(obj.children[0]).toBeInstanceOf(THREE.Group);
    expect(obj.children[1]).toBeInstanceOf(THREE.Mesh);
  });

  it('populates refs for any node carrying `name`', () => {
    const refs = {};
    buildScene(
      {
        type: 'group',
        name: 'root',
        children: [
          {
            type: 'mesh',
            name: 'cube',
            geometry: { type: 'box', args: [1, 1, 1] },
            material: { type: 'meshBasic', args: [{}] },
          },
        ],
      },
      refs
    );
    expect(refs.root).toBeInstanceOf(THREE.Group);
    expect(refs.cube).toBeInstanceOf(THREE.Mesh);
  });

  it('buildSceneWithRefs returns root + refs', () => {
    const { root, refs } = buildSceneWithRefs({
      type: 'group',
      name: 'top',
      children: [{ type: 'group', name: 'child' }],
    });
    expect(root).toBeInstanceOf(THREE.Group);
    expect(refs.top).toBe(root);
    expect(refs.child).toBe(root.children[0]);
  });

  it('applies geometry rotateX bake to BufferGeometry', () => {
    const mesh = buildScene({
      type: 'mesh',
      geometry: { type: 'cylinder', args: [1, 1, 2, 8], rotateX: Math.PI / 2 },
      material: { type: 'meshBasic', args: [{}] },
    });
    // After rotateX = PI/2, a cylinder's height axis (originally Y)
    // points along Z. Bounding box height should now be ~2 along Z.
    mesh.geometry.computeBoundingBox();
    const size = mesh.geometry.boundingBox.getSize();
    expect(size.z).toBeCloseTo(2, 1);
  });
});
