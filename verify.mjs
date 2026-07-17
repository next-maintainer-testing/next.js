import { spawn } from 'node:child_process';
import { access, mkdtemp, readdir, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const children = [];
let profileDir;
let cdp;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function findChrome() {
  const explicit = [
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const candidate of explicit) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }

  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(os.homedir(), '.cache', 'ms-playwright'),
  ].filter(Boolean);
  for (const root of roots) {
    try {
      const releases = (await readdir(root, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
        .reverse();
      for (const release of releases) {
        for (const relative of [
          'chrome-linux64/chrome',
          'chrome-linux/chrome',
          'chrome-headless-shell-linux64/chrome-headless-shell',
          'chrome-headless-shell-linux/headless_shell',
        ]) {
          const candidate = path.join(root, release, relative);
          try {
            await access(candidate);
            return candidate;
          } catch {}
        }
      }
    } catch {}
  }
  throw new Error('No Chromium executable was found');
}

async function waitForHttp(url, timeoutMs, output) {
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
    await delay(250);
  }
  throw new Error(`Next.js did not become ready: ${lastError?.message}\n${output()}`);
}

async function waitForJson(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Chromium debugging endpoint did not become ready: ${lastError?.message}`);
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.opened = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) || []) {
        listener(message.params);
      }
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  async send(method, params = {}) {
    await this.opened;
    const id = this.nextId++;
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 10000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(3000),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await new Promise((resolve) => child.once('exit', resolve));
  }
}

async function cleanup() {
  try { cdp?.close(); } catch {}
  for (const child of children.reverse()) {
    await stopChild(child);
  }
  if (profileDir) await rm(profileDir, { recursive: true, force: true });
}

async function run() {
  const appPort = await freePort();
  const debugPort = await freePort();
  const serverOutput = [];
  const nextBin = path.join(process.cwd(), 'node_modules', '.bin', 'next');
  const next = spawn(nextBin, ['dev', '-H', '127.0.0.1', '-p', String(appPort)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(next);
  for (const stream of [next.stdout, next.stderr]) {
    stream.on('data', (chunk) => {
      serverOutput.push(chunk.toString());
      if (serverOutput.length > 200) serverOutput.shift();
    });
  }
  await waitForHttp(`http://127.0.0.1:${appPort}/`, 90000, () => serverOutput.join(''));

  profileDir = await mkdtemp(path.join(os.tmpdir(), 'next-69446-chrome-'));
  const chromePath = await findChrome();
  const chromeOutput = [];
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  children.push(chrome);
  chrome.stderr.on('data', (chunk) => {
    chromeOutput.push(chunk.toString());
    if (chromeOutput.length > 100) chromeOutput.shift();
  });

  await waitForJson(`http://127.0.0.1:${debugPort}/json/version`, 20000);
  const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`, 10000);
  const target = targets.find((item) => item.type === 'page');
  if (!target) throw new Error(`No Chromium page target found\n${chromeOutput.join('')}`);

  cdp = new CdpClient(target.webSocketDebuggerUrl);
  const consoleMessages = [];
  cdp.on('Runtime.consoleAPICalled', ({ args }) => {
    const text = args.map((arg) => arg.value ?? arg.description ?? '').join(' ');
    consoleMessages.push(text);
    if (/mounted at/.test(text)) console.log(`[browser] ${text}`);
  });
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/` });

  const deadline = Date.now() + 45000;
  const mountTimes = {};
  while (Date.now() < deadline) {
    for (const message of consoleMessages) {
      for (const [name, pattern] of [
        ['home', /^Home mounted at (\d+)/],
        ['comp1', /^comp1 mounted at (\d+)/],
        ['comp2', /^Comp2 mounted at (\d+)/],
        ['comp3', /^Comp3 mounted at (\d+)/],
      ]) {
        const match = message.match(pattern);
        if (match) mountTimes[name] = Number(match[1]);
      }
    }
    if (['home', 'comp1', 'comp2', 'comp3'].every((name) => mountTimes[name] !== undefined)) break;
    await delay(100);
  }

  if (!['home', 'comp1', 'comp2', 'comp3'].every((name) => mountTimes[name] !== undefined)) {
    throw new Error(`Required hydration logs were not observed: ${JSON.stringify(consoleMessages)}`);
  }

  // Comp1's own suspension is two seconds, while the others are three seconds.
  // The reported symptom is that all three boundaries wait roughly ten seconds.
  const delayed = mountTimes.comp1 >= 8000 && mountTimes.comp2 >= 8000 && mountTimes.comp3 >= 8000;
  console.log(JSON.stringify({ mountTimesMs: mountTimes, symptomPresent: delayed }));
  return delayed ? 0 : 1;
}

let code;
try {
  code = await run();
} catch (error) {
  console.error(error?.stack || error);
  code = 2;
}
process.exitCode = code;
await cleanup();
