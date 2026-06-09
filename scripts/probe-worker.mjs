// Run the actual rumoca_worker.js in Node's worker_threads, send it the
// same messages the rumoca-worker-client.ts sends in the browser, and
// report the exact response shape — this is the closest reproduction of
// what the tutorials do without spinning up a headless browser.

import { Worker } from 'node:worker_threads';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PROJECT = path.dirname(fileURLToPath(new URL('..', import.meta.url)));
const PROJECT_DIR = path.join(PROJECT, 'rumoca_website');

// The worker references `./rumoca_bind_wasm.js` relative to its own URL.
// Node's worker_threads doesn't serve files; we run the worker code with
// import.meta.url pointed at the public/wasm/ directory.
const workerSrc = readFileSync(`${PROJECT_DIR}/public/wasm/rumoca_worker.js`, 'utf8');

// Adapt browser-only refs (navigator, self.location) for Node.
const nodeAdapter = `
import { parentPort, threadId } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
Object.defineProperty(globalThis, 'self', {
  value: {
    location: { href: 'file://${PROJECT_DIR}/public/wasm/rumoca_worker.js' },
    postMessage: (msg) => parentPort.postMessage(msg),
    set onmessage(fn) { parentPort.on('message', (data) => fn({ data })); },
    get crossOriginIsolated() { return false; },
  },
});
Object.defineProperty(globalThis, 'navigator', {
  value: { hardwareConcurrency: 1 },
  configurable: true,
});
globalThis.performance = performance;
${workerSrc.replace(/^const workerUrl[\s\S]*?const withCacheBust[\s\S]*?;/, `
const withCacheBust = (path) => 'file://${PROJECT_DIR}/public/wasm/' + path.replace('./', '');
`)}
`;

// Write the polyfilled worker INTO public/wasm/ so the relative dynamic
// imports (./rumoca_bind_wasm.js etc.) resolve to the right files.
const tmp = `${PROJECT_DIR}/public/wasm/.probe-worker-instance.mjs`;
writeFileSync(tmp, nodeAdapter);

const worker = new Worker(tmp, { type: 'module' });
let nextId = 1;
const pending = new Map();

worker.on('message', (m) => {
  if (m.ready != null) {
    console.log(`worker ready: success=${m.success}`);
    return;
  }
  if (m.progress) return;
  const p = pending.get(m.id);
  if (!p) {
    console.log('unmatched response:', JSON.stringify(m).slice(0, 200));
    return;
  }
  pending.delete(m.id);
  if (m.error) p.reject(new Error(m.error));
  else p.resolve(m.result);
});

worker.on('error', (e) => console.error('worker error:', e));

function request(action, command, payload) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, action, command, payload });
  });
}

// Wait for ready signal then run the same calls a tutorial does.
const ready = new Promise((res) => worker.once('message', (m) => {
  if (m.ready) res(m.success);
}));
await ready;

const MODEL = `
model DoubleIntegrator
  parameter Real a = 1.0;
  Real x(start = 0.0);
  Real v(start = 0.0);
equation
  der(x) = v;
  der(v) = a;
end DoubleIntegrator;
`;

console.log('\n=== compile ===');
try {
  const dae = await request('workspaceCommand', 'rumoca.workspace.compile', {
    source: MODEL, modelName: 'DoubleIntegrator',
  });
  console.log(`compile ok, ${dae.length} chars`);
} catch (e) { console.error('compile failed:', e.message); }

console.log('\n=== simulate ===');
try {
  const raw = await request('projectCommand', 'rumoca.project.startSimulation', {
    source: MODEL, modelName: 'DoubleIntegrator', tEnd: 5, dt: 0.01, solver: 'auto',
  });
  console.log(`raw type: ${typeof raw}, length: ${raw?.length ?? '(no length)'}`);
  const parsed = JSON.parse(raw);
  const root = parsed.payload ?? parsed;
  console.log(`root keys:`, Object.keys(root));
  console.log(`root.names:`, root.names);
  console.log(`root.allData rows: ${root.allData?.length}, cols: ${root.allData?.[0]?.length}`);
} catch (e) { console.error('simulate failed:', e.message); }

console.log('\n=== getBuiltinTargets ===');
try {
  const t = await request('workspaceCommand', 'rumoca.workspace.getBuiltinTargets', {});
  console.log(`type: ${Array.isArray(t) ? 'array' : typeof t}`);
  if (Array.isArray(t)) {
    console.log(`length: ${t.length}, first item:`, JSON.stringify(t[0]).slice(0, 100));
  } else {
    console.log(`raw: ${String(t).slice(0, 200)}`);
  }
} catch (e) { console.error('getBuiltinTargets failed:', e.message); }

worker.terminate();
