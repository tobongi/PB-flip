import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

const SECTIONS = [
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
];

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
          className="font-sans text-xs uppercase tracking-widest text-brass mb-4"
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
          {SECTIONS.map((block, i) => (
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
            className="px-10 py-4 font-sans text-xs font-bold uppercase tracking-widest bg-brass text-olive-950 hover:bg-brass-light transition-colors duration-200"
          >
            Play Now
          </Link>
        </motion.div>
      </div>
    </motion.div>
  );
}
