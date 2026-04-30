import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

const GAME_ASPECT = 9 / 16;

function getViewport() {
  const ww = window.innerWidth;
  const wh = window.innerHeight;
  if (ww / wh > GAME_ASPECT) {
    const w = Math.round(wh * GAME_ASPECT);
    return { width: w, height: wh };
  }
  const h = Math.round(ww / GAME_ASPECT);
  return { width: ww, height: h };
}

export const useGameStore = create(
  subscribeWithSelector((set, get) => ({
    // UI State Machine
    uiState: 'loading',

    // Game State
    score: 0,
    highest: parseInt(localStorage.getItem('highest') || '0', 10),
    round: 0,
    gameMode: 'restaurant',
    modeBUnlocked: localStorage.getItem('modeBUnlocked') === 'true',

    // Viewport
    viewport: getViewport(),

    // Actions
    setUiState: (state) => set({ uiState: state }),

    setScore: (score) => set({ score }),

    endGame: (finalScore) => {
      const { highest } = get();
      const newHighest = Math.max(highest, finalScore);
      if (newHighest > highest) {
        localStorage.setItem('highest', newHighest.toString());
      }
      set({
        uiState: 'gameover',
        round: finalScore,
        highest: newHighest
      });
    },

    unlockModeB: () => {
      localStorage.setItem('modeBUnlocked', 'true');
      set({ modeBUnlocked: true });
    },

    setGameMode: (mode) => set({ gameMode: mode }),

    toggleGameMode: () => set((state) => ({
      gameMode: state.gameMode === 'restaurant' ? 'freeplay' : 'restaurant'
    })),

    updateViewport: () => set({ viewport: getViewport() }),

    startGame: () => set({ uiState: 'game', score: 0 }),

    finishLoading: () => set({ uiState: 'landing' }),
  }))
);
