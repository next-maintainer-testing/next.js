import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const host = '127.0.0.1';

async function getFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!port) throw new Error('Could not allocate a test port');
  return port;
}

async function run() {
  const port = await getFreePort();
  const child = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '--turbopack', '-H', host, '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', CI: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  let settled = false;
  let readyAt = null;
  let result = 2;
  let reason = 'Next.js did not produce a recognized result';

  const append = (chunk) => {
    output += chunk.toString();
    if (output.length > 200_000) output = output.slice(-200_000);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);

  const deadline = setTimeout(() => {
    if (!settled) {
      settled = true;
      result = 2;
      reason = 'Timed out waiting for Next.js startup';
    }
  }, 90_000);

  while (!settled) {
    const diagnostic = /Babel detected \(babel\.config\.js\)/i.test(output)
      && /experimental\.forceSwcTransforms/i.test(output)
      && /not yet\s+supported by Next\.js with Turbopack/i.test(output);
    if (diagnostic) {
      settled = true;
      result = 0;
      reason = 'Turbopack refused the Babel configuration despite experimental.forceSwcTransforms';
      break;
    }
    if (!readyAt && /\bReady in\b/i.test(output)) readyAt = Date.now();
    if (readyAt && Date.now() - readyAt >= 3_000 && child.exitCode === null) {
      settled = true;
      result = 1;
      reason = 'Turbopack remained running without the unsupported Babel/forceSwcTransforms diagnostic';
      break;
    }
    if (child.exitCode !== null) {
      settled = true;
      result = 2;
      reason = `Next.js exited unexpectedly with code ${child.exitCode}`;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  clearTimeout(deadline);
  process.exitCode = result;
  console.log(reason);
  console.log(output.trim());

  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await new Promise((resolve) => child.once('exit', resolve));
    }
  }
}

run().catch((error) => {
  process.exitCode = 2;
  console.error(error);
});
