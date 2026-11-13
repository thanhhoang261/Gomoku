// Entry point: wires the DOM to the game modules and boots the engine.
import { engine } from './engine.js';
import { S } from './state.js';
import { $, setBusy } from './ui.js';
import { cellAt, render } from './render.js';
import { analyze, humanMove, newGame, undo } from './game.js';
import { onArrowKey, onChartClick, runReview } from './review.js';
import { loadPuzzles, newPuzzle, retryPuzzle, updatePuzzleInfo } from './puzzles.js';
import { exportGame, importFile, loadGame, saveGame } from './persistence.js';

const board = $('board');
board.addEventListener('pointermove', (e) => { S.hover = cellAt(e); render(); });
board.addEventListener('pointerleave', () => { S.hover = null; render(); });
board.addEventListener('pointerup', (e) => {
  if (S.viewPly != null) { S.viewPly = null; render(); return; } // leave review browsing
  const cell = cellAt(e);
  if (cell) humanMove(cell.x, cell.y);
});

$('new').onclick = () => newGame();
$('undo').onclick = undo;
$('hint').onclick = () => analyze(1);
$('analyze').onclick = () => analyze(5);
$('review').onclick = runReview;
$('save').onclick = saveGame;
$('load').onclick = loadGame;
$('export').onclick = exportGame;
$('import').onclick = () => $('file').click();
$('file').onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) importFile(file);
};
$('pnew').onclick = newPuzzle;
$('pretry').onclick = retryPuzzle;
$('plevel').onchange = () => updatePuzzleInfo();
$('chart').addEventListener('pointerup', onChartClick);
document.addEventListener('keydown', onArrowKey);

(async function boot() {
  setBusy(true, 'Loading engine…');
  await engine.ready;
  await engine.ask(['START 15'], (line) => line === 'OK');
  await newGame();
  loadPuzzles();
})();
