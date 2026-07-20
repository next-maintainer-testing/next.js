import { spawn } from 'node:child_process';

const port = 3000;
const origin = `http://127.0.0.1:${port}`;
let output = '';
let child;

function append(chunk) {
  output += chunk.toString();
  if (output.length > 20_000) output = output.slice(-20_000);
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'));
  return match?.[1];
}

async function waitForPage() {
  const deadline = Date.now() + 120_000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before serving the page (code ${child.exitCode})`);
    }
    try {
      const response = await fetch(`${origin}/`);
      if (response.ok) return await response.text();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for Next.js: ${lastError?.message ?? 'unknown error'}`);
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ]);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await new Promise((resolve) => child.once('exit', resolve));
  }
}

try {
  child = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', append);
  child.stderr.on('data', append);

  const html = await waitForPage();
  const alternateTags = html.match(/<link\b[^>]*\brel=["']alternate["'][^>]*>/gi) ?? [];
  const hrefByLanguage = new Map(
    alternateTags.map((tag) => [attr(tag, 'hreflang'), attr(tag, 'href')])
  );
  const en = hrefByLanguage.get('en');
  const ko = hrefByLanguage.get('ko');
  if (!en || !ko) {
    throw new Error(`Missing alternate language links. Found: ${JSON.stringify([...hrefByLanguage])}`);
  }

  const enUrl = new URL(en);
  const koUrl = new URL(ko);
  const stripped = !enUrl.search && !koUrl.search;
  const preserved = enUrl.searchParams.get('hl') === 'en_US' &&
    koUrl.searchParams.get('hl') === 'ko_KR';

  if (stripped) {
    console.log(`SYMPTOM PRESENT: alternate query strings were stripped (en=${en}, ko=${ko})`);
    process.exitCode = 0;
  } else if (preserved) {
    console.log(`SYMPTOM ABSENT: alternate query strings were preserved (en=${en}, ko=${ko})`);
    process.exitCode = 1;
  } else {
    throw new Error(`Unexpected alternate hrefs (en=${en}, ko=${ko})`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  console.error(output);
  process.exitCode = 2;
} finally {
  await stopServer();
}
