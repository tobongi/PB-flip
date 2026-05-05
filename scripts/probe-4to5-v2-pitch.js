/* eslint-disable no-console */
// Probe: force the 4->5 v2 variant (-60°) at each pitch tier (0/1/2/3)
// and capture a screenshot. Helps determine which pitch tier the user-approved
// reference v2 was captured at, so we can bake it into the override schema.
//
// Usage:
//   node scripts/probe-4to5-v2-pitch.js
//   -> writes docs/camera-screenshots/probe/4to5_v2_pitch{0,1,2,3}.png

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const CDP = require('chrome-remote-interface');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9225;
const VIEWPORT = { width: 480, height: 800, dpr: 2 };
const OUT_DIR = path.resolve(__dirname, '..', 'docs', 'camera-screenshots', 'probe');
fs.mkdirSync(OUT_DIR, { recursive: true });

const PROBES = [
  { tier: 0, label: '4to5_v2_pitch0' },
  { tier: 1, label: '4to5_v2_pitch1' },
  { tier: 2, label: '4to5_v2_pitch2' },
  { tier: 3, label: '4to5_v2_pitch3' },
];

async function findGameUrl() {
  // Probe ports until one serves PB-Flip; 3005 is the canonical dev port now.
  for (const port of [3005, 3003, 3001, 3002, 3004, 3000]) {
    return `http://localhost:${port}`;
  }
  return 'http://localhost:3005';
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

async function probeTier(client, gameUrl, probe) {
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
        window.__sweepOverride = { key: '4->5', value: { angle: -60 * Math.PI / 180, zoomScale: 0.65, lookAtShiftScale: 2.0 } };
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
        // Wait a tick for setTarget to fire, then jam the pitch tier so the
        // smoothed value lerps to it. Also reach into _refreshTargetCameraAxis
        // wrapper by overriding it once and then calling setTarget again.
        await new Promise(r => setTimeout(r, 200));
        const cc = g.cameraController;
        // Pin the pitch by overriding the sweep result every update tick.
        const wantTier = ${probe.tier};
        cc._targetPitchIdx = wantTier;
        // Patch the obstacle-sweep to keep our pinned tier on every update.
        const orig = cc._refreshTargetCameraAxis.bind(cc);
        cc._refreshTargetCameraAxis = function(b) {
          orig(b);
          cc._targetPitchIdx = wantTier;
          cc._targetDistanceScale = 1;
        };
      })();
    `,
    awaitPromise: true,
  });

  await new Promise(r => setTimeout(r, 4500));

  const result = await Page.captureScreenshot({ format: 'png', captureBeyondViewport: false });
  const outPath = path.join(OUT_DIR, `${probe.label}.png`);
  fs.writeFileSync(outPath, Buffer.from(result.data, 'base64'));

  const { result: state } = await Runtime.evaluate({
    expression: `
      (function() {
        const cc = window.__game.cameraController;
        const cam = cc.activeCamera;
        return JSON.stringify({
          pitchIdx: cc._targetPitchIdx,
          smoothedPitch: +cc._smoothedPitch.toFixed(3),
          camPos: { x: +cam.position.x.toFixed(2), y: +cam.position.y.toFixed(2), z: +cam.position.z.toFixed(2) },
          tarZoom: +cc._tarZoom.toFixed(3),
          curZoom: +cc._curZoom.toFixed(3),
        });
      })();
    `,
    returnByValue: true,
  });

  return { outPath, gameState: state.value };
}

(async () => {
  const gameUrl = await findGameUrl();
  console.log(`[ok] dev server: ${gameUrl}`);

  const userDataDir = path.join(require('os').tmpdir(), `pb-flip-cdp-probe-${Date.now()}`);
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

  for (const p of PROBES) {
    console.log(`[probe] tier=${p.tier}`);
    const r = await probeTier(client, gameUrl, p);
    console.log(`        -> ${r.outPath}`);
    console.log(`        ${r.gameState}`);
  }

  await client.close();
  proc.kill('SIGTERM');
  console.log(`\n[done] See ${OUT_DIR}`);
})().catch(err => {
  console.error('fatal', err);
  process.exit(1);
});
