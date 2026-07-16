import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import net from 'node:net';
import path from 'node:path';

const root = process.cwd();
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const marker = 'PUBLISHED_POST_71440';
let status = 'PUBLISHED';
let backend = null;
let server = null;
let outcome = 2;
let observation = 'check did not complete';

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function containsRobotsNoindex(html) {
  return (html.match(/<meta\b[^>]*>/gi) || []).some(
    (tag) =>
      /\bname=["']robots["']/i.test(tag) &&
      /\bcontent=["'][^"']*noindex[^"']*["']/i.test(tag)
  );
}

async function availablePort() {
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const address = socket.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  socket.close();
  await once(socket, 'close');
  return port;
}

async function startBackend() {
  backend = createServer((request, response) => {
    if (request.url !== '/posts/71440') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: 'not found' }));
      return;
    }
    if (status !== 'PUBLISHED') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: 'draft post is not public' }));
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ id: 71440, status }));
  });
  backend.listen(0, '127.0.0.1');
  await once(backend, 'listening');
  const address = backend.address();
  if (typeof address !== 'object' || !address) {
    throw new Error('backend did not bind a TCP port');
  }
  return `http://127.0.0.1:${address.port}`;
}

async function runBuild(environment) {
  const child = spawn(process.execPath, [nextBin, 'build'], {
    cwd: root,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const [code, signal] = await once(child, 'close');
  if (code !== 0) {
    throw new Error(
      `next build failed (${signal || code})\n${output.slice(-6000)}`
    );
  }
}

async function request(url) {
  const response = await fetch(url, {
    headers: { accept: 'text/html' },
    redirect: 'manual',
  });
  return { status: response.status, body: await response.text() };
}

async function waitUntilReady(url) {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      return await request(url);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`next start was not ready: ${lastError || 'timeout'}`);
}

async function pollFor(url, predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await delay(1100);
    const result = await request(url);
    if (predicate(result)) return result;
  }
  return null;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, 'close');
  child.kill('SIGTERM');
  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
  }, 5000);
  await closed;
  clearTimeout(timer);
}

async function stopBackend() {
  if (!backend?.listening) return;
  backend.close();
  await once(backend, 'close');
}

try {
  status = 'PUBLISHED';
  await rm(path.join(root, '.next'), { recursive: true, force: true });
  const backendOrigin = await startBackend();
  const environment = {
    ...process.env,
    BACKEND_ORIGIN: backendOrigin,
    NEXT_TELEMETRY_DISABLED: '1',
  };
  await runBuild(environment);

  const port = await availablePort();
  const postUrl = `http://127.0.0.1:${port}/posts/71440`;
  server = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: root,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  server.stdout.on('data', (chunk) => (serverOutput += chunk));
  server.stderr.on('data', (chunk) => (serverOutput += chunk));

  const initial = await waitUntilReady(postUrl);
  if (initial.status !== 200 || !initial.body.includes(marker)) {
    throw new Error(
      `initial PUBLISHED request did not populate a successful ISR page (status=${initial.status})\n${serverOutput.slice(-3000)}`
    );
  }

  status = 'DRAFT';
  const draft = await pollFor(
    postUrl,
    (result) => result.status === 404 && containsRobotsNoindex(result.body)
  );
  if (!draft) {
    throw new Error(
      `ISR did not regenerate the populated page as a noindex 404\n${serverOutput.slice(-3000)}`
    );
  }

  status = 'PUBLISHED';
  const published = await pollFor(
    postUrl,
    (result) => result.body.includes(marker)
  );
  if (!published) {
    throw new Error(
      `ISR did not regenerate published post content after the 404\n${serverOutput.slice(-3000)}`
    );
  }

  if (containsRobotsNoindex(published.body)) {
    outcome = 0;
    observation = `symptom present: regenerated published HTML retained robots noindex (HTTP ${published.status})`;
  } else {
    outcome = 1;
    observation = `symptom absent: regenerated published HTML omitted robots noindex (HTTP ${published.status})`;
  }
} catch (error) {
  outcome = 2;
  observation = `check failure: ${error?.stack || error}`;
} finally {
  process.exitCode = outcome;
  await stopChild(server);
  await stopBackend();
  console.log(observation);
}
