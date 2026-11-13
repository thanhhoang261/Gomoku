# Architecture

How the game is put together. For setup, see the [README](../README.md).

## Overview

```
 browser main thread                          Web Worker
┌──────────────────────────────┐          ┌──────────────────────────┐
│ main.js  (wiring, boot)      │          │ engine-worker.js         │
│ game / review / puzzles      │ commands │   Rapfi (WebAssembly)    │
│ persistence · render · ui    │ ───────▶ │   ← engine/ built with   │
│ engine.js (job queue)        │ ◀─────── │     Emscripten           │
└──────────────────────────────┘  lines   └──────────────────────────┘
```

The engine is a long-running search, so it lives in a Web Worker and the UI never blocks. `engine.js` serialises requests: each
`engine.ask(cmds, isDone)` sends its commands and resolves with all output lines once `isDone(line)` is true; the next job starts only
after that.

## Source layout (`public/js/`)

| Module | Responsibility |
|---|---|
| `main.js` | Event wiring and boot (`START 15`, first game, puzzle loading) |
| `config.js` | Constants: board size, rule ids, levels, mate encoding, review thresholds, storage keys |
| `state.js` | The single shared mutable state `S` (position, busy flag, review, puzzle, …) |
| `protocol.js` | Parse and format the engine's text protocol (pure) |
| `rules.js` | Win detection per rule (pure) |
| `engine.js` / `engine-worker.js` | Job queue on the main thread / the worker hosting the WebAssembly engine |
| `game.js` | New game, human and engine moves, undo, hint/analysis, Renju forbidden points |
| `review.js` | Game review, its chart and mistake list, restore from a saved game |
| `puzzles.js` | Puzzle loading, selection and move verification |
| `persistence.js` | Save / load / export / import |
| `render.js` / `ui.js` | Canvas and side panels / DOM helpers, status line, busy lock |

`config.js`, `protocol.js` and `rules.js` never touch the DOM, so they are unit-tested in plain Node (`tests/unit.test.mjs`).
Async work is guarded by `S.token`: any action that changes the game bumps it, and a stale engine reply is discarded.

## Talking to the engine

Commands go through the WebAssembly build's `sendCommand` (Piskvork/Yixin protocol); output lines come back from stdout.

| Purpose | Command |
|---|---|
| Initialise | `START 15` |
| Configure | `INFO rule <0\|1\|4>`, `INFO timeout_turn <ms>`, `INFO max_depth <n>` |
| Engine move | `BOARD x,y,c … DONE` (c = 1 for Black's stones, 2 for White's, in play order) → replies `x,y` |
| Set a position without thinking | `YXBOARD … DONE` |
| Top-N moves | `YXNBEST n` |
| Renju forbidden points | `YXSHOWFORBID` |

Scores and principal variations come from `MESSAGE Depth a-b | Eval … | Time … | <pv>` and, for MultiPV, `MESSAGE (n) …` lines. The
engine prints the `(n)` lines of an iteration *before* its `Depth` line, so the parser snapshots them when a `Depth` line arrives.
Coordinates in `MESSAGE` lines look like `H8` (row counted from the bottom, so row = 15 − y); coordinates in commands are raw `x,y`.
When the side to move can win immediately the engine answers with just `x,y` and no `Depth` line; callers handle that case.

## Scores

- **Eval** is from the point of view of the side to move; mates print as `+M5` / `-M3` (plies). They are encoded as ±(10000 − n).
- **Evaluation bar:** `P(Black wins) = 1 / (1 + e^(−eval/200))` (200 is the engine's default scaling factor); mates are 100% / 0%.
  This is the model's assessment, not a real-world win rate.

## Game review

For the move played in a position with `i` stones, the engine searches position `i` and position `i + 1` for 0.6 s each:

```
loss = winProb(best move in position i) − (1 − winProb(position i + 1))
```

Thresholds (`MISTAKE_CLASSES` in `config.js`): ≥ 7% inaccuracy, ≥ 15% mistake, ≥ 30% blunder. A few percent of difference is search noise.
The first move of a game is not graded, and a game-ending move has loss 0. A review is stored with a saved game and restored only if
its length and shapes match the loaded moves.

## Puzzles

A puzzle is a position where the side to move has a forced win of `n` plies (`M n`): Easy M3, Medium M5, Hard M7–M9. A move is accepted when
the defender (searching 1 s) is found to be mated in at most the optimal remaining distance minus one ply, so a slower win is taken back;
the engine then plays the defence and the loop continues until five in a row.

`scripts/gen-puzzles.mjs` lets the engine play itself from randomised openings (100 ms per move), keeps positions with a short mate,
re-verifies each with a 400 ms search, and keeps at most one puzzle per level from each game. Freestyle only.

## Engine build

`scripts/build-engine.sh` configures `engine/` with `emcmake` as single-threaded WASM with SIMD (`NO_MULTI_THREADING`, `USE_WASM_SIMD`,
`NO_COMMAND_MODULES`) and bundles `engine/networks` into the `.data` file. A multi-threaded build would need `SharedArrayBuffer`,
i.e. COOP/COEP headers on the server.

## Node scripts that use the engine

When calling the WebAssembly engine from Node (as `gen-puzzles.mjs` does), pass `arguments: []` to `Rapfi({...})`; otherwise Emscripten
forwards the script's command-line arguments to the engine's `main()` and it silently misbehaves (`Eval 0`, moves along the board edge).
`public/engine/package.json` marks the loader as CommonJS because the project is `"type": "module"`.
