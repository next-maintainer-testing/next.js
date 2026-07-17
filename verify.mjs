import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";

const port = 3600 + Math.floor(Math.random() * 500);
const origin = `http://127.0.0.1:${port}`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let server;
let output = "";
let outcome = 2;

function capture(stream) {
  stream?.on("data", (chunk) => {
    output += chunk.toString();
    if (output.length > 30_000) output = output.slice(-30_000);
  });
}

async function runBuild() {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  capture(child.stdout);
  capture(child.stderr);
  const code = await new Promise((resolve) => child.once("close", resolve));
  if (code !== 0) throw new Error(`next build exited ${code}:\n${output}`);
}

async function readCache() {
  const response = await fetch(`${origin}/api/nested-cache`, { cache: "no-store" });
  if (!response.ok) throw new Error(`cache route returned HTTP ${response.status}`);
  const value = await response.json();
  if (!value?.createdAt || !value?.inner?.createdAt) {
    throw new Error(`cache route returned an invalid payload: ${JSON.stringify(value)}`);
  }
  return value;
}

async function waitUntilReady() {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await readCache();
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw new Error(`Next.js server did not become ready: ${lastError?.message ?? "unknown error"}`);
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  const closed = new Promise((resolve) => server.once("close", resolve));
  await Promise.race([closed, delay(10_000)]);
  if (server.exitCode === null) {
    server.kill("SIGKILL");
    await new Promise((resolve) => server.once("close", resolve));
  }
}

try {
  await rm(".next", { recursive: true, force: true });
  await runBuild();
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  capture(server.stdout);
  capture(server.stderr);

  const initial = await waitUntilReady();
  await delay(3_000);
  await readCache();
  await delay(1_000);
  const afterOuterExpiry = await readCache();

  const outerExpired = afterOuterExpiry.createdAt !== initial.createdAt;
  const innerInvalidated = afterOuterExpiry.inner.createdAt !== initial.inner.createdAt;
  console.log(JSON.stringify({ initial, afterOuterExpiry, outerExpired, innerInvalidated }));

  if (!outerExpired) throw new Error(`The two-second outer cache did not expire:\n${output}`);
  outcome = innerInvalidated ? 0 : 1;
} catch (error) {
  console.error(error?.stack ?? error);
  console.error(output);
  outcome = 2;
} finally {
  process.exitCode = outcome;
  await stopServer();
}
