#!/usr/bin/env bash
# Builds the Rapfi engine (engine/) to WebAssembly and installs it into public/engine/.
# Requires: cmake, the Emscripten SDK (emcmake) on PATH, and the engine/networks submodule (network weights).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
ENGINE="$ROOT/engine"
BUILD="$ENGINE/build/wasm"
OUT="$ROOT/public/engine"

command -v emcmake >/dev/null || { echo "error: emcmake not found (install Emscripten, e.g. 'brew install emscripten')" >&2; exit 1; }
command -v cmake   >/dev/null || { echo "error: cmake not found" >&2; exit 1; }
[ -f "$ENGINE/networks/wasm_preloads.txt" ] || {
  echo "error: network weights are missing. Run: git submodule update --init engine/networks" >&2; exit 1; }

# Single-threaded WASM with SIMD: runs in any modern browser without COOP/COEP headers.
emcmake cmake -S "$ENGINE" -B "$BUILD" -DCMAKE_BUILD_TYPE=Release \
  -DNO_COMMAND_MODULES=ON -DNO_MULTI_THREADING=ON -DUSE_WASM_SIMD=ON
cmake --build "$BUILD" -j"$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)"

mkdir -p "$OUT"
cp "$BUILD"/rapfi-single-simd128.{js,wasm,data} "$OUT"/
# The Emscripten loader is CommonJS; this web package is "type": "module", so mark the folder explicitly
# (lets Node scripts such as gen-puzzles.mjs require() it).
printf '{"type":"commonjs"}\n' > "$OUT/package.json"
echo "Installed engine into $OUT"
