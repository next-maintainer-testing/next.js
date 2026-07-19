import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let workspace;

try {
  const nextPackage = JSON.parse(
    await readFile(new URL('./node_modules/next/package.json', import.meta.url), 'utf8'),
  );
  const bundleRoot = new URL(`./bundled-cna/${nextPackage.version}/`, import.meta.url);
  const cnaPackage = JSON.parse(
    await readFile(new URL('./package.json', bundleRoot), 'utf8'),
  );
  if (cnaPackage.version !== nextPackage.version) {
    throw new Error(`bundled create-next-app ${cnaPackage.version} does not match Next.js ${nextPackage.version}`);
  }

  workspace = await mkdtemp(join(tmpdir(), 'cna-sort-check-'));
  const appDir = join(workspace, 'generated-app');
  const cli = new URL('./dist/index.js', bundleRoot);
  const run = spawnSync(
    process.execPath,
    [
      cli.pathname,
      appDir,
      '--use-npm',
      '--typescript',
      '--tailwind',
      '--eslint',
      '--app',
      '--src-dir',
      '--import-alias',
      '@/*',
      '--skip-install',
      '--yes',
    ],
    {
      encoding: 'utf8',
      timeout: 180_000,
      env: { ...process.env, CI: '1', npm_config_update_notifier: 'false' },
    },
  );

  if (run.error || run.status !== 0) {
    const detail = run.error?.message ?? run.stderr?.trim() ?? `exit ${run.status}`;
    throw new Error(`create-next-app ${cnaPackage.version} failed: ${detail}`);
  }

  const generated = JSON.parse(await readFile(join(appDir, 'package.json'), 'utf8'));
  const unsorted = [];
  for (const section of ['dependencies', 'devDependencies']) {
    const actual = Object.keys(generated[section] ?? {});
    const sorted = [...actual].sort((a, b) => a.localeCompare(b));
    if (actual.join('\n') !== sorted.join('\n')) {
      unsorted.push(`${section}: ${actual.join(', ')}`);
    }
  }

  if (unsorted.length > 0) {
    console.log(`BUG PRESENT: create-next-app ${cnaPackage.version} generated unsorted package.json sections`);
    for (const line of unsorted) console.log(line);
    process.exitCode = 0;
  } else {
    console.log(`BUG ABSENT: create-next-app ${cnaPackage.version} generated sorted dependencies and devDependencies`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`CHECK FAILED: ${error.stack ?? error}`);
  process.exitCode = 2;
} finally {
  if (workspace) await rm(workspace, { recursive: true, force: true });
}
