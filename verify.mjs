import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import Chromium from '@sparticuz/chromium';
import { chromium } from 'playwright-core';

let app;
let browser;

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(url, child, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited early with ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for Next.js');
}

async function stopApp(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await new Promise((resolve) => child.once('exit', resolve));
  }
}

let outcome = 2;
try {
  const executablePath = await Chromium.executablePath();
  const port = await reservePort();
  app = spawn(process.execPath, [
    'node_modules/next/dist/bin/next', 'dev',
    '--hostname', '127.0.0.1', '--port', String(port),
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  app.stdout.pipe(process.stdout);
  app.stderr.pipe(process.stderr);

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(baseUrl, app);
  browser = await chromium.launch({ headless: true, executablePath, args: Chromium.args });
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  const initialTitle = await page.title();
  if (initialTitle !== 'NextGram') throw new Error(`Unexpected initial title: ${JSON.stringify(initialTitle)}`);
  await page.locator('a[href="/photos/1"]').click();
  await page.locator('dialog[open]').waitFor({ state: 'visible' });
  await page.waitForURL('**/photos/1');
  await page.waitForTimeout(1000);

  const title = await page.title();
  const dialogText = (await page.locator('dialog').innerText()).trim();
  console.log(JSON.stringify({ initialTitle, url: page.url(), dialogText, title }));
  if (dialogText !== '1') throw new Error(`Intercepted modal did not render photo 1: ${JSON.stringify(dialogText)}`);

  if (title === 'NextGram') {
    console.log('SYMPTOM_PRESENT: intercepted route left the document title unchanged');
    outcome = 0;
  } else if (title === 'Photo 1 intercepted') {
    console.log('SYMPTOM_ABSENT: intercepted route updated the document title');
    outcome = 1;
  } else {
    throw new Error(`Unexpected title after intercepted navigation: ${JSON.stringify(title)}`);
  }
} catch (error) {
  console.error('CHECK_FAILED:', error?.stack || error);
  outcome = 2;
} finally {
  process.exitCode = outcome;
  if (browser) await browser.close().catch((error) => console.error('Browser cleanup failed:', error));
  await stopApp(app).catch((error) => console.error('App cleanup failed:', error));
}
