/* eslint-disable no-console */
// Wall-blocking detector. Loads the running game in headless Chrome,
// jumps to a target table, then raycasts from camera position to bottle
// position 60 times over 6 seconds. Aggregates which mesh names get hit
// (i.e. obstructions) so we know exactly which Cube### to add to
// createWallOpenings() in restaurant.js if we want the camera to have a
// clean shot for that transition.
//
// Usage:
//   node scripts/wall-blocking-detector.js --transition 15->16
//   node scripts/wall-blocking-detector.js --transition 16->17
//
// Saves: docs/camera-screenshots/_blocking-report-{key}.json

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const CDP = require('chrome-remote-interface');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9225;
const VIEWPORT = { width: 480, height: 800, dpr: 2 };
const PORTS_TO_TRY = [3003, 3001, 3002, 3004, 3000];
const OUT_DIR = path.resolve(__dirname, '..', 'docs', 'camera-screenshots');

const args = process.argv.slice(2);
function flag(n) { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; }
const TRANSITION = flag('--transition') || '15->16';
const [FROM, TO] = TRANSITION.split('->').map(Number);

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

(async () => {
  const gameUrl = await findGameUrl();
  console.log(`[ok] dev server: ${gameUrl}`);
  const userDataDir = path.join(os.tmpdir(), `pb-flip-blockdet-${Date.now()}`);
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
          if (Date.now() - t0 > 15000) throw new Error('game not ready');
          await new Promise(r => setTimeout(r, 100));
        }
        const g = window.__game;
        g.gameMode = 'restaurant';
        g.resolveRestaurantStartTableIndex = function() { return ${FROM}; };
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

  await new Promise(r => setTimeout(r, 4000));

  // Raycast from camera to bottle 60 times, aggregate hits.
  const { result } = await client.Runtime.evaluate({
    expression: `
      (async function() {
        const g = window.__game;
        const THREE = g.bottle.mesh.constructor; // grab THREE from a Three object
        // We need the actual THREE module. Use the imported scene's reference.
        const scene = g.scene;
        const camera = g.cameraController.activeCamera;
        const bottle = g.bottle.mesh;
        // Walk the scene to find ALL meshes (deep traversal).
        const meshes = [];
        scene.traverse(o => { if (o.isMesh && o !== bottle && o.visible) meshes.push(o); });
        const counts = {};
        const rcCtor = camera.rotation.constructor.prototype.constructor.name === 'Euler'
          ? null : null; // not useful
        // Hardcoded import: webpack scoping — use scene's userData if THREE
        // is exposed there. Simpler: use the existing controller's _raycaster
        // or create one via the class on a known Three object's prototype.
        const proto = Object.getPrototypeOf(camera);
        // Get THREE.Raycaster — three exposes it via the same module graph
        // as Camera. Walk prototype chain to find a static Raycaster import.
        // Pragmatic: hand-roll a sphere/box hit test isn't worth it; use
        // the controller's existing _raycaster via update().
        const ctrl = g.cameraController;
        if (!ctrl._raycaster) {
          // Force one update to materialize the raycaster.
          ctrl._refreshTargetCameraAxis(g.bottle);
        }
        const raycaster = ctrl._raycaster;
        if (!raycaster) {
          return JSON.stringify({ error: 'no raycaster available' });
        }

        for (let i = 0; i < 60; i++) {
          const camPos = camera.position;
          const labelPos = g.bottle.getLabelWorldPosition();
          const dir = labelPos.clone().sub(camPos).normalize();
          raycaster.set(camPos, dir);
          raycaster.far = camPos.distanceTo(labelPos) - 0.05;
          const hits = raycaster.intersectObjects(meshes, true);
          for (const h of hits) {
            const name = h.object.name || '<unnamed>';
            counts[name] = (counts[name] || 0) + 1;
          }
          await new Promise(r => setTimeout(r, 100));
        }
        return JSON.stringify({
          transitionKey: ${JSON.stringify(TRANSITION)},
          framesRaycast: 60,
          camPos: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
          bottlePos: { x: bottle.position.x, y: bottle.position.y, z: bottle.position.z },
          blockedBy: Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({ name, hits: count })),
        });
      })();
    `,
    awaitPromise: true,
    returnByValue: true,
  });

  await client.close();
  proc.kill('SIGTERM');

  const report = JSON.parse(result.value);
  const out = path.join(OUT_DIR, `_blocking-report-${TRANSITION.replace('->', '_to_')}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`[done] ${out}`);
})().catch(err => { console.error('fatal', err); process.exit(1); });
