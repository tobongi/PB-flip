export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const slideUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

export const scaleIn = {
  initial: { opacity: 0, scale: 0.8 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.9 },
};

export const scorePop = {
  initial: { opacity: 0, scale: 0.5 },
  animate: {
    opacity: 1,
    scale: [0.5, 1.1, 1],
    transition: { duration: 0.7, times: [0, 0.7, 1] },
  },
};

export const logoFloat = {
  animate: {
    y: [0, -6, 0],
    transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' },
  },
};

export const logoBreath = {
  animate: {
    scale: [1, 1.04, 1],
    filter: [
      'drop-shadow(0 4px 16px rgba(232,117,10,0.3))',
      'drop-shadow(0 6px 24px rgba(232,117,10,0.5))',
      'drop-shadow(0 4px 16px rgba(232,117,10,0.3))',
    ],
    transition: { duration: 2.5, repeat: Infinity, ease: 'easeInOut' },
  },
};

export const haloSpin = {
  animate: {
    rotate: 360,
    transition: { duration: 20, repeat: Infinity, ease: 'linear' },
  },
};

export const haloPulse = {
  animate: {
    opacity: [0.4, 0.7, 0.4],
    scale: [1, 1.08, 1],
    transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
  },
};

export const buttonPulse = {
  animate: {
    boxShadow: [
      '0 6px 30px rgba(232,117,10,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
      '0 8px 44px rgba(232,117,10,0.6), inset 0 1px 0 rgba(255,255,255,0.3)',
      '0 6px 30px rgba(232,117,10,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
    ],
    transition: { duration: 2.5, repeat: Infinity, ease: 'easeInOut' },
  },
};

export const progressBarShine = {
  animate: {
    x: ['-100%', '200%'],
    transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
  },
};

export const dividerGrow = {
  initial: { scaleX: 0, opacity: 0 },
  animate: { scaleX: 1, opacity: 1 },
};

export const newRecordGlow = {
  animate: {
    textShadow: [
      '0 0 20px rgba(212,160,23,0.4)',
      '0 0 40px rgba(212,160,23,0.8), 0 0 60px rgba(232,117,10,0.3)',
      '0 0 20px rgba(212,160,23,0.4)',
    ],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
  },
};

export const staggerContainer = {
  animate: {
    transition: { staggerChildren: 0.1 },
  },
};
