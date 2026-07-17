import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const nextPackagePath = require.resolve('next/package.json');
const nextPackage = require(nextPackagePath);
const nextVersion = nextPackage.version;
const nextMajor = Number.parseInt(nextVersion.split('.')[0], 10);
const workspace = await mkdtemp(join(tmpdir(), 'next-77381-'));

function run(command, args, cwd, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

let exitCode = 2;
try {
  await writeFile(join(workspace, 'package.json'), JSON.stringify({
    name: 'next-77381-check',
    private: true,
    type: 'module',
  }, null, 2));

  const install = await run('npm', [
    'install', '--legacy-peer-deps', '--no-audit', '--no-fund', '--ignore-scripts',
    'eslint@9.22.0',
    '@eslint/eslintrc@3.3.1',
    `eslint-config-next@${nextVersion}`,
    '@typescript-eslint/parser@8.64.0',
    '@typescript-eslint/eslint-plugin@8.64.0',
    'typescript-eslint@8.64.0',
  ], workspace, 180_000);

  if (install.code !== 0) {
    console.error(`SETUP_FAILED: npm install exited ${install.code ?? install.signal}`);
    console.error((install.stderr || install.stdout).slice(-4000));
  } else {
    const linkedNext = join(workspace, 'node_modules', 'next');
    await mkdir(dirname(linkedNext), { recursive: true });
    await symlink(dirname(nextPackagePath), linkedNext, 'dir');
    await mkdir(join(workspace, 'app'), { recursive: true });
    await writeFile(
      join(workspace, 'app', 'page.js'),
      'export default function Page() { return <main>Hello</main>; }\n',
    );

    if (nextMajor >= 16) {
      await writeFile(join(workspace, 'eslint.config.mjs'), `
import { defineConfig } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
export default defineConfig([...nextVitals]);
`);
    } else {
      await writeFile(join(workspace, 'eslint.config.mjs'), `
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });
export default [...compat.extends('next/core-web-vitals')];
`);
    }

    const lint = await run(
      join(workspace, 'node_modules', '.bin', 'eslint'),
      ['app/page.js'],
      workspace,
      60_000,
    );
    const output = `${lint.stdout}\n${lint.stderr}`;
    const missingTypeScript =
      /Cannot find module ['"]typescript['"]/.test(output) &&
      /(?:typescript-eslint|@typescript-eslint|typescript-estree)/.test(output);

    if (missingTypeScript) {
      console.log(`SYMPTOM_PRESENT: eslint-config-next@${nextVersion} cannot lint JavaScript without TypeScript installed.`);
      console.log(output.slice(-4000));
      exitCode = 0;
    } else if (lint.code === 0) {
      console.log(`SYMPTOM_ABSENT: eslint-config-next@${nextVersion} linted the JavaScript file without TypeScript.`);
      exitCode = 1;
    } else {
      console.error(`CHECK_FAILED: ESLint exited ${lint.code ?? lint.signal} for an unrelated reason.`);
      console.error(output.slice(-4000));
      exitCode = 2;
    }
  }
} catch (error) {
  console.error('CHECK_FAILED:', error?.stack || error);
  exitCode = 2;
}

process.exitCode = exitCode;
await rm(workspace, { recursive: true, force: true });
