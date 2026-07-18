import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile } from 'node:fs/promises';

const host = '127.0.0.1';
let server;
let result = 2;
let logs = '';

async function availablePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, host, resolve);
  });
  const { port } = socket.address();
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function fetchPage(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before serving the page (code ${server.exitCode})`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return response.text();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Next.js: ${lastError?.message ?? 'no response'}`);
}

function stylesheetUrls(html, baseUrl) {
  const urls = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel=["']stylesheet["']/i.test(tag)) continue;
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (href) urls.push(new URL(href.replaceAll('&amp;', '&'), baseUrl));
  }
  return urls;
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  const stopped = await Promise.race([
    new Promise((resolve) => server.once('exit', () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
  ]);
  if (!stopped && server.exitCode === null) {
    server.kill('SIGKILL');
    await new Promise((resolve) => server.once('exit', resolve));
  }
}

try {
  const packageJson = JSON.parse(await readFile(new URL('./node_modules/next/package.json', import.meta.url), 'utf8'));
  const major = Number.parseInt(packageJson.version, 10);
  const port = await availablePort();
  const args = ['node_modules/next/dist/bin/next', 'dev', '--hostname', host, '--port', String(port)];
  if (major >= 16) args.push('--webpack');

  server = spawn(process.execPath, args, {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => {
      logs = (logs + chunk.toString()).slice(-12000);
    });
  }

  const pageUrl = `http://${host}:${port}/`;
  const html = await fetchPage(pageUrl, 120000);
  const rawSourceRendered = /<pre\b[^>]*data-testid=["']raw-css["'][^>]*>[\s\S]*?background: rgb\(1, 2, 3\);[\s\S]*?<\/pre>/i.test(html);
  if (!rawSourceRendered) {
    throw new Error('The raw CSS source was not rendered in the running page');
  }

  const stylesheets = [];
  for (const url of stylesheetUrls(html, pageUrl)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load stylesheet ${url}: HTTP ${response.status}`);
    stylesheets.push({ url: url.pathname, css: await response.text() });
  }
  const symptomPresent = stylesheets.some(({ css }) => /body\s*\{[^}]*background:\s*rgb\(1,\s*2,\s*3\)/i.test(css));
  console.log(JSON.stringify({
    symptom: 'CSS imported through !!raw-loader is also loaded by the runtime page as a stylesheet',
    symptomPresent,
    rawSourceRendered,
    stylesheetUrls: stylesheets.map(({ url }) => url),
    nextVersion: packageJson.version,
  }));
  result = symptomPresent ? 0 : 1;
} catch (error) {
  console.error(error?.stack ?? String(error));
  if (logs) console.error(`Next.js output:\n${logs}`);
  result = 2;
} finally {
  process.exitCode = result;
  await stopServer();
}
