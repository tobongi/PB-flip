/* eslint-env jest */
// Unit tests for the composite camera-framing quality metric.
// Uses synthetic gameState fixtures + a tiny synthetic PNG so the test
// stays self-contained (no real screenshot fixtures bundled in src/).

const { scoreFrame, scoreGeometric, scorePixel } = require('../../../scripts/camera-quality-metrics');
const { PNG } = require('pngjs');

// --- helpers --------------------------------------------------------------

// Build a minimal column-major projection*view matrix that maps world XYZ
// roughly to [-1..+1]. For a unit-cube world this is just identity / scale.
function identityProj() {
  const m = new Array(16).fill(0);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

function makeGameState(overrides = {}) {
  return Object.assign({
    camPos: { x: 0, y: -5, z: 3 },
    lookAt: { x: 0, y: 0, z: 0.5 },
    fwd: { x: 0, y: 1, z: 0 },     // looking +Y
    right: { x: 1, y: 0, z: 0 },   // +X is screen right
    bottleWorld: { x: 0, y: 0, z: 0.5 },
    nextTableWorld: { x: 0.5, y: 4, z: 0.5 },
    frameWidth: 480,
    frameHeight: 800,
    projectionViewMatrix: identityProj(),
  }, overrides);
}

// Build a solid-color PNG buffer.
function solidPng(r, g, b, width = 64, height = 64) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

// Half-and-half PNG (top half color A, bottom half color B).
function halfHalfPng(a, b, width = 64, height = 64) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    const c = y < height / 2 ? a : b;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

// --- geometric tests -----------------------------------------------------

describe('scoreGeometric', () => {
  it('high score (≥0.70) when bottle and next table are both on-screen near center on opposite halves and forward', () => {
    const state = makeGameState({
      bottleWorld:    { x: -0.10, y: 0, z: 0 }, // projects near left of center
      nextTableWorld: { x:  0.10, y: 0, z: 0 }, // projects near right of center, same Y
    });
    const r = scoreGeometric(state);
    expect(r.score).toBeGreaterThanOrEqual(0.70);
  });

  it('penalizes when next table is off-screen', () => {
    const state = makeGameState({
      bottleWorld:    { x: 0, y: 0, z: 0 },
      nextTableWorld: { x: 5, y: 0, z: 0 }, // way off the right
    });
    const r = scoreGeometric(state);
    expect(r.score).toBeLessThan(0.75);
  });

  it('penalizes when next table is BEHIND the camera (forward dot < 0)', () => {
    const state = makeGameState({
      camPos: { x: 0, y: 0, z: 0 },
      fwd:    { x: 0, y: 1, z: 0 },        // looking +Y
      bottleWorld:    { x: 0,    y: 0.5, z: 0 },
      nextTableWorld: { x: 0,    y: -1,  z: 0 }, // -Y, BEHIND
    });
    const r = scoreGeometric(state);
    expect(r.score).toBeLessThanOrEqual(0.8);
    // The forward score component should be 0; reasons string now reads
    // "forward·delta=... → 0".
    expect(r.reasons.some(s => /forward.*→ 0$/.test(s))).toBe(true);
  });

  it('penalizes when bottle and next table sit close together (overlap, low separation)', () => {
    const state = makeGameState({
      bottleWorld:    { x:  0.3, y: 0, z: 0 },
      nextTableWorld: { x:  0.32, y: 0.05, z: 0 }, // virtually on top
    });
    const r = scoreGeometric(state);
    expect(r.score).toBeLessThan(0.9);
    // Separation score should be low; reasons string reads "horiz sep N% of width → x.xx".
    expect(r.reasons.some(s => /horiz sep .*→ 0\.\d/.test(s))).toBe(true);
  });
});

// --- pixel tests ---------------------------------------------------------

describe('scorePixel', () => {
  it('penalizes a frame that is one solid color (wall-dominated)', () => {
    const png = solidPng(120, 130, 100); // olive
    const r = scorePixel(png);
    expect(r.score).toBeLessThan(0.10);
  });

  it('rewards a frame with diverse colors', () => {
    // 4 stripes → 4 buckets, no single dominant
    const png = new PNG({ width: 64, height: 64 });
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const stripe = Math.floor(x / 16);
        const colors = [[200, 50, 50], [50, 200, 50], [50, 50, 200], [200, 200, 50]];
        const c = colors[stripe];
        const i = (y * 64 + x) * 4;
        png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = 255;
      }
    }
    const r = scorePixel(PNG.sync.write(png));
    expect(r.score).toBeGreaterThan(0.7);
  });

  it('handles all-black gracefully (no-op samples)', () => {
    const png = solidPng(0, 0, 0);
    const r = scorePixel(png);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });
});

// --- composite tests -----------------------------------------------------

describe('scoreFrame (composite)', () => {
  it('a clean shot (good geometry + diverse pixels) scores ≥ 0.70', () => {
    const state = makeGameState({
      bottleWorld:    { x: -0.10, y: 0, z: 0 },
      nextTableWorld: { x:  0.10, y: 0, z: 0 },
    });
    const png = halfHalfPng([200, 150, 100], [80, 60, 40]); // wood + table
    const r = scoreFrame(state, png);
    expect(r.score).toBeGreaterThanOrEqual(0.70);
  });

  it('a wall-dominated frame with otherwise-good geometry still scores < 0.70', () => {
    const state = makeGameState({
      bottleWorld:    { x: -0.10, y: 0, z: 0 },
      nextTableWorld: { x:  0.10, y: 0, z: 0 },
    });
    const png = solidPng(120, 130, 100); // wall fills the frame
    const r = scoreFrame(state, png);
    expect(r.score).toBeLessThan(0.70);
  });

  it('a frame where the next table is BEHIND the camera scores < 0.65 even with good pixels', () => {
    const state = makeGameState({
      camPos: { x: 0, y: 0, z: 0 },         // camera at origin
      fwd:    { x: 0, y: 1, z: 0 },         // looking +Y
      bottleWorld:    { x: 0,    y: 0.5, z: 0 }, // in front
      nextTableWorld: { x: 0,    y: -1,  z: 0 }, // BEHIND camera (-Y)
    });
    const png = halfHalfPng([200, 150, 100], [80, 60, 40]);
    const r = scoreFrame(state, png);
    // Behind camera ⇒ forward score 0 + next-table off-screen → geometric drops
    // far enough that the composite is below 0.65.
    expect(r.score).toBeLessThan(0.65);
    expect(r.reasons.some(s => /forward.*→ 0$/.test(s))).toBe(true);
  });

  it('exposes geometric, pixel, score, reasons[]', () => {
    const r = scoreFrame(makeGameState(), solidPng(50, 50, 50));
    expect(typeof r.geometric).toBe('number');
    expect(typeof r.pixel).toBe('number');
    expect(typeof r.score).toBe('number');
    expect(Array.isArray(r.reasons)).toBe(true);
  });
});
