import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';

const cwd = process.cwd();
const nextBin = path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next');
let server;
let output = '';
let ready = false;

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBin, ...args], {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve({ code, signal }));
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.on('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address();
      socket.close(() => resolve(address.port));
    });
  });
}

async function waitUntilReady(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`next start exited before becoming ready (${server.exitCode})\n${output}`);
    }
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`next start did not become ready\n${output}`);
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([
    once(server, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (server.exitCode === null) {
    server.kill('SIGKILL');
    await once(server, 'exit');
  }
}

function captureOutput(chunk, stream) {
  const text = String(chunk);
  output = (output + text).slice(-12000);
  if (/ready/i.test(text)) ready = true;
  stream.write(chunk);
}

try {
  const build = await run(['build']);
  if (build.code !== 0) {
    throw new Error(`next build failed with code ${build.code ?? build.signal}`);
  }

  const port = await freePort();
  server = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => captureOutput(chunk, process.stdout));
  server.stderr.on('data', (chunk) => captureOutput(chunk, process.stderr));
  server.on('error', (error) => {
    output = (output + `\n${error.stack || error}`).slice(-12000);
  });

  await waitUntilReady(30000);
  const response = await fetch(`http://127.0.0.1:${port}/unknown`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.text();
  const localizedCustomNotFound = body.includes('LOCALIZED_CUSTOM_NOT_FOUND');
  const standardNotFound = body.includes('This page could not be found');

  console.log(JSON.stringify({
    mode: 'next start',
    requestedPath: '/unknown',
    expectedRewrite: '/en/unknown',
    status: response.status,
    localizedCustomNotFound,
    standardNotFound,
  }));

  if (response.status !== 404) {
    throw new Error(`Expected HTTP 404, received ${response.status}`);
  }
  if (localizedCustomNotFound) {
    process.exitCode = 1;
  } else if (standardNotFound) {
    process.exitCode = 0;
  } else {
    throw new Error('404 response contained neither the localized custom marker nor the standard Next.js 404 marker');
  }
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 2;
} finally {
  await stopServer();
}
