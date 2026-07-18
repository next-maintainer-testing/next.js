import { spawn, spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import net from 'node:net';

const sentinel = 'search-params-repro-59407';

function reservePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const { port } = listener.address();
      listener.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await new Promise((resolve) => child.once('exit', resolve));
  }
}

let server;
try {
  await rm('.next', { recursive: true, force: true });
  const build = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: 'inherit',
    timeout: 240_000,
  });
  if (build.error || build.status !== 0) {
    console.error('Verification failed: next build did not complete successfully.', build.error ?? `exit ${build.status}`);
    process.exitCode = 2;
  } else {
    const port = await reservePort();
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
        NEXT_PRIVATE_MINIMAL_MODE: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logs = '';
    server.stdout.on('data', (chunk) => { logs += chunk; process.stdout.write(chunk); });
    server.stderr.on('data', (chunk) => { logs += chunk; process.stderr.write(chunk); });

    let response;
    let lastError;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (server.exitCode !== null) break;
      try {
        response = await fetch(`http://127.0.0.1:${port}/?id=${sentinel}`);
        if (response.ok) break;
        lastError = new Error(`HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    if (!response?.ok) {
      console.error('Verification failed: production server did not return the page.', lastError, logs);
      process.exitCode = 2;
    } else {
      const html = await response.text();
      const searchParamWasDiscarded = !html.includes(sentinel);
      console.log(searchParamWasDiscarded
        ? 'Symptom present: a direct production page reload discarded the id search parameter.'
        : 'Symptom absent: the server-rendered production response contains the id search parameter.');
      process.exitCode = searchParamWasDiscarded ? 0 : 1;
    }
  }
} catch (error) {
  console.error('Verification failed unexpectedly.', error);
  process.exitCode = 2;
} finally {
  await stop(server);
}
