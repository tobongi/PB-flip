import { useEffect, useState } from 'react';

const GAME_SRC = import.meta.env.VITE_GAME_URL ?? 'http://localhost:3000';

export default function GameIframe() {
  const [loaded, setLoaded] = useState(false);

  // Mobile browsers (iOS Safari especially) heavily throttle requestAnimationFrame
  // inside an iframe when the host page has any compositing/animation pressure.
  // To keep gameplay at full framerate we navigate the top-level window directly
  // to the game origin instead of embedding it. The website navigation flow is
  // preserved via the browser back button.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    if (isMobile) {
      window.location.replace(GAME_SRC);
    }
  }, []);

  return (
    <div className="relative w-full h-full bg-olive-950">
      {!loaded && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          aria-label="Loading game…"
        >
          <div className="flex flex-col items-center gap-4">
            <img
              src="/images/sticker-rond-pb.webp"
              alt="PB"
              className="w-20 h-20 rounded-full"
              style={{
                animation: 'pb-spin 2s linear infinite',
              }}
            />
            <span className="font-display text-cream/40 text-lg tracking-widest">
              Loading…
            </span>
          </div>
        </div>
      )}

      <iframe
        src={GAME_SRC}
        title="Poulet Braisé Flip Game"
        className="absolute inset-0 w-full h-full border-0"
        allow="autoplay"
        loading="eager"
        onLoad={() => setLoaded(true)}
        style={{ opacity: loaded ? 1 : 0 }}
      />

      <style>{`
        @keyframes pb-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
