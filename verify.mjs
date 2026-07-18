import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import net from 'node:net';

const cwd = new URL('.', import.meta.url).pathname;
let server;
let outcome = 2;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      env: process.env,
      ...options,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code} signal ${signal}`));
    });
  });
}

async function availablePort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  listener.close();
  await once(listener, 'close');
  return port;
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next start exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Timed out waiting for Next.js server');
}

try {
  await rm(`${cwd}/.next`, { recursive: true, force: true });
  await run(process.execPath, ['node_modules/next/dist/bin/next', 'build']);

  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)],
    { cwd, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } },
  );

  await waitForServer(origin, server);
  const response = await fetch(`${origin}/make-req`);
  if (!response.ok) throw new Error(`/make-req returned ${response.status}`);
  const result = await response.json();

  if (result.traceparent == null) {
    console.log('SYMPTOM PRESENT: http.get did not inject traceparent');
    outcome = 0;
  } else if (/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/.test(result.traceparent)) {
    console.log(`SYMPTOM ABSENT: received traceparent ${result.traceparent}`);
    outcome = 1;
  } else {
    throw new Error(`Unexpected traceparent value: ${JSON.stringify(result.traceparent)}`);
  }
} catch (error) {
  console.error('CHECK FAILED:', error);
  outcome = 2;
} finally {
  process.exitCode = outcome;
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([
      once(server, 'exit'),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    if (server.exitCode === null) {
      server.kill('SIGKILL');
      await once(server, 'exit');
    }
  }
}
