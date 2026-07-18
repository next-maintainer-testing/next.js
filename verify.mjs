import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const root = process.cwd();
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
let child;

function choosePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function decodeHtml(value) {
  return value.replaceAll('&amp;', '&').replaceAll('&#x27;', "'").replaceAll('&quot;', '"');
}

function normalizeColor(value) {
  return value.trim().toLowerCase().replaceAll(' ', '');
}

function findAppliedBackground(cssTexts, buttonClasses) {
  let applied = null;
  const observations = [];
  let order = 0;

  for (const css of cssTexts) {
    const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
    for (const match of css.matchAll(rulePattern)) {
      const selectorText = match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
      const declarationText = match[2];
      const backgrounds = [...declarationText.matchAll(/(?:^|;)\s*background-color\s*:\s*([^;!}]+)(?:\s*!important)?\s*(?=;|$)/gi)];
      if (backgrounds.length === 0) continue;

      for (const selector of selectorText.split(',')) {
        const clean = selector.trim();
        const classes = [...clean.matchAll(/\.([_a-zA-Z][-_a-zA-Z0-9]*)/g)].map((item) => item[1]);
        const unsupported = clean.replace(/\.([_a-zA-Z][-_a-zA-Z0-9]*)/g, '').trim();
        if (classes.length === 0 || unsupported !== '' || !classes.every((name) => buttonClasses.has(name))) continue;

        for (const background of backgrounds) {
          const color = normalizeColor(background[1]);
          order += 1;
          observations.push({ order, selector: clean, color });
          applied = { order, selector: clean, color };
        }
      }
    }
  }

  return { applied, observations };
}

async function fetchReady(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'server did not answer';
  while (Date.now() < deadline) {
    if (child?.exitCode !== null) throw new Error(`Next.js dev server exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(url);
      const body = await response.text();
      if (response.ok && body.includes('Carousel Button')) return body;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for rendered page: ${lastError}`);
}

async function stopChild() {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const timeout = new Promise((resolve) => setTimeout(resolve, 5000, 'timeout'));
  if (await Promise.race([exited, timeout]) === 'timeout' && child.exitCode === null) {
    child.kill('SIGKILL');
    await new Promise((resolve) => child.once('exit', resolve));
  }
}

try {
  if (!existsSync(nextBin)) throw new Error(`Next.js binary not found at ${nextBin}`);
  const port = await choosePort();
  child = spawn(process.execPath, [nextBin, 'dev', '--turbopack', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverOutput = '';
  child.stdout.on('data', (chunk) => { serverOutput += chunk; });
  child.stderr.on('data', (chunk) => { serverOutput += chunk; });

  const baseUrl = `http://127.0.0.1:${port}`;
  const html = await fetchReady(baseUrl, 120000);
  const buttonMatch = html.match(/<button\b[^>]*\bclass=["']([^"']+)["'][^>]*>\s*Carousel Button\s*<\/button>/i);
  if (!buttonMatch) throw new Error('Rendered Carousel Button and its CSS classes were not found');
  const buttonClasses = new Set(decodeHtml(buttonMatch[1]).split(/\s+/).filter(Boolean));

  const stylesheetUrls = [...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => new URL(decodeHtml(match[1]), baseUrl).href);
  if (stylesheetUrls.length === 0) throw new Error('Rendered page did not link any stylesheets');

  const cssTexts = [];
  for (const stylesheetUrl of stylesheetUrls) {
    const response = await fetch(stylesheetUrl);
    if (!response.ok) throw new Error(`Stylesheet request failed with HTTP ${response.status}: ${stylesheetUrl}`);
    cssTexts.push(await response.text());
  }

  const { applied, observations } = findAppliedBackground(cssTexts, buttonClasses);
  if (!applied) throw new Error(`No applicable background-color rule found for button classes: ${[...buttonClasses].join(' ')}`);

  const blueValues = new Set(['#007bff', 'rgb(0,123,255)', 'rgb(0,123,255,1)']);
  const orangeValues = new Set(['orange', '#ffa500', 'rgb(255,165,0)', 'rgb(255,165,0,1)']);
  const present = blueValues.has(applied.color);
  const absent = orangeValues.has(applied.color);
  if (!present && !absent) throw new Error(`Unexpected applied background-color: ${applied.color}`);

  process.exitCode = present ? 0 : 1;
  console.log(JSON.stringify({
    symptom: present ? 'present' : 'absent',
    renderedButtonClasses: [...buttonClasses],
    applicableBackgroundRules: observations,
    appliedBackgroundColor: applied.color,
    expectedBackgroundColor: 'orange',
    mode: 'next dev --turbopack',
  }));
} catch (error) {
  process.exitCode = 2;
  console.error(error.stack || error.message || String(error));
} finally {
  await stopChild();
}
