import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const port = 32157;
const baseUrl = `http://127.0.0.1:${port}`;
const nextCli = resolve('node_modules/next/dist/bin/next');
let server;
let serverExited;
let output = '';

function remember(chunk) {
  output += chunk.toString();
  if (output.length > 30000) output = output.slice(-30000);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function waitForReady() {
  const deadline = Date.now() + 90000;
  let lastError;
  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(`Next.js exited before becoming ready.\n${output}`);
    }
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) return await response.text();
      lastError = new Error(`Readiness GET returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`Next.js did not become ready: ${lastError}\n${output}`);
}

async function waitForExit(milliseconds) {
  let timer;
  try {
    return await Promise.race([
      serverExited.then(() => true),
      new Promise((resolveWait) => {
        timer = setTimeout(() => resolveWait(false), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function stopServer() {
  if (!server) return;
  if (server.exitCode === null && server.signalCode === null) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {}
  }
  if (!(await waitForExit(5000))) {
    try {
      process.kill(-server.pid, 'SIGKILL');
    } catch {}
    await waitForExit(5000);
  }
}

try {
  server = spawn(process.execPath, [nextCli, 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', remember);
  server.stderr.on('data', remember);
  serverExited = new Promise((resolveExit) => server.once('exit', resolveExit));

  const html = await waitForReady();
  const marker = html.indexOf('incrementAction');
  if (marker < 0) throw new Error('Rendered page did not contain incrementAction');
  const candidates = html.slice(Math.max(0, marker - 1500), marker).match(/[0-9a-f]{32,128}/g);
  const actionId = candidates?.at(-1);
  if (!actionId) throw new Error('Could not extract the rendered server action ID');

  const response = await fetch(`${baseUrl}/`, {
    method: 'POST',
    headers: {
      Accept: 'text/x-component',
      'Content-Type': 'text/plain;charset=UTF-8',
      'Next-Action': actionId,
      Origin: 'http://localhost:3333',
      'X-Forwarded-Host': 'localhost',
      'X-Forwarded-Port': '3333',
    },
    body: '[0]',
  });
  const body = await response.text();

  if (response.status === 500 && body.includes('Invalid Server Actions request')) {
    console.log(`SYMPTOM_PRESENT: forwarded Server Action failed with HTTP 500 and Invalid Server Actions request. action=${actionId}`);
    process.exitCode = 0;
  } else if (response.status === 200 && /^1:1$/m.test(body)) {
    console.log(`SYMPTOM_ABSENT: forwarded Server Action returned incremented value 1. action=${actionId}`);
    process.exitCode = 1;
  } else {
    console.error(`CHECK_FAILED: unexpected Server Action response HTTP ${response.status}\n${body}\nServer output:\n${output}`);
    process.exitCode = 2;
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error?.stack || error}\nServer output:\n${output}`);
  process.exitCode = 2;
} finally {
  if (process.exitCode === undefined) process.exitCode = 2;
  await stopServer();
}
