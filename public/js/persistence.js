// Saving, loading, exporting and importing games (including an attached review).
import { SIZE, STORAGE_KEYS } from './config.js';
import { S } from './state.js';
import { key } from './rules.js';
import { $, setStatus } from './ui.js';
import { newGame } from './game.js';
import { restoreReview } from './review.js';

const FORMAT = { app: 'rapfi-gomoku', version: 2 };

export function snapshot() {
  const snap = { ...FORMAT, size: SIZE, rule: S.rule, human: S.human, level: S.level, moves: S.moves };
  if (S.review) {
    const { n, best, loss, blackWr, E } = S.review;
    snap.review = { n, best, loss, blackWr, E };
  }
  return snap;
}

function validate(s) {
  if (!s || s.size !== SIZE || !Array.isArray(s.moves)) throw new Error('Invalid file');
  const seen = new Set();
  for (const m of s.moves) {
    const ok = m && Number.isInteger(m.x) && Number.isInteger(m.y) && m.x >= 0 && m.y >= 0 && m.x < SIZE && m.y < SIZE;
    if (!ok || seen.has(key(m.x, m.y))) throw new Error('Invalid move');
    seen.add(key(m.x, m.y));
  }
}

async function apply(s) {
  validate(s);
  $('rule').value = String(s.rule);
  $('side').value = s.human === 0 ? 'black' : 'white';
  $('level').value = String(s.level);
  await newGame(s.moves.map(({ x, y }) => ({ x, y })));
  restoreReview(s.review);
}

export function saveGame() {
  try {
    localStorage.setItem(STORAGE_KEYS.save, JSON.stringify(snapshot()));
    setStatus('Game saved.');
  } catch {
    setStatus('Could not save (the browser blocked localStorage).');
  }
}

export async function loadGame() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.save);
    if (!raw) return setStatus('No saved game.');
    await apply(JSON.parse(raw));
  } catch (e) {
    setStatus('Failed to open game: ' + e.message);
  }
}

export function exportGame() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(snapshot(), null, 1)], { type: 'application/json' }));
  a.download = 'gomoku-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importFile(file) {
  try {
    await apply(JSON.parse(await file.text()));
  } catch (e) {
    setStatus('Failed to import file: ' + e.message);
  }
}
