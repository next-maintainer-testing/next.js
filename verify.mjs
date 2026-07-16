import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';

const cwd = new URL('.', import.meta.url).pathname;
const port = 32000 + (process.pid % 1000);
const dataPort = 34000 + (process.pid % 1000);
const host = `kek.localhost:${port}`;
const childEnv = {
  ...process.env,
  DATA_URL: `http://127.0.0.1:${dataPort}/data`,
  NEXT_TELEMETRY_DISABLED: '1',
};
let server = null;
let dataServer = null;
let dataRequests = 0;

function run(command, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const append = (chunk) => {
      output += chunk.toString();
      if (output.length > 20000) output = output.slice(-20000);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, output });
    });
  });
}

async function startDataServer() {
  dataServer = createServer((_request, response) => {
    dataRequests += 1;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ request: dataRequests }));
  });
  await new Promise((resolve, reject) => {
    dataServer.once('error', reject);
    dataServer.listen(dataPort, '127.0.0.1', resolve);
  });
}

function startNextServer() {
  server = spawn('npm', ['run', 'start', '--', '-p', String(port)], {
    cwd,
    env: childEnv,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const append = (chunk) => {
    output += chunk.toString();
    if (output.length > 20000) output = output.slice(-20000);
  };
  server.stdout.on('data', append);
  server.stderr.on('data', append);
  return () => output;
}

async function stopServers() {
  if (server && server.exitCode === null) {
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        try { process.kill(-server.pid, 'SIGKILL'); } catch {}
      }, 3000);
      server.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
      try { process.kill(-server.pid, 'SIGTERM'); } catch { resolve(); }
    });
  }
  if (dataServer) {
    await new Promise((resolve) => dataServer.close(resolve));
  }
}

function request(hostHeader) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/',
      method: 'GET',
      headers: hostHeader ? { host: hostHeader } : {},
    });
    req.once('error', reject);
    req.once('response', (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.once('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          status: response.statusCode,
          cache: response.headers['x-nextjs-cache'] ?? null,
          cacheControl: response.headers['cache-control'] ?? null,
          hash: createHash('sha256').update(body).digest('hex').slice(0, 12),
          containsTenantData: body.includes('Data request:'),
        });
      });
    });
    req.end();
  });
}

async function waitUntilReady(getOutput) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`next start exited early (${server.exitCode})\n${getOutput()}`);
    }
    try {
      const ready = await request();
      if (ready.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`next start did not become ready\n${getOutput()}`);
}

let resultCode = 2;
try {
  await rm(new URL('.next', import.meta.url), { recursive: true, force: true });
  await startDataServer();
  const build = await run('npm', ['run', 'build'], 180000);
  if (build.code !== 0) {
    throw new Error(`next build failed (${build.code ?? build.signal})\n${build.output}`);
  }

  const getServerOutput = startNextServer();
  await waitUntilReady(getServerOutput);

  const first = await request(host);
  const second = await request(host);
  console.log(JSON.stringify({ first, second, dataRequests }, null, 2));

  if (
    first.status !== 200 ||
    second.status !== 200 ||
    !first.containsTenantData ||
    !second.containsTenantData
  ) {
    throw new Error(`unexpected tenant response; server output:\n${getServerOutput()}`);
  }

  const symptomPresent = second.cache !== 'HIT';
  console.log(
    symptomPresent
      ? 'SYMPTOM PRESENT: repeated rewritten request was not an ISR cache HIT'
      : 'SYMPTOM ABSENT: repeated rewritten request was an ISR cache HIT',
  );
  resultCode = symptomPresent ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  resultCode = 2;
} finally {
  process.exitCode = resultCode;
  await stopServers();
}
