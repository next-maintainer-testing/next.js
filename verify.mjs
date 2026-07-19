import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = 32000 + Math.floor(Math.random() * 10000);
const baseUrl = `http://127.0.0.1:${port}`;
let output = "";
let child;
let exitPromise;

function record(chunk) {
  output += chunk.toString();
  if (output.length > 20000) output = output.slice(-20000);
}

async function fetchWithTimeout(path, timeout = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(`${baseUrl}${path}`, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function waitForServer() {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`);
    }
    try {
      const response = await fetchWithTimeout("/", 5000);
      await response.arrayBuffer();
      return;
    } catch {
      await delay(500);
    }
  }
  throw new Error("Timed out waiting for Next.js development server");
}

async function cleanup() {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  const stopped = await Promise.race([
    exitPromise.then(() => true),
    delay(5000).then(() => false),
  ]);
  if (!stopped && child.exitCode === null) {
    child.kill("SIGKILL");
    await exitPromise;
  }
}

try {
  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  exitPromise = new Promise((resolve, reject) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
    child.once("error", reject);
  });
  child.stdout.on("data", record);
  child.stderr.on("data", record);

  await waitForServer();
  const response = await fetchWithTimeout("/api/hello");
  const body = await response.text();
  const isReported404 = response.status === 404 && /(?:NEXT_NOT_FOUND|This page could not be found|__next_error__)/.test(body);

  console.log(JSON.stringify({ status: response.status, reported404: isReported404, bodyPreview: body.slice(0, 300) }));
  process.exitCode = isReported404 ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  if (output) console.error("Next.js output:\n" + output);
  process.exitCode = 2;
} finally {
  await cleanup();
}
