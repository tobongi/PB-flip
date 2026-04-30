/* eslint-env jest */
import * as THREE from 'three';
import { buildCapStack, buildCapStackNode } from '../bottleCapStack';

describe('bottleCapStack', () => {
  it('produces a node tree with the expected children in z-stacked order', () => {
    const node = buildCapStackNode();
    expect(node.type).toBe('group');
    expect(node.name).toBe('cap-stack');

    const namesInOrder = node.children.map(c => c.name);
    // Collar first, then 3 threads, cap base, cap rim, cone, tip, tip hole.
    expect(namesInOrder).toEqual([
      'collar',
      'cap-thread-0',
      'cap-thread-1',
      'cap-thread-2',
      'cap-base',
      'cap-rim',
      'cone',
      'tip',
      'tip-hole',
    ]);
  });

  it('threads are vertically spaced 0.022 apart starting at collarBaseZ + 0.012', () => {
    const node = buildCapStackNode({ collarBaseZ: 1.0 });
    const threads = node.children.filter(c => c.name && c.name.indexOf('cap-thread-') === 0);
    expect(threads).toHaveLength(3);
    expect(threads[0].position[2]).toBeCloseTo(1.012);
    expect(threads[1].position[2]).toBeCloseTo(1.034);
    expect(threads[2].position[2]).toBeCloseTo(1.056);
  });

  it('builds a Group containing 9 meshes', () => {
    const { group, refs } = buildCapStack();
    expect(group).toBeInstanceOf(THREE.Group);
    const meshes = [];
    group.traverse(c => { if (c instanceof THREE.Mesh) meshes.push(c); });
    expect(meshes).toHaveLength(9);
    // Refs are populated by name for direct lookup.
    expect(refs['collar']).toBeInstanceOf(THREE.Mesh);
    expect(refs['tip-hole']).toBeInstanceOf(THREE.Mesh);
  });

  it('all meshes have shadow flags enabled (matches original Bottle.js)', () => {
    const { group } = buildCapStack();
    group.traverse(c => {
      if (c instanceof THREE.Mesh) {
        expect(c.castShadow).toBe(true);
        expect(c.receiveShadow).toBe(true);
      }
    });
  });

  it('matches original Bottle.js: collar at collarBaseZ + 0.035, cap base at 1.205', () => {
    const { refs } = buildCapStack();
    expect(refs['collar'].position.z).toBeCloseTo(1.105 + 0.035);
    expect(refs['cap-base'].position.z).toBeCloseTo(1.205);
    expect(refs['cone'].position.z).toBeCloseTo(1.315);
    expect(refs['tip'].position.z).toBeCloseTo(1.415);
    expect(refs['tip-hole'].position.z).toBeCloseTo(1.436);
  });

  it('cylindrical parts are rotated PI/2 around X (lying flat → upright on Z)', () => {
    const { refs } = buildCapStack();
    expect(refs['collar'].rotation.x).toBeCloseTo(Math.PI / 2);
    expect(refs['cap-base'].rotation.x).toBeCloseTo(Math.PI / 2);
    expect(refs['cone'].rotation.x).toBeCloseTo(Math.PI / 2);
    expect(refs['tip'].rotation.x).toBeCloseTo(Math.PI / 2);
  });
});
