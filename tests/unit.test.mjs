// Unit tests for the pure modules (no browser, no engine).
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkWin } from '../public/js/rules.js';
import { Rule, MATE_BASE } from '../public/js/config.js';
import {
  parseEval, fmtEval, winProb, parseCoord, label, makeParser, boardCmd, isBestMove, bestMoveOf,
} from '../public/js/protocol.js';

/** Builds an alternating move list: Black stones `b`, White stones `w` as [x, y] pairs. */
function game(b, w) {
  const out = [];
  for (let i = 0; i < b.length; i++) {
    out.push({ x: b[i][0], y: b[i][1] });
    if (w[i]) out.push({ x: w[i][0], y: w[i][1] });
  }
  return out;
}
const row = (n, y = 0) => Array.from({ length: n }, (_, i) => [i, y]);
const filler = (n) => Array.from({ length: n }, (_, i) => [i, 14]); // harmless White stones on the far edge

test('checkWin: five in a row wins in every rule', () => {
  for (const rule of [Rule.FREESTYLE, Rule.STANDARD, Rule.RENJU]) {
    const g = game(row(5), filler(4));
    const r = checkWin(g, rule);
    assert.equal(r?.winner, 0, `rule ${rule}`);
    assert.equal(r.line.length, 5);
  }
});

test('checkWin: no result before five', () => {
  assert.equal(checkWin(game(row(4), filler(3)), Rule.FREESTYLE), null);
  assert.equal(checkWin([], Rule.FREESTYLE), null);
});

test('checkWin: six in a row (overline) wins only in Freestyle for Black', () => {
  // Black plays x = 0,1,2,3,5 and finally 4, joining everything into six. White stones are scattered.
  const black = [[0, 0], [1, 0], [2, 0], [3, 0], [5, 0], [4, 0]];
  const white = [[0, 14], [2, 14], [4, 14], [6, 14], [8, 14]];
  const g = game(black, white);
  assert.equal(g.length, 11);
  assert.equal(checkWin(g, Rule.FREESTYLE)?.winner, 0);
  assert.equal(checkWin(g, Rule.STANDARD), null);
  assert.equal(checkWin(g, Rule.RENJU), null);
});

test('checkWin: Renju allows White overline', () => {
  // White gets six in a row (0..5 on row 14); Black stones are scattered.
  const wh = [[0, 14], [1, 14], [2, 14], [3, 14], [5, 14], [4, 14]];
  const bl = [[0, 0], [2, 0], [4, 0], [6, 0], [8, 0], [10, 0]];
  const g = [];
  for (let i = 0; i < 6; i++) { g.push({ x: bl[i][0], y: bl[i][1] }); g.push({ x: wh[i][0], y: wh[i][1] }); }
  assert.equal(checkWin(g, Rule.RENJU)?.winner, 1);
  assert.equal(checkWin(g, Rule.STANDARD), null);
});

test('checkWin: diagonal five', () => {
  const diag = [[3, 3], [4, 4], [5, 5], [6, 6], [7, 7]];
  assert.equal(checkWin(game(diag, filler(4)), Rule.FREESTYLE)?.winner, 0);
});

test('parseEval / fmtEval round-trip', () => {
  assert.equal(parseEval('-120'), -120);
  assert.equal(parseEval('+M5'), MATE_BASE - 5);
  assert.equal(parseEval('-M3'), -(MATE_BASE - 3));
  assert.equal(parseEval('-M*'), -MATE_BASE);
  assert.equal(parseEval('garbage'), 0);
  assert.equal(fmtEval(469), '+469');
  assert.equal(fmtEval(-12), '-12');
  assert.equal(fmtEval(MATE_BASE - 5), '+M5');
  assert.equal(fmtEval(-(MATE_BASE - 3)), '-M3');
  assert.equal(fmtEval(-MATE_BASE), '-M*');
});

test('winProb: logistic with scale 200, mates are 0/1', () => {
  assert.equal(winProb(0), 0.5);
  assert.ok(Math.abs(winProb(200) - 1 / (1 + Math.exp(-1))) < 1e-12);
  assert.equal(winProb(MATE_BASE - 7), 1);
  assert.equal(winProb(-(MATE_BASE - 7)), 0);
  assert.ok(winProb(300) > winProb(100));
});

test('coordinates: engine labels flip the row', () => {
  assert.deepEqual(parseCoord('H8'), { x: 7, y: 7 });
  assert.deepEqual(parseCoord('A15'), { x: 0, y: 0 });
  assert.deepEqual(parseCoord('O1'), { x: 14, y: 14 });
  assert.equal(parseCoord('??'), null);
  assert.equal(label({ x: 0, y: 0 }), 'A15');
  assert.equal(label({ x: 7, y: 7 }), 'H8');
  assert.deepEqual(parseCoord(label({ x: 3, y: 11 })), { x: 3, y: 11 });
});

test('boardCmd labels stones by owner in play order', () => {
  assert.equal(boardCmd('BOARD', [{ x: 7, y: 7 }, { x: 8, y: 8 }, { x: 7, y: 8 }]), 'BOARD\n7,7,1\n8,8,2\n7,8,1\nDONE');
  assert.equal(boardCmd('YXBOARD', []), 'YXBOARD\nDONE');
});

test('isBestMove / bestMoveOf', () => {
  assert.ok(isBestMove('8,6'));
  assert.ok(!isBestMove('MESSAGE foo'));
  assert.deepEqual(bestMoveOf(['MESSAGE x', '8,6']), { x: 8, y: 6 });
});

test('makeParser: Depth lines set eval/pv and MultiPV lines are snapshotted per iteration', () => {
  const p = makeParser();
  for (const l of [
    'MESSAGE (1) 100 | 2-4 | I9 I6 G6',
    'MESSAGE (2) -325 | 2-6 | F6 I9',
    'MESSAGE Depth 2-4 | Eval 100 | Time 1ms | I9 I6 G6',
    'MESSAGE (1) -185 | 3-5 | I9 I6',
    'MESSAGE (2) -325 | 3-6 | F6 I9',
    'MESSAGE (3) -300 | 3-6 | H6 F6', // partial iteration: no Depth line after it yet
  ]) p.feed(l);
  assert.equal(p.st.eval, 100);
  assert.deepEqual(p.st.pv.map(label), ['I9', 'I6', 'G6']);
  // The snapshot is the last *complete* iteration (2 candidates), not the partial one.
  assert.equal(p.st.snap.length, 2);
  assert.equal(p.st.snap[0].eval, 100);
  p.feed('MESSAGE Depth 3-5 | Eval -185 | Time 2ms | I9 I6');
  assert.equal(p.st.snap.length, 3);
  assert.equal(p.st.snap[2].eval, -300);
});

test('makeParser: mate scores', () => {
  const p = makeParser();
  p.feed('MESSAGE Depth 26-3 | Eval +M5 | Time 44ms | L7 M8');
  assert.equal(p.st.eval, MATE_BASE - 5);
});
