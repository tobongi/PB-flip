import { useGameStore } from './gameStore';

export function connectGameToStore(game) {
  const store = useGameStore.getState();

  const originalDispatchEvent = game.dispatchEvent.bind(game);

  game.dispatchEvent = (event) => {
    switch (event.type) {
      case 'gameover':
        store.endGame(game.score);
        break;
      case 'mode-b-unlocked':
        store.unlockModeB();
        break;
      case 'checkpoint-restored':
        store.setUiState('game');
        break;
      default:
        originalDispatchEvent(event);
    }
  };

  useGameStore.subscribe(
    (state) => state.gameMode,
    (gameMode) => {
      if (game.gameMode !== gameMode) {
        game.gameMode = gameMode;
      }
    }
  );

  return game;
}
