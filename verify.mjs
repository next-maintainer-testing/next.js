import { spawn } from 'node:child_process';

const symptom = 'TypeError: this.getDefaultUrl is not a function';
const child = spawn('npm', ['run', 'dev'], {
  cwd: process.cwd(),
  detached: true,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
let settled = false;
let readyTimer;
let overallTimer;
let resolveObservation;
const observation = new Promise((resolve) => { resolveObservation = resolve; });

function finish(code) {
  if (settled) return;
  settled = true;
  clearTimeout(readyTimer);
  clearTimeout(overallTimer);
  resolveObservation(code);
}

function record(chunk) {
  const text = chunk.toString();
  process.stdout.write(text);
  output = (output + text).slice(-1_000_000);
  if (output.includes(symptom)) finish(0);
  if (/Ready in|Ready on|ready - started server/i.test(output) && !readyTimer) {
    readyTimer = setTimeout(() => finish(output.includes(symptom) ? 0 : 1), 5000);
  }
}

child.stdout.on('data', record);
child.stderr.on('data', record);
child.on('error', (error) => {
  console.error(`Failed to start the reproduction: ${error.message}`);
  finish(2);
});
child.on('exit', (code, signal) => {
  if (!settled) {
    console.error(`Development server exited before a conclusion (code=${code}, signal=${signal})`);
    finish(2);
  }
});
overallTimer = setTimeout(() => {
  console.error('Development server did not become ready before the verification timeout');
  finish(2);
}, 120_000);

async function stopChild() {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise((resolve) => child.once('close', resolve));
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
  const result = await Promise.race([
    closed.then(() => 'closed'),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 5000)),
  ]);
  if (result === 'timeout') {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    await closed;
  }
}

const code = await observation;
process.exitCode = code;
await stopChild();
