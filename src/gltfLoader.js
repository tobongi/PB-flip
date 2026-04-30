/**
 * GLTFLoader adapter for Three.js 0.89 ES modules.
 * The examples/js/GLTFLoader.js expects a global THREE object.
 */
import * as THREE from 'three';

// Expose THREE globally so the example loader can attach to it
window.THREE = THREE;

// This script mutates window.THREE by adding GLTFLoader
require('three/examples/js/loaders/GLTFLoader');

// Grab it from the global
const GLTFLoader = window.THREE.GLTFLoader;

export default GLTFLoader;
