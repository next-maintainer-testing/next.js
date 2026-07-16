import { spawn } from 'node:child_process';

const cwd = new URL('.', import.meta.url).pathname;
const nextBin = `${cwd}node_modules/next/dist/bin/next`;
const port = 31000 + (process.pid % 1000);

function run(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBin, ...args], {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { output += chunk; process.stderr.write(chunk); });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Timed out: next ${args.join(' ')}`));
    }, timeoutMs);
    child.once('error', reject);
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, output });
    });
  });
}

function waitForExit(child) {
  return new Promise((resolve) => child.once('close', resolve));
}

let server;
let finalCode = 2;
try {
  const build = await run(['build', '--turbopack'], 220_000);
  if (build.code !== 0) throw new Error(`Production build failed with code ${build.code}`);

  server = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => process.stdout.write(chunk));
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));

  let htmlResponse;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Production server exited early with code ${server.exitCode}`);
    try {
      htmlResponse = await fetch(`http://127.0.0.1:${port}/`);
      if (htmlResponse.ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!htmlResponse?.ok) throw new Error('Production page did not become available');

  const html = await htmlResponse.text();
  if (!html.includes('<style')) throw new Error('Expected production HTML to contain inline CSS');
  const candidates = [...html.matchAll(/url\((?:&quot;|["']?)([^)"']+?)(?:&quot;|["']?)\)/g)]
    .map((match) => match[1])
    .filter((url) => /\.(?:woff2?|ttf|otf)(?:\?|$)/i.test(url));
  const fontUrls = [...new Set(candidates)];
  if (fontUrls.length === 0) throw new Error('No generated font URL was found in inline CSS');

  const observations = [];
  for (const fontUrl of fontUrls) {
    const absolute = new URL(fontUrl, `http://127.0.0.1:${port}/`);
    const response = await fetch(absolute);
    observations.push({ url: absolute.pathname, status: response.status });
  }
  console.log(`FONT_URL_OBSERVATIONS ${JSON.stringify(observations)}`);

  if (observations.some(({ status }) => status === 404)) {
    console.log('SYMPTOM_PRESENT: generated Google font URL returns 404 in production');
    finalCode = 0;
  } else if (observations.every(({ status }) => status >= 200 && status < 300)) {
    console.log('SYMPTOM_ABSENT: every generated Google font URL is served');
    finalCode = 1;
  } else {
    throw new Error('Font request returned an indeterminate non-2xx, non-404 response');
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error.stack || error}`);
  finalCode = 2;
} finally {
  process.exitCode = finalCode;
  if (server && server.exitCode === null) {
    const exited = waitForExit(server);
    server.kill('SIGTERM');
    await exited;
  }
}
