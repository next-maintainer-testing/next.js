import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

rmSync('.next', { recursive: true, force: true });

const result = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  timeout: 240_000,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
});

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
process.stdout.write(output);

const symptom = 'Edge runtime is not supported with `generateStaticParams`.';
if (result.error) {
  console.error(`Verification command failed: ${result.error.message}`);
  process.exitCode = 2;
} else if (result.status !== 0 && output.includes(symptom)) {
  console.log('Observed the reported edge sitemap build failure.');
  process.exitCode = 0;
} else if (result.status === 0) {
  console.log('Build succeeded; the reported symptom is absent.');
  process.exitCode = 1;
} else {
  console.error(`Build failed without the reported symptom (status ${result.status}).`);
  process.exitCode = 2;
}
