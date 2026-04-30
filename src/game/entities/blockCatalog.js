import * as THREE from 'three';

import {
  PB_BRUN_BOIS,
  PB_GRIS_FONTE,
  PB_OR,
  PB_ORANGE,
  PB_VERT_CLAIR,
  PB_VERT_FONCE,
} from '../config/constants';

// === Restaurant prop blocks — each block is a recognizable kitchen object ===
// Every model is centered at the origin (XY) with its base sitting on z=0 so
// Block.js can stack them on the physics box uniformly.

function enableShadows(object) {
  object.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

function woodMat(color = 0x6B3A1B, { roughness = 0.85 } = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
}

function ceramicMat(color, { roughness = 0.4, metalness = 0.05 } = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function metalMat(color, { roughness = 0.3, metalness = 0.85 } = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function plasticMat(color, { roughness = 0.5, metalness = 0.1 } = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

// -------- Round wooden cutting board (replaces short cream round) --------
export function createCuttingBoard() {
  const group = new THREE.Group();
  const radius = 0.45;
  const height = 0.18;

  // Beveled wood disc — chamfered top edge for highlight catch
  const board = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 56),
    woodMat(0xB07840, { roughness: 0.8 })
  );
  board.rotation.x = Math.PI / 2;
  board.position.z = height / 2;
  group.add(board);

  // Top chamfer — slightly smaller, lighter wood for highlight rim
  const chamfer = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.96, radius, 0.04, 56),
    woodMat(0xC78A4E, { roughness: 0.7 })
  );
  chamfer.rotation.x = Math.PI / 2;
  chamfer.position.z = height - 0.02;
  group.add(chamfer);

  // Concentric grain-line rings via thin tori
  const grainColors = [0x8B5A2B, 0x9A6634];
  for (let index = 0; index < 4; index++) {
    const r = radius * (0.4 + index * 0.14);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.005, 6, 48),
      woodMat(grainColors[index % grainColors.length], { roughness: 0.95 })
    );
    ring.position.z = height + 0.001;
    group.add(ring);
  }

  // Hanging hole near edge — small dark disc
  const hole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.05, 16),
    new THREE.MeshStandardMaterial({ color: 0x1a1208, roughness: 0.95 })
  );
  hole.rotation.x = Math.PI / 2;
  hole.position.set(radius * 0.78, 0, height - 0.01);
  group.add(hole);

  enableShadows(group);
  return group;
}

// -------- Sauce/spice shaker bottle (tall narrow round) --------
export function createSpiceShaker() {
  const group = new THREE.Group();

  // Glass body — slightly tinted, with subtle taper
  const bodyProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.22, 0.0),
    new THREE.Vector2(0.22, 0.05),
    new THREE.Vector2(0.21, 0.10),
    new THREE.Vector2(0.20, 0.45),
    new THREE.Vector2(0.19, 0.55),
    new THREE.Vector2(0.16, 0.62),
  ];
  const rotMatrix = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  const bodyGeo = new THREE.LatheGeometry(bodyProfile, 36);
  bodyGeo.applyMatrix(rotMatrix);
  const body = new THREE.Mesh(
    bodyGeo,
    new THREE.MeshStandardMaterial({
      color: 0xE8743A,
      roughness: 0.32,
      metalness: 0.15,
    })
  );
  group.add(body);

  // Embossed label band (darker)
  const label = new THREE.Mesh(
    new THREE.CylinderGeometry(0.205, 0.205, 0.18, 36),
    ceramicMat(0x2D3319, { roughness: 0.6 })
  );
  label.rotation.x = Math.PI / 2;
  label.position.z = 0.28;
  group.add(label);

  // Gold trim rings around label
  for (const z of [0.19, 0.37]) {
    const trim = new THREE.Mesh(
      new THREE.TorusGeometry(0.207, 0.008, 8, 36),
      metalMat(0xD4A017, { roughness: 0.28, metalness: 0.9 })
    );
    trim.position.z = z;
    group.add(trim);
  }

  // Threaded neck
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.17, 0.06, 28),
    plasticMat(0xF0EDE8)
  );
  neck.rotation.x = Math.PI / 2;
  neck.position.z = 0.65;
  group.add(neck);

  // Metal screw cap with knurled rim
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.18, 0.12, 36),
    metalMat(0xC0C0C8, { roughness: 0.25, metalness: 0.95 })
  );
  cap.rotation.x = Math.PI / 2;
  cap.position.z = 0.74;
  group.add(cap);

  // Knurled rim (12 small bumps)
  for (let index = 0; index < 24; index++) {
    const angle = (index / 24) * Math.PI * 2;
    const bump = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.025, 0.10),
      metalMat(0xA8A8B0, { roughness: 0.2, metalness: 0.95 })
    );
    bump.position.set(Math.cos(angle) * 0.195, Math.sin(angle) * 0.195, 0.74);
    bump.rotation.z = angle + Math.PI / 2;
    group.add(bump);
  }

  // Cap top — perforated (via small dark dots)
  const capTop = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.19, 0.02, 36),
    metalMat(0xB8B8C0, { roughness: 0.3, metalness: 0.95 })
  );
  capTop.rotation.x = Math.PI / 2;
  capTop.position.z = 0.81;
  group.add(capTop);

  for (let ring = 0; ring < 3; ring++) {
    const count = 6 + ring * 6;
    const r = 0.04 + ring * 0.05;
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2;
      const hole = new THREE.Mesh(
        new THREE.CircleGeometry(0.012, 12),
        new THREE.MeshStandardMaterial({ color: 0x202020, roughness: 0.9, metalness: 0.0 })
      );
      hole.position.set(Math.cos(angle) * r, Math.sin(angle) * r, 0.821);
      group.add(hole);
    }
  }

  enableShadows(group);
  return group;
}

// -------- Wooden serving tray (rectangular block) --------
export function createServingTray() {
  const group = new THREE.Group();
  const w = 0.78;
  const d = 0.54;
  const h = 0.10;

  // Tray base
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(w, d, h),
    woodMat(PB_BRUN_BOIS, { roughness: 0.85 })
  );
  base.position.z = h / 2;
  group.add(base);

  // Top inset (lighter wood) — looks like the food well
  const inset = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.86, d * 0.78, 0.02),
    woodMat(0x8B5A2B, { roughness: 0.7 })
  );
  inset.position.z = h + 0.005;
  group.add(inset);

  // Raised edge frame — 4 wood strips around the perimeter
  const frameH = 0.045;
  const frameMat = woodMat(0x4F2911, { roughness: 0.9 });
  const long1 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, frameH), frameMat);
  long1.position.set(0, d / 2 - 0.025, h + frameH / 2);
  group.add(long1);
  const long2 = long1.clone();
  long2.position.set(0, -d / 2 + 0.025, h + frameH / 2);
  group.add(long2);
  const short1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, d, frameH), frameMat);
  short1.position.set(w / 2 - 0.025, 0, h + frameH / 2);
  group.add(short1);
  const short2 = short1.clone();
  short2.position.set(-w / 2 + 0.025, 0, h + frameH / 2);
  group.add(short2);

  // Side handle slots — small dark rectangles cut into the short ends
  const slotMat = new THREE.MeshStandardMaterial({ color: 0x150C04, roughness: 0.95 });
  const slot1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.20, 0.03), slotMat);
  slot1.position.set(w / 2 - 0.025 - 0.005, 0, h + frameH / 2);
  group.add(slot1);
  const slot2 = slot1.clone();
  slot2.position.set(-w / 2 + 0.025 + 0.005, 0, h + frameH / 2);
  group.add(slot2);

  enableShadows(group);
  return group;
}

// -------- Grill (improved) --------
export function createGrillBlock() {
  const group = new THREE.Group();

  // Cast iron base
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.62, 0.14),
    metalMat(PB_VERT_FONCE, { roughness: 0.55, metalness: 0.5 })
  );
  base.position.z = 0.07;
  group.add(base);

  // Charred bottom rim
  const charRim = new THREE.Mesh(
    new THREE.BoxGeometry(0.64, 0.64, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x0A0A0A, roughness: 0.95 })
  );
  charRim.position.z = 0.01;
  group.add(charRim);

  // Brushed steel rim
  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(0.64, 0.64, 0.04),
    metalMat(PB_GRIS_FONTE, { roughness: 0.32, metalness: 0.92 })
  );
  rim.position.z = 0.16;
  group.add(rim);

  // Polished steel grill bars — round bars with hot reflective material
  for (let index = -3; index <= 3; index++) {
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.58, 16),
      metalMat(0xCCCCD2, { roughness: 0.22, metalness: 0.95 })
    );
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, index * 0.105, 0.21);
    group.add(bar);
  }

  // Side handles (left/right)
  for (const sign of [-1, 1]) {
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.06, 0.014, 8, 24, Math.PI),
      metalMat(0x202020, { roughness: 0.5, metalness: 0.3 })
    );
    handle.position.set(sign * 0.34, 0, 0.18);
    handle.rotation.x = Math.PI / 2;
    handle.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2;
    group.add(handle);
  }

  // A subtle ember glow underneath (emissive disc)
  const ember = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 24),
    new THREE.MeshStandardMaterial({
      color: 0xFF5722,
      emissive: 0xFF5722,
      emissiveIntensity: 0.5,
      roughness: 1.0,
    })
  );
  ember.position.z = 0.151;
  group.add(ember);

  enableShadows(group);
  return group;
}

// -------- Tagine pot (replaces gold tall round) --------
export function createTagine() {
  const group = new THREE.Group();

  // Wide ceramic base
  const baseProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.32, 0.0),
    new THREE.Vector2(0.36, 0.04),
    new THREE.Vector2(0.38, 0.10),
    new THREE.Vector2(0.36, 0.18),
    new THREE.Vector2(0.34, 0.22),
  ];
  const rotMatrix = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  const baseGeo = new THREE.LatheGeometry(baseProfile, 48);
  baseGeo.applyMatrix(rotMatrix);
  const baseMat = ceramicMat(PB_OR, { roughness: 0.45, metalness: 0.2 });
  const base = new THREE.Mesh(baseGeo, baseMat);
  group.add(base);

  // Decorative ring around the base
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.345, 0.012, 8, 48),
    metalMat(PB_ORANGE, { roughness: 0.3, metalness: 0.85 })
  );
  ring.position.z = 0.20;
  group.add(ring);

  // Conical lid — iconic tagine cone shape
  const lidProfile = [
    new THREE.Vector2(0.0, 0.85),
    new THREE.Vector2(0.06, 0.80),
    new THREE.Vector2(0.10, 0.70),
    new THREE.Vector2(0.16, 0.55),
    new THREE.Vector2(0.24, 0.40),
    new THREE.Vector2(0.30, 0.30),
    new THREE.Vector2(0.34, 0.24),
  ];
  const lidGeo = new THREE.LatheGeometry(lidProfile, 48);
  lidGeo.applyMatrix(rotMatrix);
  const lid = new THREE.Mesh(lidGeo, baseMat);
  group.add(lid);

  // Lid knob/handle
  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 16, 12),
    metalMat(PB_ORANGE, { roughness: 0.3, metalness: 0.85 })
  );
  knob.position.z = 0.88;
  group.add(knob);

  enableShadows(group);
  return group;
}

// -------- Stack of plates (replaces white tall round) --------
export function createPlateStack() {
  const group = new THREE.Group();

  // 4 stacked plates with gold rim
  const plateColors = [0xFFFFFF, 0xFAFAFA, 0xFFFFFF, 0xFAFAFA];
  let z = 0;
  for (let index = 0; index < 4; index++) {
    const r = 0.36 - index * 0.005;
    const plateProfile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(r * 0.6, 0.0),
      new THREE.Vector2(r * 0.85, 0.005),
      new THREE.Vector2(r, 0.025),
      new THREE.Vector2(r * 0.97, 0.06),
      new THREE.Vector2(r * 0.6, 0.07),
      new THREE.Vector2(0.0, 0.075),
    ];
    const rotMatrix = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    const geo = new THREE.LatheGeometry(plateProfile, 40);
    geo.applyMatrix(rotMatrix);
    const plate = new THREE.Mesh(
      geo,
      ceramicMat(plateColors[index], { roughness: 0.25, metalness: 0.05 })
    );
    plate.position.z = z;
    group.add(plate);

    // Gold rim ring on top plate edge
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(r * 0.97, 0.004, 6, 40),
      metalMat(PB_VERT_CLAIR, { roughness: 0.35, metalness: 0.7 })
    );
    rim.position.z = z + 0.06;
    group.add(rim);

    z += 0.075;
  }

  enableShadows(group);
  return group;
}

const cubeDefinitions = [
  { model: createCuttingBoard(), stayScore: 0, prob: 3 },
  { model: createSpiceShaker(), stayScore: 2, prob: 2 },
  { model: createServingTray(), stayScore: 0, prob: 3 },
  { model: createGrillBlock(), stayScore: 8, prob: 1 },
  { model: createTagine(), stayScore: 16, prob: 1 },
  { model: createPlateStack(), stayScore: 32, prob: 1 },
];

export const cubes = cubeDefinitions.map((cube, index) => ({
  ...cube,
  id: `cube-${index}`,
}));

export function getCubeById(id) {
  return cubes.find(cube => cube.id === id) || cubes[0];
}
