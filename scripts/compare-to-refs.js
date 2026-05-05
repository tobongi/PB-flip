/* eslint-disable no-console */
// Composite reference-image comparison.
//   scoreMatch(currentBuf, refBuf, opts) → { phash, pixel, geo, ssim, composite, breakdown }
//
// All sub-scores are in [0..1] where 1 = identical and 0 = totally different.
// Composite = 0.35*phash + 0.20*pixel + 0.20*geo + 0.25*ssim. When `geo` is
// not applicable (one side missing encoded params), its weight redistributes
// across the other three so totals still sum to 1.
//
// Usage from Node:
//   const { scoreMatch, parseSweepParams } = require('./compare-to-refs');
//   const r = await scoreMatch(curBuf, refBuf, { curParams, refParams });
//
// CLI:
//   node scripts/compare-to-refs.js current.png ref.png [--cur-params 'a-30,z0.7,s1'] [--ref-params 'a-20,z0.65,s2']

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { ssim } = require('ssim.js');
// Pure-JS dHash. We avoid `image-hash` because it pulls a transitive dep
// (`file-type`) that uses ESM imports incompatible with this project's
// Jest 20 setup. dHash is simpler than pHash but does the same job for
// our use case (matching one camera framing to another).

// ---------------------------------------------------------------------------
// PNG decode helper — returns { data, width, height } compatible with ssim.js.

function decodePng(buf) {
  const png = PNG.sync.read(buf);
  return { data: png.data, width: png.width, height: png.height };
}

// Resize a decoded PNG-style image to (w,h) via nearest-neighbour. SSIM and
// histogram diff need both inputs the same size — the screenshot harness
// captures at viewport size, but refs may be slightly different.
function resizeNearest(src, w, h) {
  const out = Buffer.alloc(w * h * 4);
  const sx = src.width / w;
  const sy = src.height / h;
  for (let y = 0; y < h; y++) {
    const ys = Math.min(src.height - 1, Math.floor(y * sy));
    for (let x = 0; x < w; x++) {
      const xs = Math.min(src.width - 1, Math.floor(x * sx));
      const si = (ys * src.width + xs) * 4;
      const di = (y * w + x) * 4;
      out[di] = src.data[si];
      out[di + 1] = src.data[si + 1];
      out[di + 2] = src.data[si + 2];
      out[di + 3] = src.data[si + 3];
    }
  }
  return { data: out, width: w, height: h };
}

// ---------------------------------------------------------------------------
// dHash (difference hash). Resize to (W+1, H), compare adjacent pixels in
// each row, emit 1 if next > current else 0. Concatenate bits → fingerprint.
// Hamming distance / total bits = perceptual mismatch.
//
// Use 16x16 → 240 bits, plenty of resolution.

const DHASH_W = 16;
const DHASH_H = 16;

function grayscale(img, x, y) {
  const i = (y * img.width + x) * 4;
  return 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
}

function dhashBits(buf) {
  const img = decodePng(buf);
  // Resize directly into (DHASH_W+1, DHASH_H) gray values.
  const sx = img.width / (DHASH_W + 1);
  const sy = img.height / DHASH_H;
  const gray = new Array(DHASH_H);
  for (let y = 0; y < DHASH_H; y++) {
    const ys = Math.min(img.height - 1, Math.floor((y + 0.5) * sy));
    gray[y] = new Array(DHASH_W + 1);
    for (let x = 0; x < DHASH_W + 1; x++) {
      const xs = Math.min(img.width - 1, Math.floor((x + 0.5) * sx));
      gray[y][x] = grayscale(img, xs, ys);
    }
  }
  const bits = [];
  for (let y = 0; y < DHASH_H; y++) {
    for (let x = 0; x < DHASH_W; x++) {
      bits.push(gray[y][x + 1] > gray[y][x] ? 1 : 0);
    }
  }
  return bits;
}

async function phashScore(curBuf, refBuf) {
  // Async to keep the API stable; dhashBits is sync but cheap.
  const a = dhashBits(curBuf);
  const b = dhashBits(refBuf);
  if (a.length !== b.length) return 0;
  let ham = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) ham++;
  return Math.max(0, 1 - ham / a.length);
}

// ---------------------------------------------------------------------------
// Pixel histogram diff. 4-bit-per-channel buckets => 16^3 = 4096 buckets.
// Score = 1 - L1 distance / 2.

function histogram(img) {
  const h = new Map();
  const stride = img.width * 4;
  let total = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = y * stride + x * 4;
      const r = img.data[i] >> 4;
      const g = img.data[i + 1] >> 4;
      const b = img.data[i + 2] >> 4;
      const key = (r << 8) | (g << 4) | b;
      h.set(key, (h.get(key) || 0) + 1);
      total++;
    }
  }
  // Normalize.
  for (const [k, v] of h) h.set(k, v / total);
  return h;
}

function histDiff(a, b) {
  const keys = new Set([...a.keys(), ...b.keys()]);
  let l1 = 0;
  for (const k of keys) l1 += Math.abs((a.get(k) || 0) - (b.get(k) || 0));
  return Math.max(0, 1 - l1 / 2);
}

// ---------------------------------------------------------------------------
// Geometric param distance. Sweep filenames encode (angle, zoom, shift).

function parseSweepParams(filename) {
  const base = path.basename(filename);
  const m = base.match(/_a(-?[\d.]+)_z([\d.]+)_s([\d.]+)\./);
  if (!m) return null;
  return { angle: parseFloat(m[1]), zoom: parseFloat(m[2]), shift: parseFloat(m[3]) };
}

function geoScore(curParams, refParams) {
  if (!curParams || !refParams) return null;
  const da = Math.abs(curParams.angle - refParams.angle) / 180;
  const dz = Math.abs(curParams.zoom - refParams.zoom) / 0.5;
  const ds = Math.abs(curParams.shift - refParams.shift) / 5;
  return Math.max(0, 1 - (da + dz + ds) / 3);
}

// ---------------------------------------------------------------------------
// SSIM via ssim.js — returns a number in [0..1]; we pass straight through.

function ssimScore(curImg, refImg) {
  // ssim.js expects equal-size inputs.
  const w = Math.min(curImg.width, refImg.width);
  const h = Math.min(curImg.height, refImg.height);
  const a = (curImg.width === w && curImg.height === h) ? curImg : resizeNearest(curImg, w, h);
  const b = (refImg.width === w && refImg.height === h) ? refImg : resizeNearest(refImg, w, h);
  // Solid-color images give NaN through SSIM (zero variance ⇒ zero
  // denominator). Treat NaN as: 1 if pixels are identical, 0 otherwise.
  let result;
  try {
    result = ssim(a, b, { ssim: 'fast' });
  } catch (e) {
    return 0;
  }
  let v = result.mssim;
  if (!isFinite(v) || isNaN(v)) {
    // Fall back: pixel-by-pixel equality.
    let same = 0;
    const total = a.width * a.height * 4;
    for (let i = 0; i < total; i++) if (a.data[i] === b.data[i]) same++;
    v = same / total;
  }
  return Math.max(0, Math.min(1, v));
}

// ---------------------------------------------------------------------------
// Composite scorer.

async function scoreMatch(curBuf, refBuf, opts = {}) {
  const curImg = decodePng(curBuf);
  const refImg = decodePng(refBuf);
  // Resize both to a common size for hist + ssim.
  const W = Math.min(curImg.width, refImg.width, 256);
  const H = Math.min(curImg.height, refImg.height, 384);
  const curR = resizeNearest(curImg, W, H);
  const refR = resizeNearest(refImg, W, H);

  const phash = await phashScore(curBuf, refBuf);
  const pixel = histDiff(histogram(curR), histogram(refR));
  const geo = (opts.curParams && opts.refParams)
    ? geoScore(opts.curParams, opts.refParams)
    : null;
  const ssimV = ssimScore(curR, refR);

  let composite;
  if (geo == null) {
    // Redistribute geo's 0.20 weight: phash 0.45, pixel 0.27, ssim 0.28
    composite = 0.45 * phash + 0.27 * pixel + 0.28 * ssimV;
  } else {
    composite = 0.35 * phash + 0.20 * pixel + 0.20 * geo + 0.25 * ssimV;
  }
  return {
    phash, pixel, geo, ssim: ssimV,
    composite,
    breakdown: { phash, pixel, geo, ssim: ssimV },
  };
}

// ---------------------------------------------------------------------------
// CLI entry.

if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const curPath = args[0];
  const refPath = args[1];
  if (!curPath || !refPath) {
    console.error('usage: node compare-to-refs.js <current.png> <ref.png> [--cur-params a,z,s] [--ref-params a,z,s]');
    process.exit(1);
  }
  function parseFlag(s) {
    if (!s) return null;
    const parts = s.split(',');
    const o = {};
    for (const p of parts) {
      const m = p.match(/^([azs])(-?[\d.]+)$/);
      if (!m) continue;
      o[m[1] === 'a' ? 'angle' : m[1] === 'z' ? 'zoom' : 'shift'] = parseFloat(m[2]);
    }
    return Object.keys(o).length === 3 ? o : null;
  }
  (async () => {
    const curBuf = fs.readFileSync(path.resolve(curPath));
    const refBuf = fs.readFileSync(path.resolve(refPath));
    const curParams = parseFlag(flag('--cur-params')) || parseSweepParams(curPath);
    const refParams = parseFlag(flag('--ref-params')) || parseSweepParams(refPath);
    const r = await scoreMatch(curBuf, refBuf, { curParams, refParams });
    console.log(JSON.stringify(r, null, 2));
  })().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { scoreMatch, phashScore, geoScore, parseSweepParams };
