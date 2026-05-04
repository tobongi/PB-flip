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
            className="font-sans text-xs uppercase tracking-widest text-cream/40 hover:text-cream transition-colors"
          >
            How to Play
          </Link>
          <Link
            to="/about"
            className="font-sans text-xs uppercase tracking-widest text-cream/40 hover:text-cream transition-colors"
          >
            About
          </Link>
          <Link
            to="/play"
            className="font-sans text-xs uppercase tracking-widest text-brass hover:text-brass-light transition-colors"
          >
            Play →
          </Link>
        </div>
      </div>
    </footer>
  );
}
