import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import chromium from '@sparticuz/chromium';

const NEEDLE = 'This will get rendered twice';
const children = [];
const tempDirs = [];
let browserExecutable;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 60_000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited early with ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) {
        await response.arrayBuffer();
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`Next.js did not become ready: ${lastError?.message ?? 'timeout'}`);
}

async function launchBrowser(userDataDir) {
  return await new Promise((resolve, reject) => {
    const child = spawn(browserExecutable, [
      ...chromium.args,
      '--headless',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ], { detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
    children.push(child);
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) reject(new Error(`Browser DevTools endpoint timeout: ${stderr.slice(-1000)}`));
    }, 30_000);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      if (!settled) reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (!settled) reject(new Error(`Browser exited early with ${code ?? signal}: ${stderr.slice(-1000)}`));
    });
  });
}

async function inspectInBrowser(endpoint, url) {
  const ws = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const messageId = ++id;
    pending.set(messageId, { resolve, reject });
    ws.send(JSON.stringify({ id: messageId, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  try {
    const targets = await send('Target.getTargets');
    const page = targets.targetInfos.find((target) => target.type === 'page');
    if (!page) throw new Error('No browser page target found');
    const { sessionId } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    await send('Page.navigate', { url }, sessionId);

    const deadline = Date.now() + 30_000;
    let observation;
    while (Date.now() < deadline) {
      try {
        const result = await send('Runtime.evaluate', {
          awaitPromise: true,
          returnByValue: true,
          expression: `(async () => {
            if (document.readyState !== 'complete') return null;
            await new Promise(resolve => setTimeout(resolve, 2000));
            const needle = ${JSON.stringify(NEEDLE)};
            const matches = [...document.querySelectorAll('div')].filter((element) =>
              element.innerText.trim() === needle &&
              getComputedStyle(element).display !== 'none' &&
              element.getClientRects().length > 0
            );
            return {
              count: matches.length,
              html: matches.map((element) => element.outerHTML),
              readyState: document.readyState
            };
          })()`,
        }, sessionId);
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
        observation = result.result.value;
        if (observation !== null) break;
      } catch {}
      await sleep(250);
    }
    if (!observation) throw new Error('Page did not reach a complete inspectable state');
    return observation;
  } finally {
    ws.close();
  }
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  const exited = new Promise((resolve) => child.once('exit', resolve));
  await Promise.race([exited, sleep(3000)]);
  if (child.exitCode === null && child.signalCode === null) {
    try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    await Promise.race([exited, sleep(3000)]);
  }
}

async function main() {
  browserExecutable = await chromium.executablePath();
  const port = await freePort();
  const url = `http://127.0.0.1:${port}/`;
  const next = spawn('npm', ['run', 'dev', '--', '--port', String(port)], {
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(next);
  let nextLog = '';
  for (const stream of [next.stdout, next.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => { nextLog = (nextLog + chunk).slice(-12000); });
  }
  await waitForServer(url, next);

  const profile = await mkdtemp(path.join(os.tmpdir(), 'next-76322-profile-'));
  tempDirs.push(profile);
  const endpoint = await launchBrowser(profile);
  const observation = await inspectInBrowser(endpoint, url);
  console.log(JSON.stringify({ symptom: NEEDLE, ...observation }, null, 2));
  console.log(nextLog);
  if (observation.count >= 2) return 0;
  if (observation.count === 1) return 1;
  throw new Error(`Expected at least one visible matching div, found ${observation.count}`);
}

let code = 2;
try {
  code = await main();
} catch (error) {
  console.error(error?.stack ?? error);
  code = 2;
} finally {
  process.exitCode = code;
  for (const child of children.reverse()) await stopChild(child);
  for (const directory of tempDirs) await rm(directory, { recursive: true, force: true });
}
