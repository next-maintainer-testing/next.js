import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium } from 'playwright-chromium';

const workspace = new URL('.', import.meta.url).pathname;
let nextProcess;
let browser;
let exitCode = 2;
const serverOutput = [];

function getPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForServer(url, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (nextProcess?.exitCode !== null) {
      throw new Error(`Next.js exited early with code ${nextProcess.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Next.js: ${lastError?.message ?? 'unknown error'}`);
}

async function stopNext() {
  if (!nextProcess || nextProcess.exitCode !== null) return;
  const closed = new Promise((resolve) => nextProcess.once('exit', resolve));
  nextProcess.kill('SIGTERM');
  const stopped = await Promise.race([
    closed.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 10000)),
  ]);
  if (!stopped && nextProcess.exitCode === null) {
    nextProcess.kill('SIGKILL');
    await closed;
  }
}

try {
  const port = await getPort();
  const url = `http://127.0.0.1:${port}/`;
  nextProcess = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
    { cwd: workspace, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  for (const stream of [nextProcess.stdout, nextProcess.stderr]) {
    stream.on('data', (chunk) => {
      serverOutput.push(String(chunk));
      if (serverOutput.length > 200) serverOutput.shift();
    });
  }

  await waitForServer(url);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let refreshLogged = false;
  const browserErrors = [];
  page.on('console', (message) => {
    if (message.text() === 'Refresh triggered') refreshLogged = true;
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto(url, { waitUntil: 'networkidle' });
  const timestamp = page.locator('#timestamp');
  await timestamp.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#timestamp')?.textContent?.startsWith('Timestamp: '));
  const before = (await timestamp.textContent())?.trim();
  if (!before?.startsWith('Timestamp: ')) throw new Error(`Initial timestamp was not rendered: ${before}`);

  await page.locator('#refresh').click();
  await page.waitForTimeout(2000);
  const after = (await timestamp.textContent())?.trim();
  if (!refreshLogged) throw new Error('The refresh click handler did not run');
  if (browserErrors.length) throw new Error(`Browser errors: ${browserErrors.join(' | ')}`);

  const symptomPresent = before === after;
  console.log(JSON.stringify({
    next: (await import('next/package.json', { with: { type: 'json' } })).default.version,
    before,
    after,
    refreshClickHandled: refreshLogged,
    symptomPresent,
  }));
  exitCode = symptomPresent ? 0 : 1;
} catch (error) {
  console.error(error?.stack ?? error);
  if (serverOutput.length) console.error(serverOutput.join('').slice(-12000));
  exitCode = 2;
} finally {
  process.exitCode = exitCode;
  if (browser) await browser.close();
  await stopNext();
}
