import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { rm } from 'node:fs/promises';

const cwd = new URL('.', import.meta.url).pathname;
const nextBin = `${cwd}node_modules/.bin/next`;
let server;
let finalCode = 2;

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const collect = (chunk) => {
      output += chunk.toString();
      if (output.length > 12000) output = output.slice(-12000);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new Error(`${command} exited with ${code ?? signal}\n${output}`));
    });
  });
}

function getPort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function stopServer(child) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const force = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.once('close', () => {
      clearTimeout(force);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

try {
  await rm(`${cwd}.next`, { recursive: true, force: true });
  await run(nextBin, ['build'], 210000);

  const port = await getPort();
  server = spawn(nextBin, ['start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLogs = '';
  const collectServerLog = (chunk) => { serverLogs += chunk.toString(); };
  server.stdout.on('data', collectServerLog);
  server.stderr.on('data', collectServerLog);

  const deadline = Date.now() + 30000;
  let response;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`next start exited early with ${server.exitCode}\n${serverLogs}`);
    try {
      response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!response?.ok) throw new Error(`App did not become ready\n${serverLogs}`);

  const html = await response.text();
  const anchor = html.match(/<a\b[^>]*href=["']\/walk-in-dining["'][^>]*>([\s\S]*?)<\/a>/i);
  if (!anchor) {
    finalCode = 1;
    console.log('Symptom absent: no rendered card anchor was found.');
  } else {
    const includesTitle = /Walk-in Dining/.test(anchor[1]);
    const includesImageWithDuplicatedAlt = /<img\b[^>]*alt=["']Walk-in Dining["'][^>]*>/i.test(anchor[1]);
    if (includesTitle && includesImageWithDuplicatedAlt) {
      finalCode = 0;
      console.log('Symptom present: the rendered card anchor contains both the title text and image markup whose alt repeats that title.');
    } else {
      finalCode = 1;
      console.log('Symptom absent: the rendered card anchor does not contain both title text and the duplicated-alt image markup.');
    }
  }
} catch (error) {
  finalCode = 2;
  console.error(`Verification failed: ${error.stack || error}`);
} finally {
  process.exitCode = finalCode;
  await stopServer(server);
}
