/* eslint-disable no-console */
// Lists meshes between the 15→16 camera target position and bottle 15 itself
// so we can identify any internal partition blocking the cinematic view.

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const CDP = require('chrome-remote-interface');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9227;
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
  const userDataDir = path.join(require('os').tmpdir(), `pb-flip-cdp-occluder-${Date.now()}`);
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

  const { result } = await client.Runtime.evaluate({
    expression: `
      (function() {
        try {
          const g = window.__game;
          // Camera target position for 15→16 with current override (~SW of bottle 15).
          const camPos = { x: 6.28, y: 18.03, z: 6.99 };
          // Bottle 15 world position.
          const bottle15 = { x: 10.0, y: 18.35, z: 1.79 };
          // The line from camera to bottle 15.
          const dx = bottle15.x - camPos.x, dy = bottle15.y - camPos.y, dz = bottle15.z - camPos.z;
          const len = Math.hypot(dx, dy, dz);
          const ux = dx / len, uy = dy / len, uz = dz / len;
          const PERP = 2.5;
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
            // Param along the segment, 0..1.
            const relX = cx - camPos.x, relY = cy - camPos.y, relZ = cz - camPos.z;
            const along = relX * ux + relY * uy + relZ * uz;
            if (along < 0 || along > len) return;
            // Perpendicular distance to line.
            const projX = camPos.x + along * ux;
            const projY = camPos.y + along * uy;
            const projZ = camPos.z + along * uz;
            const perpDist = Math.hypot(cx - projX, cy - projY, cz - projZ);
            if (perpDist > PERP) return;
            // Skip floor (cz near 0).
            if (maxZ < 0.5) return;
            candidates.push({
              name: node.name, visible: node.visible,
              cx: +cx.toFixed(2), cy: +cy.toFixed(2), cz: +cz.toFixed(2),
              sx: +(maxX - minX).toFixed(2), sy: +(maxY - minY).toFixed(2), sz: +(maxZ - minZ).toFixed(2),
              along: +along.toFixed(2), perp: +perpDist.toFixed(2),
            });
          });
          candidates.sort((a, b) => a.along - b.along);
          return JSON.stringify({ camPos, bottle15, lineLen: +len.toFixed(2), count: candidates.length, candidates });
        } catch (e) {
          return JSON.stringify({ error: e.message, stack: e.stack });
        }
      })();
    `,
    returnByValue: true,
  });

  const out = JSON.parse(result.value);
  if (out.error) {
    console.error('Probe error:', out.error, out.stack);
  } else {
    console.log('camera:', out.camPos, '→ bottle15:', out.bottle15, 'len:', out.lineLen);
    console.log(`${out.count} mesh(es) on the segment camera↔bottle15:`);
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
