import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const root = new URL('.', import.meta.url).pathname;
const componentPath = join(root, 'app', 'testComponent.tsx');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  await once(server, 'close');
  return port;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), sleep(5000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await once(child, 'exit');
  }
}

const original = await readFile(componentPath, 'utf8');
let devServer;
let browser;
let serverLog = '';
process.exitCode = 2;

try {
  await rm(join(root, '.next'), { recursive: true, force: true });
  const port = await freePort();
  devServer = spawn(process.execPath, [
    join(root, 'node_modules', 'next', 'dist', 'bin', 'next'),
    'dev', '-p', String(port),
  ], {
    cwd: root,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const stream of [devServer.stdout, devServer.stderr]) {
    stream.on('data', (chunk) => { serverLog = (serverLog + chunk.toString()).slice(-12000); });
  }

  const url = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (devServer.exitCode !== null) throw new Error(`next dev exited early:\n${serverLog}`);
    try {
      const response = await fetch(url);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await sleep(250);
  }
  if (!ready) throw new Error(`next dev did not become ready:\n${serverLog}`);

  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    args: [...chromium.args, '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.click('button');
  await page.waitForFunction(() => document.querySelector('.text-2xl')?.textContent === 'test.com');

  let symptomPresent = false;
  const baseline = 'Consectetur adipiscing elit.';
  for (let edit = 0; edit < 20; edit++) {
    const current = await readFile(componentPath, 'utf8');
    const paragraph = current.match(/Consectetur adipiscing elit(?: \d+)?\./)?.[0];
    if (!paragraph) throw new Error('Could not locate the paragraph used to trigger Fast Refresh');
    const replacement = paragraph === baseline ? `Consectetur adipiscing elit ${edit}.` : baseline;
    await writeFile(componentPath, current.replace(paragraph, replacement));
    await page.waitForFunction(
      (text) => [...document.querySelectorAll('p')].some((element) => element.textContent === text),
      { timeout: 60000 },
      replacement,
    );
    await sleep(1500);
    const state = await page.$eval('.text-2xl', (element) => element.textContent ?? '');
    if (state !== 'test.com') {
      symptomPresent = true;
      console.log(`SYMPTOM_PRESENT: client useState reset after paragraph edit ${edit + 1}; observed value ${JSON.stringify(state)}.`);
      break;
    }
  }

  if (symptomPresent) {
    process.exitCode = 0;
  } else {
    console.log('SYMPTOM_ABSENT: client useState remained "test.com" through twenty paragraph Fast Refresh edits.');
    process.exitCode = 1;
  }
} catch (error) {
  process.exitCode = 2;
  console.error(`CHECK_FAILED: ${error?.stack || error}`);
  if (serverLog) console.error(`next dev log tail:\n${serverLog}`);
} finally {
  try {
    await writeFile(componentPath, original);
  } catch (error) {
    process.exitCode = 2;
    console.error(`CHECK_FAILED restoring source: ${error?.stack || error}`);
  }
  if (browser) {
    try {
      await browser.close();
    } catch (error) {
      process.exitCode = 2;
      console.error(`CHECK_FAILED closing browser: ${error?.stack || error}`);
    }
  }
  try {
    await stopChild(devServer);
  } catch (error) {
    process.exitCode = 2;
    console.error(`CHECK_FAILED stopping next dev: ${error?.stack || error}`);
  }
}
