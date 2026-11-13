// Small DOM helpers: element lookup, status line and the busy/idle lock.
import { S, turn } from './state.js';

export const $ = (id) => document.getElementById(id);

const LOCKED_WHILE_BUSY = ['undo', 'hint', 'analyze', 'new', 'load'];

export function setStatus(text) {
  $('status').textContent = text;
}

/** Locks (or unlocks) the controls while the engine works. `text` becomes the status message. */
export function setBusy(busy, text) {
  S.busy = busy;
  for (const id of LOCKED_WHILE_BUSY) $(id).disabled = busy;
  if (busy) setStatus(text);
}

/** Default status line for the current position. */
export function updateStatus() {
  if (S.busy) return;
  if (S.gameOver) {
    setStatus(S.gameOver.winner < 0 ? 'Draw.' : S.gameOver.winner === S.human ? 'You win! 🎉' : 'Engine wins.');
    return;
  }
  const side = turn() === 0 ? 'Black' : 'White';
  setStatus(turn() === S.human ? `Your turn (${side}).` : `Engine's turn (${side}).`);
}
