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
                  'font-sans text-xs font-semibold uppercase tracking-widest transition-colors duration-200',
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
              className="font-sans text-xs font-bold uppercase tracking-widest px-5 py-2 border border-brass text-brass hover:bg-brass hover:text-olive-950 transition-all duration-200"
            >
              Play
            </Link>
          </div>
        )}

        {hideLinks && (
          <Link
            to="/"
            className="font-sans text-xs font-semibold uppercase tracking-widest text-cream/60 hover:text-cream transition-colors duration-200 flex items-center gap-2"
          >
            <span aria-hidden>←</span> Back
          </Link>
        )}
      </nav>
    </motion.header>
  );
}
