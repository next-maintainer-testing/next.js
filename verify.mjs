import {rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';

const cwd = new URL('.', import.meta.url).pathname;
const env = {...process.env, NEXT_TELEMETRY_DISABLED: '1'};
let child;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      env,
      stdio: options.stdio || 'inherit',
    });
    proc.once('error', reject);
    proc.once('exit', (code, signal) => resolve({code, signal}));
  });
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForPage(url, childExited) {
  let lastError;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (childExited.value) {
      throw new Error(`Next.js server exited before becoming ready (${childExited.value})`);
    }
    try {
      const response = await fetch(url, {redirect: 'manual'});
      if (response.status === 200) return response;
      lastError = new Error(`page returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error('server did not become ready');
}

async function stopChild() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function main() {
  await rm(`${cwd}.next`, {recursive: true, force: true});
  const build = await run(process.execPath, ['./node_modules/next/dist/bin/next', 'build']);
  if (build.code !== 0) {
    throw new Error(`next build failed (code=${build.code}, signal=${build.signal})`);
  }

  const port = await reservePort();
  const childExited = {value: null};
  child = spawn(process.execPath, ['server.js'], {
    cwd,
    env: {...env, NODE_ENV: 'production', PORT: String(port)},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  child.once('exit', (code, signal) => {
    childExited.value = `code=${code}, signal=${signal}`;
  });

  const origin = `http://127.0.0.1:${port}`;
  const pageResponse = await waitForPage(`${origin}/en`, childExited);
  const html = await pageResponse.text();
  const sources = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map((match) => match[1]);
  const encodedChunk = sources.find((source) => /%5B[^/]+%5D/i.test(source));

  if (!encodedChunk) {
    console.log('Symptom absent: the locale page has no script URL containing encoded dynamic-route brackets.');
    return 1;
  }

  const canonicalUrl = new URL(encodedChunk, origin);
  const canonicalResponse = await fetch(canonicalUrl, {redirect: 'manual'});
  await canonicalResponse.arrayBuffer();
  if (canonicalResponse.status !== 200) {
    throw new Error(`canonical encoded chunk returned HTTP ${canonicalResponse.status}: ${canonicalUrl.pathname}`);
  }

  const lowercasePath = `${canonicalUrl.pathname}${canonicalUrl.search}`
    .replaceAll('%5B', '%5b')
    .replaceAll('%5D', '%5d');
  if (lowercasePath === `${canonicalUrl.pathname}${canonicalUrl.search}`) {
    throw new Error(`script URL did not preserve uppercase percent escapes: ${canonicalUrl.pathname}`);
  }

  const lowercaseResponse = await fetch(`${origin}${lowercasePath}`, {redirect: 'manual'});
  await lowercaseResponse.arrayBuffer();
  console.log(`Canonical chunk: ${canonicalResponse.status} ${canonicalUrl.pathname}`);
  console.log(`Lowercase escapes: ${lowercaseResponse.status} ${lowercasePath}`);

  if (lowercaseResponse.status === 404) {
    console.log('Symptom present: lowercasing percent-encoded brackets makes the required route chunk fail to load.');
    return 0;
  }
  if (lowercaseResponse.status === 200) {
    console.log('Symptom absent: lowercase percent-encoded brackets load the same route chunk.');
    return 1;
  }
  throw new Error(`lowercase encoded chunk returned unexpected HTTP ${lowercaseResponse.status}`);
}

let result = 2;
try {
  result = await main();
} catch (error) {
  console.error(error?.stack || error);
  result = 2;
} finally {
  // Make the verdict durable before releasing the final child-process handles.
  process.exitCode = result;
  await stopChild();
}
