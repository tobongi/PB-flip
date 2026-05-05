// Renders docs/floor-map.svg from scripts/table-data.json + the current
// per-transition overrides in src/game/worlds/restaurant.js. Re-run via
// `node scripts/generate-floor-map.js` after every camera retune so the
// floor map's annotations stay in sync with the gameplay.
//
// Outputs an SVG that shows, for every traversal hop 0→28:
//   - The table footprint at the right scale, color-coded by shape family
//     (rectangulaire / carrée / ronde / grande)
//   - The traversal path as a dashed line, plus start/end pins
//   - A tiny "T<n>" label at every tuned transition's CAMERA position
//     (computed from the override's angle + the geometric direction to the
//     next table), so the floor map answers the "where does the camera sit
//     for this hop?" question at a glance
//   - Pinned-projection chips next to overrides that force ortho or persp
//   - The hidden-mesh stack (createWallOpenings hideNames) drawn as faint
//     red rectangles where they sit in world space, so it's obvious which
//     internal walls / partitions have been removed for camera clearance
//
// Re-running after a tune cycle keeps the visual reference honest. Without
// this, the SVG silently drifts from the production overrides and starts
// claiming framings that no longer exist.

const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'table-data.json'), 'utf8'));
const { tables, floorBounds } = data;

// Pull the live overrides from restaurant.js. We can't `require` it
// directly (it imports THREE), so a regex scan is enough — we only need
// the keys, angle/zoom/shift/pitch/projection literals.
const restaurantSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'game', 'worlds', 'restaurant.js'),
  'utf8'
);

// --- Parse overrides ---
function parseOverrides(src) {
  // Find the export const TRANSITION_CAMERA_ANGLES block, then split entries
  // by their string key. We treat each `'A->B'` literal as a key boundary.
  const startIdx = src.indexOf('TRANSITION_CAMERA_ANGLES = {');
  if (startIdx === -1) return {};
  const block = src.slice(startIdx);
  const out = {};
  const re = /'([0-9]+->[0-9]+)':\s*([^,}]+|\{[^}]*\}|\{[^]*?variants:\s*\[[\s\S]*?\][\s\S]*?\})/g;
  // Simpler approach: split by the key pattern and parse each value blob up
  // to the next key or the closing of the export block.
  const keyRe = /'([0-9]+->[0-9]+)':\s*/g;
  const matches = [];
  let m;
  while ((m = keyRe.exec(block)) !== null) {
    matches.push({ key: m[1], start: keyRe.lastIndex });
  }
  for (let i = 0; i < matches.length; i++) {
    const { key, start } = matches[i];
    const end = i + 1 < matches.length ? matches[i + 1].start - key.length - 4 : block.length;
    const blob = block.slice(start, end);
    out[key] = parseOverrideBlob(blob);
  }
  return out;
  // unused noise reference to silence linter
  // eslint-disable-next-line no-unused-vars
  void re;
}

function parseOverrideBlob(blob) {
  // Strip trailing comma + newlines + potentially the closing `,` of parent.
  // The blob may be: `Math.PI * 0.5,\n  // comment\n  '13->14'...` (numeric)
  //                or `{ angle: ..., zoomScale: ..., ... },`
  //                or `{ variants: [ {...}, {...} ] },`
  const trimmed = blob.trim();
  if (trimmed.startsWith('Math.PI') || /^-?\s*Math\.PI/.test(trimmed) || /^-?\d/.test(trimmed)) {
    // Numeric angle. Take everything up to the comma (or end-of-blob).
    const numStr = trimmed.split(/[,\n]/, 1)[0];
    const angle = evalSafeNumber(numStr);
    return { kind: 'angle', angle };
  }
  if (trimmed.startsWith('{')) {
    if (/variants\s*:/.test(trimmed)) {
      const variants = parseVariants(trimmed);
      return { kind: 'variants', variants };
    }
    return { kind: 'single', ...parseSingleOverride(trimmed) };
  }
  return { kind: 'unknown', raw: trimmed.slice(0, 80) };
}

function parseSingleOverride(blob) {
  // Pull each known field from the object literal.
  const out = {};
  const angleM = blob.match(/angle\s*:\s*([^,}\n]+)/);
  if (angleM) out.angle = evalSafeNumber(angleM[1]);
  const zoomM = blob.match(/zoomScale\s*:\s*([0-9.]+)/);
  if (zoomM) out.zoomScale = parseFloat(zoomM[1]);
  const shiftM = blob.match(/lookAtShiftScale\s*:\s*([0-9.]+)/);
  if (shiftM) out.lookAtShiftScale = parseFloat(shiftM[1]);
  const pitchM = blob.match(/pitchTier\s*:\s*([0-9]+)/);
  if (pitchM) out.pitchTier = parseInt(pitchM[1], 10);
  const projM = blob.match(/forceProjection\s*:\s*'([a-z]+)'/);
  if (projM) out.forceProjection = projM[1];
  return out;
}

function parseVariants(blob) {
  // Walk the variants array and parse each `{...}` it contains.
  const arrIdx = blob.indexOf('variants:');
  const fromArr = blob.slice(arrIdx);
  const open = fromArr.indexOf('[');
  if (open === -1) return [];
  // Track brace depth to find the matching close.
  let depth = 0;
  let close = -1;
  for (let i = open; i < fromArr.length; i++) {
    if (fromArr[i] === '[') depth++;
    else if (fromArr[i] === ']') {
      depth--;
      if (depth === 0) { close = i; break; }
    }
  }
  const arrBody = fromArr.slice(open + 1, close);
  // Split by `},` at top level.
  const variants = [];
  let depthB = 0;
  let last = 0;
  for (let i = 0; i < arrBody.length; i++) {
    if (arrBody[i] === '{') depthB++;
    else if (arrBody[i] === '}') {
      depthB--;
      if (depthB === 0) {
        variants.push(parseSingleOverride(arrBody.slice(last, i + 1)));
        // Find next `{` after this, set last accordingly.
        const nextOpen = arrBody.indexOf('{', i + 1);
        if (nextOpen === -1) break;
        i = nextOpen - 1;
        last = nextOpen;
      }
    }
  }
  return variants;
}

function evalSafeNumber(expr) {
  // Allow only digits, operators, `.`, `Math.PI`, whitespace, parens.
  if (!/^[\s\d.+\-*/()]|Math\.PI/.test(expr)) return NaN;
  const cleaned = expr.replace(/Math\.PI/g, String(Math.PI));
  if (!/^[\s\d.+\-*/()]+$/.test(cleaned)) return NaN;
  try {
    // eslint-disable-next-line no-new-func
    return Function(`"use strict"; return (${cleaned});`)();
  } catch (_) {
    return NaN;
  }
}

const overrides = parseOverrides(restaurantSrc);

// --- Apply reorder so indices match runtime ---
function applyReorder(list) {
  const insertions = [{ names: ['PB_Table_Grande_02', 'PB_Table_Rect_13'], at: 9 }];
  let result = list.slice().sort((a, b) => a.index - b.index);
  for (const { names, at } of insertions) {
    const toMove = names.map(n => result.find(t => t.name === n)).filter(Boolean);
    result = result.filter(t => !names.includes(t.name));
    result.splice(at, 0, ...toMove);
  }
  return result.map((t, i) => ({ ...t, index: i }));
}

const playable = applyReorder(tables.filter(t => t.name !== 'PB_Comptoir'));
const comptoir = tables.find(t => t.name === 'PB_Comptoir');

// --- SVG geometry ---
const PAD = 50;
const W = 1200;
const H = 1200;
const fbW = floorBounds.maxX - floorBounds.minX;
const fbH = floorBounds.maxY - floorBounds.minY;
const scale = Math.min((W - 2 * PAD) / fbW, (H - 2 * PAD - 80) / fbH);
const cx = (W - (fbW * scale)) / 2 - floorBounds.minX * scale;
const cy = (H - (fbH * scale)) / 2 + floorBounds.maxY * scale + 30;
const wx = x => cx + x * scale;
const wy = y => cy - y * scale;

const colorFor = (name) => {
  if (name.includes('Ronde'))  return '#f4b860';
  if (name.includes('Carree')) return '#7cb6e8';
  if (name.includes('Grande')) return '#c389e0';
  if (name.includes('Rect'))   return '#8fd99b';
  return '#cccccc';
};

const sorted = playable.slice().sort((a, b) => a.index - b.index);
const pathD = sorted.map((t, i) =>
  `${i === 0 ? 'M' : 'L'} ${wx(t.x).toFixed(1)} ${wy(t.y).toFixed(1)}`
).join(' ');

const tableShapes = playable.map(t => {
  const w = t.width * scale;
  const h = t.depth * scale;
  const px = wx(t.x) - w / 2;
  const py = wy(t.y) - h / 2;
  const isRound = t.name.includes('Ronde');
  const fill = colorFor(t.name);
  const shape = isRound
    ? `<circle cx="${wx(t.x).toFixed(1)}" cy="${wy(t.y).toFixed(1)}" r="${(w/2).toFixed(1)}" fill="${fill}" stroke="#222" stroke-width="1.5"/>`
    : `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${fill}" stroke="#222" stroke-width="1.5"/>`;
  return `${shape}
    <text x="${wx(t.x).toFixed(1)}" y="${(wy(t.y) + 5).toFixed(1)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#111">${t.index}</text>`;
}).join('\n  ');

// --- Camera-position pins for each tuned transition ---
// For every override that pins angle (or has variants whose entries have
// non-zero angle), draw a tiny pin at the resulting camera position +
// annotate with the projection mode. Camera lives at -travelAxis * dist
// from the source bottle, where travelAxis = (cos angle, sin angle) when
// the override sets angle != 0, else the geometric direction to the next
// table.
const APPROX_CAM_DIST = 5.6; // matches _adaptiveIdleDistance ceiling

function transitionPins() {
  const pins = [];
  Object.entries(overrides).forEach(([key, value]) => {
    const [fromStr, toStr] = key.split('->');
    const from = parseInt(fromStr, 10);
    const to = parseInt(toStr, 10);
    const src = sorted.find(t => t.index === from);
    const dst = sorted.find(t => t.index === to);
    if (!src || !dst) return;

    const variants = value.kind === 'variants'
      ? value.variants
      : (value.kind === 'angle'
        ? [{ angle: value.angle }]
        : value.kind === 'single'
          ? [value]
          : []);

    variants.forEach((v, vIdx) => {
      let ax, ay;
      if (typeof v.angle === 'number' && Math.abs(v.angle) > 1e-4) {
        ax = Math.cos(v.angle);
        ay = Math.sin(v.angle);
      } else {
        // Use the geometric direction toward the next table.
        const dx = dst.x - src.x, dy = dst.y - src.y;
        const len = Math.hypot(dx, dy) || 1;
        ax = dx / len; ay = dy / len;
      }
      const camX = src.x - ax * APPROX_CAM_DIST;
      const camY = src.y - ay * APPROX_CAM_DIST;
      pins.push({
        from, to, vIdx, variantCount: variants.length, camX, camY,
        zoomScale: v.zoomScale,
        lookAtShiftScale: v.lookAtShiftScale,
        pitchTier: v.pitchTier,
        forceProjection: v.forceProjection,
      });
    });
  });
  return pins;
}

const pins = transitionPins();

const projChip = proj => {
  if (proj === 'ortho') return '#3b82f6';   // blue = ortho
  if (proj === 'persp') return '#ef4444';   // red  = persp
  return '#9ca3af';                          // gray = auto/random
};

const pinShapes = pins.map(p => {
  const x = wx(p.camX);
  const y = wy(p.camY);
  const fill = projChip(p.forceProjection);
  const r = 5;
  const label = p.variantCount > 1 ? `${p.from}→${p.to} v${p.vIdx + 1}` : `${p.from}→${p.to}`;
  // Faint connecting line from the source bottle to the camera pin.
  const src = sorted.find(t => t.index === p.from);
  const line = src
    ? `<line x1="${wx(src.x).toFixed(1)}" y1="${wy(src.y).toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${fill}" stroke-width="1" stroke-dasharray="2 2" opacity="0.5"/>`
    : '';
  return `${line}
    <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${fill}" stroke="#fff" stroke-width="1.5" opacity="0.85"/>
    <text x="${(x + 8).toFixed(1)}" y="${(y - 6).toFixed(1)}" font-family="Arial" font-size="9" fill="#222" font-weight="600">${label}</text>`;
}).join('\n  ');

// --- Comptoir ---
const compRect = (() => {
  const w = comptoir.width * scale;
  const h = comptoir.depth * scale;
  const px = wx(comptoir.x) - w / 2;
  const py = wy(comptoir.y) - h / 2;
  return `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#5a4633" stroke="#222" stroke-width="2"/>
    <text x="${wx(comptoir.x).toFixed(1)}" y="${wy(comptoir.y).toFixed(1)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#fff" transform="rotate(-90 ${wx(comptoir.x).toFixed(1)} ${wy(comptoir.y).toFixed(1)})">COMPTOIR</text>`;
})();

const startEnd = `
  <circle cx="${wx(sorted[0].x).toFixed(1)}" cy="${wy(sorted[0].y).toFixed(1)}" r="7" fill="#10b981" stroke="#fff" stroke-width="2"/>
  <circle cx="${wx(sorted[sorted.length-1].x).toFixed(1)}" cy="${wy(sorted[sorted.length-1].y).toFixed(1)}" r="7" fill="#ef4444" stroke="#fff" stroke-width="2"/>`;

// --- Hidden-mesh annotations ---
// Pulled by name → world coords from the probe scripts' findings (the
// generator can't load THREE / the GLB at parse time, so the coords are
// hand-mirrored. If you add a new entry to createWallOpenings' hideNames,
// add a row here too — the floor map then shows where the partition was.
const HIDDEN_MESHES = [
  { name: 'Cube054', x: 8.23,  y: -16.75, w: 2.9,  h: 0.15, why: '25↔26 brick veneer' },
  { name: 'Cube055', x: 8.23,  y: -16.73, w: 2.86, h: 0.15, why: '25↔26 brick veneer' },
  { name: 'Cube056', x: 8.23,  y: -16.72, w: 1.31, h: 0.04, why: '25↔26 window frame' },
  { name: 'Cube057', x: 8.23,  y: -16.76, w: 2.63, h: 0.04, why: '25↔26 window pane' },
  { name: 'Cube119', x: 8.26,  y: -19.58, w: 2.85, h: 1.43, why: '25↔26 green column' },
  { name: 'Cube148', x: 7.03,  y:  17.36, w: 2.43, h: 0.05, why: 'B↔C divider w/ poster' },
];

const hiddenShapes = HIDDEN_MESHES.map(m => {
  const w = m.w * scale, h = m.h * scale;
  const px = wx(m.x) - w / 2, py = wy(m.y) - h / 2;
  return `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${Math.max(2, w).toFixed(1)}" height="${Math.max(2, h).toFixed(1)}" fill="#dc2626" fill-opacity="0.18" stroke="#dc2626" stroke-width="1" stroke-dasharray="3 2"/>
    <title>${m.name} — hidden (${m.why})</title>`;
}).join('\n  ');

// --- Floor outline ---
const floorX = wx(floorBounds.minX);
const floorY = wy(floorBounds.maxY);
const floorW = fbW * scale;
const floorH = fbH * scale;

// --- Legend ---
const legend = `
  <g transform="translate(20, ${H - 200})">
    <rect x="0" y="0" width="280" height="180" fill="rgba(255,255,255,0.94)" stroke="#222" rx="4"/>
    <text x="10" y="22" font-family="Arial" font-size="14" font-weight="700">Legend</text>
    <rect x="10" y="32" width="14" height="14" fill="#8fd99b" stroke="#222"/><text x="32" y="44" font-family="Arial" font-size="12">Rectangulaire</text>
    <rect x="10" y="50" width="14" height="14" fill="#7cb6e8" stroke="#222"/><text x="32" y="62" font-family="Arial" font-size="12">Carrée</text>
    <circle cx="17" cy="77" r="7" fill="#f4b860" stroke="#222"/><text x="32" y="82" font-family="Arial" font-size="12">Ronde</text>
    <rect x="10" y="92" width="14" height="14" fill="#c389e0" stroke="#222"/><text x="32" y="104" font-family="Arial" font-size="12">Grande</text>
    <circle cx="170" cy="38" r="5" fill="#10b981"/><text x="182" y="42" font-family="Arial" font-size="12">Start (0)</text>
    <circle cx="170" cy="58" r="5" fill="#ef4444"/><text x="182" y="62" font-family="Arial" font-size="12">End (28)</text>
    <circle cx="170" cy="78" r="5" fill="#3b82f6"/><text x="182" y="82" font-family="Arial" font-size="12">Cam pinned ortho</text>
    <circle cx="170" cy="98" r="5" fill="#ef4444" stroke="#fff" stroke-width="1.5"/><text x="182" y="102" font-family="Arial" font-size="12">Cam pinned persp</text>
    <circle cx="170" cy="118" r="5" fill="#9ca3af"/><text x="182" y="122" font-family="Arial" font-size="12">Cam auto</text>
    <rect x="10" y="130" width="14" height="14" fill="#dc2626" fill-opacity="0.18" stroke="#dc2626" stroke-dasharray="3 2"/><text x="32" y="142" font-family="Arial" font-size="12">Hidden mesh (createWallOpenings)</text>
    <text x="10" y="160" font-family="Arial" font-size="11" fill="#555" font-weight="600">${pins.length} cam pin${pins.length === 1 ? '' : 's'} across ${Object.keys(overrides).length} override${Object.keys(overrides).length === 1 ? '' : 's'}</text>
  </g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#fafaf5"/>
  <rect x="${floorX.toFixed(1)}" y="${floorY.toFixed(1)}" width="${floorW.toFixed(1)}" height="${floorH.toFixed(1)}" fill="#efe7d6" stroke="#8a7a55" stroke-width="3"/>
  <text x="${(W/2).toFixed(1)}" y="32" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="800" fill="#222">Poulet Braisé Flip — Restaurant Floor Map</text>
  <text x="${(W/2).toFixed(1)}" y="55" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#555">29 tables · +Y up · indices = bottle traversal order 0→28 · cam pins = per-transition camera position</text>
  ${compRect}
  ${hiddenShapes}
  <path d="${pathD}" fill="none" stroke="#d97706" stroke-width="2" stroke-dasharray="6 4" opacity="0.7"/>
  ${tableShapes}
  ${pinShapes}
  ${startEnd}
  ${legend}
</svg>`;

const outPath = path.join(__dirname, '..', 'docs', 'floor-map.svg');
fs.writeFileSync(outPath, svg);
console.log('Wrote', outPath);
console.log(`  ${pins.length} cam pins across ${Object.keys(overrides).length} overrides`);
console.log(`  ${HIDDEN_MESHES.length} hidden mesh annotations`);
