import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const projectDir = process.cwd();
const npmrcPath = join(projectDir, '.npmrc');
const nextBin = join(projectDir, 'node_modules', 'next', 'dist', 'bin', 'next');
let previousNpmrc;
let hadNpmrc = false;
let child;
let registryServer;
let tempDir;
let output = '';
let ready = false;
let requestMade = false;
let result = 2;
let detail = 'verification did not complete';

function append(chunk) {
  output += chunk.toString();
  if (output.length > 200_000) output = output.slice(-200_000);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}

function stopChild(proc) {
  if (!proc || proc.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (proc.exitCode === null) proc.kill('SIGKILL');
    }, 5000);
    proc.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    proc.kill('SIGTERM');
  });
}

try {
  try {
    previousNpmrc = await readFile(npmrcPath);
    hadNpmrc = true;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  registryServer = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ latest: '15.5.7', canary: '16.0.0-canary.0' }));
  });
  const registryPort = await listen(registryServer);
  await writeFile(npmrcPath, `registry=http://127.0.0.1:${registryPort}/\n`);

  tempDir = await mkdtemp(join(tmpdir(), 'next-registry-repro-'));
  const preloadPath = join(tempDir, 'blocked-registry.cjs');
  await writeFile(
    preloadPath,
    `const originalFetch = globalThis.fetch;\n` +
      `globalThis.fetch = function (input, init) {\n` +
      `  const url = typeof input === 'string' ? input : input && input.url;\n` +
      `  if (url === 'https://registry.npmjs.org/-/package/next/dist-tags') {\n` +
      `    return Promise.resolve(new Response('\\n<!DOCTYPE html><html><body>Corporate firewall</body></html>', { status: 200, headers: { 'content-type': 'text/html' } }));\n` +
      `  }\n` +
      `  return originalFetch.call(this, input, init);\n` +
      `};\n`
  );

  const portProbe = createServer();
  const devPort = await listen(portProbe);
  await new Promise((resolve) => portProbe.close(resolve));

  child = spawn(process.execPath, [nextBin, 'dev', '--turbopack', '--port', String(devPort)], {
    cwd: projectDir,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ` : ''}--require=${preloadPath}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', append);
  child.stderr.on('data', append);

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const parseFailure =
      output.includes('SyntaxError:') &&
      (output.includes("Unexpected token '<'") || output.includes('is not valid JSON'));
    if (parseFailure) {
      result = 0;
      detail = 'next dev emitted the reported JSON parse error after the hard-coded npm registry returned a firewall HTML page';
      break;
    }

    if (!ready && /[✓✔]\s*Ready in|Ready in/i.test(output)) ready = true;
    if (ready && !requestMade) {
      requestMade = true;
      try {
        await fetch(`http://127.0.0.1:${devPort}/`);
      } catch {
        // Startup output remains the primary observation.
      }
    }
    if (ready && requestMade) {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      const appeared =
        output.includes('SyntaxError:') &&
        (output.includes("Unexpected token '<'") || output.includes('is not valid JSON'));
      if (appeared) {
        result = 0;
        detail = 'next dev emitted the reported JSON parse error after the hard-coded npm registry returned a firewall HTML page';
      } else {
        result = 1;
        detail = 'next dev started and served the app without emitting the reported JSON parse error while the configured registry remained available';
      }
      break;
    }
    if (child.exitCode !== null) {
      result = 2;
      detail = `next dev exited unexpectedly with code ${child.exitCode}`;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (Date.now() >= deadline && result === 2) {
    detail = 'timed out waiting for next dev to become ready or emit the reported parse error';
  }
} catch (error) {
  result = 2;
  detail = `verification failed: ${error?.stack || error}`;
} finally {
  process.exitCode = result;
  await stopChild(child);
  if (registryServer) await new Promise((resolve) => registryServer.close(resolve));
  if (hadNpmrc) await writeFile(npmrcPath, previousNpmrc);
  else {
    try {
      await unlink(npmrcPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  const tail = output.slice(-5000).replace(/\x1b\[[0-9;]*m/g, '');
  console.log(`${detail}\n--- next dev output (tail) ---\n${tail}`);
}
