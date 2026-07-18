import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, cp, rm, access } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let tempRoot;

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

try {
  const nextPackagePath = require.resolve('next/package.json');
  const nextVersion = JSON.parse(readFileSync(nextPackagePath, 'utf8')).version;
  tempRoot = await mkdtemp(join(tmpdir(), 'cna-github-repro-'));
  const targetDir = join(tempRoot, 'app');
  await mkdir(targetDir);
  await cp(new URL('./.github', import.meta.url), join(targetDir, '.github'), { recursive: true });

  const result = await run(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    [
      '--yes',
      `create-next-app@${nextVersion}`,
      '.',
      '--typescript',
      '--tailwind',
      '--eslint',
      '--app',
      '--turbopack',
      '--import-alias',
      '@/*',
      '--use-npm',
      '--no-src-dir',
      '--skip-install',
      '--disable-git',
      '--yes',
    ],
    { cwd: targetDir, env: { ...process.env, CI: '1' } },
  );

  const output = `${result.stdout}\n${result.stderr}`;
  const reportsConflict = /contains files that could conflict/i.test(output) && /\.github\/?/i.test(output);
  let packageCreated = true;
  try {
    await access(join(targetDir, 'package.json'));
  } catch {
    packageCreated = false;
  }

  if (result.code !== 0 && reportsConflict && !packageCreated) {
    console.log(`REPRODUCED: create-next-app@${nextVersion} rejected an otherwise empty directory because it contained .github.`);
    process.exitCode = 0;
  } else if (result.code === 0 && packageCreated) {
    console.log(`NOT_REPRODUCED: create-next-app@${nextVersion} accepted the directory containing .github.`);
    process.exitCode = 1;
  } else {
    console.error(`CHECK_FAILED: create-next-app@${nextVersion} exited with code ${result.code} signal ${result.signal ?? 'none'}.`);
    console.error(output.slice(-4000));
    process.exitCode = 2;
  }
} catch (error) {
  console.error('CHECK_FAILED:', error);
  process.exitCode = 2;
} finally {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
