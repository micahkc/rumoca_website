import type { SimulationSource } from './simulation-source';

interface Snapshot {
  t: number;
  values: Record<string, number>;
}

type WorkerMessage =
  | { type: 'compiled' }
  | { type: 'snapshot'; t: number; values: Record<string, number> }
  | { type: 'reset_complete' }
  | { type: 'error'; message: string };

/**
 * Main-thread handle to the simulation Web Worker.
 *
 * Implements [[SimulationSource]] so the existing aircraft renderers can
 * read state via `.get(name)` and `.setInput(name, value)` unchanged —
 * reads come from the latest worker snapshot (~16ms freshness), writes are
 * fire-and-forget messages.
 *
 * `dispose()` terminates the worker — cleanly cancels any in-flight compile,
 * which is the only way to interrupt the synchronous WasmStepper constructor.
 */
export class SimClient implements SimulationSource {
  private worker: Worker;
  private snapshot: Snapshot = { t: 0, values: {} };
  private compileResolve: (() => void) | null = null;
  private compileReject: ((err: Error) => void) | null = null;

  constructor() {
    this.worker = new Worker(
      new URL('./sim-worker.ts', import.meta.url),
      { type: 'module' },
    );
    this.worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const m = e.data;
      switch (m.type) {
        case 'compiled':
          this.compileResolve?.();
          this.compileResolve = null;
          this.compileReject = null;
          break;
        case 'snapshot':
          this.snapshot = { t: m.t, values: m.values };
          break;
        case 'reset_complete':
          break;
        case 'error':
          if (this.compileReject) {
            this.compileReject(new Error(m.message));
            this.compileResolve = null;
            this.compileReject = null;
          } else {
            console.error('[sim-worker]', m.message);
          }
          break;
      }
    };
    this.worker.onerror = (e) => {
      console.error('[sim-worker] uncaught:', e.message);
      this.compileReject?.(new Error(e.message));
      this.compileResolve = null;
      this.compileReject = null;
    };
  }

  /** Compile a model. Resolves when the worker reports `compiled`. */
  compile(source: string, modelName: string, solver?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.compileResolve = resolve;
      this.compileReject = reject;
      this.worker.postMessage({ type: 'compile', source, modelName, solver });
    });
  }

  /** Names the worker should include in each state snapshot. */
  subscribe(names: string[]): void {
    this.worker.postMessage({ type: 'subscribe', names });
  }

  /** Begin the worker's internal step + snapshot loops. */
  start(): void {
    this.worker.postMessage({ type: 'start' });
  }

  /** Pause stepping (snapshots also pause). */
  stop(): void {
    this.worker.postMessage({ type: 'stop' });
  }

  // ─── SimulationSource interface ──────────────────────────────────────────

  get time(): number {
    return this.snapshot.t;
  }
  get(name: string): number | undefined {
    return this.snapshot.values[name];
  }
  setInput(name: string, value: number): void {
    this.worker.postMessage({ type: 'setInput', name, value });
  }
  step(_dt: number): void {
    // No-op: the worker steps internally at fixed dt.
  }
  reset(): void {
    this.worker.postMessage({ type: 'reset' });
  }
  dispose(): void {
    this.worker.terminate();
    this.snapshot = { t: 0, values: {} };
  }
}
