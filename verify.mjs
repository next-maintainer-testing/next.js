import { spawnSync } from 'node:child_process';

const result = spawnSync('npm', ['run', 'build', '--', '--turbopack'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_PRIVY_KEY: 'cmbyj6pd30025l70n97xmmd95',
  },
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
});

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
process.stdout.write(output);

if (result.error) {
  console.error(`Failed to execute Next.js build: ${result.error.message}`);
  process.exitCode = 2;
} else if (result.status === 0) {
  console.log('Build succeeded; reported prerender failure is absent.');
  process.exitCode = 1;
} else if (
  /Error occurred prerendering page/.test(output) &&
  /TypeError: [A-Za-z_$][\w$]* is not iterable/.test(output)
) {
  console.log('Observed reported Turbopack prerender TypeError.');
  process.exitCode = 0;
} else {
  console.error(`Build failed without the reported symptom (status ${result.status}).`);
  process.exitCode = 2;
}
