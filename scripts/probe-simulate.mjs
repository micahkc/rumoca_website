// Reproduces what the tutorial CompileWidget/SimulationViewer does — load
// rumoca WASM, call simulate_model on a tiny Modelica model, parse the
// response, and see exactly what shape comes back.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PROJECT_DIR = new URL('..', import.meta.url).pathname;
const wasmJsPath = `${PROJECT_DIR}/public/wasm/rumoca_bind_wasm.js`;
const wasmBinPath = `${PROJECT_DIR}/public/wasm/rumoca_bind_wasm_bg.wasm`;

const mod = await import(pathToFileURL(wasmJsPath));
const wasmBytes = readFileSync(wasmBinPath);
await mod.default({ module_or_path: wasmBytes });
mod.wasm_init(0);
mod.init();

console.log(`rumoca version: ${mod.get_version()}`);
console.log(`available exports related to simulate:`,
  Object.keys(mod).filter((k) => k.includes('simulate') || k.includes('compile') || k.includes('render') || k.includes('builtin')).sort());

// Tiny model that the bouncing-ball tutorial uses.
const MODEL = `
model FreeFall
  Real h(start = 10);
  Real v(start = 0);
  parameter Real g = 9.81;
equation
  der(h) = v;
  der(v) = -g;
end FreeFall;
`;
const NAME = 'FreeFall';

console.log('\n=== compile_to_json ===');
let dae;
try {
  dae = mod.compile_to_json(MODEL, NAME);
  console.log(`compile ok, ${dae.length} chars`);
} catch (e) {
  console.error('compile failed:', e);
  process.exit(1);
}

console.log('\n=== simulate_model ===');
try {
  const raw = mod.simulate_model(MODEL, NAME, 1.0, 0.01, 'auto');
  const parsed = JSON.parse(raw);
  console.log(`top-level keys:`, Object.keys(parsed));
  if (parsed.payload) {
    console.log(`payload keys:`, Object.keys(parsed.payload));
    console.log(`payload.names: ${parsed.payload.names?.join(', ')}`);
    console.log(`payload.allData rows: ${parsed.payload.allData?.length}, cols: ${parsed.payload.allData?.[0]?.length}`);
  } else {
    console.log(`names: ${parsed.names?.join(', ')}`);
    console.log(`first 200 chars: ${raw.slice(0, 200)}`);
  }
} catch (e) {
  console.error('simulate failed:', e?.message ?? e);
  if (e?.stack) console.error(e.stack.split('\n').slice(0, 5).join('\n'));
  process.exit(1);
}

console.log('\n=== get_builtin_targets ===');
try {
  const t = mod.get_builtin_targets();
  console.log(`raw:`, t);
  console.log(`parsed:`, JSON.parse(t));
} catch (e) {
  console.error('get_builtin_targets failed:', e?.message ?? e);
}

console.log('\n=== render_target casadi ===');
try {
  const out = mod.render_target(dae, NAME, 'casadi', '', '{}');
  console.log(`type:`, typeof out, Array.isArray(out) ? 'array' : 'object');
  console.log(`keys:`, out && typeof out === 'object' ? Object.keys(out) : '(n/a)');
  if (out?.files) {
    console.log(`files (${out.files.length}):`, out.files.map((f) => `${f.filename} (${f.content.length} chars)`).join(', '));
    console.log(`\nfirst file head:\n${out.files[0].content.slice(0, 200)}`);
  } else {
    console.log(`full output (first 400 chars):`, JSON.stringify(out).slice(0, 400));
  }
} catch (e) {
  console.error('render_target failed:', e?.message ?? e);
  if (e?.stack) console.error(e.stack.split('\n').slice(0, 5).join('\n'));
}
