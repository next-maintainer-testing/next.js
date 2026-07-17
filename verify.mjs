import { spawn } from 'node:child_process';
import net from 'node:net';
import sparticuzChromium from '@sparticuz/chromium';
import { chromium } from 'playwright-core';

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function runBuild() {
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (code !== 0) throw new Error(`Next.js build failed with code ${code}\n${output.slice(-8000)}`);
  return output;
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await delay(500);
  }
  throw new Error('Timed out waiting for Next.js');
}

function isRouteARsc(request, baseUrl) {
  const url = new URL(request.url());
  return url.origin === baseUrl && url.pathname === '/a' && request.headers().rsc === '1';
}

async function openWithPrefetchedRouteA(browser, baseUrl) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const routeARequests = [];
  page.on('request', request => {
    if (isRouteARsc(request, baseUrl)) routeARequests.push(request.url());
  });
  const prefetched = page.waitForRequest(request => isRouteARsc(request, baseUrl));
  await page.goto(`${baseUrl}/b`, { waitUntil: 'networkidle' });
  await prefetched;
  await page.waitForLoadState('networkidle');
  return { context, page, routeARequests };
}

async function runRevalidationAction(page, baseUrl) {
  await Promise.all([
    page.waitForResponse(response => response.request().method() === 'POST' && response.url().startsWith(`${baseUrl}/b`)),
    page.getByTestId('invalidate').click(),
  ]);
  await page.waitForLoadState('networkidle');
}

async function stopServer(child, detached) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  if (detached) process.kill(-child.pid, 'SIGTERM');
  else child.kill('SIGTERM');
  await Promise.race([exited, delay(5000)]);
  if (child.exitCode === null) {
    if (detached) process.kill(-child.pid, 'SIGKILL');
    else child.kill('SIGKILL');
    await exited;
  }
}

let browser;
let child;
let serverOutput = '';
const detached = process.platform !== 'win32';

try {
  serverOutput += await runBuild();
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    detached,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', chunk => { serverOutput += chunk; });
  child.stderr.on('data', chunk => { serverOutput += chunk; });

  await waitForServer(`${baseUrl}/b`, child);
  browser = await chromium.launch({
    args: sparticuzChromium.args,
    executablePath: await sparticuzChromium.executablePath(),
    headless: true,
  });

  const control = await openWithPrefetchedRouteA(browser, baseUrl);
  const controlBeforeNavigation = control.routeARequests.length;
  await control.page.getByTestId('to-a').click();
  await control.page.waitForURL(`${baseUrl}/a`);
  await control.page.waitForLoadState('networkidle');
  const controlNavigationRequests = control.routeARequests.length - controlBeforeNavigation;

  if (controlNavigationRequests !== 0) {
    throw new Error(`Router Cache control failed: navigation made ${controlNavigationRequests} route A RSC request(s) after a completed prefetch`);
  }

  const invalidated = await openWithPrefetchedRouteA(browser, baseUrl);
  const beforeAction = invalidated.routeARequests.length;
  await runRevalidationAction(invalidated.page, baseUrl);
  await invalidated.page.getByTestId('to-a').click();
  await invalidated.page.waitForURL(`${baseUrl}/a`);
  await invalidated.page.waitForLoadState('networkidle');
  const requestsAfterAction = invalidated.routeARequests.length - beforeAction;

  const symptomPresent = requestsAfterAction > 0;
  console.log(JSON.stringify({ controlNavigationRequests, requestsAfterAction, symptomPresent }));
  process.exitCode = symptomPresent ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  console.error(serverOutput.slice(-8000));
  process.exitCode = 2;
} finally {
  if (browser) await browser.close();
  await stopServer(child, detached);
}
