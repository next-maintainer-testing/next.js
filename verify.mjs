import { spawn } from 'node:child_process';
import net from 'node:net';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
let server = null;

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBin, ...args], {
      cwd: root,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`next ${args[0]} failed (${signal ?? `exit ${code}`})`));
    });
  });
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address();
      socket.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForServer(url, child) {
  let lastError;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (child.exitCode !== null) {
      throw new Error(`next start exited before becoming ready (exit ${child.exitCode})`);
    }
    try {
      const response = await fetch(url);
      await response.arrayBuffer();
      if (response.ok) return;
      lastError = new Error(`readiness request returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`next start did not become ready: ${lastError?.message ?? 'timeout'}`);
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (server.exitCode === null) {
    server.kill('SIGKILL');
    await new Promise((resolve) => server.once('exit', resolve));
  }
}

try {
  await rm(path.join(root, '.next'), { recursive: true, force: true });
  await run(['build']);

  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: root,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  await waitForServer(`${origin}/`, server);

  const rscUrl = `${origin}/?_rsc=etag-verification`;
  const requestHeaders = { RSC: '1' };
  const first = await fetch(rscUrl, { headers: requestHeaders });
  await first.arrayBuffer();

  const etag = first.headers.get('etag');
  const secondHeaders = etag
    ? { ...requestHeaders, 'If-None-Match': etag }
    : requestHeaders;
  const second = await fetch(rscUrl, { headers: secondHeaders });
  await second.arrayBuffer();

  const contentType = first.headers.get('content-type') ?? '';
  const isPrerendered = first.headers.get('x-nextjs-prerender') === '1';
  if (first.status !== 200 || !contentType.startsWith('text/x-component') || !isPrerendered) {
    throw new Error(
      `check precondition failed: status=${first.status}, content-type=${contentType || '<missing>'}, x-nextjs-prerender=${first.headers.get('x-nextjs-prerender') ?? '<missing>'}`,
    );
  }

  const reproduced = !etag && second.status === 200;
  console.log(JSON.stringify({
    route: '/',
    responseType: 'RSC',
    prerendered: isPrerendered,
    firstStatus: first.status,
    etag: etag ?? null,
    secondStatus: second.status,
    conditionalSecondRequest: Boolean(etag),
    symptomPresent: reproduced,
  }));
  process.exitCode = reproduced ? 0 : 1;
} catch (error) {
  console.error(error?.stack ?? error);
  process.exitCode = 2;
} finally {
  await stopServer();
}
