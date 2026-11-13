// Pure game rules. No DOM access.
import { SIZE, Rule } from './config.js';

export const key = (x, y) => y * SIZE + x;

/**
 * Checks whether the last move in `list` ends the game.
 * Moves alternate colours starting with Black (index 0).
 * Freestyle: five or more wins. Standard: exactly five. Renju: exactly five for Black, five or more for White.
 * @returns {{winner: 0|1|-1, line: {x:number,y:number}[]} | null} winner −1 means a draw (board full).
 */
export function checkWin(list, rule) {
  if (!list.length) return null;
  const grid = new Array(SIZE * SIZE).fill(-1);
  list.forEach((m, i) => (grid[key(m.x, m.y)] = i % 2));
  const last = list[list.length - 1];
  const color = (list.length - 1) % 2;
  const exact = rule === Rule.STANDARD || (rule === Rule.RENJU && color === 0);

  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const cells = [{ x: last.x, y: last.y }];
    for (const s of [1, -1]) {
      let x = last.x + dx * s;
      let y = last.y + dy * s;
      while (x >= 0 && y >= 0 && x < SIZE && y < SIZE && grid[key(x, y)] === color) {
        cells.push({ x, y });
        x += dx * s;
        y += dy * s;
      }
    }
    if (exact ? cells.length === 5 : cells.length >= 5) return { winner: color, line: cells };
  }
  if (list.length >= SIZE * SIZE) return { winner: -1, line: [] };
  return null;
}
