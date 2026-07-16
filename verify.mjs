import { rmSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';

const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname;
const markerStatic = 'This is static content';
const markerSuccess = 'Success!';
let server;
let serverClosed;

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: new URL('.', import.meta.url),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const append = (chunk) => {
      output += chunk.toString();
      if (output.length > 12000) output = output.slice(-12000);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Command timed out: ${command} ${args.join(' ')}\n${output}`));
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new Error(`Command exited ${code ?? signal}: ${command} ${args.join(' ')}\n${output}`));
    });
  });
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const { port } = socket.address();
      socket.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function get(port, path, headers = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    let staticAt = null;
    let successAt = null;
    let body = '';
    const request = http.get(
      { hostname: '127.0.0.1', port, path, headers },
      (response) => {
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
          const elapsed = performance.now() - started;
          if (staticAt === null && body.includes(markerStatic)) staticAt = elapsed;
          if (successAt === null && body.includes(markerSuccess)) successAt = elapsed;
        });
        response.once('end', () =>
          resolve({
            status: response.statusCode,
            contentType: response.headers['content-type'],
            staticAt,
            successAt,
            body,
          }),
        );
      },
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error('HTTP request timed out')));
    request.once('error', reject);
  });
}

async function waitForReady(port) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await get(port, '/', {}, 1000);
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Next.js server did not become ready');
}

async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([
    serverClosed,
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (server.exitCode === null && server.signalCode === null) {
    server.kill('SIGKILL');
    await serverClosed;
  }
}

async function main() {
  rmSync(new URL('./.next', import.meta.url), { recursive: true, force: true });
  const buildOutput = await run(process.execPath, [nextBin, 'build'], 180000);
  console.log(buildOutput.trim());

  const port = await availablePort();
  server = spawn(process.execPath, [nextBin, 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  const appendServerOutput = (chunk) => {
    serverOutput += chunk.toString();
    if (serverOutput.length > 8000) serverOutput = serverOutput.slice(-8000);
  };
  server.stdout.on('data', appendServerOutput);
  server.stderr.on('data', appendServerOutput);
  serverClosed = new Promise((resolve) => server.once('close', resolve));

  await waitForReady(port);

  const slug = `suspense-test-${process.pid}-${Date.now()}`;
  const routerTree = JSON.stringify(['', { children: ['__PAGE__', {}, '/'] }, null, null, true]);
  const result = await get(
    port,
    `/${slug}?_rsc=verify`,
    {
      Accept: 'text/x-component',
      RSC: '1',
      'Next-Router-State-Tree': routerTree,
      'Next-Url': '/',
    },
    20000,
  );

  if (result.status !== 200 || !result.contentType?.includes('text/x-component')) {
    throw new Error(`Unexpected navigation response (${result.status}, ${result.contentType}): ${result.body.slice(0, 1000)}\n${serverOutput}`);
  }
  if (result.staticAt === null || result.successAt === null) {
    throw new Error(`Navigation response lacked expected markers: ${result.body.slice(0, 2000)}\n${serverOutput}`);
  }

  const gap = result.successAt - result.staticAt;
  console.log(
    `Navigation timing: static marker ${Math.round(result.staticAt)}ms, success marker ${Math.round(result.successAt)}ms, gap ${Math.round(gap)}ms`,
  );

  if (result.staticAt >= 3500 && gap < 1000) {
    console.log('SYMPTOM_PRESENT: the static shell was withheld until the Suspense task completed.');
    process.exitCode = 0;
    return;
  }
  if (result.staticAt < 2500 && gap >= 2000) {
    console.log('SYMPTOM_ABSENT: the static shell streamed before the Suspense task completed.');
    process.exitCode = 1;
    return;
  }
  throw new Error(`Ambiguous streaming timing: static=${result.staticAt}ms success=${result.successAt}ms`);
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || error);
  process.exitCode = 2;
} finally {
  await stopServer();
}
