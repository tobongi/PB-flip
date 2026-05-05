# PB-flip Mini Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a premium multi-page marketing website in `website/` (Vite + React 18 + Tailwind + shadcn + framer-motion) with the existing PB-flip game embedded via iframe on the Play page.

**Architecture:** A standalone `website/` Vite project lives alongside the existing webpack 3 game. The game runs as a separate process (or is pre-built into `website/public/game/`). All website pages share a fixed Nav; the Play page shows a full-viewport iframe of the game. Design uses the existing brand palette (olive, dark, cream, brass) via Tailwind custom tokens, with shadcn/ui primitives and framer-motion for premium transitions.

**Tech Stack:** Vite 5, React 18, TypeScript, Tailwind CSS v3, shadcn/ui, framer-motion v11, react-router-dom v6, Cormorant Garamond + Josefin Sans (Google Fonts)

---

## Scope

Four pages + shared Nav:

| Route | Page | Description |
|---|---|---|
| `/` | Landing | Hero, animated tagline, "Play Now" CTA, features, how-to-play inline |
| `/play` | Play | Full-viewport iframe embed of the game |
| `/about` | About | Brand story for Poulet Braisé Flip |
| `/how-to-play` | How To Play | Step-by-step animated instructions |

---

## File Map

```
website/
  package.json                  NEW — vite, react18, tailwind, shadcn, framer-motion, react-router-dom
  vite.config.ts                NEW — proxy /game → game dev server
  tailwind.config.ts            NEW — custom colors, fonts
  tsconfig.json                 NEW
  index.html                    NEW — Google Fonts, meta
  components.json               NEW — shadcn init config
  postcss.config.js             NEW
  src/
    main.tsx                    NEW — ReactDOM.createRoot, BrowserRouter
    App.tsx                     NEW — Routes, ScrollRestoration
    styles/
      globals.css               NEW — Tailwind directives + CSS tokens
    components/
      Nav.tsx                   NEW — fixed header, logo, nav links, Play CTA
      Footer.tsx                NEW — minimal brand footer
      GameIframe.tsx            NEW — <iframe> with loading skeleton
    pages/
      LandingPage.tsx           NEW — Hero + features + how-to-play sections
      PlayPage.tsx              NEW — full-viewport game embed
      AboutPage.tsx             NEW — brand story
      HowToPlayPage.tsx         NEW — step instructions
    lib/
      utils.ts                  NEW — cn() helper (shadcn standard)
```

**No existing files modified.** The game (`src/`) is untouched. The website is a self-contained sibling project.

---

## Task 1: Scaffold `website/` project

**Files:**
- Create: `website/package.json`
- Create: `website/tsconfig.json`
- Create: `website/vite.config.ts`
- Create: `website/postcss.config.js`
- Create: `website/index.html`
- Create: `website/components.json`

- [ ] **Step 1: Create `website/package.json`**

```json
{
  "name": "pb-flip-website",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.4",
    "@radix-ui/react-navigation-menu": "^1.2.3",
    "@radix-ui/react-slot": "^1.1.2",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "framer-motion": "^11.11.17",
    "lucide-react": "^0.468.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0",
    "tailwind-merge": "^2.5.5"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.16",
    "typescript": "^5.7.2",
    "vite": "^5.4.11"
  }
}
```

- [ ] **Step 2: Create `website/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `website/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5173,
    proxy: {
      '/game': {
        target: 'http://localhost:3000',
        rewrite: (p) => p.replace(/^\/game/, ''),
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 4: Create `website/postcss.config.js`**

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 5: Create `website/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#1a1f0e" />
    <link rel="icon" href="/favicon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,400;1,600&family=Josefin+Sans:wght@300;400;600;700&display=swap"
      rel="stylesheet"
    />
    <title>Poulet Braisé Flip</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `website/components.json`** (shadcn config)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/styles/globals.css",
    "baseColor": "stone",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

- [ ] **Step 7: Install dependencies**

```bash
cd website && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 8: Commit**

```bash
git add website/
git commit -m "chore: scaffold website/ vite+react18+tailwind project"
```

---

## Task 2: Design tokens + Tailwind config

**Files:**
- Create: `website/tailwind.config.ts`
- Create: `website/src/styles/globals.css`
- Create: `website/src/lib/utils.ts`

- [ ] **Step 1: Create `website/tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        olive: {
          950: '#0f1208',
          900: '#1a1f0e',
          800: '#2D3319',
          700: '#3d4522',
          600: '#4f5a2c',
          400: '#8a9a52',
        },
        cream: {
          DEFAULT: '#F5F0E8',
          50: '#FAF8F4',
          100: '#F5F0E8',
          200: '#EDE4D4',
        },
        brass: {
          DEFAULT: '#C9A84C',
          light: '#E4C97A',
          dark: '#9A7A2E',
        },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"Josefin Sans"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      spacing: {
        18: '4.5rem',
        22: '5.5rem',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 2: Create `website/src/styles/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 74 16% 8%;
    --foreground: 40 33% 93%;
    --card: 78 20% 13%;
    --card-foreground: 40 33% 93%;
    --border: 80 15% 22%;
    --input: 80 15% 22%;
    --ring: 43 55% 55%;
    --radius: 0.25rem;
    --brand: 43 55% 55%;
  }

  * { @apply border-border; }

  html { scroll-behavior: smooth; }

  body {
    @apply bg-olive-900 text-cream font-sans antialiased;
    background-color: #1a1f0e;
    color: #F5F0E8;
  }

  h1, h2, h3 {
    @apply font-display;
    font-feature-settings: "kern" 1, "liga" 1;
  }

  ::selection {
    background-color: #C9A84C33;
    color: #F5F0E8;
  }

  :focus-visible {
    outline: 2px solid #C9A84C;
    outline-offset: 3px;
  }

  /* Hide scrollbar while keeping scrollability */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #1a1f0e; }
  ::-webkit-scrollbar-thumb { background: #3d4522; border-radius: 3px; }
}

@layer utilities {
  .text-brass { color: #C9A84C; }
  .border-brass { border-color: #C9A84C; }
  .bg-olive-glass {
    background: rgba(45, 51, 25, 0.72);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
}
```

- [ ] **Step 3: Create `website/src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Commit**

```bash
git add website/tailwind.config.ts website/src/styles/globals.css website/src/lib/utils.ts
git commit -m "feat(website): add design tokens, Tailwind config, globals"
```

---

## Task 3: `main.tsx` + `App.tsx` (router shell)

**Files:**
- Create: `website/src/main.tsx`
- Create: `website/src/App.tsx`

- [ ] **Step 1: Create `website/src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

- [ ] **Step 2: Create `website/src/App.tsx`**

```tsx
import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Nav from './components/Nav';
import Footer from './components/Footer';
import LandingPage from './pages/LandingPage';
import PlayPage from './pages/PlayPage';
import AboutPage from './pages/AboutPage';
import HowToPlayPage from './pages/HowToPlayPage';

export default function App() {
  const location = useLocation();
  const isPlay = location.pathname === '/play';

  return (
    <div className="min-h-screen flex flex-col">
      <Nav hideLinks={isPlay} />
      <main className="flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/play" element={<PlayPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/how-to-play" element={<HowToPlayPage />} />
          </Routes>
        </AnimatePresence>
      </main>
      {!isPlay && <Footer />}
    </div>
  );
}
```

- [ ] **Step 3: Verify dev server starts**

```bash
cd website && npm run dev
```

Expected: Vite starts on port 5173, browser shows blank page (no pages yet), no compile errors.

- [ ] **Step 4: Commit**

```bash
git add website/src/main.tsx website/src/App.tsx
git commit -m "feat(website): add router shell and app entry"
```

---

## Task 4: Nav component

**Files:**
- Create: `website/src/components/Nav.tsx`

- [ ] **Step 1: Create `website/src/components/Nav.tsx`**

```tsx
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const links = [
  { to: '/how-to-play', label: 'How To Play' },
  { to: '/about', label: 'About' },
];

interface NavProps {
  hideLinks?: boolean;
}

export default function Nav({ hideLinks = false }: NavProps) {
  const { pathname } = useLocation();

  return (
    <motion.header
      initial={{ y: -64, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-0 left-0 right-0 z-50 bg-olive-glass border-b border-olive-700/50"
    >
      <nav
        className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between"
        aria-label="Main navigation"
      >
        {/* Logo */}
        <Link
          to="/"
          className="font-display text-xl font-bold tracking-wider text-cream hover:text-brass transition-colors duration-200"
          aria-label="PB Flip home"
        >
          PB<span className="text-brass mx-0.5">·</span>FLIP
        </Link>

        {!hideLinks && (
          <div className="flex items-center gap-8">
            {links.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  'font-sans text-xs font-600 uppercase tracking-widest transition-colors duration-200',
                  pathname === to
                    ? 'text-brass'
                    : 'text-cream/60 hover:text-cream',
                )}
              >
                {label}
              </Link>
            ))}

            <Link
              to="/play"
              className="font-sans text-xs font-700 uppercase tracking-widest px-5 py-2 border border-brass text-brass hover:bg-brass hover:text-olive-950 transition-all duration-200"
            >
              Play
            </Link>
          </div>
        )}

        {hideLinks && (
          <Link
            to="/"
            className="font-sans text-xs font-600 uppercase tracking-widest text-cream/60 hover:text-cream transition-colors duration-200 flex items-center gap-2"
          >
            <span aria-hidden>←</span> Back
          </Link>
        )}
      </nav>
    </motion.header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/Nav.tsx
git commit -m "feat(website): add Nav component with play CTA"
```

---

## Task 5: Footer component

**Files:**
- Create: `website/src/components/Footer.tsx`

- [ ] **Step 1: Create `website/src/components/Footer.tsx`**

```tsx
import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="border-t border-olive-700/50 py-10 mt-auto">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="font-display text-lg text-cream/40 tracking-wider">
          Poulet Braisé Flip
        </span>
        <div className="flex items-center gap-6">
          <Link
            to="/how-to-play"
            className="font-sans text-2xs uppercase tracking-widest text-cream/40 hover:text-cream transition-colors"
          >
            How to Play
          </Link>
          <Link
            to="/about"
            className="font-sans text-2xs uppercase tracking-widest text-cream/40 hover:text-cream transition-colors"
          >
            About
          </Link>
          <Link
            to="/play"
            className="font-sans text-2xs uppercase tracking-widest text-brass hover:text-brass-light transition-colors"
          >
            Play →
          </Link>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/Footer.tsx
git commit -m "feat(website): add Footer component"
```

---

## Task 6: GameIframe component

**Files:**
- Create: `website/src/components/GameIframe.tsx`

The game runs at `http://localhost:3000` in dev. In production it should be served at `/game/`. The iframe src is determined by an env var.

- [ ] **Step 1: Create `website/src/components/GameIframe.tsx`**

```tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const GAME_SRC = import.meta.env.VITE_GAME_URL ?? 'http://localhost:3000';

export default function GameIframe() {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative w-full h-full bg-olive-950">
      {/* Skeleton shown until iframe fires onLoad */}
      <AnimatePresence>
        {!loaded && (
          <motion.div
            key="skeleton"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 flex items-center justify-center"
            aria-label="Loading game…"
          >
            <div className="flex flex-col items-center gap-4">
              <motion.img
                src="/images/sticker-rond-pb.webp"
                alt="PB"
                className="w-20 h-20 rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              />
              <span className="font-display text-cream/40 text-lg tracking-widest">
                Loading…
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <iframe
        src={GAME_SRC}
        title="Poulet Braisé Flip Game"
        className="absolute inset-0 w-full h-full border-0"
        allow="autoplay"
        onLoad={() => setLoaded(true)}
        style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.4s ease' }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Copy the sticker image for the skeleton**

The skeleton uses `/images/sticker-rond-pb.webp`. Copy the asset so the website can use it:

```bash
mkdir -p website/public/images
cp public/images/sticker-rond-pb.webp website/public/images/sticker-rond-pb.webp
cp public/favicon.png website/public/favicon.png
```

- [ ] **Step 3: Commit**

```bash
git add website/src/components/GameIframe.tsx website/public/
git commit -m "feat(website): add GameIframe component with loading skeleton"
```

---

## Task 7: PlayPage

**Files:**
- Create: `website/src/pages/PlayPage.tsx`

- [ ] **Step 1: Create `website/src/pages/PlayPage.tsx`**

```tsx
import { motion } from 'framer-motion';
import GameIframe from '@/components/GameIframe';

export default function PlayPage() {
  return (
    <motion.div
      key="play"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 pt-14 bg-olive-950"
    >
      <GameIframe />
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify game loads in iframe**

With the game running (`npm start` in root), navigate in the website to `/play`. Confirm:
- Skeleton spinner shows while game loads
- Game iframe appears and is interactive (tap/click registers)
- Nav shows "← Back" link
- Back link returns to `/`

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/PlayPage.tsx
git commit -m "feat(website): add PlayPage with game iframe embed"
```

---

## Task 8: LandingPage — Hero section

**Files:**
- Create: `website/src/pages/LandingPage.tsx` (built across Tasks 8, 9, 10)

- [ ] **Step 1: Add hero section to `website/src/pages/LandingPage.tsx`**

```tsx
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  }),
};

export default function LandingPage() {
  const featuresRef = useRef<HTMLElement>(null);

  return (
    <motion.div
      key="landing"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 pt-14 overflow-hidden">
        {/* Subtle radial glow — olive, not purple */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(45,51,25,0.9) 0%, #1a1f0e 65%)',
          }}
        />

        {/* Brand sticker */}
        <motion.img
          src="/images/sticker-rond-pb.webp"
          alt="Poulet Braisé"
          className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-full mb-8 shadow-2xl"
          initial={{ scale: 0.8, opacity: 0, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
        />

        {/* Title */}
        <motion.h1
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="relative font-display font-bold text-cream leading-none"
          style={{ fontSize: 'clamp(3rem, 10vw, 7rem)', letterSpacing: '-0.01em' }}
        >
          Poulet Braisé
          <br />
          <em className="text-brass not-italic">Flip</em>
        </motion.h1>

        {/* Tagline */}
        <motion.p
          custom={1}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="relative mt-6 font-sans text-sm sm:text-base uppercase tracking-widest text-cream/50 max-w-xs"
        >
          The bottle flip game you never knew you needed
        </motion.p>

        {/* CTA */}
        <motion.div
          custom={2}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="relative mt-10 flex flex-col sm:flex-row items-center gap-4"
        >
          <Link
            to="/play"
            className="px-10 py-4 font-sans text-xs font-700 uppercase tracking-widest bg-brass text-olive-950 hover:bg-brass-light transition-colors duration-200 shadow-lg"
          >
            Play Now
          </Link>
          <button
            onClick={() => featuresRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="font-sans text-2xs uppercase tracking-widest text-cream/40 hover:text-cream transition-colors duration-200"
          >
            Learn more ↓
          </button>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          aria-hidden
        >
          <div className="w-px h-12 bg-gradient-to-b from-transparent via-cream/20 to-transparent mx-auto" />
        </motion.div>
      </section>

      {/* Features + How To Play injected in next tasks */}
      <FeaturesSection ref={featuresRef} />
      <HowToPlaySection />
    </motion.div>
  );
}

// Stubs — filled in Tasks 9 and 10
import { forwardRef } from 'react';
const FeaturesSection = forwardRef<HTMLElement>(function FeaturesSection(_props, ref) {
  return <section ref={ref} />;
});
function HowToPlaySection() { return null; }
```

- [ ] **Step 2: Verify hero renders**

Navigate to `/`. Confirm:
- Full-height hero section with sticker, title, tagline, "Play Now" button
- "Play Now" links to `/play`
- No console errors

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/LandingPage.tsx
git commit -m "feat(website): add landing page hero section"
```

---

## Task 9: LandingPage — Features section

**Files:**
- Modify: `website/src/pages/LandingPage.tsx` (replace `FeaturesSection` stub)

- [ ] **Step 1: Replace `FeaturesSection` in `LandingPage.tsx`**

Remove the stub `FeaturesSection` at the bottom of the file and replace it with:

```tsx
import { useInView } from 'framer-motion';

const FEATURES = [
  {
    icon: '🍽️',
    title: 'Restaurant Mode',
    body: 'Navigate the full restaurant — 28 tables, escalating difficulty, increasing bottle sizes.',
  },
  {
    icon: '∞',
    title: 'Freeplay',
    body: 'Endless mode with procedurally generated platforms. Unlock after clearing the restaurant.',
  },
  {
    icon: '⚗️',
    title: 'Physics Engine',
    body: 'CANNON.js rigid-body physics with custom velocity curves for satisfying, skill-based flips.',
  },
];

const FeaturesSection = forwardRef<HTMLElement>(function FeaturesSection(_props, ref) {
  return (
    <section
      ref={ref}
      className="py-28 px-6"
      aria-labelledby="features-heading"
    >
      <div className="max-w-4xl mx-auto">
        <motion.h2
          id="features-heading"
          className="font-display text-cream text-center mb-2"
          style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          What you're getting into
        </motion.h2>
        <motion.p
          className="font-sans text-2xs uppercase tracking-widest text-cream/30 text-center mb-16"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          Two modes · Authentic physics · Zero ads
        </motion.p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-olive-700/30">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              className="bg-olive-900 p-8 flex flex-col gap-4"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <span
                className="text-3xl leading-none"
                role="img"
                aria-hidden="true"
              >
                {f.icon}
              </span>
              <h3 className="font-display text-cream text-xl font-semibold">
                {f.title}
              </h3>
              <p className="font-sans text-sm text-cream/50 leading-relaxed">
                {f.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
});
```

- [ ] **Step 2: Verify features section**

Scroll down on `/`. Confirm three feature cards animate in on scroll, layout is grid on desktop, stacked on mobile.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/LandingPage.tsx
git commit -m "feat(website): add features section to landing page"
```

---

## Task 10: LandingPage — How To Play inline section

**Files:**
- Modify: `website/src/pages/LandingPage.tsx` (replace `HowToPlaySection` stub)

- [ ] **Step 1: Replace `HowToPlaySection` stub**

```tsx
const STEPS = [
  { n: '01', title: 'Tap to flip', body: 'Hold and release anywhere on screen. The longer you hold, the higher the flip arc.' },
  { n: '02', title: 'Land the bottle', body: 'The bottle must land upright on the platform. Combo flips score double, then triple.' },
  { n: '03', title: 'Clear the restaurant', body: 'Progress through 28 tables. Each table is harder — bigger gaps, smaller landing zones.' },
];

function HowToPlaySection() {
  return (
    <section className="py-28 px-6 border-t border-olive-700/30" aria-labelledby="htp-heading">
      <div className="max-w-2xl mx-auto">
        <motion.h2
          id="htp-heading"
          className="font-display text-cream mb-16"
          style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
        >
          How to play
        </motion.h2>

        <div className="flex flex-col gap-0">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.n}
              className="flex gap-8 py-8 border-b border-olive-700/30 last:border-b-0"
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: i * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <span
                className="font-display text-4xl text-brass/30 font-bold tabular-nums shrink-0"
                aria-hidden
              >
                {step.n}
              </span>
              <div>
                <h3 className="font-display text-cream text-xl font-semibold mb-2">
                  {step.title}
                </h3>
                <p className="font-sans text-sm text-cream/50 leading-relaxed">
                  {step.body}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          className="mt-12 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
        >
          <Link
            to="/play"
            className="inline-block px-10 py-4 font-sans text-xs font-700 uppercase tracking-widest border border-brass text-brass hover:bg-brass hover:text-olive-950 transition-all duration-200"
          >
            Start Playing
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify full landing page**

Scroll through `/`. Confirm: hero → features → how-to-play → footer. All animations fire on scroll. Both CTAs route to `/play`.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/LandingPage.tsx
git commit -m "feat(website): add how-to-play inline section to landing page"
```

---

## Task 11: HowToPlayPage (dedicated route)

**Files:**
- Create: `website/src/pages/HowToPlayPage.tsx`

- [ ] **Step 1: Create `website/src/pages/HowToPlayPage.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  }),
};

const STEPS = [
  {
    n: '01',
    title: 'Tap and hold to charge',
    body: 'Press anywhere on the screen and hold. A subtle visual indicator shows flip power building. The longer you hold, the higher the arc.',
    tip: 'Short holds for nearby tables, longer holds for big gaps.',
  },
  {
    n: '02',
    title: 'Release to flip',
    body: 'Release your finger or mouse button at the right moment. The bottle launches in a physics-driven arc toward the next table.',
    tip: 'Aim slightly past the table edge — the bottle rolls forward on landing.',
  },
  {
    n: '03',
    title: 'Land upright for points',
    body: 'A clean upright landing scores +1. If you land clean twice in a row, you enter combo mode for bonus points.',
    tip: 'Combos double, then triple your points per flip.',
  },
  {
    n: '04',
    title: 'Clear all 28 tables',
    body: 'Progress through the full restaurant in order. Tables get farther apart and landing zones get smaller. Failing returns you to the last checkpoint.',
    tip: 'Checkpoints save every few tables — you won't restart from the beginning.',
  },
  {
    n: '05',
    title: 'Unlock Freeplay',
    body: 'Beat the restaurant to unlock Freeplay mode — an endless, procedurally generated mode with no ceiling on your score.',
    tip: 'Your high score persists across sessions.',
  },
];

export default function HowToPlayPage() {
  return (
    <motion.div
      key="how-to-play"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="pt-28 pb-24 px-6"
    >
      <div className="max-w-2xl mx-auto">
        <motion.p
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="font-sans text-2xs uppercase tracking-widest text-brass mb-4"
        >
          Guide
        </motion.p>
        <motion.h1
          custom={1}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="font-display text-cream mb-20"
          style={{ fontSize: 'clamp(2.5rem, 7vw, 5rem)' }}
        >
          How to Play
        </motion.h1>

        <div className="flex flex-col gap-0">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.n}
              custom={i + 2}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="py-10 border-b border-olive-700/30 last:border-b-0 flex gap-8"
            >
              <span
                className="font-display text-5xl text-brass/20 font-bold tabular-nums shrink-0 mt-1"
                aria-hidden
              >
                {step.n}
              </span>
              <div className="flex flex-col gap-3">
                <h2 className="font-display text-cream text-2xl font-semibold">
                  {step.title}
                </h2>
                <p className="font-sans text-sm text-cream/50 leading-relaxed">
                  {step.body}
                </p>
                <p className="font-sans text-2xs uppercase tracking-wider text-brass/60">
                  ↳ {step.tip}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          custom={STEPS.length + 2}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mt-14 flex gap-4"
        >
          <Link
            to="/play"
            className="px-10 py-4 font-sans text-xs font-700 uppercase tracking-widest bg-brass text-olive-950 hover:bg-brass-light transition-colors duration-200"
          >
            Play Now
          </Link>
          <Link
            to="/"
            className="px-6 py-4 font-sans text-xs uppercase tracking-widest text-cream/40 hover:text-cream transition-colors duration-200"
          >
            ← Home
          </Link>
        </motion.div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add website/src/pages/HowToPlayPage.tsx
git commit -m "feat(website): add dedicated how-to-play page"
```

---

## Task 12: AboutPage

**Files:**
- Create: `website/src/pages/AboutPage.tsx`

- [ ] **Step 1: Create `website/src/pages/AboutPage.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.12, duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  }),
};

export default function AboutPage() {
  return (
    <motion.div
      key="about"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="pt-28 pb-24 px-6"
    >
      <div className="max-w-2xl mx-auto">
        <motion.p
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="font-sans text-2xs uppercase tracking-widest text-brass mb-4"
        >
          The Game
        </motion.p>

        <motion.h1
          custom={1}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="font-display text-cream mb-12"
          style={{ fontSize: 'clamp(2.5rem, 7vw, 5rem)' }}
        >
          Poulet Braisé
          <br />
          <em className="text-cream/40 not-italic">Flip</em>
        </motion.h1>

        {/* Brand mark */}
        <motion.div
          custom={2}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mb-14 flex items-center gap-6 py-8 border-y border-olive-700/30"
        >
          <img
            src="/images/sticker-rond-pb.webp"
            alt="Poulet Braisé logo"
            className="w-16 h-16 rounded-full shrink-0"
          />
          <div>
            <p className="font-sans text-xs uppercase tracking-widest text-brass mb-1">
              Poulet Braisé
            </p>
            <p className="font-sans text-sm text-cream/50">
              A rotisserie chicken restaurant that takes itself just seriously enough.
            </p>
          </div>
        </motion.div>

        <div className="flex flex-col gap-8">
          {[
            {
              heading: 'What is this',
              body: 'PB Flip is a browser game built as a digital expression of the Poulet Braisé brand. It started as an internal experiment — a bottle flip mechanic inside a 3D restaurant — and grew into something worth sharing.',
            },
            {
              heading: 'How it works',
              body: 'The game uses Three.js for 3D rendering and CANNON.js for rigid-body physics. The restaurant world is a custom scene with 28 tables arranged across a stylized dining room. Every flip is simulated in real physics — no scripted animations.',
            },
            {
              heading: 'Two modes',
              body: 'Restaurant Mode challenges you to navigate the full dining room in order. Freeplay Mode, unlocked after beating the restaurant, is an endless procedurally generated mode with no ceiling on your score.',
            },
          ].map((block, i) => (
            <motion.div
              key={block.heading}
              custom={i + 3}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="flex flex-col gap-3"
            >
              <h2 className="font-display text-cream text-xl font-semibold">
                {block.heading}
              </h2>
              <p className="font-sans text-sm text-cream/50 leading-relaxed">
                {block.body}
              </p>
            </motion.div>
          ))}
        </div>

        <motion.div
          custom={7}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mt-16"
        >
          <Link
            to="/play"
            className="px-10 py-4 font-sans text-xs font-700 uppercase tracking-widest bg-brass text-olive-950 hover:bg-brass-light transition-colors duration-200"
          >
            Play Now
          </Link>
        </motion.div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add website/src/pages/AboutPage.tsx
git commit -m "feat(website): add about page"
```

---

## Task 13: End-to-end verification

- [ ] **Step 1: Run both servers simultaneously**

Terminal 1 (game):
```bash
npm start
```
Expected: game on `http://localhost:3000`

Terminal 2 (website):
```bash
cd website && npm run dev
```
Expected: website on `http://localhost:5173`

- [ ] **Step 2: Test all routes**

Navigate to `http://localhost:5173` and verify:

| Check | Expected |
|---|---|
| `/` loads | Hero, features, how-to-play, footer visible |
| Nav visible | Logo, links, "Play" button |
| "Play Now" CTA | Routes to `/play` |
| `/play` loads | Full-viewport iframe, nav shows "← Back" |
| Game is playable | Tap/click in iframe registers as game input |
| "← Back" | Returns to `/` |
| `/how-to-play` | 5 numbered steps with tips |
| `/about` | Brand story, sticker image, "Play Now" |
| `/how-to-play` nav link | Active state in Nav (brass color) |
| Mobile viewport | Nav readable, hero scales, cards stack |
| No console errors | Zero red errors in DevTools |

- [ ] **Step 3: Check animations**

| Animation | Expected |
|---|---|
| Nav entrance | Slides down from above on first load |
| Hero elements | Stagger-fade up on `/` |
| Feature cards | Animate in as user scrolls to section |
| How-to-play steps | Animate in as user scrolls |
| Page transitions | Fade out → fade in between routes |
| Scroll indicator | Gentle vertical bob in hero |

- [ ] **Step 4: Final commit**

```bash
git add website/
git commit -m "feat(website): complete PB Flip mini website with game embed, nav, 4 pages"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| Game is playable in site | Task 6, 7 — iframe embed with skeleton |
| Full navigation | Task 4 — Nav with all routes, active states |
| Landing page | Tasks 8, 9, 10 — hero + features + how-to |
| How to Play page | Task 11 |
| About page | Task 12 |
| Premium anti-AI-slop design | Tasks 2, 4: olive/brass palette, Cormorant display, no gradients |
| framer-motion | All pages use motion components |
| shadcn-compatible | components.json + shadcn-compatible token structure |
| New modern stack | Task 1 — Vite + React 18 + TS + Tailwind |

**Gaps addressed:** shadcn components are scaffolded via `components.json` — `npx shadcn add <component>` can add individual components into `website/src/components/ui/` at any time without changing the plan. 21st.dev MCP can be used to generate additional components by describing them — output drops into `website/src/components/`.

**No placeholders found.**

**Type consistency:** `cn()` used consistently from `@/lib/utils`. `forwardRef` typing correct. All `motion.*` elements typed by framer-motion. `custom` prop on `variants` typed as `number`.

---

**Plan saved to `docs/superpowers/plans/2026-05-04-pb-website.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using the plan step-by-step

Which approach?
