// Web Worker that hosts the rumoca WasmStepper for the interactive sim.
//
// All sim state lives here. The main thread reads via snapshot messages and
// writes inputs via setInput messages. Because the worker owns the WASM, the
// main thread stays responsive during the 7s compile — and navigating away
// (Worker.terminate()) cleanly cancels any in-flight construction.
//
// Step cadence: ~200Hz physics, ~60Hz snapshots. The two are decoupled so a
// slow snapshot doesn't drift physics time.

/* eslint-disable @typescript-eslint/no-explicit-any */

type IncomingMessage =
  | { type: 'compile'; source: string; modelName: string; solver?: string }
  | { type: 'subscribe'; names: string[] }
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'setInput'; name: string; value: number }
  | { type: 'reset' }
  | { type: 'dispose' };

let mod: any = null;
let stepper: any = null;
let trackedNames: string[] = [];
let stepHandle: ReturnType<typeof setInterval> | null = null;
let snapshotHandle: ReturnType<typeof setInterval> | null = null;
let lastStepWallMs = 0;

async function loadWasm(): Promise<void> {
  if (mod) return;
  // Dynamic import via Function() so Vite/Rollup don't statically resolve the
  // path — the WASM lives in public/wasm/ and is served at runtime.
  mod = await (new Function('return import("/wasm/rumoca_bind_wasm.js")'))();
  await mod.default();
  mod.init();
}

function pushSnapshot(): void {
  if (!stepper) return;
  const values: Record<string, number> = {};
  for (const name of trackedNames) {
    const v = stepper.get(name);
    if (v != null) values[name] = v;
  }
  self.postMessage({ type: 'snapshot', t: stepper.time(), values });
}

function stopLoops(): void {
  if (stepHandle != null) clearInterval(stepHandle);
  if (snapshotHandle != null) clearInterval(snapshotHandle);
  stepHandle = snapshotHandle = null;
}

self.onmessage = async (e: MessageEvent<IncomingMessage>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'compile': {
        await loadWasm();
        stepper = new mod.WasmStepper(msg.source, msg.modelName, msg.solver);
        self.postMessage({ type: 'compiled' });
        break;
      }
      case 'subscribe': {
        trackedNames = msg.names;
        // Push an immediate snapshot so the renderer sees initial state.
        pushSnapshot();
        break;
      }
      case 'start': {
        if (!stepper) return;
        stopLoops();
        lastStepWallMs = performance.now();
        stepHandle = setInterval(() => {
          if (!stepper) return;
          const now = performance.now();
          const dt = Math.min((now - lastStepWallMs) / 1000, 0.05);
          lastStepWallMs = now;
          try {
            stepper.step(dt);
          } catch (err) {
            self.postMessage({ type: 'error', message: String(err) });
            stopLoops();
          }
        }, 5);
        snapshotHandle = setInterval(pushSnapshot, 16);
        break;
      }
      case 'stop': {
        stopLoops();
        break;
      }
      case 'setInput': {
        if (stepper) stepper.set_input(msg.name, msg.value);
        break;
      }
      case 'reset': {
        if (stepper) stepper.reset();
        // Re-zero wall clock so the next step doesn't see a big dt.
        lastStepWallMs = performance.now();
        pushSnapshot();
        self.postMessage({ type: 'reset_complete' });
        break;
      }
      case 'dispose': {
        stopLoops();
        if (stepper) stepper.free();
        stepper = null;
        break;
      }
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) });
  }
};
