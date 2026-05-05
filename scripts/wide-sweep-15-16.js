/* eslint-disable no-console */
// One-off wide-grid sweep for 15→16 only. Scores against the saved
// reference image using the same composite metric as auto-tune-iteration.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const CDP = require('chrome-remote-interface');
const { scoreMatch } = require('./compare-to-refs');

const ROOT = path.resolve(__dirname, '..');
const REFS_DIR = path.join(ROOT, 'docs', 'camera-screenshots', 'refs');
const OUT_DIR = path.join(ROOT, 'docs', 'camera-screenshots', 'sweep', '15_to_16_wide');
fs.mkdirSync(OUT_DIR, { recursive: true });

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9227;
const VIEWPORT = { width: 480, height: 800, dpr: 2 };
const PORTS_TO_TRY = [3003, 3001, 3002, 3004, 3000];

// Wide-grid 15→16. Try both quadrants (camera N or S of bottle) + broad
// dezoom + broad lookAt shift.
const ANGLES = [-120, -100, -80, -60, -45, -30, 30, 45, 60, 75, 90];
const ZOOMS = [0.55, 0.6, 0.65, 0.7];
const SHIFTS = [3, 4, 5, 6];
const KEY = '15->16';
const START_TABLE = 15;

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

async function applyOverrideAndScreenshot(client, gameUrl, combo) {
  const { Page, Runtime } = client;
  await Page.navigate({ url: gameUrl });
  await Page.loadEventFired();
  const overrideValue = {
    angle: (combo.angle * Math.PI) / 180,
    zoomScale: combo.zoom,
    lookAtShiftScale: combo.shift,
  };
  await Runtime.evaluate({
    expression: `
      (async function() {
        const t0 = Date.now();
        while (!(window.__game && window.__game.restaurantTables && window.__game.restaurantTables.length > 0)) {
          if (Date.now() - t0 > 15000) throw new Error('not ready');
          await new Promise(r => setTimeout(r, 100));
        }
        window.__sweepOverride = { key: ${JSON.stringify(KEY)}, value: ${JSON.stringify(overrideValue)} };
        const g = window.__game;
        g.gameMode = 'restaurant';
        g.resolveRestaurantStartTableIndex = function() { return ${START_TABLE}; };
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

(async () => {
  const refIndex = JSON.parse(fs.readFileSync(path.join(REFS_DIR, '_index.json'), 'utf8'));
  const refs = refIndex[KEY];
  if (!refs || refs.length === 0) throw new Error('no refs for 15->16');
  const refBufs = refs.map(r => ({
    buf: fs.readFileSync(path.join(REFS_DIR, r.filename)),
    params: r.params,
  }));

  const gameUrl = await findGameUrl();
  console.log(`[ok] dev server: ${gameUrl}`);
  const userDataDir = path.join(os.tmpdir(), `pb-flip-wide-${Date.now()}`);
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
    expression: `(async function() { const t0 = Date.now(); while (!(window.__game && window.__game.restaurantTables && window.__game.restaurantTables.length > 0)) { if (Date.now() - t0 > 15000) throw new Error('warm-up'); await new Promise(r => setTimeout(r, 100)); } })();`,
    awaitPromise: true,
  });
  await new Promise(r => setTimeout(r, 1500));

  const combos = [];
  for (const a of ANGLES) for (const z of ZOOMS) for (const s of SHIFTS) combos.push({ angle: a, zoom: z, shift: s });
  console.log(`[start] ${combos.length} combos`);

  const ranked = [];
  for (let i = 0; i < combos.length; i++) {
    const combo = combos[i];
    try {
      const buf = await applyOverrideAndScreenshot(client, gameUrl, combo);
      let best = { composite: 0 };
      for (const { buf: refBuf, params: refParams } of refBufs) {
        const r = await scoreMatch(buf, refBuf, {
          curParams: { angle: combo.angle, zoom: combo.zoom, shift: combo.shift },
          refParams,
        });
        if (r.composite > best.composite) best = r;
      }
      const tag = `${best.composite.toFixed(3)}_a${combo.angle}_z${combo.zoom}_s${combo.shift}`;
      fs.writeFileSync(path.join(OUT_DIR, tag + '.png'), buf);
      ranked.push({ combo, score: best.composite, breakdown: best });
      console.log(`  [${i+1}/${combos.length}] ${tag}  geo=${best.geo?.toFixed(2)} phash=${best.phash.toFixed(2)} pixel=${best.pixel.toFixed(2)} ssim=${best.ssim.toFixed(2)}`);
    } catch (e) {
      console.error(`  [${i+1}/${combos.length}] ERROR ${JSON.stringify(combo)}: ${e.message}`);
    }
  }

  ranked.sort((a, b) => b.score - a.score);
  await client.close();
  proc.kill('SIGTERM');

  fs.writeFileSync(path.join(OUT_DIR, '_ranked.json'), JSON.stringify(ranked.slice(0, 10), null, 2));
  console.log('\n=== TOP 5 ===');
  for (let i = 0; i < Math.min(5, ranked.length); i++) {
    const r = ranked[i];
    console.log(`  #${i+1}  ${r.score.toFixed(3)}  a=${r.combo.angle} z=${r.combo.zoom} s=${r.combo.shift}`);
  }
})().catch(e => { console.error('fatal', e); process.exit(1); });
