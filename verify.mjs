import { rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const timeoutMs = 240_000;
const port = 32000 + (process.pid % 1000);
await rm('.next', { recursive: true, force: true });

const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  detached: process.platform !== 'win32',
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
let spawnError;
let closed = false;
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(text);
  });
}
child.once('error', (error) => { spawnError = error; });
const closePromise = new Promise((resolve) => child.once('close', (code, signal) => {
  closed = true;
  resolve({ code, signal });
}));

const deadline = Date.now() + timeoutMs;
let responseStatus;
let responseBody = '';
while (Date.now() < deadline && !closed) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    responseStatus = response.status;
    responseBody = await response.text();
    break;
  } catch {
    await sleep(500);
  }
}

// Let the development server flush the runtime error and stack trace.
if (responseStatus !== undefined) await sleep(1000);

try {
  if (!closed) {
    if (process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM');
    else child.kill('SIGTERM');
  }
} catch {}
let closeResult = await Promise.race([closePromise, sleep(5000).then(() => null)]);
if (!closeResult && !closed) {
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
    else child.kill('SIGKILL');
  } catch {}
  closeResult = await closePromise;
}

const evidence = `${output}\n${responseBody}`.replace(/\u001b\[[0-9;]*m/g, '');
const symptom = /createContext only works in Client Components/i.test(evidence)
  && /next(?:\/dist\/client\/router|\/router|router-context)/i.test(evidence);

if (symptom && responseStatus === 500) {
  console.log('\nVERIFY: reproduced the reported createContext/next router runtime error');
  process.exitCode = 0;
} else if (responseStatus === 200) {
  console.log('\nVERIFY: page rendered without the reported symptom');
  process.exitCode = 1;
} else {
  console.error(`\nVERIFY: check failed without the reported symptom (HTTP ${responseStatus ?? 'unavailable'}; ${spawnError ?? `server exit ${closeResult?.code}, signal ${closeResult?.signal}`})`);
  process.exitCode = 2;
}

await rm('.next', { recursive: true, force: true });
