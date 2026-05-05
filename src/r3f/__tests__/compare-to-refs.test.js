/* eslint-env jest */
// Unit tests for the composite reference comparison.

const { PNG } = require('pngjs');
const { scoreMatch, geoScore, parseSweepParams } = require('../../../scripts/compare-to-refs');

function solidPng(r, g, b, w = 64, h = 64) {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      png.data[i] = r; png.data[i+1] = g; png.data[i+2] = b; png.data[i+3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function patternPng(seed, w = 64, h = 64) {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      png.data[i] = (x * 7 + seed) & 0xff;
      png.data[i+1] = (y * 13 + seed) & 0xff;
      png.data[i+2] = ((x ^ y) * 5 + seed) & 0xff;
      png.data[i+3] = 255;
    }
  }
  return PNG.sync.write(png);
}

describe('parseSweepParams', () => {
  it('extracts (angle, zoom, shift) from a sweep filename', () => {
    expect(parseSweepParams('0.580_a-20_z0.7_s2.png')).toEqual({ angle: -20, zoom: 0.7, shift: 2 });
    expect(parseSweepParams('1.000_a15_z0.6_s2.5.png')).toEqual({ angle: 15, zoom: 0.6, shift: 2.5 });
    expect(parseSweepParams('docs/foo/0.222_a-90_z0.65_s2.png')).toEqual({ angle: -90, zoom: 0.65, shift: 2 });
  });
  it('returns null for non-sweep filenames', () => {
    expect(parseSweepParams('refs/15_to_16.png')).toBeNull();
    expect(parseSweepParams('whatever.png')).toBeNull();
  });
});

describe('geoScore', () => {
  it('1.0 when params match exactly', () => {
    expect(geoScore({ angle: -20, zoom: 0.7, shift: 2 }, { angle: -20, zoom: 0.7, shift: 2 })).toBeCloseTo(1.0, 3);
  });
  it('lower when params drift', () => {
    const s = geoScore({ angle: -10, zoom: 0.7, shift: 2 }, { angle: -20, zoom: 0.7, shift: 2 });
    expect(s).toBeLessThan(1.0);
    expect(s).toBeGreaterThan(0.95);
  });
  it('returns null when either side missing', () => {
    expect(geoScore(null, { angle: -20, zoom: 0.7, shift: 2 })).toBeNull();
    expect(geoScore({ angle: -20, zoom: 0.7, shift: 2 }, null)).toBeNull();
  });
});

describe('scoreMatch (composite)', () => {
  it('identical PNGs score ≥ 0.95 composite', async () => {
    const buf = patternPng(0);
    const r = await scoreMatch(buf, buf);
    expect(r.composite).toBeGreaterThanOrEqual(0.95);
    expect(r.phash).toBeGreaterThanOrEqual(0.95);
    expect(r.pixel).toBeGreaterThanOrEqual(0.95);
    expect(r.ssim).toBeGreaterThanOrEqual(0.95);
  });

  it('solid black vs solid white: pixel histogram catches the difference cleanly', async () => {
    const r = await scoreMatch(solidPng(0, 0, 0), solidPng(255, 255, 255));
    // dHash treats any solid-color image as identical to any other, and
    // SSIM behavior on zero-variance inputs is implementation-defined.
    // The pixel histogram is the load-bearing signal here and must show
    // these as totally disjoint.
    expect(r.pixel).toBeLessThanOrEqual(0.05);
    // Composite must still be appreciably below 1.0 (i.e. the metric
    // SOMETHING signals the difference, even if dHash is fooled).
    expect(r.composite).toBeLessThan(0.80);
  });

  it('different patterns score below 0.85 composite', async () => {
    const r = await scoreMatch(patternPng(0), patternPng(128));
    expect(r.composite).toBeLessThan(0.85);
  });

  it('exposes phash, pixel, ssim, composite, breakdown', async () => {
    const r = await scoreMatch(patternPng(0), patternPng(0));
    expect(typeof r.phash).toBe('number');
    expect(typeof r.pixel).toBe('number');
    expect(typeof r.ssim).toBe('number');
    expect(typeof r.composite).toBe('number');
    expect(typeof r.breakdown).toBe('object');
  });

  it('uses geo when sweep params are passed', async () => {
    const buf = patternPng(0);
    const r = await scoreMatch(buf, buf, {
      curParams: { angle: -20, zoom: 0.7, shift: 2 },
      refParams: { angle: -20, zoom: 0.7, shift: 2 },
    });
    expect(r.geo).toBeCloseTo(1.0, 3);
  });
});
