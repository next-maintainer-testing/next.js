import { spawn } from 'node:child_process';
import { once } from 'node:events';

const port = 32179;
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--turbopack', '-p', String(port)],
  { cwd: process.cwd(), env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }
);

let output = '';
for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    output += chunk;
    if (output.length > 200_000) output = output.slice(-200_000);
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let observation = null;
const deadline = Date.now() + 120_000;

try {
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/test`);
      const body = await response.text();
      observation = { status: response.status, body };
      await delay(2_000);
      break;
    } catch {
      await delay(500);
    }
  }

  const body = observation?.body ?? '';
  const renderedMarkdown = observation?.status === 200 && /<h1[^>]*>test page<\/h1>/i.test(body) && /should render/i.test(body);
  const reportedFailure = (observation?.status ?? 0) >= 500 && /(?:page\.md|Module parse failed|Unexpected character|Expected process result to be a module|Failed to write app endpoint \/test\/page)/i.test(`${body}\n${output}`);

  if (reportedFailure) {
    console.log(`SYMPTOM_PRESENT: GET /test returned ${observation.status}; the valid .md page failed to compile.\n${output.slice(-4000)}`);
    process.exitCode = 0;
  } else if (renderedMarkdown) {
    console.log('SYMPTOM_ABSENT: GET /test returned 200 and rendered the Markdown heading and body.');
    process.exitCode = 1;
  } else {
    console.error(`CHECK_FAILED: Could not classify /test. HTTP status: ${observation?.status ?? 'none'}\n${output.slice(-4000)}\n${body.slice(0, 4000)}`);
    process.exitCode = 2;
  }
} finally {
  if (child.exitCode === null) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    await Promise.race([once(child, 'exit'), delay(10_000)]);
    if (child.exitCode === null) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
      await Promise.race([once(child, 'exit'), delay(5_000)]);
    }
  }
}
