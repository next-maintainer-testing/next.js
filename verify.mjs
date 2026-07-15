import { spawn } from 'node:child_process';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const port = 4100 + (process.pid % 1000);
const baseUrl = `http://127.0.0.1:${port}`;
let server;
let browser;
let outcome = 2;
let observation = 'check did not complete';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? signal}`));
    });
  });
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`next start exited early with ${server.exitCode}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('timed out waiting for next start');
}

try {
  await run('npm', ['run', 'build']);

  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: 'inherit',
  });
  await waitForServer();

  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: [...chromium.args, '--disable-dev-shm-usage'],
    headless: true,
  });
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: 'networkidle0' });
  await page.click('#increment');
  await page.waitForFunction(() => document.querySelector('#state-value')?.textContent === '1');
  await page.click('#about-link');
  await page.waitForFunction(() => location.pathname === '/about' && document.querySelector('h1')?.textContent === 'About');
  await new Promise((resolve) => setTimeout(resolve, 500));

  const result = await page.evaluate(() => ({
    value: document.querySelector('#state-value')?.textContent,
    mounts: window.__shellMounts || 0,
    pathname: location.pathname,
  }));
  const reproduced = result.value === '0' && result.mounts >= 2;
  outcome = reproduced ? 0 : 1;
  observation = reproduced
    ? `symptom present: state reset to ${result.value}; mount count ${result.mounts}`
    : `symptom absent: state ${result.value}; mount count ${result.mounts}`;
} catch (error) {
  outcome = 2;
  observation = `check failed: ${error.stack || error}`;
} finally {
  process.exitCode = outcome;
  console.log(observation);
  if (browser) await browser.close().catch(() => {});
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (server.exitCode === null) server.kill('SIGKILL');
        resolve();
      }, 5_000);
      server.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
