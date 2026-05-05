/* eslint-disable no-console */
// Identifies the mesh acting as the partition/divider between tables 25 and 26.
// Lists every named mesh whose world-space bbox center sits between the two
// bottle XY positions so the divider can be added to createWallOpenings'
// hideNames set in src/game/worlds/restaurant.js.
//
// Usage: node scripts/probe-25-26-divider.js

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const CDP = require('chrome-remote-interface');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9226;
const VIEWPORT = { width: 480, height: 800, dpr: 2 };

async function findGameUrl() {
  for (const port of [3005, 3003, 3001, 3002, 3004, 3000]) {
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
  throw new Error('PB-Flip dev server not found');
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
  const userDataDir = path.join(require('os').tmpdir(), `pb-flip-cdp-divider-${Date.now()}`);
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
        while (!(window.__game && window.__game.restaurantModel && window.__game.restaurantTables.length > 0)) {
          if (Date.now() - t0 > 20000) throw new Error('model not ready');
          await new Promise(r => setTimeout(r, 100));
        }
      })();
    `,
    awaitPromise: true,
  });

  const { result, exceptionDetails } = await client.Runtime.evaluate({
    expression: `
      (function() {
        try {
          const g = window.__game;
          const tables = g.restaurantTables;
          const t25 = tables.find(t => t.index === 25);
          const t26 = tables.find(t => t.index === 26);
          if (!t25 || !t26) return JSON.stringify({ error: 'tables 25/26 missing' });
          const ax = t25.position.x, ay = t25.position.y;
          const bx = t26.position.x, by = t26.position.y;
          const midX = (ax + bx) / 2, midY = (ay + by) / 2;
          const lineDx = bx - ax, lineDy = by - ay;
          const lineLen = Math.hypot(lineDx, lineDy);
          const ux = lineDx / lineLen, uy = lineDy / lineLen;
          const nx = -uy, ny = ux;
          const PERP = 3.0;
          const HALF = lineLen / 2 + 0.6;

          // We need to walk the restaurantModel and compute world-space bbox per mesh.
          // Use mesh.geometry.boundingBox + matrixWorld manually (no THREE.Box3 import here).
          const candidates = [];
          g.restaurantModel.traverse(node => {
            if (!node.isMesh || !node.name || !node.geometry) return;
            if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
            node.updateMatrixWorld(true);
            const local = node.geometry.boundingBox;
            let minX = Infinity, minY = Infinity, minZ = Infinity;
            let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
            const m = node.matrixWorld.elements;
            for (let i = 0; i < 8; i++) {
              const lx = (i & 1) ? local.max.x : local.min.x;
              const ly = (i & 2) ? local.max.y : local.min.y;
              const lz = (i & 4) ? local.max.z : local.min.z;
              const wx = m[0]*lx + m[4]*ly + m[8]*lz + m[12];
              const wy = m[1]*lx + m[5]*ly + m[9]*lz + m[13];
              const wz = m[2]*lx + m[6]*ly + m[10]*lz + m[14];
              if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
              if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
              if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
            }
            const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
            const relX = cx - midX, relY = cy - midY;
            const along = relX * ux + relY * uy;
            const perp = relX * nx + relY * ny;
            if (Math.abs(along) > HALF) return;
            if (Math.abs(perp) > PERP) return;
            if (maxZ < 0.5) return;   // floor
            if (minZ > 4.5) return;   // ceiling
            candidates.push({
              name: node.name, visible: node.visible,
              cx: +cx.toFixed(2), cy: +cy.toFixed(2), cz: +cz.toFixed(2),
              sx: +(maxX - minX).toFixed(2), sy: +(maxY - minY).toFixed(2), sz: +(maxZ - minZ).toFixed(2),
              along: +along.toFixed(2), perp: +perp.toFixed(2),
            });
          });
          candidates.sort((a, b) => Math.abs(a.along) - Math.abs(b.along));
          return JSON.stringify({
            t25: { x: +ax.toFixed(2), y: +ay.toFixed(2) },
            t26: { x: +bx.toFixed(2), y: +by.toFixed(2) },
            mid: { x: +midX.toFixed(2), y: +midY.toFixed(2) },
            lineLen: +lineLen.toFixed(2),
            count: candidates.length,
            candidates,
          });
        } catch (e) {
          return JSON.stringify({ error: e.message, stack: e.stack });
        }
      })();
    `,
    returnByValue: true,
  });

  if (exceptionDetails) {
    console.error('CDP eval threw:', exceptionDetails);
    process.exit(1);
  }
  if (!result || result.value === undefined) {
    console.error('CDP eval returned undefined; result:', result);
    process.exit(1);
  }

  const out = JSON.parse(result.value);
  if (out.error) {
    console.error('Probe error:', out.error, out.stack);
  } else {
    console.log('t25:', out.t25, 't26:', out.t26, 'mid:', out.mid, 'len:', out.lineLen);
    console.log(`${out.count} mesh(es) between 25↔26:`);
    out.candidates.forEach(c => {
      console.log(`  ${c.name.padEnd(18)} vis=${c.visible} center=(${c.cx},${c.cy},${c.cz}) size=(${c.sx}x${c.sy}x${c.sz}) along=${c.along} perp=${c.perp}`);
    });
  }

  await client.close();
  proc.kill('SIGTERM');
})().catch(err => {
  console.error('fatal', err);
  process.exit(1);
});
