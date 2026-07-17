import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function request(port, pathname, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      host: '127.0.0.1',
      port,
      path: pathname,
      headers: { Accept: 'text/html' },
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`${pathname} returned HTTP ${res.statusCode}: ${body.slice(0, 500)}`));
          return;
        }
        resolve(body);
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`${pathname} timed out`)));
    req.on('error', reject);
  });
}

function readBackendId(html, pathname) {
  const match = html.match(/<div id="backend-id">([^<]+)(?:<!-- -->)?<\/div>/);
  if (!match) throw new Error(`No backend ID was rendered for ${pathname}`);
  return match[1];
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise((resolve) => child.once('close', resolve));
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  const graceful = await Promise.race([closed.then(() => true), sleep(10000).then(() => false)]);
  if (!graceful && child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
    await closed;
  }
}

const port = await reservePort();
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
  cwd: process.cwd(),
  detached: true,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', (chunk) => { logs = (logs + chunk).slice(-12000); });
child.stderr.on('data', (chunk) => { logs = (logs + chunk).slice(-12000); });

try {
  const deadline = Date.now() + 120000;
  while (true) {
    if (child.exitCode !== null) throw new Error(`next dev exited with code ${child.exitCode}`);
    try {
      await request(port, '/', 5000);
      break;
    } catch (error) {
      if (Date.now() >= deadline) throw new Error(`next dev did not become ready: ${error.message}`);
      await sleep(500);
    }
  }

  const paths = ['/', '/a', '/b', '/'];
  const ids = [];
  for (const pathname of paths) {
    ids.push(readBackendId(await request(port, pathname), pathname));
  }

  const distinct = new Set(ids);
  const symptomPresent = distinct.size > 1;
  process.exitCode = symptomPresent ? 0 : 1;
  console.log(JSON.stringify({ symptomPresent, paths, backendIds: ids, distinctBackendIds: distinct.size }));
} catch (error) {
  process.exitCode = 2;
  console.error(error.stack || error.message || String(error));
  if (logs) console.error(`next dev output:\n${logs}`);
} finally {
  await stop(child);
}
