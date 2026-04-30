import BottleFlip from './game';
import React from 'react';
import ReactDOM from 'react-dom';
import { rem } from './utils';
import glamorous from 'glamorous';

const game = new BottleFlip();
game.start();
window.__game = game;

const Button = glamorous.div({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  cursor: 'pointer',
  backgroundColor: '#E8750A',
  color: '#FFFFFF',
  fontWeight: 'bold',
  fontSize: rem(54),
  lineHeight: 'normal',
  height: rem(156),
  width: rem(512),
  borderRadius: rem(156 / 2),
  margin: '0 auto',
  boxShadow: '0 4px 20px rgba(232, 117, 10, 0.4)',
  letterSpacing: '0.5px',
});

const Wrapper = glamorous.div({
  width: '10rem',
  margin: '0 auto',
  position: 'relative',
  minHeight: '100%',
})

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
          setTimeout(() => this.props.onLoaded(), 500);
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
      <div style={{
        position: 'fixed', left: 0, right: 0, top: 0, bottom: 0,
        background: '#2D3319',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        color: '#FFFFFF',
      }}>
        <img
          src="/images/sticker-rond-pb.webp"
          alt="PB"
          style={{ width: '80px', height: '80px', marginBottom: '0.5rem', objectFit: 'contain' }}
        />
        <div style={{
          fontSize: '1.5rem', fontWeight: 'bold', color: '#FFFFFF',
          marginBottom: '0.3rem',
        }}>
          PB Flip Bottle
        </div>
        <div style={{
          fontSize: '0.75rem', color: '#8CB33F',
          marginBottom: '2rem', letterSpacing: '2px',
        }}>
          POULET BRAISE DEPUIS 2009
        </div>
        <div style={{
          width: '60%', maxWidth: '280px', height: '6px',
          backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '3px',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${this.state.progress}%`, height: '100%',
            backgroundColor: '#E8750A', borderRadius: '3px',
            transition: 'width 0.2s ease-out',
          }} />
        </div>
        <div style={{
          marginTop: '0.8rem', fontSize: '0.7rem',
          color: 'rgba(255,255,255,0.5)',
        }}>
          {Math.round(this.state.progress)}%
        </div>
      </div>
    );
  }
}

class Landing extends React.Component {
  handleStartClick = e => {
    this.props.onStart();
  }

  render() {
    return <div data-id="landing-screen" style={{
      position: 'fixed', left: 0, right: 0, top: 0, bottom: 0,
      background: 'rgba(45, 51, 25, 0.85)', color: '#ffffff',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center',
      padding: '6vh 20px 5vh',
      boxSizing: 'border-box',
      gap: '24px',
    }}>
      {/* Header */}
      <div data-id="landing-header" style={{ textAlign: 'center' }}>
        <img
          src="/images/sticker-rond-pb.webp"
          alt="PB"
          style={{ width: '320px', height: '320px', marginBottom: '24px', objectFit: 'contain' }}
        />
        <div style={{ fontSize: '48px', fontWeight: 'bold', color: '#E8750A', textShadow: '0 4px 24px rgba(232,117,10,0.4)' }}>PB Flip Bottle</div>
        <div style={{ fontSize: '20px', color: '#8CB33F', letterSpacing: '6px', marginTop: '8px' }}>DEPUIS 2009</div>
      </div>

      {/* Mode toggle if unlocked */}
      {this.props.modeBUnlocked && (
        <div
          data-id="mode-toggle"
          onClick={() => game.toggleMode()}
          style={{
            fontSize: '24px', color: 'rgba(255,255,255,0.6)',
            cursor: 'pointer', letterSpacing: '2px',
            padding: '16px 32px', borderRadius: '40px',
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        >
          Mode: {game.gameMode === 'restaurant' ? 'Restaurant' : 'Free Play'}
        </div>
      )}

      {/* Start button */}
      <div
        data-id="start-button"
        onClick={this.handleStartClick}
        style={{
          backgroundColor: '#E8750A', color: '#fff', fontWeight: 'bold',
          fontSize: '32px', padding: '28px 96px', borderRadius: '60px',
          cursor: 'pointer', boxShadow: '0 8px 40px rgba(232,117,10,0.4)',
        }}
      >Jouer</div>
    </div>;
  }
}

class Game extends React.Component {
  container = null;
  state = {
    started: false
  }
  onRef = ref => {
    this.container = ref;
  }

  handleGameOver = async () => {
    this.props.onGameOver();
  }

  componentDidMount() {
    this.container.appendChild(game.renderer.domElement);
    game.addEventListener('gameover', this.handleGameOver);
  }

  componentWillUnmount() {
    this.container.removeChild(game.renderer.domElement);
    game.removeEventListener('gameover', this.handleGameOver);
  }

  render() {
    return <Wrapper>
      <div data-id="game-canvas" ref={this.onRef}></div>
    </Wrapper>
  }
}

class Score extends React.Component {
  render() {
    return <div data-id="gameover-screen" style={{
      position: 'fixed', left: 0, right: 0, top: 0, bottom: 0,
      background: 'rgba(45, 51, 25, 0.92)', color: '#ffffff',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12vh 0 8vh',
    }}>
      {/* Score */}
      <div data-id="score-display" style={{ textAlign: 'center' }}>
        <img
          src="/images/sticker-rond-pb.webp"
          alt="PB"
          style={{ width: '60px', height: '60px', marginBottom: '0.2rem', objectFit: 'contain' }}
        />
        <div style={{ fontSize: '0.7rem', color: '#8CB33F', marginTop: '0.3rem' }}>Score du Round</div>
        <div style={{ fontSize: '3.5rem', fontWeight: 'bold', color: '#E8750A', margin: '0.2rem 0' }}>{ this.props.round }</div>
        <div style={{ fontSize: '0.7rem', color: '#8CB33F' }}>Meilleur Score : { this.props.highest }</div>
      </div>

      {/* Buttons */}
      <div data-id="gameover-actions" style={{ width: '100%', textAlign: 'center' }}>
        <Button data-id="restart-button" onClick={this.props.onRestart}>Rejouer</Button>
        {this.props.modeBUnlocked && (
          <div
            onClick={() => game.toggleMode()}
            style={{
              marginTop: '0.8rem', cursor: 'pointer',
              fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)',
              letterSpacing: '1px',
            }}
          >
            Mode: {game.gameMode === 'restaurant' ? 'Restaurant' : 'Free Play'}
          </div>
        )}
      </div>
    </div>
  }
}

const STATE_LOADING = 'loading';
const STATE_LANDING = 'landing';
const STATE_GAME = 'game';
const STATE_GAMEOVER = 'gameover';

class App extends React.Component {
  handleModeUnlocked = () => {
    this.setState({ modeBUnlocked: true });
    localStorage.setItem('modeBUnlocked', 'true');
  }

  handleCheckpointRestored = () => {
    this.setState({ state: STATE_GAME });
  }

  state={
    state: STATE_LOADING,
    highest: parseInt(localStorage.getItem('highest') || '0', 10),
    round: 0,
    modeBUnlocked: localStorage.getItem('modeBUnlocked') === 'true',
  }

  componentDidMount() {
    game.addEventListener('mode-b-unlocked', this.handleModeUnlocked);
    game.addEventListener('checkpoint-restored', this.handleCheckpointRestored);
  }

  componentWillUnmount() {
    game.removeEventListener('mode-b-unlocked', this.handleModeUnlocked);
    game.removeEventListener('checkpoint-restored', this.handleCheckpointRestored);
  }

  renderUI() {
    switch (this.state.state) {
      case STATE_LOADING:
        return (
          <Loading
            onLoaded={() => {
              this.setState({state: STATE_LANDING});
            }}
          />
        );
      case STATE_GAMEOVER:
        return (
          <Score
            round={this.state.round}
            highest={this.state.highest}
            modeBUnlocked={this.state.modeBUnlocked}
            onRestart={
              () => {
                game.restart();
                this.setState({state: STATE_GAME});
              }
            }
          />
        );
      case STATE_LANDING:
          return (
            <Landing
              modeBUnlocked={this.state.modeBUnlocked}
              onStart={
                () => {
                  game.restart();
                  this.setState({state: STATE_GAME});
                }
              }
            />
          );
      case STATE_GAME:
      default:
          return null;
    }
  }

  render() {
    return (
      <React.Fragment>
        <Game
          onGameOver={
            () => {
              let highest = this.state.highest;
              if (game.score > this.state.highest) {
                highest = game.score;
                localStorage.setItem('highest', highest.toString())
              }
              this.setState({highest, round: game.score, state: STATE_GAMEOVER});
            }
          }
        />
        { this.renderUI() }
      </React.Fragment>
    );
  }
}


ReactDOM.render(<App/>, document.getElementById('root'));
