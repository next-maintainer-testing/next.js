import { readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const marker = 'ISSUE_75180_UNUSED_MESSAGE_d53a1742';

function runNextBuild() {
  return new Promise((resolve, reject) => {
    const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
    const child = spawn(process.execPath, [nextBin, 'build'], {
      cwd: process.cwd(),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
}

try {
  await rm('.next', { recursive: true, force: true });
  const build = await runNextBuild();
  if (build.code !== 0) {
    console.error(`CHECK_FAILED: next build exited with code ${build.code} signal ${build.signal ?? 'none'}`);
    process.exitCode = 2;
  } else {
    const manifest = JSON.parse(await readFile('.next/server/middleware-manifest.json', 'utf8'));
    const middleware = manifest.middleware?.['/'];
    if (!middleware || !Array.isArray(middleware.files)) {
      console.error('CHECK_FAILED: middleware entry or files missing from middleware manifest');
      process.exitCode = 2;
    } else {
      const observations = [];
      let markerFound = false;
      for (const relativeFile of middleware.files) {
        const contents = await readFile(path.join('.next', relativeFile));
        const containsMarker = contents.includes(Buffer.from(marker));
        markerFound ||= containsMarker;
        observations.push(`${relativeFile}:${contents.byteLength}:${containsMarker ? 'contains-unused-message' : 'no-marker'}`);
      }
      console.log(`OBSERVED_MIDDLEWARE_FILES ${observations.join(',')}`);
      console.log(markerFound
        ? 'SYMPTOM_PRESENT: unused getMessages JSON content is bundled into a middleware file'
        : 'SYMPTOM_ABSENT: unused getMessages JSON content is not bundled into middleware files');
      process.exitCode = markerFound ? 0 : 1;
    }
  }
} catch (error) {
  console.error('CHECK_FAILED:', error?.stack || error);
  process.exitCode = 2;
}
