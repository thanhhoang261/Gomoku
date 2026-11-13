// The single mutable game state shared by all UI modules. No DOM access, no imports of other app modules.
import { Rule } from './config.js';

export const S = {
  rule: Rule.FREESTYLE,
  human: 0, // 0 = plays Black, 1 = plays White
  level: 2, // index into LEVELS
  moves: [], // [{x, y}] in play order, Black first
  busy: false, // an engine job is running; input is locked
  gameOver: null, // {winner: 0|1|-1, line: [{x,y}]} | null
  forbidden: new Set(), // Renju forbidden points for Black (board keys)
  overlay: [], // analysis markers drawn on the board: [{x, y, text}]
  evalBlack: null, // last engine evaluation from Black's point of view
  pvText: '', // text shown in the analysis box
  hover: null, // cell under the pointer
  token: 0, // bumped to invalidate in-flight async work
  review: null, // game review result (see review.js)
  viewPly: null, // null = live position; k = browsing the position before move k
  reviewing: false, // a review is running
  puzzles: [], // loaded puzzle list
  puzzle: null, // active puzzle, or null in normal games
};

/** 0 when Black is to move, 1 for White. */
export const turn = () => S.moves.length % 2;

/** Clears analysis output (markers, evaluation bar, PV text). */
export function resetAnalysis() {
  S.overlay = [];
  S.evalBlack = null;
  S.pvText = '';
}
