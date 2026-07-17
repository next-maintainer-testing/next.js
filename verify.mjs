import { rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const buildTimeoutMs = 240_000;

async function runBuild() {
  await rm('.next', { recursive: true, force: true });

  return await new Promise((resolve) => {
    const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
      cwd: process.cwd(),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, buildTimeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ error, stdout, stderr, timedOut });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut });
    });
  });
}

const result = await runBuild();
const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
const normalized = output.replace(/\u001b\[[0-9;]*m/g, '');
const hasDirectiveError = normalized.includes(
  'Only async functions are allowed to be exported in a "use cache" file.'
);
const identifiesPprExport = normalized.includes('export const experimental_ppr = true');

if (hasDirectiveError && identifiesPprExport) {
  console.log('REPRODUCED: next build rejected experimental_ppr in the use-cache page.');
  process.exitCode = 0;
} else if (result.code === 0) {
  console.log('ABSENT: next build completed without the reported use-cache export error.');
  process.exitCode = 1;
} else {
  console.error('CHECK_FAILED: next build failed without the reported diagnostic.');
  console.error(normalized.slice(-4000));
  if (result.timedOut) console.error('Build timed out.');
  if (result.error) console.error(result.error);
  process.exitCode = 2;
}
