import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

process.exitCode = 2;

const cwd = path.dirname(new URL(import.meta.url).pathname);
const nextBin = path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next');
const activeChildren = new Set();
const ansi = /\u001b\[[0-?]*[ -/]*[@-~]/g;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = address.port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function addOutput(child, lines) {
  let pending = '';
  const consume = (chunk) => {
    pending += chunk.toString();
    const parts = pending.split(/\r?\n/);
    pending = parts.pop() ?? '';
    for (const part of parts) lines.push(part.replace(ansi, ''));
  };
  child.stdout.on('data', consume);
  child.stderr.on('data', consume);
  child.once('close', () => {
    if (pending) lines.push(pending.replace(ansi, ''));
  });
}

async function waitFor(predicate, child, timeoutMs, description) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    if (child.exitCode !== null) {
      throw new Error(`${description}: process exited early with code ${child.exitCode}`);
    }
    await delay(100);
  }
  throw new Error(`${description}: timed out`);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') child.kill('SIGTERM');
    else process.kill(-child.pid, 'SIGTERM');
  } catch {}
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        if (process.platform === 'win32') child.kill('SIGKILL');
        else process.kill(-child.pid, 'SIGKILL');
      } catch {}
      resolve();
    }, 5000);
    child.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function runCommand(args, timeoutMs) {
  const lines = [];
  const child = spawn(process.execPath, [nextBin, ...args], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeChildren.add(child);
  addOutput(child, lines);
  let timer;
  try {
    const result = await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`next ${args[0]} timed out`)), timeoutMs);
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    if (result.code !== 0) {
      throw new Error(`next ${args[0]} failed with code ${result.code}:\n${lines.join('\n')}`);
    }
  } finally {
    clearTimeout(timer);
    activeChildren.delete(child);
    await stopChild(child);
  }
}

function markerSequence(lines) {
  const markers = [];
  for (const line of lines) {
    if (line.includes('page render')) markers.push('page');
    else if (line.includes('button render')) markers.push('button');
    else if (line.includes('layout render')) markers.push('layout');
  }
  return markers;
}

async function observe(mode) {
  const port = await freePort();
  const lines = [];
  const args = [mode, '-H', '127.0.0.1', '-p', String(port)];
  const child = spawn(process.execPath, [nextBin, ...args], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  activeChildren.add(child);
  addOutput(child, lines);
  try {
    await waitFor(() => lines.some((line) => /\bReady in\b/i.test(line)), child, 60000, `${mode} readiness`);
    lines.length = 0;
    const response = await fetch(`http://127.0.0.1:${port}/`);
    await response.text();
    if (!response.ok) throw new Error(`${mode} request returned HTTP ${response.status}`);
    await waitFor(() => markerSequence(lines).length >= 3, child, 60000, `${mode} render markers`);
    await delay(500);
    const sequence = markerSequence(lines).slice(0, 3);
    if (sequence.length !== 3 || new Set(sequence).size !== 3) {
      throw new Error(`${mode} produced an ambiguous marker sequence: ${JSON.stringify(markerSequence(lines))}`);
    }
    return sequence;
  } finally {
    await stopChild(child);
    activeChildren.delete(child);
  }
}

try {
  rmSync(path.join(cwd, '.next'), { recursive: true, force: true });
  const development = await observe('dev');

  rmSync(path.join(cwd, '.next'), { recursive: true, force: true });
  await runCommand(['build'], 180000);
  const production = await observe('start');

  const reportedDevelopment = ['page', 'button', 'layout'];
  const reportedProduction = ['page', 'layout', 'button'];
  const reproduced = JSON.stringify(development) === JSON.stringify(reportedDevelopment)
    && JSON.stringify(production) === JSON.stringify(reportedProduction);

  console.log(JSON.stringify({ development, production, reproduced }));
  process.exitCode = reproduced ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 2;
} finally {
  for (const child of activeChildren) await stopChild(child);
}
