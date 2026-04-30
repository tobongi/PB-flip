import * as THREE from 'three';
import * as CANNON from 'cannon';

import { debugConfig, isDebugEnabled } from '../config/debug';
import { FRUSTUM_HEIGHT, FRUSTUM_WIDTH, PB_CREAM, SCREEN_HEIGHT, SCREEN_WIDTH } from '../config/constants';

function createGradientBackground(topColor, bottomColor) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, topColor);
  gradient.addColorStop(1, bottomColor);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

export default function createWorldScene() {
  const world = new CANNON.World();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  const scene = new THREE.Scene();
  const sceneDebugConfig = debugConfig.scene || {};
  const camera = new THREE.OrthographicCamera(
    FRUSTUM_WIDTH / -2,
    FRUSTUM_WIDTH / 2,
    FRUSTUM_HEIGHT / 2,
    FRUSTUM_HEIGHT / -2,
    -40,
    1000
  );
  const UI = new THREE.Group();

  renderer.setSize(SCREEN_WIDTH, SCREEN_HEIGHT);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));

  // --- Color management & tone mapping (r89 API) ---
  renderer.gammaInput = true;
  renderer.gammaOutput = true;
  renderer.gammaFactor = 2.2;
  renderer.toneMapping = THREE.Uncharted2ToneMapping;
  renderer.toneMappingExposure = 1.15;

  // --- Soft shadows ---
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;

  // --- Sky gradient background ---
  scene.background = createGradientBackground('#FFE9C9', '#F4B97A');

  let debugGrid = null;
  if (isDebugEnabled() && sceneDebugConfig.showGrid) {
    debugGrid = new THREE.GridHelper(
      sceneDebugConfig.gridSize || 24,
      sceneDebugConfig.gridDivisions || 24,
      0xe8750a,
      0xffffff
    );
    debugGrid.rotateX(Math.PI / 2);
    debugGrid.position.z = 0.01;

    const gridMaterials = Array.isArray(debugGrid.material) ? debugGrid.material : [debugGrid.material];
    gridMaterials.forEach(material => {
      material.transparent = true;
      material.opacity = 0.35;
    });

    scene.add(debugGrid);
  }

  // === Lighting: hemisphere (sky/ground bleed) + key directional w/ shadow + soft fill ===
  const hemi = new THREE.HemisphereLight(0xFFEFD0, 0x6B3A1B, 0.55);
  hemi.position.set(0, 0, 20);
  scene.add(hemi);

  // Key light — sun-style, casts crisp soft shadows
  const light = new THREE.DirectionalLight(0xFFF1D6, 1.05);
  light.position.set(6, -8, 14);
  light.castShadow = true;
  light.shadow.mapSize.width = 2048;
  light.shadow.mapSize.height = 2048;
  light.shadow.bias = -0.0005;
  light.shadow.radius = 4;
  // Configure orthographic shadow camera large enough to cover gameplay area
  const shadowCam = light.shadow.camera;
  shadowCam.left = -12;
  shadowCam.right = 12;
  shadowCam.top = 12;
  shadowCam.bottom = -12;
  shadowCam.near = 0.5;
  shadowCam.far = 50;
  shadowCam.updateProjectionMatrix();
  scene.add(light);
  scene.add(light.target);

  // Fill light — cool tone from opposite side, no shadows, gentle
  const fill = new THREE.DirectionalLight(0xB8D4FF, 0.25);
  fill.position.set(-8, 6, 6);
  scene.add(fill);

  // Subtle ambient floor — kept for compatibility but very low so shadows have contrast
  const ambientLight = new THREE.AmbientLight(0xFFF0DD, 0.18);
  scene.add(ambientLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(FRUSTUM_WIDTH * 1.2, FRUSTUM_HEIGHT * 1.2),
    new THREE.MeshStandardMaterial({
      color: PB_CREAM,
      roughness: 0.95,
      metalness: 0.0,
    })
  );
  ground.position.z = -20;
  ground.receiveShadow = true;
  camera.add(ground);

  camera.position.set(-4, -4.8, 6.4);
  camera.up.set(0, 0, 1);
  camera.lookAt(new THREE.Vector3(0, 0, 0));

  UI.position.set(FRUSTUM_WIDTH / -2, FRUSTUM_HEIGHT / -2, 0);
  camera.add(UI);
  scene.add(camera);

  // === Physics tuning ===
  // Slightly stronger gravity than Earth — arcade snap, bottle falls feel decisive.
  world.gravity.set(0, 0, -14);

  // Sweep-and-prune broadphase: O(n) instead of O(n^2). Wins as block count grows.
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.broadphase.useBoundingBoxes = true;

  // More solver iterations = stiffer, less interpenetration on stacked bodies.
  world.solver.iterations = 14;
  world.solver.tolerance = 0.001;

  // Allow sleeping so static blocks/bottle don't burn CPU when idle.
  world.allowSleep = true;
  world.quatNormalizeFast = false;
  world.quatNormalizeSkip = 0;

  // Global contact: friction stops the bottle sliding off a glossy block,
  // restitution gives a small but satisfying bounce on impact.
  world.defaultContactMaterial.friction = 0.42;
  world.defaultContactMaterial.restitution = 0.18;
  world.defaultContactMaterial.contactEquationStiffness = 1e7;
  world.defaultContactMaterial.contactEquationRelaxation = 3;
  world.defaultContactMaterial.frictionEquationStiffness = 1e7;
  world.defaultContactMaterial.frictionEquationRelaxation = 3;

  const physicsGround = new CANNON.Body({
    mass: 0,
    type: CANNON.Body.STATIC,
  });
  physicsGround.addShape(new CANNON.Plane(), new CANNON.Vec3(0, 0, 0));
  world.addBody(physicsGround);

  return {
    world,
    renderer,
    scene,
    camera,
    light,
    ambientLight,
    hemi,
    fill,
    debugGrid,
    ground,
    UI,
  };
}
