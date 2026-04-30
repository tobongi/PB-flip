const isLocalDevelopment =
  typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development';

// Edit these values directly when you need a local debug setup.
export const debugConfig = {
  // Master switch for all debug-only overrides below. Defaults to true in local development builds.
  enabled: isLocalDevelopment,
  // When a landing fails, immediately restore the most recently saved retry checkpoint instead of ending the run.
  retryFromCheckpointOnFailure: true,
  // Logs each extracted restaurant table index, name, position, and camera angle to the console during scene setup.
  logTablePositions: true,
  scene: {
    // Enables debug-only orbit inspection on the canvas. Right mouse drag rotates and the mouse wheel zooms.
    enableOrbitControls: true,
    // Draws an XY grid slightly above the floor so restaurant coordinates are easier to inspect.
    showGrid: true,
    // Total width and height of the debug grid in world units.
    gridSize: 24,
    // Number of subdivisions across the full debug grid.
    gridDivisions: 24,
  },
  restaurant: {
    // Restaurant mode only: start the run from this table index instead of the normal default start table.
    startTableIndex: 0,
  },
  freeplay: {
    // Freeplay mode only: use this fixed RNG seed on restart. Set to null to keep random seeds.
    startSeed: null,
    // Freeplay mode only: load a full checkpoint object on restart instead of starting a fresh seeded run.
    startCheckpoint: null,
  },
};

export function isDebugEnabled() {
  return Boolean(debugConfig.enabled);
}
