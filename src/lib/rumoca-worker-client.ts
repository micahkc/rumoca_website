type PendingRequest = {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
};

export class RumocaClient {
  private worker: Worker;
  private pending: Map<number, PendingRequest> = new Map();
  private nextId = 1;
  ready: Promise<void>;

  constructor() {
    this.worker = new Worker('/wasm/rumoca_worker.js', { type: 'module' });
    this.ready = new Promise((resolve, reject) => {
      const onReady = (e: MessageEvent) => {
        if (e.data.ready) {
          this.worker.removeEventListener('message', onReady);
          if (e.data.success) {
            resolve();
          } else {
            reject(new Error('WASM initialization failed'));
          }
        }
      };
      this.worker.addEventListener('message', onReady);
    });

    this.worker.addEventListener('message', (e: MessageEvent) => {
      const { id, success, result, error, progress } = e.data;
      if (id == null) return;
      // The new rumoca worker emits per-request progress events
      // (`{id, progress: true, kind, phase, ...}`); ignore them — only the
      // terminal `success`/`error` message should resolve the pending entry.
      if (progress) return;
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      if (success) {
        pending.resolve(result);
      } else {
        pending.reject(new Error(error || 'Unknown worker error'));
      }
    });
  }

  private request(action: string, command: string, payload: Record<string, any> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, action, command, payload });
    });
  }

  async compile(source: string, modelName = 'Model'): Promise<string> {
    await this.ready;
    return this.request('workspaceCommand', 'rumoca.workspace.compile', { source, modelName });
  }

  /**
   * Render a compiled DAE through a built-in target (e.g., "casadi", "sympy").
   *
   * The new rumoca API returns `{ ok: true, files: [{filename, content}, ...] }`.
   * For tutorial display we flatten to a single string — the bare content if
   * there's one file, or concatenated with `// --- filename ---` headers when
   * multiple.
   */
  async renderTarget(daeJson: string, modelName: string, target: string): Promise<string> {
    await this.ready;
    const result = await this.request(
      'workspaceCommand',
      'rumoca.workspace.renderTarget',
      { daeJson, modelName, target, manifest: '', templates: '{}' },
    );
    const files: { filename: string; content: string }[] = result?.files ?? [];
    if (files.length === 0) return '';
    if (files.length === 1) return files[0].content;
    return files
      .map((f) => `// ─── ${f.filename} ───\n${f.content}`)
      .join('\n\n');
  }

  async getVersion(): Promise<string> {
    await this.ready;
    return this.request('workspaceCommand', 'rumoca.workspace.getVersion', {});
  }

  /** Returns a JSON-encoded array of built-in target names (casadi, sympy, …). */
  async getBuiltinTargets(): Promise<string> {
    await this.ready;
    return this.request('workspaceCommand', 'rumoca.workspace.getBuiltinTargets', {});
  }

  async simulate(source: string, modelName = 'Model', tEnd = 1.0, dt = 0, solver = 'auto'): Promise<string> {
    await this.ready;
    return this.request('projectCommand', 'rumoca.project.startSimulation', {
      source, modelName, tEnd, dt, solver,
    });
  }
}

let instance: RumocaClient | null = null;
export function getRumocaClient(): RumocaClient {
  if (!instance) {
    instance = new RumocaClient();
  }
  return instance;
}
