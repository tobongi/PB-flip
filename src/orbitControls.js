/**
 * OrbitControls adapter for Three.js 0.89 examples.
 * The examples/js/controls/OrbitControls.js script expects a global THREE object.
 */
import * as THREE from 'three';

window.THREE = THREE;

require('three/examples/js/controls/OrbitControls');

const OrbitControls = window.THREE.OrbitControls;

export default OrbitControls;
