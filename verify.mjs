import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const cwd = process.cwd();
const nextBin = path.join(cwd, 'node_modules', '.bin', 'next');
const logPath = path.join(cwd, '.cache-set-keys.log');
let serverChild = null;

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, NODE_ENV: 'production' } });
    let output = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`timed out: ${command} ${args.join(' ')}`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.on('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address();
      socket.close(() => resolve(address.port));
    });
  });
}

function waitUntilReady(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`next start did not become ready\n${output}`)), timeoutMs);
    const onData = (chunk) => {
      output += chunk;
      if (/Ready in|started server|Local:/i.test(output)) {
        clearTimeout(timer);
        resolve(output);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('close', (code) => {
      clearTimeout(timer);
      reject(new Error(`next start exited early (${code})\n${output}`));
    });
  });
}

async function stopServer() {
  if (!serverChild || serverChild.exitCode !== null) return;
  const child = serverChild;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5000);
    child.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

try {
  await fs.rm(path.join(cwd, '.next'), { recursive: true, force: true });
  await fs.rm(logPath, { force: true });

  const build = await run(nextBin, ['build'], 180_000);
  if (build.code !== 0) {
    throw new Error(`next build failed (${build.code})\n${build.output}`);
  }

  const manifest = JSON.parse(await fs.readFile(path.join(cwd, '.next', 'prerender-manifest.json'), 'utf8'));
  if (!manifest.routes['/'] || !manifest.routes['/xpto']) {
    throw new Error(`both routes were not prerendered: ${Object.keys(manifest.routes).join(', ')}`);
  }

  // Observe startup population separately from any build-time cache activity.
  await fs.rm(logPath, { force: true });
  const port = await getFreePort();
  serverChild = spawn(nextBin, ['start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd,
    env: { ...process.env, NODE_ENV: 'production' },
  });
  await waitUntilReady(serverChild, 45_000);
  await new Promise((resolve) => setTimeout(resolve, 1500));

  let keys;
  try {
    keys = (await fs.readFile(logPath, 'utf8')).split('\n').filter(Boolean);
  } catch (error) {
    if (error.code === 'ENOENT') keys = [];
    else throw error;
  }

  const hasNested = keys.includes('/xpto');
  const hasRoot = keys.includes('/') || keys.includes('/index');
  if (!hasNested) {
    throw new Error(`startup cache population did not write /xpto; observed keys: ${JSON.stringify(keys)}`);
  }

  process.exitCode = hasRoot ? 1 : 0;
  console.log(JSON.stringify({ symptom: !hasRoot, prerendered: ['/', '/xpto'], startupCacheKeys: keys }));
  await stopServer();
} catch (error) {
  process.exitCode = 2;
  console.error(error instanceof Error ? error.stack : error);
  await stopServer();
}
