/* eslint-disable no-console */
// Composite camera-framing quality metric for the in-game screenshot harness.
//
// Two scores combine into one composite:
//
//   GEOMETRIC (0..1, weight 0.7) — derived from camera + world matrices
//     and the world positions of the bottle + next table. Cheap, deterministic,
//     not fooled by lighting changes. Penalizes:
//       - bottle off-screen
//       - next table off-screen
//       - bottle and next table on the same horizontal half (overlapping)
//       - next table BEHIND the camera (forward dot < 0)
//
//   PIXEL (0..1, weight 0.3) — sanity check on the rendered PNG. Penalizes
//     the "wall fills 90% of frame" failure mode that the geometric score
//     can't see. Samples a 12×12 grid; if one solid-color cluster covers
//     more than 55% of samples, score drops linearly.
//
// Composite: score = 0.7 * geometric + 0.3 * pixel,
// with a hard floor: if geometric < 0.30 the composite is *halved* — the
// camera is in the wrong place, no amount of decent pixel coverage rescues
// that.

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

// ---------------------------------------------------------------------------
// Geometric score
// ---------------------------------------------------------------------------

// 4×4 matrix multiply v · M = (col-major three.js convention).
function projectWorldToNDC(world, projViewMatrix) {
  const m = projViewMatrix; // length 16, column-major
  const x = world.x, y = world.y, z = world.z;
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (Math.abs(w) < 1e-9) return null;
  const ndcX = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
  const ndcY = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
  const ndcZ = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
  return { x: ndcX, y: ndcY, z: ndcZ, w };
}

function ndcToScreen(ndc, width, height) {
  if (!ndc) return null;
  return {
    x: ((ndc.x + 1) / 2) * width,
    y: ((1 - ndc.y) / 2) * height,
    inFront: ndc.z >= -1 && ndc.z <= 1, // inside the frustum depth-wise
  };
}

function inFrame(screen, width, height, margin = 8) {
  if (!screen) return false;
  return screen.x >= margin && screen.x <= width - margin
      && screen.y >= margin && screen.y <= height - margin
      && screen.inFront;
}

// Continuous score for "how cinematic is this framing?". Each criterion
// returns 0..1 (not just 0/full), so the overall score actually
// differentiates between competing combos that all happen to be
// "technically on-screen". Critical when the binary metric was producing
// many 1.0 ties for transitions where the camera is technically OK but
// the bottle ends up squashed in a corner.
function scoreGeometric(gameState) {
  const reasons = [];
  if (!gameState || !gameState.projectionViewMatrix) {
    return { score: 0, reasons: ['gameState missing projectionViewMatrix'] };
  }
  const W = gameState.frameWidth, H = gameState.frameHeight;
  const bs = ndcToScreen(projectWorldToNDC(gameState.bottleWorld, gameState.projectionViewMatrix), W, H);
  const ns = ndcToScreen(projectWorldToNDC(gameState.nextTableWorld, gameState.projectionViewMatrix), W, H);

  // Score how "centered" a screen-space point is on a Gaussian-ish curve:
  // 1.0 at dead-center, 0.5 at the edge of the central 60%, 0 outside the
  // central 100%. Penalizes corner-squashed bottles and edge-of-frame
  // landing zones that the binary "in-frame" check would have rewarded.
  function centeredness(cx, cy) {
    const dx = Math.abs(cx - 0.5), dy = Math.abs(cy - 0.5);
    if (dx > 0.5 || dy > 0.5) return 0;       // off-screen
    const x = 1 - Math.min(1, dx / 0.30);     // 1 at center, 0 past 30% offset
    const y = 1 - Math.min(1, dy / 0.30);
    return Math.max(0, x * y);                 // multiplicative penalty
  }

  // (1) Bottle visibility — central 60% favored, edges score near zero.
  let bottleScore = 0;
  if (bs && bs.inFront) {
    const cx = bs.x / W, cy = bs.y / H;
    bottleScore = centeredness(cx, cy);
    reasons.push(`bottle at (${(cx*100|0)}%,${(cy*100|0)}%) centered=${bottleScore.toFixed(2)}`);
  } else {
    reasons.push('bottle off-screen or behind camera → 0');
  }

  // (2) Next-table visibility — same falloff. PLUS distance bonus: the
  // closer (= larger on screen) the better. Reward distances ≤ 8 world
  // units, plateau at 0.6× the centered score for very-far landings.
  let nextScore = 0;
  if (ns && ns.inFront) {
    const cx = ns.x / W, cy = ns.y / H;
    const c = centeredness(cx, cy);
    const dxw = gameState.nextTableWorld.x - gameState.camPos.x;
    const dyw = gameState.nextTableWorld.y - gameState.camPos.y;
    const dzw = gameState.nextTableWorld.z - gameState.camPos.z;
    const dist = Math.sqrt(dxw*dxw + dyw*dyw + dzw*dzw);
    const distBonus = Math.max(0.6, Math.min(1, 1 - (dist - 6) / 10));
    nextScore = c * distBonus;
    reasons.push(`next-table at (${(cx*100|0)}%,${(cy*100|0)}%) dist=${dist.toFixed(1)} centered=${c.toFixed(2)} → ${nextScore.toFixed(2)}`);
  } else {
    reasons.push('next-table off-screen or behind camera → 0');
  }

  // (3) Separation: bottle and next-table should NOT overlap. Reward
  // horizontal separation up to ~30% of frame width, then plateau.
  let sepScore = 0;
  if (bs && ns) {
    const dx = Math.abs(bs.x - ns.x) / W;
    sepScore = Math.min(1, dx / 0.30);
    reasons.push(`bottle↔next horiz sep ${(dx*100|0)}% of width → ${sepScore.toFixed(2)}`);
  }

  // (4) Forward-of-camera check (binary — no nuance here, you either
  // see things in front of you or behind).
  const fwd = gameState.fwd;
  const dx = gameState.nextTableWorld.x - gameState.camPos.x;
  const dy = gameState.nextTableWorld.y - gameState.camPos.y;
  const dz = gameState.nextTableWorld.z - gameState.camPos.z;
  const fwdDot = fwd.x * dx + fwd.y * dy + fwd.z * dz;
  const forwardScore = fwdDot > 0 ? 1 : 0;
  reasons.push(`next-table forward·delta=${fwdDot.toFixed(2)} → ${forwardScore}`);

  // Weighted sum: bottle 0.30 + next 0.30 + separation 0.20 + forward 0.20
  const score = 0.30 * bottleScore + 0.30 * nextScore + 0.20 * sepScore + 0.20 * forwardScore;
  return { score, reasons };
}

// ---------------------------------------------------------------------------
// Pixel score
// ---------------------------------------------------------------------------

// Coarse color bucket so two near-identical pixels collapse to one cluster.
function bucket(r, g, b) {
  return (r >> 5) * 64 * 64 + (g >> 5) * 64 + (b >> 5);
}

function scorePixel(pngBuffer) {
  if (!pngBuffer) return { score: 0.5, reasons: ['no PNG provided'] };

  let png;
  try {
    png = PNG.sync.read(pngBuffer);
  } catch (e) {
    return { score: 0.5, reasons: ['PNG decode failed: ' + e.message] };
  }
  const W = png.width, H = png.height;
  const stride = 4 * W;
  const samples = 12;
  const counts = new Map();
  let total = 0;

  for (let sy = 0; sy < samples; sy++) {
    for (let sx = 0; sx < samples; sx++) {
      const px = Math.floor(((sx + 0.5) / samples) * W);
      const py = Math.floor(((sy + 0.5) / samples) * H);
      const i = py * stride + px * 4;
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
      // Skip pure black (letterboxing on the harness viewport)
      if (r < 8 && g < 8 && b < 8) continue;
      const key = bucket(r, g, b);
      counts.set(key, (counts.get(key) || 0) + 1);
      total += 1;
    }
  }

  if (total === 0) return { score: 0, reasons: ['frame is all black'] };

  let dominant = 0;
  for (const v of counts.values()) {
    if (v > dominant) dominant = v;
  }
  const dominantFrac = dominant / total;

  const reasons = [`dominant cluster ${(dominantFrac * 100).toFixed(0)}% of samples`];
  let score = 1;
  if (dominantFrac > 0.55) {
    // Linearly drop to 0 as the frame becomes more wall-dominated.
    score = Math.max(0, 1 - (dominantFrac - 0.55) / 0.45);
    reasons.push('frame wall-dominated → pixel penalty');
  }
  return { score, reasons };
}

// ---------------------------------------------------------------------------
// Composite
// ---------------------------------------------------------------------------

function scoreFrame(gameState, pngBuffer) {
  const g = scoreGeometric(gameState);
  const p = scorePixel(pngBuffer);
  let composite = 0.7 * g.score + 0.3 * p.score;
  if (g.score < 0.30) composite *= 0.5; // camera position is wrong, halve
  return {
    geometric: g.score,
    pixel: p.score,
    score: Math.max(0, Math.min(1, composite)),
    reasons: g.reasons.concat(p.reasons),
  };
}

// CLI entry: node scripts/camera-quality-metrics.js path/to/frame.png path/to/state.json
if (require.main === module) {
  const [, , pngPath, statePath] = process.argv;
  if (!pngPath || !statePath) {
    console.error('usage: node camera-quality-metrics.js <png> <state.json>');
    process.exit(1);
  }
  const png = fs.readFileSync(path.resolve(pngPath));
  const state = JSON.parse(fs.readFileSync(path.resolve(statePath), 'utf8'));
  const r = scoreFrame(state, png);
  console.log(JSON.stringify(r, null, 2));
}

module.exports = { scoreFrame, scoreGeometric, scorePixel };
