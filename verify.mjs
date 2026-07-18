import { spawn } from 'node:child_process';
import net from 'node:net';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const expected = {
  color: 'rgb(12, 34, 56)',
  backgroundColor: 'rgb(210, 220, 230)',
  fontSize: '40px'
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function availablePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const { port } = socket.address();
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error('Timed out waiting for the Next.js development server');
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(5_000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    })
  ]);
  if (child.exitCode === null) {
    await new Promise((resolve) => child.once('exit', resolve));
  }
}

async function targetStyle(page) {
  return page.$eval('#target', (element) => {
    const style = getComputedStyle(element);
    return {
      color: style.color,
      backgroundColor: style.backgroundColor,
      fontSize: style.fontSize
    };
  });
}

const styleMatches = (actual) => Object.entries(expected).every(([key, value]) => actual[key] === value);

let server;
let browser;
let resultCode;
const serverOutput = [];

try {
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => {
      serverOutput.push(String(chunk));
      if (serverOutput.length > 80) serverOutput.shift();
    });
  }

  await waitForServer(origin, server);
  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: chromium.args
  });
  const page = await browser.newPage();
  await page.goto(origin, { waitUntil: 'networkidle0' });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('#to-other')
  ]);
  await page.waitForSelector('#target');
  await delay(1_000);
  const afterClientNavigation = await targetStyle(page);

  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('#target');
  const afterFullLoad = await targetStyle(page);

  console.log(JSON.stringify({ afterClientNavigation, afterFullLoad, expected }));
  if (!styleMatches(afterFullLoad)) {
    throw new Error('Full page load did not apply the expected vanilla-extract style');
  }
  if (!styleMatches(afterClientNavigation)) {
    console.log('SYMPTOM_PRESENT: route style is missing after client navigation but present after full load');
    resultCode = 0;
  } else {
    console.log('SYMPTOM_ABSENT: route style is present after both client navigation and full load');
    resultCode = 1;
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error?.stack || error}`);
  if (serverOutput.length) console.error(serverOutput.join('').slice(-8000));
  resultCode = 2;
} finally {
  process.exitCode = resultCode ?? 2;
  if (browser) await browser.close().catch(() => {});
  await stopServer(server).catch(() => {});
}
