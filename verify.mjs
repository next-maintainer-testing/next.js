import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['./node_modules/jest/bin/jest.js', '--runInBand', '--no-cache'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  timeout: 240_000,
  env: { ...process.env, CI: 'true' },
});

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
process.stdout.write(output);

if (result.error) {
  console.error(`Verification command failed: ${result.error.message}`);
  process.exitCode = 2;
} else if (/ReferenceError:\s*TextEncoder is not defined/.test(output)) {
  console.log('REPRODUCED: loading Next.js in Jest JSDOM threw "TextEncoder is not defined".');
  process.exitCode = 0;
} else if (result.status === 0) {
  console.log('NOT REPRODUCED: Jest JSDOM loaded Next.js without the TextEncoder error.');
  process.exitCode = 1;
} else {
  console.error(`INCONCLUSIVE: Jest failed for a different reason (exit ${result.status}).`);
  process.exitCode = 2;
}
