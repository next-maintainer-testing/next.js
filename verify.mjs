import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const finish = (code, message) => {
  console.log(message);
  process.exitCode = code;
};

try {
  const pagesDirs = ['pages', join('src', 'pages')].filter(existsSync);
  if (pagesDirs.length !== 0) {
    finish(2, `check failed: reproduction is not App-Router-only (${pagesDirs.join(', ')})`);
  } else {
    rmSync('.next', { force: true, recursive: true });

    const nextBin = fileURLToPath(import.meta.resolve('next/dist/bin/next'));
    const build = spawnSync(process.execPath, [nextBin, 'build'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      maxBuffer: 20 * 1024 * 1024,
      timeout: 240_000,
    });

    if (build.stdout) process.stdout.write(build.stdout);
    if (build.stderr) process.stderr.write(build.stderr);

    if (build.error || build.status !== 0) {
      finish(2, `check failed: next build did not complete (status=${build.status}, error=${build.error?.message ?? 'none'})`);
    } else {
      const manifestPath = join('.next', 'build-manifest.json');
      if (!existsSync(manifestPath)) {
        finish(2, 'check failed: next build produced no build-manifest.json');
      } else {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        const errorFiles = manifest.pages?.['/_error'];
        const generatedErrorFiles = Array.isArray(errorFiles)
          ? errorFiles.filter((file) => /(?:^|\/)pages\/_error-[^/]+\.js$/.test(file))
          : [];
        const missingFiles = Array.isArray(errorFiles)
          ? errorFiles.filter((file) => !existsSync(join('.next', file)))
          : [];
        const symptomPresent =
          Array.isArray(errorFiles) &&
          errorFiles.length > 0 &&
          generatedErrorFiles.length > 0 &&
          missingFiles.length === 0;

        const evidence = JSON.stringify({
          appRouterOnly: true,
          pagesErrorEntry: errorFiles ?? null,
          generatedErrorFiles,
          allManifestFilesExist: missingFiles.length === 0,
          rootMainFiles: manifest.rootMainFiles ?? null,
        });

        finish(
          symptomPresent ? 0 : 1,
          symptomPresent
            ? `symptom present: App-Router-only build emitted the Pages Router /_error client bundle; ${evidence}`
            : `symptom absent: App-Router-only build did not emit a complete Pages Router /_error client bundle; ${evidence}`,
        );
      }
    }
  }
} catch (error) {
  finish(2, `check failed: ${error?.stack ?? error}`);
}
