import { spawn } from 'node:child_process';
import net from 'node:net';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const host = '127.0.0.1';
let server;
let browser;
let output = '';

function reservePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once('error', reject);
    socket.listen(0, host, () => {
      const { port } = socket.address();
      socket.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForPage(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`next dev exited early (${server.exitCode})\n${output}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out waiting for ${url}\n${output}`);
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
  const port = await reservePort();
  const url = `http://${host}:${port}/`;
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', host, '--port', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => { output += chunk; });
  server.stderr.on('data', (chunk) => { output += chunk; });

  await waitForPage(url, 120_000);
  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    args: chromium.args,
  });
  const page = await browser.newPage();
  const consoleMessages = [];
  page.on('console', (message) => consoleMessages.push(message.text()));
  const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 120_000 });
  if (!response?.ok()) throw new Error(`browser navigation returned ${response?.status()}`);
  await page.waitForSelector('h1', { timeout: 30_000 });
  const heading = await page.$eval('h1', (element) => element.textContent);
  if (heading !== 'Issue 76005 reproduction') throw new Error(`unexpected page content: ${heading}`);
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const printedHello = consoleMessages.includes('hello');
  console.log(`page loaded; browser console ${printedHello ? 'contained' : 'did not contain'} "hello"`);
  process.exitCode = printedHello ? 1 : 0;
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 2;
} finally {
  if (browser) await browser.close();
  await stopServer();
}
