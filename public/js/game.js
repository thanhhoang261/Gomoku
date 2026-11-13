// Normal games: starting, human and engine moves, undo, hint/analysis, Renju forbidden points.
import { ANALYZE_MS, HINT_MS, LEVELS, MATE_BASE } from './config.js';
import { S, turn, resetAnalysis } from './state.js';
import { engine } from './engine.js';
import { bestMoveOf, boardCmd, fmtEval, isBestMove, label, makeParser, searchSetup } from './protocol.js';
import { checkWin, key } from './rules.js';
import { $, setBusy, setStatus } from './ui.js';
import { render } from './render.js';
import { clearReview } from './review.js';
import { puzzleMove } from './puzzles.js';

/** Asks the engine for Black's forbidden points (Renju only, when Black is to move). */
export async function refreshForbidden() {
  S.forbidden = new Set();
  if (S.rule !== 4 || turn() !== 0 || S.gameOver || !S.moves.length) return;
  const lines = await engine.ask(
    [`INFO rule ${S.rule}`, boardCmd('YXBOARD', S.moves), 'YXSHOWFORBID'],
    (l) => l.startsWith('FORBID'),
  );
  // Reply: "FORBID" followed by 4-digit groups xxyy, ending with ".".
  const m = /^FORBID (\d*)\./.exec(lines[lines.length - 1]);
  if (!m) return;
  for (let i = 0; i + 4 <= m[1].length; i += 4) S.forbidden.add(key(+m[1].slice(i, i + 2), +m[1].slice(i + 2, i + 4)));
}

/** Records an engine evaluation (given from the searching side's view) as Black's evaluation. */
function setEval(value, pv, searcherIsBlack) {
  if (value == null) return;
  S.evalBlack = searcherIsBlack ? value : -value;
  S.pvText = pv.length ? 'PV: ' + pv.map(label).join(' ') : '';
}

async function afterMove() {
  S.gameOver = checkWin(S.moves, S.rule);
  await refreshForbidden();
  setBusy(false);
  render();
  if (!S.gameOver && turn() !== S.human) engineMove();
}

export async function engineMove() {
  if (S.puzzle || S.gameOver || turn() === S.human) return;
  const my = ++S.token;
  setBusy(true, 'Engine is thinking…');
  S.overlay = [];
  const parser = makeParser();
  const { ms, depth } = LEVELS[S.level];
  const cmds = searchSetup(S.rule, ms, depth);
  cmds.push(...(S.moves.length ? [boardCmd('BOARD', S.moves)] : ['RESTART', 'BEGIN']));
  const lines = await engine.ask(cmds, isBestMove, (l) => parser.feed(l));
  if (my !== S.token) return;
  const searcherIsBlack = turn() === 0; // read before the move flips the turn
  clearReview();
  S.moves.push(bestMoveOf(lines));
  setEval(parser.st.eval, parser.st.pv, searcherIsBlack);
  await afterMove();
}

export async function humanMove(x, y) {
  if (S.busy || S.gameOver || turn() !== S.human) return;
  if (S.moves.some((m) => m.x === x && m.y === y)) return;
  if (S.puzzle) return puzzleMove(x, y);
  if (S.forbidden.has(key(x, y))) return setStatus('Forbidden move (3-3, 4-4 or overline) — pick another point.');
  S.token++;
  S.overlay = [];
  clearReview();
  S.moves.push({ x, y });
  await afterMove();
}

/** Starts a new game, or resumes from `initial` moves. Reads rule/side/level from the form. */
export async function newGame(initial) {
  S.token++;
  S.rule = +$('rule').value;
  S.human = $('side').value === 'black' ? 0 : 1;
  S.level = +$('level').value;
  S.puzzle = null;
  S.moves = initial ? initial.slice() : [];
  S.gameOver = checkWin(S.moves, S.rule);
  resetAnalysis();
  S.forbidden = new Set();
  clearReview();
  setBusy(false);
  await refreshForbidden();
  render();
  if (!S.gameOver && turn() !== S.human) engineMove();
}

/** Takes back moves until it is the human's turn again (never below a puzzle's starting position). */
export async function undo() {
  if (S.busy || !S.moves.length) return;
  const floor = S.puzzle ? S.puzzle.start : 0;
  if (S.moves.length <= floor) return;
  S.token++;
  do S.moves.pop(); while (S.moves.length > floor && turn() !== S.human);
  S.gameOver = null;
  resetAnalysis();
  clearReview();
  await refreshForbidden();
  render();
  if (turn() !== S.human) engineMove();
}

/** Hint (n = 1) or top-n analysis for the side to move. */
export async function analyze(n) {
  if (S.busy || S.gameOver) return;
  S.viewPly = null;
  const my = ++S.token;
  setBusy(true, 'Analyzing…');
  const parser = makeParser();
  const side = turn();
  const cmds = searchSetup(S.rule, n === 1 ? HINT_MS : ANALYZE_MS, 99);
  cmds.push(S.moves.length ? boardCmd('YXBOARD', S.moves) : 'RESTART', `YXNBEST ${n}`);
  const lines = await engine.ask(cmds, isBestMove, (l) => parser.feed(l));
  if (my !== S.token) return;

  const candidates = parser.st.snap.slice();
  if (!candidates.length && parser.st.pv.length) {
    candidates.push({ eval: parser.st.eval, depth: parser.st.depth, pv: parser.st.pv });
  }
  if (!candidates.length) {
    // The engine answered without searching (e.g. an immediate five is available): use its move directly.
    const best = bestMoveOf(lines);
    const win = checkWin(S.moves.concat(best), S.rule);
    candidates.push({ eval: win && win.winner === side ? MATE_BASE - 1 : 0, depth: 0, pv: [best] });
  }

  S.overlay = candidates
    .filter((c) => c.pv.length)
    .map((c, i) => ({ x: c.pv[0].x, y: c.pv[0].y, text: String(i + 1) }));
  setEval(candidates[0].eval, candidates[0].pv, side === 0);
  S.pvText = candidates
    .map((c, i) => `${i + 1}. ${c.pv[0] ? label(c.pv[0]) : '?'}  (${fmtEval(c.eval)})  ${c.pv.map(label).join(' ')}`)
    .join('\n');
  setBusy(false);
  render();
  setStatus(n === 1 && S.overlay[0] ? `Hint: ${label(S.overlay[0])}` : 'Analysis done — numbers on the board rank the moves.');
}
