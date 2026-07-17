import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

rmSync('.next', { recursive: true, force: true });

const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname;
const result = spawnSync(process.execPath, [nextBin, 'build'], {
  cwd: new URL('.', import.meta.url),
  encoding: 'utf8',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  timeout: 280_000,
});

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
process.stdout.write(output);

if (result.error) {
  console.error(`Verification command failed: ${result.error.message}`);
  process.exitCode = 2;
} else if (result.status === 0) {
  console.log('SYMPTOM_ABSENT: next build completed successfully.');
  process.exitCode = 1;
} else if (/ReferenceError:\s*range is not defined/.test(output) && /prerendering page ["']?\/["']?/i.test(output)) {
  console.log('SYMPTOM_PRESENT: prerendering failed because range is not defined.');
  process.exitCode = 0;
} else {
  console.error(`CHECK_FAILED: next build exited ${result.status} without the reported ReferenceError.`);
  process.exitCode = 2;
}
