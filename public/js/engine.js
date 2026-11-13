// Main-thread client for the engine worker. Jobs run strictly one at a time.

export class Engine {
  constructor() {
    this.worker = new Worker(new URL('./engine-worker.js', import.meta.url));
    this.jobs = [];
    this.current = null;
    this.ready = new Promise((resolve) => (this.markReady = resolve));
    this.worker.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === 'ready') this.markReady();
      else if (msg.type === 'out') this.#onLine(msg.line);
      else if (msg.type === 'err') console.warn('[rapfi]', msg.line);
    };
  }

  /**
   * Sends `cmds` and resolves with every output line once `isDone(line)` returns true.
   * `onLine` (optional) sees each line as it arrives.
   */
  ask(cmds, isDone, onLine) {
    return new Promise((resolve) => {
      this.jobs.push({ cmds, isDone, onLine, lines: [], resolve });
      this.#pump();
    });
  }

  #pump() {
    if (this.current || !this.jobs.length) return;
    this.current = this.jobs.shift();
    for (const cmd of this.current.cmds) this.worker.postMessage({ cmd });
  }

  #onLine(line) {
    const job = this.current;
    if (!job) return;
    job.lines.push(line);
    if (job.onLine) job.onLine(line);
    if (job.isDone(line)) {
      this.current = null;
      job.resolve(job.lines);
      this.#pump();
    }
  }
}

export const engine = new Engine();
