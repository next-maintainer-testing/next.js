import { spawn } from 'node:child_process';
import { chromium } from 'playwright-chromium';

const port = 41000 + (process.pid % 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const marker = 'fired from app/layout.js';
let server;
let browser;
let finalCode = 2;
let serverOutput = '';

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${server.exitCode})\n${serverOutput}`);
    }
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) return;
    } catch {}
    await delay(500);
  }
  throw new Error(`Timed out waiting for Next.js\n${serverOutput}`);
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(() => server.kill('SIGKILL'), 5_000);
    server.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    server.kill('SIGTERM');
  });
}

async function inspect(pathname) {
  const page = await browser.newPage();
  const messages = [];
  page.on('console', (message) => messages.push(message.text()));
  const response = await page.goto(`${baseUrl}${pathname}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForTimeout(2_000);
  const heading = await page.locator('h1').first().textContent();
  await page.close();
  return {
    status: response?.status() ?? null,
    heading,
    markerLogged: messages.includes(marker),
    consoleMessages: messages,
  };
}

try {
  server = spawn(process.execPath, [
    './node_modules/next/dist/bin/next',
    'dev',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(port),
  ], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => {
      serverOutput = (serverOutput + chunk.toString()).slice(-12_000);
    });
  }

  await waitForServer();
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const home = await inspect('/');
  const article = await inspect('/article');
  const observation = { home, article };

  if (!home.markerLogged || home.heading !== 'home page') {
    console.error(JSON.stringify({ checkFailed: 'positive control did not execute', ...observation }, null, 2));
    finalCode = 2;
  } else if (article.heading !== '404' || article.status !== 404) {
    console.error(JSON.stringify({ checkFailed: 'not-found route did not render as expected', ...observation }, null, 2));
    finalCode = 2;
  } else if (!article.markerLogged) {
    console.log(JSON.stringify({ symptom: 'beforeInteractive console log missing on not-found route', ...observation }, null, 2));
    finalCode = 0;
  } else {
    console.log(JSON.stringify({ symptomAbsent: 'beforeInteractive console log executed on not-found route', ...observation }, null, 2));
    finalCode = 1;
  }
} catch (error) {
  console.error(error?.stack || String(error));
  finalCode = 2;
} finally {
  process.exitCode = finalCode;
  if (browser) await browser.close();
  await stopServer();
}
