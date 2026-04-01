/**
 * Simulation source abstraction.
 * Both WASM Controller and Autopilot modes expose the same interface.
 */

export interface SimulationSource {
  readonly mode: 'wasm-controller' | 'autopilot';
  readonly connected: boolean;
  readonly armed: boolean;
  readonly time: number;
  get(name: string): number | undefined;
  setInput(name: string, value: number): void;
  step(dt: number): void;
  reset(): void;
  dispose(): void;
}

/**
 * WASM Controller source: runs plant + controller in-browser via WasmStepper.
 */
export class WasmControllerSource implements SimulationSource {
  readonly mode = 'wasm-controller' as const;
  readonly connected = true;
  readonly armed = true;

  private stepper: any; // WasmStepper instance
  private modelSource: string;
  private modelName: string;
  private static readonly MAX_SUB_DT = 0.002;

  get time(): number {
    return this.stepper?.time() ?? 0;
  }

  constructor(stepper: any, modelSource: string, modelName: string) {
    this.stepper = stepper;
    this.modelSource = modelSource;
    this.modelName = modelName;
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

/**
 * Dynamically load the rumoca_bind_wasm module from /wasm/.
 * Uses a script tag to avoid Vite/Rollup trying to resolve it at build time.
 */
async function loadWasmModule(): Promise<any> {
  // The module self-registers on import; we use dynamic import at runtime
  const mod = await (new Function('return import("/wasm/rumoca_bind_wasm.js")'))();
  return mod;
}

/**
 * Initialize WASM and create a WasmControllerSource.
 */
export async function createWasmControllerSource(
  modelSource: string,
  modelName: string,
): Promise<WasmControllerSource> {
  const mod = await loadWasmModule();
  await mod.default(); // init WASM binary
  mod.init();          // rumoca_init (panic hooks)
  const stepper = new mod.WasmStepper(modelSource, modelName);
  return new WasmControllerSource(stepper, modelSource, modelName);
}

/**
 * Autopilot source: plant runs in WASM, exchanges data with proxy via WebSocket.
 *
 * Data flow each frame:
 *   1. Apply motor commands received from autopilot (via proxy WebSocket)
 *   2. Step the plant physics
 *   3. Read sensor outputs (gyro, accel, mag) from stepper
 *   4. Send sensors + RC channels over WebSocket to proxy
 *   5. Proxy forwards to autopilot via UDP (FlatBuffers)
 */
export class AutopilotSource implements SimulationSource {
  readonly mode = 'autopilot' as const;
  private stepper: any;
  private ws: WebSocket | null = null;
  private _connected = false;
  private latestMotors: Record<string, number> = {};
  private rcChannels: Record<string, number> = {};
  private wsUrl: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  get connected(): boolean {
    return this._connected;
  }

  get armed(): boolean {
    return (this.latestMotors['armed'] ?? 0) !== 0;
  }

  get time(): number {
    return this.stepper?.time() ?? 0;
  }

  constructor(stepper: any, wsUrl: string = 'ws://localhost:8081') {
    this.stepper = stepper;
    this.wsUrl = wsUrl;
    this.connect();
  }

  private connect(): void {
    if (this.disposed) return;
    try {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => {
        this._connected = true;
      };
      this.ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'motors') {
            this.latestMotors = data;
          }
        } catch { /* ignore parse errors */ }
      };
      this.ws.onclose = () => {
        this._connected = false;
        if (!this.disposed) {
          this.reconnectTimer = setTimeout(() => this.connect(), 2000);
        }
      };
      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this._connected = false;
      if (!this.disposed) {
        this.reconnectTimer = setTimeout(() => this.connect(), 2000);
      }
    }
  }

  get(name: string): number | undefined {
    return this.stepper?.get(name) ?? undefined;
  }

  setInput(name: string, value: number): void {
    this.stepper?.set_input(name, value);
  }

  /**
   * Set RC channel values that will be sent to the autopilot.
   * Channel names follow sil_config.toml convention: rc_0..rc_15
   */
  setRC(channels: Record<string, number>): void {
    Object.assign(this.rcChannels, channels);
  }

  private static readonly MAX_SUB_DT = 0.002; // match rumoca_sil

  /** Step the plant, apply motor commands, send sensors to proxy. */
  step(dt: number): void {
    // Apply latest motor commands from autopilot
    for (const [key, val] of Object.entries(this.latestMotors)) {
      if (key !== 'type' && key !== 'armed' && typeof val === 'number') {
        try { this.stepper?.set_input(key, val); } catch { /* variable may not exist */ }
      }
    }

    // Sub-step at max 2ms to match rumoca_sil stability
    const nSteps = Math.max(1, Math.ceil(dt / AutopilotSource.MAX_SUB_DT));
    const subDt = dt / nSteps;
    for (let i = 0; i < nSteps; i++) {
      this.stepper?.step(subDt);
    }

    // Send sensor data + RC channels to proxy
    if (this.ws?.readyState === WebSocket.OPEN) {
      const msg: Record<string, any> = { type: 'sensors' };
      // IMU sensors
      for (const name of ['gyro_x', 'gyro_y', 'gyro_z', 'accel_x', 'accel_y', 'accel_z', 'mag_x', 'mag_y', 'mag_z']) {
        msg[name] = this.stepper?.get(name) ?? 0;
      }
      // RC channels
      Object.assign(msg, this.rcChannels);
      msg.rc_valid = true;
      msg.imu_valid = true;
      msg.rc_link_quality = 255;
      this.ws.send(JSON.stringify(msg));
    }
  }

  reset(): void {
    this.stepper?.reset();
    this.latestMotors = {};
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.stepper?.free();
    this.stepper = null;
  }
}

/**
 * Initialize WASM and create an AutopilotSource with a plant-only model.
 */
export async function createAutopilotSource(
  modelSource: string,
  modelName: string,
  wsUrl?: string,
): Promise<AutopilotSource> {
  const mod = await loadWasmModule();
  await mod.default();
  mod.init();
  const stepper = new mod.WasmStepper(modelSource, modelName);
  return new AutopilotSource(stepper, wsUrl);
}
