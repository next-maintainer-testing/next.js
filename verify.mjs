import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import net from 'node:net';

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const closed = new Promise((resolve) => child.once('close', resolve));
  if (await Promise.race([closed.then(() => true), delay(5000).then(() => false)])) return;
  child.kill('SIGKILL');
  await closed;
}

await rm('.next', { recursive: true, force: true });
const port = await reservePort();
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let logs = '';
child.stdout.on('data', (chunk) => { logs += chunk; });
child.stderr.on('data', (chunk) => { logs += chunk; });

let html;
let failure;
try {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next dev exited early (${child.exitCode})`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(10000) });
      if (response.ok) {
        html = await response.text();
        break;
      }
    } catch {}
    await delay(500);
  }
  if (html === undefined) throw new Error('Timed out waiting for the rendered page');

  const lazy = html.includes('data-child-type="Symbol(react.lazy)"');
  const element = html.includes('data-child-type="Symbol(react.transitional.element)"') ||
    html.includes('data-child-type="Symbol(react.element)"');

  if (lazy) {
    console.log('Symptom present: the plain button child was rendered as Symbol(react.lazy).');
    process.exitCode = 0;
  } else if (element) {
    console.log('Symptom absent: the plain button child retained a React element type.');
    process.exitCode = 1;
  } else {
    throw new Error(`Rendered page did not expose a recognized child type. HTML excerpt: ${html.slice(0, 1000)}`);
  }
} catch (error) {
  failure = error;
  process.exitCode = 2;
  console.error(error.stack || error);
  console.error(logs.slice(-4000));
} finally {
  if (process.exitCode === undefined) process.exitCode = failure ? 2 : 2;
  await stop(child);
}
