import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

function waitForExit(child) {
  return new Promise((resolve) => {
    child.once('error', (error) => resolve({ code: null, error }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const exited = await Promise.race([
    waitForExit(child).then(() => true),
    delay(5000).then(() => false),
  ]);
  if (!exited && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await waitForExit(child);
  }
}

async function availablePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const address = listener.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  if (!port) throw new Error('Could not allocate a local port');
  return port;
}

async function waitForServer(url, server) {
  const deadline = Date.now() + 90000;
  let lastError;
  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code=${server.exitCode}, signal=${server.signalCode})`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for Next.js: ${lastError?.message ?? 'unknown error'}`);
}

const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const nextBin = path.resolve('node_modules', '.bin', process.platform === 'win32' ? 'next.cmd' : 'next');
const server = spawn(nextBin, ['dev', '-H', '127.0.0.1', '-p', String(port)], {
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: 'inherit',
});
let browser;
let result = 2;

try {
  await waitForServer(origin, server);
  browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
  const page = await browser.newPage();
  await page.goto(origin, { waitUntil: 'networkidle0', timeout: 60000 });

  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('Go to other Page'));
    if (!button) throw new Error('Initial navigation button was not rendered');
    button.click();
  });
  await page.waitForFunction(() => location.pathname === '/abc' && location.hash === '#FragmentDynamic', { timeout: 30000 });

  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('Change fragment'));
    if (!button) throw new Error('Fragment navigation button was not rendered');
    button.click();
  });
  await page.waitForFunction(() => location.pathname === '/abc' && location.href.includes('DifferentFragment'), { timeout: 30000 });

  const observed = await page.evaluate(() => ({ href: location.href, pathname: location.pathname, hash: location.hash }));
  console.log(`Observed browser URL after router.push('/abc#DifferentFragment'): ${JSON.stringify(observed)}`);

  if (observed.pathname !== '/abc') {
    throw new Error(`Unexpected pathname: ${observed.pathname}`);
  }
  if (observed.hash === '#FragmentDynamic#DifferentFragment') {
    console.log('SYMPTOM_PRESENT: the previous fragment was retained and the new fragment was appended');
    result = 0;
  } else if (observed.hash === '#DifferentFragment') {
    console.log('SYMPTOM_ABSENT: the previous fragment was replaced by the requested fragment');
    result = 1;
  } else {
    throw new Error(`Unexpected fragment result: ${observed.hash}`);
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error?.stack ?? error}`);
  result = 2;
} finally {
  process.exitCode = result;
  if (browser) await browser.close();
  await stop(server);
}
