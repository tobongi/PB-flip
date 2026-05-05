/* eslint-disable no-console */
// Headless-Chrome harness that captures the in-game camera framing for each
// transition we tuned. Launches Chrome via the locally-installed binary,
// navigates to the dev server, drives the game store to jump to each
// (currentTable, nextTable) pair, and saves a PNG.
//
// Usage:
//   1. Make sure the dev server is running: `npm start` (it should be on
//      http://localhost:3003 unless other ports are taken — we probe).
//   2. node scripts/screenshot-camera-transitions.js
//   3. Open docs/camera-screenshots/*.png

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const CDP = require('chrome-remote-interface');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9223;
const VIEWPORT = { width: 480, height: 800, dpr: 2 };
const OUT_DIR = path.resolve(__dirname, '..', 'docs', 'camera-screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });

// (currentTableIndex, label). For each one we set startTableIndex via the
// debug config, restart, and screenshot.
const SCENARIOS = [
  { startTable: 3,  label: '03_on_table_3_facing_4' },
  { startTable: 4,  label: '04_on_table_4_facing_5' },
  { startTable: 14, label: '14_on_table_14_facing_15' },
  { startTable: 15, label: '15_on_table_15_facing_16' },
  { startTable: 16, label: '16_on_table_16_facing_17' },
  { startTable: 17, label: '17_on_table_17_facing_18' },
  { startTable: 18, label: '18_on_table_18_facing_19' },
  { startTable: 24, label: '24_on_table_24_facing_25' },
  { startTable: 25, label: '25_on_table_25_facing_26' },
  { startTable: 26, label: '26_on_table_26_facing_27' },
  { startTable: 27, label: '27_on_table_27_facing_28' },
];

const PORTS_TO_TRY = [3005, 3003, 3001, 3002, 3004, 3000];

async function findGameUrl() {
  for (const port of PORTS_TO_TRY) {
    const url = `http://localhost:${port}`;
    const ok = await new Promise(resolve => {
      const req = http.get(url, res => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => {
          // PB Flip CRA build: title is "Poulet Braisé Flip"; the bundle
          // path is /static/js/bundle.js. Either signal counts.
          resolve(/Poulet|PB.Flip|bundle\.js/i.test(body));
        });
      });
      req.on('error', () => resolve(false));
      req.setTimeout(3000, () => { req.destroy(); resolve(false); });
    });
    if (ok) return url;
  }
  throw new Error('Could not find PB-Flip dev server on common ports — start it with `npm start`.');
}

function launchChrome(userDataDir) {
  return spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    '--disable-gpu', // headless on Windows tends to be flaky with GPU
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
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
  throw new Error('Chrome CDP did not come up in time');
}

async function settle(client, ms) {
  await new Promise(r => setTimeout(r, ms));
  await client.Runtime.evaluate({ expression: '1 + 1' }); // flush
}

async function dumpFrame(client, gameUrl, scenario) {
  const { Page, Runtime } = client;

  await Page.navigate({ url: gameUrl });
  await Page.loadEventFired();

  // 1. wait until window.__game and its restaurantTables are ready
  // 2. dismiss the start-screen overlay (JOUER button), force restaurant
  //    mode, monkey-patch the start-table resolver, restart so the
  //    patched resolver takes effect
  await Runtime.evaluate({
    expression: `
      (async function() {
        const t0 = Date.now();
        while (!(window.__game && window.__game.restaurantTables && window.__game.restaurantTables.length > 0)) {
          if (Date.now() - t0 > 15000) throw new Error('game not ready');
          await new Promise(r => setTimeout(r, 100));
        }
        const g = window.__game;
        g.gameMode = 'restaurant';
        g.resolveRestaurantStartTableIndex = function() { return ${scenario.startTable}; };
        if (g.currentWorld !== 'restaurant' && typeof g.setWorld === 'function') {
          g.setWorld('restaurant');
        }
        g.restart();
        // Skip the JOUER landing overlay by pushing the zustand store into
        // the 'game' uiState directly.
        if (window.__store && typeof window.__store.getState === 'function') {
          window.__store.getState().startGame();
        }
      })();
    `,
    awaitPromise: true,
  });

  // Allow time for assets to load + camera to settle.
  await settle(client, 4500);

  const result = await Page.captureScreenshot({ format: 'png', captureBeyondViewport: false });
  const outPath = path.join(OUT_DIR, `${scenario.label}.png`);
  fs.writeFileSync(outPath, Buffer.from(result.data, 'base64'));

  // Read game state for the report.
  const { result: gameState } = await Runtime.evaluate({
    expression: `
      (function() {
        const g = window.__game;
        if (!g) return { error: 'window.__game not exposed' };
        const cam = g.cameraController.activeCamera;
        const cc = g.cameraController;
        const canvas = document.querySelector('canvas');
        return JSON.stringify({
          currentTableIndex: g.currentTableIndex,
          curBlockIdx: g.currentBlock && g.currentBlock._tableIndex,
          nxtBlockIdx: g.nextBlock && g.nextBlock._tableIndex,
          curBlockPos: g.currentBlock ? { x: +g.currentBlock.mesh.position.x.toFixed(2), y: +g.currentBlock.mesh.position.y.toFixed(2), z: +g.currentBlock.mesh.position.z.toFixed(2) } : null,
          nxtBlockPos: g.nextBlock ? { x: +g.nextBlock.mesh.position.x.toFixed(2), y: +g.nextBlock.mesh.position.y.toFixed(2), z: +g.nextBlock.mesh.position.z.toFixed(2) } : null,
          camPos: { x: +cam.position.x.toFixed(2), y: +cam.position.y.toFixed(2), z: +cam.position.z.toFixed(2) },
          camIsOrtho: !!cam.isOrthographicCamera,
          camZoom: +(cam.zoom || 0).toFixed(3),
          camFov: +(cam.fov || 0).toFixed(2),
          travelAxis: { x: +cc._travelAxis.x.toFixed(3), y: +cc._travelAxis.y.toFixed(3) },
          lookAtAxis: { x: +cc._lookAtAxis.x.toFixed(3), y: +cc._lookAtAxis.y.toFixed(3) },
          lookAtShift: +cc._lookAtShift.toFixed(3),
          tarZoom: +cc._tarZoom.toFixed(3),
          curZoom: +cc._curZoom.toFixed(3),
          tarDist: +cc._tarDistance.toFixed(3),
          smoothedPitch: +cc._smoothedPitch.toFixed(3),
          targetPitchIdx: cc._targetPitchIdx,
          smoothedDistanceScale: +cc._smoothedDistanceScale.toFixed(3),
          smoothedBlend: +cc._smoothedProjectionBlend.toFixed(3),
          lockedToOverrideAxis: cc._lockedToOverrideAxis,
          projection: cc.projection,
          canvasW: canvas && canvas.width, canvasH: canvas && canvas.height,
          canvasCssW: canvas && canvas.clientWidth, canvasCssH: canvas && canvas.clientHeight,
          state: cc.state,
        });
      })();
    `,
    returnByValue: true,
  });

  return { outPath, gameState: gameState && gameState.value };
}

(async () => {
  const gameUrl = await findGameUrl();
  console.log(`[ok] dev server: ${gameUrl}`);

  const userDataDir = path.join(require('os').tmpdir(), `pb-flip-cdp-${Date.now()}`);
  const proc = launchChrome(userDataDir);
  await waitForCdp(CDP_PORT);
  console.log(`[ok] chrome up on CDP port ${CDP_PORT}`);

  const targets = await CDP.List({ port: CDP_PORT });
  const target = targets.find(t => t.type === 'page');
  const client = await CDP({ target, port: CDP_PORT });
  await client.Page.enable();
  await client.Runtime.enable();
  await client.Emulation.setDeviceMetricsOverride({
    width: VIEWPORT.width, height: VIEWPORT.height,
    deviceScaleFactor: VIEWPORT.dpr, mobile: true,
  });

  // Install init script that exposes the running game on window when
  // index.js attaches it. We rely on the dev build attaching window.__game
  // (added below as a temp shim if missing).
  await client.Page.addScriptToEvaluateOnNewDocument({
    source: `
      const orig = Object.defineProperty;
      // no-op shim placeholder — game itself sets window.__game
    `,
  });

  // Warm-up: first navigation always loses the JOUER overlay race because
  // the GLB hasn't finished loading when we kick the restart. Run one
  // throwaway navigate so subsequent scenarios start from a stable state.
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

  const report = [];
  for (const sc of SCENARIOS) {
    console.log(`[run] ${sc.label} (table ${sc.startTable})`);
    try {
      const r = await dumpFrame(client, gameUrl, sc);
      report.push({ ...sc, ...r });
      console.log(`        -> ${r.outPath}`);
      console.log(`        ${r.gameState}`);
    } catch (e) {
      console.error(`[fail] ${sc.label}: ${e.message}`);
      report.push({ ...sc, error: e.message });
    }
  }

  await client.close();
  proc.kill('SIGTERM');

  fs.writeFileSync(
    path.join(OUT_DIR, '_report.json'),
    JSON.stringify(report, null, 2)
  );
  console.log(`\n[done] ${report.length} scenarios. See ${OUT_DIR}`);
})().catch(err => {
  console.error('fatal', err);
  process.exit(1);
});
