/* eslint-disable no-console */
// One iteration of the closed-loop auto-tuner.
//
// Workflow:
//   1. Load refs from docs/camera-screenshots/refs/_index.json
//   2. For each transition with a ref:
//      - Screenshot current params via the existing CDP harness
//      - Score current params against the ref(s)
//      - If composite < THRESHOLD: mini-sweep gradient around current
//        params (3 axes × 3 values = 27 combos OR sparse 7-combo)
//        and pick the winner with highest composite score
//   3. If any transition has a winner that improves on current:
//      - Edit src/game/worlds/restaurant.js to write the new values
//      - Run `CI=true npm test` — revert and abort iteration on failure
//   4. Update docs/camera-screenshots/_tune-state.json with iteration history
//   5. Emit one JSON status line on stdout (`{ iteration, results, converged }`)
//      and on the LAST line print STATUS=converged or STATUS=progressing
//      so /loop can decide whether to stop.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const CDP = require('chrome-remote-interface');
const { scoreMatch, parseSweepParams } = require('./compare-to-refs');

const ROOT = path.resolve(__dirname, '..');
const RESTAURANT = path.join(ROOT, 'src', 'game', 'worlds', 'restaurant.js');
const REFS_DIR = path.join(ROOT, 'docs', 'camera-screenshots', 'refs');
const STATE_PATH = path.join(ROOT, 'docs', 'camera-screenshots', '_tune-state.json');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9226;
const VIEWPORT = { width: 480, height: 800, dpr: 2 };
const PORTS_TO_TRY = [3003, 3001, 3002, 3004, 3000];

const COMPOSITE_GOOD_THRESHOLD = 0.80; // converged when all keys ≥ this
const IMPROVE_THRESHOLD = 0.01;        // counts as progress if composite goes up by ≥ this
const NO_PROGRESS_LIMIT = 3;            // converge after this many flat iterations

// Mini-sweep gradient around current params. We use a 7-combo "axis probe"
// per transition: current itself plus ±delta on each of the three axes.
// 5 transitions × 7 combos × ~6s = ~3.5 min per iteration — comfortable
// for a 4-min /loop cadence.
const ANGLE_DELTA = 15;
const ZOOM_DELTA = 0.05;
const SHIFT_DELTA = 0.5;

// ---------------------------------------------------------------------------

async function findGameUrl() {
  for (const port of PORTS_TO_TRY) {
    const ok = await new Promise(resolve => {
      const req = http.get(`http://localhost:${port}`, res => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => resolve(/Poulet|PB.Flip|bundle\.js/i.test(body)));
      });
      req.on('error', () => resolve(false));
      req.setTimeout(3000, () => { req.destroy(); resolve(false); });
    });
    if (ok) return `http://localhost:${port}`;
  }
  throw new Error('dev server not found');
}

function launchChrome(userDataDir) {
  return spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    '--disable-gpu', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { detached: false, stdio: 'ignore' });
}

async function waitForCdp(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const list = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/json/list`, res => {
          let body = '';
          res.on('data', c => { body += c; });
          res.on('end', () => resolve(JSON.parse(body)));
        }).on('error', reject);
      });
      if (Array.isArray(list) && list.length > 0) return;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('CDP did not start');
}

// ---------------------------------------------------------------------------
// Restaurant.js parser & writer.
//
// We only need to read/write the {angle, zoomScale, lookAtShiftScale} inside
// each TRANSITION_CAMERA_ANGLES entry. The simplest robust approach is to
// regex-match each block and rewrite the values in place.

function readCurrentOverrides() {
  const src = fs.readFileSync(RESTAURANT, 'utf8');
  const overrides = {};
  // Tolerant regex: angle is "anything until the next ', zoomScale'" so it
  // accepts "Math.PI / 2", "-Math.PI / 6", "30 * Math.PI / 180", "-0.5", etc.
  const reSimple = /'(\d+->\d+)':\s*\{\s*angle:\s*([^,]+?)\s*,\s*zoomScale:\s*([\d.]+)\s*,\s*lookAtShiftScale:\s*([\d.]+)\s*\}/g;
  let m;
  while ((m = reSimple.exec(src)) !== null) {
    overrides[m[1]] = {
      angle: evalAngleExpr(m[2]),
      zoom: parseFloat(m[3]),
      shift: parseFloat(m[4]),
      kind: 'simple',
      source: m[0],
    };
  }
  // Variants: "'KEY': { variants: [...] }" — extract first variant's params.
  const reVariantBlock = /'(\d+->\d+)':\s*\{\s*variants:\s*\[([\s\S]*?)\],?\s*\}/g;
  while ((m = reVariantBlock.exec(src)) !== null) {
    if (overrides[m[1]]) continue;
    const inner = m[2];
    const reInner = /\{\s*angle:\s*([^,]+?)\s*,\s*zoomScale:\s*([\d.]+)\s*,\s*lookAtShiftScale:\s*([\d.]+)\s*\}/g;
    const v = reInner.exec(inner);
    if (!v) continue;
    overrides[m[1]] = {
      angle: evalAngleExpr(v[1]),
      zoom: parseFloat(v[2]),
      shift: parseFloat(v[3]),
      kind: 'variants-first',
      source: v[0],
      blockSource: m[0],
    };
  }
  return overrides;
}

function evalAngleExpr(str) {
  const s = str.trim();
  // Handle: "0", "-0.5235", "Math.PI / 6", "-Math.PI / 4", "30 * Math.PI / 180"
  if (/Math\.PI/.test(s)) {
    // eslint-disable-next-line no-new-func
    return new Function(`return ${s}`)();
  }
  return parseFloat(s);
}

function angleToDeg(rad) { return (rad * 180) / Math.PI; }
function angleToRadStr(deg) {
  const rad = (deg * Math.PI) / 180;
  return rad.toFixed(6);
}

function writeOverride(key, params) {
  // params: { angle: degrees, zoom, shift }
  let src = fs.readFileSync(RESTAURANT, 'utf8');
  const newAngle = `${params.angle} * Math.PI / 180`;
  const newSimple = `{ angle: ${newAngle}, zoomScale: ${params.zoom}, lookAtShiftScale: ${params.shift} }`;

  const escKey = key.replace(/[->]/g, ch => '\\' + ch);

  // Try simple match first (single-object override).
  const reSimple = new RegExp(`('${escKey}'):\\s*\\{\\s*angle:\\s*[^,]+,\\s*zoomScale:\\s*[\\d.]+\\s*,\\s*lookAtShiftScale:\\s*[\\d.]+\\s*\\}`);
  if (reSimple.test(src)) {
    src = src.replace(reSimple, `$1: ${newSimple}`);
    fs.writeFileSync(RESTAURANT, src);
    return true;
  }

  // Variants: replace the FIRST variant inside the block.
  const reBlock = new RegExp(`'${escKey}':\\s*\\{\\s*variants:\\s*\\[`);
  const blockMatch = reBlock.exec(src);
  if (blockMatch) {
    const after = src.slice(blockMatch.index + blockMatch[0].length);
    const reFirst = /\{\s*angle:\s*[^,]+,\s*zoomScale:\s*[\d.]+\s*,\s*lookAtShiftScale:\s*[\d.]+\s*\}/;
    const inner = reFirst.exec(after);
    if (inner) {
      const before = src.slice(0, blockMatch.index + blockMatch[0].length + inner.index);
      const post = src.slice(blockMatch.index + blockMatch[0].length + inner.index + inner[0].length);
      fs.writeFileSync(RESTAURANT, before + newSimple + post);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------

async function applyOverrideAndScreenshot(client, gameUrl, key, startTable, params) {
  const { Page, Runtime } = client;
  await Page.navigate({ url: gameUrl });
  await Page.loadEventFired();
  const overrideValue = {
    angle: (params.angle * Math.PI) / 180,
    zoomScale: params.zoom,
    lookAtShiftScale: params.shift,
  };
  await Runtime.evaluate({
    expression: `
      (async function() {
        const t0 = Date.now();
        while (!(window.__game && window.__game.restaurantTables && window.__game.restaurantTables.length > 0)) {
          if (Date.now() - t0 > 15000) throw new Error('game not ready');
          await new Promise(r => setTimeout(r, 100));
        }
        window.__sweepOverride = { key: ${JSON.stringify(key)}, value: ${JSON.stringify(overrideValue)} };
        const g = window.__game;
        g.gameMode = 'restaurant';
        g.resolveRestaurantStartTableIndex = function() { return ${startTable}; };
        if (g.currentWorld !== 'restaurant' && typeof g.setWorld === 'function') {
          g.setWorld('restaurant');
        }
        g.restart();
        if (window.__store && typeof window.__store.getState === 'function') {
          window.__store.getState().startGame();
        }
      })();
    `,
    awaitPromise: true,
  });
  await new Promise(r => setTimeout(r, 4500));
  const png = await Page.captureScreenshot({ format: 'png', captureBeyondViewport: false });
  return Buffer.from(png.data, 'base64');
}

// ---------------------------------------------------------------------------

const KEY_TO_TABLE = {
  '3->4': 3, '4->5': 4, '14->15': 14, '15->16': 15, '16->17': 16,
};

// 7-combo axis probe: ±delta on each axis from current. Cheaper than a full
// Cartesian grid (3³=27) but still captures the local gradient direction.
function axisProbe(current) {
  const clip = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const combos = [
    { angle: Math.round(current.angle - ANGLE_DELTA), zoom: current.zoom, shift: current.shift },
    { angle: Math.round(current.angle + ANGLE_DELTA), zoom: current.zoom, shift: current.shift },
    { angle: current.angle, zoom: clip(+(current.zoom - ZOOM_DELTA).toFixed(2), 0.55, 0.95), shift: current.shift },
    { angle: current.angle, zoom: clip(+(current.zoom + ZOOM_DELTA).toFixed(2), 0.55, 0.95), shift: current.shift },
    { angle: current.angle, zoom: current.zoom, shift: clip(+(current.shift - SHIFT_DELTA).toFixed(2), 0.5, 6) },
    { angle: current.angle, zoom: current.zoom, shift: clip(+(current.shift + SHIFT_DELTA).toFixed(2), 0.5, 6) },
  ];
  const seen = new Set();
  return combos.filter(c => {
    const k = `${c.angle},${c.zoom},${c.shift}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function scoreCombo(client, gameUrl, key, startTable, combo, refBufs) {
  const buf = await applyOverrideAndScreenshot(client, gameUrl, key, startTable, combo);
  // Score against the BEST of the available refs (variants-friendly).
  let best = { composite: 0 };
  for (const { buf: refBuf, params: refParams } of refBufs) {
    const r = await scoreMatch(buf, refBuf, {
      curParams: { angle: combo.angle, zoom: combo.zoom, shift: combo.shift },
      refParams,
    });
    if (r.composite > best.composite) best = r;
  }
  return { combo, score: best, buf };
}

// ---------------------------------------------------------------------------

(async () => {
  // Load refs
  if (!fs.existsSync(path.join(REFS_DIR, '_index.json'))) {
    console.error('no refs index — run scripts/save-references.js first');
    process.exit(1);
  }
  const refsIndex = JSON.parse(fs.readFileSync(path.join(REFS_DIR, '_index.json'), 'utf8'));
  const overrides = readCurrentOverrides();

  // Load state
  let state = { iteration: 0, history: [], noProgressCount: 0, lastByKey: {} };
  if (fs.existsSync(STATE_PATH)) {
    try { state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch (_) {}
  }
  state.iteration += 1;
  const iter = state.iteration;

  const gameUrl = await findGameUrl();
  console.log(`[iter ${iter}] dev server: ${gameUrl}`);
  const userDataDir = path.join(os.tmpdir(), `pb-flip-tune-${Date.now()}`);
  const proc = launchChrome(userDataDir);
  await waitForCdp(CDP_PORT);
  const targets = await CDP.List({ port: CDP_PORT });
  const target = targets.find(t => t.type === 'page');
  const client = await CDP({ target, port: CDP_PORT });
  await client.Page.enable();
  await client.Runtime.enable();
  await client.Emulation.setDeviceMetricsOverride({
    width: VIEWPORT.width, height: VIEWPORT.height,
    deviceScaleFactor: VIEWPORT.dpr, mobile: true,
  });

  // Warm-up
  await client.Page.navigate({ url: gameUrl });
  await client.Page.loadEventFired();
  await client.Runtime.evaluate({
    expression: `
      (async function() {
        const t0 = Date.now();
        while (!(window.__game && window.__game.restaurantTables && window.__game.restaurantTables.length > 0)) {
          if (Date.now() - t0 > 15000) throw new Error('warm-up: game not ready');
          await new Promise(r => setTimeout(r, 100));
        }
      })();
    `,
    awaitPromise: true,
  });
  await new Promise(r => setTimeout(r, 1500));

  const results = {};
  for (const key of Object.keys(refsIndex)) {
    const startTable = KEY_TO_TABLE[key];
    if (!startTable && startTable !== 0) {
      console.warn(`[iter ${iter}] skip ${key}: no startTable mapping`);
      continue;
    }
    const cur = overrides[key];
    if (!cur) {
      console.warn(`[iter ${iter}] skip ${key}: no current override in restaurant.js`);
      continue;
    }
    const refBufs = refsIndex[key].map(r => ({
      buf: fs.readFileSync(path.join(REFS_DIR, r.filename)),
      params: r.params,
    }));

    const curCombo = { angle: Math.round(angleToDeg(cur.angle)), zoom: cur.zoom, shift: cur.shift };
    const { score: curScore } = await scoreCombo(client, gameUrl, key, startTable, curCombo, refBufs);
    console.log(`[iter ${iter}] ${key}  current  a=${curCombo.angle} z=${curCombo.zoom} s=${curCombo.shift}  composite=${curScore.composite.toFixed(3)} (phash=${curScore.phash.toFixed(2)} pixel=${curScore.pixel.toFixed(2)} ssim=${curScore.ssim.toFixed(2)})`);

    if (curScore.composite >= COMPOSITE_GOOD_THRESHOLD) {
      results[key] = { from: curCombo, to: curCombo, oldScore: curScore.composite, newScore: curScore.composite, action: 'already-good' };
      continue;
    }

    // Mini-sweep gradient
    const grid = axisProbe(curCombo).filter(c =>
      !(c.angle === curCombo.angle && c.zoom === curCombo.zoom && c.shift === curCombo.shift)
    );
    let bestCombo = curCombo;
    let bestScore = curScore.composite;
    let bestBreakdown = curScore;
    for (let i = 0; i < grid.length; i++) {
      const combo = grid[i];
      try {
        const { score } = await scoreCombo(client, gameUrl, key, startTable, combo, refBufs);
        const tag = `a=${combo.angle} z=${combo.zoom} s=${combo.shift}`;
        const win = score.composite > bestScore + 1e-4;
        if (win) {
          bestCombo = combo;
          bestScore = score.composite;
          bestBreakdown = score;
        }
        console.log(`[iter ${iter}] ${key}  [${i+1}/${grid.length}] ${win ? 'WIN ' : '·   '}${tag.padEnd(28)} composite=${score.composite.toFixed(3)}`);
      } catch (e) {
        console.error(`[iter ${iter}] ${key}  combo ${JSON.stringify(combo)} ERROR ${e.message}`);
      }
    }

    results[key] = {
      from: curCombo,
      to: bestCombo,
      oldScore: curScore.composite,
      newScore: bestScore,
      breakdown: bestBreakdown,
      action: bestScore > curScore.composite + IMPROVE_THRESHOLD ? 'improved' : 'no-progress',
    };
  }

  await client.close();
  proc.kill('SIGTERM');

  // Apply winners to restaurant.js
  let anyChange = false;
  for (const [key, r] of Object.entries(results)) {
    if (r.action === 'improved') {
      const ok = writeOverride(key, r.to);
      if (ok) {
        console.log(`[iter ${iter}] ${key}  WROTE  a=${r.to.angle} z=${r.to.zoom} s=${r.to.shift}  Δ${(r.newScore - r.oldScore).toFixed(3)}`);
        anyChange = true;
      } else {
        console.warn(`[iter ${iter}] ${key}  could not regex-replace in restaurant.js — skipping`);
      }
    }
  }

  // Run tests; revert on failure.
  let testsOK = true;
  if (anyChange) {
    const before = fs.readFileSync(RESTAURANT, 'utf8');
    const test = spawn('cmd', ['/c', 'set', 'CI=true', '&&', 'npm', 'test', '--silent'], {
      cwd: ROOT, stdio: 'pipe',
    });
    let testOut = '';
    test.stdout.on('data', d => { testOut += d.toString(); });
    test.stderr.on('data', d => { testOut += d.toString(); });
    const code = await new Promise(r => test.on('close', r));
    if (code !== 0) {
      console.warn(`[iter ${iter}] tests FAILED — reverting restaurant.js`);
      fs.writeFileSync(RESTAURANT, before);
      testsOK = false;
    }
  }

  // Convergence
  const allGood = Object.values(results).every(r => r.newScore >= COMPOSITE_GOOD_THRESHOLD);
  const anyImproved = Object.values(results).some(r => r.action === 'improved' && testsOK);
  if (anyImproved) state.noProgressCount = 0; else state.noProgressCount += 1;
  state.history.push({ iteration: iter, results, ts: new Date().toISOString() });
  state.lastByKey = Object.fromEntries(Object.entries(results).map(([k, r]) => [k, { combo: r.to, score: r.newScore }]));
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

  const converged = allGood || state.noProgressCount >= NO_PROGRESS_LIMIT;
  console.log(JSON.stringify({ iteration: iter, allGood, noProgressCount: state.noProgressCount, results }));
  console.log(converged ? 'STATUS=converged' : 'STATUS=progressing');
  process.exit(0);
})().catch(err => { console.error('fatal', err); process.exit(1); });
