import { spawn } from 'node:child_process';
import net from 'node:net';

const host = '127.0.0.1';
const port = await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, host, () => {
    const { port } = server.address();
    server.close((error) => error ? reject(error) : resolve(port));
  });
});

const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', host, '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', (chunk) => { logs += chunk; });
child.stderr.on('data', (chunk) => { logs += chunk; });

let result = 2;
try {
  const deadline = Date.now() + 120_000;
  let response;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited early with ${child.exitCode}`);
    try {
      response = await fetch(`http://${host}:${port}/`);
      if (response.ok) break;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!response?.ok) throw lastError ?? new Error('Server did not become ready');
  const html = await response.text();
  const style = html.match(/<style\b[^>]*data-precedence=["']bar["'][^>]*data-href=["']foo["'][^>]*>/i)?.[0]
    ?? html.match(/<style\b[^>]*data-href=["']foo["'][^>]*data-precedence=["']bar["'][^>]*>/i)?.[0];
  if (!style) throw new Error(`Expected hoisted style tag was not found in HTML: ${html.slice(0, 1000)}`);
  const noncePresent = /\bnonce=["']12345["']/i.test(style);
  console.log(`Observed SSR style opening tag: ${style}`);
  console.log(noncePresent ? 'Nonce is preserved (symptom absent).' : 'Nonce is stripped (symptom present).');
  result = noncePresent ? 1 : 0;
} catch (error) {
  console.error(error?.stack ?? error);
  console.error(logs.slice(-4000));
  result = 2;
}

process.exitCode = result;
if (child.exitCode === null) child.kill('SIGTERM');
await new Promise((resolve) => {
  if (child.exitCode !== null) return resolve();
  const timer = setTimeout(() => {
    if (child.exitCode === null) child.kill('SIGKILL');
  }, 5000);
  child.once('close', () => {
    clearTimeout(timer);
    resolve();
  });
});
