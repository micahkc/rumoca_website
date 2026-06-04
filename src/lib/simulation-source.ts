/**
 * Simulation source abstraction. Currently only WASM controller mode is
 * supported on the deployed site — autopilot SIL mode requires a local
 * WebSocket→UDP proxy that can't run on GitHub Pages.
 */

export interface SimulationSource {
  readonly time: number;
  get(name: string): number | undefined;
  setInput(name: string, value: number): void;
  step(dt: number): void;
  reset(): void;
  dispose(): void;
}

export class WasmControllerSource implements SimulationSource {
  private stepper: any;
  private static readonly MAX_SUB_DT = 0.002;

  get time(): number {
    return this.stepper?.time() ?? 0;
  }

  constructor(stepper: any) {
    this.stepper = stepper;
  }

  get(name: string): number | undefined {
    return this.stepper?.get(name) ?? undefined;
  }

  setInput(name: string, value: number): void {
    this.stepper?.set_input(name, value);
  }

  step(dt: number): void {
    const nSteps = Math.max(1, Math.ceil(dt / WasmControllerSource.MAX_SUB_DT));
    const subDt = dt / nSteps;
    for (let i = 0; i < nSteps; i++) {
      this.stepper?.step(subDt);
    }
  }

  reset(): void {
    this.stepper?.reset();
  }

  dispose(): void {
    this.stepper?.free();
    this.stepper = null;
  }
}

async function loadWasmModule(): Promise<any> {
  // Dynamic import via Function to keep Vite/Rollup from trying to resolve
  // /wasm/rumoca_bind_wasm.js at build time — it's served from public/ at runtime.
  return await (new Function('return import("/wasm/rumoca_bind_wasm.js")'))();
}

export async function createWasmControllerSource(
  modelSource: string,
  modelName: string,
  solver?: string,
): Promise<WasmControllerSource> {
  const mod = await loadWasmModule();
  await mod.default();
  mod.init();
  // WasmStepper constructor accepts an optional solver hint
  // ("bdf" | "rk-like" | "auto"). Omitting it defaults to BDF.
  const stepper = new mod.WasmStepper(modelSource, modelName, solver);
  return new WasmControllerSource(stepper);
}
