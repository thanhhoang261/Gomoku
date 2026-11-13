// Tactical puzzles: positions where the side to move wins by force. The player must find the
// *fastest* win; the engine verifies each move and plays the defence.
import { MATE_BASE, PUZZLE_VERIFY_MS, Rule, STORAGE_KEYS } from './config.js';
import { S, resetAnalysis } from './state.js';
import { engine } from './engine.js';
import { bestMoveOf, boardCmd, fmtEval, isBestMove, isMateValue, label, makeParser, searchSetup } from './protocol.js';
import { checkWin } from './rules.js';
import { $, setBusy, setStatus } from './ui.js';
import { render } from './render.js';
import { clearReview } from './review.js';

const DATA_URL = new URL('../data/puzzles.json', import.meta.url);

function solvedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.solvedPuzzles) || '[]')); }
  catch { return new Set(); }
}

function markSolved(id) {
  try {
    const solved = solvedSet();
    solved.add(id);
    localStorage.setItem(STORAGE_KEYS.solvedPuzzles, JSON.stringify([...solved]));
  } catch { /* storage unavailable: progress simply is not remembered */ }
}

export function updatePuzzleInfo(prefix) {
  const level = +$('plevel').value;
  const atLevel = S.puzzles.filter((p) => p.level === level);
  const done = solvedSet();
  const solved = atLevel.filter((p) => done.has(p.id)).length;
  const base = S.puzzles.length
    ? `This level: solved ${solved}/${atLevel.length}.`
    : 'Could not load puzzles.json (see README: run scripts/gen-puzzles.mjs).';
  $('pinfo').textContent = prefix ? `${prefix} ${base}` : base;
  $('pnew').disabled = S.busy || !S.puzzles.length;
  $('pretry').disabled = S.busy || !S.puzzle;
}

export async function loadPuzzles() {
  try {
    const data = await (await fetch(DATA_URL)).json();
    const valid = (p) =>
      p && Array.isArray(p.moves) && p.moves.every((m) => Array.isArray(m) && m.length === 2) && [1, 2, 3].includes(p.level);
    S.puzzles = Array.isArray(data) ? data.filter(valid) : [];
  } catch {
    S.puzzles = [];
  }
  updatePuzzleInfo();
}

/** `p` = {id, level, n, moves: [[x, y], …]} where n is the winning mate distance in plies. */
export function startPuzzle(p) {
  S.token++;
  S.rule = Rule.FREESTYLE;
  $('rule').value = String(Rule.FREESTYLE);
  S.human = p.moves.length % 2; // the attacker moves next
  $('side').value = S.human === 0 ? 'black' : 'white';
  // `D` is the optimal mate distance (plies) from the position currently on the board.
  S.puzzle = { id: p.id, level: p.level, n: p.n, start: p.moves.length, moves0: p.moves, D: p.n };
  S.moves = p.moves.map(([x, y]) => ({ x, y }));
  S.gameOver = checkWin(S.moves, S.rule);
  resetAnalysis();
  S.forbidden = new Set();
  clearReview();
  setBusy(false);
  render();
  const attackerMoves = (p.n + 1) / 2;
  setStatus(`Puzzle #${p.id}: ${S.human === 0 ? 'Black' : 'White'} to move and win by force in ${attackerMoves} moves.`);
  updatePuzzleInfo();
}

/** Random puzzle of the selected level, preferring unsolved ones and avoiding the current one. */
function pickPuzzle() {
  const level = +$('plevel').value;
  const done = solvedSet();
  const pool = S.puzzles.filter((p) => p.level === level);
  if (!pool.length) return null;
  const fresh = pool.filter((p) => !done.has(p.id) && !(S.puzzle && p.id === S.puzzle.id));
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(Math.random() * from.length)];
}

export const newPuzzle = () => {
  const p = pickPuzzle();
  if (p) startPuzzle(p);
  else updatePuzzleInfo('No puzzles at this level.');
};

export const retryPuzzle = () => {
  if (S.puzzle) startPuzzle({ id: S.puzzle.id, level: S.puzzle.level, n: S.puzzle.n, moves: S.puzzle.moves0 });
};

/**
 * Checks a puzzle move. It is accepted when the defender, after searching, finds itself mated in at most
 * D−1 plies (D = the optimal distance before the move). Slower wins and non-winning moves are taken back.
 */
export async function puzzleMove(x, y) {
  if (S.busy || S.gameOver || !S.puzzle) return;
  const my = ++S.token;
  setBusy(true, 'Checking move…');
  S.overlay = [];
  S.moves.push({ x, y });

  const win = checkWin(S.moves, S.rule);
  if (win) {
    S.gameOver = win;
    markSolved(S.puzzle.id);
    setBusy(false);
    render();
    setStatus('Solved! 🎉 Five in a row.');
    updatePuzzleInfo();
    return;
  }
  render();

  const parser = makeParser();
  const lines = await engine.ask(
    [...searchSetup(Rule.FREESTYLE, PUZZLE_VERIFY_MS, 99), boardCmd('BOARD', S.moves)],
    isBestMove,
    (l) => parser.feed(l),
  );
  if (my !== S.token) return;

  const ev = parser.st.eval;
  const lost = ev != null && isMateValue(ev) && ev < 0;
  const d = lost ? MATE_BASE + ev : Infinity; // defender is mated in d plies
  if (!lost || d > S.puzzle.D - 1) {
    S.moves.pop();
    setBusy(false);
    render();
    setStatus(lost
      ? `That still wins, but slower than optimal (M${d + 1} instead of M${S.puzzle.D}). Look for a faster move.`
      : 'Not quite — that move loses the forced win. Try another, or press Hint.');
    updatePuzzleInfo();
    return;
  }

  S.puzzle.D = d - 1; // distance after the defender's reply
  const reply = bestMoveOf(lines);
  S.moves.push(reply);
  const lose = checkWin(S.moves, S.rule);
  if (lose) S.gameOver = lose; // the defender won: should not happen for a verified puzzle
  setBusy(false);
  render();
  setStatus(lose
    ? 'The engine won — this puzzle may be wrong, please report it.'
    : `Correct! Engine blocks at ${label(reply)}. Keep attacking (${fmtEval(-ev)}).`);
  updatePuzzleInfo();
}
