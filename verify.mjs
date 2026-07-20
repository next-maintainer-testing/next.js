import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const port = 35000 + (process.pid % 1000);
let output = "";
let child;

function append(chunk) {
  output += chunk.toString();
  if (output.length > 2_000_000) output = output.slice(-2_000_000);
}

async function waitForReady(timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (/\bReady in\b|✓ Ready/.test(output)) return;
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`);
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for the Next.js development server");
}

async function cleanup() {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  const exited = new Promise((resolve) => child.once("exit", resolve));
  await Promise.race([exited, delay(5000)]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

async function finish(code, message) {
  process.exitCode = code;
  console.log(message);
  await cleanup();
}

try {
  child = spawn(process.execPath, [nextBin, "dev", "--turbopack", "-p", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", append);
  child.stderr.on("data", append);

  await waitForReady(60_000);
  const response = await fetch(`http://127.0.0.1:${port}/`, {
    signal: AbortSignal.timeout(40_000),
    headers: { accept: "text/html" },
  });
  await response.arrayBuffer();
  await delay(1500);

  const sawExpectedFailure =
    response.status === 500 &&
    output.includes("Intentional error in AsyncComponent") &&
    /at ThrowingComponent\b/.test(output);
  if (!sawExpectedFailure) {
    await finish(2, `CHECK_FAILED status=${response.status}\n${output.slice(-8000)}`);
  } else {
    const hasAsyncOwnerFrame = /at AsyncComponent\b/.test(output);
    const hasPageOwnerFrame = /at Home\b/.test(output);
    const bugPresent = !hasAsyncOwnerFrame && !hasPageOwnerFrame;
    await finish(
      bugPresent ? 0 : 1,
      `${bugPresent ? "BUG_PRESENT" : "BUG_ABSENT"}: caller component frames ` +
        `AsyncComponent=${hasAsyncOwnerFrame}, Home=${hasPageOwnerFrame}\n` +
        output.slice(-8000),
    );
  }
} catch (error) {
  await finish(2, `CHECK_FAILED ${error?.stack || error}\n${output.slice(-8000)}`);
}
