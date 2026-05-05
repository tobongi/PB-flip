/* eslint-disable no-console */
// Forces each variant of the 4->5 transition individually via window.__sweepOverride,
// so we get a deterministic v1 (pure-south) and v2 (east-tilt) screenshot regardless
// of the seeded RNG variant pick.
//
// Usage:
//   node scripts/screenshot-4to5-variants.js
//   -> writes docs/camera-screenshots/04_on_table_4_facing_5_v1.png
//      and docs/camera-screenshots/04_on_table_4_facing_5_v2.png

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const CDP = require('chrome-remote-interface');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9224;
const VIEWPORT = { width: 480, height: 800, dpr: 2 };
const OUT_DIR = path.resolve(__dirname, '..', 'docs', 'camera-screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });

// One entry per variant. `value` is the override that goes into
// window.__sweepOverride — its shape matches one branch of the variants[]
// array in TRANSITION_CAMERA_ANGLES['4->5'].
const VARIANTS = [
  {
    label: '04_on_table_4_facing_5_v1',
    value: {
      angle: -90 * Math.PI / 180,
      zoomScale: 0.65,
      lookAtShiftScale: 2.0,
      pitchTier: 2,
      forceProjection: 'persp',
    },
    desc: 'pure-south (matches refs/4_to_5_v1.png)',
  },
  {
    label: '04_on_table_4_facing_5_v2',
    value: {
      angle: -60 * Math.PI / 180,
      zoomScale: 0.65,
      lookAtShiftScale: 2.0,
      pitchTier: 2,
      forceProjection: 'persp',
    },
    desc: 'east-tilt (matches refs/4_to_5_v2.png)',
  },
];

const PORTS_TO_TRY = [3005, 3003, 3001, 3002, 3004, 3000];

async function findGameUrl() {
  for (const port of PORTS_TO_TRY) {
    const url = `http://localhost:${port}`;
    const ok = await new Promise(resolve => {
      const req = http.get(url, res => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => resolve(/Poulet|PB.Flip|bundle\.js/i.test(body)));
      });
      req.on('error', () => resolve(false));
      req.setTimeout(3000, () => { req.destroy(); resolve(false); });
    });
    if (ok) return url;
  }
  throw new Error('Could not find PB-Flip dev server.');
}

function launchChrome(userDataDir) {
  return spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    '--disable-gpu',
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
  await client.Runtime.evaluate({ expression: '1 + 1' });
}

async function captureVariant(client, gameUrl, variant) {
  const { Page, Runtime } = client;

  await Page.navigate({ url: gameUrl });
  await Page.loadEventFired();

  await Runtime.evaluate({
    expression: `
      (async function() {
        const t0 = Date.now();
        while (!(window.__game && window.__game.restaurantTables && window.__game.restaurantTables.length > 0)) {
          if (Date.now() - t0 > 15000) throw new Error('game not ready');
          await new Promise(r => setTimeout(r, 100));
        }
        // Pin the variant so the controller's variant-pick branch fires
        // this exact override regardless of the RNG roll.
        window.__sweepOverride = { key: '4->5', value: ${JSON.stringify(variant.value)} };
        const g = window.__game;
        g.gameMode = 'restaurant';
        g.resolveRestaurantStartTableIndex = function() { return 4; };
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

  const result = await Page.captureScreenshot({ format: 'png', captureBeyondViewport: false });
  const outPath = path.join(OUT_DIR, `${variant.label}.png`);
  fs.writeFileSync(outPath, Buffer.from(result.data, 'base64'));

  const { result: gameState } = await Runtime.evaluate({
    expression: `
      (function() {
        const g = window.__game;
        if (!g) return { error: 'window.__game not exposed' };
        const cam = g.cameraController.activeCamera;
        const cc = g.cameraController;
        const canvas = document.querySelector('canvas');
        return JSON.stringify({
          curBlockIdx: g.currentBlock && g.currentBlock._tableIndex,
          nxtBlockIdx: g.nextBlock && g.nextBlock._tableIndex,
          bottlePos: { x: +g.bottle.mesh.position.x.toFixed(2), y: +g.bottle.mesh.position.y.toFixed(2), z: +g.bottle.mesh.position.z.toFixed(2) },
          curBlockPos: g.currentBlock ? { x: +g.currentBlock.mesh.position.x.toFixed(2), y: +g.currentBlock.mesh.position.y.toFixed(2), z: +g.currentBlock.mesh.position.z.toFixed(2) } : null,
          nxtBlockPos: g.nextBlock ? { x: +g.nextBlock.mesh.position.x.toFixed(2), y: +g.nextBlock.mesh.position.y.toFixed(2), z: +g.nextBlock.mesh.position.z.toFixed(2) } : null,
          lookAt: { x: +cc._currentLookAt.x.toFixed(2), y: +cc._currentLookAt.y.toFixed(2), z: +cc._currentLookAt.z.toFixed(2) },
          camPos: { x: +cam.position.x.toFixed(2), y: +cam.position.y.toFixed(2), z: +cam.position.z.toFixed(2) },
          camIsOrtho: !!cam.isOrthographicCamera,
          camIsPersp: !!cam.isPerspectiveCamera,
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
          targetBlend: cc._targetProjectionBlend,
          lockedToOverrideAxis: cc._lockedToOverrideAxis,
          projection: cc.projection,
          canvasW: canvas && canvas.width, canvasH: canvas && canvas.height,
          canvasCssW: canvas && canvas.clientWidth, canvasCssH: canvas && canvas.clientHeight,
          windowW: window.innerWidth, windowH: window.innerHeight,
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

  const userDataDir = path.join(require('os').tmpdir(), `pb-flip-cdp-v45-${Date.now()}`);
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
  for (const v of VARIANTS) {
    console.log(`[run] ${v.label} — ${v.desc}`);
    try {
      const r = await captureVariant(client, gameUrl, v);
      report.push({ ...v, ...r });
      console.log(`        -> ${r.outPath}`);
      console.log(`        ${r.gameState}`);
    } catch (e) {
      console.error(`[fail] ${v.label}: ${e.message}`);
      report.push({ ...v, error: e.message });
    }
  }

  await client.close();
  proc.kill('SIGTERM');

  fs.writeFileSync(
    path.join(OUT_DIR, '_4to5_variant_report.json'),
    JSON.stringify(report, null, 2)
  );
  console.log(`\n[done] ${report.length} variants. See ${OUT_DIR}`);
})().catch(err => {
  console.error('fatal', err);
  process.exit(1);
});
