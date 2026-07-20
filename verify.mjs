import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

try {
  rmSync('.next', { recursive: true, force: true });
} catch (error) {
  console.error('Failed to reset .next:', error);
  process.exitCode = 2;
}

if (process.exitCode === undefined) {
  const run = spawnSync('npm', ['run', 'build'], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    encoding: 'utf8',
    timeout: 240_000,
  });

  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  process.stdout.write(output);

  if (run.error) {
    console.error('Build command failed to run:', run.error);
    process.exitCode = 2;
  } else if (run.signal) {
    console.error(`Build ended with signal ${run.signal}`);
    process.exitCode = 2;
  } else if (/Module not found:\s*Can't resolve ['"]#async_hooks['"]/.test(output)) {
    console.log('Observed the reported #async_hooks resolution failure.');
    process.exitCode = 0;
  } else if (run.status === 0) {
    console.log('Build succeeded; the reported symptom is absent.');
    process.exitCode = 1;
  } else {
    console.error(`Build failed without the reported symptom (exit ${run.status}).`);
    process.exitCode = 2;
  }
}
