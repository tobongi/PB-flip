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
    body: 'PB Flip is a browser game built as a digital expression of the Poulet Braisé brand — a French restaurant chain specializing in braised chicken since 2009. It started as an internal experiment and grew into something worth sharing with everyone.',
  },
  {
    heading: 'How it works',
    body: 'Three.js renders a faithful 3D replica of a PB dining room. CANNON.js runs full rigid-body physics — every flip is simulated, never scripted. The sauce bottles are the real ones.',
  },
  {
    heading: 'Two modes',
    body: 'Restaurant Mode: navigate all 28 tables in order, gap by gap, until you\'ve served the whole room. Freeplay Mode, unlocked after that, is endless — no ceiling on your score, no closing time.',
  },
];

const VALUES = ['Qualité', 'Générosité', 'Convivialité', 'Innovation', 'Passion'];

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
              Poulet Braisé · Since 2009
            </p>
            <p className="font-sans text-sm text-cream/50">
              Braised chicken, gourmet sauces, and a dining room worth flipping bottles in.
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
          custom={6}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="mt-12 pt-10 border-t border-olive-700/30"
        >
          <p className="font-sans text-xs uppercase tracking-widest text-brass mb-5">Brand values</p>
          <div className="flex flex-wrap gap-3">
            {VALUES.map((v) => (
              <span
                key={v}
                className="font-sans text-xs uppercase tracking-widest px-4 py-2 border border-olive-700/50 text-cream/50 hover:border-brass hover:text-brass transition-colors duration-200"
              >
                {v}
              </span>
            ))}
          </div>
        </motion.div>

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
