import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import process from 'node:process';

const port = 32000 + (process.pid % 1000);
const origin = `http://127.0.0.1:${port}`;
let server;
let output = '';
let resultCode = 2;

function record(chunk) {
  output += chunk.toString();
  if (output.length > 16000) output = output.slice(-16000);
}

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (${server.exitCode})\n${output}`);
    }
    try {
      await fetch(origin);
      return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Next.js\n${output}`);
}

async function request(sort) {
  const response = await fetch(`${origin}/api/cache-map?sort=${sort}`);
  if (!response.ok) throw new Error(`HTTP ${response.status} for sort=${sort}`);
  const body = await response.json();
  if (!Array.isArray(body.data)) throw new Error(`Invalid response for sort=${sort}: ${JSON.stringify(body)}`);
  return body.data;
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ]);
  if (server.exitCode === null) {
    server.kill('SIGKILL');
    await new Promise((resolve) => server.once('exit', resolve));
  }
}

try {
  await rm('.next', { recursive: true, force: true });
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', record);
  server.stderr.on('data', record);

  await waitForServer();
  const ascending = ['apple', 'banana', 'cherry', 'dragonfruit'];
  const descending = [...ascending].reverse();
  const first = await request('asc');
  const second = await request('desc');

  if (JSON.stringify(first) !== JSON.stringify(ascending)) {
    throw new Error(`Unexpected ascending response: ${JSON.stringify(first)}`);
  }

  if (JSON.stringify(second) === JSON.stringify(first)) {
    console.log(`Symptom reproduced: Map arguments collide in unstable_cache; desc returned ${JSON.stringify(second)} after asc.`);
    resultCode = 0;
  } else if (JSON.stringify(second) === JSON.stringify(descending)) {
    console.log(`Symptom absent: desc returned ${JSON.stringify(second)} after asc.`);
    resultCode = 1;
  } else {
    throw new Error(`Unexpected descending response: ${JSON.stringify(second)}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  if (output) console.error(`Next.js output:\n${output}`);
  resultCode = 2;
} finally {
  process.exitCode = resultCode;
  await stopServer();
}
