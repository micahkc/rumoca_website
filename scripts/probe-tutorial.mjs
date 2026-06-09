// Drive a real Chromium against a tutorial page, click Simulate, and
// capture exactly what console.error / setError reports — the most direct
// way to reproduce what the user sees in the browser.

import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

const dev = spawn('npm', ['run', 'dev'], { cwd: process.cwd() });
let port = null;
dev.stdout.on('data', (b) => {
  const m = b.toString().match(/Local\s+http:\/\/localhost:(\d+)/);
  if (m && !port) { port = m[1]; }
});
dev.stderr.on('data', (b) => process.stderr.write(b));

// Wait for the server to print its port.
const tStart = Date.now();
while (!port && Date.now() - tStart < 20000) await wait(200);
if (!port) { console.error('dev server never reported a port'); process.exit(1); }
console.log(`dev on http://localhost:${port}`);

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();

const logs = [];
page.on('console', (msg) => logs.push(`[page:${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
page.on('requestfailed', (req) => logs.push(`[requestfailed] ${req.url()} — ${req.failure()?.errorText}`));
page.on('workercreated', (worker) => {
  logs.push(`[workercreated] ${worker.url()}`);
  worker.on('console', (msg) => logs.push(`[worker:${msg.type()}] ${msg.text()}`));
});

await page.goto(`http://localhost:${port}/tutorials/getting-started/first-model`, { waitUntil: 'networkidle0', timeout: 30000 });

// Wait for the Simulate button to leave the "Loading..." state.
console.log('waiting for Simulate button to be ready...');
try {
  await page.waitForFunction(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.some((b) => b.textContent?.trim() === 'Simulate' && !b.disabled);
  }, { timeout: 30000 });
  console.log('Simulate button is enabled — clicking');
} catch (e) {
  console.error('Simulate button never enabled:', e.message);
  console.log('--- console messages ---');
  console.log(logs.join('\n'));
  await browser.close();
  dev.kill('SIGINT');
  process.exit(1);
}

// First: click the actual Simulate button and verify the React UI succeeds.
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === 'Simulate',
  );
  btn?.click();
});
// Wait for either a canvas (success) or an error message.
try {
  await page.waitForFunction(() => {
    const err = document.querySelector('.text-red-500')?.textContent?.trim();
    return Boolean(err) || document.querySelector('canvas') !== null;
  }, { timeout: 30000 });
} catch {}
const result = await page.evaluate(() => ({
  err: document.querySelector('.text-red-500')?.textContent?.trim() ?? null,
  canvases: document.querySelectorAll('canvas').length,
}));
console.log('\n=== React UI after Simulate click ===');
console.log(JSON.stringify(result, null, 2));

// Then: also probe the raw worker stream for completeness.
const workerResponse = await page.evaluate(async () => {
  const w = new Worker('/wasm/rumoca_worker.js', { type: 'module' });
  // Wait for ready
  await new Promise((resolve) => {
    const onReady = (e) => {
      if (e.data.ready) {
        w.removeEventListener('message', onReady);
        resolve();
      }
    };
    w.addEventListener('message', onReady);
  });
  const events = [];
  const responsePromise = new Promise((resolve) => {
    w.addEventListener('message', (e) => {
      if (e.data.id !== 42) return;
      events.push(JSON.stringify(e.data).slice(0, 200));
      // The terminal message has success or error.
      if (e.data.success !== undefined || e.data.error !== undefined) {
        resolve({
          events,
          finalSuccess: e.data.success,
          finalResultType: typeof e.data.result,
          finalResultLen: typeof e.data.result === 'string' ? e.data.result.length : null,
        });
      }
    });
  });
  w.postMessage({
    id: 42,
    action: 'projectCommand',
    command: 'rumoca.project.startSimulation',
    payload: {
      source: `model DoubleIntegrator
  parameter Real a = 1.0;
  Real x(start = 0.0);
  Real v(start = 0.0);
equation
  der(x) = v;
  der(v) = a;
end DoubleIntegrator;`,
      modelName: 'DoubleIntegrator',
      tEnd: 5,
      dt: 0.01,
      solver: 'auto',
    },
  });
  return responsePromise;
});
console.log('\n=== Worker raw response ===');
console.log(JSON.stringify(workerResponse, null, 2));

console.log('\n=== Worker events only ===');
console.log(logs.filter((l) => l.startsWith('[worker') || l.startsWith('[pageerror]') || l.startsWith('[requestfailed]')).join('\n'));

await browser.close();
dev.kill('SIGINT');
