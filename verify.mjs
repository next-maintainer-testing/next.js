import { spawn } from 'node:child_process';
import process from 'node:process';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const symptom = 'A React form was unexpectedly submitted';
const actionMarker = 'ISSUE_72598_ACTION_COMPLETED';
const port = 32000 + Math.floor(Math.random() * 1000);
const origin = `http://127.0.0.1:${port}`;
let output = '';
let browser;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (chunk) => { output += chunk.toString(); });
server.stderr.on('data', (chunk) => { output += chunk.toString(); });

async function waitForServer() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next.js exited early with ${server.exitCode}`);
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Timed out waiting for Next.js');
}

async function stopServer() {
  if (server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ]);
  if (server.exitCode === null) server.kill('SIGKILL');
  if (server.exitCode === null) await new Promise((resolve) => server.once('exit', resolve));
}

let resultCode = 2;
try {
  await waitForServer();
  browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, args: chromium.args });
  const page = await browser.newPage();
  const browserMessages = [];
  page.on('pageerror', (error) => browserMessages.push(error.message));
  page.on('console', (message) => browserMessages.push(message.text()));
  await page.goto(origin, { waitUntil: 'networkidle0' });
  await page.click('main > button');
  await page.waitForSelector('form:nth-of-type(2)');
  await page.type('form:nth-of-type(2) input[name="email"]', 'person@example.com');
  await page.click('form:nth-of-type(2) button[type="submit"]');
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const body = await page.evaluate(() => document.body.innerText);
  const observed = `${browserMessages.join('\n')}\n${body}\n${output}`;
  if (observed.includes(symptom)) {
    console.log(`REPRODUCED: ${symptom}`);
    resultCode = 0;
  } else if (output.includes(actionMarker)) {
    console.log('NOT REPRODUCED: the conditional form server action completed without the reported runtime error');
    resultCode = 1;
  } else {
    console.error('CHECK FAILED: neither the reported runtime error nor server action completion was observed');
    console.error(observed);
    resultCode = 2;
  }
} catch (error) {
  console.error(error?.stack || error);
  console.error(output);
  resultCode = 2;
} finally {
  process.exitCode = resultCode;
  if (browser) await browser.close();
  await stopServer();
}
