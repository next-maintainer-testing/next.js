import { spawn } from 'node:child_process';
import net from 'node:net';

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function waitForExit(child, milliseconds) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ]);
}

function decodeHtml(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

let child;
let resultCode = 2;
let observation = 'check did not complete';

try {
  const port = await reservePort();
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk; });
  child.stderr.on('data', (chunk) => { logs += chunk; });

  const deadline = Date.now() + 120_000;
  let html;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before serving the route (${child.exitCode}): ${logs.slice(-2000)}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/top-level/foo/var`);
      if (response.ok) {
        html = await response.text();
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (!html) throw new Error(`Timed out waiting for the route: ${logs.slice(-2000)}`);
  const match = html.match(/<p id="parallel-params">([^<]*)<\/p>/);
  if (!match) throw new Error(`Rendered response omitted the parallel parameter marker: ${html.slice(0, 2000)}`);

  const params = JSON.parse(decodeHtml(match[1]));
  const segments = params?.segments;
  observation = `parallel catch-all params: ${JSON.stringify(params)}`;
  if (!Array.isArray(segments)) throw new Error(`Invalid params payload: ${JSON.stringify(params)}`);

  resultCode = JSON.stringify(segments) === JSON.stringify(['top-level', 'foo', 'var']) ? 0 : 1;
} catch (error) {
  observation = error?.stack || String(error);
  resultCode = 2;
} finally {
  process.exitCode = resultCode;
  console.log(observation);
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    await waitForExit(child, 10_000);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await waitForExit(child, 10_000);
    }
  }
}
