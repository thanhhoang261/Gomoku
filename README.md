# Rapfi Gomoku

A Gomoku / Renju game you play in the browser against the strong [Rapfi](engine/README.md) engine. The engine is
compiled to WebAssembly and runs entirely on your machine: there is no server component.

**Features**

- Freestyle, Standard or Renju rules (Renju forbidden points for Black are marked and blocked), play Black or White
- Four difficulty levels, hints, top-5 move analysis with principal variations, and a win-probability bar
- **Game review:** the engine grades every move and shows a win-probability chart plus your inaccuracies, mistakes and blunders with the better move
- **Tactical puzzles:** 36 forced-win positions in three levels, verified by the engine (it plays the defence)
- Undo, save/load in the browser, export/import as `.json` (a review is saved with the game)

## Quick start

### 0. Prerequisites

| Tool | Version | Used for | Install (macOS example) |
|---|---|---|---|
| Git | any | cloning, submodule | preinstalled |
| CMake | 3.18.2+ | building the engine | `brew install cmake` |
| Emscripten SDK | recent | compiling the engine to WebAssembly | `brew install emscripten` ([other platforms](https://emscripten.org/docs/getting_started/downloads.html)) |
| Node.js | 20+ | dev server, puzzle generator, tests | `brew install node` |
| Chrome / Chromium | any | only for the end-to-end tests | optional |

### 1. Get the code and the network weights

```bash
git clone https://github.com/thanhhoang261/Gomoku.git && cd Gomoku
git submodule update --init engine/networks     # ~40 MB of NNUE weights the engine build bundles
```

If you cloned with `--recurse-submodules` this is already done. Check that `engine/networks` is not empty.

### 2. Build the engine to WebAssembly

```bash
npm run build:engine
```

This runs [`scripts/build-engine.sh`](scripts/build-engine.sh): it configures `engine/` with Emscripten (single-threaded, WASM SIMD,
no command modules), builds it, and copies `rapfi-single-simd128.{js,wasm,data}` into `public/engine/`. The `.data` file (~40 MB) bundles
the config and network weights. The first build takes a few minutes.

### 3. Run the game

```bash
npm start            # serves public/ at http://localhost:8765
```

Open <http://localhost:8765>. The first load downloads ~40 MB (browsers cache it). Use another port with `node scripts/serve.mjs 9000`.
The page must be served over HTTP; opening `public/index.html` from disk does not work (Web Worker and `fetch`).

### 4. (Optional) Run the tests

```bash
npm install          # installs puppeteer-core (dev only)
npm test             # 12 unit tests + 7 end-to-end tests in headless Chrome (~20 s)
```

Set `CHROME_PATH=/path/to/chrome` if Chrome is not in a default location. `npm run test:unit` needs neither Chrome nor the engine build.

### 5. (Optional) Regenerate the puzzles

```bash
npm run puzzles      # engine self-play, 1-10 min; rewrites public/data/puzzles.json
```

## Repository layout

```
.
├─ public/                 The static site (this folder is what gets served)
│  ├─ index.html, css/, js/   Game UI and logic (ES modules, no build step)
│  ├─ data/puzzles.json       Engine-verified puzzles
│  └─ engine/                 Build output of the engine (git-ignored)
├─ engine/                 The Rapfi engine: C++17 source, CMake build, README   (see engine/README.md)
│  └─ networks/               Git submodule: NNUE weights + config
├─ scripts/                build-engine.sh · gen-puzzles.mjs · serve.mjs
├─ tests/                  unit.test.mjs · e2e.test.mjs
├─ docs/ARCHITECTURE.md    How the game talks to the engine, scoring, review and puzzle design
├─ .github/workflows/ci.yml  Build the engine, run the tests
├─ package.json · LICENSE
```

## npm scripts

| Script | Does |
|---|---|
| `npm start` | Serve `public/` at http://localhost:8765 |
| `npm run build:engine` | Build `engine/` to WebAssembly into `public/engine/` |
| `npm run puzzles` | Regenerate `public/data/puzzles.json` |
| `npm test` | Unit + end-to-end tests (`test:unit`, `test:e2e` run them separately) |

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `emcmake not found` | Install Emscripten and make sure `emcmake` is on `PATH` (for emsdk: `source emsdk_env.sh`). |
| `network weights are missing` | Run `git submodule update --init engine/networks`. |
| Blank page, 404 for `engine/...` in the browser console | The engine is not built yet: run `npm run build:engine`. |
| Page loads but nothing happens | Open it through `npm start` (http://), not `file://`. |
| `Rapfi is not a function` in a Node script | `public/engine/package.json` (`{"type":"commonjs"}`) is missing; re-run `npm run build:engine`. |
| Engine plays odd moves with `Eval 0` in a Node script | Pass `arguments: []` to `Rapfi({...})`; otherwise Emscripten forwards the script's CLI args to the engine. |

## Known limitations

- Single-threaded WebAssembly engine, so the "Expert" preset is weaker than a native build.
- Fixed 15×15 board; no swap opening rules.
- Puzzles are Freestyle only, and Hard has only win-in-5 positions.
- The win-probability bar is the model's estimate (`1 / (1 + e^(−eval/200))`), not a real-world win rate.

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Credits and license

The engine in [`engine/`](engine/) is [Rapfi](https://github.com/dhbloo/rapfi) by its authors (see [`engine/AUTHORS`](engine/AUTHORS)), with a one-line
build fix noted in [`engine/README.md`](engine/README.md). The network weights come from
[rapfi-networks](https://github.com/dhbloo/rapfi-networks). This project is distributed under the
[GNU General Public License v3](LICENSE), the same license as Rapfi.
