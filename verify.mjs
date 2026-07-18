import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';

const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');
const internalPort = 3000;
const publicHost = 'public.example.test:3002';
let server;
let output = '';

function append(chunk) {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    delay(5000),
  ]);
  if (server.exitCode === null) {
    server.kill('SIGKILL');
    await new Promise((resolve) => server.once('exit', resolve));
  }
}

try {
  server = spawn(process.execPath, [nextBin, 'dev', '-H', '127.0.0.1', '-p', String(internalPort)], {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', append);
  server.stderr.on('data', append);

  const startedAt = Date.now();
  while (true) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${server.exitCode})\n${output}`);
    }
    try {
      const ready = await fetch(`http://127.0.0.1:${internalPort}/`);
      await ready.arrayBuffer();
      break;
    } catch {
      if (Date.now() - startedAt > 120000) throw new Error('Timed out waiting for Next.js');
      await delay(250);
    }
  }

  const response = await fetch(`http://127.0.0.1:${internalPort}/observe`, {
    headers: { Host: publicHost, Connection: 'close' },
  });
  await response.arrayBuffer();
  const requestUrl = response.headers.get('x-observed-request-url');
  const nextUrl = response.headers.get('x-observed-next-url');
  if (!requestUrl || !nextUrl) throw new Error('Middleware observation headers were missing');

  const internalOrigin = `http://localhost:${internalPort}`;
  const publicOrigin = `http://${publicHost}`;
  const symptomPresent = requestUrl.startsWith(internalOrigin) && nextUrl.startsWith(internalOrigin)
    && !requestUrl.startsWith(publicOrigin) && !nextUrl.startsWith(publicOrigin);

  console.log('\n--- verification observation ---');
  console.log(`Forwarded Host header: ${publicHost}`);
  console.log(`NextRequest.url: ${requestUrl}`);
  console.log(`NextRequest.nextUrl.href: ${nextUrl}`);
  console.log(`Reported symptom present: ${symptomPresent}`);

  process.exitCode = symptomPresent ? 0 : 1;
} catch (error) {
  console.error(error?.stack || error);
  process.exitCode = 2;
} finally {
  await stopServer();
}
