import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

rmSync('.next', { recursive: true, force: true });

const result = spawnSync('npm', ['run', 'build'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  timeout: 240_000,
});

const output = `${result.stdout || ''}\n${result.stderr || ''}`;
process.stdout.write(output);

if (result.error) {
  console.error(result.error);
  process.exitCode = 2;
} else if (result.status === 0) {
  console.log('SYMPTOM_ABSENT: The application built successfully.');
  process.exitCode = 1;
} else if (/useActionState[\s\S]{0,240}(?:not exported|is not a function)|(?:not exported|is not a function)[\s\S]{0,240}useActionState/i.test(output)) {
  console.log('SYMPTOM_PRESENT: React 18 does not provide useActionState, so the forms application cannot build.');
  process.exitCode = 0;
} else {
  console.error(`CHECK_FAILED: Build exited ${result.status} without the reported useActionState failure.`);
  process.exitCode = 2;
}
