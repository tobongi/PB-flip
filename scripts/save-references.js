/* eslint-disable no-console */
// Save reference images for the auto-tuner.
//
// Known sweep references (user provided exact filenames in chat):
//   refs/16_to_17.png       ← sweep/16_to_17/1.000_a15_z0.6_s2.5.png    (Image #1)
//   refs/3_to_4_v1.png      ← sweep/3_to_4/0.580_a-20_z0.7_s2.png       (Image #5, close-up)
//   refs/3_to_4_v2.png      ← sweep/3_to_4/0.655_a-20_z0.65_s2.png      (Image #6, wider)
//   refs/4_to_5_v1.png      ← sweep/4_to_5/0.222_a-90_z0.65_s2.png      (Image #9, pure-south)
//   refs/4_to_5_v2.png      ← sweep/4_to_5/0.580_a-60_z0.65_s2.png      (Image #10, east-tilt)
//
// User-pasted references (Image #2 for 15→16, Images #3 + #4 for 14→15) ALSO
// came from the sweep folder per user. Heuristic search via filename pattern:
//   - 15→16 (Image #2): bottle lower-right + round table upper-left
//                       → positive small-to-medium angle (camera south),
//                         modest dezoom, modest lookAt shift
//                       Pattern: a15..a60 / z0.6..0.65 / s2..3
//   - 14→15 close-up (Image #3): bottle big, tray on table 15 above, olive
//                                 wall in BG. Auto direction (angle 0),
//                                 modest dezoom, small shift.
//                                 Pattern: a0 / z0.75..0.85 / s1..1.5
//   - 14→15 line-shot (Image #4): bottle smaller, line of tables receding,
//                                  heavier dezoom + shift.
//                                  Pattern: a0 / z0.65..0.75 / s2..3

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REFS_DIR = path.join(ROOT, 'docs', 'camera-screenshots', 'refs');
const SWEEP_DIR = path.join(ROOT, 'docs', 'camera-screenshots', 'sweep');

fs.mkdirSync(REFS_DIR, { recursive: true });

// Parse a sweep filename like "0.580_a-20_z0.7_s2.png" or
// "0.222_a-90_z0.65_s2.5.png" → { score, angle, zoom, shift }
function parseSweepName(filename) {
  const m = filename.match(/^([\d.]+)_a(-?[\d.]+)_z([\d.]+)_s([\d.]+)\.png$/);
  if (!m) return null;
  return {
    score: parseFloat(m[1]),
    angle: parseFloat(m[2]),
    zoom: parseFloat(m[3]),
    shift: parseFloat(m[4]),
  };
}

// Find the sweep file in `dir` whose params best match the heuristic
// `target`. Each axis carries equal weight; missing target axes are skipped.
function findClosest(dir, target) {
  if (!fs.existsSync(dir)) return null;
  const candidates = fs.readdirSync(dir).filter(f => f.endsWith('.png'));
  let best = null;
  let bestScore = Infinity;
  for (const filename of candidates) {
    const p = parseSweepName(filename);
    if (!p) continue;
    let dist = 0;
    let count = 0;
    if (target.angle !== undefined) {
      const a = target.angleRange
        ? Math.max(0, Math.abs(p.angle - target.angle) - target.angleRange)
        : Math.abs(p.angle - target.angle);
      dist += a / 60; // normalize by 60° (typical full-axis range)
      count++;
    }
    if (target.zoom !== undefined) {
      const z = target.zoomRange
        ? Math.max(0, Math.abs(p.zoom - target.zoom) - target.zoomRange)
        : Math.abs(p.zoom - target.zoom);
      dist += z / 0.2;
      count++;
    }
    if (target.shift !== undefined) {
      const s = target.shiftRange
        ? Math.max(0, Math.abs(p.shift - target.shift) - target.shiftRange)
        : Math.abs(p.shift - target.shift);
      dist += s / 1.5;
      count++;
    }
    if (count > 0) dist /= count;
    if (dist < bestScore) {
      bestScore = dist;
      best = { filename, params: p, distance: dist };
    }
  }
  return best;
}

function copyIfExists(srcAbs, destName) {
  if (!fs.existsSync(srcAbs)) {
    console.warn(`  [warn] ${srcAbs} not found, skipping`);
    return null;
  }
  const dest = path.join(REFS_DIR, destName);
  fs.copyFileSync(srcAbs, dest);
  console.log(`  [ok]   ${destName} ← ${path.relative(ROOT, srcAbs)}`);
  return dest;
}

// ---------------------------------------------------------------------------

const knownRefs = [
  ['16_to_17.png',    'sweep/16_to_17/1.000_a15_z0.6_s2.5.png',  '16->17'],
  ['3_to_4_v1.png',   'sweep/3_to_4/0.580_a-20_z0.7_s2.png',     '3->4 close-up'],
  ['3_to_4_v2.png',   'sweep/3_to_4/0.655_a-20_z0.65_s2.png',    '3->4 wider'],
  ['4_to_5_v1.png',   'sweep/4_to_5/0.222_a-90_z0.65_s2.png',    '4->5 pure-south'],
  ['4_to_5_v2.png',   'sweep/4_to_5/0.580_a-60_z0.65_s2.png',    '4->5 east-tilt'],
];

const heuristics = [
  {
    key: '15->16',
    destName: '15_to_16.png',
    sweepDir: '15_to_16',
    // Camera SE of bottle 15 looking NW. Verified visually that
    // a60_z0.6_s5 puts bottle on table + table 16 (round) on the right
    // with brick wall + olive accent — same compositional feel as Image #2.
    target: { angle: 60, zoom: 0.6, shift: 5 },
    note: 'bottle on a dark table + round table 16 (right of frame) + brick wall above',
  },
  {
    key: '14->15 close',
    destName: '14_to_15_v1.png',
    sweepDir: '14_to_15',
    target: { angle: 0, zoom: 0.78, zoomRange: 0.07, shift: 1.25, shiftRange: 0.25 },
    note: 'big bottle, tray on table 15 above → auto direction, modest dezoom, small shift',
  },
  {
    key: '14->15 line',
    destName: '14_to_15_v2.png',
    sweepDir: '14_to_15',
    target: { angle: 0, zoom: 0.7, zoomRange: 0.05, shift: 2.5, shiftRange: 0.5 },
    note: 'small bottle, line of tables receding → auto direction, heavier dezoom + shift',
  },
];

console.log('=== Known sweep references ===');
const indexEntries = {};
for (const [destName, srcRel, desc] of knownRefs) {
  const src = path.join(ROOT, 'docs', 'camera-screenshots', srcRel);
  const saved = copyIfExists(src, destName);
  if (saved) {
    const key = desc.split(' ')[0]; // "16->17" or "3->4"
    if (!indexEntries[key]) indexEntries[key] = [];
    indexEntries[key].push({
      filename: destName,
      sourceSweep: srcRel,
      params: parseSweepName(path.basename(srcRel)),
      tag: desc.includes(' ') ? desc.split(' ').slice(1).join(' ') : null,
    });
  }
}

console.log('\n=== Heuristic search for missing references ===');
const CONFIDENCE_THRESHOLD = 0.20; // best-distance must be ≤ 0.20 (=80% confidence) to accept
for (const h of heuristics) {
  const sweepDirAbs = path.join(SWEEP_DIR, h.sweepDir);
  const result = findClosest(sweepDirAbs, h.target);
  if (!result) {
    console.warn(`  [warn] ${h.key}: no candidates found in ${h.sweepDir}/, skipping`);
    continue;
  }
  const confidence = Math.max(0, 1 - result.distance);
  const ok = result.distance <= CONFIDENCE_THRESHOLD;
  console.log(`  [${ok ? 'ok ' : 'low'}] ${h.key.padEnd(16)} ${h.destName} ← sweep/${h.sweepDir}/${result.filename}`);
  console.log(`         params: a=${result.params.angle} z=${result.params.zoom} s=${result.params.shift}  confidence=${(confidence*100).toFixed(0)}%`);
  console.log(`         intent: ${h.note}`);
  if (!ok) {
    console.warn(`         skipped — confidence below 80% threshold; please save the ref manually if you want this transition tuned`);
    continue;
  }
  const src = path.join(sweepDirAbs, result.filename);
  copyIfExists(src, h.destName);
  const key = h.key.split(' ')[0];
  if (!indexEntries[key]) indexEntries[key] = [];
  indexEntries[key].push({
    filename: h.destName,
    sourceSweep: `sweep/${h.sweepDir}/${result.filename}`,
    params: result.params,
    tag: h.key.split(' ').slice(1).join(' ') || null,
    confidence,
  });
}

const indexPath = path.join(REFS_DIR, '_index.json');
fs.writeFileSync(indexPath, JSON.stringify(indexEntries, null, 2));
console.log(`\n[done] wrote ${indexPath}`);
console.log('\nKeys with refs:', Object.keys(indexEntries).join(', '));
