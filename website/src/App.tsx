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
