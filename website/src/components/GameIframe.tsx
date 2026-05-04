import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const GAME_SRC = import.meta.env.VITE_GAME_URL ?? 'http://localhost:3000';

export default function GameIframe() {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative w-full h-full bg-olive-950">
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
