import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const port = 31913;
const expectedDir = path.join(root, '.next', 'static', 'css', 'antd-output');
const turbopackProjectDir = path.join(root, '[project]');
let child;
let output = '';
let resultCode = 2;
let observation = 'verification did not complete';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function filesBelow(dir) {
  const found = [];
  async function walk(current) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else found.push(full);
    }
  }
  await walk(dir);
  return found;
}

async function requestUntilReady(url) {
  let lastError;
  for (let attempt = 0; attempt < 180; attempt++) {
    if (child.exitCode !== null) {
      throw new Error(`next dev exited early with ${child.exitCode}: ${output.slice(-3000)}`);
    }
    try {
      const response = await fetch(url);
      if (response.status === 200) return response;
      lastError = new Error(`page returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  throw new Error(`server did not become ready: ${lastError?.message || 'timeout'}`);
}

function waitForExit(proc, timeoutMs) {
  if (proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      proc.off('exit', done);
      resolve(false);
    }, timeoutMs);
    proc.once('exit', done);
  });
}

try {
  await fs.rm(path.join(root, '.next'), { recursive: true, force: true });
  await fs.rm(turbopackProjectDir, { recursive: true, force: true });
  child = spawn(
    process.execPath,
    [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '--turbo', '--port', String(port)],
    {
      cwd: root,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout.on('data', (chunk) => { output = (output + chunk).slice(-12000); });
  child.stderr.on('data', (chunk) => { output = (output + chunk).slice(-12000); });

  const page = await requestUntilReady(`http://127.0.0.1:${port}/`);
  const html = await page.text();
  const match = html.match(/href=["'](\/_next\/static\/css\/antd-output\/[^"']+\.css)["']/);
  if (!match) throw new Error(`rendered page has no extracted Ant Design CSS link: ${html.slice(0, 1000)}`);

  const cssUrl = `http://127.0.0.1:${port}${match[1]}`;
  const linkedResponse = await fetch(cssUrl);
  const linkedCss = await linkedResponse.text();
  await delay(300);

  const expectedCss = (await filesBelow(expectedDir)).filter((file) => file.endsWith('.css'));
  const misplacedCss = (await filesBelow(path.join(turbopackProjectDir, 'static', 'css', 'antd-output'))).filter((file) => file.endsWith('.css'));
  const misplacedSizes = await Promise.all(misplacedCss.map(async (file) => [path.relative(root, file), (await fs.stat(file)).size]));
  const hasNonemptyMisplacedCss = misplacedSizes.some(([, size]) => size > 0);
  const hasNonemptyExpectedCss = await Promise.all(expectedCss.map(async (file) => (await fs.stat(file)).size > 0)).then((items) => items.some(Boolean));

  if (linkedResponse.status !== 200 && !hasNonemptyExpectedCss && hasNonemptyMisplacedCss) {
    resultCode = 0;
    observation = `symptom present: ${match[1]} returned HTTP ${linkedResponse.status}; extracted CSS was misplaced at ${JSON.stringify(misplacedSizes)}`;
  } else if (linkedResponse.status === 200 && linkedCss.length > 0 && hasNonemptyExpectedCss) {
    resultCode = 1;
    observation = `symptom absent: ${match[1]} returned non-empty CSS from .next/static/css`;
  } else {
    throw new Error(`ambiguous result: linked status=${linkedResponse.status}, linked bytes=${linkedCss.length}, expected=${JSON.stringify(expectedCss.map((file) => path.relative(root, file)))}, misplaced=${JSON.stringify(misplacedSizes)}`);
  }
} catch (error) {
  resultCode = 2;
  observation = `check failed: ${error.stack || error.message}; next output: ${output.slice(-3000)}`;
} finally {
  process.exitCode = resultCode;
  console.log(observation);
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    const stopped = await waitForExit(child, 8000);
    if (!stopped && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await waitForExit(child, 8000);
    }
  }
}
