import { spawn } from 'node:child_process';
import net from 'node:net';

const ERROR = /TypeError: Cannot read properties of undefined \(reading ['"]0['"]\)[\s\S]*OuterLayoutRouter|OuterLayoutRouter[\s\S]*TypeError: Cannot read properties of undefined \(reading ['"]0['"]\)/;
const timeoutMs = 180_000;
let output = '';
let child;

function append(chunk) {
  output += chunk.toString();
  if (output.length > 500_000) output = output.slice(-500_000);
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function stop() {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const timer = new Promise((resolve) => setTimeout(resolve, 5_000, 'timeout'));
  if (await Promise.race([exited, timer]) === 'timeout' && child.exitCode === null) {
    child.kill('SIGKILL');
    await exited;
  }
}

try {
  const port = await freePort();
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', append);
  child.stderr.on('data', append);

  const deadline = Date.now() + timeoutMs;
  let status = null;
  let body = '';
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js dev server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      status = response.status;
      body = await response.text();
      if (status >= 500 || status === 200) break;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (status === null) throw new Error(`Next.js dev server did not respond: ${lastError ?? 'timeout'}`);

  await new Promise((resolve) => setTimeout(resolve, 750));
  const evidence = `${body}\n${output}`;
  const reproduced = status === 500 && ERROR.test(evidence);
  console.log(JSON.stringify({
    route: '/',
    status,
    reproduced,
    observed: reproduced
      ? "HTTP 500 with TypeError: Cannot read properties of undefined (reading '0') at OuterLayoutRouter"
      : `No matching OuterLayoutRouter TypeError (HTTP ${status})`,
  }));
  process.exitCode = reproduced ? 0 : 1;
} catch (error) {
  console.error(error?.stack || error);
  console.error(output.slice(-20_000));
  process.exitCode = 2;
} finally {
  await stop();
}
