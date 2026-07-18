import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const port = 3300 + (process.pid % 500);
const debugPort = 9300 + (process.pid % 500);
const baseUrl = `http://127.0.0.1:${port}`;
let server;
let browser;
let cdp;
let userDataDir;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await wait(250);
  }
  throw new Error(`Server did not become ready: ${lastError}`);
}

function findChrome() {
  const explicit = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const path of explicit) if (existsSync(path)) return path;

  const root = join(homedir(), '.cache', 'ms-playwright');
  if (existsSync(root)) {
    for (const versionDir of readdirSync(root).sort().reverse()) {
      for (const relative of [
        'chrome-linux64/chrome',
        'chrome-linux/chrome',
        'chrome-headless-shell-linux64/chrome-headless-shell',
        'chrome-headless-shell-linux/headless_shell',
      ]) {
        const candidate = join(root, versionDir, relative);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  throw new Error('No Chromium executable found');
}

async function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('CDP WebSocket failed')), { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
      return;
    }
    for (const listener of listeners.get(message.method) ?? []) listener(message.params);
  });

  return {
    on(method, listener) {
      const current = listeners.get(method) ?? [];
      current.push(listener);
      listeners.set(method, current);
    },
    send(method, params = {}) {
      const id = nextId++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    close() {
      ws.close();
    },
  };
}

async function main() {
  await run(process.execPath, [join('node_modules', 'next', 'dist', 'bin', 'next'), 'build'], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  });

  server = spawn(
    process.execPath,
    [join('node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(port)],
    { env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  server.stdout.on('data', (chunk) => process.stdout.write(chunk));
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));
  await waitForHttp(baseUrl, 30_000);

  userDataDir = mkdtempSync(join(tmpdir(), 'next-62678-chrome-'));
  browser = spawn(findChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userDataDir}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  browser.stderr.on('data', () => {});

  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`, 15_000);
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const target = targets.find((entry) => entry.type === 'page');
  if (!target) throw new Error('No Chromium page target found');
  cdp = await connectCdp(target.webSocketDebuggerUrl);

  const messages = [];
  let delayedChunk = null;
  let topNavigations = 0;
  cdp.on('Runtime.consoleAPICalled', ({ args }) => {
    messages.push(args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
  });
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    messages.push(exceptionDetails.exception?.description ?? exceptionDetails.text ?? 'Unknown exception');
  });
  cdp.on('Page.frameNavigated', ({ frame }) => {
    if (!frame.parentId) topNavigations += 1;
  });
  cdp.on('Fetch.requestPaused', ({ requestId, request, resourceType }) => {
    if (resourceType === 'Script' && /\/_next\/static\/chunks\/pages\/about-[^/]+\.js(?:\?|$)/.test(request.url)) {
      delayedChunk = request.url;
      setTimeout(() => cdp.send('Fetch.continueRequest', { requestId }).catch(() => {}), 8_000);
    } else {
      cdp.send('Fetch.continueRequest', { requestId }).catch(() => {});
    }
  });

  await Promise.all([
    cdp.send('Page.enable'),
    cdp.send('Runtime.enable'),
    cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }),
  ]);
  await cdp.send('Page.navigate', { url: baseUrl });

  const readyDeadline = Date.now() + 15_000;
  while (Date.now() < readyDeadline) {
    const result = await cdp.send('Runtime.evaluate', {
      expression: `document.readyState === 'complete' && !!document.querySelector('button')`,
      returnByValue: true,
    });
    if (result.result.value) break;
    await wait(200);
  }
  const click = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('button'); if (!button) return false; button.click(); return true; })()`,
    returnByValue: true,
  });
  if (!click.result.value) throw new Error('Navigation button was not found');

  await wait(10_000);
  const routeError = messages.find((message) => message.includes('Route did not complete loading'));
  const finalLocation = await cdp.send('Runtime.evaluate', {
    expression: 'location.href', returnByValue: true,
  }).catch(() => ({ result: { value: 'unavailable' } }));

  if (!delayedChunk) throw new Error(`The /about route chunk was not requested; messages=${JSON.stringify(messages)}`);
  if (routeError) {
    console.log(JSON.stringify({ symptom: 'Route did not complete loading', delayedChunk, routeError, topNavigations, finalLocation: finalLocation.result.value }));
    process.exitCode = 0;
  } else {
    console.log(JSON.stringify({ symptom: 'absent', delayedChunk, messages, topNavigations, finalLocation: finalLocation.result.value }));
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? error);
  process.exitCode = 2;
} finally {
  if (cdp) cdp.close();
  if (browser && browser.exitCode === null) {
    browser.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => browser.once('exit', resolve)), wait(3_000)]);
    if (browser.exitCode === null) browser.kill('SIGKILL');
  }
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => server.once('exit', resolve)), wait(3_000)]);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
}
