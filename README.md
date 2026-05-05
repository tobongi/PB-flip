![Play](./screenshots/0.play.gif)

## Start

```bash
git clone https://github.com/wuzekang/bottle-flip.git
cd bottle-flip
npm install
npm start
```

## Hosting & phone-first distribution

Phones are the primary target. The free, no-rewrite stack:

- **Native app (Capacitor)** — wrap `build/` as Android/iOS, runs in a system WebView with real fullscreen and OS-level GPU priority. Best phone perf.
  ```bash
  npm install
  npm run cap:add:android
  npm run cap:sync
  npm run cap:open:android   # build APK in Android Studio
  ```
- **Web fallback (Cloudflare Pages)** — free, unlimited bandwidth, edge-cached. Replaces Vercel.
  ```bash
  npm run deploy:cf
  ```

Full guide: [docs/HOSTING.md](./docs/HOSTING.md).

## Screenshots

| Start       | Game       | Over       |
|-------------|------------|------------|
| ![Start][1] | ![Game][2] | ![Over][3] |


[1]: ./screenshots/1.start.png
[2]: ./screenshots/2.game.png
[3]: ./screenshots/3.over.png