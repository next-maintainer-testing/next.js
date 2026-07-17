import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';

const cwd = new URL('.', import.meta.url).pathname;
const nextBin = `${cwd}node_modules/next/dist/bin/next`;
const baseEnv = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

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

function request(port) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/', timeout: 2_000 },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      },
    );
    req.once('timeout', () => req.destroy(new Error('request timed out')));
    req.once('error', reject);
  });
}

async function waitForResponse(port, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next start exited early with code ${child.exitCode}`);
    }
    try {
      return await request(port);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error('next start did not become reachable within 30 seconds');
}

async function stop(child) {
  if (child.exitCode !== null) return;
  const closed = new Promise((resolve) => child.once('close', resolve));
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5_000);
  await closed;
  clearTimeout(timer);
}

let server;
try {
  await rm(`${cwd}.next`, { recursive: true, force: true });
  const buildEnv = { ...baseEnv, NODE_ENV: 'test' };
  const build = await run(process.execPath, [nextBin, 'build'], buildEnv);
  if (build.code !== 0) {
    throw new Error(`NODE_ENV=test next build failed (${build.code ?? build.signal})`);
  }

  const port = await reservePort();
  const startEnv = { ...baseEnv };
  delete startEnv.NODE_ENV;
  server = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd,
    env: startEnv,
    stdio: 'inherit',
  });
  server.once('error', (error) => console.error(error));

  const response = await waitForResponse(port, server);
  if (response.status === 404) {
    console.log('SYMPTOM PRESENT: GET / returned HTTP 404 after a NODE_ENV=test build.');
    process.exitCode = 0;
  } else if (response.status === 200 && response.body.includes('Issue 80050 page rendered:')) {
    console.log('SYMPTOM ABSENT: GET / returned HTTP 200 with the expected page.');
    process.exitCode = 1;
  } else {
    console.error(`CHECK FAILED: unexpected GET / response: HTTP ${response.status}`);
    process.exitCode = 2;
  }
} catch (error) {
  console.error('CHECK FAILED:', error);
  process.exitCode = 2;
} finally {
  if (server) await stop(server);
}
