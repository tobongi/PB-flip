# Hosting & Distribution — Free Stack for Phone-First Performance

> Goal: best perceived performance on phones, **zero hosting cost**, **no game-logic rewrite**.

## Live targets

- **Web (live):** https://tobongi.github.io/PB-flip/ — auto-deployed from `master` by `.github/workflows/deploy-web.yml`. Free, served from GitHub Pages CDN, zero bandwidth cap.
- **Android APK (live):** auto-built on every push to `master` by `.github/workflows/build-android.yml`. Download the `bottle-flip-debug-apk` artifact from the Actions tab → most recent green run. Sideload on any Android phone (enable "Install from unknown sources").

## TL;DR

| Channel | Free? | Phone perf | Effort | What it is |
|---|---|---|---|---|
| **Capacitor Android APK** | ✅ free SDK, free sideload | **best** | 1 hr | Native wrapper around `build/` |
| **Capacitor iOS** | ✅ to develop, $99/yr to ship to App Store | best | 1 hr | Same wrapper for iOS |
| **Cloudflare Pages PWA** | ✅ unlimited bandwidth | good | 10 min | Web fallback, installable to homescreen |
| Vercel (current) | partial — 100 GB/mo cap | good | — | Replace with Cloudflare Pages |

The native wrappers are the **runtime FPS win** on phones. The PWA on Cloudflare Pages is the **free, frictionless URL** for everyone else.

---

## Why this beats the current setup

The current setup serves the Three.js bundle from Vercel and runs in Chrome/Safari. On low-end Android the browser tab is the bottleneck — Chrome competes with other tabs for GPU and memory, throttles when backgrounded, can't go truly fullscreen, and forces `devicePixelRatio` higher than the game needs.

Wrapping the **same** `build/` output in Capacitor:

- Runs in a dedicated system WebView (Android WebView / WKWebView), no tab overhead
- Real fullscreen, no browser chrome stealing pixels
- The OS treats it as a foreground game → better GPU scheduling
- Free to skip iOS — Android alone covers most low-end phones
- Free to **sideload** the APK forever (no Play Store fee needed for testing or direct distribution)

No game code changes. The source of truth is still `build/`.

---

## 1. Native phone build (Capacitor) — the main win

### Prereqs (one-time, free)
- Node 18+ (already required)
- Android Studio (free) — for Android builds
- Xcode (free, macOS only) — for iOS builds, optional

### Install
```bash
npm install
```
Capacitor packages are listed under `optionalDependencies` so CI on the web track doesn't need them.

### Add Android
```bash
npm run cap:add:android
npm run cap:sync
npm run cap:open:android
```
That opens Android Studio. Hit Run → produces an APK that runs your existing `build/` natively. Sideload to any Android device with USB debugging.

### Add iOS (optional)
```bash
npm run cap:add:ios
npm run cap:sync
npm run cap:open:ios
```

### Iterate
After any code change:
```bash
npm run cap:sync          # rebuilds web + syncs to native
npm run cap:run:android   # rebuilds + deploys to attached device
```

### Distribution (still free)
- **Sideload APK**: zero cost, give friends a link to the `.apk` file
- **Google Play**: $25 one-time, lifetime
- **Apple App Store**: $99/yr (skip unless you need iOS distribution)

---

## 2. Web fallback (Cloudflare Pages PWA)

For people who land on a URL, Cloudflare Pages is the best free option:
- **Unlimited bandwidth** on the free tier (Vercel free caps at 100 GB/mo)
- 275+ edge POPs worldwide
- Free HTTP/3, Brotli, custom domain, SSL
- Free GitHub integration with preview deploys

### Deploy
1. Push to GitHub
2. Cloudflare Dashboard → Pages → Connect to Git → select repo
3. Build command: `npm run build`
4. Output directory: `build`
5. Deploy

Or via CLI (one-shot):
```bash
npx wrangler pages deploy build --project-name=pb-flip
```

`public/_headers` and `public/_redirects` are already in this repo and get copied into `build/`. They mirror the rules `vercel.json` had.

The existing `public/manifest.json` + `public/service-worker.js` make the web build a real PWA — second visit is instant, installable to homescreen on Android (acts very close to the Capacitor build, just without the OS-level GPU priority).

You can keep `vercel.json` for now or delete it — Cloudflare ignores it.

---

## 3. Asset compression (optional, biggest single perf win)

Hosting can't fix runtime FPS — but smaller assets help both load time **and** GPU memory pressure on phones. Two cheap, free wins:

```bash
# Mesh compression (Three.js loads via DRACOLoader / MeshoptDecoder)
npx gltf-transform draco public/models/*.glb -o build/models/

# Texture compression (Three.js loads via KTX2Loader)
npx @khronosgroup/ktx-software public/images/*.png -o build/images/
# or use https://github.com/donmccurdy/glTF-Transform's `etc1s`/`uastc` commands
```

KTX2 textures are GPU-native (no decompress step), often 5–10× smaller, and stay compressed in VRAM — directly raises the FPS ceiling on weak GPUs.

This is left as an opt-in step because it touches asset pipelines; the Capacitor wrapper alone already gives the biggest device-side perf jump.

---

## Upgrading the web host to Cloudflare Pages later

GitHub Pages is the free autonomous default. To switch the web host to Cloudflare Pages (more POPs, faster TTFB in some regions, same $0):

1. Cloudflare Dashboard → Pages → Connect to Git → pick `tobongi/PB-flip`
2. Build command: `npm install --legacy-peer-deps && CI=false NODE_OPTIONS=--openssl-legacy-provider npm run build`
3. Output dir: `build`
4. Set env vars: `NODE_VERSION=16`
5. Done — `public/_headers` and `public/_redirects` are already in this repo and Cloudflare will pick them up automatically.

You can keep both hosts running in parallel; GitHub Pages keeps deploying from the workflow, Cloudflare deploys from its own Git integration.

## Recommended rollout

1. **Today**: deploy to Cloudflare Pages (10 min). Replaces Vercel, no bandwidth cap.
2. **This week**: `npm run cap:add:android && npm run cap:sync` → ship a sideloadable APK. That's the free phone perf win.
3. **Later**: KTX2/Draco asset compression if FPS still isn't where you want it on the bottom 25% of devices.
4. **Optional**: $25 Google Play listing for discoverability.

That's the entire free phone-first stack with zero game-logic changes.
