import BottleFlip from './game';
import React from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from './store/gameStore';
import { connectGameToStore } from './store/gameBridge';
import {
  logoFloat,
  logoBreath,
  haloSpin,
  haloPulse,
  buttonPulse,
  progressBarShine,
  dividerGrow,
  scorePop,
  newRecordGlow,
} from './animations/variants';

const game = connectGameToStore(new BottleFlip());
game.start();
window.__game = game;

const shellStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100vh',
  overflow: 'hidden',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: '#1a1a1a',
};

class Loading extends React.Component {
  state = { progress: 0 };
  done = false;

  componentDidMount() {
    this.timer = setInterval(() => {
      this.setState(prev => {
        const next = Math.min(prev.progress + Math.random() * 12 + 4, 100);
        if (next >= 100 && !this.done) {
          this.done = true;
          clearInterval(this.timer);
          setTimeout(() => useGameStore.getState().finishLoading(), 500);
        }
        return { progress: next };
      });
    }, 180);
  }

  componentWillUnmount() {
    clearInterval(this.timer);
  }

  render() {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        style={{
          position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
          background: 'linear-gradient(180deg, #2D3319 0%, #1a1f0e 100%)',
          display: 'flex', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'center',
          color: '#FFFFFF',
        }}
      >
        <motion.img
          src="/images/sticker-rond-pb.webp"
          alt="PB"
          variants={logoBreath}
          animate="animate"
          style={{
            width: 'clamp(60px, 25vw, 100px)',
            height: 'clamp(60px, 25vw, 100px)',
            marginBottom: 'clamp(12px, 5vw, 24px)',
            objectFit: 'contain',
          }}
        />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          style={{
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontSize: 'clamp(18px, 6.5vw, 28px)',
            fontWeight: 600,
            fontStyle: 'italic',
            color: '#E8750A',
            marginBottom: 'clamp(4px, 1.5vw, 8px)',
          }}
        >
          PB Flip Bottle
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.6 }}
          style={{
            fontFamily: '"Josefin Sans", sans-serif',
            fontSize: 'clamp(7px, 2.5vw, 11px)',
            fontWeight: 300,
            color: 'rgba(140,179,63,0.7)',
            marginBottom: 'clamp(24px, 10vw, 44px)',
            letterSpacing: 'clamp(2px, 1vw, 5px)',
            textTransform: 'uppercase',
          }}
        >
          La Maison PB
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          style={{
            width: '50%',
            maxWidth: 'clamp(120px, 55vw, 220px)',
            height: '2px',
            backgroundColor: 'rgba(255,255,255,0.08)',
            borderRadius: '1px',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: `${this.state.progress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #E8750A, #D4A017)',
              borderRadius: '1px',
              transition: 'width 0.2s ease-out',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <motion.div
              variants={progressBarShine}
              animate="animate"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
              }}
            />
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          style={{
            marginTop: 'clamp(10px, 4vw, 18px)',
            fontFamily: '"Josefin Sans", sans-serif',
            fontSize: 'clamp(8px, 2.8vw, 12px)',
            fontWeight: 300,
            color: 'rgba(255,255,255,0.25)',
            letterSpacing: 'clamp(1px, 0.5vw, 3px)',
          }}
        >
          {Math.round(this.state.progress)}%
        </motion.div>
      </motion.div>
    );
  }
}

class Landing extends React.Component {
  handleStartClick = () => {
    game.restart();
    useGameStore.getState().startGame();
  };

  handleToggleMode = () => {
    game.toggleMode();
    useGameStore.getState().toggleGameMode();
    this.forceUpdate();
  };

  render() {
    const { highest, modeBUnlocked, gameMode } = useGameStore.getState();

    return (
      <motion.div
        data-id="landing-screen"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
          background: 'linear-gradient(180deg, rgba(45,51,25,0.70) 0%, rgba(30,34,16,0.88) 40%, rgba(20,22,10,0.95) 100%)',
          color: '#ffffff',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center',
          padding: '0 20px',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        {/* Corner accents */}
        {[[['top', 'left'], ['Top', 'Left']], [['top', 'right'], ['Top', 'Right']], [['bottom', 'left'], ['Bottom', 'Left']], [['bottom', 'right'], ['Bottom', 'Right']]].map(([[v, h], [V, H]], i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 1 }}
            style={{
              position: 'absolute',
              [v]: 'clamp(10px, 4vw, 20px)',
              [h]: 'clamp(10px, 4vw, 20px)',
              width: 'clamp(20px, 8vw, 40px)',
              height: 'clamp(20px, 8vw, 40px)',
              [`border${V}`]: '2px solid rgba(212,160,23,0.5)',
              [`border${H}`]: '2px solid rgba(212,160,23,0.5)',
            }}
          />
        ))}

        {/* Logo with halo */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.8 }}
          style={{
            position: 'relative',
            marginBottom: 'clamp(12px, 5vw, 24px)',
          }}
        >
          <motion.div
            variants={haloSpin}
            animate="animate"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 'clamp(120px, 52vw, 230px)',
              height: 'clamp(120px, 52vw, 230px)',
              border: '1px solid rgba(212,160,23,0.3)',
              borderRadius: '50%',
              borderTopColor: 'rgba(232,117,10,0.6)',
              borderRightColor: 'rgba(212,160,23,0.15)',
              transform: 'translate(-50%, -50%)',
            }}
          />
          <motion.div
            variants={haloPulse}
            animate="animate"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 'clamp(120px, 52vw, 230px)',
              height: 'clamp(120px, 52vw, 230px)',
              border: '1px solid rgba(212,160,23,0.3)',
              borderRadius: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'clamp(90px, 40vw, 180px)',
              height: 'clamp(90px, 40vw, 180px)',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(232,117,10,0.25) 0%, transparent 70%)',
              filter: 'blur(20px)',
            }}
          />
          <motion.img
            src="/images/sticker-rond-pb.webp"
            alt="PB"
            variants={logoFloat}
            animate="animate"
            style={{
              position: 'relative',
              width: 'clamp(100px, 45vw, 200px)',
              height: 'clamp(100px, 45vw, 200px)',
              objectFit: 'contain',
              filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.5))',
            }}
          />
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          style={{
            fontFamily: '"Cormorant Garamond", "Georgia", serif',
            fontSize: 'clamp(22px, 9vw, 44px)',
            fontWeight: 600,
            fontStyle: 'italic',
            color: '#E8750A',
            textShadow: '0 2px 20px rgba(232,117,10,0.4), 0 0 60px rgba(232,117,10,0.15)',
            letterSpacing: '1px',
            textAlign: 'center',
            lineHeight: 1.1,
          }}
        >
          PB Flip Bottle
        </motion.div>

        {/* Gold divider */}
        <motion.div
          variants={dividerGrow}
          initial="initial"
          animate="animate"
          transition={{ delay: 0.45, duration: 0.8 }}
          style={{
            width: 'clamp(70px, 30vw, 140px)',
            height: '1px',
            background: 'linear-gradient(90deg, transparent, #D4A017, transparent)',
            margin: 'clamp(8px, 3.5vw, 18px) 0',
            transformOrigin: 'center',
          }}
        />

        {/* Tagline */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          style={{
            fontFamily: '"Josefin Sans", "Helvetica Neue", sans-serif',
            fontSize: 'clamp(8px, 2.8vw, 13px)',
            fontWeight: 300,
            color: 'rgba(140,179,63,0.85)',
            letterSpacing: 'clamp(2px, 1.2vw, 6px)',
            textTransform: 'uppercase',
            textAlign: 'center',
          }}
        >
          Poulet Braise · Depuis 2009
        </motion.div>

        {/* Best score */}
        {highest > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            style={{
              marginTop: 'clamp(14px, 6vw, 28px)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: '"Josefin Sans", sans-serif',
                fontSize: 'clamp(7px, 2.4vw, 11px)',
                fontWeight: 400,
                color: 'rgba(255,255,255,0.35)',
                letterSpacing: 'clamp(1px, 0.8vw, 4px)',
                textTransform: 'uppercase',
                marginBottom: 'clamp(2px, 1vw, 6px)',
              }}
            >
              Meilleur Score
            </div>
            <div
              style={{
                fontFamily: '"Cormorant Garamond", serif',
                fontSize: 'clamp(20px, 8vw, 38px)',
                fontWeight: 700,
                color: '#D4A017',
                textShadow: '0 0 20px rgba(212,160,23,0.3)',
                lineHeight: 1,
              }}
            >
              {highest}
            </div>
          </motion.div>
        )}

        {/* Mode toggle if unlocked */}
        {modeBUnlocked && (
          <motion.div
            data-id="mode-toggle"
            onClick={this.handleToggleMode}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.8 }}
            whileHover={{ scale: 1.05, borderColor: 'rgba(212,160,23,0.6)' }}
            whileTap={{ scale: 0.95 }}
            style={{
              fontFamily: '"Josefin Sans", sans-serif',
              fontSize: 'clamp(8px, 2.8vw, 13px)',
              fontWeight: 400,
              color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer',
              letterSpacing: 'clamp(1px, 0.8vw, 4px)',
              textTransform: 'uppercase',
              padding: 'clamp(6px, 2.5vw, 12px) clamp(14px, 6vw, 28px)',
              borderRadius: 'clamp(12px, 5vw, 24px)',
              border: '1px solid rgba(212,160,23,0.3)',
              marginTop: 'clamp(10px, 4vw, 20px)',
            }}
          >
            {gameMode === 'restaurant' ? '◆ Restaurant' : '◆ Free Play'}
          </motion.div>
        )}

        {/* Start button */}
        <motion.div
          data-id="start-button"
          onClick={this.handleStartClick}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65, duration: 0.8 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{
            marginTop: highest > 0 ? 'clamp(16px, 7vw, 32px)' : 'clamp(24px, 10vw, 48px)',
            fontFamily: '"Josefin Sans", sans-serif',
            fontWeight: 700,
            fontSize: 'clamp(12px, 4vw, 18px)',
            letterSpacing: 'clamp(3px, 1.5vw, 7px)',
            textTransform: 'uppercase',
            color: '#fff',
            background: 'linear-gradient(180deg, #E8750A 0%, #C45F00 100%)',
            padding: 'clamp(12px, 4.5vw, 20px) clamp(40px, 18vw, 80px)',
            borderRadius: 'clamp(30px, 12vw, 60px)',
            cursor: 'pointer',
            border: '1px solid rgba(212,160,23,0.4)',
            textShadow: '0 1px 2px rgba(0,0,0,0.3)',
            position: 'relative',
          }}
        >
          <motion.span
            variants={buttonPulse}
            animate="animate"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: 'clamp(30px, 12vw, 60px)',
            }}
          />
          <span style={{ position: 'relative' }}>Jouer</span>
        </motion.div>

        {/* Bottom tagline */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 1 }}
          style={{
            position: 'absolute',
            bottom: 'clamp(16px, 7vw, 34px)',
            fontFamily: '"Josefin Sans", sans-serif',
            fontSize: 'clamp(6px, 2vw, 10px)',
            fontWeight: 300,
            color: 'rgba(255,255,255,0.2)',
            letterSpacing: 'clamp(1px, 0.8vw, 4px)',
            textTransform: 'uppercase',
          }}
        >
          La Maison PB
        </motion.div>
      </motion.div>
    );
  }
}

class GameCanvas extends React.Component {
  container = null;

  onRef = ref => {
    this.container = ref;
  };

  componentDidMount() {
    this.container.appendChild(game.renderer.domElement);
  }

  componentWillUnmount() {
    this.container.removeChild(game.renderer.domElement);
  }

  render() {
    return (
      <div
        data-id="game-canvas"
        ref={this.onRef}
        style={{ position: 'absolute', top: 0, left: 0, lineHeight: 0 }}
      />
    );
  }
}

class Score extends React.Component {
  handleRestart = () => {
    game.restart();
    useGameStore.getState().startGame();
  };

  handleToggleMode = () => {
    game.toggleMode();
    useGameStore.getState().toggleGameMode();
    this.forceUpdate();
  };

  render() {
    const { round, highest, modeBUnlocked, gameMode } = useGameStore.getState();
    const isNewRecord = round >= highest && round > 0;

    return (
      <motion.div
        data-id="gameover-screen"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
          background: 'linear-gradient(180deg, rgba(45,51,25,0.75) 0%, rgba(20,22,10,0.95) 100%)',
          color: '#ffffff',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center',
          padding: '0 20px',
          boxSizing: 'border-box',
          gap: '0',
        }}
      >
        {/* Corner accents */}
        {[[['top', 'left'], ['Top', 'Left']], [['top', 'right'], ['Top', 'Right']], [['bottom', 'left'], ['Bottom', 'Left']], [['bottom', 'right'], ['Bottom', 'Right']]].map(([[v, h], [V, H]], i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              [v]: 'clamp(10px, 4vw, 20px)',
              [h]: 'clamp(10px, 4vw, 20px)',
              width: 'clamp(20px, 8vw, 40px)',
              height: 'clamp(20px, 8vw, 40px)',
              [`border${V}`]: '2px solid rgba(212,160,23,0.5)',
              [`border${H}`]: '2px solid rgba(212,160,23,0.5)',
            }}
          />
        ))}

        {/* Logo */}
        <motion.img
          src="/images/sticker-rond-pb.webp"
          alt="PB"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6 }}
          style={{
            width: 'clamp(40px, 16vw, 72px)',
            height: 'clamp(40px, 16vw, 72px)',
            objectFit: 'contain',
            marginBottom: 'clamp(12px, 5vw, 24px)',
            filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))',
          }}
        />

        {/* Score label */}
        <div data-id="score-display" style={{ textAlign: 'center' }}>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            style={{
              fontFamily: '"Josefin Sans", sans-serif',
              fontSize: 'clamp(7px, 2.4vw, 11px)',
              fontWeight: 300,
              color: 'rgba(140,179,63,0.7)',
              letterSpacing: 'clamp(2px, 1vw, 5px)',
              textTransform: 'uppercase',
              marginBottom: 'clamp(4px, 2vw, 10px)',
            }}
          >
            Score du Round
          </motion.div>

          {/* Big score number */}
          <motion.div
            variants={scorePop}
            initial="initial"
            animate="animate"
            transition={{ delay: 0.35 }}
            style={{
              fontFamily: '"Cormorant Garamond", Georgia, serif',
              fontSize: 'clamp(44px, 18vw, 84px)',
              fontWeight: 700,
              color: '#E8750A',
              lineHeight: 1,
              marginBottom: 'clamp(4px, 1.5vw, 8px)',
              textShadow: '0 4px 30px rgba(232,117,10,0.4)',
            }}
          >
            {isNewRecord ? (
              <motion.span variants={newRecordGlow} animate="animate">
                {round}
              </motion.span>
            ) : (
              round
            )}
          </motion.div>

          {/* New record badge */}
          <AnimatePresence>
            {isNewRecord && (
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: 0.6, duration: 0.5 }}
                style={{
                  fontFamily: '"Josefin Sans", sans-serif',
                  fontSize: 'clamp(8px, 2.6vw, 12px)',
                  fontWeight: 600,
                  color: '#D4A017',
                  letterSpacing: 'clamp(1px, 0.8vw, 4px)',
                  textTransform: 'uppercase',
                  marginBottom: 'clamp(4px, 2vw, 10px)',
                }}
              >
                ★ Nouveau Record ★
              </motion.div>
            )}
          </AnimatePresence>

          {/* Divider */}
          <motion.div
            variants={dividerGrow}
            initial="initial"
            animate="animate"
            transition={{ delay: 0.5, duration: 0.6 }}
            style={{
              width: 'clamp(40px, 15vw, 70px)',
              height: '1px',
              background: 'linear-gradient(90deg, transparent, rgba(212,160,23,0.5), transparent)',
              margin: 'clamp(8px, 3.5vw, 18px) auto',
              transformOrigin: 'center',
            }}
          />

          {/* Best score */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.6 }}
            style={{
              fontFamily: '"Josefin Sans", sans-serif',
              fontSize: 'clamp(8px, 2.6vw, 12px)',
              fontWeight: 300,
              color: 'rgba(255,255,255,0.35)',
              letterSpacing: 'clamp(1px, 0.5vw, 3px)',
            }}
          >
            Meilleur : <span style={{ color: '#D4A017', fontWeight: 600 }}>{highest}</span>
          </motion.div>
        </div>

        {/* Restart button */}
        <motion.div
          data-id="restart-button"
          onClick={this.handleRestart}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.6 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{
            marginTop: 'clamp(20px, 9vw, 44px)',
            fontFamily: '"Josefin Sans", sans-serif',
            fontWeight: 700,
            fontSize: 'clamp(11px, 3.8vw, 17px)',
            letterSpacing: 'clamp(2px, 1.2vw, 6px)',
            textTransform: 'uppercase',
            color: '#fff',
            background: 'linear-gradient(180deg, #E8750A 0%, #C45F00 100%)',
            padding: 'clamp(10px, 4vw, 18px) clamp(36px, 16vw, 72px)',
            borderRadius: 'clamp(30px, 12vw, 60px)',
            cursor: 'pointer',
            border: '1px solid rgba(212,160,23,0.4)',
            boxShadow: '0 6px 30px rgba(232,117,10,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
            textShadow: '0 1px 2px rgba(0,0,0,0.3)',
          }}
        >
          Rejouer
        </motion.div>

        {/* Mode toggle */}
        {modeBUnlocked && (
          <motion.div
            onClick={this.handleToggleMode}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85, duration: 0.6 }}
            whileHover={{ scale: 1.05, borderColor: 'rgba(212,160,23,0.5)' }}
            whileTap={{ scale: 0.95 }}
            style={{
              marginTop: 'clamp(10px, 4vw, 20px)',
              fontFamily: '"Josefin Sans", sans-serif',
              fontSize: 'clamp(8px, 2.6vw, 12px)',
              fontWeight: 400,
              color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer',
              letterSpacing: 'clamp(1px, 0.8vw, 4px)',
              textTransform: 'uppercase',
              padding: 'clamp(5px, 2vw, 10px) clamp(12px, 5vw, 24px)',
              borderRadius: 'clamp(10px, 4vw, 20px)',
              border: '1px solid rgba(212,160,23,0.25)',
            }}
          >
            {gameMode === 'restaurant' ? '◆ Restaurant' : '◆ Free Play'}
          </motion.div>
        )}

        {/* Bottom tag */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.8 }}
          style={{
            position: 'absolute',
            bottom: 'clamp(16px, 7vw, 34px)',
            fontFamily: '"Josefin Sans", sans-serif',
            fontSize: 'clamp(6px, 2vw, 10px)',
            fontWeight: 300,
            color: 'rgba(255,255,255,0.15)',
            letterSpacing: 'clamp(1px, 0.8vw, 4px)',
            textTransform: 'uppercase',
          }}
        >
          La Maison PB
        </motion.div>
      </motion.div>
    );
  }
}

class App extends React.Component {
  unsubscribe = null;

  state = {
    uiState: useGameStore.getState().uiState,
    viewport: useGameStore.getState().viewport,
  };

  componentDidMount() {
    this.unsubscribe = useGameStore.subscribe(state => {
      this.setState({
        uiState: state.uiState,
        viewport: state.viewport,
      });
    });

    window.addEventListener('resize', this.handleResize);
  }

  componentWillUnmount() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    window.removeEventListener('resize', this.handleResize);
  }

  handleResize = () => {
    game.resize();
    useGameStore.getState().updateViewport();
  };

  renderUI() {
    switch (this.state.uiState) {
      case 'loading':
        return <Loading key="loading" />;
      case 'gameover':
        return <Score key="gameover" />;
      case 'landing':
        return <Landing key="landing" />;
      case 'game':
      default:
        return null;
    }
  }

  render() {
    const { viewport } = this.state;
    return (
      <div style={shellStyle}>
        <div
          style={{
            position: 'relative',
            width: viewport.width,
            height: viewport.height,
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <GameCanvas />
          <AnimatePresence exitBeforeEnter>{this.renderUI()}</AnimatePresence>
        </div>
      </div>
    );
  }
}

ReactDOM.render(<App />, document.getElementById('root'));
