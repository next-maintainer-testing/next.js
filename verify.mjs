import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const port = 31000 + (process.pid % 10000);
const origin = `http://127.0.0.1:${port}`;
let server;
let browser;
let output = '';
let result = 2;

function remember(chunk) {
  output = (output + chunk.toString()).slice(-12000);
}

async function waitForServer() {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited early with ${server.exitCode}\n${output}`);
    }
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`Timed out waiting for Next.js\n${output}`);
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    delay(10000).then(() => {
      if (server.exitCode === null) server.kill('SIGKILL');
    }),
  ]);
  if (server.exitCode === null) {
    await new Promise((resolve) => server.once('exit', resolve));
  }
}

function snapshot() {
  const read = (id) => document.getElementById(id)?.dataset.mountId;
  return {
    serverRender: document.getElementById('server-render')?.textContent,
    normal: read('normal'),
    directMemo: read('direct-memo'),
    indirectMemo: read('indirect-memo'),
  };
}

try {
  server = spawn(process.execPath, [
    './node_modules/next/dist/bin/next',
    'dev',
    '--hostname', '127.0.0.1',
    '--port', String(port),
  ], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', remember);
  server.stderr.on('data', remember);

  await waitForServer();
  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: chromium.args,
  });
  const page = await browser.newPage();
  await page.goto(origin, { waitUntil: 'networkidle0', timeout: 120000 });
  const before = await page.evaluate(snapshot);
  if (!before.serverRender || !before.normal || !before.directMemo || !before.indirectMemo) {
    throw new Error(`Initial browser state was incomplete: ${JSON.stringify(before)}`);
  }

  await page.click('#refresh');
  await page.waitForFunction(
    (oldMarker) => document.getElementById('server-render')?.textContent !== oldMarker,
    { timeout: 120000 },
    before.serverRender,
  );
  await delay(500);
  const after = await page.evaluate(snapshot);
  const changed = {
    normal: before.normal !== after.normal,
    directMemo: before.directMemo !== after.directMemo,
    indirectMemo: before.indirectMemo !== after.indirectMemo,
  };

  console.log(JSON.stringify({ before, after, changed }));
  if (changed.directMemo && !changed.normal && !changed.indirectMemo) {
    console.log('SYMPTOM_PRESENT: the directly rendered React.memo component remounted alone');
    result = 0;
  } else if (!changed.normal && !changed.directMemo && !changed.indirectMemo) {
    console.log('SYMPTOM_ABSENT: all client component mount identities were preserved');
    result = 1;
  } else {
    console.error(`CHECK_FAILED: unexpected remount pattern ${JSON.stringify(changed)}`);
    result = 2;
  }
} catch (error) {
  console.error(error?.stack || error);
  if (output) console.error(`Next.js output:\n${output}`);
  result = 2;
} finally {
  process.exitCode = result;
  if (browser) await browser.close();
  await stopServer();
}
