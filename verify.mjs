import { spawn } from 'node:child_process';
import { chmod, mkdir, rm } from 'node:fs/promises';
import net from 'node:net';

const cwd = new URL('.', import.meta.url).pathname;
const forbidden = new URL('./docker-data/postgres/', import.meta.url).pathname;
const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname;

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await new Promise(resolve => child.once('exit', resolve));
  }
}

let child;
let output = '';
let outcome = 2;
try {
  await rm(new URL('./.next/', import.meta.url), { recursive: true, force: true });
  await mkdir(forbidden, { recursive: true });
  await chmod(cwd, 0o777);
  await chmod(forbidden, 0o000);
  const port = await reservePort();
  const dropPrivileges = typeof process.getuid === 'function' && process.getuid() === 0;
  child = spawn(process.execPath, [nextBin, 'dev', '--turbopack', '-H', '127.0.0.1', '-p', String(port)], {
    cwd,
    env: { ...process.env, CI: '1', NEXT_TELEMETRY_DISABLED: '1' },
    uid: dropPrivileges ? 65534 : undefined,
    gid: dropPrivileges ? 65534 : undefined,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const append = chunk => { output += chunk.toString(); };
  child.stdout.on('data', append);
  child.stderr.on('data', append);

  const deadline = Date.now() + 60000;
  let requested = false;
  while (Date.now() < deadline) {
    if (/Permission denied \(os error 13\)/.test(output) &&
        /TurbopackInternalError/.test(output) &&
        /instrumentation/.test(output) &&
        /docker-data[\\/]postgres/.test(output)) {
      outcome = 0;
      break;
    }
    if (!requested && /Ready in|✓ Ready/.test(output)) {
      requested = true;
      fetch(`http://127.0.0.1:${port}/`).catch(() => {});
    }
    if (child.exitCode !== null || child.signalCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (outcome !== 0 && (requested || /Ready in|✓ Ready/.test(output))) outcome = 1;
  if (outcome === 2) console.error('Verifier could not conclusively start or observe the dev server.');
  console.log(output.slice(-12000));
} catch (error) {
  console.error(error);
  outcome = 2;
} finally {
  process.exitCode = outcome;
  if (child) await stop(child);
  try { await chmod(forbidden, 0o755); } catch {}
}
