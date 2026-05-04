import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
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
    tip: 'Checkpoints save every few tables — you won\'t restart from the beginning.',
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
          className="font-sans text-xs uppercase tracking-widest text-brass mb-4"
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
                <p className="font-sans text-xs uppercase tracking-wider text-brass/60">
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
            className="px-10 py-4 font-sans text-xs font-bold uppercase tracking-widest bg-brass text-olive-950 hover:bg-brass-light transition-colors duration-200"
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
