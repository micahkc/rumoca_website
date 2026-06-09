// Reproduces the `new WasmStepper(...)` call from the browser in a Node
// harness so we can see the Rust panic backtrace (console_error_panic_hook
// prints to stderr) when the constructor traps with "unreachable executed".
//
// Usage: node scripts/probe-stepper.mjs [QuadrotorAcro|Rover]

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const PROJECT_DIR = new URL('..', import.meta.url).pathname;

const which = process.argv[2] ?? 'QuadrotorAcro';

function loadModelFromTs(filename) {
  const raw = readFileSync(`${PROJECT_DIR}/src/data/aircraft/${filename}`, 'utf8');
  const m = raw.match(/String\.raw`([\s\S]*?)`;/);
  if (!m) throw new Error(`Could not extract model source from ${filename}`);
  return m[1];
}

const sources = {
  QuadrotorAcro: { src: loadModelFromTs('quadrotor-acro-model.ts'),     name: 'QuadrotorAcro', solver: 'rk-like' },
  FixedWing:     { src: loadModelFromTs('fixedwing-controller-model.ts'), name: 'FixedWing',     solver: 'rk-like' },
  Rover:         { src: loadModelFromTs('rover-model.ts'),              name: 'Rover',         solver: undefined },
};
const target = sources[which];
if (!target) throw new Error(`Unknown model: ${which}`);
console.log(`Probing ${target.name} (source length: ${target.src.length}, solver: ${target.solver ?? 'default (bdf)'})`);

// Polyfill: rumoca's loadWasmModule uses console.log to extract progress lines;
// nothing to do here.

const wasmJsPath = `${PROJECT_DIR}/public/wasm/rumoca_bind_wasm.js`;
const wasmBinPath = `${PROJECT_DIR}/public/wasm/rumoca_bind_wasm_bg.wasm`;
const mod = await import(pathToFileURL(wasmJsPath));

const wasmBytes = readFileSync(wasmBinPath);
await mod.default({ module_or_path: wasmBytes });
mod.wasm_init(0); // single-threaded in Node
mod.init();

console.log(`rumoca version: ${mod.get_version()}`);

const t0 = performance.now();
try {
  const stepper = new mod.WasmStepper(target.src, target.name, target.solver);
  const dt = performance.now() - t0;
  console.log(`✓ Stepper created in ${dt.toFixed(1)} ms`);
  console.log('inputs:', stepper.input_names());
  const names = JSON.parse(stepper.variable_names());
  console.log(`variables (${names.length}):`, names.slice(0, 20).join(', '), names.length > 20 ? '…' : '');
  try {
    stepper.step(0.001);
    console.log(`✓ One step ok, t=${stepper.time()}`);
  } catch (e) {
    console.error('✗ step() failed:', e?.message ?? e);
  }
  // Stress-test reset path. The old impl rebuilt the stepper (~7s); the
  // in-place reset should be milliseconds.
  try {
    const tResetA = performance.now();
    stepper.reset();
    const dtReset = performance.now() - tResetA;
    console.log(`✓ reset() in ${dtReset.toFixed(1)} ms, t=${stepper.time()}`);
  } catch (e) {
    console.error('✗ reset() failed:', e?.message ?? e);
  }
  if (target.name === 'QuadrotorAcro') {
    // Simulate one second of "armed + full throttle" and check it climbs.
    stepper.set_input('armed', 1);
    stepper.set_input('stick_throttle', 1.0);
    const z0 = stepper.get('position[3]');
    for (let i = 0; i < 1000; i++) stepper.step(0.001);
    const z1 = stepper.get('position[3]');
    const omega = stepper.get('omega_m[1]');
    console.log(`After 1.0s @ armed=1, throttle=1.0:`);
    console.log(`  position[3]: ${z0.toFixed(3)} → ${z1.toFixed(3)} m  (Δ = ${(z1 - z0).toFixed(3)})`);
    console.log(`  omega_m[1]:  ${omega.toFixed(1)} rad/s`);
    console.log(z1 > z0 + 0.5 ? '  ✓ DRONE CLIMBED' : '  ✗ drone did not climb significantly');
  }
  if (process.argv.includes('--probe-names')) {
    const candidates = [
      'position[1]', 'position[2]', 'position[3]',
      'velocity[1]', 'quat[1]', 'quat[2]', 'omega_m[1]', 'armed',
      'vehicle.position[1]', 'vehicle.quat[1]', 'vehicle.omega_m[1]',
      'vehicle.p[1]', 'vehicle.p[2]', 'vehicle.p[3]',
      'vehicle.attitude.q[1]',
    ];
    console.log('Lookups via .get():');
    for (const n of candidates) {
      const v = stepper.get(n);
      console.log(`  ${n.padEnd(28)} = ${v === undefined ? '<undef>' : v}`);
    }
    const all = JSON.parse(stepper.variable_names());
    const topLevel = all.filter((n) => !n.includes('.') && /(position|quat|velocity|omega_m|accel|gyro|mag)/.test(n));
    const vehiclePub = all.filter((n) => /^vehicle\.(position|quat|velocity|omega_m|accel|gyro|mag)/.test(n));
    console.log(`top-level matching: ${topLevel.join(', ') || '<none>'}`);
    console.log(`vehicle.<pub> matching: ${vehiclePub.join(', ') || '<none>'}`);
  }
} catch (e) {
  const dt = performance.now() - t0;
  console.error(`✗ new WasmStepper failed after ${dt.toFixed(1)} ms:`);
  console.error(e?.stack ?? e?.message ?? e);
  process.exit(1);
}
