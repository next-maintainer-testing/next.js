import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const port = 32164;
const diagnostic = 'Server Actions must be async functions';
let output = '';
let child;
let result = 2;
let observation = 'verification did not complete';

function append(chunk) {
  output += chunk.toString();
  if (output.length > 200_000) output = output.slice(-200_000);
}

async function stopChild() {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  const exited = new Promise((resolve) => child.once('exit', resolve));
  await Promise.race([exited, delay(5000)]);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await new Promise((resolve) => child.once('exit', resolve));
  }
}

try {
  child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '--turbopack', '-p', String(port)],
    { cwd: process.cwd(), env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } },
  );
  child.stdout.on('data', append);
  child.stderr.on('data', append);

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (output.includes(diagnostic)) {
      result = 0;
      observation = `Observed false-positive diagnostic: ${diagnostic}`;
      break;
    }
    if (child.exitCode !== null) {
      observation = `Next.js dev server exited with code ${child.exitCode} before a conclusive response`;
      break;
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      const body = await response.text();
      if (output.includes(diagnostic) || body.includes(diagnostic)) {
        result = 0;
        observation = `Request to / produced false-positive diagnostic: ${diagnostic}`;
        break;
      }
      if (response.ok && body.includes('Action type:')) {
        result = 1;
        observation = 'The page compiled and rendered without the reported diagnostic';
        break;
      }
    } catch {
      // The development server is still starting.
    }
    await delay(500);
  }

  if (Date.now() >= deadline && result === 2) {
    observation = 'Timed out waiting for either the diagnostic or a successful page render';
  }
} catch (error) {
  observation = `Verification infrastructure failure: ${error instanceof Error ? error.message : String(error)}`;
} finally {
  process.exitCode = result;
  await stopChild();
  console.log(observation);
  if (result === 2) console.error(output.slice(-4000));
}
