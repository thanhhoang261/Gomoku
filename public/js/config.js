// Shared constants. This module must stay free of DOM access so it can be unit-tested in Node.

export const SIZE = 15;

/** Rule ids understood by the engine's `INFO rule` command. */
export const Rule = { FREESTYLE: 0, STANDARD: 1, RENJU: 4 };

/** Engine strength presets: time per move (ms) and maximum search depth. */
export const LEVELS = [
  { ms: 100, depth: 4 },
  { ms: 500, depth: 8 },
  { ms: 2000, depth: 99 },
  { ms: 5000, depth: 99 },
];

/**
 * Mate scores are encoded as ±(MATE_BASE − n) so that they sort above any normal evaluation.
 * `n` is the mate distance in plies (an engine "M5" has n = 5; "M*" has n = 0).
 */
export const MATE_BASE = 10000;
export const MATE_THRESHOLD = MATE_BASE - 999;

/** Engine default for converting an evaluation to a win probability: p = 1 / (1 + e^(−eval / 200)). */
export const SCALING_FACTOR = 200;

/** Thinking time per position while reviewing a game (ms). */
export const REVIEW_MS = 600;

/** Time budgets for hint / analysis / puzzle verification searches (ms). */
export const HINT_MS = 1000;
export const ANALYZE_MS = 2000;
export const PUZZLE_VERIFY_MS = 1000;

/** Review classification, most severe first. `min` is the loss of win probability. */
export const MISTAKE_CLASSES = [
  { min: 0.3, id: 3, name: 'Blunder' },
  { min: 0.15, id: 2, name: 'Mistake' },
  { min: 0.07, id: 1, name: 'Inaccuracy' },
];

export const STORAGE_KEYS = {
  save: 'rapfi-gomoku-save',
  solvedPuzzles: 'rapfi-gomoku-puzzles-solved',
};
