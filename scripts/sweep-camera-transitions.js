/* eslint-disable no-console */
// Parameter-sweep harness: for each (transition, angle, zoom, lookAtShift)
// combo, mutate the in-page TRANSITION_CAMERA_ANGLES via Runtime.evaluate,
// trigger a restart at the source table, screenshot the steady-state, then
// score the frame with scripts/camera-quality-metrics.js.
//
// Saves every shot to docs/camera-screenshots/sweep/{key}/, names files by
// score so the best floats to the top of any directory listing. Writes
// docs/camera-screenshots/_sweep-results.json with top-3 per transition.
//
// Usage:
//   node scripts/sweep-camera-transitions.js
//   node scripts/sweep-camera-transitions.js --transition 15->16
//   node scripts/sweep-camera-transitions.js --grid-size 2
//
// Pre-reqs:
//   - dev server running on http://localhost:3003 (or 3000-3004; auto-probed)
//   - Chrome installed at the path in CHROME constant
//   - chrome-remote-interface, pngjs already npm installed
//   - window.__game and window.__store exposed (already in src/index.js)

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const CDP = require('chrome-remote-interface');
const { scoreFrame } = require('./camera-quality-metrics');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9224;
const VIEWPORT = { width: 480, height: 800, dpr: 2 };
const OUT_DIR = path.resolve(__dirname, '..', 'docs', 'camera-screenshots');
const SWEEP_DIR = path.join(OUT_DIR, 'sweep');
const PORTS_TO_TRY = [3003, 3001, 3002, 3004, 3000];

// Sweep grid per transition. "verify-only" keys still get one screenshot
// scored against current values so we catch regressions to 3→4 / 14→15.
// Targets are CALIBRATED against the 3→4 baseline that the user already
// approved as visually good (~0.69 with the tight metric). The metric is
// strict (central 60% of frame, distance falloff), so absolute scores are
// modest even for great framing. We pick targets ≥ 0.65 for the two
// known-good transitions (regression-only) and ≥ 0.55 for the rest.
// 15→16 and 16→17 sit against the east column / north wall — negative
// rotations push the camera through the wall, positive rotations sit south
// of the bottle in open space. Sweep BOTH signs so we can compare.
const SWEEP_GRID = {
  '3->4':   { startTable: 3,  angles: [-30, -20, -40],      zooms: [0.65, 0.70, 0.75], shifts: [1.0, 1.5, 2.0], target: 0.65 },
  '14->15': { startTable: 14, angles: [0, 10, -10],         zooms: [0.65, 0.70, 0.75], shifts: [1.5, 2.0, 2.5], target: 0.65 },
  // 15→16 wide grid — explore both quadrants and broader zoom/shift to
  // escape the local minimum the gradient probe got stuck in (0.59).
  '15->16': { startTable: 15, angles: [-120, -100, -80, -60, -45, -30, 30, 45, 60, 75], zooms: [0.55, 0.6, 0.65, 0.7], shifts: [3, 4, 5, 6], target: 0.65 },
  '4->5':   { startTable: 4,  angles: [-90, -75, -60, -45], zooms: [0.60, 0.65, 0.70, 0.75], shifts: [2.0, 2.5, 3.0], target: 0.55 },
  '16->17': { startTable: 16, angles: [-30, -15, 15, 30, 45, 60], zooms: [0.60, 0.65, 0.70], shifts: [2.5, 3.0, 3.5], target: 0.55 },
};

// CLI flags
const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
const ONLY_TRANSITION = flag('--transition');     // e.g. "15->16"
const GRID_SIZE = parseInt(flag('--grid-size') || '0', 10) || null; // truncate each axis

fs.mkdirSync(SWEEP_DIR, { recursive: true });

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
  throw new Error('dev server not found on common ports');
}

function launchChrome(userDataDir) {
  return spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    '--disable-gpu', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check',
    'about:blank',
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

async function settle(client, ms) {
  await new Promise(r => setTimeout(r, ms));
  await client.Runtime.evaluate({ expression: '1+1' });
}

// ---------------------------------------------------------------------------
async function applyOverrideAndScreenshot(client, gameUrl, key, startTable, combo) {
  const { Page, Runtime } = client;
  await Page.navigate({ url: gameUrl });
  await Page.loadEventFired();

  // Inject the override via window.__sweepOverride. CameraController.setTarget
  // checks this and prefers it over the static TRANSITION_CAMERA_ANGLES map.
  // Then force start table + skip JOUER + restart so setTarget(curBlock, nextBlock)
  // fires for the right pair.
  const overrideValue = {
    angle: combo.angle * Math.PI / 180,
    zoomScale: combo.zoom,
    lookAtShiftScale: combo.shift,
  };
  await Runtime.evaluate({
    expression: `
      (async function() {
        const t0 = Date.now();
        while (!(window.__game && window.__game.restaurantTables && window.__game.restaurantTables.length > 0)) {
          if (Date.now() - t0 > 15000) throw new Error('game not ready');
          await new Promise(r => setTimeout(r, 100));
        }
        window.__sweepOverride = {
          key: ${JSON.stringify(key)},
          value: ${JSON.stringify(overrideValue)},
        };
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

  await settle(client, 4500);

  // Capture frame.
  const png = await Page.captureScreenshot({ format: 'png', captureBeyondViewport: false });
  const pngBuffer = Buffer.from(png.data, 'base64');

  // Pull game state for the geometric scorer.
  const { result: stateRes } = await Runtime.evaluate({
    expression: `
      (function() {
        const g = window.__game;
        const cam = g.cameraController.activeCamera;
        cam.updateMatrixWorld(true);
        cam.updateProjectionMatrix();
        const fwd = new (Object.getPrototypeOf(cam.position).constructor)(0, 0, -1).applyQuaternion(cam.quaternion);
        const right = new (Object.getPrototypeOf(cam.position).constructor)(1, 0, 0).applyQuaternion(cam.quaternion);
        const cb = g.currentBlock, nb = g.nextBlock;
        const proj = cam.projectionMatrix.elements;
        const view = cam.matrixWorldInverse.elements;
        // pv = proj * view (column-major).
        function mulMat4(a, b) {
          const out = new Array(16);
          for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
              let s = 0;
              for (let k = 0; k < 4; k++) s += a[i + 4*k] * b[k + 4*j];
              out[i + 4*j] = s;
            }
          }
          return out;
        }
        const pv = mulMat4(proj, view);
        return JSON.stringify({
          camPos: { x: +cam.position.x.toFixed(3), y: +cam.position.y.toFixed(3), z: +cam.position.z.toFixed(3) },
          lookAt: g.cameraController._currentLookAt,
          fwd: { x: +fwd.x.toFixed(4), y: +fwd.y.toFixed(4), z: +fwd.z.toFixed(4) },
          right: { x: +right.x.toFixed(4), y: +right.y.toFixed(4), z: +right.z.toFixed(4) },
          bottleWorld: { x: g.bottle.mesh.position.x, y: g.bottle.mesh.position.y, z: g.bottle.mesh.position.z + 0.5 },
          nextTableWorld: nb ? { x: nb.mesh.position.x, y: nb.mesh.position.y, z: nb.mesh.position.z + 0.5 } : null,
          frameWidth: ${VIEWPORT.width},
          frameHeight: ${VIEWPORT.height},
          projectionViewMatrix: pv,
          curBlockIdx: cb && cb._tableIndex,
          nxtBlockIdx: nb && nb._tableIndex,
          travelAxis: { x: +g.cameraController._travelAxis.x.toFixed(3), y: +g.cameraController._travelAxis.y.toFixed(3) },
          lookAtAxis: { x: +g.cameraController._lookAtAxis.x.toFixed(3), y: +g.cameraController._lookAtAxis.y.toFixed(3) },
          tarZoom: +g.cameraController._tarZoom.toFixed(3),
          tarDist: +g.cameraController._tarDistance.toFixed(3),
        });
      })();
    `,
    returnByValue: true,
  });

  const gameState = JSON.parse(stateRes.value);
  const score = scoreFrame(gameState, pngBuffer);
  return { gameState, pngBuffer, score };
}

// ---------------------------------------------------------------------------
function cartesian(axes) {
  const keys = Object.keys(axes);
  if (keys.length === 0) return [{}];
  const [first, ...rest] = keys;
  const subs = cartesian(Object.fromEntries(rest.map(k => [k, axes[k]])));
  const out = [];
  for (const v of axes[first]) {
    for (const s of subs) out.push({ [first]: v, ...s });
  }
  return out;
}

function maybeTruncate(arr) {
  return GRID_SIZE && arr.length > GRID_SIZE ? arr.slice(0, GRID_SIZE) : arr;
}

(async () => {
  const gameUrl = await findGameUrl();
  console.log(`[ok] dev server: ${gameUrl}`);

  const userDataDir = path.join(os.tmpdir(), `pb-flip-sweep-${Date.now()}`);
  const proc = launchChrome(userDataDir);
  await waitForCdp(CDP_PORT);
  console.log(`[ok] chrome up on CDP ${CDP_PORT}`);

  const targets = await CDP.List({ port: CDP_PORT });
  const target = targets.find(t => t.type === 'page');
  const client = await CDP({ target, port: CDP_PORT });
  await client.Page.enable();
  await client.Runtime.enable();
  await client.Emulation.setDeviceMetricsOverride({
    width: VIEWPORT.width, height: VIEWPORT.height,
    deviceScaleFactor: VIEWPORT.dpr, mobile: true,
  });

  const transitions = ONLY_TRANSITION ? [ONLY_TRANSITION] : Object.keys(SWEEP_GRID);
  const allResults = {};

  for (const key of transitions) {
    const cfg = SWEEP_GRID[key];
    if (!cfg) { console.warn(`[skip] no grid for ${key}`); continue; }
    const dir = path.join(SWEEP_DIR, key.replace('->', '_to_'));
    fs.mkdirSync(dir, { recursive: true });

    const grid = cartesian({
      angle:  maybeTruncate(cfg.angles),
      zoom:   maybeTruncate(cfg.zooms),
      shift:  maybeTruncate(cfg.shifts),
    });
    console.log(`\n=== ${key} (${grid.length} combos, target≥${cfg.target}) ===`);

    const ranked = [];
    for (let i = 0; i < grid.length; i++) {
      const combo = grid[i];
      try {
        const { gameState, pngBuffer, score } = await applyOverrideAndScreenshot(
          client, gameUrl, key, cfg.startTable, combo
        );
        const tag = `${score.score.toFixed(3)}_a${combo.angle}_z${combo.zoom}_s${combo.shift}`;
        const filename = `${tag}.png`;
        fs.writeFileSync(path.join(dir, filename), pngBuffer);
        ranked.push({ combo, score: score.score, geometric: score.geometric, pixel: score.pixel, gameState, filename, reasons: score.reasons });
        const ok = score.score >= cfg.target ? '✓' : '·';
        console.log(`  [${i+1}/${grid.length}] ${ok} ${tag.padEnd(40)}  geo=${score.geometric.toFixed(2)} pix=${score.pixel.toFixed(2)}`);
      } catch (e) {
        console.error(`  [${i+1}/${grid.length}] ERROR ${JSON.stringify(combo)}: ${e.message}`);
      }
    }

    ranked.sort((a, b) => b.score - a.score);
    const top3 = ranked.slice(0, 3);
    const best = ranked[0] || null;
    const passed = best && best.score >= cfg.target;
    allResults[key] = {
      target: cfg.target,
      passed,
      best: best ? { combo: best.combo, score: best.score, geometric: best.geometric, pixel: best.pixel, filename: best.filename } : null,
      top3: top3.map(r => ({ combo: r.combo, score: r.score, filename: r.filename })),
      gridSize: grid.length,
    };
    console.log(`=== ${key} winner: ${best ? best.filename : 'NONE'} (${passed ? 'PASS' : 'NEEDS FALLBACK'}) ===`);
  }

  await client.close();
  proc.kill('SIGTERM');

  const reportPath = path.join(OUT_DIR, '_sweep-results.json');
  fs.writeFileSync(reportPath, JSON.stringify(allResults, null, 2));
  console.log(`\n[done] ${reportPath}`);

  const failing = Object.entries(allResults).filter(([_, r]) => !r.passed).map(([k]) => k);
  if (failing.length > 0) {
    console.log(`\n[fallback needed] ${failing.join(', ')}`);
    process.exitCode = 0;
  } else {
    console.log(`\n[all transitions passed targets ✓]`);
  }
})().catch(err => { console.error('fatal', err); process.exit(1); });
