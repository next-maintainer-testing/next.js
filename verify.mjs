import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, readdir } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import puppeteer from 'puppeteer';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`${command} terminated by ${signal}`));
      else resolve(code);
    });
  });
}

async function ensureBrowserExecutable() {
  const executablePath = puppeteer.executablePath();
  try {
    await access(executablePath);
    return executablePath;
  } catch {
    const installCode = await run(process.execPath, ['./node_modules/puppeteer/install.mjs'], {
      env: { ...process.env },
    });
    if (installCode !== 0) throw new Error(`Pinned Chrome download exited with ${installCode}`);
  }

  // Some minimal CI filesystems retain Puppeteer's downloaded archive but do
  // not finish extraction. Extract that exact pinned browser if necessary.
  const installDirectory = path.dirname(path.dirname(executablePath));
  const productDirectory = path.dirname(installDirectory);
  const version = path.basename(installDirectory).replace(/^linux-/, '');
  const archives = (await readdir(productDirectory)).filter(
    (name) => name.startsWith(`${version}-`) && name.endsWith('.zip'),
  );
  if (archives.length !== 1) throw new Error(`Could not locate pinned Chrome archive for ${version}`);
  const unzipCode = await run('unzip', ['-oq', path.join(productDirectory, archives[0]), '-d', installDirectory]);
  if (unzipCode !== 0) throw new Error(`Chrome archive extraction exited with ${unzipCode}`);
  await access(executablePath);
  return executablePath;
}

async function freePort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`next start exited with ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for next start');
}

function installDevToolsObservation() {
  window.__linkCommitObservations = [];
  let rendererId = 0;

  function componentName(fiber) {
    const type = fiber?.type;
    if (typeof type === 'function') return type.displayName || type.name || 'anonymous';
    if (type && typeof type === 'object') {
      const render = type.render;
      return type.displayName || render?.displayName || render?.name || 'object-component';
    }
    return typeof type === 'string' ? type : null;
  }

  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(renderer) {
      const id = ++rendererId;
      this.renderers.set(id, renderer);
      return id;
    },
    onCommitFiberRoot(_id, root) {
      let anchor = null;
      const stack = [root.current];
      while (stack.length) {
        const fiber = stack.pop();
        if (!fiber) continue;
        if (fiber.type === 'a' && fiber.memoizedProps?.children === 'Static header link') anchor = fiber;
        if (fiber.sibling) stack.push(fiber.sibling);
        if (fiber.child) stack.push(fiber.child);
      }

      const ownerChain = [];
      let cursor = anchor?.return || null;
      for (let depth = 0; cursor && depth < 5; depth++, cursor = cursor.return) {
        ownerChain.push({
          tag: cursor.tag,
          name: componentName(cursor),
          flags: cursor.flags,
          rendered: Boolean(cursor.flags & 1),
        });
      }
      const owner = ownerChain.find((entry) => entry.tag === 0 || entry.tag === 11);
      window.__linkCommitObservations.push({
        anchorFound: Boolean(anchor),
        linkOwnerName: owner?.name ?? null,
        linkOwnerRendered: owner?.rendered ?? false,
        linkOwnerFlags: owner?.flags ?? null,
        reviewIndex: document.querySelector('#review-index')?.dataset.index ?? null,
      });
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
  };
}

let server;
let browser;
let resultCode = 2;

try {
  const buildCode = await run('npm', ['run', 'build'], { env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  if (buildCode !== 0) throw new Error(`next build exited with ${buildCode}`);

  const port = await freePort();
  server = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.pipe(process.stdout);
  server.stderr.pipe(process.stderr);

  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url, server);

  browser = await puppeteer.launch({
    executablePath: await ensureBrowserExecutable(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(installDevToolsObservation);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#review-index')?.dataset.index === '2');
  await new Promise((resolve) => setTimeout(resolve, 250));

  const observation = await page.evaluate(() => ({
    reviewIndex: document.querySelector('#review-index')?.dataset.index || null,
    commits: window.__linkCommitObservations,
  }));
  const stateUpdateCommits = observation.commits.filter((commit) => commit.reviewIndex === '1' || commit.reviewIndex === '2');

  if (observation.reviewIndex !== '2' || observation.commits.length === 0 || !observation.commits.some((commit) => commit.anchorFound) || stateUpdateCommits.length < 2) {
    throw new Error(`Instrumentation failed: ${JSON.stringify(observation)}`);
  }

  const reproduced = stateUpdateCommits.some((commit) => commit.linkOwnerRendered);
  console.log(JSON.stringify({ symptom: 'static next/link fiber re-rendered during independent client state updates', reproduced, observation }));
  resultCode = reproduced ? 0 : 1;
} catch (error) {
  console.error(error?.stack || error);
  resultCode = 2;
} finally {
  process.exitCode = resultCode;
  if (browser) await browser.close();
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([
      once(server, 'exit'),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (server.exitCode === null) {
      server.kill('SIGKILL');
      await once(server, 'exit');
    }
  }
}
