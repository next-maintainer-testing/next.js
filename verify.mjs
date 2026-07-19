import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

rmSync('.next', { recursive: true, force: true });

const result = spawnSync(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'build'],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    maxBuffer: 50 * 1024 * 1024,
  },
);

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
process.stdout.write(output);

const symptom = /Cannot find module ['"][^'"]*node_modules[\\/]rc-util[\\/]es[\\/]utils[\\/]get['"] imported from [^\n]*node_modules[\\/]rc-util[\\/]es[\\/]utils[\\/]set\.js/.test(output);

if (symptom && result.status !== 0) {
  console.log('VERDICT: reproduced rc-util ERR_MODULE_NOT_FOUND during next build');
  process.exitCode = 0;
} else if (result.status === 0) {
  console.log('VERDICT: next build completed without the reported error');
  process.exitCode = 1;
} else {
  console.error(`CHECK_FAILED: next build exited ${result.status ?? 'without a status'} without the reported error`);
  if (result.error) console.error(result.error);
  process.exitCode = 2;
}
