import { spawn } from 'node:child_process';
import path from 'node:path';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const port = 32177;
let server;
let browser;
let result = 2;

async function waitForPage(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null) {
      throw new Error(`Next.js exited before serving the page (${server.exitCode})`);
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
  throw new Error(`Next.js did not become ready: ${lastError?.message ?? 'timeout'}`);
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (server.exitCode === null) {
    server.kill('SIGKILL');
    await new Promise((resolve) => server.once('exit', resolve));
  }
}

try {
  server = spawn(
    process.execPath,
    [path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '-p', String(port)],
    {
      cwd: process.cwd(),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let serverOutput = '';
  server.stdout.on('data', (chunk) => {
    serverOutput += chunk;
    process.stdout.write(chunk);
  });
  server.stderr.on('data', (chunk) => {
    serverOutput += chunk;
    process.stderr.write(chunk);
  });

  const url = `http://127.0.0.1:${port}`;
  await waitForPage(url, 120000);
  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    headless: true,
  });
  const page = await browser.newPage();
  const consoleMessages = [];
  page.on('console', (message) => {
    const text = message.text();
    consoleMessages.push(text);
    console.log(`[browser] ${text}`);
  });
  page.on('pageerror', (error) => console.error(`[browser error] ${error.message}`));
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 120000 });
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const mounted = consoleMessages.filter((message) => message.includes('ISSUE_74977_APP_MOUNTED')).length;
  const unmounted = consoleMessages.filter((message) => message.includes('ISSUE_74977_APP_UNMOUNTED')).length;
  console.log(`Observed effect lifecycle: mounted=${mounted}, unmounted=${unmounted}`);

  if (mounted === 1 && unmounted === 0) {
    console.log('SYMPTOM PRESENT: React Strict Mode did not remount the component in development.');
    result = 0;
  } else if (mounted >= 2 && unmounted >= 1) {
    console.log('SYMPTOM ABSENT: React Strict Mode performed the development remount cycle.');
    result = 1;
  } else {
    console.error(`CHECK FAILED: unexpected effect lifecycle counts (mounted=${mounted}, unmounted=${unmounted}).`);
    console.error(serverOutput.slice(-4000));
    result = 2;
  }
} catch (error) {
  console.error(`CHECK FAILED: ${error.stack ?? error}`);
  result = 2;
} finally {
  process.exitCode = result;
  if (browser) await browser.close();
  await stopServer();
}
