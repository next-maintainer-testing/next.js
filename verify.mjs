import { rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const timeoutMs = 280_000;
await rm('.next', { recursive: true, force: true });

const child = spawn('npm', ['run', 'build'], {
  cwd: process.cwd(),
  env: { ...process.env, CI: '1', NEXT_TELEMETRY_DISABLED: '1' },
  shell: process.platform === 'win32',
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
});
child.stderr.on('data', (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stderr.write(text);
});

let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  child.kill('SIGTERM');
}, timeoutMs);

const result = await new Promise((resolve) => {
  child.once('error', (error) => resolve({ error }));
  child.once('close', (code, signal) => resolve({ code, signal }));
});
clearTimeout(timer);

const warningPresent =
  output.includes('ConsoleMetricExporter.js') &&
  output.includes('A Node.js API is used (setImmediate') &&
  output.includes('which is not supported in the Edge Runtime');

if (timedOut) {
  console.error(`Verification failed: build timed out after ${timeoutMs}ms.`);
  process.exitCode = 2;
} else if ('error' in result) {
  console.error(`Verification failed to start build: ${result.error.message}`);
  process.exitCode = 2;
} else if (result.code !== 0) {
  console.error(`Verification failed: build exited with code ${result.code}, signal ${result.signal ?? 'none'}.`);
  process.exitCode = 2;
} else if (warningPresent) {
  console.log('SYMPTOM_PRESENT: tree-shaken ConsoleMetricExporter setImmediate warning was emitted.');
  process.exitCode = 0;
} else {
  console.log('SYMPTOM_ABSENT: build succeeded without the tree-shaken ConsoleMetricExporter setImmediate warning.');
  process.exitCode = 1;
}
