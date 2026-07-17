import { spawn } from 'node:child_process';
import net from 'node:net';

const host = '127.0.0.1';
const port = await getPort();
const url = `http://${host}:${port}`;
let server;
let result = 2;

try {
  server = spawn(process.execPath, [
    'node_modules/next/dist/bin/next',
    'dev',
    '--turbopack',
    '--hostname',
    host,
    '--port',
    String(port),
  ], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  server.stdout.on('data', (chunk) => { logs += chunk; });
  server.stderr.on('data', (chunk) => { logs += chunk; });

  const html = await waitForPage(url, server, () => logs);
  const cssUrls = [...html.matchAll(/href=["']([^"']+\.css(?:\?[^"']*)?)["']/g)]
    .map((match) => new URL(match[1], url));
  if (cssUrls.length === 0) throw new Error('The rendered page did not link a CSS stylesheet.');

  const stylesheets = await Promise.all(cssUrls.map(async (cssUrl) => {
    const response = await fetch(cssUrl);
    if (!response.ok) throw new Error(`CSS request failed: ${response.status} ${cssUrl}`);
    return response.text();
  }));
  const css = stylesheets.join('\n');

  const declaration = css.match(/--rdg-header-background-color\s*:\s*([^;]+);/)?.[1]?.trim();
  const badTransform = declaration ===
    'var(--lightningcss-light, #f9f9f9) var(--lightningcss-dark, #1b1b1b)';
  const lightControlDefined = /--lightningcss-light\s*:/.test(css);
  const darkControlDefined = /--lightningcss-dark\s*:/.test(css);
  const preservedNativeValue = declaration?.includes('light-dark(') === true;
  const directLightValue = declaration === '#f9f9f9' || declaration === 'rgb(249, 249, 249)';

  // With neither control custom property defined, substitution yields two colors.
  // That is invalid for background-color at computed-value time, so its initial
  // transparent value is rendered over the page's white background.
  const symptomPresent = badTransform && !lightControlDefined && !darkControlDefined;
  const symptomAbsent = preservedNativeValue || directLightValue;
  const computedOutcome = symptomPresent
    ? 'transparent over white (invalid background-color after var() substitution)'
    : symptomAbsent
      ? 'light gray (#f9f9f9)'
      : 'unclassified';

  console.log(JSON.stringify({
    url,
    stylesheets: cssUrls.map(String),
    declaration,
    lightControlDefined,
    darkControlDefined,
    computedOutcome,
    symptomPresent,
  }, null, 2));

  if (symptomPresent) result = 0;
  else if (symptomAbsent) result = 1;
  else {
    console.error('Unexpected served CSS state; refusing to classify the result.');
    result = 2;
  }
} catch (error) {
  console.error(error?.stack || error);
  result = 2;
} finally {
  process.exitCode = result;
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => server.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    if (server.exitCode === null) {
      server.kill('SIGKILL');
      await new Promise((resolve) => server.once('exit', resolve));
    }
  }
}

function getPort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once('error', reject);
    socket.listen(0, host, () => {
      const address = socket.address();
      const selected = typeof address === 'object' && address ? address.port : 0;
      socket.close((error) => error ? reject(error) : resolve(selected));
    });
  });
}

async function waitForPage(target, child, getLogs) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode}).\n${getLogs()}`);
    }
    try {
      const response = await fetch(target);
      if (response.ok) return response.text();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Next.js.\n${getLogs()}`);
}
