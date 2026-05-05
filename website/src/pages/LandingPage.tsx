import { useRef, forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

const FEATURES = [
  {
    icon: '🍽️',
    title: 'Restaurant Mode',
    body: 'Navigate all 28 tables of a real PB dining room. Gaps grow, landing zones shrink — générosité in every flip.',
  },
  {
    icon: '∞',
    title: 'Freeplay',
    body: 'Endless mode with procedurally generated platforms. No ceiling, no stress — just passion.',
  },
  {
    icon: '⚗️',
    title: 'Real Physics',
    body: 'Rigid-body simulation, not scripted animation. Every bottle is authentic — qualité you can feel.',
  },
];

const STEPS = [
  {
    n: '01',
    title: 'Tap to flip',
    body: 'Hold anywhere on screen, then release. The longer you hold, the higher the arc.',
  },
  {
    n: '02',
    title: 'Land it upright',
    body: 'The bottle must stand on the platform. Consecutive clean landings multiply your score.',
  },
  {
    n: '03',
    title: 'Clear the room',
    body: '28 tables, one restaurant. Each table demands more precision than the last.',
  },
];

const FeaturesSection = forwardRef<HTMLElement>(function FeaturesSection(_props, ref) {
  return (
    <section ref={ref} className="py-28 px-6" aria-labelledby="features-heading">
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
          Boldly authentic.
        </motion.h2>
        <motion.p
          className="font-sans text-xs uppercase tracking-widest text-cream/30 text-center mb-16"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          Two modes · Real physics · Sauce included
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
              <span className="text-3xl leading-none" role="img" aria-hidden="true">
                {f.icon}
              </span>
              <h3 className="font-display text-cream text-xl font-semibold">{f.title}</h3>
              <p className="font-sans text-sm text-cream/50 leading-relaxed">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
});

function HowToPlaySection() {
  return (
    <section
      className="py-28 px-6 border-t border-olive-700/30"
      aria-labelledby="htp-heading"
    >
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
                <p className="font-sans text-sm text-cream/50 leading-relaxed">{step.body}</p>
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
            className="inline-block px-10 py-4 font-sans text-xs font-bold uppercase tracking-widest border border-brass text-brass hover:bg-brass hover:text-olive-950 transition-all duration-200"
          >
            Start Playing
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

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
      {/* Hero */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 pt-14 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(45,51,25,0.9) 0%, #1a1f0e 65%)',
          }}
        />

        <motion.img
          src="/images/sticker-rond-pb.webp"
          alt="Poulet Braisé"
          className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-full mb-8 shadow-2xl"
          initial={{ scale: 0.8, opacity: 0, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
        />

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

        <motion.p
          custom={1}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="relative mt-6 font-sans text-sm sm:text-base uppercase tracking-widest text-cream/50 max-w-xs"
        >
          Générosité in every flip.
        </motion.p>

        <motion.div
          custom={2}
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="relative mt-10 flex flex-col sm:flex-row items-center gap-4"
        >
          <Link
            to="/play"
            className="px-10 py-4 font-sans text-xs font-bold uppercase tracking-widest bg-brass text-olive-950 hover:bg-brass-light transition-colors duration-200 shadow-lg"
          >
            Play Now
          </Link>
          <button
            onClick={() => featuresRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="font-sans text-xs uppercase tracking-widest text-cream/40 hover:text-cream transition-colors duration-200"
          >
            Learn more ↓
          </button>
        </motion.div>

        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          aria-hidden
        >
          <div className="w-px h-12 bg-gradient-to-b from-transparent via-cream/20 to-transparent mx-auto" />
        </motion.div>
      </section>

      <FeaturesSection ref={featuresRef} />
      <HowToPlaySection />
    </motion.div>
  );
}
