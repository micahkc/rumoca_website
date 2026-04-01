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
      const { id, success, result, error } = e.data;
      if (id == null) return;
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

  async renderTemplate(daeJson: string, template: string): Promise<string> {
    await this.ready;
    return this.request('workspaceCommand', 'rumoca.workspace.renderTemplate', { daeJson, template });
  }

  async getVersion(): Promise<string> {
    await this.ready;
    return this.request('workspaceCommand', 'rumoca.workspace.getVersion', {});
  }

  async getBuiltinTemplates(): Promise<string> {
    await this.ready;
    return this.request('workspaceCommand', 'rumoca.workspace.getBuiltinTemplates', {});
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
