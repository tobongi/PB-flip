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
  // Performance budget: 60+ fps on every device, every environment.
  // Achieved by (1) no MSAA — antialias: false, (2) no real-time shadow
  // pass, (3) DPR pinned to 1 so we render at native resolution and let
  // the browser upscale, (4) NoToneMapping. The contact-shadow blob under
  // the bottle is a cheap textured quad (Bottle.js), not a shadow pass,
  // so the player still gets a visual ground anchor.
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
    preserveDrawingBuffer: false,
  });
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
  // Perspective camera lives alongside ortho; CameraController picks
  // which one feeds the renderer each round (random switch on landing).
  // FOV is dynamic — see CameraController.IDLE_FOV / CHARGE_FOV.
  const perspectiveCamera = new THREE.PerspectiveCamera(
    35,
    SCREEN_WIDTH / SCREEN_HEIGHT,
    0.1,
    200
  );
  perspectiveCamera.up.set(0, 0, 1);
  const UI = new THREE.Group();

  renderer.setSize(SCREEN_WIDTH, SCREEN_HEIGHT);
  // DPR strategy: render at 1.5× when the device is retina, native otherwise.
  // The 1.5× canvas gets downsampled by the browser, which is essentially
  // free supersample anti-aliasing — far cheaper than MSAA. At native DPR 2
  // a phone draws 2.25× pixels of DPR=1 (vs 4× for DPR=2), and at native
  // DPR 3 we still cap at 2.25× (vs 9× full DPR=3). On a DPR=1 monitor the
  // cap is a no-op, no perf penalty.
  const nativeDpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(Math.min(1.5, nativeDpr));

  // --- Color management ---
  // Linear-to-sRGB conversion is essentially free (per-fragment swizzle);
  // tone mapping is not. We skip tone mapping entirely (NoToneMapping is the
  // default but be explicit) — saves a fragment-shader pass on every pixel.
  renderer.gammaInput = true;
  renderer.gammaOutput = true;
  renderer.gammaFactor = 2.2;
  renderer.toneMapping = THREE.NoToneMapping;

  // --- Shadows: disabled ---
  // Real-time shadow rendering is the single most expensive feature in this
  // scene (extra render pass over the scene from the light's POV every
  // frame). The bottle has a baked contact-shadow blob (Bottle.js); the
  // tables/blocks are unobstructed and read fine without cast shadows.
  renderer.shadowMap.enabled = false;
  renderer.localClippingEnabled = false;

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

  // Key light — sun-style. Lights the scene; does not cast shadows.
  const light = new THREE.DirectionalLight(0xFFF1D6, 1.05);
  light.position.set(6, -8, 14);
  light.castShadow = false;
  scene.add(light);
  scene.add(light.target);

  // Fill light — cool tone from opposite side, no shadows, gentle
  const fill = new THREE.DirectionalLight(0xB8D4FF, 0.25);
  fill.position.set(-8, 6, 6);
  scene.add(fill);

  // Subtle ambient floor — kept for compatibility but very low so shadows have contrast
  const ambientLight = new THREE.AmbientLight(0xFFF0DD, 0.18);
  scene.add(ambientLight);

  // Backdrop floor. Used to be parented to the ortho camera as a fake
  // skybox plane at camera-local z=-20, which worked while the camera
  // was a fixed top-down isometric. The new label-tracking camera
  // controller orbits and tilts horizontally, so the camera-attached
  // plane would render as a wall in front of the bottle. Parent it to
  // the world instead, oriented flat, far below gameplay so the tables
  // stack on top of it as a real ground plane.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({
      color: PB_CREAM,
      roughness: 0.95,
      metalness: 0.0,
    })
  );
  ground.position.set(0, 0, -8);
  ground.receiveShadow = false;
  scene.add(ground);

  camera.position.set(-4, -4.8, 6.4);
  camera.up.set(0, 0, 1);
  camera.lookAt(new THREE.Vector3(0, 0, 0));

  UI.position.set(FRUSTUM_WIDTH / -2, FRUSTUM_HEIGHT / -2, 0);
  camera.add(UI);
  scene.add(camera);
  scene.add(perspectiveCamera);

  // === Failed-state fade overlay ===
  // A black quad parented to whichever camera is active, sized to fully
  // cover the screen (huge size + small near-z works for both ortho and
  // perspective). Alpha is driven by CameraController._failedT.
  function makeFadeOverlay() {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 9999;
    return mesh;
  }
  const fadeOverlayOrtho = makeFadeOverlay();
  fadeOverlayOrtho.position.set(0, 0, -0.5);
  fadeOverlayOrtho.scale.set(FRUSTUM_WIDTH * 4, FRUSTUM_HEIGHT * 4, 1);
  camera.add(fadeOverlayOrtho);

  const fadeOverlayPersp = makeFadeOverlay();
  // Plane sits 0.2 units in front of the perspective camera; sized
  // huge so it covers the whole frustum at any FOV.
  fadeOverlayPersp.position.set(0, 0, -0.2);
  fadeOverlayPersp.scale.set(2, 2, 1);
  perspectiveCamera.add(fadeOverlayPersp);

  // === Physics tuning ===
  // Slightly stronger gravity than Earth — arcade snap, bottle falls feel decisive.
  world.gravity.set(0, 0, -14);

  // Sweep-and-prune broadphase: O(n) instead of O(n^2). Wins as block count grows.
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.broadphase.useBoundingBoxes = true;

  // Solver iterations: the only dynamic body is the bottle; everything else
  // is sleeping. 8 is plenty for a single-body scene and shaves ~30% off
  // the physics step cost vs the previous 14.
  world.solver.iterations = 8;
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
    perspectiveCamera,
    fadeOverlayOrtho,
    fadeOverlayPersp,
    light,
    ambientLight,
    hemi,
    fill,
    debugGrid,
    ground,
    UI,
  };
}
