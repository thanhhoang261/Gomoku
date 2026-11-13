// Web Worker hosting the Rapfi WebAssembly engine. Relays Piskvork command lines in and stdout lines out.
// Classic (non-module) worker because the Emscripten loader is a plain script.
importScripts('../engine/rapfi-single-simd128.js');

let engine = null;
const pending = [];

Rapfi({
  onReceiveStdout: (line) => postMessage({ type: 'out', line }),
  onReceiveStderr: (line) => postMessage({ type: 'err', line }),
  // The .wasm and .data files live next to the loader, one level above this script.
  locateFile: (path) => '../engine/' + path,
}).then((module) => {
  engine = module;
  postMessage({ type: 'ready' });
  for (const cmd of pending.splice(0)) engine.sendCommand(cmd);
});

onmessage = (event) => {
  const { cmd } = event.data;
  if (engine) engine.sendCommand(cmd);
  else pending.push(cmd);
};
