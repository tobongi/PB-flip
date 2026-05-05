/**
 * Extracts PB_ table positions from Poulet_Braise.glb by parsing the GLB JSON chunk.
 * Replicates the same transform the game applies: scale=2, rotateX=PI/2, centered on bbox.
 * Outputs table data as JSON to stdout.
 */

const fs = require('fs');
const path = require('path');

const GLB_PATH = path.join(__dirname, '../public/models/Poulet_Braise.glb');
const MODEL_SCALE = 2.0;
const MIN_TABLE_FOOTPRINT = 0.3;

// --- Parse GLB JSON chunk ---
const buf = fs.readFileSync(GLB_PATH);
const magic = buf.readUInt32LE(0);
if (magic !== 0x46546C67) throw new Error('Not a GLB file');
const jsonChunkLen = buf.readUInt32LE(12);
const jsonChunkType = buf.readUInt32LE(16);
if (jsonChunkType !== 0x4E4F534A) throw new Error('First chunk is not JSON');
const gltf = JSON.parse(buf.slice(20, 20 + jsonChunkLen).toString('utf8'));

// --- Build node world transforms ---
// Each node in gltf.nodes has optional: translation [x,y,z], rotation [x,y,z,w], scale [x,y,z], matrix [16]
// We need world transforms = parent * local for each node.

function mat4Identity() {
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
}

function mat4FromTRS(t, r, s) {
  // quaternion to rotation matrix
  const [qx, qy, qz, qw] = r;
  const [sx, sy, sz] = s;
  const [tx, ty, tz] = t;
  const x2 = qx+qx, y2 = qy+qy, z2 = qz+qz;
  const xx = qx*x2, xy = qx*y2, xz = qx*z2;
  const yy = qy*y2, yz = qy*z2, zz = qz*z2;
  const wx = qw*x2, wy = qw*y2, wz = qw*z2;
  return [
    (1-(yy+zz))*sx,  (xy+wz)*sx,      (xz-wy)*sx,      0,
    (xy-wz)*sy,      (1-(xx+zz))*sy,  (yz+wx)*sy,      0,
    (xz+wy)*sz,      (yz-wx)*sz,      (1-(xx+yy))*sz,  0,
    tx, ty, tz, 1
  ];
}

function mat4Mul(a, b) {
  const out = new Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[r + k*4] * b[k + c*4];
      out[r + c*4] = sum;
    }
  }
  return out;
}

function nodeLocalMatrix(node) {
  if (node.matrix) return node.matrix.slice();
  const t = node.translation || [0,0,0];
  const r = node.rotation    || [0,0,0,1];
  const s = node.scale       || [1,1,1];
  return mat4FromTRS(t, r, s);
}

function transformPoint(m, x, y, z) {
  return {
    x: m[0]*x + m[4]*y + m[8]*z  + m[12],
    y: m[1]*x + m[5]*y + m[9]*z  + m[13],
    z: m[2]*x + m[6]*y + m[10]*z + m[14],
  };
}

// Compute world matrices for all nodes via DFS
const nodes = gltf.nodes || [];
const worldMatrices = new Array(nodes.length).fill(null);

function computeWorldMatrix(nodeIdx, parentMatrix) {
  const node = nodes[nodeIdx];
  const local = nodeLocalMatrix(node);
  const world = parentMatrix ? mat4Mul(parentMatrix, local) : local;
  worldMatrices[nodeIdx] = world;
  (node.children || []).forEach(childIdx => computeWorldMatrix(childIdx, world));
}

const scenes = gltf.scenes || [];
const rootScene = gltf.scene !== undefined ? scenes[gltf.scene] : scenes[0];
(rootScene ? rootScene.nodes || [] : []).forEach(ni => computeWorldMatrix(ni, null));

// --- Gather PB_ nodes and their ancestry ---
// Build parent map
const parentOf = new Array(nodes.length).fill(-1);
nodes.forEach((node, idx) => {
  (node.children || []).forEach(childIdx => { parentOf[childIdx] = idx; });
});

function hasPBAncestor(nodeIdx) {
  let p = parentOf[nodeIdx];
  while (p >= 0) {
    if ((nodes[p].name || '').startsWith('PB_')) return true;
    p = parentOf[p];
  }
  return false;
}

// For each PB_ top-level node, compute axis-aligned bounding box from all descendant meshes.
// We use the accessor min/max (POSITION attribute) transformed by world matrix.
const accessors = gltf.accessors || [];
const bufferViews = gltf.bufferViews || [];
const meshes = gltf.meshes || [];

function getNodeBBox(nodeIdx) {
  const node = nodes[nodeIdx];
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  function visit(ni) {
    const n = nodes[ni];
    const wm = worldMatrices[ni];
    if (wm && n.mesh !== undefined) {
      const mesh = meshes[n.mesh];
      (mesh.primitives || []).forEach(prim => {
        const posIdx = (prim.attributes || {}).POSITION;
        if (posIdx === undefined) return;
        const acc = accessors[posIdx];
        if (!acc || !acc.min || !acc.max) return;
        // Transform all 8 corners of the accessor bbox
        const corners = [];
        [acc.min[0], acc.max[0]].forEach(x =>
          [acc.min[1], acc.max[1]].forEach(y =>
            [acc.min[2], acc.max[2]].forEach(z =>
              corners.push(transformPoint(wm, x, y, z)))));
        corners.forEach(pt => {
          if (pt.x < minX) minX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.z < minZ) minZ = pt.z;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y > maxY) maxY = pt.y;
          if (pt.z > maxZ) maxZ = pt.z;
        });
      });
    }
    (n.children || []).forEach(visit);
  }

  visit(nodeIdx);
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

// --- Apply game's model transform: scale=2, rotateX=PI/2, then center ---
// rotateX(PI/2): (x,y,z) -> (x, -z, y)
// scale=2: multiply all by 2
// centering: we'll do it after collecting all tables

const rawTables = [];
nodes.forEach((node, idx) => {
  if (!(node.name || '').startsWith('PB_')) return;
  if (hasPBAncestor(idx)) return;

  const bb = getNodeBBox(idx);
  if (!isFinite(bb.minX) || !isFinite(bb.maxX)) return;

  // Apply scale
  const s = MODEL_SCALE;
  const sbb = { minX: bb.minX*s, minY: bb.minY*s, minZ: bb.minZ*s,
                maxX: bb.maxX*s, maxY: bb.maxY*s, maxZ: bb.maxZ*s };

  // Apply rotateX(PI/2): new(x,y,z) = (x, -z, y)
  const rbb = {
    minX: sbb.minX,
    minY: Math.min(-sbb.maxZ, -sbb.minZ),
    minZ: Math.min(sbb.minY, sbb.maxY),
    maxX: sbb.maxX,
    maxY: Math.max(-sbb.maxZ, -sbb.minZ),
    maxZ: Math.max(sbb.minY, sbb.maxY),
  };

  const sizeX = rbb.maxX - rbb.minX;
  const sizeY = rbb.maxY - rbb.minY;
  const sizeZ = rbb.maxZ - rbb.minZ;

  if (sizeX < MIN_TABLE_FOOTPRINT || sizeY < MIN_TABLE_FOOTPRINT) return;

  const cx = (rbb.minX + rbb.maxX) / 2;
  const cy = (rbb.minY + rbb.maxY) / 2;
  const cz = rbb.maxZ; // top surface z

  rawTables.push({ name: node.name, cx, cy, cz, sizeX, sizeY, sizeZ, rbb });
});

// Center: subtract model bbox center x/y and model bbox minZ
const allMinX = Math.min(...rawTables.map(t => t.rbb.minX));
const allMaxX = Math.max(...rawTables.map(t => t.rbb.maxX));
const allMinY = Math.min(...rawTables.map(t => t.rbb.minY));
const allMaxY = Math.max(...rawTables.map(t => t.rbb.maxY));
const allMinZ = Math.min(...rawTables.map(t => t.rbb.minZ));
const allMaxZ = Math.max(...rawTables.map(t => t.rbb.maxZ));
const centerX = (allMinX + allMaxX) / 2;
const centerY = (allMinY + allMaxY) / 2;

const preTables = rawTables.map(t => ({
  name: t.name,
  x: t.cx - centerX,
  y: t.cy - centerY,
  z: t.cz - allMinZ,
  width: t.sizeX,
  depth: t.sizeY,
}));

// Floor bounds (for reference)
const floorBounds = {
  minX: allMinX - centerX + 0.5,
  maxX: allMaxX - centerX - 0.5,
  minY: allMinY - centerY + 0.5,
  maxY: allMaxY - centerY - 0.5,
};

// --- Order tables (nearest-neighbor from origin) ---
function orderTables(tables) {
  if (tables.length === 0) return tables;
  const remaining = tables.slice();
  const ordered = [];
  let minDist = Infinity, minIdx = 0;
  remaining.forEach((t, i) => {
    const d = t.x*t.x + t.y*t.y;
    if (d < minDist) { minDist = d; minIdx = i; }
  });
  let idx = 0;
  let cur = remaining.splice(minIdx, 1)[0];
  cur.index = idx++;
  ordered.push(cur);
  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    minDist = Infinity; minIdx = 0;
    remaining.forEach((t, i) => {
      const dx = t.x - last.x, dy = t.y - last.y;
      const d = dx*dx + dy*dy;
      if (d < minDist) { minDist = d; minIdx = i; }
    });
    cur = remaining.splice(minIdx, 1)[0];
    cur.index = idx++;
    ordered.push(cur);
  }
  return ordered;
}

function assignCameraAngle(tables) {
  tables.forEach(t => {
    if      (t.index <= 8)  t.cameraAngle = 0;
    else if (t.index <= 12) t.cameraAngle = Math.PI / 2;
    else if (t.index <= 13) t.cameraAngle = Math.PI / 4;
    else if (t.index <= 20) t.cameraAngle = 0;
    else if (t.index <= 25) t.cameraAngle = -Math.PI / 2;
    else                    t.cameraAngle = -Math.PI;
  });
}

const ordered = orderTables(preTables);
assignCameraAngle(ordered);

const output = { tables: ordered, floorBounds };
process.stdout.write(JSON.stringify(output, null, 2));
