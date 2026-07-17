import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

const require = createRequire(import.meta.url);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  return { child, getOutput: () => output };
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(5000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }),
  ]);
  if (child.exitCode === null) {
    await new Promise((resolve) => child.once('exit', resolve));
  }
}

async function waitForHttp(url, timeoutMs, processInfo) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (processInfo?.child.exitCode !== null) {
      throw new Error(`Process exited before becoming ready (${processInfo.child.exitCode})\n${processInfo.getOutput()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const request = this.pending.get(message.id);
        if (!request) return;
        this.pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
        return;
      }
      const callbacks = this.listeners.get(message.method) || [];
      for (const callback of callbacks) callback(message.params);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, callback) {
    const callbacks = this.listeners.get(method) || [];
    callbacks.push(callback);
    this.listeners.set(method, callbacks);
  }

  wait(method, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timed out waiting for CDP event ${method}`)), timeoutMs);
      this.on(method, (params) => {
        clearTimeout(timeout);
        resolve(params);
      });
    });
  }

  async close() {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.close();
    await sleep(100);
  }
}

async function ensureChromium() {
  const prefix = path.join(os.tmpdir(), 'next-75762-chromium-133');
  const modulePath = path.join(prefix, 'node_modules', '@sparticuz', 'chromium');
  try {
    await fs.access(path.join(modulePath, 'build', 'index.js'));
  } catch {
    await fs.mkdir(prefix, { recursive: true });
    const install = start('npm', [
      'install', '--silent', '--no-audit', '--no-fund', '--no-save',
      '--prefix', prefix, '@sparticuz/chromium@133.0.0',
    ]);
    const code = await new Promise((resolve) => install.child.once('exit', resolve));
    if (code !== 0) throw new Error(`Could not install headless Chromium (${code})\n${install.getOutput()}`);
  }
  const chromium = require(modulePath);
  return chromium.executablePath();
}

let nextProcess;
let chromeProcess;
let cdp;
let profileDir;

try {
  const appPort = await freePort();
  const chromePort = await freePort();
  const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
  nextProcess = start(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(appPort)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  });
  await waitForHttp(`http://127.0.0.1:${appPort}/`, 90000, nextProcess);

  const executable = await ensureChromium();
  profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'next-75762-profile-'));
  chromeProcess = start(executable, [
    '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    `--remote-debugging-port=${chromePort}`, `--user-data-dir=${profileDir}`,
    'about:blank',
  ]);
  await waitForHttp(`http://127.0.0.1:${chromePort}/json/version`, 30000, chromeProcess);
  const targetResponse = await fetch(`http://127.0.0.1:${chromePort}/json/new?about:blank`, { method: 'PUT' });
  if (!targetResponse.ok) throw new Error(`Could not create browser target: HTTP ${targetResponse.status}`);
  const target = await targetResponse.json();
  cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();

  const requests = [];
  const browserErrors = [];
  cdp.on('Network.requestWillBeSent', ({ request }) => requests.push(request.url));
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => browserErrors.push(exceptionDetails.text || 'exception'));
  cdp.on('Runtime.consoleAPICalled', ({ type, args }) => {
    if (type === 'error') browserErrors.push(args.map((arg) => arg.value || arg.description || '').join(' '));
  });
  await Promise.all([cdp.send('Page.enable'), cdp.send('Network.enable'), cdp.send('Runtime.enable')]);

  let loaded = cdp.wait('Page.loadEventFired', 60000);
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/` });
  await loaded;
  const click = await cdp.send('Runtime.evaluate', {
    expression: `(() => { const link = document.querySelector('a[href="/redirectToModal"]'); if (!link) return 'missing'; link.click(); return 'clicked'; })()`,
    returnByValue: true,
  });
  if (click.result?.value !== 'clicked') throw new Error('The reporter link was not found in the rendered page');

  await sleep(20000);
  const location = await cdp.send('Runtime.evaluate', { expression: 'location.pathname', returnByValue: true });
  const serverOutput = nextProcess.getOutput();
  const renderCount = (serverOutput.match(/Rendering PhotoModal at/g) || []).length;
  const redirectRequests = requests.filter((url) => url.includes('/redirectToModal')).length;
  const photoRequests = requests.filter((url) => url.includes('/photos/1')).length;
  const pathname = location.result?.value;

  console.log(JSON.stringify({ renderCount, redirectRequests, photoRequests, pathname, browserErrorCount: browserErrors.length }));
  if (renderCount >= 5) {
    console.log(`SYMPTOM PRESENT: intercepted PhotoModal rendered ${renderCount} times after one redirect link click.`);
    process.exitCode = 0;
  } else if (renderCount >= 1 && redirectRequests >= 1 && pathname === '/photos/1') {
    console.log(`SYMPTOM ABSENT: navigation completed and PhotoModal rendered ${renderCount} time(s), below the rerender-loop threshold.`);
    process.exitCode = 1;
  } else {
    throw new Error(`Navigation check was incomplete: renderCount=${renderCount}, redirectRequests=${redirectRequests}, pathname=${pathname}\n${serverOutput.slice(-6000)}`);
  }
} catch (error) {
  console.error(`CHECK FAILED: ${error?.stack || error}`);
  process.exitCode = 2;
} finally {
  if (cdp) await cdp.close();
  await stop(chromeProcess?.child);
  await stop(nextProcess?.child);
  if (profileDir) await fs.rm(profileDir, { recursive: true, force: true });
}
