import { spawn } from 'node:child_process';

const port = 32165;
const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname;
let output = '';
let closed = false;
let closeCode = null;

const child = spawn(process.execPath, [nextBin, 'dev', '-p', String(port)], {
  cwd: new URL('.', import.meta.url).pathname,
  detached: true,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const append = (chunk) => {
  output += chunk.toString();
  if (output.length > 100_000) output = output.slice(-100_000);
};
child.stdout.on('data', append);
child.stderr.on('data', append);
child.on('close', (code) => {
  closed = true;
  closeCode = code;
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const conflict = () =>
  /You cannot use different slug names for the same dynamic path/i.test(output) ||
  /different slug names[\s\S]{0,200}(?:id|projectId)/i.test(output);
const ready = () => /(?:^|\n)\s*[✓✔]?\s*Ready in|Local:\s+http:\/\//i.test(output);

async function stop() {
  if (closed) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {}
  for (let i = 0; i < 30 && !closed; i++) await sleep(100);
  if (!closed) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {}
    for (let i = 0; i < 20 && !closed; i++) await sleep(100);
  }
}

let result = 2;
let observation = '';
const deadline = Date.now() + 45_000;

while (Date.now() < deadline && !conflict() && !ready() && !closed) {
  await sleep(100);
}

if (conflict()) {
  result = 0;
  observation = 'Next.js rejected the route tree because id and projectId use different slug names for the same dynamic path.';
} else if (!ready()) {
  observation = `next dev did not become ready and did not emit the reported conflict (exit ${closeCode}).`;
} else {
  for (const path of ['/api/projects/example', '/api/projects/example/governance/proposals']) {
    try {
      await fetch(`http://127.0.0.1:${port}${path}`, {
        signal: AbortSignal.timeout(15_000),
      });
    } catch {}
    if (conflict()) break;
  }
  const settleUntil = Math.min(deadline, Date.now() + 3_000);
  while (Date.now() < settleUntil && !conflict() && !closed) await sleep(100);

  if (conflict()) {
    result = 0;
    observation = 'Next.js rejected the route tree because id and projectId use different slug names for the same dynamic path.';
  } else if (closed) {
    observation = `next dev exited unexpectedly without the reported conflict (exit ${closeCode}).`;
  } else {
    result = 1;
    observation = 'Both conflicting-route requests completed without Next.js emitting the reported dynamic-slug conflict.';
  }
}

process.exitCode = result;
console.log(observation);
if (result === 2) console.error(output.slice(-4000));
await stop();
