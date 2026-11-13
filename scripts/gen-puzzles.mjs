// Generates tactical puzzles: lets the Rapfi engine (WebAssembly) play itself from randomised openings and keeps
// positions where the side to move has a short forced win (Freestyle only). Each candidate is re-verified
// with a longer search.
//
//   node scripts/gen-puzzles.mjs [--per-level 12] [--minutes 10] [--out public/data/puzzles.json]
//
// Without --out the JSON goes to stdout. Requires the engine build in public/engine/ (see scripts/build-engine.sh).
// Levels by mate distance n (plies): 1 = M3, 2 = M5, 3 = M7..M9.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engineDir = path.join(root, 'public', 'engine') + '/';
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
const PER_LEVEL = +args.get('per-level') || 12;
const LIMIT_MS = (+args.get('minutes') || 8) * 60_000;
const OUT = args.get('out');
const SIZE = 15, MATE_BASE = 10000;

process.chdir(engineDir);
const Rapfi = require(engineDir + 'rapfi-single-simd128.js');
let buf = [];
// `arguments: []` is essential: Emscripten would otherwise pass this script's CLI args to Rapfi's main().
const m = await Rapfi({ arguments: [], onReceiveStdout: (l) => buf.push(l), onReceiveStderr: () => {} });
const ask = (cmds) => { buf = []; for (const c of cmds) m.sendCommand(c); return buf; };

ask(['START 15', 'INFO rule 0']);

const boardCmd = (verb, list) =>
  `${verb}\n${list.map((p, i) => `${p[0]},${p[1]},${i % 2 === 0 ? 1 : 2}`).join('\n')}\nDONE`;

function parseEval(s) {
  const mm = /^([+-]?)M(\d+|\*)/.exec(s);
  if (mm) return (mm[1] === '-' ? -1 : 1) * (MATE_BASE - (mm[2] === '*' ? 0 : +mm[2]));
  const v = parseInt(s, 10);
  return Number.isNaN(v) ? 0 : v;
}
function think(list, ms) {
  const lines = ask(['INFO rule 0', `INFO timeout_turn ${ms}`, 'INFO max_depth 99', boardCmd('BOARD', list)]);
  let ev = null;
  for (const l of lines) {
    const mm = /^MESSAGE Depth \d+-\d+ \| Eval (\S+) \|/.exec(l);
    if (mm) ev = parseEval(mm[1]);
  }
  const bl = lines[lines.length - 1];
  if (!/^\d+,\d+$/.test(bl)) return null;
  return { best: bl.split(',').map(Number), ev };
}
function fiveInRow(list) {
  if (!list.length) return false;
  const g = new Map(list.map((p, i) => [p[1] * SIZE + p[0], i % 2]));
  const [lx, ly] = list[list.length - 1], c = (list.length - 1) % 2;
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    let n = 1;
    for (const s of [1, -1]) {
      let x = lx + dx * s, y = ly + dy * s;
      while (x >= 0 && y >= 0 && x < SIZE && y < SIZE && g.get(y * SIZE + x) === c) { n++; x += dx * s; y += dy * s; }
    }
    if (n >= 5) return true;
  }
  return false;
}
const isMate = (ev) => ev != null && ev >= MATE_BASE - 999;
const mateLen = (ev) => MATE_BASE - ev; // plies, own move counts as 1
const levelOf = (n) => (n === 3 ? 1 : n === 5 ? 2 : n >= 7 && n <= 9 ? 3 : 0);

const rnd = (a) => a[Math.floor(Math.random() * a.length)];
function randomOpening() {
  const list = [[6 + Math.floor(Math.random() * 3), 6 + Math.floor(Math.random() * 3)]];
  const target = 4 + Math.floor(Math.random() * 3);
  while (list.length < target) {
    const occ = new Set(list.map((p) => p[1] * SIZE + p[0]));
    const cand = [];
    for (const [x, y] of list)
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 3 && ny >= 3 && nx <= 11 && ny <= 11 && !occ.has(ny * SIZE + nx)) cand.push([nx, ny]);
      }
    list.push(rnd(cand));
  }
  return list;
}

const found = { 1: [], 2: [], 3: [] };
const seen = new Set();
const t0 = Date.now();
let games = 0;
const done = () => [1, 2, 3].every((l) => found[l].length >= PER_LEVEL);

while (!done() && Date.now() - t0 < LIMIT_MS) {
  games++;
  ask(['YXHASHCLEAR']);
  const list = randomOpening();
  const taken = new Set(); // at most one puzzle per level from each game, for diversity
  while (list.length < 70) {
    const r = think(list, 100);
    if (!r) break;
    if (list.length >= 7 && isMate(r.ev) && mateLen(r.ev) >= 3 && mateLen(r.ev) <= 9) {
      // Re-verify with a longer search; the mate distance from this search is the one we keep.
      const v = think(list, 400);
      if (v && isMate(v.ev)) {
        const n = mateLen(v.ev), lv = levelOf(n);
        const key = list.map((p) => p.join(',')).join(';');
        if (lv && n % 2 === 1 && !taken.has(lv) && found[lv].length < PER_LEVEL && !seen.has(key)) {
          seen.add(key);
          taken.add(lv);
          found[lv].push({ id: 0, level: lv, n, moves: list.map((p) => p.slice()), solution: v.best });
          console.error(`[${((Date.now() - t0) / 1000).toFixed(0)}s] game ${games}: level ${lv} M${n} (${found[1].length}/${found[2].length}/${found[3].length})`);
        }
      }
      // keep playing the mating line so that later, shorter mates of this game can become easier puzzles
    }
    list.push(r.best);
    if (fiveInRow(list)) break;
  }
}
const all = [...found[1], ...found[2], ...found[3]].map((p, i) => ({ ...p, id: i + 1 }));
console.error(`done: ${all.length} puzzles in ${games} games, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
const json = JSON.stringify(all);
if (OUT) {
  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  fs.writeFileSync(OUT, json + '\n'); // written only on success, so a failed run never truncates an existing file
} else console.log(json);
