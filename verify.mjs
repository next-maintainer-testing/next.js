import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const connectionFile = path.join(root, 'database', 'connect.js');
const marker = 'ISSUE_45483_DATABASE_CONNECTION_CREATED';
let output = '';
let child;
let originalSource;
let result = 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function markerCount() {
  return output.split(marker).length - 1;
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!port) throw new Error('Could not reserve a local port');
  return port;
}

async function fetchPage(url, deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  let lastError;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`next dev exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const body = await response.text();
      if (response.status === 200 && body.includes('Database connection')) return;
      lastError = new Error(`Unexpected HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(300);
  }
  throw new Error(`Page did not become ready: ${lastError?.message ?? 'unknown error'}`);
}

async function waitForAdditionalConnection(previousCount, deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (markerCount() > previousCount) return true;
    if (child && child.exitCode !== null) {
      throw new Error(`next dev exited early with code ${child.exitCode}`);
    }
    await sleep(100);
  }
  return false;
}

async function waitForExit(proc, timeoutMs) {
  if (proc.exitCode !== null || proc.signalCode !== null) return true;
  let timer;
  const exited = once(proc, 'exit').then(() => true);
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const didExit = await Promise.race([exited, timedOut]);
  clearTimeout(timer);
  return didExit;
}

try {
  originalSource = await readFile(connectionFile, 'utf8');
  const port = await reservePort();
  const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
  child = spawn(process.execPath, [nextBin, 'dev', '-p', String(port)], {
    cwd: root,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    output += text;
    process.stdout.write(text);
  });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    output += text;
    process.stderr.write(text);
  });

  const pageUrl = `http://127.0.0.1:${port}/`;
  await fetchPage(`${pageUrl}?verify=initial`, 90000);
  if (!(await waitForAdditionalConnection(0, 15000))) {
    throw new Error('The initial request did not instantiate the connection');
  }
  await sleep(1000);

  let before = markerCount();
  await writeFile(connectionFile, `${originalSource}\n// verifier refresh 1\n`);
  await fetchPage(`${pageUrl}?verify=refresh-1`, 60000);
  const firstRefreshCreatedConnection = await waitForAdditionalConnection(before, 15000);

  before = markerCount();
  await writeFile(connectionFile, `${originalSource}\n// verifier refresh 2\n`);
  await fetchPage(`${pageUrl}?verify=refresh-2`, 60000);
  const secondRefreshCreatedConnection = await waitForAdditionalConnection(before, 15000);

  if (firstRefreshCreatedConnection && secondRefreshCreatedConnection) {
    console.log(`SYMPTOM_PRESENT: each Fast Refresh created a new connection (${markerCount()} total runtime creations)`);
    result = 0;
  } else {
    console.log(`SYMPTOM_ABSENT: connection creation after refreshes was ${firstRefreshCreatedConnection}/${secondRefreshCreatedConnection}`);
    result = 1;
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error?.stack ?? error}`);
  result = 2;
} finally {
  process.exitCode = result;
  if (originalSource !== undefined) {
    try {
      await writeFile(connectionFile, originalSource);
    } catch (error) {
      console.error(`CHECK_FAILED_TO_RESTORE: ${error?.message ?? error}`);
      process.exitCode = 2;
    }
  }
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    if (!(await waitForExit(child, 10000))) {
      child.kill('SIGKILL');
      await waitForExit(child, 5000);
    }
  }
}
