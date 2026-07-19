import { spawn } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import chromium from '@sparticuz/chromium';
import { chromium as playwrightChromium } from 'playwright-core';

const cwd = process.cwd();
const pageFile = path.join(cwd, 'app/test/page.js');
const oldText = 'test update';
const newText = 'test update BUILD_B_75228';
const port = 32000 + Math.floor(Math.random() * 1000);
const baseURL = `http://127.0.0.1:${port}`;
let originalSource;
let server;
let browser;
let finalCode = 2;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

async function build(label) {
  await rm(path.join(cwd, '.next'), { recursive: true, force: true });
  const result = await run(process.execPath, [path.join(cwd, 'node_modules/next/dist/bin/next'), 'build']);
  if (result.code !== 0) {
    throw new Error(`${label} build failed (${result.code ?? result.signal})\n${result.stdout.slice(-4000)}\n${result.stderr.slice(-4000)}`);
  }
}

async function startServer(label) {
  const child = spawn(process.execPath, [path.join(cwd, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${label} server exited early (${child.exitCode})\n${output}`);
    try {
      const response = await fetch(baseURL, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return child;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  child.kill('SIGTERM');
  throw new Error(`${label} server did not become ready\n${output}`);
}

async function stopServer() {
  if (!server || server.exitCode !== null) {
    server = undefined;
    return;
  }
  const child = server;
  server = undefined;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function clickAndObserve(page, name) {
  const before = await page.evaluate(() => ({
    origin: performance.timeOrigin,
    marker: (window.__next75228Marker = Math.random().toString(36)),
  }));
  await page.getByRole('link', { name, exact: true }).click();
  await page.waitForURL((url) => url.pathname === (name === 'Home' ? '/' : `/${name}`), { timeout: 15000 });
  await page.waitForTimeout(750);
  const after = await page.evaluate(() => ({
    origin: performance.timeOrigin,
    marker: window.__next75228Marker ?? null,
    body: document.body.innerText,
  }));
  return {
    hardNavigation: after.origin !== before.origin || after.marker !== before.marker,
    body: after.body,
  };
}

try {
  originalSource = await readFile(pageFile, 'utf8');
  if (!originalSource.includes(oldText) || originalSource.includes(newText)) {
    throw new Error('test page does not contain the expected original marker');
  }

  chromium.setGraphicsMode = false;
  const executablePath = await chromium.executablePath();
  await build('build A');
  server = await startServer('build A');
  browser = await playwrightChromium.launch({ executablePath, args: chromium.args, headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' || /Failed to fetch RSC payload|Falling back to browser navigation/i.test(text)) {
      consoleErrors.push(text);
    }
  });

  await page.goto(baseURL, { waitUntil: 'networkidle' });
  for (const name of ['test', 'test2', 'test3', 'Home']) {
    await clickAndObserve(page, name);
  }

  await stopServer();
  await writeFile(pageFile, originalSource.replace(oldText, newText));
  await build('build B');
  server = await startServer('build B');

  const rebuiltTest = await clickAndObserve(page, 'test');
  const staleAfterRebuild = rebuiltTest.body.includes(oldText) && !rebuiltTest.body.includes(newText);

  await page.reload({ waitUntil: 'networkidle' });
  const afterRefreshTest2 = await clickAndObserve(page, 'test2');
  const afterRefreshTest3 = await clickAndObserve(page, 'test3');
  const repeatedReloadsAfterRefresh = afterRefreshTest2.hardNavigation && afterRefreshTest3.hardNavigation;
  const rscError = consoleErrors.some((text) => /Failed to fetch RSC payload|Falling back to browser navigation|RSC/i.test(text));

  console.log(JSON.stringify({
    staleAfterRebuild,
    firstPostBuildClickHardNavigated: rebuiltTest.hardNavigation,
    postRefreshHardNavigations: [afterRefreshTest2.hardNavigation, afterRefreshTest3.hardNavigation],
    repeatedReloadsAfterRefresh,
    rscError,
    consoleErrors: consoleErrors.slice(-5),
  }));

  finalCode = staleAfterRebuild || repeatedReloadsAfterRefresh || rscError ? 0 : 1;
} catch (error) {
  console.error(error?.stack || error);
  finalCode = 2;
} finally {
  process.exitCode = finalCode;
  try { await browser?.close(); } catch {}
  try { await stopServer(); } catch {}
  if (originalSource !== undefined) {
    try { await writeFile(pageFile, originalSource); } catch {}
  }
}
