// Parsing and formatting for the engine's Piskvork/Yixin text protocol. No DOM access.
import { SIZE, MATE_BASE, MATE_THRESHOLD, SCALING_FACTOR } from './config.js';

/** True for the line that ends a search: the chosen move as `x,y`. */
export const isBestMove = (line) => /^\d+,\d+$/.test(line);

/** Parses the final `x,y` line of an engine reply. */
export function bestMoveOf(lines) {
  const [x, y] = lines[lines.length - 1].split(',').map(Number);
  return { x, y };
}

export const isMateValue = (v) => Math.abs(v) >= MATE_THRESHOLD;

/** Engine score text ("+M5", "-M*", "-120") → number (mates encoded, see config.js). */
export function parseEval(text) {
  const m = /^([+-]?)M(\d+|\*)/.exec(text);
  if (m) {
    const n = m[2] === '*' ? 0 : Math.min(+m[2], 999);
    return (m[1] === '-' ? -1 : 1) * (MATE_BASE - n);
  }
  const v = parseInt(text, 10);
  return Number.isNaN(v) ? 0 : v;
}

/** Number → display text ("+M5", "-M*", "+469"). */
export function fmtEval(v) {
  if (isMateValue(v)) {
    const n = MATE_BASE - Math.abs(v);
    return (v > 0 ? '+' : '-') + 'M' + (n || '*');
  }
  return (v > 0 ? '+' : '') + v;
}

/** Win probability (0..1) of the side the value is for. */
export function winProb(v) {
  if (isMateValue(v)) return v > 0 ? 1 : 0;
  return 1 / (1 + Math.exp(-v / SCALING_FACTOR));
}

/** Engine message coordinates ("H8": column letter, row counted from the bottom) → {x, y}. */
export function parseCoord(token) {
  const m = /^([A-Za-z])(\d+)$/.exec(token);
  if (!m) return null;
  return { x: m[1].toUpperCase().charCodeAt(0) - 65, y: SIZE - parseInt(m[2], 10) };
}

/** {x, y} → display label ("H8"). */
export const label = (p) => String.fromCharCode(65 + p.x) + (SIZE - p.y);

/**
 * Incremental parser for one search's output.
 *  - `st.eval` / `st.pv` / `st.depth`: the last completed "Depth" line.
 *  - `st.snap`: the last complete set of MultiPV lines (one per candidate move).
 * The engine prints the "(n) …" lines of an iteration *before* its "Depth" line, so a snapshot is
 * taken whenever a "Depth" line arrives; this avoids mixing lines from different iterations.
 */
export function makeParser() {
  const st = { depth: 0, eval: null, pv: [], multi: [], snap: [] };
  const toPv = (text) => text.split(' ').map(parseCoord).filter(Boolean);
  return {
    st,
    feed(line) {
      let m = /^MESSAGE Depth (\d+)-\d+ \| Eval (\S+) \| Time \d+ms \| (.*)$/.exec(line);
      if (m) {
        st.depth = +m[1];
        st.eval = parseEval(m[2]);
        st.pv = toPv(m[3]);
        if (st.multi.length) st.snap = st.multi.filter(Boolean);
        st.multi = [];
        return;
      }
      m = /^MESSAGE \((\d+)\) (\S+) \| (\d+)-\d+ \| (.*)$/.exec(line);
      if (m) st.multi[+m[1] - 1] = { eval: parseEval(m[2]), depth: +m[3], pv: toPv(m[4]) };
    },
  };
}

/**
 * Position command. Stones are labelled by owner (1 = first player / Black, 2 = White) in move order,
 * so the engine never needs a pass move. `verb` is BOARD (search and move) or YXBOARD (set only).
 */
export function boardCmd(verb, list) {
  const lines = list.map((m, i) => `${m.x},${m.y},${i % 2 === 0 ? 1 : 2}`);
  return `${verb}\n${lines.join('\n')}${lines.length ? '\n' : ''}DONE`;
}

/** Commands that configure rule, time and depth before a search. */
export const searchSetup = (rule, ms, depth) => [
  `INFO rule ${rule}`,
  `INFO timeout_turn ${ms}`,
  `INFO max_depth ${depth}`,
];
