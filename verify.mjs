import { readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const mismatch =
  "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering.";
const nextBin = path.join(
  process.cwd(),
  'node_modules',
  'next',
  'dist',
  'bin',
  'next',
);

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      ...options,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > 2_000_000) stdout = stdout.slice(-2_000_000);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.length > 2_000_000) stderr = stderr.slice(-2_000_000);
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Timed out: ${command} ${args.join(' ')}`));
    }, 240_000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('close', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await new Promise((resolve) => child.once('close', resolve));
  }
}

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) {
      throw new Error(`Next server exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Next server did not become ready');
}

let server;
let resultCode = 2;
try {
  await rm('.next', { recursive: true, force: true });
  const built = await run(process.execPath, [nextBin, 'build'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (built.code !== 0) {
    console.error('Build failed; the symptom check could not run.');
    console.error((built.stdout + built.stderr).slice(-12_000));
    resultCode = 2;
  } else {
    const metaPath = path.join(
      '.next',
      'server',
      'app',
      'blog',
      'known.meta',
    );
    const meta = JSON.parse(await readFile(metaPath, 'utf8'));
    if (typeof meta.postponed !== 'string' || meta.postponed.length === 0) {
      throw new Error(`No postponed PPR state found in ${metaPath}`);
    }

    const port = 41_000 + (process.pid % 1_000);
    let serverLog = '';
    server = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NEXT_PRIVATE_MINIMAL_MODE: '1',
        PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const append = (chunk) => {
      serverLog += chunk;
      if (serverLog.length > 1_000_000) {
        serverLog = serverLog.slice(-1_000_000);
      }
    };
    server.stdout.on('data', append);
    server.stderr.on('data', append);

    const origin = `http://127.0.0.1:${port}`;
    await waitForServer(`${origin}/blog/known`, server);

    const shell = await fetch(`${origin}/blog/known`, {
      headers: { 'x-matched-path': '/blog/known' },
    });
    const shellBody = await shell.text();
    if (!shell.ok || !shellBody.includes('data-page="known"')) {
      throw new Error('Concrete prerendered blog route did not return its page shell');
    }

    const resumed = await fetch(
      `${origin}/_next/postponed/resume/blog/known`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          'x-matched-path': '/_next/postponed/resume/blog/[slug]',
        },
        body: meta.postponed,
      },
    );
    const resumeBody = await resumed.text();
    await new Promise((resolve) => setTimeout(resolve, 500));

    const reproduced = serverLog.includes(mismatch);
    console.log(
      JSON.stringify({
        next: JSON.parse(
          await readFile(path.join('node_modules', 'next', 'package.json'), 'utf8'),
        ).version,
        shellStatus: shell.status,
        resumeStatus: resumed.status,
        resumeBytes: Buffer.byteLength(resumeBody),
        mismatchLogged: reproduced,
      }),
    );
    if (reproduced) {
      console.log(mismatch);
      resultCode = 0;
    } else {
      console.log('The resumable-slot tree mismatch was not logged.');
      resultCode = 1;
    }
  }
} catch (error) {
  console.error(error?.stack || error);
  resultCode = 2;
} finally {
  process.exitCode = resultCode;
  await stop(server);
}
