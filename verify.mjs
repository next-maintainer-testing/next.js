import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));
const nextBin = require.resolve('next/dist/bin/next', { paths: [root] });
const preload = path.join(root, 'emulate-windows-eperm.cjs');
const baseEnv = { ...process.env, CI: '1', NEXT_TELEMETRY_DISABLED: '1' };

function build(env) {
  const result = spawnSync(process.execPath, [nextBin, 'build'], {
    cwd: root,
    encoding: 'utf8',
    env,
    maxBuffer: 16 * 1024 * 1024,
    timeout: 135_000,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output);
  return { ...result, output };
}

rmSync(path.join(root, '.next'), { recursive: true, force: true });
const seed = build(baseEnv);
if (seed.error || seed.status !== 0) {
  console.error('The clean seed build failed before the reported condition could be checked.');
  if (seed.error) console.error(seed.error);
  process.exitCode = 2;
} else {
  const result = build({
    ...baseEnv,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require=${preload}`.trim(),
  });
  const reproduced =
    /EPERM:\s*operation not permitted,\s*scandir/i.test(result.output) &&
    /[\\/]\.next[\\/]standalone[\\/](?:.*[\\/])?node_modules[\\/]next/i.test(result.output);

  if (reproduced) {
    console.log('Observed the reported EPERM scandir build failure.');
    process.exitCode = 0;
  } else if (!result.error && result.status === 0) {
    console.log('Build completed without the reported EPERM scandir failure.');
    process.exitCode = 1;
  } else {
    console.error('Build failed without the reported EPERM scandir symptom.');
    if (result.error) console.error(result.error);
    process.exitCode = 2;
  }
}
